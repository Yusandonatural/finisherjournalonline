// Notion 同期のテスト（Notion API のモックを使う）
// 使い方は README の「テスト」を参照
const B = process.env.BASE ?? 'http://127.0.0.1:8788';
const M = process.env.MOCK ?? 'http://127.0.0.1:9999';
let cookie = '';
async function req(method, path, body) {
  const r = await fetch(B + path, { method, redirect: 'manual', headers: { cookie, 'content-type': 'application/json', 'x-fj': '1' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (r.status >= 400) throw new Error(`${method} ${path} ${r.status} ${t}`);
  return j;
}
const mock = async (path, body) => (await fetch(M + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (s) => ({ title: [{ text: { content: s } }] });
const tag = '目標達成ジャーナル';
const page = async (id) => (await mock('/_pages')).find((p) => p.id === id);
const props = (p) => ({
  title: p.properties.Name.title.map((t) => t.plain_text).join(''),
  date: p.properties.Date?.date?.start, status: p.properties['ステータス']?.select?.name, checked: p.properties.Checked?.checkbox,
  tags: (p.properties['タグ']?.multi_select ?? []).map((t) => t.name), url: p.properties.URL?.url, content: p.properties['内容']?.rich_text?.map((t) => t.plain_text).join(''),
  assignee: (p.properties['担当者']?.multi_select ?? []).map((t) => t.name), archived: p.archived,
});

await req('GET', '/auth/dev');
const term = await req('GET', '/api/terms/current?date=2026-10-01');
const goal = await req('POST', `/api/terms/${term.id}/goals`, { type: 'project', title: 'カフェ/SHOPをオープンする' });
// 既存の Todo リストの行
const A = (await mock('/_seed', { Name: T('ほうじ茶の焙煎テスト'), 'ステータス': { select: { name: 'Inbox' } }, 'タグ': { multi_select: [{ name: '製茶' }] }, '優先度': { select: { name: '高 🔥' } } })).id;
const Bp = (await mock('/_seed', { Name: T('役所に書類'), 'ステータス': { select: { name: '今週の対応事項' } }, 'タグ': { multi_select: [] } })).id;
await mock('/_seed', { Name: T('済んだこと'), 'ステータス': { select: { name: '完了' } }, 'タグ': { multi_select: [] } });
await mock('/_seed', { Name: T('ルーティン'), 'ステータス': { select: { name: '毎日のルーティン' } }, 'タグ': { multi_select: [] } });

// タグ「目標達成ジャーナル」がまだ Notion に一度もない状態でも同期が通る
const r0 = await req('POST', '/api/notion/sync');
ok(!r0.pullError, 'sync works before the journal tag exists in Notion');
const cands = await req('GET', '/api/notion/candidates');
ok(cands.length === 2 && cands[0].pageId === A, 'candidates: only Inbox/今週 rows, high priority first');

const picked = await req('POST', '/api/days/2026-10-02/tasks/from-notion', { page_id: A });
let pa = props(await page(A));
ok(picked.notion_page_id === A && picked.title === 'ほうじ茶の焙煎テスト', 'pick creates local task linked to the row');
ok(pa.tags.includes(tag) && pa.tags.includes('製茶') && pa.date === '2026-10-02' && pa.status === '未着手' && pa.url.includes('/day/2026-10-02#task-'), 'picked row gets journal tag (keeps 製茶), date, status, URL');
ok((await req('GET', '/api/notion/candidates')).length === 1, 'picked row leaves the candidate list');
ok((await mock('/_pages')).length === 4, 'pick does not duplicate the Notion row');

const t = await req('POST', '/api/days/2026-10-02/tasks', { title: '物件の内見', goal_id: goal.id });
await sleep(1500); // waitUntil の送信を待つ
let st = await req('GET', '/api/notion/status');
const titled = async (title) => (await mock('/_pages')).filter((p) => props(p).title === title && !p.archived);
ok((await titled('物件の内見')).length === 0 && st.dirty === 0, 'a new app task is NOT sent to Notion while not done');

// できなかった でも送らない
await req('PATCH', `/api/tasks/${t.id}`, { status: 'missed' });
await req('POST', '/api/notion/sync');
ok((await titled('物件の内見')).length === 0, 'a missed app task is not sent');

// 送る（未完了なので Notion の行はない）→ 送り先で「できた」にしたら送る
const moved = await req('POST', `/api/tasks/${t.id}/carry`, { date: '2026-10-05' });
await req('PATCH', `/api/tasks/${moved.id}`, { status: 'done' });
await sleep(1500);
let rows = await titled('物件の内見');
ok(rows.length === 1, 'checking "done" sends the task to Notion');
let pc = props(rows[0]);
const created = rows[0];
ok(pc.status === '完了' && pc.checked === true && pc.date === '2026-10-05', 'sent as 完了 with Checked on the day it was done');
ok(pc.tags.includes(tag) && pc.tags.includes('カフェ/SHOPをオープンする') && pc.assignee[0] === '礒﨑遼太郎' && pc.content.includes('目標: カフェ') && pc.content.includes('送った回数: 1'), 'row has tag, goal tag, assignee, goal and carry count in 内容');

// ゴール名変更 → タグに反映（既存タグは残す）
await req('PATCH', `/api/goals/${goal.id}`, { title: 'カフェをオープン' });
await req('POST', '/api/notion/sync');
pc = props(await page(created.id));
ok(pc.tags.includes('カフェをオープン') && pc.content.includes('目標: カフェをオープン'), 'goal rename updates Notion');

// 完了を外す → Notion の行を片付ける。もう一度完了 → 新しく送る
await req('PATCH', `/api/tasks/${moved.id}`, { status: 'todo' });
await sleep(1500);
ok((await page(created.id)).archived === true && (await titled('物件の内見')).length === 0, 'unchecking removes (archives) the Notion row');
await req('PATCH', `/api/tasks/${moved.id}`, { status: 'done' });
await sleep(1500);
ok((await titled('物件の内見')).length === 1, 'checking again sends it again');

// 削除 → アーカイブ
await req('DELETE', `/api/tasks/${moved.id}`);
await sleep(1500);
ok((await titled('物件の内見')).length === 0, 'deleting a done task archives the Notion row');

// Notion から選んだ行は状態を送り続ける
await mock(`/_edit/${A}`, { Checked: { checkbox: true } });
let r = await req('POST', '/api/notion/sync');
let day = await req('GET', '/api/days/2026-10-02');
ok(day.tasks.find((x) => x.notion_page_id === A).status === 'done', 'checking in Notion marks a picked task done in the app');
r = await req('POST', '/api/notion/sync');
ok(r.updated === 0, 'echo of own writes is ignored');
const pickedTask = day.tasks.find((x) => x.notion_page_id === A);
await req('PATCH', `/api/tasks/${pickedTask.id}`, { status: 'missed' });
await sleep(1500);
pc = props(await page(A));
ok(pc.status === 'できなかった' && pc.checked === false && !(await page(A)).archived, 'a picked row keeps syncing its status (できなかった), not archived');
const pickedMoved = await req('POST', `/api/tasks/${pickedTask.id}/carry`, { date: '2026-10-07' });
await sleep(1500);
pc = props(await page(A));
ok(pc.date === '2026-10-07' && pc.status === '未着手' && pickedMoved.notion_page_id === A, 'carrying a picked task moves the same Notion row');

// Notion でタグ＋日付付きの新規行
const D = (await mock('/_seed', { Name: T('Notionで追加'), Date: { date: { start: '2026-10-03' } }, 'ステータス': { select: { name: '未着手' } }, 'タグ': { multi_select: [{ name: tag }] } })).id;
r = await req('POST', '/api/notion/sync');
day = await req('GET', '/api/days/2026-10-03');
ok(r.created === 1 && day.tasks[0].title === 'Notionで追加' && day.tasks[0].source === 'notion', 'new tagged row with date is imported');
await mock(`/_edit/${D}`, { Date: { date: { start: '2026-10-04' } }, Name: T('Notionで追加（改）') });
await req('POST', '/api/notion/sync');
day = await req('GET', '/api/days/2026-10-04');
ok(day.tasks[0]?.title === 'Notionで追加（改）', 'date and title changes in Notion move/rename the task');

// 時間があればやることは送らない。上げても、できたにするまでは送らない
const mt = await req('POST', '/api/days/2026-10-06/tasks', { title: 'もしできたら読書', kind: 'might' });
await req('PATCH', `/api/tasks/${mt.id}`, { status: 'done' });
await req('POST', '/api/notion/sync');
ok((await titled('もしできたら読書')).length === 0, 'done might-do items are not sent to Notion');
await req('PATCH', `/api/tasks/${mt.id}`, { status: 'todo' });
await req('POST', `/api/tasks/${mt.id}/promote`);
await sleep(1500);
ok((await titled('もしできたら読書')).length === 0, 'promoted item is not sent until done');
await req('PATCH', `/api/tasks/${mt.id}`, { status: 'done' });
await sleep(1500);
ok((await titled('もしできたら読書')).length === 1, 'promoted item is sent once done');

// 触ってはいけない行
ok(props(await page(Bp)).tags.length === 0 && props(await page(Bp)).status === '今週の対応事項', 'untagged rows are never modified');
st = await req('GET', '/api/notion/status');
ok(st.enabled && st.errors === 0, 'no sync errors');
console.log('ALL OK');
