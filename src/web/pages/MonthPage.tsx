import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDays, daysInRange, mondayOf, monthStart, shortDate, todayJST, WEEKDAYS_JA, weekday } from '../../shared/dates';
import { CalendarError, EventModal, eventsOn, eventTime, useEvents, type CalEvent } from '../components/calendar';
import { ByGoalTable, DoneMissedLists, GoalProgressList, GoodsList, PeriodStats, PlanEditor, ReviewForm, useNote } from '../components/period';
import { ErrorBox, Loading, SaveBadge, SubTabs, pct } from '../components/ui';
import { useApi } from '../hooks';
import { dayRange } from './WeekPage';

export function MonthPage({ tab }: { tab: 'plan' | 'review' }) {
  const { start = '' } = useParams();
  const { data, error, reload } = useApi<any>(`/periods/month/${start}`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return <MonthView key={start} data={data} tab={tab} reload={reload} />;
}

const monthLabel = (d: string) => `${Number(d.slice(0, 4))}年${Number(d.slice(5, 7))}月`;

function MonthView({ data, tab, reload }: { data: any; tab: 'plan' | 'review'; reload: () => void }) {
  const { start, end, today } = data;
  const { note, update, save } = useNote('month', start, data.note);
  const thisMonth = monthStart(todayJST());
  const base = `/month/${start}`;
  const suffix = tab === 'review' ? '/review' : '';

  return (
    <div className="page">
      <header className="period-header">
        <Link className="icon-btn" to={`/month/${data.prev}${suffix}`} aria-label="前の月">‹</Link>
        <div>
          <h1 className="page-title">{monthLabel(start)}</h1>
          {data.term && <p className="muted small">{data.term.title}{dayRange(data.term, start, end)}</p>}
        </div>
        <Link className="icon-btn" to={`/month/${data.next}${suffix}`} aria-label="次の月">›</Link>
      </header>
      <div className="period-toolbar">
        <SubTabs items={[
          { to: base, label: '月間予定', active: tab === 'plan' },
          { to: `${base}/review`, label: '月間レビュー', active: tab === 'review' },
        ]} />
        <span className="spacer" />
        {start !== thisMonth && <Link className="btn btn-small" to={`/month/${thisMonth}${suffix}`}>今月へ</Link>}
        <SaveBadge state={save.state} />
      </div>

      {tab === 'plan' ? (
        <>
          <div className="plan-grid">
            <PlanEditor note={note} update={update} unit="月" prevNext={data.prevNote.review_next} />
            <section className="card">
              <h2 className="card-title">3ヶ月の目標</h2>
              <GoalProgressList goals={data.goals} />
            </section>
          </div>
          <MonthGrid data={data} today={today} />
          <WeeksList weeks={data.weeks} />
        </>
      ) : (
        <>
          <PeriodStats data={data} unit="月" />
          {note.targets.length > 0 && (
            <section className="card">
              <h2 className="card-title">今月の目標の結果</h2>
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
          <WeeksList weeks={data.weeks} review />
          <div className="two-col">
            <section className="card">
              <h2 className="card-title">目標別</h2>
              <ByGoalTable rows={data.byGoal} />
            </section>
            <section className="card">
              <h2 className="card-title">習慣</h2>
              {data.habits.length === 0 && <p className="muted">習慣目標はまだありません</p>}
              <table className="simple-table">
                <tbody>
                  {data.habits.map((h: any) => (
                    <tr key={h.id}>
                      <td>{h.title}</td>
                      <td className="num">{h.done} / {h.target}回</td>
                      <td className="num">{h.target ? `${Math.round((h.done / h.target) * 100)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
          <section className="card">
            <h2 className="card-title">3ヶ月の目標の進み具合</h2>
            <GoalProgressList goals={data.goals} />
          </section>
          <DoneMissedLists days={data.days} today={today} onChange={reload} />
          <GoodsList days={data.days} />
          <ReviewForm note={note} update={update} nextLabel="来月に活かすこと" state={save.state} />
          <p className="next-link"><Link className="btn" to={`/month/${data.next}`}>来月の予定を立てる →</Link></p>
        </>
      )}
    </div>
  );
}

function MonthGrid({ data, today }: { data: any; today: string }) {
  const gridStart = mondayOf(data.start);
  const gridEnd = addDays(mondayOf(data.end), 6);
  const { data: events, error, reload } = useEvents(data.start, data.end);
  const [edit, setEdit] = useState<{ event?: CalEvent; date: string } | null>(null);
  const byDate = new Map(data.days.map((d: any) => [d.date, d]));
  return (
    <section className="card">
      <h2 className="card-title">月間スケジュール</h2>
      {error && <CalendarError message={error} />}
      <div className="month-grid" role="grid">
        {['月', '火', '水', '木', '金', '土', '日'].map((w) => (
          <div key={w} className="month-wd" role="columnheader">{w}</div>
        ))}
        {daysInRange(gridStart, gridEnd).map((date) => {
          const d: any = byDate.get(date);
          if (!d) return <div key={date} className="month-cell out" />;
          const evs = events ? eventsOn(events, date) : [];
          const tasks = d.tasks.filter((t: any) => t.status !== 'dropped');
          return (
            <div key={date} className={`month-cell ${date === today ? 'today' : ''} ${d.completed ? 'filled' : ''}`} role="gridcell">
              <div className="month-cell-head">
                <Link to={`/day/${date}`} className={`month-num ${weekday(date) === 0 ? 'sun' : weekday(date) === 6 ? 'sat' : ''}`} aria-label={`${shortDate(date)}（${WEEKDAYS_JA[weekday(date)]}）のページ`}>
                  {Number(date.slice(8))}
                </Link>
                <button type="button" className="icon-btn small add" aria-label={`${shortDate(date)} に予定を追加`} onClick={() => setEdit({ date })}>＋</button>
              </div>
              <ul className="month-events">
                {evs.slice(0, 3).map((e) => (
                  <li key={e.calendarId + e.id}>
                    <button type="button" onClick={() => setEdit({ event: e, date })} title={`${eventTime(e, date)} ${e.summary}`}>
                      <span className="event-dot" style={{ background: e.color }} />
                      {e.summary}
                    </button>
                  </li>
                ))}
                {evs.length > 3 && <li className="muted small">ほか{evs.length - 3}件</li>}
              </ul>
              {tasks.length > 0 && (
                <div className="task-dots" aria-label={`タスク ${tasks.length}件`}>
                  {tasks.map((t: any) => (
                    <span key={t.id} className={`dot status-${t.status}`} title={t.title} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="legend muted small">
        <span className="dot status-done" /> できた <span className="dot status-missed" /> できなかった <span className="dot status-todo" /> 未着手 ・ 枠が緑の日は記入完了
      </p>
      {edit && <EventModal date={edit.date} event={edit.event} onClose={() => setEdit(null)} onSaved={reload} />}
    </section>
  );
}

function WeeksList({ weeks, review }: { weeks: any[]; review?: boolean }) {
  return (
    <section className="card">
      <h2 className="card-title">{review ? '週ごとのふりかえり' : 'この月の週'}</h2>
      <table className="simple-table">
        <thead>
          <tr><th>週</th><th>テーマ</th><th>達成率</th>{review && <th>評価</th>}<th>レビュー</th></tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.start}>
              <td><Link to={`/week/${w.start}`}>{shortDate(w.start)}〜</Link></td>
              <td>{w.note.theme || <span className="muted">—</span>}</td>
              <td className="num">{pct(w.stats.rate)}</td>
              {review && <td>{w.note.review_score ? <span className="stars-text">{'★'.repeat(w.note.review_score)}</span> : <span className="muted">—</span>}</td>}
              <td><Link to={`/week/${w.start}/review`}>{w.note.reviewed ? '✓ 済み' : 'まだ'}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
