/* arixgear.tech admin — minimal service worker for Web Push.
   Step 2 audit fix: the admin SPA never registered a SW, so pushManager
  .subscribe could never resolve (the enable button hung forever). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title || 'ArixGear', {
    body: data.body || 'New activity in the admin console',
    icon: '/admin/pwa-icon-192.png',
    data: { url: data.url || '/admin' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data && event.notification.data.url || '/admin/'));
});
