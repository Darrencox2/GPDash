// GPDash service worker.
//
// Deliberately has NO fetch handler: we never intercept or cache app
// requests, so a deployed build can never be shadowed by a stale cache
// (the classic PWA failure mode). It exists to:
//   1. complete the installable-app criteria, and
//   2. carry the push/notification handlers for future alerts.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
