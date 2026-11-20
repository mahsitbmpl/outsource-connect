/* Console service worker: keeps the app shell available; never caches API calls. */
const VERSION = 'osc-console-2.2.0';
const SHELL = [
  './', 'index.html', 'config.js', 'css/app.css', 'js/osc-core.js', 'js/api.js', 'js/ui.js', 'js/state.js', 'js/app.js',
  'js/staff.js', 'js/companies.js', 'js/admin.js', 'js/kiosk-admin.js', 'vendor/read-excel-file-5.8.6.min.js', 'img/logo.png', 'img/mark.png',
  'img/icon-192.png', 'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-500-normal.woff2', 'fonts/inter-latin-600-normal.woff2',
  'fonts/inter-latin-700-normal.woff2', 'fonts/inter-latin-ext-400-normal.woff2', 'fonts/inter-latin-ext-600-normal.woff2', 'fonts/inter-latin-ext-700-normal.woff2'
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API calls go straight to the network
  // network first so updates show at once; cache as fallback when offline
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
