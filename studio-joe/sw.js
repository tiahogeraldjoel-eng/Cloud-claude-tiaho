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
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // modèles, API : réseau direct
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
