import { describe, expect, test } from 'vitest';
import { LANG_SOURCES, linkPlan } from './langs';

const term = { start_date: '2026-10-01', end_date: '2026-12-31' };
const fr = {
  days: { '2026-09-30': 40, '2026-10-02': 30, '2026-10-03': 0, '2026-10-05': 120, '2026-10-09': 10 },
  course: { days: { 1: { done: true }, 2: { done: true, skipped: true }, 3: { done: false } } },
};
const zh = { xpDay: { '2026-10-04': 20 }, active: { '2026-10-04': 1, '2026-10-05': 1 }, finished: { 1: '2026-10-04', 2: '2026-10-05', 3: '2026-10-05' } };

describe('語学アプリとの連動', () => {
  test('習慣：XP が付いた日だけ、タームの開始日〜今日の範囲で ✓', () => {
    expect(linkPlan({ type: 'habit', link_source: 'lang:fr' }, term, fr, '2026-10-05')).toEqual({ habitDates: ['2026-10-02', '2026-10-05'], progress: null });
  });
  test('中国語は xpDay と active の両方を見る', () => {
    expect(linkPlan({ type: 'habit', link_source: 'lang:zh' }, term, zh, '2026-10-05').habitDates).toEqual(['2026-10-04', '2026-10-05']);
  });
  test('プロジェクト：クリアした Day 数 ÷ 90', () => {
    expect(linkPlan({ type: 'project', link_source: 'lang:fr' }, term, fr, '2026-10-05').progress).toBe(2);
    expect(linkPlan({ type: 'project', link_source: 'lang:zh' }, term, zh, '2026-10-05').progress).toBe(3);
    expect(linkPlan({ type: 'project', link_source: 'lang:zh' }, term, { finished: Object.fromEntries([...Array(95)].map((_, i) => [i + 1, 'x'])) }, '2026-10-05').progress).toBe(100);
  });
  test('連動なし・記録なし・ターム前は何もしない', () => {
    expect(linkPlan({ type: 'habit', link_source: null }, term, fr, '2026-10-05')).toEqual({ habitDates: [], progress: null });
    expect(linkPlan({ type: 'habit', link_source: 'lang:fr' }, term, null, '2026-10-05')).toEqual({ habitDates: [], progress: null });
    expect(linkPlan({ type: 'habit', link_source: 'lang:fr' }, term, fr, '2026-09-30').habitDates).toEqual([]);
  });
  test('壊れた記録でも落ちない', () => {
    expect(LANG_SOURCES['lang:fr'].activityDates({ days: { foo: 1, '2026-10-01': 'x' } })).toEqual([]);
    expect(LANG_SOURCES['lang:zh'].doneDays({})).toBe(0);
  });
});
