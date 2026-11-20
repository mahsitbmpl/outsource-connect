/* Kiosk service worker: everything (app, fonts, face models) is cached so the tablet works offline. API calls are never cached. */
const VERSION = 'osc-kiosk-3.0.0';
const FILES = [
  'config.js',
  'css/kiosk.css',
  'fonts/inter-latin-400-normal.woff2',
  'fonts/inter-latin-600-normal.woff2',
  'fonts/inter-latin-700-normal.woff2',
  'fonts/noto-sans-devanagari-devanagari-400-normal.woff2',
  'fonts/noto-sans-devanagari-devanagari-600-normal.woff2',
  'fonts/noto-sans-devanagari-devanagari-700-normal.woff2',
  'img/icon-192.png',
  'img/icon-512.png',
  'img/logo.png',
  'index.html',
  'js/face.js',
  'js/kiosk.js',
  'js/logic.js',
  'js/net.js',
  'js/osc-core.js',
  'js/rules.js',
  'js/store.js',
  'manifest.webmanifest',
  'models/face_landmark_68_model-weights_manifest.json',
  'models/face_landmark_68_model.bin',
  'models/face_recognition_model-weights_manifest.json',
  'models/face_recognition_model.bin',
  'models/tiny_face_detector_model-weights_manifest.json',
  'models/tiny_face_detector_model.bin',
  'vendor/face-api-1.7.15.js'
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['./'].concat(FILES))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== VERSION).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const big = /\/(models|vendor|fonts)\//.test(url.pathname);
  if (big) { e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))); return; } // large files: cache first
  e.respondWith(fetch(e.request).then((res) => { const c = res.clone(); caches.open(VERSION).then((x) => x.put(e.request, c)); return res; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
