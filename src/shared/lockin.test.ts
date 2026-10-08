import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { MAX_RULES, SETUP_ITEMS, readiness, ruleDone, streak } from './lockin';

describe('ロックイン', () => {
  it('ルールは全部で6つまで', () => {
    expect(MAX_RULES).toBe(6);
  });

  it('分のルールは目安に届いたら守れた扱い（分けて足してもよい）', () => {
    const r = { unit: 'min', target_value: 15 };
    expect(ruleDone(r, 10, false)).toBe(false);
    expect(ruleDone(r, 15, false)).toBe(true);
    expect(ruleDone({ unit: 'check', target_value: 1 }, 0, true)).toBe(true);
  });

  it('準備は5つそろって完了', () => {
    const setup = JSON.stringify(Object.fromEntries(SETUP_ITEMS.map((i) => [i.key, true])));
    const term = { tenx_goal: '売上10倍', commit_title: '発売日', commit_date: '2026-12-31', setup_json: setup };
    expect(readiness(term, 1, 1).ready).toBe(true);
    expect(readiness({ ...term, commit_date: null }, 1, 1).steps.commit).toBe(false);
    expect(readiness(term, 1, 0).ready).toBe(false);
    expect(readiness({ ...term, setup_json: '{}' }, 1, 1).steps.setup).toBe(false);
  });

  it('連続日数は今日がまだなら昨日から数える', () => {
    const s = new Set(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(streak(s, '2026-10-08', '2026-10-01', addDays)).toBe(3);
    expect(streak(new Set([...s, '2026-10-08']), '2026-10-08', '2026-10-01', addDays)).toBe(4);
    expect(streak(s, '2026-10-07', '2026-10-06', addDays)).toBe(2);
  });
});
