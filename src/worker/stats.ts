import { daysInRange, todayJST } from '../shared/dates';
import { habitScheduled, habitStats, isBehind, projectProgress, taskStats, termInfo } from '../shared/progress';
import { all, one } from './db';

export async function termForDate(db: D1Database, userId: string, date: string) {
  return (
    (await one(db, 'SELECT * FROM terms WHERE user_id = ? AND start_date <= ? AND end_date >= ?', userId, date, date)) ??
    (await one(db, 'SELECT * FROM terms WHERE user_id = ? AND start_date > ? ORDER BY start_date LIMIT 1', userId, date)) ??
    (await one(db, 'SELECT * FROM terms WHERE user_id = ? ORDER BY end_date DESC LIMIT 1', userId))
  );
}

export function withInfo(term: any, asOf = todayJST()) {
  return term ? { ...term, info: termInfo(term, asOf) } : null;
}

/** タームの目標を進捗つきで返す。onDate はその日の習慣チェック状態を付ける日 */
export async function goalsWithProgress(db: D1Database, term: any, onDate?: string) {
  const today = todayJST();
  const info = termInfo(term, today);
  const until = today < term.end_date ? today : term.end_date;
  const goals = await all(db, 'SELECT * FROM goals WHERE term_id = ? ORDER BY sort_order, created_at', term.id);
  const milestones = await all(
    db,
    'SELECT m.* FROM milestones m JOIN goals g ON g.id = m.goal_id WHERE g.term_id = ? ORDER BY m.sort_order, m.rowid',
    term.id,
  );
  const logs = await all(
    db,
    'SELECT l.goal_id, l.date FROM habit_logs l JOIN goals g ON g.id = l.goal_id WHERE g.term_id = ? AND l.done = 1',
    term.id,
  );
  const taskCounts = await all(
    db,
    `SELECT goal_id, status, COUNT(*) AS n FROM tasks WHERE goal_id IN (SELECT id FROM goals WHERE term_id = ?) GROUP BY goal_id, status`,
    term.id,
  );
  return goals.map((g) => {
    const ms = milestones.filter((m) => m.goal_id === g.id);
    const dates = new Set(logs.filter((l) => l.goal_id === g.id).map((l) => l.date as string));
    const habit = g.type === 'habit' ? habitStats(g, dates, term.start_date, until) : null;
    const progress = g.type === 'project' ? projectProgress(ms, g.manual_progress) : habit!.pct;
    const tc = taskCounts.filter((t) => t.goal_id === g.id);
    const tasks = taskStats(tc.flatMap((t) => Array(t.n).fill({ status: t.status })));
    return {
      ...g,
      milestones: ms,
      progress,
      behind: info.phase !== 'upcoming' && g.status === 'active' && isBehind(info.elapsedPct, progress),
      habit,
      logs: [...dates].sort(),
      doneOnDate: onDate ? dates.has(onDate) : undefined,
      scheduledOnDate: onDate && g.type === 'habit' ? habitScheduled(g, onDate) : undefined,
      tasks,
    };
  });
}

export async function tasksInRange(db: D1Database, userId: string, from: string, to: string) {
  return all(
    db,
    `SELECT t.*, g.title AS goal_title FROM tasks t LEFT JOIN goals g ON g.id = t.goal_id
     WHERE t.user_id = ? AND t.date BETWEEN ? AND ? ORDER BY t.date, t.position`,
    userId, from, to,
  );
}

export async function fillRate(db: D1Database, userId: string, from: string, to: string) {
  const today = todayJST();
  const end = to < today ? to : today;
  if (end < from) return { filled: 0, days: 0, pct: null as number | null };
  const days = daysInRange(from, end).length;
  const r = await one(
    db,
    'SELECT COUNT(*) AS n FROM daily_entries WHERE user_id = ? AND date BETWEEN ? AND ? AND completed = 1',
    userId, from, end,
  );
  return { filled: r?.n ?? 0, days, pct: Math.round(((r?.n ?? 0) / days) * 100) };
}

export function groupByGoal(tasks: any[]) {
  const map = new Map<string, { goal_id: string | null; goal_title: string; tasks: any[] }>();
  for (const t of tasks) {
    const key = t.goal_id ?? '';
    if (!map.has(key)) map.set(key, { goal_id: t.goal_id ?? null, goal_title: t.goal_title ?? '目標なし', tasks: [] });
    map.get(key)!.tasks.push(t);
  }
  return [...map.values()].map((g) => ({ ...g, stats: taskStats(g.tasks) }));
}

export function byWeekday(tasks: any[]) {
  const names = ['日', '月', '火', '水', '木', '金', '土'];
  return names.map((name, w) => {
    const ts = tasks.filter((t) => new Date(t.date + 'T00:00:00Z').getUTCDay() === w);
    return { weekday: w, name, stats: taskStats(ts) };
  });
}
