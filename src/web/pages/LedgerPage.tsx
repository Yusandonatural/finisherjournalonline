import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { diffDays, mondayOf, shortDate, WEEKDAYS_JA, weekday } from '../../shared/dates';
import { ByGoalTable } from '../components/period';
import { TermHeader } from '../components/TermHeader';
import { StatusChip, TaskActions, type Task } from '../components/TaskRow';
import { ErrorBox, Loading, Stat, pct } from '../components/ui';
import { useApi } from '../hooks';

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'done', label: 'できた' },
  { key: 'missed', label: 'できなかった' },
  { key: 'todo', label: '未着手' },
  { key: 'carried', label: '送った' },
  { key: 'dropped', label: '取り下げ' },
];

export function LedgerPage() {
  const { id = '' } = useParams();
  const { data, error, reload } = useApi<any>(`/terms/${id}/tasks`);
  const [status, setStatus] = useState('all');
  const [goal, setGoal] = useState('');
  const tasks: Task[] = data?.tasks ?? [];

  const shown = useMemo(
    () => tasks.filter((t) => (status === 'all' || t.status === status) && (!goal || (goal === 'none' ? !t.goal_id : t.goal_id === goal))),
    [tasks, status, goal],
  );
  const weeks = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of shown) {
      const w = mondayOf(t.date);
      if (!m.has(w)) m.set(w, []);
      m.get(w)!.push(t);
    }
    return [...m.entries()];
  }, [shown]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const s = data.stats;
  const term = data.term;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const unsynced = tasks.filter((t) => t.notion_error).length;

  return (
    <div className="page">
      <TermHeader term={term} tab="tasks" />
      <div className="stats">
        <Stat label="積み上げたタスク" value={`${s.total}件`} sub={`最大 ${term.info.totalDays * 3}件`} />
        <Stat label="できた" value={s.done} sub={pct(s.rate)} tone="good" />
        <Stat label="できなかった" value={s.missed + s.carried} sub={`うち送った ${s.carried}`} tone={s.missed > 0 ? 'warn' : undefined} />
        <Stat label="未着手" value={s.todo} sub={`取り下げ ${s.dropped}`} />
      </div>
      {unsynced > 0 && <div className="notice warn">Notion に同期できていないタスクが {unsynced}件あります（設定画面で再同期できます）。</div>}

      <section className="card">
        <h2 className="card-title">目標別の達成率</h2>
        <ByGoalTable rows={data.byGoal} />
      </section>

      <section className="card">
        <div className="filters">
          <div className="seg" role="group" aria-label="状態で絞り込み">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={status === f.key ? 'active' : ''} onClick={() => setStatus(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="目標で絞り込み">
            <option value="">すべての目標</option>
            <option value="none">目標なし</option>
            {data.goals.filter((g: any) => g.type === 'project').map((g: any) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
        </div>
        {shown.length === 0 && <p className="muted">該当するタスクはありません</p>}
        {weeks.map(([w, ts]) => (
          <div key={w} className="ledger-week">
            <h3 className="mini-title">
              <Link to={`/week/${w}`}>{shortDate(w)}〜の週</Link>
            </h3>
            <table className="ledger">
              <tbody>
                {ts.map((t) => (
                  <tr key={t.id} className={`status-${t.status}`}>
                    <td className="ledger-date">
                      <Link to={`/day/${t.date}#task-${t.id}`}>
                        Day {diffDays(term.start_date, t.date) + 1}
                        <span className="muted small"> {shortDate(t.date)}({WEEKDAYS_JA[weekday(t.date)]})</span>
                      </Link>
                    </td>
                    <td className="ledger-title">
                      {t.title}
                      <div className="ledger-meta">
                        {t.goal_title && <span className="chip chip-soft">{t.goal_title}</span>}
                        {t.carry_count > 0 && <span className="chip chip-soft">送った {t.carry_count}回</span>}
                        {t.notion_page_id && <span className="chip chip-soft">{t.notion_error ? 'Notion未同期' : 'Notion'}</span>}
                      </div>
                    </td>
                    <td className="ledger-status"><StatusChip status={t.status} /></td>
                    <td className="ledger-actions"><TaskActions task={t} today={today} onChange={reload} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}
