import { Link, useParams } from 'react-router-dom';
import { addDays, daysInRange, mondayOf, shortDate, todayJST, weekday } from '../../shared/dates';
import { habitLabel, habitScheduled } from '../../shared/progress';
import { TermHeader } from '../components/TermHeader';
import { ErrorBox, Loading, Progress, Stat, metricText, pct } from '../components/ui';
import { useApi } from '../hooks';

export function TermPage() {
  const { id = '' } = useParams();
  const { data: term, error, reload } = useApi<any>(`/terms/${id}`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!term) return <Loading />;
  const info = term.info;
  const projects = term.goals.filter((g: any) => g.type === 'project');
  const habits = term.goals.filter((g: any) => g.type === 'habit');
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const behind = term.goals.filter((g: any) => g.behind);

  return (
    <div className="page">
      <TermHeader term={term} tab="progress" />

      <section className="card">
        <div className="row">
          <span className="card-title">経過</span>
          <span className="num">{info.elapsedDays} / {info.totalDays}日（{info.elapsedPct}%）</span>
        </div>
        <Progress value={info.elapsedPct} tone="gold" />
      </section>

      {(info.phase === 'ended' || (info.phase === 'active' && info.daysLeft <= 7)) && !term.nextTerm && (
        <div className="notice">
          {info.phase === 'ended' ? 'このタームは終わりました。' : `このタームは残り${info.daysLeft}日です。`}
          <Link className="btn btn-small btn-primary" to={`/terms?new=1&from=${term.id}`}>次のタームを作る</Link>
          <Link className="btn btn-small" to={`/term/${term.id}/review`}>総括を見る</Link>
        </div>
      )}

      <div className="stats">
        <Stat label="タスク達成率" value={pct(term.taskStats.rate)} sub={`できた ${term.taskStats.done} ／ できなかった ${term.taskStats.missed + term.taskStats.carried}`} />
        <Stat label="プロジェクト平均" value={pct(avg(projects.map((g: any) => g.progress)))} sub={`${projects.length}件`} />
        <Stat label="習慣 平均達成率" value={pct(avg(habits.map((g: any) => g.progress)))} sub={`${habits.length}件`} />
        <Stat label="記入率" value={pct(term.fill.pct)} sub={`${term.fill.filled} / ${term.fill.days}日`} />
      </div>

      {behind.length > 0 && (
        <div className="notice warn">
          経過率に対して20ポイント以上遅れている目標: {behind.map((g: any) => g.title).join('、')}
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">プロジェクト目標</h2>
          <Link className="btn btn-small btn-ghost" to={`/term/${term.id}/goals`}>編集</Link>
        </div>
        {projects.length === 0 && <p className="muted">まだありません。<Link to={`/term/${term.id}/goals`}>目標を立てる</Link></p>}
        <ul className="goal-progress">
          {projects.map((g: any) => (
            <li key={g.id} className={g.behind ? 'behind' : ''}>
              <div className="row">
                <span>
                  {g.title}
                  {g.status !== 'active' && <span className="chip">{{ achieved: '達成', missed: '未達', cancelled: '中止' }[g.status as string]}</span>}
                </span>
                <span className="num">{g.progress}%</span>
              </div>
              <Progress value={g.progress} tone={g.behind ? 'warn' : undefined} />
              <p className="muted small">
                {metricText(g) && <>数値目標 {metricText(g)} ・ </>}
                マイルストーン {g.milestones.filter((m: any) => m.done).length} / {g.milestones.length}
                {g.tasks.total > 0 && ` ・ 関連タスク できた ${g.tasks.done} / ${g.tasks.total}`}
                {g.due_date && ` ・ 期限 ${shortDate(g.due_date)}`}
              </p>
              {g.obstacle && (
                <p className="obstacle small">
                  <strong>障害:</strong> {g.obstacle}
                  {g.obstacle_plan && <> → <strong>対策:</strong> {g.obstacle_plan}</>}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="card-title">習慣</h2>
        {habits.length === 0 && <p className="muted">まだありません</p>}
        {habits.map((g: any) => (
          <div key={g.id} className="habit-block">
            <div className="row">
              <span>{g.title} <span className="muted small">（{habitLabel(g)}）</span></span>
              <span className="num">{g.progress}%</span>
            </div>
            <p className="muted small">
              {g.habit.done} / {g.habit.expected}回
              {g.habit_frequency !== 'weekly' && ` ・ 連続 ${g.habit.currentStreak}日 ・ 最長 ${g.habit.longestStreak}日`}
              {g.habit_frequency === 'weekly' && ` ・ 今週 ${g.habit.weekDone}/${g.habit.weekTarget}`}
            </p>
            <Heatmap term={term} goal={g} />
          </div>
        ))}
      </section>
    </div>
  );
}

/** 週ごとの行 × 月〜日 の達成マス */
function Heatmap({ term, goal }: { term: any; goal: any }) {
  const done = new Set<string>(goal.logs);
  const today = todayJST();
  const weeks: string[] = [];
  for (let w = mondayOf(term.start_date); w <= term.end_date; w = addDays(w, 7)) weeks.push(w);
  return (
    <div className="heatmap" aria-label={`${goal.title} の達成カレンダー`}>
      {weeks.map((w) => (
        <div key={w} className="heat-row">
          {daysInRange(w, addDays(w, 6)).map((d) => {
            const inTerm = d >= term.start_date && d <= term.end_date;
            const cls = !inTerm ? 'out' : done.has(d) ? 'on' : d > today ? 'future' : habitScheduled(goal, d) ? 'miss' : 'off';
            return <span key={d} className={`heat ${cls} ${weekday(d) === 0 ? 'sun' : ''}`} title={`${shortDate(d)}${done.has(d) ? ' ✓' : ''}`} />;
          })}
        </div>
      ))}
    </div>
  );
}
