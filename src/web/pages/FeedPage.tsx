import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { WEEKDAYS_JA, weekday } from '../../shared/dates';
import { api, put } from '../api';
import { IconGrid, IconHeart, IconList, IconOpen } from '../components/icons';
import { usePhotoUrl, type PhotoInfo } from '../components/Photo';
import { ErrorBox, Loading } from '../components/ui';
import { useApi, useLocalFlag } from '../hooks';

const dateLabel = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8))}日（${WEEKDAYS_JA[weekday(d)]}）`;

/** フィード：日々の記録を投稿のように新しい順に。上にプロフィールと写真のグリッド */
export function FeedPage() {
  const profile = useApi<any>('/profile');
  const [grid, setGrid] = useLocalFlag('fj.feedGrid', false);
  if (profile.error) return <ErrorBox message={profile.error} onRetry={profile.reload} />;
  if (!profile.data) return <Loading />;
  const p = profile.data;

  return (
    <div className="page feed-page">
      <header className="profile">
        <Avatar name={p.user.name} picture={p.user.picture} big />
        <div className="profile-main">
          <h1 className="profile-name">{p.user.name || p.user.email}</h1>
          <ul className="profile-stats">
            <li><strong>{p.stats.days}</strong>記録した日</li>
            <li><strong>{p.stats.photos}</strong>写真</li>
            <li><strong>{p.stats.favorites}</strong>お気に入り</li>
          </ul>
        </div>
        {p.vision && <p className="profile-bio">{p.vision}</p>}
        {p.term && (
          <p className="profile-term muted small">
            {p.term.title}{p.term.info.dayNumber ? ` ・ Day ${p.term.info.dayNumber} / ${p.term.info.totalDays}` : ''}
          </p>
        )}
      </header>

      <div className="feed-switch" role="tablist" aria-label="表示">
        <button type="button" role="tab" aria-selected={!grid} className={grid ? '' : 'active'} onClick={() => setGrid(false)} aria-label="投稿"><IconList /></button>
        <button type="button" role="tab" aria-selected={grid} className={grid ? 'active' : ''} onClick={() => setGrid(true)} aria-label="写真"><IconGrid /></button>
      </div>

      {grid ? <PhotoGrid photos={p.photos} /> : <Feed user={p.user} onFavorite={profile.reload} />}
    </div>
  );
}

export function Avatar({ name, picture, big }: { name?: string | null; picture?: string | null; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || '？').trim().slice(0, 1);
  return (
    <span className={`avatar ${big ? 'big' : ''}`} aria-hidden="true">
      {picture && !broken ? <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span>{initial}</span>}
    </span>
  );
}

function PhotoGrid({ photos }: { photos: any[] }) {
  if (photos.length === 0) return <p className="feed-empty muted">まだ写真がありません。今日のページの「今日の1枚」から追加できます。</p>;
  return (
    <div className="photo-grid">
      {photos.map((ph) => (
        <GridCell key={ph.date} date={ph.date} photo={ph} />
      ))}
    </div>
  );
}

function GridCell({ date, photo }: { date: string; photo: PhotoInfo }) {
  const url = usePhotoUrl(date, photo);
  return (
    <Link to={`/day/${date}`} className="grid-cell" aria-label={`${dateLabel(date)}のページ`}>
      {url && <img src={url} alt="" loading="lazy" />}
      <span className="grid-date">{Number(date.slice(5, 7))}/{Number(date.slice(8))}</span>
    </Link>
  );
}

function Feed({ user, onFavorite }: { user: any; onFavorite: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const more = useRef<HTMLDivElement>(null);

  const load = useCallback(async (before?: string | null) => {
    setLoading(true);
    try {
      const r = await api<any>(`/feed${before ? `?before=${before}` : ''}`);
      setItems((xs) => (before ? [...xs, ...r.items] : r.items));
      setNext(r.next);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 下まで来たら続きを読む
  useEffect(() => {
    const el = more.current;
    if (!el || !next || loading) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && load(next), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loading, load]);

  if (error && items.length === 0) return <ErrorBox message={error} onRetry={() => load()} />;
  if (next === undefined) return <Loading />;
  if (items.length === 0) return <p className="feed-empty muted">まだ記録がありません。今日のページに書くと、ここに並びます。</p>;

  return (
    <div className="feed">
      {items.map((it) => (
        <Post
          key={it.date}
          item={it}
          user={user}
          onFavorite={(fav) => {
            setItems((xs) => xs.map((x) => (x.date === it.date ? { ...x, favorite: fav } : x)));
            onFavorite();
          }}
        />
      ))}
      <div ref={more} className="feed-more">
        {next ? <button type="button" className="btn btn-small" disabled={loading} onClick={() => load(next)}>{loading ? '読み込み中…' : 'もっと見る'}</button> : <span className="muted small">ここまでです</span>}
      </div>
    </div>
  );
}

function Post({ item, user, onFavorite }: { item: any; user: any; onFavorite: (fav: boolean) => void }) {
  const url = usePhotoUrl(item.date, item.photo);
  const [pop, setPop] = useState(false);

  async function fav(v: boolean) {
    onFavorite(v);
    if (v) {
      setPop(true);
      setTimeout(() => setPop(false), 700);
    }
    try {
      await put(`/days/${item.date}`, { favorite: v });
    } catch {
      onFavorite(!v);
    }
  }

  return (
    <article className="post">
      <header className="post-head">
        <Avatar name={user.name} picture={user.picture} />
        <span className="post-who">
          <strong>{dateLabel(item.date)}</strong>
          <span className="muted small">{item.dayNumber ? `Day ${item.dayNumber}` : item.termTitle ?? ''}{item.completed ? ' ・ 記入完了' : ''}</span>
        </span>
        <Link to={`/day/${item.date}`} className="post-open" aria-label="この日のページを開く"><IconOpen size={20} /></Link>
      </header>

      {item.photo && (
        <div className="post-photo" style={{ aspectRatio: item.photo.width && item.photo.height ? `${item.photo.width} / ${item.photo.height}` : '1 / 1' }} onDoubleClick={() => !item.favorite && fav(true)}>
          {url && <img src={url} alt={`${dateLabel(item.date)}の写真`} loading="lazy" />}
          {pop && <span className="post-pop" aria-hidden="true"><IconHeart size={88} filled /></span>}
        </div>
      )}

      <div className="post-actions">
        <button type="button" className={`post-like ${item.favorite ? 'on' : ''}`} aria-pressed={item.favorite} aria-label="お気に入り" onClick={() => fav(!item.favorite)}>
          <IconHeart filled={item.favorite} />
        </button>
        <span className="post-badges">
          {item.lockin && <span className={`badge ${item.lockin.kept === item.lockin.total ? 'good' : ''}`}>ロックイン {item.lockin.kept}/{item.lockin.total}</span>}
          {item.habits && <span className="badge">習慣 {item.habits.done}/{item.habits.total}</span>}
          {item.done.length > 0 && <span className="badge good">できた {item.done.length}</span>}
        </span>
      </div>

      <div className="post-body">
        {item.memo && <p className="post-caption"><strong>{user.name || '自分'}</strong> {item.memo}</p>}
        {item.focus && <p className="post-line"><span className="muted">集中：</span>{item.focus}</p>}
        {item.goods.length > 0 && (
          <ul className="post-goods">
            {item.goods.map((g: string, i: number) => <li key={i}>{g}</li>)}
          </ul>
        )}
        {item.done.length > 0 && (
          <p className="post-tags">{item.done.map((t: string, i: number) => <span key={i}>✓ {t}</span>)}</p>
        )}
        {item.progress && <p className="post-line"><span className="muted">進み具合：</span>{item.progress}</p>}
        {item.event && <p className="post-line muted small">イベントの日{item.event.title ? `：${item.event.title}` : ''}</p>}
      </div>
    </article>
  );
}
