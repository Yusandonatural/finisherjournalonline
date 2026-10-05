import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { shortDate } from '../../shared/dates';
import { LANG_SOURCES } from '../../shared/langs';
import { del, patch, post } from '../api';
import { TermHeader } from '../components/TermHeader';
import { ErrorBox, Loading, Progress, metricText } from '../components/ui';
import { useApi } from '../hooks';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function GoalsPage() {
  const { id = '' } = useParams();
  const { data: term, error, reload } = useApi<any>(`/terms/${id}`);
  const carriedIn = useApi<any[]>(`/terms/${id}/carried-in`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!term) return <Loading />;
  const projects = term.goals.filter((g: any) => g.type === 'project');
  const habits = term.goals.filter((g: any) => g.type === 'habit');

  return (
    <div className="page narrow-wide">
      <TermHeader term={term} tab="goals" />
      <p className="muted">3ヶ月で「完了させる」ものはプロジェクト、「続ける」ものは習慣として立てます。目安は合わせて3〜5個です。</p>
      {term.goals.length >= 6 && <div className="notice warn">目標が {term.goals.length}個あります。絞ったほうが達成しやすくなります。</div>}

      {carriedIn.data && carriedIn.data.length > 0 && (
        <section className="card">
          <h2 className="card-title">前のタームから持ち越したこと</h2>
          <ul className="plain-list">
            {carriedIn.data.map((t: any) => (
              <CarriedItem key={t.id} task={t} projects={projects} onDone={() => { carriedIn.reload(); reload(); }} />
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="card-title">プロジェクト目標</h2>
        {projects.map((g: any, i: number) => (
          <GoalEditor key={g.id} goal={g} first={i === 0} last={i === projects.length - 1} onChange={reload} />
        ))}
        <AddGoal termId={term.id} type="project" onAdded={reload} />
      </section>

      <section className="card">
        <h2 className="card-title">習慣目標</h2>
        {habits.map((g: any, i: number) => (
          <GoalEditor key={g.id} goal={g} first={i === 0} last={i === habits.length - 1} onChange={reload} />
        ))}
        <AddGoal termId={term.id} type="habit" onAdded={reload} />
      </section>
    </div>
  );
}

function CarriedItem({ task, projects, onDone }: { task: any; projects: any[]; onDone: () => void }) {
  const [goal, setGoal] = useState(projects[0]?.id ?? '');
  return (
    <li className="with-actions">
      <span><span className="muted small">{shortDate(task.date)}</span> {task.title}</span>
      <span className="inline-form">
        {projects.length > 0 ? (
          <>
            <select value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="追加先の目標">
              {projects.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            <button className="btn btn-small" onClick={async () => { await post(`/tasks/${task.id}/to-milestone`, { goal_id: goal }); onDone(); }}>マイルストーンにする</button>
          </>
        ) : (
          <span className="muted small">先にプロジェクト目標を作ってください</span>
        )}
        <button className="btn btn-small btn-ghost" onClick={async () => { await patch(`/tasks/${task.id}`, { carry_over: false }); onDone(); }}>外す</button>
      </span>
    </li>
  );
}

function AddGoal({ termId, type, onAdded }: { termId: string; type: 'project' | 'habit'; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  async function add() {
    if (!title.trim()) return;
    await post(`/terms/${termId}/goals`, { type, title });
    setTitle('');
    onAdded();
  }
  return (
    <form className="add-row" onSubmit={(e) => (e.preventDefault(), add())}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'project' ? '例: カフェ／SHOPをオープンする' : '例: 毎日フランス語の日記を書く'} aria-label="新しい目標" />
      <button className="btn btn-primary" disabled={!title.trim()}>追加</button>
    </form>
  );
}

function GoalEditor({ goal, first, last, onChange }: { goal: any; first: boolean; last: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    title: goal.title,
    why: goal.why ?? '',
    obstacle: goal.obstacle ?? '',
    obstacle_plan: goal.obstacle_plan ?? '',
    metric_unit: goal.metric_unit ?? '',
    metric_start: goal.metric_start ?? '',
    metric_current: goal.metric_current ?? '',
    metric_target: goal.metric_target ?? '',
  });
  const blurSave = (k: keyof typeof f) => () => String(f[k]) !== String(goal[k] ?? '') && save({ [k]: f[k] });
  const [ms, setMs] = useState('');
  const weekdays: number[] = JSON.parse(goal.habit_weekdays_json || '[]');
  const save = async (p: Record<string, unknown>) => {
    await patch(`/goals/${goal.id}`, p);
    onChange();
  };

  return (
    <div className={`goal-editor ${goal.behind ? 'behind' : ''}`}>
      <div className="goal-editor-head">
        <input
          className="goal-title-input"
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          onBlur={() => f.title.trim() && f.title !== goal.title && save({ title: f.title })}
          aria-label="目標"
        />
        <span className="num">{goal.progress}%</span>
        <button className="icon-btn" disabled={first} aria-label="上へ" onClick={async () => { await post(`/goals/${goal.id}/move`, { dir: -1 }); onChange(); }}>↑</button>
        <button className="icon-btn" disabled={last} aria-label="下へ" onClick={async () => { await post(`/goals/${goal.id}/move`, { dir: 1 }); onChange(); }}>↓</button>
        <button className="btn btn-small btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? '閉じる' : '詳細'}</button>
      </div>
      <Progress value={goal.progress} tone={goal.behind ? 'warn' : undefined} />
      {goal.link_source && LANG_SOURCES[goal.link_source] && (
        <p className="muted small goal-sub"><span>🔗 {LANG_SOURCES[goal.link_source].label}と連動{goal.type === 'habit' ? '（学習した日に自動で ✓）' : '（クリアした Day 数 ÷ 90）'}</span></p>
      )}
      {(metricText(goal) || goal.obstacle) && (
        <p className="muted small goal-sub">
          {metricText(goal) && <span>数値目標 {metricText(goal)}</span>}
          {goal.obstacle && <span>障害: {goal.obstacle}</span>}
        </p>
      )}

      {goal.type === 'project' && (
        <ul className="check-list">
          {goal.milestones.map((m: any) => (
            <li key={m.id} className="with-actions">
              <label className="check">
                <input type="checkbox" checked={!!m.done} onChange={async () => { await patch(`/milestones/${m.id}`, { done: !m.done }); onChange(); }} />
                <span className={m.done ? 'done' : ''}>{m.title}</span>
              </label>
              <button className="icon-btn small" aria-label="削除" onClick={async () => { await del(`/milestones/${m.id}`); onChange(); }}>×</button>
            </li>
          ))}
          <li>
            <form className="add-row small" onSubmit={async (e) => { e.preventDefault(); if (!ms.trim()) return; await post(`/goals/${goal.id}/milestones`, { title: ms }); setMs(''); onChange(); }}>
              <input value={ms} onChange={(e) => setMs(e.target.value)} placeholder="マイルストーンを追加" aria-label="マイルストーン" />
              <button className="btn btn-small" disabled={!ms.trim()}>追加</button>
            </form>
          </li>
        </ul>
      )}

      {open && (
        <div className="goal-detail form">
          <label>
            なぜやるか
            <input value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} onBlur={() => f.why !== (goal.why ?? '') && save({ why: f.why })} placeholder="動機をひとこと" />
          </label>
          {goal.type === 'project' && (
            <fieldset>
              <legend>数値目標（入れると進捗はこの数字で計算します）</legend>
              <div className="form-row">
                <label>
                  開始値
                  <input type="number" inputMode="decimal" value={f.metric_start} onChange={(e) => setF({ ...f, metric_start: e.target.value })} onBlur={blurSave('metric_start')} />
                </label>
                <label>
                  現在値
                  <input type="number" inputMode="decimal" value={f.metric_current} onChange={(e) => setF({ ...f, metric_current: e.target.value })} onBlur={blurSave('metric_current')} />
                </label>
                <label>
                  目標値
                  <input type="number" inputMode="decimal" value={f.metric_target} onChange={(e) => setF({ ...f, metric_target: e.target.value })} onBlur={blurSave('metric_target')} />
                </label>
                <label>
                  単位
                  <input value={f.metric_unit} placeholder="件・万円・人" onChange={(e) => setF({ ...f, metric_unit: e.target.value })} onBlur={blurSave('metric_unit')} />
                </label>
              </div>
            </fieldset>
          )}
          <label>
            語学アプリと連動
            <select value={goal.link_source ?? ''} onChange={(e) => save({ link_source: e.target.value || null })}>
              <option value="">連動しない</option>
              {Object.values(LANG_SOURCES).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <span className="muted small">
              {goal.type === 'habit' ? 'その語学アプリで学習した（XP が付いた）日に、自動で ✓ が付きます。' : 'その語学アプリでクリアした Day 数 ÷ 90 が進捗になります（マイルストーンや数値目標がない場合）。'}
            </span>
          </label>
          <label>
            大きな障害（うまくいかなくなるとしたら何が原因か）
            <textarea rows={2} value={f.obstacle} onChange={(e) => setF({ ...f, obstacle: e.target.value })} onBlur={blurSave('obstacle')} />
          </label>
          <label>
            障害への対策
            <textarea rows={2} value={f.obstacle_plan} onChange={(e) => setF({ ...f, obstacle_plan: e.target.value })} onBlur={blurSave('obstacle_plan')} />
          </label>
          {goal.type === 'project' ? (
            <div className="form-row">
              <label>
                期限
                <input type="date" value={goal.due_date ?? ''} onChange={(e) => save({ due_date: e.target.value || null })} />
              </label>
              {goal.milestones.length === 0 && goal.metric_target == null && !goal.link_source && (
                <label>
                  進捗（手動） {goal.manual_progress ?? 0}%
                  <input type="range" min={0} max={100} step={5} defaultValue={goal.manual_progress ?? 0} onMouseUp={(e) => save({ manual_progress: Number((e.target as HTMLInputElement).value) })} onTouchEnd={(e) => save({ manual_progress: Number((e.target as HTMLInputElement).value) })} />
                </label>
              )}
            </div>
          ) : (
            <div className="form-row">
              <label>
                頻度
                <select value={goal.habit_frequency ?? 'daily'} onChange={(e) => save({ habit_frequency: e.target.value })}>
                  <option value="daily">毎日</option>
                  <option value="weekly">週N回</option>
                  <option value="weekdays">曜日を指定</option>
                </select>
              </label>
              {goal.habit_frequency === 'weekly' && (
                <label>
                  週の回数
                  <select value={goal.habit_times_per_week ?? 1} onChange={(e) => save({ habit_times_per_week: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}回</option>)}
                  </select>
                </label>
              )}
              {goal.habit_frequency === 'weekdays' && (
                <fieldset className="weekday-pick">
                  <legend>曜日</legend>
                  {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                    <label key={w} className="inline">
                      <input type="checkbox" checked={weekdays.includes(w)} onChange={(e) => save({ habit_weekdays: e.target.checked ? [...weekdays, w] : weekdays.filter((x) => x !== w) })} />
                      {WD[w]}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}
          <div className="form-row">
            <label>
              状態
              <select value={goal.status} onChange={(e) => save({ status: e.target.value })}>
                <option value="active">進行中</option>
                <option value="achieved">達成</option>
                <option value="missed">未達</option>
                <option value="cancelled">中止</option>
              </select>
            </label>
            <span className="spacer" />
            <button className="btn btn-danger btn-small" onClick={async () => { if (confirm(`「${goal.title}」を削除しますか？`)) { await del(`/goals/${goal.id}`); onChange(); } }}>目標を削除</button>
          </div>
        </div>
      )}
    </div>
  );
}
