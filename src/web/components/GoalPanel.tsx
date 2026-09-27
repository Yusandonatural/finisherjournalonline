import { useState } from 'react';
import { Link } from 'react-router-dom';
import { habitLabel } from '../../shared/progress';
import { patch, put } from '../api';
import { Progress } from './ui';

export function GoalPanel({ goals, termId, date, onChange, editable = true }: { goals: any[]; termId?: string; date: string; onChange: () => void; editable?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const projects = goals.filter((g) => g.type === 'project');
  const habits = goals.filter((g) => g.type === 'habit');

  async function toggleHabit(g: any) {
    g.doneOnDate = !g.doneOnDate;
    onChange();
    await put(`/goals/${g.id}/habit/${date}`, { done: g.doneOnDate });
    onChange();
  }

  async function toggleMilestone(m: any) {
    m.done = m.done ? 0 : 1;
    onChange();
    await patch(`/milestones/${m.id}`, { done: !!m.done });
    onChange();
  }

  if (goals.length === 0) {
    return (
      <div className="empty">
        <p>このタームの目標がまだありません。</p>
        {termId && <Link className="btn btn-primary btn-small" to={`/term/${termId}/goals`}>目標を立てる</Link>}
      </div>
    );
  }

  return (
    <div className="goal-panel">
      {projects.length > 0 && <h3 className="mini-title">プロジェクト</h3>}
      <ul className="goal-list">
        {projects.map((g) => (
          <li key={g.id} className={g.behind ? 'behind' : ''}>
            <button type="button" className="goal-head" onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id} title={g.why || undefined}>
              <span className="goal-title">{g.title}</span>
              <span className="goal-pct">{g.progress}%</span>
            </button>
            <Progress value={g.progress} tone={g.behind ? 'warn' : undefined} />
            {g.behind && <p className="goal-warn">経過に対して遅れています</p>}
            {open === g.id && (
              <div className="goal-detail">
                {g.why && <p className="muted small">なぜ: {g.why}</p>}
                {g.milestones.length === 0 && <p className="muted small">マイルストーンなし（進捗は手動）</p>}
                <ul className="check-list">
                  {g.milestones.map((m: any) => (
                    <li key={m.id}>
                      <label className="check">
                        <input type="checkbox" checked={!!m.done} onChange={() => toggleMilestone(m)} disabled={!editable} />
                        <span className={m.done ? 'done' : ''}>{m.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {termId && <Link className="small" to={`/term/${termId}/goals`}>目標を編集</Link>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {habits.length > 0 && <h3 className="mini-title">習慣</h3>}
      <ul className="habit-list">
        {habits.map((g) => (
          <li key={g.id}>
            <label className={`check ${g.scheduledOnDate === false ? 'off-day' : ''}`}>
              <input type="checkbox" checked={!!g.doneOnDate} onChange={() => toggleHabit(g)} disabled={!editable} />
              <span>{g.title}</span>
            </label>
            <span className="habit-meta">
              {habitLabel(g)} ・ {g.habit_frequency === 'weekly' ? `今週 ${g.habit.weekDone}/${g.habit.weekTarget}` : g.habit.currentStreak > 0 ? `連続${g.habit.currentStreak}日` : `${g.habit.pct}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
