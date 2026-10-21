'use strict';
/* Devis terrain : cache d'abord, pour fonctionner sans réseau. Changer CACHE à chaque nouvelle version. */
const CACHE = 'terrain-v16';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest']; // indispensables : sans eux, pas d'installation
const OPTION = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'logo-96.png', 'xlsx.mini.min.js', 'barlow-condensed-latin-700-normal.woff2', 'barlow-condensed-latin-800-normal.woff2']; // le reste : si un fichier manque, l'appli s'installe quand même

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).then(() => Promise.allSettled(OPTION.map(u => c.add(u))))).then(() => self.skipWaiting()));
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
