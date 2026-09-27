// Notion API の簡易モック（テスト専用）
import http from 'node:http';
const pages = new Map();
let n = 0;
const now = () => new Date().toISOString();
function toRead(props) {
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (v.title) out[k] = { title: v.title.map((t) => ({ plain_text: t.text.content })) };
    else if (v.rich_text) out[k] = { rich_text: v.rich_text.map((t) => ({ plain_text: t.text.content })) };
    else if ('select' in v) out[k] = { select: v.select };
    else if (v.multi_select) out[k] = { multi_select: v.multi_select };
    else if ('date' in v) out[k] = { date: v.date };
    else if ('checkbox' in v) out[k] = { checkbox: v.checkbox };
    else if ('url' in v) out[k] = { url: v.url };
  }
  return out;
}
export function seed(props) {
  const id = `page-${++n}`;
  pages.set(id, { id, url: `https://notion.so/${id}`, archived: false, last_edited_time: now(), properties: toRead(props) });
  return id;
}
function match(p, f) {
  if (!f) return true;
  if (f.and) return f.and.every((x) => match(p, x));
  if (f.or) return f.or.some((x) => match(p, x));
  if (f.timestamp === 'last_edited_time') return p.last_edited_time >= f.last_edited_time.on_or_after;
  const prop = p.properties[f.property];
  if (f.multi_select) {
    const names = (prop?.multi_select ?? []).map((x) => x.name);
    if ('contains' in f.multi_select) return names.includes(f.multi_select.contains);
    if ('does_not_contain' in f.multi_select) return !names.includes(f.multi_select.does_not_contain);
  }
  if (f.select) return prop?.select?.name === f.select.equals;
  throw new Error('unsupported filter ' + JSON.stringify(f));
}
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const j = body ? JSON.parse(body) : {};
  const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (!req.headers.authorization?.startsWith('Bearer ')) return send(401, { message: 'unauthorized' });
  const url = new URL(req.url, 'http://x');
  let m;
  if (req.method === 'POST' && (m = url.pathname.match(/^\/databases\/([^/]+)\/query$/))) {
    const results = [...pages.values()].filter((p) => !p.archived && match(p, j.filter));
    return send(200, { results, has_more: false });
  }
  if (req.method === 'POST' && url.pathname === '/pages') {
    const id = seed(j.properties);
    return send(200, pages.get(id));
  }
  if ((m = url.pathname.match(/^\/pages\/([^/]+)$/))) {
    const p = pages.get(m[1]);
    if (!p) return send(404, { message: 'not found' });
    if (req.method === 'GET') return send(200, p);
    if (req.method === 'PATCH') {
      if (j.archived) p.archived = true;
      if (j.properties) Object.assign(p.properties, toRead(j.properties));
      p.last_edited_time = now();
      return send(200, p);
    }
  }
  // テスト操作用
  if (url.pathname === '/_pages') return send(200, [...pages.values()]);
  if (url.pathname === '/_seed') return send(200, { id: seed(j) });
  if ((m = url.pathname.match(/^\/_edit\/([^/]+)$/))) {
    const p = pages.get(m[1]);
    Object.assign(p.properties, toRead(j));
    p.last_edited_time = now();
    return send(200, p);
  }
  send(404, { message: 'no route ' + req.method + ' ' + url.pathname });
});
const PORT = Number(process.env.PORT ?? 9999);
server.listen(PORT, '127.0.0.1', () => console.log('mock notion on ' + PORT));
