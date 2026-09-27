import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const load = useCallback(
    async (quiet = false) => {
      if (!path) return;
      const n = ++seq.current;
      if (!quiet) setLoading(true);
      try {
        const d = await api<T>(path);
        if (n === seq.current) {
          setData(d);
          setError(null);
        }
      } catch (e: any) {
        if (n === seq.current) setError(e.message);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  return { data, error, loading, reload: () => load(true), setData };
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function readDraft<T>(key?: string): T | null {
  if (!key) return null;
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string | undefined, value: unknown) {
  if (!key) return;
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * 入力が止まって delay ミリ秒後に保存する。
 * 保存が済むまでは端末内に下書きを残し、ページを閉じる瞬間は sendBeacon でも送る。
 * 送信が届かなかった場合も、次にページを開いたとき takeDraft() で取り戻せる。
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 1000, beaconUrl?: string, draftKey?: string) {
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState('saving');
    try {
      await saveRef.current(p.value);
      // 保存中に新しい入力がなければ下書きを消す
      if (!(pending.current as { value: T } | null)) writeDraft(draftKey, null);
      setState('saved');
    } catch {
      // 失敗した分は次の保存に含める
      const later = pending.current as { value: T } | null;
      const merged = later ? { ...(p.value as object), ...(later.value as object) } : p.value;
      pending.current = { value: merged as T };
      writeDraft(draftKey, merged);
      setState('error');
    }
  }, []);

  const schedule = useCallback(
    (value: T) => {
      // 保存前の変更は捨てずにまとめる（別の欄を続けて編集しても落とさない）
      const prev = pending.current?.value;
      const mergeable = prev && typeof prev === 'object' && !Array.isArray(prev) && typeof value === 'object' && !Array.isArray(value);
      pending.current = { value: mergeable ? ({ ...(prev as object), ...(value as object) } as T) : value };
      writeDraft(draftKey, pending.current.value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    // タブを閉じる・再読み込みするとき: 通常の通信は途中で切られるので sendBeacon で送り切る
    const onHide = () => {
      const p = pending.current;
      if (!p) return;
      if (beaconUrl && navigator.sendBeacon?.(beaconUrl, new Blob([JSON.stringify(p.value)], { type: 'text/plain' }))) {
        pending.current = null;
        if (timer.current) clearTimeout(timer.current);
      } else {
        void flush();
      }
    };
    // アプリを切り替えたとき（スマホ）: ページは生きているので普通に保存する
    const onVis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
      void flush();
    };
  }, [flush, beaconUrl]);

  /** 前回保存しきれなかった下書きを取り出す（取り出したら保存を予約する） */
  const takeDraft = useCallback((): T | null => {
    const d = readDraft<T>(draftKey);
    if (d) schedule(d);
    return d;
  }, [draftKey, schedule]);

  return { schedule, flush, state, takeDraft };
}

export function useLocalFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(key);
      return s === null ? initial : s === '1';
    } catch {
      return initial;
    }
  });
  const set = (nv: boolean) => {
    setV(nv);
    try {
      localStorage.setItem(key, nv ? '1' : '0');
    } catch {}
  };
  return [v, set];
}
