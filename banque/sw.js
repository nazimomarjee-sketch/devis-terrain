'use strict';
/* Banque locale — cache hors ligne du code uniquement. Ne touche jamais aux données (IndexedDB)
 * ni au cache de l'appli ODICOLOR (préfixe « terrain- »). Réseau d'abord, cache en secours. */
const CACHE = 'banque-v2';
const FICHIERS = ['./', 'index.html', 'banque.css', 'coeur.js', 'app.js', 'manifest.webmanifest', 'icone.svg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k.startsWith('banque-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-store' }).then(rep => {
    if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then(c => c.put(r, copie)); }
    return rep;
  }).catch(() => caches.match(r).then(x => x || caches.match('index.html'))));
});
