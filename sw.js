// Blokstad service worker: altijd de nieuwste versie van de game (eerst online kijken),
// en een bewaarde kopie gebruiken als er geen internet is.
const CACHE = 'blokstad-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      // 'no-cache': de browser vraagt GitHub altijd of het bestand veranderd is (snel als het hetzelfde is)
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok && !url.pathname.includes('/data/')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const hit = await caches.match(req);
      if (hit) return hit;
      throw new Error('offline');
    }
  })());
});
