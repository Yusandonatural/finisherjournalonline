import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { shortDate } from '../../shared/dates';
import { post } from '../api';
import { ByGoalTable } from '../components/period';
import { TermHeader } from '../components/TermHeader';
import { ErrorBox, Loading, Progress, Stat, pct } from '../components/ui';
import { useApi } from '../hooks';

export function TermReviewPage() {
  const { id = '' } = useParams();
  const { data, error, reload } = useApi<any>(`/terms/${id}/review`);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { term, stats } = data;
  const ended = term.info.phase === 'ended';
  const maxRate = Math.max(1, ...data.byWeekday.map((w: any) => w.stats.rate ?? 0));

  async function carry(taskId: string, on: boolean) {
    setBusy(true);
    await post(`/terms/${term.id}/carry-over`, { task_ids: [taskId], on });
    await reload();
    setBusy(false);
  }

  return (
    <div className="page">
      <TermHeader term={term} tab="review" />
      {!ended && <div className="notice soft">ターム途中の経過です。ターム終了後（{shortDate(term.end_date)}の翌日）に確定します。</div>}

      <div className="stats">
        <Stat label="達成率" value={pct(stats.rate)} sub={`${stats.total}件中`} />
        <Stat label="できたこと" value={stats.done} tone="good" />
        <Stat label="できなかったこと" value={stats.missed} sub={`送った ${stats.carried}回`} tone={stats.missed ? 'warn' : undefined} />
        <Stat label="記入率" value={pct(data.fill.pct)} sub={`${data.fill.filled} / ${data.fill.days}日`} />
      </div>

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">目標の結果</h2>
          <ul className="goal-progress">
            {data.goals.map((g: any) => (
              <li key={g.id}>
                <div className="row"><span>{g.type === 'habit' ? '習慣: ' : ''}{g.title}</span><span className="num">{g.progress}%</span></div>
                <Progress value={g.progress} tone={g.behind ? 'warn' : undefined} />
              </li>
            ))}
            {data.goals.length === 0 && <li className="muted">目標がありません</li>}
          </ul>
        </section>
        <section className="card">
          <h2 className="card-title">曜日別の達成率</h2>
          <p className="muted small">どの曜日に崩れやすいかを見ます。</p>
          <div className="bars">
            {data.byWeekday.slice(1).concat(data.byWeekday.slice(0, 1)).map((w: any) => (
              <div key={w.weekday} className="bar-col">
                <div className="bar" style={{ height: `${((w.stats.rate ?? 0) / maxRate) * 100}%` }} title={`${w.name}: ${pct(w.stats.rate)}`} />
                <span className="bar-val">{pct(w.stats.rate)}</span>
                <span className="bar-label">{w.name}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">目標別</h2>
        <ByGoalTable rows={data.byGoal} />
      </section>

      <section className="card">
        <h2 className="card-title">できたこと <span className="count">{stats.done}</span></h2>
        {data.doneByGoal.length === 0 && <p className="muted">まだありません</p>}
        {data.doneByGoal.map((g: any) => (
          <details key={g.goal_id ?? 'none'} className="group" open={data.doneByGoal.length <= 3}>
            <summary>{g.goal_title} <span className="count">{g.tasks.length}</span></summary>
            <ul className="plain-list">
              {g.tasks.map((t: any) => (
                <li key={t.id}><Link className="muted small" to={`/day/${t.date}`}>{shortDate(t.date)}</Link> {t.title}</li>
              ))}
            </ul>
          </details>
        ))}
      </section>

      <section className="card">
        <h2 className="card-title">できなかったこと <span className="count">{data.missed.length}</span></h2>
        <p className="muted small">先送りした回数が多いものから並べています。「次のタームへ」に印を付けると、次のタームの目標設定画面に出てきます。</p>
        <ul className="plain-list">
          {data.missed.map((t: any) => (
            <li key={t.id} className="with-actions">
              <span>
                <Link className="muted small" to={`/day/${t.date}`}>{shortDate(t.date)}</Link> {t.title}
                {t.carry_count > 0 && <span className="chip chip-warn">送った {t.carry_count}回</span>}
                {t.goal_title && <span className="chip chip-soft">{t.goal_title}</span>}
              </span>
              <label className="check small">
                <input type="checkbox" checked={t.carry_over === 1} disabled={busy || t.carry_over === 2} onChange={(e) => carry(t.id, e.target.checked)} />
                <span>{t.carry_over === 2 ? '持ち越し済み' : '次のタームへ'}</span>
              </label>
            </li>
          ))}
          {data.missed.length === 0 && <li className="muted">ありません</li>}
        </ul>
        {data.nextTerm ? (
          <Link className="btn btn-wrap" to={`/term/${data.nextTerm.id}/goals`}>次のターム（{data.nextTerm.title}）の目標設定へ →</Link>
        ) : (
          ended && <Link className="btn btn-primary" to={`/terms?new=1&from=${term.id}`}>次のタームを作る</Link>
        )}
      </section>
    </div>
  );
}
