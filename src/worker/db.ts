import { HttpError } from './env';

export function uid(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export async function one<T = any>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...params).first<T>()) ?? null;
}

export async function all<T = any>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const r = await db.prepare(sql).bind(...params).all<T>();
  return r.results ?? [];
}

export async function run(db: D1Database, sql: string, ...params: unknown[]) {
  return db.prepare(sql).bind(...params).run();
}

/** 許可された列だけを UPDATE する */
export async function patch(
  db: D1Database,
  table: string,
  id: string,
  body: Record<string, unknown>,
  allowed: string[],
  extra: Record<string, unknown> = {},
) {
  const fields = { ...Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k))), ...extra };
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  await run(db, sql, ...keys.map((k) => fields[k] ?? null), id);
}

export async function ownTerm(db: D1Database, userId: string, termId: string) {
  const t = await one(db, 'SELECT * FROM terms WHERE id = ? AND user_id = ?', termId, userId);
  if (!t) throw new HttpError(404, 'タームが見つかりません');
  return t;
}

export async function ownGoal(db: D1Database, userId: string, goalId: string) {
  const g = await one(
    db,
    'SELECT g.* FROM goals g JOIN terms t ON t.id = g.term_id WHERE g.id = ? AND t.user_id = ?',
    goalId,
    userId,
  );
  if (!g) throw new HttpError(404, '目標が見つかりません');
  return g;
}

export async function ownTask(db: D1Database, userId: string, taskId: string) {
  const t = await one(db, 'SELECT * FROM tasks WHERE id = ? AND user_id = ?', taskId, userId);
  if (!t) throw new HttpError(404, 'タスクが見つかりません');
  return t;
}
