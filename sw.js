'use strict';
/* ODICOLOR v29 — mise à jour réseau en priorité, fonctionnement hors ligne conservé.
 * Ce cache ne touche jamais aux données IndexedDB clients/devis.
 */
const CACHE='terrain-v39';
const SHELL=[
  './','index.html','style.css','style-v22.css','accueil-v23.css',
  'suivi-produits-v24.css','correctif-v25.css','apparence-v26.css','notes-terrain-v29.css','parcours-garage-v30.css','dossier-n1-v31.css','catalogues-pdf-v32.css','agent-commercial-v35.css','fiche-client-v36.css','identite-odicolor-v37.css','premium-pro-v38.css','photo-magasin-odicolor-v39.css','odicolor-logo-officiel.png',
  'app.js','commercial-v22.js','accueil-v23.js',
  'suivi-produits-v24.js','rappels-produits-v24.js','correctif-v25.js','apparence-v26.js','notes-terrain-v29.js','parcours-garage-v30.js','dossier-n1-v31.js','catalogues-pdf-v32.js','agent-commercial-v35.js','premium-pro-v38.js',
  'manifest.webmanifest'
];
const OPTION=['icon-192.png','icon-512.png','icon-maskable-512.png','logo-96.png',
  'xlsx.mini.min.js','barlow-condensed-latin-700-normal.woff2','barlow-condensed-latin-800-normal.woff2'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE)
    .then(cache=>cache.addAll(SHELL))
    .then(()=>caches.open(CACHE))
    .then(cache=>Promise.allSettled(OPTION.map(url=>cache.add(url))))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('terrain-')&&key!==CACHE)
      .map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const u=new URL(request.url);
  if(u.origin!==location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request,{cache:'no-store'}).then(response=>{
        if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy));}
        return response;
      }).catch(()=>caches.match(request).then(cached=>cached||caches.match('index.html')))
    );
    return;
  }
  const localShell=SHELL.some(x=>u.pathname.endsWith('/'+x.replace(/^\.\//,'')))||u.pathname.endsWith('/devis-terrain/');
  if(localShell){
    event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy));}
      return response;
    }).catch(()=>caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy));}
    return response;
  })));
});
