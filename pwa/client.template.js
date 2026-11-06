'use strict';
/* Généré par scripts/build-pwa.cjs : une page utilise des ressources immuables. */
(() => {
  const release=__ODICOLOR_RELEASE__,assets=__ODICOLOR_ASSETS__;
  const failed=[];
  addEventListener('error',event=>{
    const target=event.target;
    if(target && ((target.tagName==='SCRIPT' && target.integrity) || (target.tagName==='LINK' && target.rel==='stylesheet')))failed.push(target.src||target.href);
  },true);
  const ready=new Promise((resolve,reject)=>{
    addEventListener('load',()=>{
      if(failed.length){const message='Chargement incomplet : aucune ouverture du stockage. Reconnecte puis rouvre l’application.';const status=document.getElementById('etat');if(status)status.textContent=message;reject(new Error(message));}
      else resolve();
    },{once:true});
  });
  // Le gestionnaire de démarrage attend cette promesse avant toute migration.
  ready.catch(()=>{});
  const asset=name=>{if(!assets[name])throw new Error('Ressource de cette version absente : '+name);return assets[name];};
  window.ODICOLOR_PWA={release,ready,asset,integrity:name=>'sha256-'+btoa(String.fromCharCode(...new URL(asset(name),location.href).searchParams.get('odicolor').match(/../g).map(h=>parseInt(h,16))))};
  if('serviceWorker' in navigator)ready.then(async()=>{
    const reg=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
    const waiting=()=>{if(reg.waiting)dispatchEvent(new Event('odicolor-update-ready'))};
    waiting();reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(worker)worker.addEventListener('statechange',waiting)});
  }).catch(error=>{console.warn('Copie hors ligne non prête',error.message)});
})();
