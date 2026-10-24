import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { mondayOf, monthStart, todayJST } from '../../shared/dates';
import { api } from '../api';
import { applyStyle, useUiStyle } from '../style';
import { IconFeed, IconFlag, IconGear, IconHome, IconMonth, IconUser, IconWeek } from './icons';

export function Layout() {
  const { pathname } = useLocation();
  // 見ている日付を基準にタブを切り替える（11月の週を見ていれば「月間」は11月を開く）
  const m = pathname.match(/^\/(day|week|month)\/(\d{4}-\d{2}-\d{2})/);
  const anchor = m ? m[2] : todayJST();
  const style = useUiStyle();
  const sns = style === 'sns';
  const TABS = [
    { to: '/today', match: '/day', label: '今日', icon: '日', Svg: IconHome },
    ...(sns ? [{ to: '/feed', match: '/feed', label: 'フィード', icon: '投', Svg: IconFeed }] : []),
    { to: `/week/${mondayOf(anchor)}`, match: '/week', label: '週間', icon: '週', Svg: IconWeek },
    { to: `/month/${monthStart(anchor)}`, match: '/month', label: '月間', icon: '月', Svg: IconMonth },
    { to: `/term?date=${anchor}`, match: '/term', label: '3ヶ月', icon: '期', Svg: IconFlag },
    { to: '/life', match: '/life', label: '人生', icon: '生', Svg: IconUser },
  ];
  // 設定に保存された画面のスタイルに合わせる（別の端末で変えた場合も）
  useEffect(() => {
    api<any>('/me').then((me) => me?.settings?.uiStyle && applyStyle(me.settings.uiStyle)).catch(() => {});
  }, []);
  // 上のバーの高さを CSS に渡す（目標の帯をその下に貼り付けるため）
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const active = (m: string) => pathname.startsWith(m) || (m === '/term' && pathname.startsWith('/terms'));
  return (
    <div className="app">
      <header className="topbar" ref={bar}>
        <NavLink to="/today" className="brand">
          <img className="brand-mark" src="/icon.svg" alt="" width="28" height="28" />
          <span className="brand-text">
            <span className="brand-name">目標達成ジャーナル</span>
            <span className="brand-sub">90日の挑戦</span>
          </span>
        </NavLink>
        <nav className="tabs" aria-label="メイン">
          {TABS.map((t) => (
            <NavLink key={t.match} to={t.to} className={active(t.match) ? 'active' : ''}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/settings" className={`settings-link ${pathname.startsWith('/settings') ? 'active' : ''}`} aria-label="設定">
          {sns ? <IconGear size={22} /> : '設定'}
        </NavLink>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <nav className="bottombar" aria-label="メイン">
        {TABS.map((t) => (
          <NavLink key={t.match} to={t.to} className={active(t.match) ? 'active' : ''} aria-label={t.label}>
            {sns ? (
              <span className="bb-svg" aria-hidden="true"><t.Svg size={26} filled={active(t.match)} /></span>
            ) : (
              <span className="bb-icon" aria-hidden="true">{t.icon}</span>
            )}
            <span className="bb-label">{t.label}</span>
          </NavLink>
        ))}
        {!sns && (
          <NavLink to="/settings" className={pathname.startsWith('/settings') ? 'active' : ''}>
            <span className="bb-icon" aria-hidden="true">⚙</span>
            <span>設定</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}
