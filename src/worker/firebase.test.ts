import { describe, expect, test } from 'vitest';
import { signJwt } from './firebase';

const pem = (der: ArrayBuffer) =>
  `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(der))).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

describe('サービスアカウントの JWT', () => {
  test('鍵（PEM）で RS256 署名し、Google のトークン交換に必要な項目を入れる', async () => {
    const kp = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify'],
    )) as CryptoKeyPair;
    const sa = { client_email: 'journal@french90days.iam.gserviceaccount.com', private_key: pem(await crypto.subtle.exportKey('pkcs8', kp.privateKey) as ArrayBuffer) };
    const jwt = await signJwt(sa, 'scope-a scope-b', 1_800_000_000);
    const [h, b, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(new TextDecoder().decode(fromB64url(b)))).toEqual({
      iss: sa.client_email, scope: 'scope-a scope-b', aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_600,
    });
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${b}`))).toBe(true);
  });
});
