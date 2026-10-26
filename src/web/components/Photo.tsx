import { useEffect, useRef, useState } from 'react';
import { del } from '../api';
import { IconCamera } from './icons';

export type PhotoInfo = { width: number | null; height: number | null; v: string } | null;

/** 写真を読み込んで表示用の URL にする（デモでも同じ経路で読めるよう fetch を通す） */
export function usePhotoUrl(date: string, photo: PhotoInfo) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return setUrl(null);
    let alive = true;
    let made: string | null = null;
    fetch(`/api/photos/${date}?v=${encodeURIComponent(photo.v)}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!alive || !b) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [date, photo?.v]);
  return url;
}

/** 長辺を max px に縮めた JPEG（base64）にする */
async function shrink(file: File, max: number, quality: number) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ng) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ng(new Error('この写真は読み込めませんでした'));
      i.src = src;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { mime: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), width: w, height: h };
  } finally {
    URL.revokeObjectURL(src);
  }
}

async function upload(date: string, file: File) {
  // デモはブラウザの保存容量が小さいので、さらに小さくする
  const demo = !!(window as any).__FJ_DEMO;
  const body = await shrink(file, demo ? 720 : 1080, demo ? 0.72 : 0.82);
  const res = await fetch(`/api/photos/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-fj': '1' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `エラー (${res.status})`);
  return json as NonNullable<PhotoInfo>;
}

/** 今日の1枚：写真を選ぶ・変える・外す */
export function DayPhotoCard({ date, photo, onChange }: { date: string; photo: PhotoInfo; onChange: (p: PhotoInfo) => void }) {
  const url = usePhotoUrl(date, photo);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await upload(date, file));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <section className={`card photo-card no-swipe ${photo ? '' : 'empty'}`}>
      <div className="card-head">
        <h2 className="card-title">今日の1枚</h2>
        {photo && (
          <span className="row">
            <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => input.current?.click()}>変える</button>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              disabled={busy}
              onClick={async () => {
                if (!confirm('この日の写真を外しますか？')) return;
                await del(`/photos/${date}`);
                onChange(null);
              }}
            >
              外す
            </button>
          </span>
        )}
      </div>
      {photo ? (
        <div className="day-photo" style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : undefined }}>
          {url ? <img src={url} alt={`${date} の写真`} /> : <span className="muted small">読み込み中…</span>}
        </div>
      ) : (
        <button type="button" className="photo-drop" disabled={busy} onClick={() => input.current?.click()}>
          <span className="photo-drop-icon"><IconCamera size={22} /></span>
          <span className="photo-drop-text">
            <strong>{busy ? '保存中…' : '写真を追加'}</strong>
            <span className="muted small">今日を思い出せる1枚を。フィードに並びます</span>
          </span>
        </button>
      )}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {error && <p className="error-text small">{error}</p>}
    </section>
  );
}
