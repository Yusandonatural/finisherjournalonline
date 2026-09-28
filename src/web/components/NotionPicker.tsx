import { useEffect, useMemo, useState } from 'react';
import { api, post } from '../api';
import { Loading, Modal } from './ui';

interface Candidate {
  pageId: string;
  title: string;
  status: string | null;
  priority: string | null;
  tags: string[];
  places: string[];
  url: string;
}

export function NotionPicker({ date, onClose, onPicked }: { date: string; onClose: () => void; onPicked: () => void }) {
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<Candidate[]>('/notion/candidates').then(setItems).catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((i) => !s || [i.title, ...i.tags, ...i.places, i.status ?? ''].join(' ').toLowerCase().includes(s));
  }, [items, q]);

  async function pick(c: Candidate) {
    setBusy(c.pageId);
    try {
      await post(`/days/${date}/tasks/from-notion`, { page_id: c.pageId });
      onPicked();
      onClose();
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <Modal title="Notion の Todo リストから選ぶ" onClose={onClose} wide>
      <p className="muted small">Inbox・今週の対応事項・今月対応予定・未着手 の行から選べます。選んだ行には今日の日付とタグ「目標達成ジャーナル」が付きます。</p>
      <input className="search" placeholder="キーワード・タグ・場所で絞り込み" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {error && <p className="form-error">{error}</p>}
      {!items && !error && <Loading />}
      <ul className="picker-list">
        {shown.map((c) => (
          <li key={c.pageId}>
            <button type="button" onClick={() => pick(c)} disabled={!!busy}>
              <span className="picker-title">{c.title}</span>
              <span className="picker-meta">
                {c.priority && <span className={`chip ${c.priority.startsWith('高') ? 'chip-warn' : ''}`}>{c.priority}</span>}
                {c.status && <span className="chip">{c.status}</span>}
                {[...c.tags, ...c.places].slice(0, 4).map((t) => (
                  <span key={t} className="chip chip-soft">{t}</span>
                ))}
              </span>
              {busy === c.pageId && <span className="muted small">追加中…</span>}
            </button>
          </li>
        ))}
        {items && shown.length === 0 && <li className="muted">該当する行がありません</li>}
      </ul>
    </Modal>
  );
}
