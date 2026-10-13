/* BRVM Tracker Joe — fonctionnement hors connexion : l'application est mise en cache,
   les cours (autre origine) passent toujours par le réseau. */
const VERSION = 'brvm-tracker-joe-4';
const FILES = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'lib/jszip.min.js', 'lib/pdf.min.js', 'lib/pdf.worker.min.js',
  'js/data.js', 'js/store.js', 'js/calc.js', 'js/charts.js', 'js/io.js', 'js/prices.js', 'js/app.js', 'js/views-portfolio.js', 'js/views-market.js', 'js/views-admin.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('brvm-tracker-joe-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// réseau d'abord pour profiter des mises à jour, cache en secours hors connexion
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
