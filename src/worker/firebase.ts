// 語学アプリの記録（Firebase プロジェクト french90days の Firestore）を読む。
// サービスアカウントの鍵（秘密情報 FIREBASE_SERVICE_ACCOUNT に JSON をそのまま入れる）で
// Google の OAuth トークンを取り、メールアドレスから Firebase のユーザーを探して、
// {コレクション}/{ユーザーID} の記録を読む。語学アプリ側の変更は不要。
import type { Env } from './env';

const AUTH_API = 'https://identitytoolkit.googleapis.com';
const FIRESTORE_API = 'https://firestore.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit';

interface ServiceAccount { client_email: string; private_key: string; project_id?: string }

/** テスト（Firebase エミュレーター）では接続先を差し替え、トークンは 'owner' を使う */
const emulated = (env: Env) => !!env.FIRESTORE_API_BASE;

export function firebaseEnabled(env: Env): boolean {
  return !!projectId(env) && (!!env.FIREBASE_SERVICE_ACCOUNT || emulated(env));
}

function serviceAccount(env: Env): ServiceAccount {
  try {
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '');
    if (sa.client_email && sa.private_key) return sa;
  } catch {}
  throw new Error('FIREBASE_SERVICE_ACCOUNT が正しくありません（サービスアカウントの鍵の JSON をそのまま入れてください）');
}

function projectId(env: Env): string {
  return env.FIREBASE_PROJECT_ID || '';
}

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** サービスアカウントの JWT（RS256）。テストのため export */
export async function signJwt(sa: ServiceAccount, scope: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

let cached: { token: string; exp: number } | null = null;
async function accessToken(env: Env): Promise<string> {
  if (emulated(env)) return 'owner';
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const jwt = await signJwt(serviceAccount(env), SCOPE);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!r.ok) throw new Error(`Firebase の認証に失敗しました（${r.status}）`);
  const j: any = await r.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** メールアドレス → Firebase のユーザーID（その語学アプリに一度もログインしていなければ null） */
export async function firebaseUidByEmail(env: Env, email: string): Promise<string | null> {
  const base = env.FIREBASE_AUTH_API_BASE || AUTH_API;
  const r = await fetch(`${base}/v1/projects/${projectId(env)}/accounts:lookup`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken(env)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email: [email] }),
  });
  if (!r.ok) throw new Error(`Firebase のユーザー検索に失敗しました（${r.status}）`);
  const j: any = await r.json();
  return j.users?.[0]?.localId ?? null;
}

/** 語学アプリの記録（JSON）。まだ保存されていなければ null */
export async function readProgress(env: Env, collection: string, uid: string): Promise<any | null> {
  const base = env.FIRESTORE_API_BASE || FIRESTORE_API;
  const r = await fetch(`${base}/v1/projects/${projectId(env)}/databases/(default)/documents/${collection}/${encodeURIComponent(uid)}`, {
    headers: { authorization: `Bearer ${await accessToken(env)}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`語学アプリの記録を読めませんでした（${r.status}）`);
  const j: any = await r.json();
  const st = j.fields?.st?.stringValue;
  return st ? JSON.parse(st) : null;
}
