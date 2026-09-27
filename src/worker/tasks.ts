import { addDays, hourJST, todayJST } from '../shared/dates';
import { all, one, run, uid } from './db';
import type { Env } from './env';

/** その日の空き枠。1〜3 が空いていればそこ、埋まっていれば 4 以降（Notion からの別枠） */
export async function nextPosition(db: D1Database, userId: string, date: string, mainOnly = false): Promise<number | null> {
  const rows = await all<{ position: number }>(
    db,
    "SELECT position FROM tasks WHERE user_id = ? AND date = ? AND kind = 'must' AND status NOT IN ('carried', 'dropped')",
    userId,
    date,
  );
  const used = new Set(rows.map((r) => r.position));
  for (const p of [1, 2, 3]) if (!used.has(p)) return p;
  if (mainOnly) return null;
  return Math.max(3, ...rows.map((r) => r.position)) + 1;
}

/** 期限を過ぎた未着手タスクを「できなかった」にする */
/** 「時間があればやること」の次の並び順 */
export async function nextMightPosition(db: D1Database, userId: string, date: string): Promise<number> {
  const r = await one(db, "SELECT COALESCE(MAX(position), 0) AS m FROM tasks WHERE user_id = ? AND date = ? AND kind = 'might'", userId, date);
  return (r?.m ?? 0) + 1;
}

export async function markMissed(env: Env, userId?: string) {
  const users = userId
    ? [{ user_id: userId, missed_cutoff: (await one(env.DB, 'SELECT missed_cutoff FROM user_settings WHERE user_id = ?', userId))?.missed_cutoff }]
    : await all(env.DB, 'SELECT user_id, missed_cutoff FROM user_settings');
  const today = todayJST();
  for (const u of users) {
    // midnight: 日付が変わったら / noon: 翌日の正午を過ぎたら
    const boundary = u.missed_cutoff === 'noon' && hourJST() < 12 ? addDays(today, -1) : today;
    await run(
      env.DB,
      "UPDATE tasks SET status = 'missed', notion_dirty = 1, updated_at = datetime('now') WHERE user_id = ? AND kind = 'must' AND status = 'todo' AND date < ?",
      u.user_id,
      boundary,
    );
  }
}

export async function createTask(
  env: Env,
  userId: string,
  fields: { date: string; title: string; kind?: 'must' | 'might'; goal_id?: string | null; position?: number; source?: string; notion_page_id?: string | null; carried_from_id?: string | null; carry_count?: number; notion_snapshot?: string | null },
) {
  const id = uid();
  const kind = fields.kind ?? 'must';
  const position = fields.position ?? (kind === 'might' ? await nextMightPosition(env.DB, userId, fields.date) : (await nextPosition(env.DB, userId, fields.date))!);
  await run(
    env.DB,
    `INSERT INTO tasks (id, user_id, date, position, title, kind, goal_id, source, notion_page_id, carried_from_id, carry_count, notion_snapshot, notion_dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, userId, fields.date, position, fields.title, kind, fields.goal_id ?? null, fields.source ?? 'app',
    fields.notion_page_id ?? null, fields.carried_from_id ?? null, fields.carry_count ?? 0, fields.notion_snapshot ?? null,
    kind === 'might' ? 0 : 1,
  );
  return one(env.DB, 'SELECT * FROM tasks WHERE id = ?', id);
}
