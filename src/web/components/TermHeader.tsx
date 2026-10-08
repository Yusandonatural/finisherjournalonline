import { Link } from 'react-router-dom';
import { shortDate } from '../../shared/dates';
import { SubTabs } from './ui';

export function TermHeader({ term, tab }: { term: any; tab: 'progress' | 'tasks' | 'review' | 'goals' | 'lockin' }) {
  const info = term.info;
  const base = `/term/${term.id}`;
  return (
    <>
      <header className="period-header">
        {term.prevTerm ? <Link className="icon-btn" to={`/term/${term.prevTerm.id}`} aria-label="前のターム">‹</Link> : <span />}
        <div>
          <h1 className="page-title">{term.title}</h1>
          <p className="muted small">
            {shortDate(term.start_date)}〜{shortDate(term.end_date)}（{info.totalDays}日）
            {info.phase === 'active' && ` ・ Day ${info.dayNumber} ・ 残り ${info.daysLeft}日`}
            {info.phase === 'upcoming' && ` ・ 開始まであと ${info.daysUntilStart}日`}
            {info.phase === 'ended' && ' ・ 終了'}
          </p>
        </div>
        {term.nextTerm ? <Link className="icon-btn" to={`/term/${term.nextTerm.id}`} aria-label="次のターム">›</Link> : <span />}
      </header>
      <div className="period-toolbar">
        <SubTabs
          items={[
            { to: base, label: '進捗', active: tab === 'progress' },
            { to: `${base}/tasks`, label: 'タスク台帳', active: tab === 'tasks' },
            { to: `${base}/review`, label: '総括', active: tab === 'review' },
            { to: `${base}/goals`, label: '目標設定', active: tab === 'goals' },
            { to: `${base}/lockin`, label: term.lockin ? 'ロックイン中' : 'ロックイン', active: tab === 'lockin' },
          ]}
        />
        <span className="spacer" />
        <Link className="btn btn-small btn-ghost" to="/terms">ターム一覧</Link>
      </div>
    </>
  );
}
