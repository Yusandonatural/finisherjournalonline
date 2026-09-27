import { Hono } from 'hono';
import { isDate, termTitle, todayJST } from '../../shared/dates';
import { taskStats } from '../../shared/progress';
import { all, one, ownGoal, ownTask, ownTerm, patch, run, uid } from '../db';
import { HttpError, type AppEnv } from '../env';
import { byWeekday, fillRate, goalsWithProgress, groupByGoal, tasksInRange, termForDate, withInfo } from '../stats';
import { markMissed } from '../tasks';

export const termRoutes = new Hono<AppEnv>();

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function neighbors(db: D1Database, userId: string, term: any) {
  const nextTerm = await one(db, 'SELECT * FROM terms WHERE user_id = ? AND start_date > ? ORDER BY start_date LIMIT 1', userId, term.end_date);
  const prevTerm = await one(db, 'SELECT * FROM terms WHERE user_id = ? AND end_date < ? ORDER BY end_date DESC LIMIT 1', userId, term.start_date);
  return { ...withInfo(term), nextTerm, prevTerm };
}

termRoutes.get('/terms', async (c) => {
  const u = c.get('user');
  const terms = await all(c.env.DB, 'SELECT * FROM terms WHERE user_id = ? ORDER BY start_date DESC', u.id);
  const out = [];
  for (const t of terms) {
    const tasks = await tasksInRange(c.env.DB, u.id, t.start_date, t.end_date);
    const goals = await one(c.env.DB, 'SELECT COUNT(*) AS n FROM goals WHERE term_id = ?', t.id);
    out.push({ ...withInfo(t), taskStats: taskStats(tasks), goalCount: goals?.n ?? 0 });
  }
  return c.json(out);
});

termRoutes.get('/terms/current', async (c) => {
  const date = c.req.query('date') ?? todayJST();
  return c.json(withInfo(await termForDate(c.env.DB, c.get('user').id, date)));
});

termRoutes.post('/terms', async (c) => {
  const u = c.get('user');
  const b = await c.req.json();
  if (!isDate(b.start_date) || !isDate(b.end_date) || b.start_date > b.end_date) throw new HttpError(400, '日付が正しくありません');
  const overlap = await one(
    c.env.DB,
    'SELECT title FROM terms WHERE user_id = ? AND start_date <= ? AND end_date >= ?',
    u.id, b.end_date, b.start_date,
  );
  if (overlap) throw new HttpError(400, `「${overlap.title}」と期間が重なっています`);
  const id = uid();
  await run(
    c.env.DB,
    'INSERT INTO terms (id, user_id, title, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
    id, u.id, str(b.title, 100) || termTitle(b.start_date, b.end_date), b.start_date, b.end_date,
  );
  // 前タームの目標を引き継ぐ（プロジェクトは未完了のマイルストーンだけ）
  let order = 0;
  for (const gid of Array.isArray(b.copy_goal_ids) ? b.copy_goal_ids : []) {
    const g = await ownGoal(c.env.DB, u.id, gid);
    const nid = uid();
    await run(
      c.env.DB,
      `INSERT INTO goals (id, term_id, type, title, why, sort_order, manual_progress, habit_frequency, habit_times_per_week, habit_weekdays_json,
         metric_unit, metric_start, metric_current, metric_target, obstacle, obstacle_plan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      nid, id, g.type, g.title, g.why, order++, g.manual_progress, g.habit_frequency, g.habit_times_per_week, g.habit_weekdays_json,
      g.metric_unit, g.metric_current ?? g.metric_start, g.metric_current ?? g.metric_start, g.metric_target, g.obstacle, g.obstacle_plan,
    );
    const ms = await all(c.env.DB, 'SELECT * FROM milestones WHERE goal_id = ? AND done = 0 ORDER BY sort_order', g.id);
    for (const [i, m] of ms.entries()) {
      await run(c.env.DB, 'INSERT INTO milestones (id, goal_id, title, sort_order) VALUES (?, ?, ?, ?)', uid(), nid, m.title, i);
    }
  }
  return c.json(withInfo(await one(c.env.DB, 'SELECT * FROM terms WHERE id = ?', id)));
});

termRoutes.get('/terms/:id', async (c) => {
  const u = c.get('user');
  await markMissed(c.env, u.id);
  const term = await ownTerm(c.env.DB, u.id, c.req.param('id'));
  const tasks = await tasksInRange(c.env.DB, u.id, term.start_date, term.end_date);
  return c.json({
    ...(await neighbors(c.env.DB, u.id, term)),
    goals: await goalsWithProgress(c.env.DB, term),
    taskStats: taskStats(tasks),
    fill: await fillRate(c.env.DB, u.id, term.start_date, term.end_date),
  });
});

termRoutes.patch('/terms/:id', async (c) => {
  const u = c.get('user');
  const term = await ownTerm(c.env.DB, u.id, c.req.param('id'));
  const b = await c.req.json();
  const start = b.start_date ?? term.start_date;
  const end = b.end_date ?? term.end_date;
  if (!isDate(start) || !isDate(end) || start > end) throw new HttpError(400, '日付が正しくありません');
  await patch(c.env.DB, 'terms', term.id, { title: str(b.title, 100) || term.title, start_date: start, end_date: end }, ['title', 'start_date', 'end_date']);
  return c.json({ ok: true });
});

termRoutes.delete('/terms/:id', async (c) => {
  const term = await ownTerm(c.env.DB, c.get('user').id, c.req.param('id'));
  await run(c.env.DB, 'DELETE FROM terms WHERE id = ?', term.id);
  return c.json({ ok: true });
});

// ---- 目標 ----
function goalFields(b: any) {
  const f: Record<string, unknown> = {};
  if ('title' in b) f.title = str(b.title, 200);
  if ('why' in b) f.why = str(b.why, 500);
  if ('due_date' in b) f.due_date = isDate(b.due_date) ? b.due_date : null;
  if ('manual_progress' in b) f.manual_progress = b.manual_progress == null ? null : Math.max(0, Math.min(100, Math.round(Number(b.manual_progress) || 0)));
  if ('status' in b && ['active', 'achieved', 'missed', 'cancelled'].includes(b.status)) f.status = b.status;
  if ('habit_frequency' in b && ['daily', 'weekly', 'weekdays'].includes(b.habit_frequency)) f.habit_frequency = b.habit_frequency;
  if ('habit_times_per_week' in b) f.habit_times_per_week = Math.max(1, Math.min(7, Number(b.habit_times_per_week) || 1));
  const num = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  if ('metric_unit' in b) f.metric_unit = str(b.metric_unit, 20);
  for (const k of ['metric_start', 'metric_current', 'metric_target']) if (k in b) f[k] = num(b[k]);
  if ('obstacle' in b) f.obstacle = str(b.obstacle, 1000);
  if ('obstacle_plan' in b) f.obstacle_plan = str(b.obstacle_plan, 1000);
  if ('habit_weekdays' in b && Array.isArray(b.habit_weekdays)) f.habit_weekdays_json = JSON.stringify(b.habit_weekdays.filter((n: any) => Number.isInteger(n) && n >= 0 && n <= 6));
  return f;
}

termRoutes.post('/terms/:id/goals', async (c) => {
  const term = await ownTerm(c.env.DB, c.get('user').id, c.req.param('id'));
  const b = await c.req.json();
  if (!['project', 'habit'].includes(b.type)) throw new HttpError(400, '種類が正しくありません');
  const f = goalFields(b);
  if (!f.title) throw new HttpError(400, 'タイトルを入れてください');
  const max = await one(c.env.DB, 'SELECT COALESCE(MAX(sort_order), -1) AS m FROM goals WHERE term_id = ?', term.id);
  const id = uid();
  await run(c.env.DB, 'INSERT INTO goals (id, term_id, type, title, sort_order, habit_frequency) VALUES (?, ?, ?, ?, ?, ?)',
    id, term.id, b.type, f.title, (max?.m ?? -1) + 1, b.type === 'habit' ? 'daily' : null);
  await patch(c.env.DB, 'goals', id, f, Object.keys(f));
  return c.json(await one(c.env.DB, 'SELECT * FROM goals WHERE id = ?', id));
});

termRoutes.patch('/goals/:id', async (c) => {
  const g = await ownGoal(c.env.DB, c.get('user').id, c.req.param('id'));
  const f = goalFields(await c.req.json());
  await patch(c.env.DB, 'goals', g.id, f, Object.keys(f));
  if ('title' in f) await run(c.env.DB, 'UPDATE tasks SET notion_dirty = 1 WHERE goal_id = ?', g.id);
  return c.json({ ok: true });
});

termRoutes.delete('/goals/:id', async (c) => {
  const g = await ownGoal(c.env.DB, c.get('user').id, c.req.param('id'));
  await run(c.env.DB, 'DELETE FROM goals WHERE id = ?', g.id);
  return c.json({ ok: true });
});

termRoutes.post('/goals/:id/move', async (c) => {
  const g = await ownGoal(c.env.DB, c.get('user').id, c.req.param('id'));
  const { dir } = await c.req.json();
  const list = await all(c.env.DB, 'SELECT id FROM goals WHERE term_id = ? AND type = ? ORDER BY sort_order, created_at', g.term_id, g.type);
  const i = list.findIndex((x) => x.id === g.id);
  const j = i + (dir < 0 ? -1 : 1);
  if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  for (const [k, x] of list.entries()) await run(c.env.DB, 'UPDATE goals SET sort_order = ? WHERE id = ?', k, x.id);
  return c.json({ ok: true });
});

termRoutes.post('/goals/:id/milestones', async (c) => {
  const g = await ownGoal(c.env.DB, c.get('user').id, c.req.param('id'));
  const title = str((await c.req.json()).title, 200);
  if (!title) throw new HttpError(400, 'マイルストーンを入れてください');
  const max = await one(c.env.DB, 'SELECT COALESCE(MAX(sort_order), -1) AS m FROM milestones WHERE goal_id = ?', g.id);
  const id = uid();
  await run(c.env.DB, 'INSERT INTO milestones (id, goal_id, title, sort_order) VALUES (?, ?, ?, ?)', id, g.id, title, (max?.m ?? -1) + 1);
  return c.json(await one(c.env.DB, 'SELECT * FROM milestones WHERE id = ?', id));
});

async function ownMilestone(db: D1Database, userId: string, id: string) {
  const m = await one(db, 'SELECT m.* FROM milestones m JOIN goals g ON g.id = m.goal_id JOIN terms t ON t.id = g.term_id WHERE m.id = ? AND t.user_id = ?', id, userId);
  if (!m) throw new HttpError(404, 'マイルストーンが見つかりません');
  return m;
}

termRoutes.patch('/milestones/:id', async (c) => {
  const m = await ownMilestone(c.env.DB, c.get('user').id, c.req.param('id'));
  const b = await c.req.json();
  const f: Record<string, unknown> = {};
  if ('title' in b) f.title = str(b.title, 200) || m.title;
  if ('done' in b) {
    f.done = b.done ? 1 : 0;
    f.done_at = b.done ? new Date().toISOString() : null;
  }
  await patch(c.env.DB, 'milestones', m.id, f, Object.keys(f));
  return c.json({ ok: true });
});

termRoutes.delete('/milestones/:id', async (c) => {
  const m = await ownMilestone(c.env.DB, c.get('user').id, c.req.param('id'));
  await run(c.env.DB, 'DELETE FROM milestones WHERE id = ?', m.id);
  return c.json({ ok: true });
});

termRoutes.put('/goals/:id/habit/:date', async (c) => {
  const g = await ownGoal(c.env.DB, c.get('user').id, c.req.param('id'));
  const date = c.req.param('date');
  if (!isDate(date)) throw new HttpError(400, '日付が正しくありません');
  const { done } = await c.req.json();
  if (done) await run(c.env.DB, 'INSERT OR REPLACE INTO habit_logs (goal_id, date, done) VALUES (?, ?, 1)', g.id, date);
  else await run(c.env.DB, 'DELETE FROM habit_logs WHERE goal_id = ? AND date = ?', g.id, date);
  return c.json({ ok: true });
});

// ---- タスク台帳・総括 ----
termRoutes.get('/terms/:id/tasks', async (c) => {
  const u = c.get('user');
  await markMissed(c.env, u.id);
  const term = await ownTerm(c.env.DB, u.id, c.req.param('id'));
  const tasks = await tasksInRange(c.env.DB, u.id, term.start_date, term.end_date);
  return c.json({
    term: await neighbors(c.env.DB, u.id, term),
    tasks,
    stats: taskStats(tasks),
    byGoal: groupByGoal(tasks).map(({ tasks: _t, ...g }) => g),
    goals: await all(c.env.DB, 'SELECT id, title, type FROM goals WHERE term_id = ? ORDER BY sort_order', term.id),
  });
});

termRoutes.get('/terms/:id/review', async (c) => {
  const u = c.get('user');
  await markMissed(c.env, u.id);
  const term = await ownTerm(c.env.DB, u.id, c.req.param('id'));
  const tasks = await tasksInRange(c.env.DB, u.id, term.start_date, term.end_date);
  const done = tasks.filter((t) => t.status === 'done');
  const missed = tasks
    .filter((t) => t.status === 'missed')
    .sort((a, b) => b.carry_count - a.carry_count || a.date.localeCompare(b.date));
  const withN = await neighbors(c.env.DB, u.id, term);
  return c.json({
    term: withN,
    stats: taskStats(tasks),
    doneByGoal: groupByGoal(done),
    missed,
    byGoal: groupByGoal(tasks).map(({ tasks: _t, ...g }) => g),
    byWeekday: byWeekday(tasks),
    fill: await fillRate(c.env.DB, u.id, term.start_date, term.end_date),
    goals: await goalsWithProgress(c.env.DB, term),
    nextTerm: withN.nextTerm,
  });
});

termRoutes.post('/terms/:id/carry-over', async (c) => {
  const u = c.get('user');
  await ownTerm(c.env.DB, u.id, c.req.param('id'));
  const { task_ids, on } = await c.req.json();
  for (const id of Array.isArray(task_ids) ? task_ids : []) {
    const t = await ownTask(c.env.DB, u.id, id);
    await run(c.env.DB, 'UPDATE tasks SET carry_over = ? WHERE id = ?', on ? 1 : 0, t.id);
  }
  return c.json({ ok: true });
});

/** 前のタームから「持ち越す」と印を付けたタスク */
termRoutes.get('/terms/:id/carried-in', async (c) => {
  const u = c.get('user');
  const term = await ownTerm(c.env.DB, u.id, c.req.param('id'));
  const prev = await one(c.env.DB, 'SELECT * FROM terms WHERE user_id = ? AND end_date < ? ORDER BY end_date DESC LIMIT 1', u.id, term.start_date);
  if (!prev) return c.json([]);
  return c.json(
    await all(
      c.env.DB,
      `SELECT t.*, g.title AS goal_title FROM tasks t LEFT JOIN goals g ON g.id = t.goal_id
       WHERE t.user_id = ? AND t.carry_over = 1 AND t.date BETWEEN ? AND ? ORDER BY t.date`,
      u.id, prev.start_date, prev.end_date,
    ),
  );
});

termRoutes.post('/tasks/:id/to-milestone', async (c) => {
  const u = c.get('user');
  const t = await ownTask(c.env.DB, u.id, c.req.param('id'));
  const g = await ownGoal(c.env.DB, u.id, (await c.req.json()).goal_id);
  const max = await one(c.env.DB, 'SELECT COALESCE(MAX(sort_order), -1) AS m FROM milestones WHERE goal_id = ?', g.id);
  await run(c.env.DB, 'INSERT INTO milestones (id, goal_id, title, sort_order) VALUES (?, ?, ?, ?)', uid(), g.id, t.title, (max?.m ?? -1) + 1);
  await run(c.env.DB, 'UPDATE tasks SET carry_over = 2 WHERE id = ?', t.id);
  return c.json({ ok: true });
});
