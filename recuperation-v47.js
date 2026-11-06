'use strict';
(() => {
  const status=document.getElementById('resultat');
  const download=(blob,name)=>{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)};
  const run=async(button,fn)=>{button.disabled=true;status.textContent='Contrôle en cours…';try{await fn()}catch(e){status.textContent='Opération refusée : '+e.message}finally{button.disabled=false}};
  document.getElementById('exporter-v2').onclick=event=>run(event.currentTarget,async()=>{
    const db=await new Promise((resolve,reject)=>{
      const r=indexedDB.open('devis-terrain');
      r.onupgradeneeded=()=>{r.transaction.abort()};
      r.onerror=()=>reject(new Error('Aucune base existante lisible.'));
      r.onsuccess=()=>{if(![1,2].includes(r.result.version)){r.result.close();reject(new Error('Version de base non prise en charge.'))}else resolve(r.result)};
    });
    try{const names=[...ODICOLOR_BACKUP.STORES];if(db.objectStoreNames.contains(ODICOLOR_BACKUP.RECOVERY))names.push(ODICOLOR_BACKUP.RECOVERY);const data=await ODICOLOR_BACKUP.read(db,names),encoded=await ODICOLOR_BACKUP.encode(data);download(encoded.file,'odicolor-retour-v47-'+Date.now()+'.odicolor');status.textContent='Copie complète préparée. Vérifie le téléchargement et garde-la hors de cet appareil.'}finally{db.close()}
  });
  document.getElementById('copier-v47').onclick=event=>run(event.currentTarget,async()=>{
    if(!document.getElementById('isole').checked)throw Error('Confirme que la destination est isolée.');
    const file=document.getElementById('fichier').files[0];if(!file)throw Error('Choisis la sauvegarde complète v2.');
    const backup=await ODICOLOR_BACKUP.decode(file),s=ODICOLOR_BACKUP.validate(backup);
    if(!confirm('Créer une copie V47 de '+s.garages+' garages et '+s.devis+' devis sur cette destination vierge ? La base v2 source doit rester conservée.')){status.textContent='Copie annulée.';return;}
    await ODICOLOR_BACKUP.createV47Copy(backup);
    status.textContent='Copie créée au schéma 1. Ferme cette page, puis ouvre le code V47 figé sur cette même destination. Compare les données avec le manifeste attendu avant tout usage.';
  });
})();
