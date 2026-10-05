// 語学アプリと連動している目標（goals.link_source）に、語学アプリの記録を書き込む。
// 15分ごとの定期処理・目標の連動設定を変えたとき・「今すぐ反映」で動く。
// 習慣は ✓ を足すだけで、手で付けた ✓ や外した日は消さない（学習した日はまた付く）。
import { addDays, todayJST } from '../shared/dates';
import { LANG_SOURCES, linkPlan } from '../shared/langs';
import { all, run } from './db';
import type { Env } from './env';
import { firebaseEnabled, firebaseUidByEmail, readProgress } from './firebase';

export interface LangSyncResult { goals: number; checked: number; errors: string[] }

/** userId を渡すとその人だけ。進行中のタームと、終わって7日以内のタームが対象 */
export async function syncLangLinks(env: Env, userId?: string): Promise<LangSyncResult> {
  const res: LangSyncResult = { goals: 0, checked: 0, errors: [] };
  if (!firebaseEnabled(env)) return res;
  const today = todayJST();
  const rows = await all(
    env.DB,
    `SELECT g.id, g.type, g.link_source, t.start_date, t.end_date, u.id AS user_id, u.email
     FROM goals g JOIN terms t ON t.id = g.term_id JOIN users u ON u.id = t.user_id
     WHERE g.link_source IS NOT NULL AND g.link_source != '' AND t.start_date <= ? AND t.end_date >= ?
     ${userId ? 'AND u.id = ?' : ''}`,
    ...(userId ? [today, addDays(today, -7), userId] : [today, addDays(today, -7)]),
  );
  const uids = new Map<string, string | null>();
  const records = new Map<string, any>();
  const errorsByUser = new Map<string, string[]>();
  const fail = (u: string, m: string) => { const l = errorsByUser.get(u) ?? []; if (!l.includes(m)) l.push(m); errorsByUser.set(u, l); };
  for (const g of rows) {
    const src = LANG_SOURCES[g.link_source];
    if (!src) continue;
    try {
      if (!uids.has(g.email)) uids.set(g.email, await firebaseUidByEmail(env, g.email));
      const fuid = uids.get(g.email);
      if (!fuid) { fail(g.user_id, `語学アプリに ${g.email} でログインした記録がありません（語学アプリの「記録の同期」で同じ Google アカウントにログインしてください）`); continue; }
      const key = `${src.collection}/${fuid}`;
      if (!records.has(key)) records.set(key, await readProgress(env, src.collection, fuid));
      const st = records.get(key);
      if (!st) { fail(g.user_id, `${src.label} の記録がまだクラウドにありません（語学アプリでログインして同期してください）`); continue; }
      const plan = linkPlan(g, g, st, today);
      if (g.type === 'project' && plan.progress != null) {
        await run(env.DB, 'UPDATE goals SET manual_progress = ? WHERE id = ?', plan.progress, g.id);
      }
      if (plan.habitDates.length) {
        await env.DB.batch(plan.habitDates.map((d) => env.DB.prepare('INSERT OR IGNORE INTO habit_logs (goal_id, date, done) VALUES (?, ?, 1)').bind(g.id, d)));
        res.checked += plan.habitDates.length;
      }
      res.goals++;
    } catch (e) {
      fail(g.user_id, (e as Error).message);
    }
  }
  // 人ごとに最終反映の時刻とエラーを残す（設定画面に出す）
  const users = new Set(rows.map((r) => r.user_id as string));
  if (userId) users.add(userId);
  for (const u of users) {
    const errs = errorsByUser.get(u) ?? [];
    res.errors.push(...errs);
    await run(env.DB, 'INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)', u);
    await run(env.DB, 'UPDATE user_settings SET lang_sync_at = ?, lang_sync_error = ? WHERE user_id = ?', new Date().toISOString(), errs.join('\n') || null, u);
  }
  return res;
}
