import { Hono } from 'hono';
import { addDays, daysInRange, diffDays, isDate, mondayOf, todayJST } from '../../shared/dates';
import { COMMON_RULES, MAX_CUSTOM_RULES, MAX_RULES, SETUP_ITEMS, parseEvent, parseSetup, readiness, ruleDone, streak } from '../../shared/lockin';
import { all, one, ownTerm, run, uid } from '../db';
import { HttpError, type AppEnv } from '../env';
import { goalsWithProgress, tasksInRange, withInfo } from '../stats';

export const lockinRoutes = new Hono<AppEnv>();

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || 0));

async function ownRule(db: D1Database, userId: string, id: string) {
  const r = await one(db, 'SELECT r.*, t.user_id FROM lockin_rules r JOIN terms t ON t.id = r.term_id WHERE r.id = ? AND t.user_id = ?', id, userId);
  if (!r) throw new HttpError(404, 'ルールが見つかりません');
  return r;
}

const rulesOf = (db: D1Database, termId: string) =>
  all(db, 'SELECT * FROM lockin_rules WHERE term_id = ? ORDER BY category = \'custom\', sort_order, rowid', termId);

/** 共通ルールがまだなければ入れる */
async function ensureCommonRules(db: D1Database, termId: string) {
  const have = new Set((await all(db, 'SELECT rule_key FROM lockin_rules WHERE term_id = ? AND category = \'common\'', termId)).map((r) => r.rule_key));
  for (const [i, r] of COMMON_RULES.entries()) {
    if (have.has(r.key)) continue;
    await run(db, 'INSERT INTO lockin_rules (id, term_id, category, rule_key, title, target_value, unit, sort_order) VALUES (?, ?, \'common\', ?, ?, ?, ?, ?)',
      uid(), termId, r.key, r.title, r.target, r.unit, i);
  }
}

/** 1日分の記録を書く。分のルールは足し算も受ける */
export async function writeRuleLog(db: D1Database, rule: any, date: string, b: { value?: unknown; add?: unknown; done?: unknown }) {
  const cur = await one(db, 'SELECT * FROM lockin_logs WHERE rule_id = ? AND date = ?', rule.id, date);
  let value = Number(cur?.value ?? 0);
  if ('value' in b) value = num(b.value, 0, 1440);
  if ('add' in b) value = num(value + Number(b.add), 0, 1440);
  const done = rule.unit === 'min' ? value >= rule.target_value : 'done' in b ? !!b.done : !!cur?.done;
  await run(
    db,
    `INSERT INTO lockin_logs (rule_id, date, value, done) VALUES (?, ?, ?, ?)
     ON CONFLICT (rule_id, date) DO UPDATE SET value = excluded.value, done = excluded.done`,
    rule.id, date, value, done ? 1 : 0,
  );
  return { value, done };
}

/** デイリーページに出すロックインの情報（ロックインでないタームなら null） */
export async function lockinForDay(db: D1Database, userId: string, term: any, date: string) {
  if (!term?.lockin) return null;
  const rules = await rulesOf(db, term.id);
  const logs = new Map(
    (await all(db, 'SELECT l.* FROM lockin_logs l JOIN lockin_rules r ON r.id = l.rule_id WHERE r.term_id = ? AND l.date = ?', term.id, date)).map((l) => [l.rule_id, l]),
  );
  const projects = await one(db, 'SELECT COUNT(*) AS n FROM goals WHERE term_id = ? AND type = \'project\'', term.id);
  const r = readiness(term, projects?.n ?? 0, rules.filter((x) => x.category === 'custom').length);
  const entry = await one(db, 'SELECT event_day, event_json, progress_metric FROM daily_entries WHERE user_id = ? AND date = ?', userId, date);
  const prev = await one(db, 'SELECT date, event_json FROM daily_entries WHERE user_id = ? AND date = ? AND event_day = 1', userId, addDays(date, -1));
  return {
    ready: r.ready,
    steps: r.steps,
    tenx_goal: term.tenx_goal,
    commit: term.commit_title ? { title: term.commit_title, date: term.commit_date, daysLeft: term.commit_date ? diffDays(date, term.commit_date) : null } : null,
    rules: rules.map((x) => {
      const l = logs.get(x.id);
      return { ...x, value: Number(l?.value ?? 0), done: l ? ruleDone(x, Number(l.value), !!l.done) : false };
    }),
    event: { on: !!entry?.event_day, ...parseEvent(entry?.event_json) },
    prevEvent: prev ? { date: prev.date, ...parseEvent(prev.event_json) } : null,
    progress_metric: entry?.progress_metric ?? '',
  };
}

// ---- ロックインのダッシュボード ----
lockinRoutes.get('/terms/:id/lockin', async (c) => {
  const u = c.get('user');
  const term = await ownTerm(c.env.DB, u.id, c.req.param('id'));
  const today = todayJST();
  const asOf = today < term.start_date ? term.start_date : today > term.end_date ? term.end_date : today;
  const rules = await rulesOf(c.env.DB, term.id);
  const goals = await goalsWithProgress(c.env.DB, term);
  const projects = goals.filter((g: any) => g.type === 'project');
  const r = readiness(term, projects.length, rules.filter((x) => x.category === 'custom').length);

  // ルールごとの守れた日
  const until = today < term.end_date ? today : term.end_date;
  const elapsed = today < term.start_date ? [] : daysInRange(term.start_date, until);
  const logs = await all(c.env.DB, 'SELECT l.* FROM lockin_logs l JOIN lockin_rules r ON r.id = l.rule_id WHERE r.term_id = ?', term.id);
  const ruleStats = rules.map((x) => {
    const dates = new Set(logs.filter((l) => l.rule_id === x.id && ruleDone(x, Number(l.value), !!l.done)).map((l) => l.date as string));
    const todayLog = logs.find((l) => l.rule_id === x.id && l.date === asOf);
    return {
      ...x,
      doneDays: elapsed.filter((d) => dates.has(d)).length,
      elapsedDays: elapsed.length,
      streak: streak(dates, until, term.start_date, addDays),
      dates: [...dates],
      today: { value: Number(todayLog?.value ?? 0), done: todayLog ? ruleDone(x, Number(todayLog.value), !!todayLog.done) : false },
    };
  });
  // 全ルールを守れた日（＝ロックインできた日）
  const perfect = elapsed.filter((d) => ruleStats.length > 0 && ruleStats.every((s) => s.dates.includes(d)));

  const entries = await all(
    c.env.DB,
    'SELECT date, event_day, event_json, progress_metric FROM daily_entries WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC',
    u.id, term.start_date, term.end_date,
  );
  const week = mondayOf(asOf);
  const note = await one(c.env.DB, 'SELECT theme, targets_json FROM period_notes WHERE user_id = ? AND kind = \'week\' AND start_date = ?', u.id, week);
  let weekTargets: { text: string; done: boolean }[] = [];
  try {
    weekTargets = JSON.parse(note?.targets_json ?? '[]');
  } catch {}

  return c.json({
    term: withInfo(term),
    today,
    asOf,
    lockin: !!term.lockin,
    tenx_goal: term.tenx_goal,
    commit: { title: term.commit_title, date: term.commit_date, proof: term.commit_proof, daysLeft: term.commit_date ? diffDays(today, term.commit_date) : null },
    setup: parseSetup(term.setup_json),
    setupItems: SETUP_ITEMS,
    steps: r.steps,
    ready: r.ready,
    limits: { custom: MAX_CUSTOM_RULES, total: MAX_RULES },
    rules: ruleStats,
    perfectDays: perfect.length,
    elapsedDays: elapsed.length,
    perfectStreak: streak(new Set(perfect), until, term.start_date, addDays),
    projects,
    week: { start: week, theme: note?.theme ?? '', targets: weekTargets },
    todayTasks: await tasksInRange(c.env.DB, u.id, asOf, asOf),
    events: entries.filter((e) => e.event_day).map((e) => ({ date: e.date, ...parseEvent(e.event_json) })),
    metrics: entries.filter((e) => e.progress_metric?.trim()).slice(0, 14).map((e) => ({ date: e.date, text: e.progress_metric })),
  });
});

lockinRoutes.put('/terms/:id/lockin', async (c) => {
  const u = c.get('user');
  const term = await ownTerm(c.env.DB, u.id, c.req.param('id'));
  const b = await c.req.json();
  const f: Record<string, unknown> = {};
  if ('lockin' in b) f.lockin = b.lockin ? 1 : 0;
  if ('tenx_goal' in b) f.tenx_goal = str(b.tenx_goal, 1000);
  if ('commit_title' in b) f.commit_title = str(b.commit_title, 200);
  if ('commit_date' in b) f.commit_date = isDate(b.commit_date) ? b.commit_date : null;
  if ('commit_proof' in b) f.commit_proof = str(b.commit_proof, 1000);
  if ('setup' in b && b.setup && typeof b.setup === 'object') {
    f.setup_json = JSON.stringify({ ...parseSetup(term.setup_json), ...Object.fromEntries(SETUP_ITEMS.filter((i) => i.key in b.setup).map((i) => [i.key, !!b.setup[i.key]])) });
  }
  const keys = Object.keys(f);
  if (keys.length) await run(c.env.DB, `UPDATE terms SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => f[k]), term.id);
  if (f.lockin) await ensureCommonRules(c.env.DB, term.id);
  return c.json({ ok: true });
});

// ---- ルール ----
lockinRoutes.post('/terms/:id/lockin/rules', async (c) => {
  const term = await ownTerm(c.env.DB, c.get('user').id, c.req.param('id'));
  const b = await c.req.json();
  const title = str(b.title, 100);
  if (!title) throw new HttpError(400, 'ルールの名前を入れてください');
  await ensureCommonRules(c.env.DB, term.id);
  const rules = await rulesOf(c.env.DB, term.id);
  const custom = rules.filter((x) => x.category === 'custom');
  if (custom.length >= MAX_CUSTOM_RULES || rules.length >= MAX_RULES) {
    throw new HttpError(400, `自分で決めるルールは${MAX_CUSTOM_RULES}つまで（全部で${MAX_RULES}つまで）です。増やしすぎると続きません`);
  }
  const unit = b.unit === 'min' ? 'min' : 'check';
  const id = uid();
  await run(c.env.DB, 'INSERT INTO lockin_rules (id, term_id, category, title, target_value, unit, sort_order) VALUES (?, ?, \'custom\', ?, ?, ?, ?)',
    id, term.id, title, unit === 'min' ? num(b.target_value, 1, 1440) || 30 : 1, unit, custom.length);
  return c.json(await one(c.env.DB, 'SELECT * FROM lockin_rules WHERE id = ?', id));
});

lockinRoutes.patch('/lockin/rules/:id', async (c) => {
  const r = await ownRule(c.env.DB, c.get('user').id, c.req.param('id'));
  const b = await c.req.json();
  // 共通ルールは名前を変えられない（数値の目安だけ）
  if ('title' in b && r.category === 'custom') {
    const title = str(b.title, 100);
    if (title) await run(c.env.DB, 'UPDATE lockin_rules SET title = ? WHERE id = ?', title, r.id);
  }
  if ('target_value' in b && r.unit === 'min') await run(c.env.DB, 'UPDATE lockin_rules SET target_value = ? WHERE id = ?', num(b.target_value, 1, 1440), r.id);
  return c.json({ ok: true });
});

lockinRoutes.delete('/lockin/rules/:id', async (c) => {
  const r = await ownRule(c.env.DB, c.get('user').id, c.req.param('id'));
  if (r.category === 'common') throw new HttpError(400, '共通のルールは外せません');
  await run(c.env.DB, 'DELETE FROM lockin_rules WHERE id = ?', r.id);
  return c.json({ ok: true });
});

lockinRoutes.put('/days/:date/lockin/:ruleId', async (c) => {
  const date = c.req.param('date');
  if (!isDate(date)) throw new HttpError(400, '日付が正しくありません');
  const r = await ownRule(c.env.DB, c.get('user').id, c.req.param('ruleId'));
  return c.json(await writeRuleLog(c.env.DB, r, date, await c.req.json()));
});
