/* global self, clients */
/**
 * Custom service-worker code imported by the Workbox SW that
 * `@ducanh2912/next-pwa` generates. We add ONLY the pieces Workbox doesn't:
 *
 *   1. `push` listener — turns server-pushed JSON into a system notification.
 *   2. `notificationclick` — focuses an existing tab pointing at the same
 *      URL or opens a new one. Crucial UX so order-status pings don't pile
 *      up new tabs every time the customer taps them.
 *
 * Payload contract (set by the API in `PushProvider.send`):
 *   { title: string, body: string, url?: string, icon?: string }
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Feastpot', body: event.data.text() };
  }

  const title = payload.title || 'Feastpot';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/' },
    // Respect quiet hours by default — the user's OS will collapse banner
    // sounds during DND. We never explicitly set `silent: true` because
    // delivery-status pings ARE timely.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || '/';

  // SECURITY: never open a cross-origin URL from a push payload — a
  // compromised or spoofed payload would otherwise weaponise notifications
  // into one-tap drive-by navigations. Resolve against our own origin and
  // fall back to "/" if the resolved URL escapes it.
  let target;
  try {
    const resolved = new URL(rawUrl, self.location.origin);
    target = resolved.origin === self.location.origin ? resolved.href : self.location.origin + '/';
  } catch {
    target = self.location.origin + '/';
  }

  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (client.url === target && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
      return undefined;
    })(),
  );
});
