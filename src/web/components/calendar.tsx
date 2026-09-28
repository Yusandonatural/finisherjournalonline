import { useEffect, useRef, useState } from 'react';
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

export function EventModal({ date, event, time, onClose, onSaved }: { date: string; event?: CalEvent; time?: string; onClose: () => void; onSaved: () => void }) {
  const [cals, setCals] = useState<CalendarInfo[]>([]);
  const allDayEnd = event?.allDay ? addDays(event.end, -1) : date;
  const [f, setF] = useState({
    summary: event?.summary ?? '',
    allDay: event?.allDay ?? false,
    date: event ? (event.allDay ? event.start : jstDate(event.start)) : date,
    endDate: event ? (event.allDay ? allDayEnd : jstDate(event.end)) : date,
    startTime: event && !event.allDay ? jstTime(event.start) : time ?? '09:00',
    endTime: event && !event.allDay ? jstTime(event.end) : time ? `${String(Math.min(23, Number(time.slice(0, 2)) + 1)).padStart(2, '0')}:${time.slice(3)}` : '10:00',
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

const HOUR_PX = 44;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Googleカレンダーの「日」表示のような1日のタイムライン。空いている時間を押すとその時刻で予定を作る */
export function DayTimeline({ date, events, today, onEdit, onCreate }: {
  date: string;
  events: CalEvent[];
  today: string;
  onEdit: (e: CalEvent) => void;
  onCreate: (time: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const day = eventsOn(events, date);
  const allDay = day.filter((e) => e.allDay || (jstDate(e.start) < date && jstDate(e.end) > date));
  const timed = day
    .filter((e) => !allDay.includes(e))
    .map((e) => ({
      e,
      s: jstDate(e.start) < date ? 0 : toMin(jstTime(e.start)),
      en: jstDate(e.end) > date ? 24 * 60 : Math.max(toMin(jstTime(e.end)), toMin(jstTime(e.start)) + 15),
    }))
    .sort((a, b) => a.s - b.s || b.en - a.en);

  // 重なる予定を横に並べる
  const placed: { e: CalEvent; s: number; en: number; lane: number; lanes: number }[] = [];
  let cluster: typeof placed = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = n));
    placed.push(...cluster);
    cluster = [];
  };
  for (const t of timed) {
    if (t.s >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.en > t.s).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ ...t, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, t.en);
  }
  flush();

  const startHour = Math.min(6, ...timed.map((t) => Math.floor(t.s / 60)));
  const hours = Array.from({ length: 24 - startHour }, (_, i) => startHour + i);
  const nowJst = new Date(Date.now() + 9 * 3600_000);
  const nowMin = nowJst.getUTCHours() * 60 + nowJst.getUTCMinutes();
  const isToday = date === today;

  useEffect(() => {
    // 今の時刻（今日以外は最初の予定か8時）が見えるようにスクロール
    const target = isToday ? nowMin / 60 - 1.5 : (timed[0] ? timed[0].s / 60 : 8) - 0.5;
    if (ref.current) ref.current.scrollTop = Math.max(0, (target - startHour) * HOUR_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, events.length]);

  const y = (min: number) => ((min - startHour * 60) / 60) * HOUR_PX;

  return (
    <div className="timeline">
      {allDay.length > 0 && (
        <div className="tl-allday">
          {allDay.map((e) => (
            <button key={e.calendarId + e.id} type="button" className="tl-chip" style={{ background: e.color }} onClick={() => onEdit(e)}>
              {e.summary}
            </button>
          ))}
        </div>
      )}
      <div className="tl-scroll" ref={ref}>
        <div className="tl-grid" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((h) => (
            <button
              key={h}
              type="button"
              className="tl-hour"
              style={{ top: y(h * 60), height: HOUR_PX }}
              onClick={() => onCreate(`${String(h).padStart(2, '0')}:00`)}
              aria-label={`${h}時に予定を追加`}
            >
              <span className="tl-label">{h}:00</span>
            </button>
          ))}
          <div className="tl-events">
            {placed.map(({ e, s, en, lane, lanes }) => (
              <button
                key={e.calendarId + e.id}
                type="button"
                className={`tl-event ${en - s < 45 ? 'short' : ''}`}
                style={{
                  top: y(s) + 1,
                  height: Math.max(18, ((en - s) / 60) * HOUR_PX - 2),
                  left: `calc(${(lane / lanes) * 100}% + 1px)`,
                  width: `calc(${100 / lanes}% - 3px)`,
                  background: e.color,
                }}
                onClick={() => onEdit(e)}
                title={`${eventTime(e, date)} ${e.summary}`}
              >
                <span className="tl-title">{e.summary}</span>
                <span className="tl-time">{eventTime(e, date)}{e.location ? ` ・ ${e.location}` : ''}</span>
              </button>
            ))}
          </div>
          {isToday && nowMin >= startHour * 60 && <div className="tl-now" style={{ top: y(nowMin) }} aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
}
