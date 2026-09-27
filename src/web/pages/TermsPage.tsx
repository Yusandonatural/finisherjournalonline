import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, addMonths, defaultTermFor, shortDate, termTitle, todayJST } from '../../shared/dates';
import { api, post } from '../api';
import { ErrorBox, Loading, Progress, pct } from '../components/ui';
import { useApi } from '../hooks';

export function TermsPage() {
  const { data, error, reload } = useApi<any[]>('/terms');
  const [q] = useSearchParams();
  const [creating, setCreating] = useState(q.get('new') === '1');
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="page narrow-wide">
      <div className="card-head">
        <h1 className="page-title">ターム一覧</h1>
        {!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}>新しいターム</button>}
      </div>
      {creating && <NewTerm terms={data} fromId={q.get('from')} onCancel={() => setCreating(false)} />}
      <ul className="term-list">
        {data.map((t) => (
          <li key={t.id} className="card">
            <Link to={`/term/${t.id}`} className="term-link">
              <div className="row">
                <strong>{t.title}</strong>
                <span className="chip">{{ upcoming: 'これから', active: '進行中', ended: '終了' }[t.info.phase as string]}</span>
              </div>
              <p className="muted small">{shortDate(t.start_date)}〜{shortDate(t.end_date)}（{t.info.totalDays}日） ・ 目標 {t.goalCount}個 ・ タスク達成率 {pct(t.taskStats.rate)}</p>
              <Progress value={t.info.elapsedPct} tone="gold" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewTerm({ terms, fromId, onCancel }: { terms: any[]; fromId: string | null; onCancel: () => void }) {
  const nav = useNavigate();
  const latest = terms[0];
  const start0 = latest && latest.end_date >= todayJST() ? addDays(latest.end_date, 1) : defaultTermFor(todayJST()).start;
  const end0 = addDays(addMonths(start0, 3), -1);
  const [f, setF] = useState({ start_date: start0, end_date: end0, title: '' });
  const source = terms.find((t) => t.id === fromId) ?? latest;
  const [goals, setGoals] = useState<any[]>([]);
  const [copy, setCopy] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    api(`/terms/${source.id}`).then((t) => {
      setGoals(t.goals);
      setCopy(t.goals.filter((g: any) => g.type === 'habit' || (g.status !== 'achieved' && g.progress < 100 && g.status !== 'cancelled')).map((g: any) => g.id));
    });
  }, [source?.id]);

  async function create() {
    setErr(null);
    try {
      const t = await post('/terms', { ...f, title: f.title || termTitle(f.start_date, f.end_date), copy_goal_ids: copy });
      nav(`/term/${t.id}/goals`);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">新しいターム</h2>
      <div className="form">
        <div className="form-row">
          <label>開始日<input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, end_date: addDays(addMonths(e.target.value, 3), -1) })} /></label>
          <label>終了日<input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></label>
        </div>
        <label>名前<input value={f.title} placeholder={termTitle(f.start_date, f.end_date)} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        {goals.length > 0 && (
          <fieldset>
            <legend>「{source.title}」から引き継ぐ目標</legend>
            {goals.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={copy.includes(g.id)} onChange={(e) => setCopy(e.target.checked ? [...copy, g.id] : copy.filter((x) => x !== g.id))} />
                <span>{g.type === 'habit' ? '習慣: ' : ''}{g.title} <span className="muted small">{g.progress}%</span></span>
              </label>
            ))}
            <p className="muted small">プロジェクトは未完了のマイルストーンだけを引き継ぎます。</p>
          </fieldset>
        )}
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button className="btn" onClick={onCancel}>キャンセル</button>
          <button className="btn btn-primary" onClick={create}>作成して目標を立てる</button>
        </div>
      </div>
    </section>
  );
}
