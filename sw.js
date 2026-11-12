// Service worker: makes the app work offline.
// Strategy: answer from the cache straight away, and fetch a fresh copy in
// the background so the next launch has the newest version.
// When adding a new file to the app, add it to FILES below.

const CACHE = 'fittrack-v9';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'assets/fonts/sofia-condensed.woff2',
  'assets/fonts/sofia-condensed-italic.woff2',
  'assets/fonts/instrument-sans.woff2',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
  'js/app.js',
  'js/version.js',
  'js/defaults.js',
  'js/db.js',
  'js/state.js',
  'js/lib/dom.js',
  'js/lib/dates.js',
  'js/logic/day.js',
  'js/plan-service.js',
  'js/lift-service.js',
  'js/cloud.js',
  'js/push.js',
  'js/backup-service.js',
  'js/lib/photo.js',
  'js/game-service.js',
  'js/engine/game.js',
  'js/ui/game.js',
  'js/ui/medal.js',
  'js/ui/celebrate.js',
  'js/engine/overload.js',
  'js/ui/trainnav.js',
  'js/ui/chart.js',
  'js/sheets/exercise.js',
  'js/screens/lifting.js',
  'js/screens/routine.js',
  'js/screens/exercise.js',
  'js/screens/workout.js',
  'js/screens/stretches.js',
  'js/engine/plan.js',
  'js/engine/schedule.js',
  'js/engine/zones.js',
  'js/engine/adjust.js',
  'js/ui/session.js',
  'js/sheets/log.js',
  'js/sheets/session.js',
  'js/screens/train.js',
  'js/ui/icons.js',
  'js/ui/ring.js',
  'js/ui/sheet.js',
  'js/ui/toast.js',
  'js/sheets/water.js',
  'js/sheets/supps.js',
  'js/sheets/sleep.js',
  'js/screens/today.js',
  'js/screens/sleep.js',
  'js/screens/me.js',
  'js/screens/settings.js',
  'js/screens/food.js',
  'js/sheets/food.js',
  'js/food-service.js',
  'js/logic/food.js',
  'js/logic/backup.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      return (await fresh) || new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});

// ---------- push notifications (sent by the Cloudflare Worker) ----------

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* not JSON: show a plain notification */ }
  event.waitUntil(self.registration.showNotification(data.title || 'Fitness Tracker', {
    body: data.body || 'Open the app to check in.',
    tag: data.tag || 'fittrack',
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/icon-192.png',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow('./');
    })
  );
});
