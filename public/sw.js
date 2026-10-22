const CACHE_NAME = 'et-sports-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './app.js',
  './icon-192.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Never cache live video segments, manifests, or dynamic API responses
  if (
    e.request.url.includes('.m3u8') ||
    e.request.url.includes('.ts') ||
    e.request.url.includes('/api/') ||
    e.request.url.includes('stream') ||
    e.request.url.includes('segment')
  ) {
    return;
  }

  // Network first for HTML navigation
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
