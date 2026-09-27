import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SaveState } from '../hooks';
import type { TaskStats } from '../../shared/progress';

export function Progress({ value, tone }: { value: number; tone?: 'warn' | 'gold' }) {
  return (
    <div className={`progress ${tone ?? ''}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function SaveBadge({ state }: { state: SaveState }) {
  const label = { idle: '', saving: '保存中…', saved: '保存しました', error: '保存できませんでした' }[state];
  return <span className={`save-badge ${state}`} aria-live="polite">{label}</span>;
}

export function Loading() {
  return <div className="loading">読み込み中…</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box">
      <p>{message}</p>
      {onRetry && <button className="btn" onClick={onRetry}>もう一度</button>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function pct(v: number | null | undefined) {
  return v == null ? '—' : `${v}%`;
}

export function TaskStatsLine({ s }: { s: TaskStats }) {
  return (
    <span className="muted">
      できた {s.done} ／ できなかった {s.missed + s.carried} ／ 未着手 {s.todo}
    </span>
  );
}

export function SubTabs({ items }: { items: { to: string; label: string; active: boolean }[] }) {
  return (
    <nav className="subtabs" aria-label="表示の切り替え">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className={i.active ? 'active' : ''} aria-current={i.active ? 'page' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function Stars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="stars" role="radiogroup" aria-label="自己評価">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          className={value != null && n <= value ? 'on' : ''}
          onClick={() => onChange(value === n ? null : n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
