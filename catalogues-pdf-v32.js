'use strict';
/* ODICOLOR v32 — catalogues fournisseurs en PDF, sur le Samsung.
 * Manuels PDFs : jamais des tarifs EBP automatiques.
 * Stockage dans IndexedDB/meta existant (pas de migration).
 * Les PDF ne sont pas inclus dans la sauvegarde JSON actuelle :
 * export individuel possible, originaux à conserver.
 */
(function () {
  const CLE_INDEX = 'pdfFournisseursIndex';
  const CLE_PDF = id => 'pdfFournisseur:'+id;
  const NB_MAX = 25;
  const MAX_UN = 60 * 1024 * 1024;
  const MAX_TOTAL = 360 * 1024 * 1024;
  const urls = new Set();

  const propre = (v,n=140)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
  const taille = n => n < 1024*1024 ? (n/1024).toFixed(0)+' Ko' : (n/(1024*1024)).toFixed(1).replace('.',',')+' Mo';
  const nettoyerNom = v=>propre(v,150).replace(/[\x00-\x1f<>:"/\\|?*]/g,'_')||'catalogue.pdf';
  const nomPDF=v=>/\.pdf$/i.test(v)?v:v+'.pdf';
  const unique = arr=>arr.filter((x,i)=>arr.findIndex(y=>y.id===x.id)===i);

  async function indexPDF(){
    const list=await get('meta',CLE_INDEX);
    if(!Array.isArray(list))return [];
    return unique(list.filter(x=>x&&typeof x.id==='string'&&typeof x.nom==='string'&&typeof x.fournisseur==='string')
      .slice(0,NB_MAX).map(x=>({
        id:propre(x.id,120),nom:propre(x.nom,150),fournisseur:propre(x.fournisseur,90),
        size:Math.max(0,Number(x.size)||0),date:propre(x.date,35)
      })));
  }

  function ecrireAtomiquement(doc,meta,effacerId=null){
    return new Promise((resolve,reject)=>{
      let transaction;
      try{
        transaction=DB.db.transaction('meta','readwrite');
        const store=transaction.objectStore('meta');
        if(effacerId)store.delete(CLE_PDF(effacerId));
        if(doc)store.put(doc,CLE_PDF(doc.id));
        store.put(meta,CLE_INDEX);
        transaction.oncomplete=()=>resolve();
        transaction.onerror=()=>reject(transaction.error||new Error('Écriture locale impossible.'));
        transaction.onabort=()=>reject(transaction.error||new Error('Stockage indisponible.'));
      }catch(e){reject(e)}
    });
  }

  async function verifierPDF(file){
    if(!file||!file.name)throw new Error('Choisis un fichier PDF.');
    if(!/\.pdf$/i.test(file.name))throw new Error('Fichier non PDF : '+propre(file.name,50));
    if(file.size>MAX_UN)throw new Error(propre(file.name,50)+' dépasse la limite de 60 Mo.');
    if(file.size<8)throw new Error('Fichier PDF vide ou invalide.');
    const start=new TextDecoder('ascii').decode(await file.slice(0,1024).arrayBuffer());
    if(start.indexOf('%PDF-')<0)throw new Error(propre(file.name,50)+' ne semble pas être un PDF.');
    return true;
  }

  async function sauvegarderPDF(file,fournisseur){
    await verifierPDF(file);
    const marque=propre(fournisseur,90);
    if(marque.length<2)throw new Error('Indique le fournisseur pour retrouver ce catalogue.');
    const list=await indexPDF();
    const same=list.find(x=>x.nom.toLocaleLowerCase('fr')===propre(file.name,150).toLocaleLowerCase('fr')&&
      x.fournisseur.toLocaleLowerCase('fr')===marque.toLocaleLowerCase('fr'));
    if(same && !confirm('Un catalogue de ce nom existe déjà pour ce fournisseur. Le remplacer ?'))return {annule:true};
    if(!same&&list.length>=NB_MAX)throw new Error('Limite de '+NB_MAX+' catalogues atteinte. Supprime les anciens.');
    const newTotal=list.reduce((n,x)=>n+x.size,0)-(same?.size||0)+file.size;
    if(newTotal>MAX_TOTAL)throw new Error('Bibliothèque PDF trop volumineuse (limite : 360 Mo).');

    const id=same?.id||nouvelUid();
    const meta={
      id,nom:propre(file.name,150),fournisseur:marque,size:file.size,date:new Date().toISOString()
    };
    const doc={id,nom:meta.nom,blob:file,date:meta.date};
    const updated=same?list.map(x=>x.id===id?meta:x):[...list,meta];
    try{
      await ecrireAtomiquement(doc,updated);
    }catch(e){
      if(e?.name==='QuotaExceededError')
        throw new Error('Stockage du téléphone insuffisant. Libère de la place ou garde les PDF hors de l’application.');
      throw e;
    }
    return {added:!same,replaced:!!same,meta};
  }

  async function supprimerPDF(id){
    const list=await indexPDF();
    const item=list.find(x=>x.id===id);
    if(!item)return;
    if(!confirm('Supprimer le catalogue « '+item.nom+' » de ce téléphone ?'))return;
    await ecrireAtomiquement(null,list.filter(x=>x.id!==id),id);
  }

  async function obtenirDocument(id){
    const data=await get('meta',CLE_PDF(id));
    if(!data||!(data.blob instanceof Blob)||data.blob.size<8)
      throw new Error('Fichier PDF introuvable dans le stockage local.');
    return data;
  }

  async function ouvrirPDF(id) {
    // Fenêtre ouverte immédiatement après le clic pour éviter le blocage popup
    // Android lorsque la lecture IndexedDB demande quelques millisecondes.
    const nouvelleFenetre=window.open('about:blank','_blank');
    try{
      const doc=await obtenirDocument(id);
      const url=URL.createObjectURL(doc.blob);
      urls.add(url);
      if(nouvelleFenetre&&!nouvelleFenetre.closed){
        nouvelleFenetre.location.replace(url);
      }else{
        // Chrome en PWA peut bloquer les nouvelles fenêtres. Le téléchargement
        // individuel reste alors disponible dans la liste.
        toast('Ouverture bloquée : utilise « Télécharger PDF ».',true);
      }
    }catch(e){
      if(nouvelleFenetre&&!nouvelleFenetre.closed)nouvelleFenetre.close();
      toast(e.message||'Impossible d’ouvrir le PDF.',true);
    }
  }

  async function telechargerPDF(id){
    try{
      const doc=await obtenirDocument(id);
      const url=URL.createObjectURL(doc.blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=nomPDF(nettoyerNom(doc.nom));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      toast('Copie du catalogue préparée dans les téléchargements.');
    }catch(e){toast(e.message||'Téléchargement impossible.',true)}
  }

  async function pageCataloguesPDF(){
    const tous=await indexPDF();
    const somme=tous.reduce((s,x)=>s+x.size,0);
    const fournisseur=h('input',{type:'text',maxlength:90,
      placeholder:'Nom du fournisseur (ex. Carsystem)',
      'aria-label':'Nom du fournisseur'});
    const files=h('input',{type:'file',multiple:true,accept:'.pdf,application/pdf',
      'aria-label':'Importer les catalogues PDF fournisseurs'});
    const message=h('div',{role:'status',class:'v32-message'});
    const bouton=h('button',{class:'btn v32-import',type:'button'},'+ Ajouter les catalogues PDF');

    bouton.addEventListener('click',async()=>{
      const ff=Array.from(files.files||[]);
      if(!ff.length){message.textContent='Sélectionne un ou plusieurs PDF.';return;}
      bouton.disabled=true;
      let ok=0;const errors=[];
      for(const fichier of ff){
        try{const r=await sauvegarderPDF(fichier,fournisseur.value);if(!r.annule)ok++}
        catch(e){errors.push(propre(fichier.name,45)+' : '+(e.message||String(e)))}
      }
      bouton.disabled=false;
      message.textContent=ok+' PDF enregistré(s). '+errors.join(' · ');
      if(ok){
        await pageCataloguesPDF();
        if(errors.length)app.prepend(h('div',{class:'carte alerte'},errors.join(' · ')));
      }
    });

    const cartes=tous.sort((a,b)=>a.fournisseur.localeCompare(b.fournisseur,'fr')||a.nom.localeCompare(b.nom,'fr')).map(x=>{
      const date=Number.isFinite(Date.parse(x.date))?new Date(x.date).toLocaleDateString('fr-FR'):'Date inconnue';
      const btOpen=h('button',{type:'button',class:'btn'},'Ouvrir');
      const btSave=h('button',{type:'button',class:'btn sec'},'Télécharger PDF');
      const btDelete=h('button',{type:'button',class:'btn sec'},'Supprimer');
      btOpen.addEventListener('click',()=>ouvrirPDF(x.id));
      btSave.addEventListener('click',()=>telechargerPDF(x.id));
      btDelete.addEventListener('click',async()=>{
        await supprimerPDF(x.id);await pageCataloguesPDF();
      });
      return h('section',{class:'carte v32-pdf-item'},
        h('div',{class:'v32-pdf-head'},
          h('span',{class:'v32-pdf-icon'},'PDF'),
          h('span',{class:'v32-pdf-info'},h('strong',{},x.nom),
            h('small',{},x.fournisseur),
            h('small',{class:'mut'},taille(x.size)+' · ajouté le '+date))),
        h('div',{class:'v32-pdf-buttons'},btOpen,btSave,btDelete));
    });

    montrer('Catalogues fournisseurs',
      h('div',{class:'carte v32-intro'},
        h('strong',{},'Catalogues fournisseurs · PDF'),
        h('p',{class:'mut'},'Les catalogues restent sur ce Samsung, accessibles sans Internet après import. Ils sont distincts des prix EBP et ne modifient jamais automatiquement tes devis.'),
        h('p',{class:'v32-count'},tous.length+' PDF · '+taille(somme)+' stockés localement')),
      h('h2',{},'Catalogues en ligne'),
      h('section',{class:'carte v32-pdf-item'},
        h('div',{class:'v32-pdf-head'},
          h('span',{class:'v32-pdf-icon'},'WEB'),
          h('span',{class:'v32-pdf-info'},
            h('strong',{},'SIFA · Catalogue 2025'),
            h('small',{},'Fournitures professionnelles · Automobile, bâtiment, industrie et nautisme'),
            h('small',{class:'mut'},'Catalogue en ligne (Calaméo) · Internet requis'))),
        h('div',{class:'v32-pdf-buttons'},
          h('a',{class:'btn',href:'https://www.calameo.com/books/006112838f2f47d2c47da',target:'_blank',rel:'noopener noreferrer'},'Consulter SIFA 2025')),
        h('p',{class:'mut'},'Pour un accès hors connexion, importe le PDF SIFA si le fournisseur te le transmet. Ce catalogue ne renseigne pas les tarifs EBP.')),
      h('div',{class:'carte v32-form'},
        h('strong',{},'Importer un PDF fournisseur'),
        h('label',{},'Fournisseur'),fournisseur,
        h('label',{},'Choisir les documents PDF'),files,bouton,message,
        h('small',{class:'mut'},'PDF uniquement · 60 Mo maximum par fichier · 25 documents maximum.')),
      h('h2',{},'Mes catalogues'),
      cartes.length?cartes:h('p',{class:'mut'},'Aucun catalogue PDF enregistré. Ajoute les documents fournis par tes fournisseurs.'),
      h('div',{class:'carte v32-warning'},h('strong',{},'Sauvegarde importante'),
        h('p',{},'Ces PDF ne sont pas inclus dans la sauvegarde JSON des clients et devis. Garde toujours les originaux et utilise « Télécharger PDF » pour récupérer une copie.'),
        h('p',{class:'mut'},'Le navigateur peut effacer ses données si son stockage est réinitialisé. Ne sélectionne pas « Tout effacer » dans les réglages.')),
      h('div',{class:'actions'},h('a',{class:'btn sec',href:'#/catalogue'},'Retour au catalogue EBP')));
  }

  const prevRoute=route;
  route=async function(){
    const p=(location.hash||'#/').slice(2).split('/')[0];
    if(p==='catalogues-pdf')return pageCataloguesPDF();
    return prevRoute();
  };

  const prevCatalogue=pageCatalogue;
  pageCatalogue=async function(){
    await prevCatalogue();
    if(location.hash!=='#/catalogue')return;
    const bloc=h('a',{class:'carte v32-catalogue-entry',href:'#/catalogues-pdf'},
      h('span',{class:'v32-pdf-icon'},'PDF'),
      h('span',{},h('strong',{},'Catalogues fournisseurs (PDF)'),
        h('small',{},'Ouvrir ou importer les catalogues, même sans réseau')),
      h('span',{class:'v32-arrow'},'›'));
    app.prepend(bloc);
    const rapport=await get('meta','rapport_articles');
    if(rapport && /(?:^|[\\/])demo[-_]/i.test(rapport.fichier||'')){
      bloc.after(h('div',{class:'carte alerte'},
        h('strong',{},'CATALOGUE DE DÉMONSTRATION'),
        h('p',{},'Ton dernier fichier est « '+propre(rapport.fichier,100)+' ». Les tarifs de démonstration ne doivent pas être utilisés pour des devis réels.')));
    }
  };

  const prevAccueil=pageAccueil;
  pageAccueil=async function(){
    await prevAccueil();
    if((location.hash||'#/')!=='#/')return;
    const produits=app.querySelector('.v23-produits');
    const ligne=produits&&produits.querySelector('.v23-between');
    if(ligne)ligne.append(h('a',{class:'v32-pdf-link',href:'#/catalogues-pdf'},'PDF fournisseurs ›'));
    const rapport=await get('meta','rapport_articles');
    if(produits&&rapport&&/(?:^|[\\\\/])demo[-_]/i.test(rapport.fichier||''))
      produits.append(h('p',{class:'v32-demo-mini'},
        '⚠ Tarifs de démonstration : ne pas utiliser pour une vente réelle.'));
  };

  const prevPlus=pagePlus;
  pagePlus=function(){
    prevPlus();
    app.prepend(h('a',{class:'v32-plus-entry',href:'#/catalogues-pdf'},
      h('strong',{},'Catalogues fournisseurs PDF'),
      h('span',{},'›')));
  };

  const prevReglages=pageReglages;
  pageReglages=async function(){
    await prevReglages();
    const textVersion=app.querySelector('.v25-etat .v25-etat-titre strong');
    if(textVersion)textVersion.textContent='ODICOLOR Solution · v33';
  };

  addEventListener('pagehide',()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear()});
  window.__cataloguesPDFV32={indexPDF,verifierPDF,sauvegarderPDF,supprimerPDF,obtenirDocument};
})();
