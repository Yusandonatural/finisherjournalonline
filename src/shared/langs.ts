// 語学アプリ（90日フランス語・90日外国語会話の中国語）との連動。
// 語学アプリの記録（Firestore に保存された JSON）から、
//   習慣目標 → 学習した日（その日に XP が付いた日）に ✓
//   プロジェクト目標 → クリアした Day 数 ÷ 90 を進捗に
// を計算する。サーバーとフロントの両方で使う。
import { daysInRange, isDate } from './dates';

export interface LangSource {
  id: string;
  label: string;
  /** Firestore のコレクション（記録は {collection}/{Firebase のユーザーID}） */
  collection: string;
  /** 学習した日（YYYY-MM-DD） */
  activityDates(st: any): string[];
  /** クリアした Day 数（90日中） */
  doneDays(st: any): number;
}

const positiveKeys = (o: unknown) =>
  o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).filter(([k, v]) => isDate(k) && Number(v) > 0).map(([k]) => k) : [];

export const LANG_SOURCES: Record<string, LangSource> = {
  'lang:fr': {
    id: 'lang:fr',
    label: 'フランス語（90日フランス語）',
    collection: 'progress',
    // days: { 'YYYY-MM-DD': その日の XP }
    activityDates: (st) => positiveKeys(st?.days),
    doneDays: (st) => Object.values(st?.course?.days ?? {}).filter((d: any) => d && d.done).length,
  },
  'lang:zh': {
    id: 'lang:zh',
    label: '中国語（90日外国語会話）',
    collection: 'progress-zh',
    // xpDay: その日の XP、active: 学習した日に 1
    activityDates: (st) => [...new Set([...positiveKeys(st?.xpDay), ...positiveKeys(st?.active)])],
    doneDays: (st) => Object.keys(st?.finished ?? {}).length,
  },
};

export const LANG_TOTAL_DAYS = 90;

export interface LinkPlan {
  /** ✓ を付ける日（タームの開始日〜今日の範囲） */
  habitDates: string[];
  /** プロジェクト目標の進捗（%） */
  progress: number | null;
}

/** 連動している目標に、語学アプリの記録から何を書き込むか */
export function linkPlan(goal: { type: string; link_source: string | null }, term: { start_date: string; end_date: string }, st: any, today: string): LinkPlan {
  const src = goal.link_source ? LANG_SOURCES[goal.link_source] : undefined;
  if (!src || !st) return { habitDates: [], progress: null };
  if (goal.type === 'project') {
    return { habitDates: [], progress: Math.max(0, Math.min(100, Math.round((src.doneDays(st) / LANG_TOTAL_DAYS) * 100))) };
  }
  const until = today < term.end_date ? today : term.end_date;
  if (until < term.start_date) return { habitDates: [], progress: null };
  const inTerm = new Set(daysInRange(term.start_date, until));
  return { habitDates: src.activityDates(st).filter((d) => inTerm.has(d)).sort(), progress: null };
}
