/* ArixGear storefront service worker (Task 42 — PWA pack · Phase 7 rebrand).
   Strategy:
   - navigations (HTML)  → network-first, cache fallback ("/" shell) for offline
   - /api/ + cross-origin → network only (never cache commerce data)
   - same-origin assets (js/css/img/fonts) → stale-while-revalidate
   Version bump ARIX_CACHE to invalidate everything.                       */
const VERSION = 'arix-v4';
const SHELL = ['/', '/manifest.webmanifest', '/pwa-icon-192.png', '/pwa-icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => {}) /* a failed precache must not block install */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // never touch POST/PATCH…
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // fonts CDN etc → network
  if (url.pathname.startsWith('/api/')) return;        // commerce data → network only
  if (url.pathname.startsWith('/admin')) return;       // admin SPA → network only

  /* navigations: network-first with offline shell fallback */
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  /* static assets: stale-while-revalidate */
  e.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});

/* ---------- Task 57 — admin web-push ----------
   The push channel rides this same SW (scope '/'), so the admin console at
   /admin receives notifications too. Payload: { title, body, link, tag }. */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { try { data = { title: 'ArixGear', body: e.data && e.data.text() }; } catch (_) {} }
  e.waitUntil(self.registration.showNotification(data.title || 'ArixGear', {
    body: data.body || '',
    tag: data.tag || 'arix',
    icon: '/pwa-icon-192.png',
    badge: '/arix-bell.png',
    data: { link: data.link || '/admin' },
    vibrate: [80, 40, 80],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '/admin';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.includes('/admin')) { c.focus(); try { c.navigate ? c.navigate(link) : c.postMessage({ cmd: 'navigate', link }); } catch (_) {} return; }
    }
    return self.clients.openWindow(link);
  }));
});
