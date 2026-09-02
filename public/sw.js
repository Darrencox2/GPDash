// GPDash service worker.
//
// Exists to:
//   1. complete the installable-app criteria,
//   2. carry the push/notification handlers for future alerts, and
//   3. keep a read-only copy of the app for when the surgery wifi drops.
//
// Since v4.162 it ALSO keeps the last good copy of the app shell, its
// static files and the two data reads, and hands those back only when the
// network fails. Network first, always: a deployed build is never shadowed,
// because the cache is consulted only after the live request has failed.
// That is the difference between this and the classic stale-PWA failure.
const CACHE = 'gpdash-offline-v1';
const CACHEABLE = (url) =>
  url.origin === self.location.origin && (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/dashboard' || url.pathname === '/launch' || url.pathname === '/' ||
    url.pathname === '/api/v4/data' || url.pathname === '/api/v4/huddle-data'
  );

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith('gpdash-offline-') && n !== CACHE).map((n) => caches.delete(n)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!CACHEABLE(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const live = await fetch(req);
      if (live && live.ok) {
        // Stamp when it was saved, so the app can say how old the copy is.
        const headers = new Headers(live.headers);
        headers.set('X-GPDash-Cached-At', new Date().toISOString());
        const body = await live.clone().arrayBuffer();
        cache.put(req, new Response(body, { status: live.status, statusText: live.statusText, headers })).catch(() => {});
      }
      return live;
    } catch (err) {
      const hit = await cache.match(req, { ignoreVary: true });
      if (!hit) throw err;
      const headers = new Headers(hit.headers);
      headers.set('X-GPDash-Offline', hit.headers.get('X-GPDash-Cached-At') || '');
      const body = await hit.arrayBuffer();
      return new Response(body, { status: hit.status, statusText: hit.statusText, headers });
    }
  })());
});

// ── Push (wired up when server-side alerts ship) ────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { title: 'GPDash', body: event.data.text() }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'GPDash', {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
    return self.clients.openWindow(url);
  }));
});
