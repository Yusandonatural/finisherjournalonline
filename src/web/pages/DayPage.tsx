import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDays, longDate, mondayOf } from '../../shared/dates';
import { put } from '../api';
import { CalendarError, DayTimeline, EventLine, EventModal, eventsOn, useEvents, type CalEvent } from '../components/calendar';
import { GoalPanel, GoalStrip } from '../components/GoalPanel';
import { NotionPicker } from '../components/NotionPicker';
import { EmptyTaskSlot, MightList, TaskRow, type Task } from '../components/TaskRow';
import { ErrorBox, Loading, SaveBadge, pct } from '../components/ui';
import { useApi, useAutosave, useLocalFlag } from '../hooks';

export function DayPage() {
  const { date = '' } = useParams();
  return <DayView key={date} date={date} />;
}

function DayView({ date }: { date: string }) {
  const nav = useNavigate();
  const { data, error, reload, setData } = useApi<any>(`/days/${date}`);
  const [goalsOpen, setGoalsOpen] = useLocalFlag('fj.goalsOpen', true);
  const [picker, setPicker] = useState(false);
  const [form, setForm] = useState<{ focus: string; memo: string; goods: string[] } | null>(null);
  const save = useAutosave((v: any) => put(`/days/${date}`, v), 1000, `/api/days/${date}`, `fj.draft.day.${date}`);
  const swipe = useRef(0);
  const cal = useEvents(date, addDays(date, 1));
  const [editEvent, setEditEvent] = useState<{ event?: CalEvent; date: string; time?: string } | null>(null);

  useEffect(() => {
    if (data && !form) {
      const draft = save.takeDraft() ?? {};
      setForm({ focus: data.entry.focus, memo: data.entry.memo, goods: data.entry.goods, ...draft });
    }
  }, [data, form, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') nav(`/day/${addDays(date, -1)}`);
      if (e.key === 'ArrowRight') nav(`/day/${addDays(date, 1)}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [date, nav]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || !form) return <Loading />;

  const { term, today, tasks } = data;
  const info = term?.info;
  const main: Task[] = tasks.filter((t: Task) => t.position <= 3 && t.status !== 'carried');
  const carried: Task[] = tasks.filter((t: Task) => t.status === 'carried');
  const extra: Task[] = tasks.filter((t: Task) => t.position > 3 && t.status !== 'carried');
  const projectGoals = data.goals.filter((g: any) => g.type === 'project').map((g: any) => ({ id: g.id, title: g.title }));
  const freeSlots = [1, 2, 3].filter((p) => !main.some((t) => t.position === p));

  const update = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    save.schedule(patch);
  };

  async function toggleComplete() {
    await save.flush();
    await put(`/days/${date}`, { completed: !data.entry.completed });
    setData({ ...data, entry: { ...data.entry, completed: !data.entry.completed } });
  }

  const s = data.termStats;

  return (
    <div
      className="page day-page"
      onTouchStart={(e) => (swipe.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - swipe.current;
        if ((e.target as HTMLElement).closest('input, textarea, select, .no-swipe')) return;
        if (Math.abs(dx) > 90) nav(`/day/${addDays(date, dx > 0 ? -1 : 1)}`);
      }}
    >
      <header className="day-header">
        <Link className="icon-btn" to={`/day/${addDays(date, -1)}`} aria-label="前の日">‹</Link>
        <div className="day-heading">
          <h1>{longDate(date)}</h1>
          <p className="day-meta">
            {term && info?.dayNumber && <strong>Day {info.dayNumber} / {info.totalDays}</strong>}
            {term && info?.phase === 'upcoming' && <strong>開始まであと {info.daysUntilStart}日</strong>}
            {term && <span>{term.title}</span>}
            {term && info?.phase === 'active' && <span>残り {info.daysLeft}日</span>}
          </p>
          {term && info?.phase === 'active' && (
            <div className="day-progress" role="progressbar" aria-label="タームの経過" aria-valuenow={info.elapsedPct} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${info.elapsedPct}%` }} />
            </div>
          )}
        </div>
        <Link className="icon-btn" to={`/day/${addDays(date, 1)}`} aria-label="次の日">›</Link>
      </header>
      <div className="day-toolbar">
        {date !== today && <Link className="btn btn-small" to={`/day/${today}`}>今日へ</Link>}
        <Link className="btn btn-small btn-ghost" to={`/week/${mondayOf(date)}`}>この週</Link>
        <span className="spacer" />
        <SaveBadge state={save.state} />
      </div>

      <div className="day-grid">
        <aside className="day-aside">
          <section className="card timeline-card desktop-only no-swipe">
            <div className="card-head">
              <h2 className="card-title">1日の予定</h2>
              <button className="btn btn-small" onClick={() => setEditEvent({ date })}>＋ 追加</button>
            </div>
            {cal.error ? <CalendarError message={cal.error} /> : cal.data ? (
              <DayTimeline date={date} today={today} events={cal.data} onEdit={(e) => setEditEvent({ event: e, date })} onCreate={(time) => setEditEvent({ date, time })} />
            ) : <p className="muted small">読み込み中…</p>}
          </section>
          <details className="card goals-card desktop-only" open={goalsOpen} onToggle={(e) => setGoalsOpen((e.target as HTMLDetailsElement).open)}>
            <summary>
              <span className="card-title">今タームの目標</span>
              {info && <span className="muted small">経過 {info.elapsedPct}%</span>}
            </summary>
            <GoalPanel goals={data.goals} termId={term?.id} date={date} onChange={() => { setData({ ...data }); reload(); }} editable={!!term?.inTerm} />
          </details>
        </aside>

        <div className="day-main">
          <GoalStrip
            goals={data.goals}
            termId={term?.id}
            date={date}
            elapsedPct={info?.phase === 'active' ? info.elapsedPct : undefined}
            vision={data.life?.vision}
            onChange={() => { setData({ ...data }); reload(); }}
            editable={!!term?.inTerm}
          />
          <ScheduleCard date={date} today={today} cal={cal} onEdit={setEditEvent} />

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">今日やるべきこと 3つ</h2>
              {data.notionEnabled && freeSlots.length > 0 && (
                <button className="btn btn-small btn-ghost" onClick={() => setPicker(true)}>Notionから選ぶ</button>
              )}
            </div>
            <div className="task-list">
              {[1, 2, 3].map((p) => {
                const t = main.find((x) => x.position === p);
                return t ? (
                  <TaskRow key={t.id} task={t} today={today} goals={projectGoals} onChange={reload} />
                ) : (
                  <EmptyTaskSlot key={`e${p}`} date={date} position={p} goals={projectGoals} onCreated={reload} />
                );
              })}
            </div>
            {extra.length > 0 && (
              <>
                <h3 className="mini-title">Notion から追加された分</h3>
                <div className="task-list">
                  {extra.map((t) => (
                    <TaskRow key={t.id} task={t} today={today} goals={projectGoals} onChange={reload} />
                  ))}
                </div>
              </>
            )}
            {data.notionEnabled && <p className="muted small">「できた」にしたタスクは Notion の Todo リストに完了として記録されます。</p>}
            {carried.length > 0 && (
              <p className="muted small">他の日へ送ったもの: {carried.map((t) => t.title).join('、')}</p>
            )}
            {term && (
              <p className="term-rate">
                今タームの達成率 <strong>{pct(s.rate)}</strong>
                <span className="muted">（できた {s.done} ／ できなかった {s.missed + s.carried} ／ 未着手 {s.todo}）</span>
                <Link to={`/term/${term.id}/tasks`}>台帳を見る</Link>
              </p>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">時間があればやること</h2>
              <span className="muted small">できなくても「できなかった」にはなりません</span>
            </div>
            <MightList date={date} today={today} tasks={data.might ?? []} onChange={reload} />
          </section>

          <section className="card">
            <h2 className="card-title">今日、集中すべきこと</h2>
            <input className="big-input" value={form.focus} placeholder="ひとつだけ" onChange={(e) => update({ focus: e.target.value })} />
          </section>

          <section className="card">
            <h2 className="card-title">良かったこと</h2>
            <ol className="goods">
              {form.goods.map((g, i) => (
                <li key={i}>
                  <input
                    value={g}
                    placeholder={`良かったこと ${i + 1}`}
                    onChange={(e) => update({ goods: form.goods.map((x, j) => (j === i ? e.target.value : x)) })}
                   
                  />
                </li>
              ))}
            </ol>
            {form.goods.every((g) => g.trim()) && <p className="celebrate">3つそろいました。いい一日でしたね。</p>}
          </section>

          <section className="card">
            <h2 className="card-title">一言日記</h2>
            <textarea className="memo" rows={3} value={form.memo} placeholder="今日をひとことで" aria-label="一言日記" onChange={(e) => update({ memo: e.target.value })} />
          </section>

          <div className="complete-bar">
            <button className={`btn ${data.entry.completed ? 'btn-done' : 'btn-primary'}`} onClick={toggleComplete}>
              {data.entry.completed ? '✓ 今日の記入を完了しました' : '今日の記入を完了'}
            </button>
          </div>
        </div>
      </div>

      {picker && <NotionPicker date={date} onClose={() => setPicker(false)} onPicked={reload} />}
      {editEvent && <EventModal date={editEvent.date} event={editEvent.event} time={editEvent.time} onClose={() => setEditEvent(null)} onSaved={cal.reload} />}
    </div>
  );
}

function ScheduleCard({ date, today, cal, onEdit }: {
  date: string;
  today: string;
  cal: ReturnType<typeof useEvents>;
  onEdit: (v: { event?: CalEvent; date: string; time?: string }) => void;
}) {
  const tomorrow = addDays(date, 1);
  const { data, error } = cal;
  const [timeline, setTimeline] = useLocalFlag('fj.scheduleTimeline', false);
  const todays = data ? eventsOn(data, date) : [];
  const tomorrows = data ? eventsOn(data, tomorrow) : [];
  return (
    <section className="card no-swipe">
      <div className="card-head">
        <h2 className="card-title">今日のスケジュール</h2>
        <span className="row">
          <span className="seg mobile-only" role="group" aria-label="表示">
            <button type="button" className={timeline ? '' : 'active'} onClick={() => setTimeline(false)}>リスト</button>
            <button type="button" className={timeline ? 'active' : ''} onClick={() => setTimeline(true)}>時間割</button>
          </span>
          <button className="btn btn-small" onClick={() => onEdit({ date })}>＋ 予定を追加</button>
        </span>
      </div>
      {error && <CalendarError message={error} />}
      {!data && !error && <p className="muted small">読み込み中…</p>}
      {data && timeline && (
        <div className="mobile-only">
          <DayTimeline date={date} today={today} events={data} onEdit={(e) => onEdit({ event: e, date })} onCreate={(time) => onEdit({ date, time })} />
        </div>
      )}
      <div className={timeline ? 'desktop-block' : ''}>
        {data && todays.length === 0 && <p className="muted">予定はありません</p>}
        <div className="events">
          {todays.map((e) => (
            <EventLine key={e.calendarId + e.id} e={e} date={date} onClick={() => onEdit({ event: e, date })} />
          ))}
        </div>
      </div>
      {data && (
        <details className="tomorrow">
          <summary>明日の予定（{tomorrows.length}件）</summary>
          <div className="events">
            {tomorrows.map((e) => (
              <EventLine key={e.calendarId + e.id} e={e} date={tomorrow} onClick={() => onEdit({ event: e, date: tomorrow })} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
