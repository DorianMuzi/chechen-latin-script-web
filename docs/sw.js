/* Généré par tools/build.cjs. Met le site en cache pour qu'il fonctionne hors ligne. */
const CACHE = "cls-web-8552ef7bd8";
const FILES = [
  "./",
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_NOTICES.txt",
  "app.js",
  "data.js",
  "engine/shim.js",
  "engine/transliterate.js",
  "fonts.css",
  "fonts/cinzel-700-latin-ext.woff2",
  "fonts/cinzel-700-latin.woff2",
  "fonts/dancingscript-600-latin-ext.woff2",
  "fonts/dancingscript-600-latin.woff2",
  "fonts/hankengrotesk-500-cyrillic-ext.woff2",
  "fonts/hankengrotesk-500-latin-ext.woff2",
  "fonts/hankengrotesk-500-latin.woff2",
  "fonts/hankengrotesk-600-cyrillic-ext.woff2",
  "fonts/hankengrotesk-600-latin-ext.woff2",
  "fonts/hankengrotesk-600-latin.woff2",
  "fonts/hankengrotesk-700-cyrillic-ext.woff2",
  "fonts/hankengrotesk-700-latin-ext.woff2",
  "fonts/hankengrotesk-700-latin.woff2",
  "fonts/notosans-400-cyrillic-ext.woff2",
  "fonts/notosans-400-cyrillic.woff2",
  "fonts/notosans-400-latin-ext.woff2",
  "fonts/notosans-400-latin.woff2",
  "fonts/notosans-500-cyrillic-ext.woff2",
  "fonts/notosans-500-cyrillic.woff2",
  "fonts/notosans-500-latin-ext.woff2",
  "fonts/notosans-500-latin.woff2",
  "fonts/notosans-dot.woff2",
  "i18n.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/logo-96.png",
  "index.html",
  "manifest.webmanifest",
  "styles.css"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('cls-web-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request))
  );
});
