import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDays, longDate, mondayOf } from '../../shared/dates';
import { put } from '../api';
import { CalendarError, EventLine, EventModal, eventsOn, useEvents, type CalEvent } from '../components/calendar';
import { GoalPanel } from '../components/GoalPanel';
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
          <details className="card goals-card" open={goalsOpen} onToggle={(e) => setGoalsOpen((e.target as HTMLDetailsElement).open)}>
            <summary>
              <span className="card-title">今タームの目標</span>
              {info && <span className="muted small">経過 {info.elapsedPct}%</span>}
            </summary>
            <GoalPanel goals={data.goals} termId={term?.id} date={date} onChange={() => { setData({ ...data }); reload(); }} editable={!!term?.inTerm} />
          </details>
        </aside>

        <div className="day-main">
          <ScheduleCard date={date} />

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
            <h2 className="card-title">メモ</h2>
            <textarea className="memo" rows={5} value={form.memo} placeholder="自由に" onChange={(e) => update({ memo: e.target.value })} />
          </section>

          <div className="complete-bar">
            <button className={`btn ${data.entry.completed ? 'btn-done' : 'btn-primary'}`} onClick={toggleComplete}>
              {data.entry.completed ? '✓ 今日の記入を完了しました' : '今日の記入を完了'}
            </button>
          </div>
        </div>
      </div>

      {picker && <NotionPicker date={date} onClose={() => setPicker(false)} onPicked={reload} />}
    </div>
  );
}

function ScheduleCard({ date }: { date: string }) {
  const tomorrow = addDays(date, 1);
  const { data, error, reload } = useEvents(date, tomorrow);
  const [edit, setEdit] = useState<{ event?: CalEvent; date: string } | null>(null);
  const todays = data ? eventsOn(data, date) : [];
  const tomorrows = data ? eventsOn(data, tomorrow) : [];
  return (
    <section className="card no-swipe">
      <div className="card-head">
        <h2 className="card-title">今日のスケジュール</h2>
        <button className="btn btn-small" onClick={() => setEdit({ date })}>＋ 予定を追加</button>
      </div>
      {error && <CalendarError message={error} />}
      {!data && !error && <p className="muted small">読み込み中…</p>}
      {data && todays.length === 0 && <p className="muted">予定はありません</p>}
      <div className="events">
        {todays.map((e) => (
          <EventLine key={e.calendarId + e.id} e={e} date={date} onClick={() => setEdit({ event: e, date })} />
        ))}
      </div>
      {data && (
        <details className="tomorrow">
          <summary>明日の予定（{tomorrows.length}件）</summary>
          <div className="events">
            {tomorrows.map((e) => (
              <EventLine key={e.calendarId + e.id} e={e} date={tomorrow} onClick={() => setEdit({ event: e, date: tomorrow })} />
            ))}
          </div>
        </details>
      )}
      {edit && <EventModal date={edit.date} event={edit.event} onClose={() => setEdit(null)} onSaved={reload} />}
    </section>
  );
}
