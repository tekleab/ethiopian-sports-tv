const CACHE_NAME = 'et-sports-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './app-v3.js',
  './icon-192.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Never cache live manifests, video chunks, or APIs
  if (
    e.request.url.includes('.m3u8') ||
    e.request.url.includes('.ts') ||
    e.request.url.includes('/api/') ||
    e.request.url.includes('stream') ||
    e.request.url.includes('scoreboard')
  ) {
    return;
  }

  // Network-first strategy for everything: always try network first!
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
