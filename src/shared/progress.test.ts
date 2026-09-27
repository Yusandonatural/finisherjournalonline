import { describe, expect, it } from 'vitest';
import { addDays, defaultTermFor, isDate, mondayOf, monthEnd, quarterOf, termTitle, todayJST } from './dates';
import { habitStats, isBehind, projectProgress, taskStats, termInfo } from './progress';

const term = { start_date: '2026-10-01', end_date: '2026-12-31' };

describe('dates', () => {
  it('日本時間で今日を出す', () => {
    expect(todayJST(new Date('2026-09-30T15:30:00Z'))).toBe('2026-10-01');
    expect(todayJST(new Date('2026-09-30T14:59:00Z'))).toBe('2026-09-30');
  });
  it('月曜始まりの週', () => {
    expect(mondayOf('2026-10-01')).toBe('2026-09-28'); // 木曜
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // 日曜
    expect(mondayOf('2026-10-05')).toBe('2026-10-05'); // 月曜
  });
  it('四半期とターム名', () => {
    expect(quarterOf('2026-11-15')).toEqual({ start: '2026-10-01', end: '2026-12-31', title: '2026 Q4（10/1〜12/31）' });
    expect(defaultTermFor('2026-09-27').start).toBe('2026-10-01');
    expect(defaultTermFor('2026-09-10').start).toBe('2026-07-01');
    expect(termTitle('2027-01-01', '2027-03-31')).toBe('2027 Q1（1/1〜3/31）');
  });
  it('月末・日付判定', () => {
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-12-31')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('termInfo', () => {
  it('10/1〜12/31 は 92日', () => {
    expect(termInfo(term, '2026-10-01')).toMatchObject({ totalDays: 92, dayNumber: 1, daysLeft: 91, phase: 'active' });
    expect(termInfo(term, '2026-12-31')).toMatchObject({ dayNumber: 92, elapsedPct: 100, daysLeft: 0 });
  });
  it('開始前と終了後', () => {
    expect(termInfo(term, '2026-09-27')).toMatchObject({ phase: 'upcoming', dayNumber: null, daysUntilStart: 4, elapsedDays: 0 });
    expect(termInfo(term, '2027-01-02')).toMatchObject({ phase: 'ended', dayNumber: null, elapsedPct: 100 });
  });
});

describe('projectProgress', () => {
  it('マイルストーンの完了率', () => {
    expect(projectProgress([{ done: 1 }, { done: 0 }, { done: 1 }, { done: 0 }], null)).toBe(50);
  });
  it('マイルストーンがなければ手動の値', () => {
    expect(projectProgress([], 35)).toBe(35);
    expect(projectProgress([], null)).toBe(0);
  });
});

describe('habitStats', () => {
  const daily = { habit_frequency: 'daily', habit_times_per_week: null, habit_weekdays_json: null };
  it('毎日の達成率と連続記録', () => {
    const done = new Set(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05']);
    const s = habitStats(daily, done, '2026-10-01', '2026-10-06');
    expect(s).toMatchObject({ expected: 6, done: 4, pct: 67, longestStreak: 2, currentStreak: 2 });
  });
  it('今日が未チェックでも連続は途切れない', () => {
    const done = new Set(['2026-10-04', '2026-10-05']);
    expect(habitStats(daily, done, '2026-10-01', '2026-10-06').currentStreak).toBe(2);
  });
  it('曜日指定', () => {
    const g = { habit_frequency: 'weekdays', habit_times_per_week: null, habit_weekdays_json: '[1,3,5]' };
    // 10/1(木)〜10/7(水): 予定日は 10/2(金), 10/5(月), 10/7(水)
    const s = habitStats(g, new Set(['2026-10-02', '2026-10-07']), '2026-10-01', '2026-10-07');
    expect(s).toMatchObject({ expected: 3, done: 2, pct: 67, currentStreak: 1 });
  });
  it('週N回', () => {
    const g = { habit_frequency: 'weekly', habit_times_per_week: 3, habit_weekdays_json: null };
    const s = habitStats(g, new Set(['2026-10-05', '2026-10-07']), '2026-10-01', '2026-10-14');
    expect(s).toMatchObject({ expected: 6, done: 2, pct: 33, weekTarget: 3 });
  });
});

describe('taskStats', () => {
  it('達成率は できた÷（できた＋できなかった＋送った）', () => {
    const s = taskStats([
      { status: 'done' }, { status: 'done' }, { status: 'done' },
      { status: 'missed' }, { status: 'carried' }, { status: 'todo' }, { status: 'dropped' },
    ]);
    expect(s).toMatchObject({ total: 7, done: 3, missed: 1, carried: 1, todo: 1, dropped: 1, rate: 60 });
  });
  it('遅れ判定', () => {
    expect(isBehind(50, 30)).toBe(true);
    expect(isBehind(50, 31)).toBe(false);
  });
});
