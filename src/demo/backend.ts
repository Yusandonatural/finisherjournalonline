// デモ版: Worker の API をそのままブラウザ内で動かす。
// DB は sql.js（SQLite の asm.js 版）を D1 風に包み、このブラウザの localStorage に保存する。
import { Hono } from 'hono';
import { addDays, todayJST } from '../shared/dates';
import { HttpError, type AppEnv, type Env } from '../worker/env';
import { dayRoutes } from '../worker/routes/days';
import { integrationRoutes } from '../worker/routes/integrations';
import { termRoutes } from '../worker/routes/terms';
import m1 from '../../migrations/0001_init.sql?raw';
import m2 from '../../migrations/0002_metrics_obstacle_might.sql?raw';
import { seedCalendar, seedData, DEMO_USER } from './seed';

declare const initSqlJs: (opts?: unknown) => Promise<any>;

const DB_KEY = 'fj.demo.db.v1';
const CAL_KEY = 'fj.demo.cal.v1';

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

function toB64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const norm = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

/** sql.js を D1 と同じ呼び方（prepare().bind().first/all/run）で使えるようにする */
function d1(db: any, onWrite: () => void): D1Database {
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const stmt: any = {
      bind(...p: unknown[]) {
        params = p.map(norm);
        return stmt;
      },
      async first() {
        const s = db.prepare(sql);
        try {
          s.bind(params);
          return s.step() ? s.getAsObject() : null;
        } finally {
          s.free();
        }
      },
      async all() {
        const s = db.prepare(sql);
        const results: any[] = [];
        try {
          s.bind(params);
          while (s.step()) results.push(s.getAsObject());
        } finally {
          s.free();
        }
        return { results, success: true, meta: {} };
      },
      async run() {
        db.run(sql, params);
        onWrite();
        return { success: true, meta: { changes: db.getRowsModified() } };
      },
    };
    return stmt;
  };
  return { prepare } as unknown as D1Database;
}

export function resetDemo() {
  store.del(DB_KEY);
  store.del(CAL_KEY);
  for (const k of Object.keys(localStorage)) if (k.startsWith('fj.draft.')) store.del(k);
}

export async function startDemo() {
  const SQL = await initSqlJs();
  const saved = store.get(DB_KEY);
  let db: any;
  if (saved) {
    try {
      db = new SQL.Database(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)));
    } catch {
      db = null;
    }
  }
  if (!db) {
    db = new SQL.Database();
    db.exec(m1);
    db.exec(m2);
    db.exec('BEGIN');
    seedData((sql: string, p: unknown[] = []) => db.run(sql, p.map(norm)));
    db.exec('COMMIT');
    store.set(DB_KEY, toB64(db.export()));
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => store.set(DB_KEY, toB64(db.export())), 400);
  };

  const env = {
    DB: d1(db, save),
    APP_TIMEZONE: 'Asia/Tokyo',
    APP_URL: location.origin,
    ALLOWED_EMAILS: DEMO_USER.email,
    NOTION_TASKS_DB_ID: '',
    NOTION_JOURNAL_TAG: 'フィニッシャージャーナル',
    NOTION_ASSIGNEE: '',
  } as unknown as Env;

  // ---- デモ用のカレンダー（Google の代わりにこのブラウザに保存） ----
  let events: any[] = JSON.parse(store.get(CAL_KEY) ?? 'null') ?? seedCalendar();
  const saveCal = () => store.set(CAL_KEY, JSON.stringify(events));
  saveCal();
  const calendars = [
    { id: 'primary', summary: '個人', color: '#3d6a4d', primary: true, writable: true },
    { id: 'yusando', summary: '悠三堂', color: '#a9853a', primary: false, writable: true },
  ];
  const toEvent = (b: any, base: any = {}) => {
    const allDay = !!b.allDay;
    const end = b.endDate && b.endDate >= b.date ? b.endDate : b.date;
    return {
      ...base,
      summary: String(b.summary ?? '').slice(0, 300) || '（無題）',
      description: b.description ?? '',
      location: b.location ?? '',
      allDay,
      start: allDay ? b.date : `${b.date}T${b.startTime || '09:00'}:00+09:00`,
      end: allDay ? addDays(end, 1) : `${end}T${b.endTime || b.startTime || '10:00'}:00+09:00`,
    };
  };

  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any);
    console.error(err);
    return c.json({ error: 'エラーが起きました' }, 500);
  });
  app.use('/api/*', async (c, next) => {
    c.set('user', DEMO_USER);
    await next();
  });
  app.get('/api/calendar/calendars', (c) => c.json(calendars));
  app.get('/api/calendar/events', (c) => {
    const from = c.req.query('from') ?? c.req.query('date') ?? todayJST();
    const to = c.req.query('to') ?? from;
    const s = `${from}T00:00:00+09:00`;
    const e = `${addDays(to, 1)}T00:00:00+09:00`;
    const hit = events.filter((ev) => (ev.allDay ? ev.start <= to && ev.end > from : ev.start < e && ev.end > s));
    const out = hit
      .map((ev) => {
        const cal = calendars.find((x) => x.id === ev.calendarId) ?? calendars[0];
        return { ...ev, calendarName: cal.summary, color: cal.color, htmlLink: '', writable: true };
      })
      .sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
    return c.json(out);
  });
  app.post('/api/calendar/events', async (c) => {
    const b = await c.req.json();
    const ev = toEvent(b, { id: crypto.randomUUID(), calendarId: b.calendarId === 'yusando' ? 'yusando' : 'primary' });
    events.push(ev);
    saveCal();
    return c.json(ev);
  });
  app.patch('/api/calendar/events/:cal/:id', async (c) => {
    const i = events.findIndex((e) => e.id === c.req.param('id'));
    if (i < 0) throw new HttpError(404, '予定が見つかりません');
    events[i] = toEvent(await c.req.json(), events[i]);
    saveCal();
    return c.json(events[i]);
  });
  app.delete('/api/calendar/events/:cal/:id', (c) => {
    events = events.filter((e) => e.id !== c.req.param('id'));
    saveCal();
    return c.json({ ok: true });
  });
  app.get('/api/me', (c) =>
    c.json({ user: DEMO_USER, settings: { calendarIds: ['primary', 'yusando'], missedCutoff: 'midnight' }, googleConnected: true, notionEnabled: false, demo: true }),
  );
  app.route('/api', termRoutes);
  app.route('/api', dayRoutes);
  app.route('/api', integrationRoutes);

  const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => {}), passThroughOnException() {}, props: {} };
  const origFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url;
    if (url.startsWith('/api/')) {
      const { keepalive: _k, ...rest } = init ?? {};
      return app.fetch(new Request('https://demo.local' + url, rest), env, ctx as any);
    }
    return origFetch(input as any, init);
  }) as typeof fetch;
  // ページを閉じる瞬間の保存もデモ内で受ける
  navigator.sendBeacon = ((url: string, data?: BodyInit | null) => {
    if (!url.startsWith('/api/')) return false;
    void window.fetch(url, { method: 'POST', body: data as any, headers: { 'x-fj': '1' } });
    return true;
  }) as any;
}
