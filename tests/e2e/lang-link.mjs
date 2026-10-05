// 語学アプリとの連動の通しテスト。Firebase エミュレーター（auth :9099・firestore :8085）と、
// エミュレーターにつないだ wrangler dev（:8789）が動いている前提。手順は README の「テスト」。
// 引数なしで動かすと、エミュレーターに語学アプリの利用者と記録を作ってから確かめる。
const B = 'http://127.0.0.1:8789';
let cookie = '';
const req = async (path, opts = {}) => {
  const r = await fetch(B + path, { redirect: 'manual', ...opts, headers: { cookie, 'content-type': 'application/json', 'x-fj': '1', ...(opts.headers || {}) } });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const t = await r.text(); try { return JSON.parse(t); } catch { return t; }
};
const A = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const F = 'http://127.0.0.1:8085/v1/projects/demo-french/databases/(default)/documents';
const signup = await (await fetch(`${A}/accounts:signUp?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'isozaki@yusando.com', password: 'pass1234', returnSecureToken: true }) })).json();
const uid = signup.localId ?? (await (await fetch(`${A}/projects/demo-french/accounts:lookup`, { method: 'POST', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ email: ['isozaki@yusando.com'] }) })).json()).users[0].localId;
const seed = (c, st) => fetch(`${F}/${c}/${uid}`, { method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: { st: { stringValue: JSON.stringify(st) } } }) });
await seed('progress', { xp: 300, days: { '2026-10-01': 40, '2026-10-02': 60, '2026-10-04': 0, '2026-10-05': 30 }, course: { days: { 1: { done: true }, 2: { done: true }, 3: { done: true } } } });
await seed('progress-zh', { xp: 90, xpDay: { '2026-10-03': 20 }, active: { '2026-10-03': 1, '2026-10-05': 1 }, finished: { 1: '2026-10-03' } });
await req('/auth/dev');
const term = await req('/api/terms/current');
console.log('1 term', term.start_date, '〜', term.end_date);
console.log('2 status before:', JSON.stringify(await req('/api/langs/status')).slice(0, 140));
const hFr = await req(`/api/terms/${term.id}/goals`, { method: 'POST', body: JSON.stringify({ type: 'habit', title: 'フランス語を毎日' }) });
const hZh = await req(`/api/terms/${term.id}/goals`, { method: 'POST', body: JSON.stringify({ type: 'habit', title: '中国語を毎日' }) });
const pFr = await req(`/api/terms/${term.id}/goals`, { method: 'POST', body: JSON.stringify({ type: 'project', title: '90日でフランス語で話す' }) });
await req(`/api/goals/${hFr.id}`, { method: 'PATCH', body: JSON.stringify({ link_source: 'lang:fr' }) });
await req(`/api/goals/${hZh.id}`, { method: 'PATCH', body: JSON.stringify({ link_source: 'lang:zh' }) });
await req(`/api/goals/${pFr.id}`, { method: 'PATCH', body: JSON.stringify({ link_source: 'lang:fr' }) });
let t = await req(`/api/terms/${term.id}`);
const show = () => t.goals.map(g => `${g.title}: ${g.type === 'habit' ? 'logs ' + JSON.stringify(g.logs) : 'progress ' + g.progress + '%'} [${g.link_source}]`).join(' | ');
console.log('3 after linking:', show());
// manual check kept, bad value rejected
await req(`/api/goals/${hFr.id}/habit/2026-10-03`, { method: 'PUT', body: JSON.stringify({ done: true }) });
await req(`/api/goals/${hZh.id}`, { method: 'PATCH', body: JSON.stringify({ link_source: 'lang:xx' }) });
// new study on the phone, picked up by the 15-minute job
const pr = await fetch(`http://127.0.0.1:8085/v1/projects/demo-french/databases/(default)/documents/progress/${uid}`, { method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
  body: JSON.stringify({ fields: { st: { stringValue: JSON.stringify({ xp: 400, days: { '2026-10-01': 40, '2026-10-02': 60, '2026-10-05': 30, '2026-10-04': 15 }, course: { days: { 1: { done: true }, 2: { done: true }, 3: { done: true }, 4: { done: true }, 5: { done: true } } } }) } } }) });
const cr = await fetch(B + '/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*'); console.log('4 phone studied on 10-04, doc update:', pr.status, '| cron:', cr.status, (await cr.text()).slice(0, 60));
await new Promise(r => setTimeout(r, 2500));
t = await req(`/api/terms/${term.id}`);
console.log('5 after cron:', show());
const st = await req('/api/langs/status');
console.log('6 status:', 'enabled', st.enabled, '| lastSync', !!st.lastSync, '| error', st.error, '| linked', st.linked.length);
console.log('7 sync now:', JSON.stringify(await req('/api/langs/sync', { method: 'POST' })));
t = await req(`/api/terms/${term.id}`);
console.log('8 after sync now:', show());
