'use strict';
/* ODICOLOR v32 — catalogues fournisseurs en PDF, sur le Samsung.
 * Manuels PDFs : jamais des tarifs EBP automatiques.
 * Stockage dans IndexedDB/meta existant (pas de migration).
 * Les PDF sont inclus dans la sauvegarde complète .odicolor, pas dans l’ancien export JSON.
 * Export individuel possible ; originaux à conserver.
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
      if(DB.maintenance){reject(new Error('Restauration en cours : import PDF suspendu.'));return;}
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
    // Le vrai PDF Carsystem 2025 (FR, 110 pages) est servi par Carsystem.org.
    // Ne pas republier le PDF fournisseur dans ce dépôt public.
    const urlCarsystem='https://www.carsystem.org/fileadmin/CS-Kataloge-2025/Carsystem-catalogue-de-produits-2025.pdf';
    const rubriquesCarsystem=[
      ['Abrasifs',4],['Mastics',27],['Masquage',42],
      ['Peinture · vernis · apprêts',48],['Polissage · finition',65],
      ['Collage · étanchéité',75],['Nettoyage',85],
      ['Protection individuelle',91],['Fournitures de peinture',98]
    ];
    const localCarsystem=tous.find(x=>/^carsystem$/i.test(x.fournisseur)&&
      /catalogue|produits/i.test(x.nom)&&/2025/.test(x.nom));
    const localSifa=tous.find(x=>/^sifa$/i.test(x.fournisseur)&&
      /catalogue/i.test(x.nom)&&/2025/.test(x.nom));
    const gestionCopie=x=>h('details',{class:'v34-cs-sections'},
      h('summary',{},'Gérer ma copie hors ligne'),
      h('div',{class:'v32-pdf-buttons'},
        h('button',{type:'button',class:'btn sec',onclick:()=>telechargerPDF(x.id)},'Télécharger PDF'),
        h('button',{type:'button',class:'btn sec',onclick:async()=>{
          await supprimerPDF(x.id);await pageCataloguesPDF();
        }},'Supprimer la copie')));
    // Une seule fiche par document : les copies officielles sont gérées
    // dans la carte de leur fournisseur, pas répétées dans « Mes catalogues ».
    const cartes=tous.filter(x=>x.id!==localCarsystem?.id&&x.id!==localSifa?.id)
      .sort((a,b)=>a.fournisseur.localeCompare(b.fournisseur,'fr')||a.nom.localeCompare(b.nom,'fr')).map(x=>{
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
      h('h2',{},'Catalogues fournisseurs officiels'),
      h('section',{class:'carte v34-carsystem'},
        h('div',{class:'v34-cs-header'},
          h('span',{class:'v32-pdf-icon'},'PDF'),
          h('span',{},
            h('strong',{},'CARSYSTEM · Catalogue produits 2025'),
            h('small',{},'Catalogue officiel français · 110 pages · Vosschemie'),
            h('small',{class:'mut'},'Abrasifs, mastics, masquage, vernis, polissage et consommables'))),
        h('div',{class:'v34-cs-buttons'},
          h('a',{class:'btn',href:urlCarsystem,target:'_blank',rel:'noopener noreferrer',
            referrerPolicy:'no-referrer'},'Ouvrir le PDF officiel'),
          localCarsystem?
            h('button',{class:'btn sec',type:'button',onclick:()=>ouvrirPDF(localCarsystem.id)},
              'Ouvrir la copie hors ligne'):
            h('a',{class:'btn sec',href:'#/reglages'},'Importer via Réglages')),
        localCarsystem?gestionCopie(localCarsystem):null,
        h('details',{class:'v34-cs-sections'},
          h('summary',{},'Accès rapide · 9 familles de produits'),
          h('div',{class:'v34-cs-grid'},rubriquesCarsystem.map(([titre,page])=>
            h('a',{href:urlCarsystem+'#page='+page,target:'_blank',
              rel:'noopener noreferrer',referrerPolicy:'no-referrer'},
              h('strong',{},titre),h('small',{},'Page PDF '+page+' · en ligne'))))),
        h('p',{class:'mut'},localCarsystem?
          'Copie PDF enregistrée sur ce Samsung : disponible hors connexion. Les raccourcis de chapitres ouvrent la version officielle en ligne.':
          'PDF officiel accessible avec Internet. Pour l’utiliser hors connexion, importe une fois ton fichier PDF depuis Réglages.'),
        h('small',{class:'mut'},'Document technique fournisseur uniquement : aucun tarif ODICOLOR, stock ou prix de vente vérifiés.')),
      h('section',{class:'carte v32-pdf-item'},
        h('div',{class:'v32-pdf-head'},
          h('span',{class:'v32-pdf-icon'},'WEB'),
          h('span',{class:'v32-pdf-info'},
            h('strong',{},'SIFA · Catalogue 2025'),
            h('small',{},'Fournitures professionnelles · Automobile, bâtiment, industrie et nautisme'),
            h('small',{class:'mut'},'Catalogue en ligne (Calaméo) · Internet requis'))),
        h('div',{class:'v32-pdf-buttons'},
          h('a',{class:'btn',href:'https://www.calameo.com/books/006112838f2f47d2c47da',target:'_blank',rel:'noopener noreferrer'},'Consulter SIFA 2025'),
          localSifa?h('button',{type:'button',class:'btn sec',onclick:()=>ouvrirPDF(localSifa.id)},'Ouvrir la copie hors ligne'):null),
        localSifa?gestionCopie(localSifa):null,
        h('p',{class:'mut'},localSifa?'Copie SIFA 2025 enregistrée sur ce téléphone : disponible hors connexion.':'Pour un accès hors connexion, importe le PDF SIFA depuis Réglages si le fournisseur te le transmet. Ce catalogue ne renseigne pas les tarifs EBP.')),
      h('h2',{},localCarsystem||localSifa?'Mes autres catalogues':'Mes catalogues'),
      cartes.length?cartes:h('p',{class:'mut'},localCarsystem||localSifa?'Aucun autre catalogue PDF enregistré.':'Aucun catalogue PDF enregistré. Ajoute des documents depuis Réglages.'),
      h('div',{class:'carte v32-warning'},h('strong',{},'Sauvegarde importante'),
        h('p',{},'Ces PDF sont inclus dans la sauvegarde complète .odicolor, mais pas dans l’ancien export JSON. Garde aussi les originaux.'),
        h('p',{class:'mut'},'Le navigateur peut effacer ses données si son stockage est réinitialisé. Ne sélectionne pas « Tout effacer » dans les réglages.')),
      h('div',{class:'actions'},h('a',{class:'btn sec',href:'#/catalogue'},'Retour au catalogue EBP')));
  }

  const prevRoute=route;
  route=async function(){
    const p=(location.hash||'#/').slice(2).split('/')[0];
    if(p==='catalogues-pdf'){
      document.querySelectorAll('.onglets a').forEach(el=>el.classList.toggle('on',el.dataset.p==='catalogue'));
      return pageCataloguesPDF();
    }
    return prevRoute();
  };

  const prevCatalogue=pageCatalogue;
  pageCatalogue=async function(){
    await prevCatalogue();
    if(location.hash!=='#/catalogue')return;
    const bloc=h('a',{class:'carte v32-catalogue-entry',href:'#/catalogues-pdf'},
      h('span',{class:'v32-pdf-icon'},'PDF'),
      h('span',{},h('strong',{},'Catalogues fournisseurs (PDF)'),
        h('small',{},'Consulter les PDF fournisseurs, en ligne ou hors connexion')),
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
    // La bibliothèque PDF reste accessible dans Catalogue, sans second raccourci sur l'Accueil.
    const rapport=await get('meta','rapport_articles');
    if(produits&&rapport&&/(?:^|[\\\\/])demo[-_]/i.test(rapport.fichier||''))
      produits.append(h('p',{class:'v32-demo-mini'},
        '⚠ Tarifs de démonstration : ne pas utiliser pour une vente réelle.'));
  };

  const prevReglages=pageReglages;
  pageReglages=async function(){
    await prevReglages();
    const textVersion=app.querySelector('.v25-etat .v25-etat-titre strong');
    if(textVersion)textVersion.textContent='ODICOLOR Solution · v34';
  };

  addEventListener('pagehide',()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear()});
  window.__cataloguesPDFV32={indexPDF,verifierPDF,sauvegarderPDF,supprimerPDF,obtenirDocument};
})();
