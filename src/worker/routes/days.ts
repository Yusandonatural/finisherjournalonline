import { Hono } from 'hono';
import { addDays, addMonths, daysInRange, isDate, mondayOf, monthEnd, monthStart, todayJST, weekday } from '../../shared/dates';
import { habitScheduled, taskStats } from '../../shared/progress';
import { all, one, ownGoal, ownTask, run } from '../db';
import { HttpError, type AppEnv } from '../env';
import { archivePage, notionEnabled, pickFromNotion, pushDirty } from '../notion';
import { fillRate, goalsWithProgress, groupByGoal, tasksInRange, termForDate, withInfo } from '../stats';
import { createTask, markMissed, nextMightPosition, nextPosition } from '../tasks';

export const dayRoutes = new Hono<AppEnv>();

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

function parseGoods(json: string | null): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return [0, 1, 2].map((i) => (typeof v[i] === 'string' ? v[i] : ''));
  } catch {
    return ['', '', ''];
  }
}

function syncLater(c: any) {
  if (notionEnabled(c.env)) c.executionCtx.waitUntil(pushDirty(c.env).catch(() => {}));
}

// ---- デイリーページ ----
dayRoutes.get('/days/:date', async (c) => {
  const u = c.get('user');
  const date = c.req.param('date');
  if (!isDate(date)) throw new HttpError(400, '日付が正しくありません');
  await markMissed(c.env, u.id);
  const term = await termForDate(c.env.DB, u.id, date);
  const entry = await one(c.env.DB, 'SELECT * FROM daily_entries WHERE user_id = ? AND date = ?', u.id, date);
  const tasks = await tasksInRange(c.env.DB, u.id, date, date);
  const termTasks = term ? await tasksInRange(c.env.DB, u.id, term.start_date, term.end_date) : [];
  const inTerm = term && date >= term.start_date && date <= term.end_date;
  return c.json({
    date,
    today: todayJST(),
    term: term ? { ...withInfo(term, date), inTerm } : null,
    entry: {
      focus: entry?.focus ?? '',
      memo: entry?.memo ?? '',
      goods: parseGoods(entry?.goods_json),
      completed: !!entry?.completed,
    },
    tasks,
    might: await tasksInRange(c.env.DB, u.id, date, date, 'might'),
    goals: term ? await goalsWithProgress(c.env.DB, term, date) : [],
    termStats: taskStats(termTasks),
    notionEnabled: notionEnabled(c.env),
  });
});

dayRoutes.on(['PUT', 'POST'], '/days/:date', async (c) => {
  const u = c.get('user');
  const date = c.req.param('date');
  if (!isDate(date)) throw new HttpError(400, '日付が正しくありません');
  const b = await c.req.json();
  await run(c.env.DB, 'INSERT OR IGNORE INTO daily_entries (id, user_id, date) VALUES (?, ?, ?)', crypto.randomUUID(), u.id, date);
  const f: Record<string, unknown> = {};
  if ('focus' in b) f.focus = str(b.focus, 300);
  if ('memo' in b) f.memo = str(b.memo, 20000);
  if ('goods' in b && Array.isArray(b.goods)) f.goods_json = JSON.stringify([0, 1, 2].map((i) => str(b.goods[i], 300)));
  if ('completed' in b) f.completed = b.completed ? 1 : 0;
  const keys = Object.keys(f);
  if (keys.length) {
    await run(
      c.env.DB,
      `UPDATE daily_entries SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE user_id = ? AND date = ?`,
      ...keys.map((k) => f[k]), u.id, date,
    );
  }
  return c.json({ ok: true, savedAt: new Date().toISOString() });
});

// ---- タスク ----
dayRoutes.post('/days/:date/tasks', async (c) => {
  const u = c.get('user');
  const date = c.req.param('date');
  if (!isDate(date)) throw new HttpError(400, '日付が正しくありません');
  const b = await c.req.json();
  const title = str(b.title, 300).trim();
  if (!title) throw new HttpError(400, 'タスクを入れてください');
  if (b.goal_id) await ownGoal(c.env.DB, u.id, b.goal_id);
  if (b.kind === 'might') {
    const n = await one(c.env.DB, "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND date = ? AND kind = 'might'", u.id, date);
    if ((n?.n ?? 0) >= 10) throw new HttpError(400, '「時間があればやること」は10個までです');
    return c.json(await createTask(c.env, u.id, { date, title, kind: 'might', goal_id: b.goal_id ?? null }));
  }
  let position = await nextPosition(c.env.DB, u.id, date, true);
  if (position === null) throw new HttpError(400, 'やるべきことは1日3つまでです');
  if ([1, 2, 3].includes(b.position)) {
    const used = await one(c.env.DB, "SELECT id FROM tasks WHERE user_id = ? AND date = ? AND position = ? AND status NOT IN ('carried', 'dropped')", u.id, date, b.position);
    if (!used) position = b.position;
  }
  const task = await createTask(c.env, u.id, { date, title, goal_id: b.goal_id ?? null, position: position! });
  syncLater(c);
  return c.json(task);
});

dayRoutes.post('/days/:date/tasks/from-notion', async (c) => {
  const u = c.get('user');
  const date = c.req.param('date');
  if (!isDate(date)) throw new HttpError(400, '日付が正しくありません');
  if (!notionEnabled(c.env)) throw new HttpError(503, 'Notion が未接続です');
  const { page_id } = await c.req.json();
  return c.json(await pickFromNotion(c.env, u.id, String(page_id), date));
});

dayRoutes.patch('/tasks/:id', async (c) => {
  const u = c.get('user');
  const t = await ownTask(c.env.DB, u.id, c.req.param('id'));
  const b = await c.req.json();
  const f: Record<string, unknown> = {};
  if ('title' in b) f.title = str(b.title, 300).trim() || t.title;
  if ('goal_id' in b) {
    if (b.goal_id) await ownGoal(c.env.DB, u.id, b.goal_id);
    f.goal_id = b.goal_id || null;
  }
  if ('status' in b && ['todo', 'done', 'missed', 'dropped'].includes(b.status)) {
    f.status = b.status === 'todo' && t.date < todayJST() && t.kind === 'must' ? 'missed' : b.status;
    f.done_at = b.status === 'done' ? new Date().toISOString() : null;
  }
  if ('carry_over' in b) f.carry_over = b.carry_over ? 1 : 0;
  const keys = Object.keys(f);
  if (keys.length) {
    const dirty = t.kind === 'must' && keys.some((k) => ['title', 'goal_id', 'status'].includes(k)) ? 1 : t.notion_dirty;
    await run(
      c.env.DB,
      `UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(', ')}, notion_dirty = ?, updated_at = datetime('now') WHERE id = ?`,
      ...keys.map((k) => f[k]), dirty, t.id,
    );
  }
  syncLater(c);
  return c.json(await one(c.env.DB, 'SELECT * FROM tasks WHERE id = ?', t.id));
});

dayRoutes.delete('/tasks/:id', async (c) => {
  const t = await ownTask(c.env.DB, c.get('user').id, c.req.param('id'));
  await run(c.env.DB, 'DELETE FROM tasks WHERE id = ?', t.id);
  if (t.notion_page_id) c.executionCtx.waitUntil(archivePage(c.env, t.notion_page_id));
  return c.json({ ok: true });
});

/** できなかったタスクを別の日へ送る。Notion の行は複製せず、日付を送り先へ移す */
dayRoutes.post('/tasks/:id/carry', async (c) => {
  const u = c.get('user');
  const t = await ownTask(c.env.DB, u.id, c.req.param('id'));
  const { date } = await c.req.json();
  if (!isDate(date)) throw new HttpError(400, '日付が正しくありません');
  if (!['todo', 'missed'].includes(t.status)) throw new HttpError(400, 'このタスクは送れません');
  const created = await createTask(c.env, u.id, {
    date,
    kind: t.kind,
    title: t.title,
    goal_id: t.goal_id,
    carried_from_id: t.id,
    carry_count: t.carry_count + 1,
    notion_page_id: t.notion_page_id,
    notion_snapshot: t.notion_snapshot,
  });
  await run(c.env.DB, "UPDATE tasks SET status = 'carried', notion_page_id = NULL, notion_dirty = 0, updated_at = datetime('now') WHERE id = ?", t.id);
  syncLater(c);
  return c.json(created);
});

/** 「時間があればやること」を「やるべきこと」に上げる（空き枠があるときだけ） */
dayRoutes.post('/tasks/:id/promote', async (c) => {
  const u = c.get('user');
  const t = await ownTask(c.env.DB, u.id, c.req.param('id'));
  if (t.kind !== 'might') throw new HttpError(400, 'すでに「やるべきこと」です');
  const pos = await nextPosition(c.env.DB, u.id, t.date, true);
  if (pos === null) throw new HttpError(400, 'やるべきことは1日3つまでです。先に1つ終えるか送ってください');
  await run(c.env.DB, "UPDATE tasks SET kind = 'must', position = ?, notion_dirty = 1, updated_at = datetime('now') WHERE id = ?", pos, t.id);
  syncLater(c);
  return c.json(await one(c.env.DB, 'SELECT * FROM tasks WHERE id = ?', t.id));
});

/** 「やるべきこと」を「時間があればやること」に下げる */
dayRoutes.post('/tasks/:id/demote', async (c) => {
  const u = c.get('user');
  const t = await ownTask(c.env.DB, u.id, c.req.param('id'));
  if (t.kind !== 'must' || t.status !== 'todo') throw new HttpError(400, '未着手の「やるべきこと」だけ下げられます');
  await run(c.env.DB, "UPDATE tasks SET kind = 'might', position = ?, updated_at = datetime('now') WHERE id = ?", await nextMightPosition(c.env.DB, u.id, t.date), t.id);
  if (t.notion_page_id) {
    await run(c.env.DB, 'UPDATE tasks SET notion_page_id = NULL WHERE id = ?', t.id);
    c.executionCtx.waitUntil(archivePage(c.env, t.notion_page_id));
  }
  return c.json({ ok: true });
});

// ---- 週間・月間（予定とレビュー） ----
const EMPTY_NOTE = {
  theme: '', targets: [] as { text: string; done: boolean }[], plan_memo: '',
  review_good: '', review_bad: '', review_learn: '', review_next: '', review_score: null as number | null, reviewed: false,
};

function periodRange(kind: string, start: string) {
  if (kind === 'week') {
    if (weekday(start) !== 1) throw new HttpError(400, '週は月曜日から指定してください');
    return { end: addDays(start, 6), prev: addDays(start, -7), next: addDays(start, 7) };
  }
  if (kind === 'month') {
    if (start !== monthStart(start)) throw new HttpError(400, '月は1日から指定してください');
    return { end: monthEnd(start), prev: addMonths(start, -1), next: addMonths(start, 1) };
  }
  throw new HttpError(400, '期間の種類が正しくありません');
}

async function loadNote(db: D1Database, userId: string, kind: string, start: string) {
  const r = await one(db, 'SELECT * FROM period_notes WHERE user_id = ? AND kind = ? AND start_date = ?', userId, kind, start);
  if (!r) return { ...EMPTY_NOTE };
  let targets = [];
  try {
    targets = JSON.parse(r.targets_json);
  } catch {}
  return {
    theme: r.theme, targets, plan_memo: r.plan_memo, review_good: r.review_good, review_bad: r.review_bad,
    review_learn: r.review_learn, review_next: r.review_next, review_score: r.review_score, reviewed: !!r.reviewed,
  };
}

dayRoutes.get('/periods/:kind/:start', async (c) => {
  const u = c.get('user');
  const { kind, start } = c.req.param();
  if (!isDate(start)) throw new HttpError(400, '日付が正しくありません');
  const { end, prev, next } = periodRange(kind, start);
  await markMissed(c.env, u.id);
  const today = todayJST();

  const tasks = await tasksInRange(c.env.DB, u.id, start, end);
  const entries = await all(c.env.DB, 'SELECT * FROM daily_entries WHERE user_id = ? AND date BETWEEN ? AND ?', u.id, start, end);
  const terms = await all(c.env.DB, 'SELECT * FROM terms WHERE user_id = ? AND start_date <= ? AND end_date >= ? ORDER BY start_date', u.id, end, start);

  // 期間内の習慣の達成数（予定日数に対して）
  const habits = [];
  const goals = [];
  for (const term of terms) {
    const gs = await goalsWithProgress(c.env.DB, term);
    const from = start > term.start_date ? start : term.start_date;
    const to = end < term.end_date ? end : term.end_date;
    const range = daysInRange(from, to);
    for (const g of gs) {
      if (g.type === 'habit') {
        const logs = new Set(g.logs);
        const target = g.habit_frequency === 'weekly'
          ? Math.round(((g.habit_times_per_week ?? 1) * range.length) / 7)
          : range.filter((d) => habitScheduled(g, d)).length;
        habits.push({ id: g.id, title: g.title, done: range.filter((d) => logs.has(d)).length, target, days: range.map((d) => ({ date: d, done: logs.has(d), scheduled: habitScheduled(g, d) })) });
      } else {
        goals.push({ id: g.id, title: g.title, progress: g.progress, behind: g.behind, status: g.status, termTitle: term.title });
      }
    }
  }

  const days = daysInRange(start, end).map((d) => {
    const e = entries.find((x) => x.date === d);
    return {
      date: d,
      completed: !!e?.completed,
      focus: e?.focus ?? '',
      goods: parseGoods(e?.goods_json).filter(Boolean),
      tasks: tasks.filter((t) => t.date === d && t.status !== 'carried'),
    };
  });

  const prevTasks = await tasksInRange(c.env.DB, u.id, prev, addDays(start, -1));
  const prevNote = await loadNote(c.env.DB, u.id, kind, prev);
  const weeks = kind === 'month'
    ? await Promise.all(
        [...new Set(daysInRange(start, end).map(mondayOf))].map(async (w) => ({ start: w, note: await loadNote(c.env.DB, u.id, 'week', w), stats: taskStats(await tasksInRange(c.env.DB, u.id, w, addDays(w, 6))) })),
      )
    : undefined;

  return c.json({
    kind, start, end, prev, next, today,
    note: await loadNote(c.env.DB, u.id, kind, start),
    prevNote: { theme: prevNote.theme, review_next: prevNote.review_next, reviewed: prevNote.reviewed },
    days,
    stats: taskStats(tasks),
    prevStats: taskStats(prevTasks),
    byGoal: groupByGoal(tasks).map(({ tasks: _t, ...g }) => g),
    habits,
    goals,
    fill: await fillRate(c.env.DB, u.id, start, end),
    weeks,
    term: withInfo(await termForDate(c.env.DB, u.id, start < today && end >= today ? today : start)),
  });
});

dayRoutes.on(['PUT', 'POST'], '/periods/:kind/:start', async (c) => {
  const u = c.get('user');
  const { kind, start } = c.req.param();
  if (!isDate(start)) throw new HttpError(400, '日付が正しくありません');
  periodRange(kind, start);
  const b = await c.req.json();
  await run(c.env.DB, 'INSERT OR IGNORE INTO period_notes (user_id, kind, start_date) VALUES (?, ?, ?)', u.id, kind, start);
  const f: Record<string, unknown> = {};
  for (const k of ['theme', 'plan_memo', 'review_good', 'review_bad', 'review_learn', 'review_next']) {
    if (k in b) f[k] = str(b[k], 5000);
  }
  if ('targets' in b && Array.isArray(b.targets)) {
    f.targets_json = JSON.stringify(b.targets.slice(0, 10).map((t: any) => ({ text: str(t?.text, 300), done: !!t?.done })));
  }
  if ('review_score' in b) f.review_score = b.review_score == null ? null : Math.max(1, Math.min(5, Math.round(Number(b.review_score))));
  if ('reviewed' in b) f.reviewed = b.reviewed ? 1 : 0;
  const keys = Object.keys(f);
  if (keys.length) {
    await run(
      c.env.DB,
      `UPDATE period_notes SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE user_id = ? AND kind = ? AND start_date = ?`,
      ...keys.map((k) => f[k]), u.id, kind, start,
    );
  }
  return c.json({ ok: true, savedAt: new Date().toISOString() });
});
