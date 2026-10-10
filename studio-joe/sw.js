/* Studio Joe — fonctionnement hors connexion une fois installé.
   Toute l'application (≈ 17 Mo) est mise en cache à l'installation ; les modèles téléchargés
   (Whisper, voix) sont gardés en cache par leur propre moteur. Généré : ne pas modifier VERSION à la main. */
const VERSION = 'studio-joe-dev';
const FILES = ["./", "manifest.webmanifest", "css/studio.css", "design.html", "dictee.html", "icons/apple-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "index.html", "js/ai.js", "js/common.js", "js/design-app.js", "js/handwriting.js", "js/ocr.js", "js/pdf-app.js", "js/photo-app.js", "js/speech.js", "js/transcribe.js", "js/translate.js", "js/tts.js", "js/video-app.js", "lib/anthropic-sdk.js", "lib/gifenc.js", "lib/jspdf.umd.min.js", "lib/jszip.min.js", "lib/mp4-muxer.js", "lib/paper-core.min.js", "lib/pdf-lib.min.js", "lib/pdf.min.js", "lib/pdf.worker.min.js", "lib/qrcode.js", "lib/svg2pdf.umd.min.js", "lib/tessdata-eng.js", "lib/tessdata-fra.js", "lib/tesseract-core-lstm.wasm.js", "lib/tesseract-core-simd-lstm.wasm.js", "lib/transformers.js", "pdf.html", "photo.html", "video.html", "voix.html"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('studio-joe-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// partage depuis une autre application du téléphone (« Partager → Studio Joe ») : les fichiers sont gardés
// puis Mes fichiers propose de les ouvrir dans la bonne application
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'POST' || u.origin !== location.origin || !/fichiers\.html$/.test(u.pathname)) return;
  e.respondWith((async () => {
    try {
      const fd = await e.request.formData();
      const list = fd.getAll('files').filter((f) => f && typeof f === 'object' && 'size' in f).map((f) => ({ name: f.name || 'fichier', type: f.type, blob: f }));
      const text = ['title', 'text', 'url'].map((k) => fd.get(k)).filter((v) => v && typeof v === 'string').join('\n').trim();
      if (text && !list.length) list.push({ name: 'Texte partagé.txt', type: 'text/plain', blob: new Blob([text], { type: 'text/plain' }) });
      const db = await new Promise((res, rej) => { const r = indexedDB.open('studio-handoff', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const old = await new Promise((res) => { const q = db.transaction('files').objectStore('files').get('shared'); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
      await new Promise((res, rej) => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').put([...(Array.isArray(old) ? old : []), ...list], 'shared'); t.oncomplete = res; t.onerror = () => rej(t.error); });
      db.close();
    } catch (err) { /* la page affichera ce qui a pu être gardé */ }
    return Response.redirect('fichiers.html?partage=1', 303);
  })());
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // modèles, API : réseau direct
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
// rappels d'Agenda Joe : toucher la notification ouvre l'agenda
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => /agenda\.html/.test(c.url)) || list[0];
    if (w) { if (!/agenda\.html/.test(w.url) && w.navigate) return w.navigate('agenda.html').then((c) => c && c.focus()); return w.focus(); }
    return self.clients.openWindow('agenda.html');
  }));
});
