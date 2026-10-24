import { Hono } from 'hono';
import { isDate, todayJST } from '../../shared/dates';
import { termInfo } from '../../shared/progress';
import { parseEvent, ruleDone } from '../../shared/lockin';
import { all, one, run } from '../db';
import { HttpError, type AppEnv } from '../env';

export const feedRoutes = new Hono<AppEnv>();

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** base64 で 1.4MB まで（D1 の1行の上限 2MB に余裕を持たせる） */
const MAX_PHOTO_B64 = 1_400_000;

function goods(json: string | null): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [];
  } catch {
    return [];
  }
}

/** 何か書いた・やった・写真を撮った日を、新しい順に */
async function activeDates(db: D1Database, userId: string, before: string, limit: number) {
  const rows = await all(
    db,
    `SELECT date FROM (
       SELECT date FROM daily_entries WHERE user_id = ?1 AND date < ?2
         AND (memo != '' OR focus != '' OR goods_json != '["","",""]' OR completed = 1 OR progress_metric != '' OR favorite = 1)
       UNION SELECT date FROM tasks WHERE user_id = ?1 AND date < ?2 AND status = 'done'
       UNION SELECT date FROM day_photos WHERE user_id = ?1 AND date < ?2
     ) GROUP BY date ORDER BY date DESC LIMIT ?3`,
    userId, before, limit,
  );
  return rows.map((r) => r.date as string);
}

async function dayCard(db: D1Database, userId: string, date: string) {
  const [entry, tasks, photo, term] = await Promise.all([
    one(db, 'SELECT * FROM daily_entries WHERE user_id = ? AND date = ?', userId, date),
    all(db, `SELECT title, status, kind FROM tasks WHERE user_id = ? AND date = ? AND status IN ('done', 'missed') ORDER BY kind, position`, userId, date),
    one(db, 'SELECT width, height, updated_at FROM day_photos WHERE user_id = ? AND date = ?', userId, date),
    one(db, 'SELECT * FROM terms WHERE user_id = ? AND start_date <= ? AND end_date >= ?', userId, date, date),
  ]);
  let habits: { done: number; total: number } | null = null;
  let lockin: { kept: number; total: number } | null = null;
  if (term) {
    const hs = await all(db, `SELECT g.id, (SELECT done FROM habit_logs l WHERE l.goal_id = g.id AND l.date = ?) AS done FROM goals g WHERE g.term_id = ? AND g.type = 'habit'`, date, term.id);
    if (hs.length) habits = { done: hs.filter((h) => h.done).length, total: hs.length };
    if (term.lockin) {
      const rs = await all(db, 'SELECT r.unit, r.target_value, l.value, l.done FROM lockin_rules r LEFT JOIN lockin_logs l ON l.rule_id = r.id AND l.date = ? WHERE r.term_id = ?', date, term.id);
      if (rs.length) lockin = { kept: rs.filter((r) => r.value != null && ruleDone(r, Number(r.value), !!r.done)).length, total: rs.length };
    }
  }
  const info = term ? termInfo(term, date) : null;
  return {
    date,
    dayNumber: info?.dayNumber ?? null,
    termTitle: term?.title ?? null,
    focus: entry?.focus ?? '',
    memo: entry?.memo ?? '',
    goods: goods(entry?.goods_json),
    completed: !!entry?.completed,
    favorite: !!entry?.favorite,
    progress: entry?.progress_metric ?? '',
    event: entry?.event_day ? parseEvent(entry.event_json) : null,
    done: tasks.filter((t) => t.status === 'done').map((t) => t.title),
    missed: tasks.filter((t) => t.status === 'missed' && t.kind === 'must').length,
    habits,
    lockin,
    photo: photo ? { width: photo.width, height: photo.height, v: photo.updated_at } : null,
  };
}

/** フィード：日ごとの「投稿」を新しい順に */
feedRoutes.get('/feed', async (c) => {
  const u = c.get('user');
  const q = c.req.query('before');
  const before = isDate(q) ? q : '9999-12-31';
  const limit = Math.max(1, Math.min(20, Number(c.req.query('limit')) || 8));
  const dates = await activeDates(c.env.DB, u.id, before, limit + 1);
  const page = dates.slice(0, limit);
  const items = [];
  for (const d of page) items.push(await dayCard(c.env.DB, u.id, d));
  return c.json({ items, next: dates.length > limit ? page[page.length - 1] : null });
});

/** プロフィール：数字と、写真の一覧 */
feedRoutes.get('/profile', async (c) => {
  const u = c.get('user');
  const [days, photos, favs, vision, term] = await Promise.all([
    one(c.env.DB, `SELECT COUNT(*) AS n FROM daily_entries WHERE user_id = ? AND completed = 1`, u.id),
    all(c.env.DB, 'SELECT date, width, height, updated_at FROM day_photos WHERE user_id = ? ORDER BY date DESC LIMIT 300', u.id),
    one(c.env.DB, 'SELECT COUNT(*) AS n FROM daily_entries WHERE user_id = ? AND favorite = 1', u.id),
    one(c.env.DB, 'SELECT life_vision FROM user_settings WHERE user_id = ?', u.id),
    one(c.env.DB, 'SELECT * FROM terms WHERE user_id = ? AND start_date <= ? AND end_date >= ?', u.id, todayJST(), todayJST()),
  ]);
  return c.json({
    user: { name: u.name, email: u.email, picture: u.picture_url },
    vision: vision?.life_vision ?? '',
    term: term ? { id: term.id, title: term.title, info: termInfo(term, todayJST()) } : null,
    stats: { days: days?.n ?? 0, photos: photos.length, favorites: favs?.n ?? 0 },
    photos: photos.map((p) => ({ date: p.date, width: p.width, height: p.height, v: p.updated_at })),
  });
});

// ---- 今日の1枚 ----
function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

feedRoutes.get('/photos/:date', async (c) => {
  const p = await one(c.env.DB, 'SELECT mime, data FROM day_photos WHERE user_id = ? AND date = ?', c.get('user').id, c.req.param('date'));
  if (!p) throw new HttpError(404, '写真がありません');
  return new Response(b64ToBytes(p.data), {
    headers: { 'content-type': p.mime, 'cache-control': 'private, max-age=31536000, immutable' },
  });
});

feedRoutes.put('/photos/:date', async (c) => {
  const u = c.get('user');
  const date = c.req.param('date');
  if (!isDate(date)) throw new HttpError(400, '日付が正しくありません');
  const b = await c.req.json();
  if (!PHOTO_TYPES.includes(b.mime)) throw new HttpError(400, 'JPEG・PNG・WebP の写真を選んでください');
  if (typeof b.data !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(b.data)) throw new HttpError(400, '写真を読み込めませんでした');
  if (b.data.length > MAX_PHOTO_B64) throw new HttpError(400, '写真が大きすぎます');
  const dim = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(1, Math.min(10000, Math.round(Number(v)))) : null);
  await run(
    c.env.DB,
    `INSERT INTO day_photos (user_id, date, mime, data, width, height, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (user_id, date) DO UPDATE SET mime = excluded.mime, data = excluded.data, width = excluded.width, height = excluded.height, updated_at = excluded.updated_at`,
    u.id, date, b.mime, b.data, dim(b.width), dim(b.height),
  );
  const p = await one(c.env.DB, 'SELECT width, height, updated_at FROM day_photos WHERE user_id = ? AND date = ?', u.id, date);
  return c.json({ width: p.width, height: p.height, v: p.updated_at });
});

feedRoutes.delete('/photos/:date', async (c) => {
  await run(c.env.DB, 'DELETE FROM day_photos WHERE user_id = ? AND date = ?', c.get('user').id, c.req.param('date'));
  return c.json({ ok: true });
});

/** デイリーページで使う、その日の写真の情報 */
export async function photoInfo(db: D1Database, userId: string, date: string) {
  const p = await one(db, 'SELECT width, height, updated_at FROM day_photos WHERE user_id = ? AND date = ?', userId, date);
  return p ? { width: p.width, height: p.height, v: p.updated_at } : null;
}
