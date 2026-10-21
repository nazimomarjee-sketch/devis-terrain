'use strict';
/* Devis terrain : cache d'abord, pour fonctionner sans réseau. Changer CACHE à chaque nouvelle version. */
const CACHE = 'terrain-v13';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'xlsx.mini.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return; // registre officiel, etc. : jamais mis en cache
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => {
    if (res.ok) { const copie = res.clone(); caches.open(CACHE).then(c => c.put(r, copie)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
