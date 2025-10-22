/* ----------- Firefighter Polabear Service Worker ----------- */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `ps-${CACHE_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './envelopes.html',
  './plant.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './data/notes.json',
  './data/envelopes.json',
  './data/plant.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// On install, pre-cache the core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// On activate, clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key.startsWith('ps-') && key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (req.destination === 'document' || req.destination === 'script' || req.destination === 'style' || req.destination === 'image' || req.destination === 'font') {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(req));
    return;
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) {
    fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); }).catch(()=>{});
    return cached;
  }
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response('[]', { headers: { 'Content-Type': 'application/json' }});
  }
}
