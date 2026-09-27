// API の通しテスト。空のローカルDBに対して1回だけ実行する
// 使い方: npm run dev のあと  node tests/e2e/api-smoke.mjs
const B = process.env.BASE ?? 'http://127.0.0.1:8787';
let cookie = '';
async function req(method, path, body) {
  const r = await fetch(B + path, { method, redirect: 'manual', headers: { cookie, 'content-type': 'application/json', 'x-fj': '1' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (r.status >= 400) throw new Error(`${method} ${path} ${r.status} ${t}`);
  return j;
}
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
await req('GET', '/auth/dev');
const me = await req('GET', '/api/me'); ok(me.user.email === 'isozaki@yusando.com', 'dev login');
const term = await req('GET', '/api/terms/current?date=2026-09-27'); ok(term.start_date === '2026-10-01' && term.info.totalDays === 92, 'first term 10/1-12/31, 92 days');
// CSRF
const r = await fetch(B + '/api/terms', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' }); ok(r.status === 403, 'mutation without x-fj header is rejected');
const g1 = await req('POST', `/api/terms/${term.id}/goals`, { type: 'project', title: 'カフェ/SHOPをオープンする', why: '自然茶を体験できる場所' });
const g2 = await req('POST', `/api/terms/${term.id}/goals`, { type: 'project', title: 'Youtube登録者1万人' });
const h1 = await req('POST', `/api/terms/${term.id}/goals`, { type: 'habit', title: 'フランス語の日記' });
const h2 = await req('POST', `/api/terms/${term.id}/goals`, { type: 'habit', title: '筋トレ', habit_frequency: 'weekly', habit_times_per_week: 3 });
for (const t of ['物件の契約', '内装工事', 'メニュー決定', 'プレオープン']) await req('POST', `/api/goals/${g1.id}/milestones`, { title: t });
let detail = await req('GET', `/api/terms/${term.id}`);
const ms = detail.goals.find(g => g.id === g1.id).milestones;
await req('PATCH', `/api/milestones/${ms[0].id}`, { done: true });
await req('PATCH', `/api/goals/${g2.id}`, { manual_progress: 35 });
await req('PUT', `/api/goals/${h1.id}/habit/2026-10-01`, { done: true });
await req('PUT', `/api/goals/${h1.id}/habit/2026-10-02`, { done: true });
detail = await req('GET', `/api/terms/${term.id}`);
ok(detail.goals.find(g => g.id === g1.id).progress === 25, 'project progress from milestones = 25%');
ok(detail.goals.find(g => g.id === g2.id).progress === 35, 'manual progress = 35%');
await req('POST', `/api/goals/${g2.id}/move`, { dir: -1 });
detail = await req('GET', `/api/terms/${term.id}`);
ok(detail.goals.filter(g => g.type === 'project')[0].id === g2.id, 'goal reorder');
// day page
const d = '2026-10-01';
const t1 = await req('POST', `/api/days/${d}/tasks`, { title: '不動産屋に電話', goal_id: g1.id });
const t2 = await req('POST', `/api/days/${d}/tasks`, { title: '動画を1本撮る', goal_id: g2.id });
const t3 = await req('POST', `/api/days/${d}/tasks`, { title: '請求書を送る' });
let err = ''; try { await req('POST', `/api/days/${d}/tasks`, { title: '4つ目' }); } catch (e) { err = e.message; }
ok(err.includes('3つまで'), 'fourth task is rejected');
await req('PATCH', `/api/tasks/${t1.id}`, { status: 'done' });
await req('PUT', `/api/days/${d}`, { focus: '物件を決める', goods: ['晴れた', 'お茶がおいしい', ''], memo: 'メモ', completed: true });
let day = await req('GET', `/api/days/${d}`);
ok(day.term.info.dayNumber === 1 && day.entry.focus === '物件を決める' && day.entry.goods[1] === 'お茶がおいしい' && day.entry.completed, 'day entry saved');
ok(day.tasks.length === 3 && day.goals.length === 4, 'day shows 3 tasks and term goals');
ok(day.goals.find(g => g.id === h1.id).doneOnDate === true, 'habit check shown on day');
// past task gets auto-missed
const past = await req('POST', `/api/days/2026-09-20/tasks`, { title: '過去のタスク' });
day = await req('GET', `/api/days/2026-09-20`);
ok(day.tasks[0].status === 'missed', 'past todo becomes missed automatically');
const carried = await req('POST', `/api/tasks/${past.id}/carry`, { date: '2026-09-28' });
ok(carried.carry_count === 1 && carried.date === '2026-09-28', 'carry creates task on new date with count');
day = await req('GET', `/api/days/2026-09-20`);
ok(day.tasks[0].status === 'carried', 'original task marked carried');
// ledger & review
const ledger = await req('GET', `/api/terms/${term.id}/tasks`);
ok(ledger.stats.total === 3 && ledger.stats.done === 1, 'ledger stats');
ok(ledger.byGoal.length === 3, 'ledger grouped by goal');
const review = await req('GET', `/api/terms/${term.id}/review`);
ok(review.doneByGoal[0].tasks[0].title === '不動産屋に電話' && review.byWeekday.length === 7, 'term review');
// periods
const wk = await req('GET', '/api/periods/week/2026-09-28');
ok(wk.days.length === 7 && wk.habits.length === 2, 'week plan data');
await req('PUT', '/api/periods/week/2026-09-28', { theme: '準備の週', targets: [{ text: '物件を3件見る', done: false }], review_next: '朝に動画を撮る', review_score: 4 });
const wk2 = await req('GET', '/api/periods/week/2026-10-05');
ok(wk2.prevNote.review_next === '朝に動画を撮る', 'next week shows last review decision');
const mo = await req('GET', '/api/periods/month/2026-10-01');
ok(mo.days.length === 31 && mo.weeks.length === 5, 'month data with weeks');
err = ''; try { await req('GET', '/api/periods/week/2026-09-29'); } catch (e) { err = e.message; }
ok(err.includes('月曜日'), 'week must start on Monday');
// new term + copy goals
const t2term = await req('POST', '/api/terms', { start_date: '2027-01-01', end_date: '2027-03-31', copy_goal_ids: [g1.id, h1.id] });
const nd = await req('GET', `/api/terms/${t2term.id}`);
ok(nd.title === '2027 Q1（1/1〜3/31）' && nd.goals.length === 2 && nd.goals.find(g => g.type === 'project').milestones.length === 3, 'next term copies goals and undone milestones');
err = ''; try { await req('POST', '/api/terms', { start_date: '2026-12-01', end_date: '2027-02-01' }); } catch (e) { err = e.message; }
ok(err.includes('重なって'), 'overlapping term rejected');
// carry-over to next term
await req('PATCH', `/api/tasks/${t3.id}`, { status: 'missed' });
await req('POST', `/api/terms/${term.id}/carry-over`, { task_ids: [t3.id], on: true });
const cin = await req('GET', `/api/terms/${t2term.id}/carried-in`);
ok(cin.length === 1 && cin[0].title === '請求書を送る', 'carried-in list on next term');
await req('POST', `/api/tasks/${t3.id}/to-milestone`, { goal_id: nd.goals.find(g => g.type === 'project').id });
ok((await req('GET', `/api/terms/${t2term.id}/carried-in`)).length === 0, 'carried item becomes milestone');
// notion disabled path
const ns = await req('GET', '/api/notion/status'); ok(ns.enabled === false, 'notion status when not configured');
// calendar without google
err = ''; try { await req('GET', '/api/calendar/events?date=2026-10-01'); } catch (e) { err = e.message; }
ok(err.includes('google_reconnect'), 'calendar asks to connect google');
console.log('ALL OK');
