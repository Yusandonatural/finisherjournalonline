// 進捗の計算。サーバーとフロントの両方で使う。
import { addDays, daysInRange, diffDays, mondayOf, weekday } from './dates';

export type TaskStatus = 'todo' | 'done' | 'missed' | 'carried' | 'dropped';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '未着手',
  done: 'できた',
  missed: 'できなかった',
  carried: '送った',
  dropped: '取り下げ',
};

export interface TermLike {
  start_date: string;
  end_date: string;
}

export interface TermInfo {
  totalDays: number;
  /** Day N（開始前は null） */
  dayNumber: number | null;
  elapsedDays: number;
  elapsedPct: number;
  daysLeft: number;
  daysUntilStart: number;
  phase: 'upcoming' | 'active' | 'ended';
}

export function termInfo(term: TermLike, date: string): TermInfo {
  const totalDays = diffDays(term.start_date, term.end_date) + 1;
  const idx = diffDays(term.start_date, date);
  const phase = idx < 0 ? 'upcoming' : idx >= totalDays ? 'ended' : 'active';
  const elapsedDays = Math.max(0, Math.min(totalDays, idx + 1));
  return {
    totalDays,
    dayNumber: phase === 'active' ? idx + 1 : null,
    elapsedDays,
    elapsedPct: Math.round((elapsedDays / totalDays) * 100),
    daysLeft: Math.max(0, diffDays(date, term.end_date)),
    daysUntilStart: Math.max(0, -idx),
    phase,
  };
}

export interface MetricLike {
  metric_start?: number | null;
  metric_current?: number | null;
  metric_target?: number | null;
}

/** 数値目標の達成率。目標値がなければ null */
export function metricProgress(m: MetricLike): number | null {
  if (m.metric_target == null) return null;
  const start = m.metric_start ?? 0;
  const cur = m.metric_current ?? start;
  if (m.metric_target === start) return cur >= m.metric_target ? 100 : 0;
  const pct = ((cur - start) / (m.metric_target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** プロジェクトの進捗: 数値目標があればそれ、なければマイルストーンの完了率、どちらもなければ手動の値 */
export function projectProgress(milestones: { done: number | boolean }[], manual: number | null, metric?: MetricLike): number {
  const m = metric ? metricProgress(metric) : null;
  if (m != null) return m;
  if (milestones.length === 0) return Math.max(0, Math.min(100, manual ?? 0));
  const done = milestones.filter((m) => !!m.done).length;
  return Math.round((done / milestones.length) * 100);
}

export interface HabitLike {
  habit_frequency: string | null;
  habit_times_per_week: number | null;
  habit_weekdays_json: string | null;
}

export function habitWeekdays(goal: HabitLike): number[] {
  try {
    const v = JSON.parse(goal.habit_weekdays_json || '[]');
    return Array.isArray(v) ? v.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  } catch {
    return [];
  }
}

/** その日が「やる予定の日」か */
export function habitScheduled(goal: HabitLike, date: string): boolean {
  if (goal.habit_frequency === 'weekdays') return habitWeekdays(goal).includes(weekday(date));
  return true;
}

export function habitLabel(goal: HabitLike): string {
  if (goal.habit_frequency === 'weekly') return `週${goal.habit_times_per_week ?? 1}回`;
  if (goal.habit_frequency === 'weekdays') {
    const names = ['日', '月', '火', '水', '木', '金', '土'];
    return habitWeekdays(goal).map((w) => names[w]).join('・') || '曜日未設定';
  }
  return '毎日';
}

export interface HabitStats {
  expected: number;
  done: number;
  pct: number;
  currentStreak: number;
  longestStreak: number;
  weekDone: number;
  weekTarget: number;
}

/**
 * 習慣の達成状況。start〜until（通常は今日）までを対象にする。
 * 今日がまだ未チェックでも連続記録は途切れさせない。
 */
export function habitStats(goal: HabitLike, doneDates: Set<string>, start: string, until: string): HabitStats {
  const weekStart = mondayOf(until) < start ? start : mondayOf(until);
  const weekDays = daysInRange(weekStart, addDays(mondayOf(until), 6));
  const weekDone = weekDays.filter((d) => doneDates.has(d)).length;

  if (until < start) {
    const weekTarget = goal.habit_frequency === 'weekly' ? goal.habit_times_per_week ?? 1 : 0;
    return { expected: 0, done: 0, pct: 0, currentStreak: 0, longestStreak: 0, weekDone: 0, weekTarget };
  }

  const days = daysInRange(start, until);
  const done = days.filter((d) => doneDates.has(d)).length;

  if (goal.habit_frequency === 'weekly') {
    const n = goal.habit_times_per_week ?? 1;
    const expected = (days.length * n) / 7;
    return {
      expected: Math.round(expected * 10) / 10,
      done,
      pct: expected > 0 ? Math.min(100, Math.round((done / expected) * 100)) : 0,
      currentStreak: 0,
      longestStreak: 0,
      weekDone,
      weekTarget: n,
    };
  }

  const scheduled = days.filter((d) => habitScheduled(goal, d));
  const scheduledDone = scheduled.filter((d) => doneDates.has(d)).length;
  let longest = 0;
  let run = 0;
  for (const d of scheduled) {
    run = doneDates.has(d) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  for (let i = scheduled.length - 1; i >= 0; i--) {
    const d = scheduled[i];
    if (doneDates.has(d)) current++;
    else if (d === until) continue;
    else break;
  }
  const weekTarget = weekDays.filter((d) => habitScheduled(goal, d)).length;
  return {
    expected: scheduled.length,
    done: scheduledDone,
    pct: scheduled.length > 0 ? Math.round((scheduledDone / scheduled.length) * 100) : 0,
    currentStreak: current,
    longestStreak: longest,
    weekDone,
    weekTarget,
  };
}

export interface TaskStats {
  total: number;
  done: number;
  missed: number;
  todo: number;
  carried: number;
  dropped: number;
  /** できた ÷（できた＋できなかった＋送った）。未確定の未着手と取り下げは除く */
  rate: number | null;
}

export function taskStats(tasks: { status: string }[]): TaskStats {
  const s: TaskStats = { total: 0, done: 0, missed: 0, todo: 0, carried: 0, dropped: 0, rate: null };
  for (const t of tasks) {
    s.total++;
    if (t.status in s) (s as any)[t.status]++;
  }
  const decided = s.done + s.missed + s.carried;
  s.rate = decided > 0 ? Math.round((s.done / decided) * 100) : null;
  return s;
}

/** 経過率に対して20ポイント以上遅れているか */
export function isBehind(elapsedPct: number, progressPct: number): boolean {
  return elapsedPct - progressPct >= 20;
}
