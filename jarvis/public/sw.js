'use strict';
// Service worker : met en cache UNIQUEMENT la coquille statique (HTML/CSS/JS/icônes, sans aucune donnée).
// Les routes /api/* ne sont JAMAIS mises en cache (données confidentielles, jeton d'accès) : hors ligne, l'interface s'ouvre mais le dit clairement.
const VERSION = 'jarvis-coquille-v1';
const COQUILLE = ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return; // l'API passe toujours par le réseau, jamais par le cache
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copie = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copie)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
