import { useState } from 'react';
import { Link } from 'react-router-dom';
import { shortDate, WEEKDAYS_JA, weekday } from '../../shared/dates';
import { put } from '../api';
import { useAutosave } from '../hooks';
import { StatusChip, TaskActions, type Task } from './TaskRow';
import { Progress, SaveBadge, Stars, Stat, pct } from './ui';

export interface Note {
  theme: string;
  targets: { text: string; done: boolean }[];
  plan_memo: string;
  review_good: string;
  review_bad: string;
  review_learn: string;
  review_next: string;
  review_score: number | null;
  reviewed: boolean;
}

export function useNote(kind: string, start: string, initial: Note) {
  const save = useAutosave((v: Partial<Note>) => put(`/periods/${kind}/${start}`, v), 800, `/api/periods/${kind}/${start}`, `fj.draft.${kind}.${start}`);
  // 前回保存しきれなかった下書きがあれば重ねる
  const [note, setNote] = useState<Note>(() => ({ ...initial, ...(save.takeDraft() ?? {}) }));
  const update = (p: Partial<Note>, immediate = false) => {
    setNote((n) => ({ ...n, ...p }));
    save.schedule(p);
    if (immediate) save.flush();
  };
  return { note, update, save };
}

export function PlanEditor({ note, update, unit, prevNext }: { note: Note; update: (p: Partial<Note>, now?: boolean) => void; unit: string; prevNext?: string }) {
  const targets = note.targets;
  const setTargets = (t: Note['targets'], now = false) => update({ targets: t }, now);
  return (
    <section className="card">
      <h2 className="card-title">{unit}の予定</h2>
      {prevNext?.trim() && (
        <div className="notice soft">
          <strong>前回のレビューで決めたこと</strong>
          <p className="pre">{prevNext}</p>
        </div>
      )}
      <label className="field">
        <span>{unit}のテーマ</span>
        <input className="big-input" value={note.theme} placeholder={`この${unit}、いちばん大事にすること`} onChange={(e) => update({ theme: e.target.value })} />
      </label>
      <div className="field">
        <span>{unit}の目標</span>
        <ul className="target-list">
          {targets.map((t, i) => (
            <li key={i}>
              <input type="checkbox" checked={t.done} onChange={(e) => setTargets(targets.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)), true)} aria-label="達成" />
              <input value={t.text} onChange={(e) => setTargets(targets.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className={t.done ? 'done' : ''} />
              <button type="button" className="icon-btn" aria-label="削除" onClick={() => setTargets(targets.filter((_, j) => j !== i), true)}>×</button>
            </li>
          ))}
        </ul>
        {targets.length < 10 && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setTargets([...targets, { text: '', done: false }])}>＋ 目標を追加</button>
        )}
      </div>
      <label className="field">
        <span>メモ</span>
        <textarea rows={3} value={note.plan_memo} onChange={(e) => update({ plan_memo: e.target.value })} />
      </label>
    </section>
  );
}

export function ReviewForm({ note, update, nextLabel, state }: { note: Note; update: (p: Partial<Note>, now?: boolean) => void; nextLabel: string; state: any }) {
  const fields: [keyof Note, string, string][] = [
    ['review_good', '良かったこと・できたこと', ''],
    ['review_bad', 'うまくいかなかったこと', ''],
    ['review_learn', '学び・気づき', ''],
    ['review_next', nextLabel, '次の予定のページに表示されます'],
  ];
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">ふりかえり</h2>
        <SaveBadge state={state} />
      </div>
      {fields.map(([k, label, hint]) => (
        <label className="field" key={k}>
          <span>{label}{hint && <em className="muted small">（{hint}）</em>}</span>
          <textarea rows={3} value={note[k] as string} onChange={(e) => update({ [k]: e.target.value })} />
        </label>
      ))}
      <div className="field">
        <span>自己評価</span>
        <Stars value={note.review_score} onChange={(v) => update({ review_score: v }, true)} />
      </div>
      <button className={`btn ${note.reviewed ? 'btn-done' : 'btn-primary'}`} onClick={() => update({ reviewed: !note.reviewed }, true)}>
        {note.reviewed ? '✓ レビュー完了' : 'レビューを完了する'}
      </button>
    </section>
  );
}

export function PeriodStats({ data, unit }: { data: any; unit: string }) {
  const s = data.stats;
  const diff = s.rate != null && data.prevStats.rate != null ? s.rate - data.prevStats.rate : null;
  const habitDone = data.habits.reduce((a: number, h: any) => a + h.done, 0);
  const habitTarget = data.habits.reduce((a: number, h: any) => a + h.target, 0);
  return (
    <div className="stats">
      <Stat label="タスク達成率" value={pct(s.rate)} sub={diff == null ? `前${unit}の記録なし` : `前${unit}比 ${diff >= 0 ? '+' : ''}${diff}pt`} tone={diff != null && diff < 0 ? 'warn' : undefined} />
      <Stat label="できた／できなかった" value={`${s.done} / ${s.missed + s.carried}`} sub={`未着手 ${s.todo}`} />
      <Stat label="習慣" value={habitTarget ? `${Math.round((habitDone / habitTarget) * 100)}%` : '—'} sub={`${habitDone} / ${habitTarget}回`} />
      <Stat label="記入した日" value={data.fill.days ? `${data.fill.filled} / ${data.fill.days}日` : '—'} sub={pct(data.fill.pct)} />
    </div>
  );
}

export function HabitWeekTable({ habits, onToggle }: { habits: any[]; onToggle?: (goalId: string, date: string, done: boolean) => void }) {
  if (habits.length === 0) return null;
  const dates = habits[0].days.map((d: any) => d.date);
  return (
    <div className="table-wrap">
      <table className="habit-table">
        <thead>
          <tr>
            <th>習慣</th>
            {dates.map((d: string) => (
              <th key={d}>{WEEKDAYS_JA[weekday(d)]}<br /><span className="muted small">{shortDate(d)}</span></th>
            ))}
            <th>達成</th>
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <th scope="row">{h.title}</th>
              {h.days.map((d: any) => (
                <td key={d.date} className={d.scheduled ? '' : 'off'}>
                  <button
                    type="button"
                    className={`habit-cell ${d.done ? 'on' : ''}`}
                    aria-pressed={d.done}
                    aria-label={`${h.title} ${d.date}`}
                    disabled={!onToggle}
                    onClick={() => onToggle?.(h.id, d.date, !d.done)}
                  />
                </td>
              ))}
              <td className="num">{h.done}/{h.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ByGoalTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <p className="muted">タスクはまだありません</p>;
  return (
    <table className="simple-table">
      <thead>
        <tr><th>目標</th><th>できた</th><th>できなかった</th><th>達成率</th></tr>
      </thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.goal_id ?? 'none'}>
            <td>{g.goal_title}</td>
            <td className="num">{g.stats.done}</td>
            <td className="num">{g.stats.missed + g.stats.carried}</td>
            <td className="num">{pct(g.stats.rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GoalProgressList({ goals }: { goals: any[] }) {
  if (goals.length === 0) return <p className="muted">プロジェクト目標はまだありません</p>;
  return (
    <ul className="goal-progress">
      {goals.map((g) => (
        <li key={g.id}>
          <div className="row"><span>{g.title}</span><span className="num">{g.progress}%</span></div>
          <Progress value={g.progress} tone={g.behind ? 'warn' : undefined} />
        </li>
      ))}
    </ul>
  );
}

export function DoneMissedLists({ days, today, onChange }: { days: any[]; today: string; onChange: () => void }) {
  const all: Task[] = days.flatMap((d) => d.tasks);
  const done = all.filter((t) => t.status === 'done');
  const missed = all.filter((t) => t.status === 'missed');
  return (
    <div className="two-col">
      <section className="card">
        <h2 className="card-title">できたこと <span className="count">{done.length}</span></h2>
        <ul className="plain-list">
          {done.map((t) => (
            <li key={t.id}><Link to={`/day/${t.date}`} className="muted small">{shortDate(t.date)}</Link> {t.title}</li>
          ))}
          {done.length === 0 && <li className="muted">まだありません</li>}
        </ul>
      </section>
      <section className="card">
        <h2 className="card-title">できなかったこと <span className="count">{missed.length}</span></h2>
        <ul className="plain-list">
          {missed.map((t) => (
            <li key={t.id} className="with-actions">
              <span><Link to={`/day/${t.date}`} className="muted small">{shortDate(t.date)}</Link> {t.title} {t.carry_count > 0 && <span className="chip chip-soft">送った {t.carry_count}回</span>}</span>
              <TaskActions task={t} today={today} onChange={onChange} />
            </li>
          ))}
          {missed.length === 0 && <li className="muted">ありません</li>}
        </ul>
      </section>
    </div>
  );
}

export function GoodsList({ days }: { days: any[] }) {
  const goods = days.flatMap((d) => d.goods.map((g: string) => ({ date: d.date, text: g })));
  return (
    <section className="card">
      <h2 className="card-title">良かったこと <span className="count">{goods.length}</span></h2>
      <ul className="plain-list">
        {goods.map((g, i) => (
          <li key={i}><Link to={`/day/${g.date}`} className="muted small">{shortDate(g.date)}</Link> {g.text}</li>
        ))}
        {goods.length === 0 && <li className="muted">まだありません</li>}
      </ul>
    </section>
  );
}

export { StatusChip };
