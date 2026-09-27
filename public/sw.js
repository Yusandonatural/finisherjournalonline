// 最小の Service Worker: 画面の読み込みはネット優先、つながらないときだけキャッシュを使う。
// API とログインはキャッシュしない。
const CACHE = 'fj-shell-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest'])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/login')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (e.request.mode === 'navigate' || url.pathname.startsWith('/assets/'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request.mode === 'navigate' ? '/' : e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request.mode === 'navigate' ? '/' : e.request).then((r) => r || Response.error())),
  );
});
