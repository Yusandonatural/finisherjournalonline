// SNS風の画面で使う線のアイコン（24px、currentColor）
type P = { size?: number; filled?: boolean };
const base = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const IconHome = ({ size, filled }: P) => (
  <svg {...base(size)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill={filled ? 'currentColor' : 'none'} /></svg>
);
export const IconFeed = ({ size, filled }: P) => (
  <svg {...base(size)}><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill={filled ? 'currentColor' : 'none'} /><path d="M3.5 9h17M9 3.5v17" stroke={filled ? 'var(--surface)' : 'currentColor'} /></svg>
);
export const IconWeek = ({ size, filled }: P) => (
  <svg {...base(size)}><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill={filled ? 'currentColor' : 'none'} /><path d="M3.5 10h17M8 3v4M16 3v4" stroke={filled ? 'var(--surface)' : 'currentColor'} /><path d="M7 14h10" stroke={filled ? 'var(--surface)' : 'currentColor'} /></svg>
);
export const IconMonth = ({ size, filled }: P) => (
  <svg {...base(size)}><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill={filled ? 'currentColor' : 'none'} /><path d="M3.5 10h17M8 3v4M16 3v4" stroke={filled ? 'var(--surface)' : 'currentColor'} /><g fill={filled ? 'var(--surface)' : 'currentColor'} stroke="none"><circle cx="8" cy="14" r="1.1" /><circle cx="12" cy="14" r="1.1" /><circle cx="16" cy="14" r="1.1" /><circle cx="8" cy="17.5" r="1.1" /><circle cx="12" cy="17.5" r="1.1" /></g></svg>
);
export const IconFlag = ({ size, filled }: P) => (
  <svg {...base(size)}><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill={filled ? 'currentColor' : 'none'} /></svg>
);
export const IconUser = ({ size, filled }: P) => (
  <svg {...base(size)}><circle cx="12" cy="8" r="4" fill={filled ? 'currentColor' : 'none'} /><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" fill={filled ? 'currentColor' : 'none'} /></svg>
);
export const IconGear = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const IconHeart = ({ size, filled }: P) => (
  <svg {...base(size)}><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.9 3.8 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.5 0 5.7 3.4 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" fill={filled ? 'currentColor' : 'none'} /></svg>
);
export const IconCamera = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.6" /></svg>
);
export const IconOpen = ({ size }: P) => (
  <svg {...base(size)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
);
export const IconGrid = ({ size }: P) => (
  <svg {...base(size)}><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></svg>
);
export const IconList = ({ size }: P) => (
  <svg {...base(size)}><rect x="4" y="3.5" width="16" height="8" rx="2" /><path d="M4 15.5h16M4 19.5h10" /></svg>
);
export const IconClose = ({ size }: P) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
