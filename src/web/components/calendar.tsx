import { useEffect, useState } from 'react';
import { addDays } from '../../shared/dates';
import { api, del, patch, post } from '../api';
import { useApi } from '../hooks';
import { Modal } from './ui';

export interface CalEvent {
  id: string;
  calendarId: string;
  calendarName: string;
  color: string;
  summary: string;
  description: string;
  location: string;
  allDay: boolean;
  start: string;
  end: string;
  htmlLink: string;
  writable: boolean;
}

const jstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
export const jstTime = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(11, 16);

export function eventsOn(events: CalEvent[], date: string): CalEvent[] {
  return events.filter((e) => (e.allDay ? e.start <= date && date < e.end : jstDate(e.start) <= date && date <= jstDate(e.end)));
}

export function eventTime(e: CalEvent, date?: string): string {
  if (e.allDay) return '終日';
  const s = jstDate(e.start);
  const en = jstDate(e.end);
  if (date && s < date && en > date) return '終日';
  const st = date && s < date ? '〜' : jstTime(e.start);
  const et = date && en > date ? '' : jstTime(e.end);
  return `${st}${et && st !== '〜' ? '–' : ''}${et}`;
}

export function useEvents(from: string, to: string) {
  return useApi<CalEvent[]>(`/calendar/events?from=${from}&to=${to}`);
}

export function CalendarError({ message }: { message: string }) {
  if (message === 'google_reconnect') {
    return (
      <div className="notice">
        Googleカレンダーに接続されていません。
        <a className="btn btn-small" href="/auth/google">Googleに接続</a>
      </div>
    );
  }
  return <div className="notice warn">予定を読み込めませんでした（{message}）</div>;
}

interface CalendarInfo {
  id: string;
  summary: string;
  color: string;
  primary: boolean;
  writable: boolean;
}

export function EventModal({ date, event, onClose, onSaved }: { date: string; event?: CalEvent; onClose: () => void; onSaved: () => void }) {
  const [cals, setCals] = useState<CalendarInfo[]>([]);
  const allDayEnd = event?.allDay ? addDays(event.end, -1) : date;
  const [f, setF] = useState({
    summary: event?.summary ?? '',
    allDay: event?.allDay ?? false,
    date: event ? (event.allDay ? event.start : jstDate(event.start)) : date,
    endDate: event ? (event.allDay ? allDayEnd : jstDate(event.end)) : date,
    startTime: event && !event.allDay ? jstTime(event.start) : '09:00',
    endTime: event && !event.allDay ? jstTime(event.end) : '10:00',
    location: event?.location ?? '',
    description: event?.description ?? '',
    calendarId: event?.calendarId ?? 'primary',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CalendarInfo[]>('/calendar/calendars')
      .then((cs) => {
        setCals(cs.filter((c) => c.writable));
        const p = cs.find((c) => c.primary);
        if (!event && p) setF((x) => ({ ...x, calendarId: p.id }));
      })
      .catch(() => {});
  }, [event]);

  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.summary.trim()) return setError('タイトルを入れてください');
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, endDate: f.endDate < f.date ? f.date : f.endDate };
      if (event) await patch(`/calendar/events/${encodeURIComponent(event.calendarId)}/${encodeURIComponent(event.id)}`, body);
      else await post('/calendar/events', body);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message === 'google_reconnect' ? 'Googleに再接続してください（設定画面）' : e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event || !confirm(`「${event.summary}」をGoogleカレンダーから削除しますか？`)) return;
    setBusy(true);
    try {
      await del(`/calendar/events/${encodeURIComponent(event.calendarId)}/${encodeURIComponent(event.id)}`);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  const readOnly = event && !event.writable;
  return (
    <Modal title={event ? '予定を編集' : '予定を追加'} onClose={onClose}>
      <form className="form" onSubmit={(e) => (e.preventDefault(), save())}>
        <label>
          タイトル
          <input autoFocus value={f.summary} onChange={(e) => set('summary', e.target.value)} disabled={readOnly} />
        </label>
        <label className="inline">
          <input type="checkbox" checked={f.allDay} onChange={(e) => set('allDay', e.target.checked)} disabled={readOnly} />
          終日
        </label>
        <div className="form-row">
          <label>
            {f.allDay ? '開始日' : '日付'}
            <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} disabled={readOnly} />
          </label>
          {f.allDay ? (
            <label>
              終了日
              <input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} disabled={readOnly} />
            </label>
          ) : (
            <>
              <label>
                開始
                <input type="time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} disabled={readOnly} />
              </label>
              <label>
                終了
                <input type="time" value={f.endTime} onChange={(e) => set('endTime', e.target.value)} disabled={readOnly} />
              </label>
            </>
          )}
        </div>
        <label>
          場所
          <input value={f.location} onChange={(e) => set('location', e.target.value)} disabled={readOnly} />
        </label>
        <label>
          メモ
          <textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} disabled={readOnly} />
        </label>
        {!event && cals.length > 1 && (
          <label>
            カレンダー
            <select value={f.calendarId} onChange={(e) => set('calendarId', e.target.value)}>
              {cals.map((c) => (
                <option key={c.id} value={c.id}>{c.summary}</option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          {event?.htmlLink && <a className="btn btn-ghost" href={event.htmlLink} target="_blank" rel="noreferrer">Googleで開く</a>}
          {event && !readOnly && <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>削除</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>キャンセル</button>
          {!readOnly && <button className="btn btn-primary" disabled={busy}>{busy ? '保存中…' : '保存'}</button>}
        </div>
        {readOnly && <p className="muted small">このカレンダーは閲覧のみです。</p>}
      </form>
    </Modal>
  );
}

export function EventLine({ e, date, onClick }: { e: CalEvent; date?: string; onClick?: () => void }) {
  return (
    <button type="button" className="event-line" onClick={onClick}>
      <span className="event-dot" style={{ background: e.color }} aria-hidden="true" />
      <span className="event-time">{eventTime(e, date)}</span>
      <span className="event-title">{e.summary}</span>
      {e.location && <span className="event-loc">{e.location}</span>}
    </button>
  );
}
