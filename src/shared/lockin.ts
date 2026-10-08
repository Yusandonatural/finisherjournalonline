// グレート・ロックイン：90日間、決めたルールだけを守り抜く集中モードの決まりごと

export type RuleUnit = 'min' | 'check';

/** 全員共通のルール（外せない）。目安の数値だけは変えられる */
export const COMMON_RULES: { key: string; title: string; target: number; unit: RuleUnit; hint: string }[] = [
  { key: 'exercise', title: '運動', target: 30, unit: 'min', hint: '1日30分' },
  { key: 'meditation', title: '瞑想', target: 15, unit: 'min', hint: '1日合計15分。分けてもOK' },
  { key: 'alcohol', title: '禁酒', target: 1, unit: 'check', hint: '1滴も飲まない' },
];

/** 自分で足せるルールは1〜3つ。全部で6つを超えると続かなくなるので上限で止める */
export const MAX_CUSTOM_RULES = 3;
export const MAX_RULES = COMMON_RULES.length + MAX_CUSTOM_RULES;

/** Day 0：始める前に整える「基地」 */
export const SETUP_ITEMS: { key: string; group: string; label: string }[] = [
  { key: 'alcohol', group: '誘惑の断捨離', label: '部屋からお酒をなくした' },
  { key: 'temptations', group: '誘惑の断捨離', label: 'ゲームなど、つい手が伸びる物を片付けた' },
  { key: 'phone', group: '視覚の最適化', label: 'スマホを作業スペースから5歩以上離れた場所に置くと決めた' },
  { key: 'desk', group: '視覚の最適化', label: '作業スペースに、作業に使う物だけを置いた' },
  { key: 'cushion', group: '瞑想・作業エリア', label: '瞑想・休憩用のクッションを置いた' },
  { key: 'green', group: '瞑想・作業エリア', label: '観葉植物など、緑を置いた' },
];

/** イベント（飲み会など）の日に守る3つの条件 */
export const EVENT_CHECKS: { key: 'noAlcohol' | 'morningWork' | 'nextDayOnTime'; label: string; short: string }[] = [
  { key: 'noAlcohol', label: 'お酒を1滴も飲まなかった', short: '飲まない' },
  { key: 'morningWork', label: 'その日の午前中、作業に没頭できた', short: '午前作業' },
  { key: 'nextDayOnTime', label: '翌朝も定刻に起きて作業を再開できた', short: '翌朝定刻' },
];

export type EventInfo = { title?: string; noAlcohol?: boolean; morningWork?: boolean; nextDayOnTime?: boolean };

export function parseEvent(json: string | null | undefined): EventInfo {
  try {
    const v = JSON.parse(json || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function parseSetup(json: string | null | undefined): Record<string, boolean> {
  const v = parseEvent(json) as Record<string, unknown>;
  return Object.fromEntries(SETUP_ITEMS.map((i) => [i.key, !!v[i.key]]));
}

/** 1日分の記録が「守れた」か */
export function ruleDone(rule: { unit: string; target_value: number }, value: number, done: boolean): boolean {
  return rule.unit === 'min' ? value >= rule.target_value : done;
}

/** 始める前の準備がどこまでできているか */
export function readiness(term: { tenx_goal?: string; commit_title?: string; commit_date?: string | null; setup_json?: string }, projectGoalCount: number, customRuleCount: number) {
  const setup = parseSetup(term.setup_json);
  const steps = {
    tenx: !!term.tenx_goal?.trim(),
    goal: projectGoalCount > 0,
    rules: customRuleCount >= 1,
    setup: SETUP_ITEMS.every((i) => setup[i.key]),
    commit: !!term.commit_title?.trim() && !!term.commit_date,
  };
  return { steps, ready: Object.values(steps).every(Boolean) };
}

/** 今日から数えた連続日数（今日がまだなら昨日から数える） */
export function streak(doneDates: Set<string>, today: string, start: string, addDays: (d: string, n: number) => string): number {
  let d = doneDates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (d >= start && doneDates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
