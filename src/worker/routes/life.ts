import { Hono } from 'hono';
import { all, one, run, uid } from '../db';
import { HttpError, type AppEnv } from '../env';

export const lifeRoutes = new Hono<AppEnv>();

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function lifeSummary(db: D1Database, userId: string) {
  await run(db, 'INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)', userId);
  const s = await one(db, 'SELECT life_vision FROM user_settings WHERE user_id = ?', userId);
  const goals = await all(db, 'SELECT * FROM life_goals WHERE user_id = ? ORDER BY achieved_at IS NOT NULL, sort_order, created_at', userId);
  return { vision: s?.life_vision ?? '', goals };
}

async function ownLifeGoal(db: D1Database, userId: string, id: string) {
  const g = await one(db, 'SELECT * FROM life_goals WHERE id = ? AND user_id = ?', id, userId);
  if (!g) throw new HttpError(404, '人生の目標が見つかりません');
  return g;
}

lifeRoutes.get('/life', async (c) => c.json(await lifeSummary(c.env.DB, c.get('user').id)));

lifeRoutes.put('/life', async (c) => {
  const u = c.get('user');
  const b = await c.req.json();
  await run(c.env.DB, 'INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)', u.id);
  if ('vision' in b) await run(c.env.DB, 'UPDATE user_settings SET life_vision = ? WHERE user_id = ?', str(b.vision, 1000), u.id);
  return c.json({ ok: true, savedAt: new Date().toISOString() });
});

lifeRoutes.post('/life/goals', async (c) => {
  const u = c.get('user');
  const b = await c.req.json();
  const title = str(b.title, 200);
  if (!title) throw new HttpError(400, '目標を入れてください');
  const max = await one(c.env.DB, 'SELECT COALESCE(MAX(sort_order), -1) AS m FROM life_goals WHERE user_id = ?', u.id);
  const id = uid();
  await run(c.env.DB, 'INSERT INTO life_goals (id, user_id, title, category, sort_order) VALUES (?, ?, ?, ?, ?)', id, u.id, title, str(b.category, 40), (max?.m ?? -1) + 1);
  return c.json(await one(c.env.DB, 'SELECT * FROM life_goals WHERE id = ?', id));
});

lifeRoutes.patch('/life/goals/:id', async (c) => {
  const g = await ownLifeGoal(c.env.DB, c.get('user').id, c.req.param('id'));
  const b = await c.req.json();
  const f: Record<string, unknown> = {};
  if ('title' in b) f.title = str(b.title, 200) || g.title;
  if ('note' in b) f.note = str(b.note, 2000);
  if ('category' in b) f.category = str(b.category, 40);
  if ('target_year' in b) f.target_year = Number.isInteger(Number(b.target_year)) && Number(b.target_year) > 1900 ? Number(b.target_year) : null;
  if ('achieved' in b) f.achieved_at = b.achieved ? new Date().toISOString().slice(0, 10) : null;
  const keys = Object.keys(f);
  if (keys.length) await run(c.env.DB, `UPDATE life_goals SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => f[k]), g.id);
  return c.json({ ok: true });
});

lifeRoutes.delete('/life/goals/:id', async (c) => {
  const g = await ownLifeGoal(c.env.DB, c.get('user').id, c.req.param('id'));
  await run(c.env.DB, 'DELETE FROM life_goals WHERE id = ?', g.id);
  return c.json({ ok: true });
});

lifeRoutes.post('/life/goals/:id/move', async (c) => {
  const u = c.get('user');
  const g = await ownLifeGoal(c.env.DB, u.id, c.req.param('id'));
  const { dir } = await c.req.json();
  const list = await all(c.env.DB, 'SELECT id FROM life_goals WHERE user_id = ? AND achieved_at IS NULL ORDER BY sort_order, created_at', u.id);
  const i = list.findIndex((x) => x.id === g.id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i >= 0 && j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  for (const [k, x] of list.entries()) await run(c.env.DB, 'UPDATE life_goals SET sort_order = ? WHERE id = ?', k, x.id);
  return c.json({ ok: true });
});
