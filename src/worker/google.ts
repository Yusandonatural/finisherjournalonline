import { addDays } from '../shared/dates';
import { decrypt } from './crypto';
import { one, run } from './db';
import { HttpError, type Env } from './env';

const CAL = 'https://www.googleapis.com/calendar/v3';
const TZ = 'Asia/Tokyo';

async function accessToken(env: Env, userId: string): Promise<string> {
  const row = await one(env.DB, 'SELECT * FROM google_tokens WHERE user_id = ?', userId);
  if (!row) throw new HttpError(409, 'google_reconnect');
  if (row.access_token && row.access_expires_at > Date.now() + 60_000) return row.access_token;
  if (!row.refresh_token_enc || !env.TOKEN_ENC_KEY) throw new HttpError(409, 'google_reconnect');
  const refresh = await decrypt(env.TOKEN_ENC_KEY, row.refresh_token_enc);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: env.GOOGLE_CLIENT_SECRET!.trim(),
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new HttpError(409, 'google_reconnect');
  const tok = (await res.json()) as any;
  await run(
    env.DB,
    "UPDATE google_tokens SET access_token = ?, access_expires_at = ?, updated_at = datetime('now') WHERE user_id = ?",
    tok.access_token, Date.now() + (tok.expires_in ?? 3600) * 1000, userId,
  );
  return tok.access_token;
}

async function gcal(env: Env, userId: string, method: string, path: string, body?: unknown) {
  const token = await accessToken(env, userId);
  const res = await fetch(CAL + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new HttpError(409, 'google_reconnect');
  if (res.status === 204) return null;
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new HttpError(502, `Googleカレンダー: ${json?.error?.message ?? res.status}`);
  return json;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  color: string;
  primary: boolean;
  writable: boolean;
}

export async function listCalendars(env: Env, userId: string): Promise<CalendarInfo[]> {
  const r = await gcal(env, userId, 'GET', '/users/me/calendarList?maxResults=250');
  return (r.items ?? []).map((c: any) => ({
    id: c.id,
    summary: c.summaryOverride ?? c.summary,
    color: c.backgroundColor ?? '#7a8b6f',
    primary: !!c.primary,
    writable: c.accessRole === 'owner' || c.accessRole === 'writer',
  }));
}

export interface CalEvent {
  id: string;
  calendarId: string;
  calendarName: string;
  color: string;
  summary: string;
  description: string;
  location: string;
  allDay: boolean;
  start: string; // 終日: YYYY-MM-DD / 時刻あり: ISO
  end: string; // 終日の end は Google と同じく「翌日」（排他的）
  htmlLink: string;
  writable: boolean;
}

export async function listEvents(env: Env, userId: string, calendarIds: string[], from: string, to: string): Promise<CalEvent[]> {
  const cals = await listCalendars(env, userId);
  const byId = new Map(cals.map((c) => [c.id, c]));
  const primary = cals.find((c) => c.primary);
  const ids = calendarIds.map((id) => (id === 'primary' && primary ? primary.id : id)).filter((id) => byId.has(id));
  const q = new URLSearchParams({
    timeMin: `${from}T00:00:00+09:00`,
    timeMax: `${addDays(to, 1)}T00:00:00+09:00`,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
    timeZone: TZ,
  });
  const lists = await Promise.all(
    ids.map(async (id) => {
      const r = await gcal(env, userId, 'GET', `/calendars/${encodeURIComponent(id)}/events?${q}`);
      const cal = byId.get(id)!;
      return (r.items ?? [])
        .filter((e: any) => e.status !== 'cancelled')
        .map(
          (e: any): CalEvent => ({
            id: e.id,
            calendarId: id,
            calendarName: cal.summary,
            color: cal.color,
            summary: e.summary ?? '（無題）',
            description: e.description ?? '',
            location: e.location ?? '',
            allDay: !!e.start?.date,
            start: e.start?.date ?? e.start?.dateTime,
            end: e.end?.date ?? e.end?.dateTime,
            htmlLink: e.htmlLink ?? '',
            writable: cal.writable,
          }),
        );
    }),
  );
  return lists.flat().sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
}

export interface EventInput {
  summary: string;
  description?: string;
  location?: string;
  date: string;
  endDate?: string;
  allDay: boolean;
  startTime?: string; // HH:MM
  endTime?: string;
}

function toGoogle(input: EventInput) {
  const body: any = { summary: input.summary, description: input.description ?? '', location: input.location ?? '' };
  if (input.allDay) {
    body.start = { date: input.date };
    body.end = { date: addDays(input.endDate ?? input.date, 1) };
  } else {
    const st = input.startTime || '09:00';
    const et = input.endTime || st;
    body.start = { dateTime: `${input.date}T${st}:00`, timeZone: TZ };
    body.end = { dateTime: `${input.endDate ?? input.date}T${et}:00`, timeZone: TZ };
  }
  return body;
}

export async function createEvent(env: Env, userId: string, calendarId: string, input: EventInput) {
  return gcal(env, userId, 'POST', `/calendars/${encodeURIComponent(calendarId)}/events`, toGoogle(input));
}

export async function updateEvent(env: Env, userId: string, calendarId: string, eventId: string, input: EventInput) {
  return gcal(
    env, userId, 'PATCH',
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    toGoogle(input),
  );
}

export async function deleteEvent(env: Env, userId: string, calendarId: string, eventId: string) {
  return gcal(env, userId, 'DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
}
