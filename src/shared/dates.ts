// 日付ユーティリティ。日付は常に 'YYYY-MM-DD'（日本時間）の文字列で扱う。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function parse(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && format(parse(s)) === s;
}

export function todayJST(now: Date = new Date()): string {
  return format(now.getTime() + JST_OFFSET_MS);
}

export function hourJST(now: Date = new Date()): number {
  return new Date(now.getTime() + JST_OFFSET_MS).getUTCHours();
}

export function addDays(date: string, n: number): string {
  return format(parse(date) + n * DAY_MS);
}

/** b - a の日数 */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / DAY_MS);
}

/** 0=日曜 … 6=土曜 */
export function weekday(date: string): number {
  return new Date(parse(date)).getUTCDay();
}

/** その日を含む週の月曜日 */
export function mondayOf(date: string): string {
  const w = weekday(date);
  return addDays(date, w === 0 ? -6 : 1 - w);
}

export function monthStart(date: string): string {
  return date.slice(0, 8) + '01';
}

export function monthEnd(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return format(Date.UTC(y, m, 0));
}

export function addMonths(date: string, n: number): string {
  const [y, m] = date.split('-').map(Number);
  return format(Date.UTC(y, m - 1 + n, 1));
}

export function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function quarterOf(date: string): { start: string; end: string; title: string } {
  const [y, m] = date.split('-').map(Number);
  const q = Math.floor((m - 1) / 3);
  const start = format(Date.UTC(y, q * 3, 1));
  const end = format(Date.UTC(y, q * 3 + 3, 0));
  return { start, end, title: termTitle(start, end) };
}

export function termTitle(start: string, end: string): string {
  const [y, m] = start.split('-').map(Number);
  const q = m % 3 === 1 ? ` Q${Math.floor((m - 1) / 3) + 1}` : '';
  return `${y}${q}（${shortDate(start)}〜${shortDate(end)}）`;
}

/** ターム作成時の既定: 今の四半期。ただし残り7日以内なら次の四半期 */
export function defaultTermFor(today: string) {
  const cur = quarterOf(today);
  if (diffDays(today, cur.end) < 7) return quarterOf(addDays(cur.end, 1));
  return cur;
}

export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}年${m}月${d}日（${WEEKDAYS_JA[weekday(date)]}）`;
}
