import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { mondayOf, shortDate, todayJST, WEEKDAYS_JA, weekday } from '../../shared/dates';
import { termInfo } from '../../shared/progress';
import { put } from '../api';
import { CalendarError, EventLine, EventModal, eventsOn, useEvents, type CalEvent } from '../components/calendar';
import { ByGoalTable, DoneMissedLists, GoalProgressList, GoodsList, HabitWeekTable, PeriodStats, PlanEditor, ReviewForm, StatusChip, useNote } from '../components/period';
import { ErrorBox, Loading, SaveBadge, SubTabs } from '../components/ui';
import { useApi } from '../hooks';

export function WeekPage({ tab }: { tab: 'plan' | 'review' }) {
  const { start = '' } = useParams();
  const { data, error, reload } = useApi<any>(`/periods/week/${start}`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return <WeekView key={start} data={data} tab={tab} reload={reload} />;
}

function WeekView({ data, tab, reload }: { data: any; tab: 'plan' | 'review'; reload: () => void }) {
  const { start, end, today } = data;
  const { note, update, save } = useNote('week', start, data.note);
  const thisWeek = mondayOf(todayJST());
  const base = `/week/${start}`;

  async function toggleHabit(goalId: string, date: string, done: boolean) {
    await put(`/goals/${goalId}/habit/${date}`, { done });
    reload();
  }

  return (
    <div className="page">
      <header className="period-header">
        <Link className="icon-btn" to={`/week/${data.prev}${tab === 'review' ? '/review' : ''}`} aria-label="前の週">‹</Link>
        <div>
          <h1 className="page-title">{shortDate(start)}〜{shortDate(end)} の週</h1>
          {data.term && <p className="muted small">{data.term.title}{dayRange(data.term, start, end)}</p>}
        </div>
        <Link className="icon-btn" to={`/week/${data.next}${tab === 'review' ? '/review' : ''}`} aria-label="次の週">›</Link>
      </header>
      <div className="period-toolbar">
        <SubTabs items={[
          { to: base, label: '週間予定', active: tab === 'plan' },
          { to: `${base}/review`, label: '週間レビュー', active: tab === 'review' },
        ]} />
        <span className="spacer" />
        {start !== thisWeek && <Link className="btn btn-small" to={`/week/${thisWeek}${tab === 'review' ? '/review' : ''}`}>今週へ</Link>}
        <SaveBadge state={save.state} />
      </div>

      {tab === 'plan' ? (
        <>
          <div className="plan-grid">
            <PlanEditor note={note} update={update} unit="週" prevNext={data.prevNote.review_next} />
            <section className="card">
              <h2 className="card-title">3ヶ月の目標</h2>
              <GoalProgressList goals={data.goals} />
            </section>
          </div>
          <WeekDays data={data} today={today} />
          {data.habits.length > 0 && (
            <section className="card">
              <h2 className="card-title">今週の習慣</h2>
              <HabitWeekTable habits={data.habits} onToggle={toggleHabit} />
            </section>
          )}
        </>
      ) : (
        <>
          <PeriodStats data={data} unit="週" />
          {note.targets.length > 0 && (
            <section className="card">
              <h2 className="card-title">今週の目標の結果</h2>
              <ul className="plain-list">
                {note.targets.map((t, i) => (
                  <li key={i}>
                    <label className="check">
                      <input type="checkbox" checked={t.done} onChange={(e) => update({ targets: note.targets.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) }, true)} />
                      <span className={t.done ? 'done' : ''}>{t.text || '（空欄）'}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="two-col">
            <section className="card">
              <h2 className="card-title">目標別</h2>
              <ByGoalTable rows={data.byGoal} />
            </section>
            <section className="card">
              <h2 className="card-title">習慣</h2>
              <HabitWeekTable habits={data.habits} />
              {data.habits.length === 0 && <p className="muted">習慣目標はまだありません</p>}
            </section>
          </div>
          <DoneMissedLists days={data.days} today={today} onChange={reload} />
          <GoodsList days={data.days} />
          <ReviewForm note={note} update={update} nextLabel="来週に活かすこと" state={save.state} />
          <p className="next-link"><Link className="btn" to={`/week/${data.next}`}>来週の予定を立てる →</Link></p>
        </>
      )}
    </div>
  );
}

export function dayRange(term: any, start: string, end: string) {
  const a = termInfo(term, start < term.start_date ? term.start_date : start).dayNumber;
  const b = termInfo(term, end > term.end_date ? term.end_date : end).dayNumber;
  return a && b ? ` ・ Day ${a}〜${b}` : '';
}

function WeekDays({ data, today }: { data: any; today: string }) {
  const { data: events, error, reload } = useEvents(data.start, data.end);
  const [edit, setEdit] = useState<{ event?: CalEvent; date: string } | null>(null);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">今週のスケジュールとタスク</h2>
      </div>
      {error && <CalendarError message={error} />}
      <div className="week-grid">
        {data.days.map((d: any) => (
          <div key={d.date} className={`week-day ${d.date === today ? 'today' : ''} ${weekday(d.date) === 0 ? 'sun' : weekday(d.date) === 6 ? 'sat' : ''}`}>
            <div className="week-day-head">
              <Link to={`/day/${d.date}`}>
                <span className="wd">{WEEKDAYS_JA[weekday(d.date)]}</span> {shortDate(d.date)}
              </Link>
              {d.completed && <span className="chip chip-good" title="記入完了">✓</span>}
              <button type="button" className="icon-btn small" aria-label={`${shortDate(d.date)} に予定を追加`} onClick={() => setEdit({ date: d.date })}>＋</button>
            </div>
            {d.focus && <p className="week-focus">{d.focus}</p>}
            <div className="events compact">
              {events && eventsOn(events, d.date).map((e) => (
                <EventLine key={e.calendarId + e.id} e={e} date={d.date} onClick={() => setEdit({ event: e, date: d.date })} />
              ))}
            </div>
            <ul className="week-tasks">
              {d.tasks.filter((t: any) => t.status !== 'dropped').map((t: any) => (
                <li key={t.id} className={`status-${t.status}`}>
                  <span className="dot" aria-hidden="true" />
                  <span className="t">{t.title}</span>
                  {t.status === 'missed' && <StatusChip status={t.status} />}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {edit && <EventModal date={edit.date} event={edit.event} onClose={() => setEdit(null)} onSaved={reload} />}
    </section>
  );
}
