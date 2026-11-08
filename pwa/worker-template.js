/* RELEASE_MANIFEST est injecté dans sw.js, sans import réseau mutable. */
const CACHE_PREFIX='odicolor-shell-';
const CACHE=CACHE_PREFIX+encodeURIComponent(new URL(self.registration.scope).pathname)+'-'+RELEASE_MANIFEST.id;
const entries=RELEASE_MANIFEST.assets;
const urlFor=entry=>new URL(entry.path+'?odicolor='+entry.sha256,self.registration.scope).href;
const marker=new URL('__odicolor_complete__?release='+RELEASE_MANIFEST.id,self.registration.scope).href;
const unavailable=()=>new Response('Version indisponible ou incomplète. Reconnecte puis ferme et rouvre toutes les fenêtres ODICOLOR.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8','Cache-Control':'no-store'}});
async function verified(entry){
  const response=await fetch(urlFor(entry),{cache:'no-store',credentials:'same-origin'});
  if(response.status!==200 || response.redirected)throw new Error('Ressource indisponible : '+entry.path);
  const bytes=await response.clone().arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==entry.sha256)throw new Error('Empreinte incorrecte : '+entry.path);
  return response;
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE);
      // Aucun cache actif n'est modifié ; le marqueur n'existe qu'après le lot complet.
      for(const entry of entries)await cache.put(urlFor(entry),await verified(entry));
      await cache.put(marker,new Response(JSON.stringify({release:RELEASE_MANIFEST.id,count:entries.length})));
    }catch(error){await caches.delete(CACHE);throw error;}
  })());
  // Pas d'activation forcée : les fenêtres de l'ancienne version doivent se fermer.
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    if(!await cache.match(marker))throw new Error('Installation incomplète.');
    // Garder les anciens ensembles pour les URLs immuables, sans toucher à IndexedDB.
  })());
});
async function local(entry,event){
  const cache=await caches.open(CACHE),hit=await cache.match(urlFor(entry));if(hit)return hit;
  try{const response=await verified(entry);event.waitUntil(cache.put(urlFor(entry),response.clone()));return response;}
  catch(_){return unavailable();}
}
async function immutable(request,event){
  for(const key of await caches.keys())if(key.startsWith(CACHE_PREFIX)){
    const cache=await caches.open(key),complete=new URL('__odicolor_complete__?release='+key.slice(-64),self.registration.scope).href;
    if(!await cache.match(complete))continue;
    const hit=await cache.match(request);if(hit)return hit;
  }
  const entry=entries.find(e=>urlFor(e)===request.url);
  if(entry)return local(entry,event);
  return unavailable();
}
self.addEventListener('fetch',event=>{
  const request=event.request,u=new URL(request.url);
  if(request.method!=='GET'||u.origin!==self.location.origin||!['http:','https:'].includes(u.protocol))return;
  if(request.mode==='navigate'){
    const recovery=u.pathname.endsWith('/recuperation-v47.html');
    const entry=entries.find(x=>x.path===(recovery?'recuperation-v47.html':'index.html'));
    event.respondWith(local(entry,event));return;
  }
  if(u.searchParams.has('odicolor')){
    event.respondWith(immutable(request,event));return;
  }
  const entry=entries.find(x=>new URL(x.path,self.registration.scope).pathname===u.pathname);
  if(entry){
    // Seuls les fichiers sans code (polices/icônes) peuvent être demandés sans empreinte.
    if(/\.(?:js|css|html)$/.test(entry.path)){event.respondWith(Promise.resolve(unavailable()));return;}
    event.respondWith(local(entry,event));return;
  }
  // Les autres requêtes ne peuvent ni enrichir ni remplacer le shell vérifié.
});
