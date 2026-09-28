import { useState } from 'react';
import { del, patch, post, put } from '../api';
import { ErrorBox, Loading, SaveBadge } from '../components/ui';
import { useApi, useAutosave } from '../hooks';

const CATEGORIES = ['仕事', '家族', '健康', '学び', '暮らし', 'お金', '心'];

export function LifePage() {
  const { data, error, reload } = useApi<any>('/life');
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return <LifeView data={data} reload={reload} />;
}

function LifeView({ data, reload }: { data: any; reload: () => void }) {
  const [vision, setVision] = useState<string>(data.vision);
  const save = useAutosave((v: { vision: string }) => put('/life', v), 800, '/api/life', 'fj.draft.life');
  const active = data.goals.filter((g: any) => !g.achieved_at);
  const achieved = data.goals.filter((g: any) => g.achieved_at);

  return (
    <div className="page narrow-wide life-page">
      <header className="life-hero">
        <p className="life-eyebrow">人生の目標</p>
        <h1 className="page-title">どんな人生をやりきるか</h1>
        <p className="muted">3ヶ月の目標は、ここに書いた人生の目標に近づくための一歩です。ビジョンは毎日のページの一番上に表示されます。</p>
      </header>

      <section className="card vision-card">
        <div className="card-head">
          <h2 className="card-title">人生のビジョン</h2>
          <SaveBadge state={save.state} />
        </div>
        <textarea
          className="vision-input"
          rows={2}
          value={vision}
          placeholder="例: 自然と共に生き、自然茶の豊かさを世界に届ける"
          onChange={(e) => {
            setVision(e.target.value);
            save.schedule({ vision: e.target.value });
          }}
        />
      </section>

      <section className="card">
        <h2 className="card-title">人生の目標</h2>
        {active.length === 0 && <p className="muted">まだありません。いつか必ずやりきりたいことを書いてみましょう。</p>}
        <ul className="life-list">
          {active.map((g: any, i: number) => (
            <LifeGoalItem key={g.id} goal={g} first={i === 0} last={i === active.length - 1} onChange={reload} />
          ))}
        </ul>
        <AddLifeGoal onAdded={reload} />
      </section>

      {achieved.length > 0 && (
        <section className="card">
          <h2 className="card-title">達成した人生の目標 <span className="count">{achieved.length}</span></h2>
          <ul className="life-list">
            {achieved.map((g: any) => (
              <LifeGoalItem key={g.id} goal={g} first last onChange={reload} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AddLifeGoal({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  async function add() {
    if (!title.trim()) return;
    await post('/life/goals', { title, category });
    setTitle('');
    onAdded();
  }
  return (
    <form className="add-row life-add" onSubmit={(e) => (e.preventDefault(), add())}>
      <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="分野">
        <option value="">分野</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 自然茶を世界20か国に届ける" aria-label="新しい人生の目標" />
      <button className="btn btn-primary" disabled={!title.trim()}>追加</button>
    </form>
  );
}

function LifeGoalItem({ goal, first, last, onChange }: { goal: any; first: boolean; last: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: goal.title, note: goal.note ?? '', target_year: goal.target_year ?? '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = async (p: Record<string, unknown>) => {
    await patch(`/life/goals/${goal.id}`, p);
    onChange();
  };
  const done = !!goal.achieved_at;
  return (
    <li className={`life-item ${done ? 'achieved' : ''}`}>
      <div className="life-row">
        <input type="checkbox" checked={done} onChange={() => save({ achieved: !done })} aria-label="達成" />
        <div className="life-main">
          <input
            className="life-title"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            onBlur={() => f.title.trim() && f.title !== goal.title && save({ title: f.title })}
            aria-label="人生の目標"
          />
          <div className="life-meta">
            {goal.category && <span className="chip chip-soft">{goal.category}</span>}
            {goal.target_year && <span className="chip chip-soft">{goal.target_year}年まで</span>}
            {done && <span className="chip chip-good">{goal.achieved_at.replace(/-/g, '/')} 達成</span>}
          </div>
        </div>
        {!done && (
          <>
            <button className="icon-btn" disabled={first} aria-label="上へ" onClick={async () => { await post(`/life/goals/${goal.id}/move`, { dir: -1 }); onChange(); }}>↑</button>
            <button className="icon-btn" disabled={last} aria-label="下へ" onClick={async () => { await post(`/life/goals/${goal.id}/move`, { dir: 1 }); onChange(); }}>↓</button>
          </>
        )}
        <button className="btn btn-small btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '閉じる' : '詳細'}</button>
      </div>
      {goal.note && !open && <p className="life-note">{goal.note}</p>}
      {open && (
        <div className="form life-detail">
          <div className="form-row">
            <label>
              分野
              <select value={goal.category ?? ''} onChange={(e) => save({ category: e.target.value })}>
                <option value="">なし</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              いつまでに（年）
              <input type="number" inputMode="numeric" value={f.target_year} placeholder="2035" onChange={(e) => setF({ ...f, target_year: e.target.value })} onBlur={() => String(f.target_year) !== String(goal.target_year ?? '') && save({ target_year: f.target_year })} />
            </label>
          </div>
          <label>
            なぜ・どんな姿になっていたいか
            <textarea rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onBlur={() => f.note !== (goal.note ?? '') && save({ note: f.note })} />
          </label>
          <div className="form-actions">
            <span className="spacer" />
            {confirmDelete ? (
              <>
                <span className="small muted">本当に削除しますか？</span>
                <button className="btn btn-small" onClick={() => setConfirmDelete(false)}>やめる</button>
                <button className="btn btn-small btn-danger" onClick={async () => { await del(`/life/goals/${goal.id}`); onChange(); }}>削除する</button>
              </>
            ) : (
              <button className="btn btn-small btn-danger" onClick={() => setConfirmDelete(true)}>削除</button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
