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
const tag = 'フィニッシャージャーナル';
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
let rows = await mock('/_pages');
let created = rows.find((p) => props(p).title === '物件の内見');
ok(created && st.dirty === 0, 'app task pushed to Notion automatically');
let pc = props(created);
ok(pc.tags.includes(tag) && pc.tags.includes('カフェ/SHOPをオープンする') && pc.assignee[0] === '礒﨑遼太郎' && pc.content.includes('Day 2') && pc.content.includes('目標: カフェ'), 'new row has tag, goal tag, assignee, Day and goal in 内容');

// Notion 側で完了にする
await mock(`/_edit/${A}`, { Checked: { checkbox: true } });
let r = await req('POST', '/api/notion/sync');
let day = await req('GET', '/api/days/2026-10-02');
ok(day.tasks.find((x) => x.notion_page_id === A).status === 'done', 'checking in Notion marks the task done in the app');
// 自分の書き込みの跳ね返りでは変わらない
r = await req('POST', '/api/notion/sync');
ok(r.updated === 0, 'echo of own writes is ignored');

// Notion でタグ＋日付付きの新規行
const D = (await mock('/_seed', { Name: T('Notionで追加'), Date: { date: { start: '2026-10-03' } }, 'ステータス': { select: { name: '未着手' } }, 'タグ': { multi_select: [{ name: tag }] } })).id;
r = await req('POST', '/api/notion/sync');
day = await req('GET', '/api/days/2026-10-03');
ok(r.created === 1 && day.tasks[0].title === 'Notionで追加' && day.tasks[0].source === 'notion', 'new tagged row with date is imported');
// Notion で日付とタイトルを変更
await mock(`/_edit/${D}`, { Date: { date: { start: '2026-10-04' } }, Name: T('Notionで追加（改）') });
await req('POST', '/api/notion/sync');
day = await req('GET', '/api/days/2026-10-04');
ok(day.tasks[0]?.title === 'Notionで追加（改）', 'date and title changes in Notion move/rename the task');

// アプリで「できなかった」→ Notion
await req('PATCH', `/api/tasks/${t.id}`, { status: 'missed' });
await sleep(1500);
pc = props(await page(created.id));
ok(pc.status === 'できなかった' && pc.checked === false, 'missed in app → ステータス できなかった in Notion');

// 送る → 同じ行の日付が動く（複製しない）
const moved = await req('POST', `/api/tasks/${t.id}/carry`, { date: '2026-10-05' });
await sleep(1500);
pc = props(await page(created.id));
ok(pc.date === '2026-10-05' && pc.status === '未着手' && pc.content.includes('送った回数: 1'), 'carry moves the same Notion row to the new date');
ok((await mock('/_pages')).filter((p) => props(p).title === '物件の内見').length === 1, 'carry does not duplicate the row');

// ゴール名変更 → タグに反映（既存タグは残す）
await req('PATCH', `/api/goals/${goal.id}`, { title: 'カフェをオープン' });
await req('POST', '/api/notion/sync');
pc = props(await page(created.id));
ok(pc.tags.includes('カフェをオープン') && pc.content.includes('目標: カフェをオープン'), 'goal rename updates Notion');

// 削除 → アーカイブ
await req('DELETE', `/api/tasks/${moved.id}`);
await sleep(1500);
ok((await page(created.id)).archived === true, 'deleting a task archives the Notion row');

// 時間があればやることは Notion に送らない。上げたら送る
const mt = await req('POST', '/api/days/2026-10-06/tasks', { title: 'もしできたら読書', kind: 'might' });
await req('POST', '/api/notion/sync');
ok(!(await mock('/_pages')).some((p) => props(p).title === 'もしできたら読書'), 'might-do items are not sent to Notion');
await req('POST', `/api/tasks/${mt.id}/promote`);
await sleep(1500);
ok((await mock('/_pages')).some((p) => props(p).title === 'もしできたら読書'), 'promoted item is sent to Notion');

// 触ってはいけない行
ok(props(await page(Bp)).tags.length === 0 && props(await page(Bp)).status === '今週の対応事項', 'untagged rows are never modified');
st = await req('GET', '/api/notion/status');
ok(st.enabled && st.errors === 0, 'no sync errors');
console.log('ALL OK');
