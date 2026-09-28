import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { defaultTermFor, todayJST } from '../shared/dates';
import { encrypt, randomToken } from './crypto';
import { one, run, uid } from './db';
import { HttpError, type AppEnv, type Env, type User } from './env';

const SESSION_COOKIE = 'fj_session';
const STATE_COOKIE = 'fj_oauth_state';
const SESSION_DAYS = 60;

let knownOrigin: string | null = null;
/** アプリが開かれた URL を覚える（Notion に書くリンクと定期処理で使う） */
async function rememberOrigin(env: Env, origin: string) {
  if (knownOrigin === origin || isLocal(origin)) return;
  knownOrigin = origin;
  await run(env.DB, "INSERT INTO sync_state (key, value) VALUES ('app_origin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", origin);
}

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

function allowed(env: Env, email: string): boolean {
  return env.ALLOWED_EMAILS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

function isLocal(url: string): boolean {
  const h = new URL(url).hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/** 初回ログイン時: 設定と最初のタームを用意する */
async function ensureUser(env: Env, email: string, name: string | null, picture: string | null): Promise<User> {
  let user = await one<User>(env.DB, 'SELECT * FROM users WHERE email = ?', email);
  if (!user) {
    user = { id: uid(), email, name, picture_url: picture };
    await run(env.DB, 'INSERT INTO users (id, email, name, picture_url) VALUES (?, ?, ?, ?)', user.id, email, name, picture);
    await run(env.DB, 'INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)', user.id);
    const t = defaultTermFor(todayJST());
    await run(
      env.DB,
      'INSERT INTO terms (id, user_id, title, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
      uid(), user.id, t.title, t.start, t.end,
    );
  } else {
    await run(env.DB, 'UPDATE users SET name = ?, picture_url = ? WHERE id = ?', name, picture, user.id);
  }
  return user;
}

async function startSession(c: any, userId: string) {
  const id = randomToken();
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  await run(c.env.DB, 'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', id, userId, expires);
  await run(c.env.DB, 'DELETE FROM sessions WHERE expires_at < ?', Date.now());
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    secure: !isLocal(c.req.url),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/auth/google', (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.text('GOOGLE_CLIENT_ID が設定されていません', 500);
  const state = randomToken(16);
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: !isLocal(c.req.url), sameSite: 'Lax', path: '/auth', maxAge: 600 });
  const origin = new URL(c.req.url).origin;
  const q = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID.trim(),
    redirect_uri: `${origin}/auth/callback`,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
});

authRoutes.get('/auth/callback', async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const saved = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/auth' });
  if (url.searchParams.get('error')) return c.redirect('/login?error=denied');
  if (!code || !state || state !== saved) return c.redirect('/login?error=state');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: c.env.GOOGLE_CLIENT_SECRET!.trim(),
      redirect_uri: `${url.origin}/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) return c.redirect('/login?error=token');
  const tok = (await res.json()) as any;
  // id_token は Google のトークンエンドポイントから TLS で直接受け取ったものなので署名検証は省略する
  const bin = atob(tok.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
  const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))); // 日本語の名前も正しく読む
  if (!payload.email_verified || !allowed(c.env, payload.email)) return c.redirect('/login?error=forbidden');

  const user = await ensureUser(c.env, payload.email, payload.name ?? null, payload.picture ?? null);
  const enc = tok.refresh_token && c.env.TOKEN_ENC_KEY ? await encrypt(c.env.TOKEN_ENC_KEY, tok.refresh_token) : null;
  await run(
    c.env.DB,
    `INSERT INTO google_tokens (user_id, refresh_token_enc, access_token, access_expires_at, scope, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       refresh_token_enc = COALESCE(excluded.refresh_token_enc, google_tokens.refresh_token_enc),
       access_token = excluded.access_token, access_expires_at = excluded.access_expires_at,
       scope = excluded.scope, updated_at = excluded.updated_at`,
    user.id, enc, tok.access_token, Date.now() + (tok.expires_in ?? 3600) * 1000, tok.scope ?? '',
  );
  await startSession(c, user.id);
  return c.redirect('/');
});

// ローカル開発専用: Google を通さずにログインする
authRoutes.get('/auth/dev', async (c) => {
  if (c.env.DEV_LOGIN !== 'true' || !isLocal(c.req.url)) return c.notFound();
  const email = c.env.ALLOWED_EMAILS.split(',')[0].trim();
  const user = await ensureUser(c.env, email, '開発ユーザー', null);
  await startSession(c, user.id);
  return c.redirect('/');
});

authRoutes.post('/api/logout', async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await run(c.env.DB, 'DELETE FROM sessions WHERE id = ?', sid);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

/** /api/* のログイン必須チェックと、書き込み系の CSRF 対策（独自ヘッダ必須） */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method !== 'GET') {
    const sameOrigin = c.req.header('origin') === new URL(c.req.url).origin;
    if (c.req.header('x-fj') !== '1' && !sameOrigin) throw new HttpError(403, 'bad request');
  }
  const sid = getCookie(c, SESSION_COOKIE);
  const user = sid
    ? await one<User>(
        c.env.DB,
        'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?',
        sid,
        Date.now(),
      )
    : null;
  if (!user) throw new HttpError(401, 'ログインしてください');
  c.set('user', user);
  await rememberOrigin(c.env, new URL(c.req.url).origin);
  await next();
};
