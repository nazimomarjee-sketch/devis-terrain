// Service worker : tout l'appli est mise en cache, aucune donnée n'est envoyée nulle part.
const V = 'terrain-v4';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'xlsx.mini.min.js', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => {
    const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); return res;
  }).catch(() => caches.match('index.html'))));
});
