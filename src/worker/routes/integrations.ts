import { Hono } from 'hono';
import { isDate } from '../../shared/dates';
import { one, run } from '../db';
import { HttpError, type AppEnv } from '../env';
import { createEvent, deleteEvent, listCalendars, listEvents, updateEvent, type EventInput } from '../google';
import * as notion from '../notion';

export const integrationRoutes = new Hono<AppEnv>();

async function settings(db: D1Database, userId: string) {
  await run(db, 'INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)', userId);
  const s = await one(db, 'SELECT * FROM user_settings WHERE user_id = ?', userId);
  let calendarIds: string[] = ['primary'];
  try {
    calendarIds = JSON.parse(s.calendar_ids_json);
  } catch {}
  return { calendarIds, missedCutoff: s.missed_cutoff as string };
}

integrationRoutes.get('/me', async (c) => {
  const u = c.get('user');
  const g = await one(c.env.DB, 'SELECT refresh_token_enc, scope FROM google_tokens WHERE user_id = ?', u.id);
  return c.json({
    user: u,
    settings: await settings(c.env.DB, u.id),
    googleConnected: !!g?.refresh_token_enc,
    notionEnabled: notion.notionEnabled(c.env),
  });
});

integrationRoutes.put('/settings', async (c) => {
  const u = c.get('user');
  const b = await c.req.json();
  await settings(c.env.DB, u.id);
  if (Array.isArray(b.calendarIds)) {
    const ids = b.calendarIds.filter((x: unknown) => typeof x === 'string').slice(0, 20);
    await run(c.env.DB, 'UPDATE user_settings SET calendar_ids_json = ? WHERE user_id = ?', JSON.stringify(ids.length ? ids : ['primary']), u.id);
  }
  if (['midnight', 'noon'].includes(b.missedCutoff)) {
    await run(c.env.DB, 'UPDATE user_settings SET missed_cutoff = ? WHERE user_id = ?', b.missedCutoff, u.id);
  }
  return c.json(await settings(c.env.DB, u.id));
});

// ---- Googleカレンダー ----
integrationRoutes.get('/calendar/calendars', async (c) => {
  return c.json(await listCalendars(c.env, c.get('user').id));
});

integrationRoutes.get('/calendar/events', async (c) => {
  const u = c.get('user');
  const from = c.req.query('from') ?? c.req.query('date');
  const to = c.req.query('to') ?? from;
  if (!isDate(from) || !isDate(to) || from > to) throw new HttpError(400, '日付が正しくありません');
  const s = await settings(c.env.DB, u.id);
  return c.json(await listEvents(c.env, u.id, s.calendarIds, from, to));
});

function eventInput(b: any): EventInput {
  if (!b.summary || !isDate(b.date)) throw new HttpError(400, 'タイトルと日付を入れてください');
  const time = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : undefined);
  return {
    summary: String(b.summary).slice(0, 300),
    description: typeof b.description === 'string' ? b.description.slice(0, 5000) : '',
    location: typeof b.location === 'string' ? b.location.slice(0, 300) : '',
    date: b.date,
    endDate: isDate(b.endDate) && b.endDate >= b.date ? b.endDate : undefined,
    allDay: !!b.allDay,
    startTime: time(b.startTime),
    endTime: time(b.endTime),
  };
}

integrationRoutes.post('/calendar/events', async (c) => {
  const b = await c.req.json();
  return c.json(await createEvent(c.env, c.get('user').id, b.calendarId || 'primary', eventInput(b)));
});

integrationRoutes.patch('/calendar/events/:calendarId/:eventId', async (c) => {
  const { calendarId, eventId } = c.req.param();
  return c.json(await updateEvent(c.env, c.get('user').id, calendarId, eventId, eventInput(await c.req.json())));
});

integrationRoutes.delete('/calendar/events/:calendarId/:eventId', async (c) => {
  const { calendarId, eventId } = c.req.param();
  await deleteEvent(c.env, c.get('user').id, calendarId, eventId);
  return c.json({ ok: true });
});

// ---- Notion ----
integrationRoutes.get('/notion/status', async (c) => c.json(await notion.status(c.env)));

integrationRoutes.post('/notion/sync', async (c) => {
  if (!notion.notionEnabled(c.env)) throw new HttpError(503, 'Notion が未接続です');
  return c.json(await notion.syncAll(c.env));
});

integrationRoutes.get('/notion/candidates', async (c) => {
  if (!notion.notionEnabled(c.env)) throw new HttpError(503, 'Notion が未接続です');
  return c.json(await notion.candidates(c.env));
});
