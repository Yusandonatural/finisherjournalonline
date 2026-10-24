// 画面のスタイル（ノート風／SNS風）。設定に保存し、この端末にも覚えて最初の表示から反映する
import { useEffect, useState } from 'react';

export type UiStyle = 'note' | 'sns';
const KEY = 'fj.uiStyle';

function read(): UiStyle {
  try {
    return localStorage.getItem(KEY) === 'sns' ? 'sns' : 'note';
  } catch {
    return 'note';
  }
}

let current: UiStyle = read();
const subs = new Set<(s: UiStyle) => void>();

export function initStyle() {
  document.documentElement.dataset.style = current;
}

export function applyStyle(s: UiStyle) {
  if (s !== 'sns' && s !== 'note') return;
  current = s;
  document.documentElement.dataset.style = s;
  try {
    localStorage.setItem(KEY, s);
  } catch {}
  subs.forEach((f) => f(s));
}

export function useUiStyle(): UiStyle {
  const [s, set] = useState(current);
  useEffect(() => {
    subs.add(set);
    set(current);
    return () => {
      subs.delete(set);
    };
  }, []);
  return s;
}
