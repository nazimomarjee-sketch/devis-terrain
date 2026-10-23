'use strict';
/* ODICOLOR Solution v38 — Premium Pro réel
   - Interface et hiérarchie des écrans (tous les appareils)
   - Photos de garages en IndexedDB/meta : jamais envoyées au serveur ni à Claude
   - Pas de mutation des ventes, clients, devis ou règlements
   - Navigation fidèle aux actions existantes ; aucune donnée fictive
*/
(function(){
  const PHOTO_PREFIX='garage-photo-v38:';
  const PHOTO_LIMIT=16*1024*1024;
  const PHOTO_TARGET=350*1024;
  let currentObjectURL=null;

  const court=(x,max=140)=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,max);
  const urlPhoto=id=>PHOTO_PREFIX+id;
  const nombre=v=>Number(v||0).toLocaleString('fr-FR');
  const lien=(href,label,cls='')=>h('a',{href,class:cls||'btn sec'},label);
  const titreSection=(label,texte)=>h('div',{class:'v38-page-intro'},
    h('small',{},'ODICOLOR · ASSISTANT TERRAIN'),
    h('strong',{},label),
    h('p',{},texte));

  function nettoyerURL(){
    if(currentObjectURL){
      URL.revokeObjectURL(currentObjectURL);
      currentObjectURL=null;
    }
  }
  async function photoPour(id){
    const item=await get('meta',urlPhoto(id));
    if(!item||!(item.blob instanceof Blob)||!item.blob.type.startsWith('image/'))return null;
    return item;
  }
  function chargerImage(file){
    return new Promise((resolve,reject)=>{
      const tmp=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{URL.revokeObjectURL(tmp);resolve(img)};
      img.onerror=()=>{URL.revokeObjectURL(tmp);reject(new Error('Photo illisible. Sélectionne une image JPEG, PNG ou WebP.'))};
      img.src=tmp;
    });
  }
  function compresser(canvas,type,qualite){
    return new Promise(resolve=>canvas.toBlob(resolve,type,qualite));
  }
  async function optimiserPhoto(file){
    if(!(file instanceof Blob)||!file.type.startsWith('image/'))
      throw new Error('Choisis une photo JPG, PNG ou WebP.');
    if(file.size>PHOTO_LIMIT)throw new Error('Photo de plus de 16 Mo : réduis-la avant import.');
    if(file.size===0)throw new Error('La photo est vide.');
    const image=await chargerImage(file);
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('Dimensions de photo invalides.');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('La compression photo est indisponible.');
    const ar=image.naturalWidth/image.naturalHeight;
    if(!Number.isFinite(ar)||ar<=0)throw new Error('Image invalide.');
    let max=1080,blob=null;
    for(let i=0;i<5;i++){
      const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      blob=await compresser(canvas,'image/webp',i<2?.70:.62);
      if(blob&&blob.type==='image/webp'&&blob.size<=PHOTO_TARGET)break;
      if(!blob||blob.type!=='image/webp')
        blob=await compresser(canvas,'image/jpeg',.68);
      if(blob&&blob.size<=PHOTO_TARGET)break;
      max=Math.round(max*.78);
    }
    canvas.width=0;canvas.height=0;
    if(!blob||!blob.type.startsWith('image/'))throw new Error('La compression de la photo a échoué.');
    if(blob.size>1024*1024)throw new Error('Photo encore trop volumineuse après compression.');
    return blob;
  }
  async function enregistrerPhoto(id,file){
    const c=await get('clients',id);
    if(!c)throw new Error('Le garage n’existe plus.');
    const blob=await optimiserPhoto(file);
    await put('meta',{blob,origine:'Photo importée manuellement',date:new Date().toISOString()},urlPhoto(id));
    return blob.size;
  }
  async function supprimerPhoto(id){
    await del('meta',urlPhoto(id));
  }
  function statutGarage(c){
    if(c.statutCrm==='prospect')return ['Prospect','v38-prospect'];
    if(c.compte?.statut==='bloque')return ['Compte bloqué','v38-bloque'];
    if(c.compte?.statut==='ouvert')return ['Compte déclaré ouvert','v38-client-actif'];
    return ['Garage enregistré','v38-enregistre'];
  }
  async function construireEnTete(id,c){
    const data=await photoPour(id);
    const hero=h('section',{class:'v38-hero'+(data?' v38-hero-photo':' v38-hero-vide')});
    if(data){
      nettoyerURL();
      currentObjectURL=URL.createObjectURL(data.blob);
      hero.append(h('img',{class:'v38-hero-image',src:currentObjectURL,
        alt:'Photo du garage '+court(c.nom,90),loading:'eager',decoding:'async'}));
    } else {
      nettoyerURL();
      hero.append(h('div',{class:'v38-hero-fallback','aria-hidden':'true'},
        h('span',{},'ODICOLOR'),h('span',{},'CARROSSERIE · ATELIER')));
    }
    const cta=h('button',{class:'v38-photo-button',type:'button',
      title:data?'Changer la photo du garage':'Ajouter une photo du garage',
      'aria-label':data?'Changer la photo du garage':'Ajouter une photo du garage'},
      data?'Changer la photo':'+ Photo du garage');
    const input=h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/*',
      class:'v38-photo-input','aria-label':'Sélectionner une photo locale du garage'});
    cta.addEventListener('click',()=>input.click());
    input.addEventListener('change',async()=>{
      const f=input.files&&input.files[0];if(!f)return;
      cta.disabled=true;cta.textContent='Compression…';
      try{
        const bytes=await enregistrerPhoto(id,f);
        toast('Photo ajoutée · '+Math.round(bytes/1024)+' Ko sur ce téléphone.');
        await pageClient(id);
      }catch(err){cta.disabled=false;cta.textContent=data?'Changer la photo':'+ Photo du garage';toast(err.message||'Photo impossible',true)}
    });
    const [statut,classe]=statutGarage(c);
    const badge=h('span',{class:'v38-statut '+classe},statut);
    const ville=c.villeProspection||(c.ent?.adresse?court(c.ent.adresse,68):'');
    hero.append(
      h('div',{class:'v38-hero-dessus'},
        h('span',{class:'v38-hero-code'},'FICHE GARAGE'),cta,input),
      h('div',{class:'v38-hero-contenu'},
        h('span',{class:'v38-hero-pastille'},'ODICOLOR · CLIENTS'),
        h('h1',{},court(c.nom,110)||'Garage sans nom'),
        h('div',{class:'v38-hero-bas'},ville?h('small',{},'⌖ '+ville):null,badge))
    );
    return {hero,data};
  }
  function supprimerAncienRaccourci(trio,id,c){
    if(!trio)return;
    const b=trio.querySelector('a[href^="#/signaler"]');
    if(b){b.href='#/note-terrain/'+id;b.textContent='Note terrain';}
    const d=trio.querySelector('button');
    if(d)d.classList.add('v38-devis-cta');
    trio.classList.add('v38-actions');
    const elements=Array.from(trio.children);
    elements.forEach((el,i)=>{
      el.classList.add('v38-action','v38-action-'+i);
      const icon=['▤','☎','✎'][i]||'→';
      if(!el.querySelector('.v38-icon'))el.prepend(h('span',{class:'v38-icon','aria-hidden':'true'},icon));
    });
  }
  function sectionNotesEtIncident(id){
    // A unique, secondary entry for technical incidents.
    // Note terrain is the main action; its history has its own panel.
    return h('a',{class:'v38-incident-link',href:'#/signaler/'+id},
      'Signaler un incident technique ›');
  }

  function resumeLocal(devis,client){
    const mine=devis.filter(d=>d.clientId===client.id);
    const acceptes=mine.filter(d=>d.statut==='accepte');
    const visites=Array.isArray(client.visites)?client.visites.length:0;
    return h('section',{class:'v38-kpi-container'},
      h('div',{class:'v38-kpi-titre'},
        h('strong',{},'Activité du garage'),
        h('small',{},'Données saisies sur le téléphone')),
      h('div',{class:'v38-kpis'},
        [['Devis',mine.length],['Acceptés',acceptes.length],['Visites',visites]].map(([label,n])=>
          h('div',{class:'v38-kpi'},h('strong',{},nombre(n)),h('small',{},label)))));
  }
  function onglets(details){
    const nav=h('nav',{class:'v38-vue-tabs','aria-label':'Accès rapide aux informations de la fiche'});
    const choisir=(button,target)=>{
      nav.querySelectorAll('.v38-tab').forEach(el=>el.classList.toggle('actif',el===button));
      if(target){
        if(target.tagName==='DETAILS')target.open=true;
        target.scrollIntoView({behavior:'smooth',block:'start'});
      }
    };
    const configs=[
      ['Vue d’ensemble',()=>app.querySelector('.v38-hero')],
      ['Détails',()=>details.find(x=>/Profil, contacts/i.test(x.querySelector('summary')?.textContent||''))],
      ['Historique',()=>details.find(x=>/Historique des devis/i.test(x.querySelector('summary')?.textContent||''))],
      ['Analyse',()=>details.find(x=>/analyse EBP|Identité officielle/i.test(x.querySelector('summary')?.textContent||''))]
    ];
    configs.forEach(([nom,trouver],i)=>{
      const b=h('button',{type:'button',class:'v38-tab'+(i===0?' actif':'')},nom);
      b.addEventListener('click',()=>choisir(b,trouver()));
      nav.append(b);
    });
    return nav;
  }

  const routeAvant=route;
  route=async function(){
    const p=(location.hash||'#/').slice(2).split('/')[0]||'accueil';
    document.body.classList.remove('v38-client','v38-home','v38-tournee','v38-devis','v38-catalogue','v38-liste-clients');
    if(p==='client')document.body.classList.add('v38-client');
    else if(p==='accueil')document.body.classList.add('v38-home');
    else if(p==='tournee')document.body.classList.add('v38-tournee');
    else if(p==='devis'||p==='nouveau')document.body.classList.add('v38-devis');
    else if(p==='catalogue'||p==='catalogues-pdf'||p==='article')document.body.classList.add('v38-catalogue');
    else if(p==='clients')document.body.classList.add('v38-liste-clients');
    if(p!=='client')nettoyerURL();
    return routeAvant();
  };

  const clientAvant=pageClient;
  pageClient=async function(id){
    await clientAvant(id);
    if(location.hash!=='#/client/'+id)return;
    const c=await get('clients',id);
    if(!c)return;
    const {hero,data}=await construireEnTete(id,c);
    if(location.hash!=='#/client/'+id){nettoyerURL();return;}
    // Preserve underlying forms and business data; reorganize their visual order.
    app.prepend(hero);
    const trio=app.querySelector('.trio.v36-rapide')||app.querySelector('.trio');
    if(trio){
      supprimerAncienRaccourci(trio,id,c);
      hero.after(trio);
    }
    const prochaine=app.querySelector('.v36-prochaine');
    if(prochaine){
      const label=prochaine.querySelector('strong');
      if(label)label.textContent='Prochaine action';
      (trio||hero).after(prochaine);
    }
    const visite=app.querySelector('.v36-visite');
    if(visite)(prochaine||trio||hero).after(visite);
    const stats=resumeLocal(await getAll('devis'),c);
    if(visite)visite.after(stats);
    else (prochaine||trio||hero).after(stats);
    const details=Array.from(app.querySelectorAll('.v36-details'));
    if(details.length){
      stats.after(onglets(details));
    }
    const notes=app.querySelector('.v29-client-note');
    if(notes){
      // One access to create notes (top action), one access to history.
      // Suppress duplicate creation/history buttons without deleting any notes.
      const create=notes.querySelector('a[href^="#/note-terrain/"]');
      if(create)create.remove();
      const history=notes.querySelector('a[href^="#/notes-client/"]');
      const heading=notes.querySelector('.v29-ligne');
      if(heading)heading.remove();
      if(history){
        const d=h('details',{class:'v38-secondaires v38-note-detail'},
          h('summary',{},'Historique des informations terrain'),
          notes);
        app.append(d);
      }else notes.remove();
    }
    // The hero already shows "Prospect": remove only its duplicate badge,
    // keep the important warning that EBP has not verified any order.
    const prospect=app.querySelector('.v30-prospect');
    if(prospect){
      const badge=prospect.querySelector('.tag');
      if(badge)badge.remove();
      prospect.classList.add('v38-prospect-compact');
      hero.after(prospect);
    }
    const fin=h('div',{class:'v38-fin-client'},
      sectionNotesEtIncident(id),
      h('p',{class:'v38-photo-info'},data?
        'Photo enregistrée uniquement sur cet appareil : elle ne part pas dans la sauvegarde JSON.':
        'Tu peux ajouter une vraie photo du garage. Elle reste locale et ne sera pas envoyée à Claude.'));
    if(data){
      const supprimer=h('button',{type:'button',class:'v38-photo-delete',onclick:async()=>{
        if(!confirm('Retirer la photo de ce garage sur ce téléphone ?'))return;
        await supprimerPhoto(id);toast('Photo retirée de ce téléphone.');await pageClient(id);
      }},'Retirer la photo');
      fin.append(supprimer);
    }
    app.append(fin);
  };

  const homeAvant=pageAccueil;
  pageAccueil=async function(){
    await homeAvant();
    if((location.hash||'#/')!=='#/')return;
    const headline=h('div',{class:'v38-accueil-hero'},
      h('div',{class:'v38-accueil-rayon','aria-hidden':'true'}),
      h('span',{class:'v38-eyebrow'},'ODICOLOR · ASSISTANT TERRAIN'),
      h('strong',{},'Mon poste de travail'),
      h('p',{},'Un garage. Une action. Un résultat à suivre.'));
    app.prepend(headline);
    // V40 : Objectif en premier sous le bandeau photo, puis action prioritaire.
    // Les valeurs et leurs preuves restent calculées par le moteur existant.
    const objectif=app.querySelector('.v23-objectif');
    if(objectif){objectif.classList.add('v38-objectif');headline.after(objectif);}
    const next=app.querySelector('.v23-prochaine');
    if(next)(objectif||headline).after(next);
    // Reuse the actual main quote action, not a decorative copy.
    const devis=app.querySelector('.v31-nouveau-devis');
    const shortcuts=h('div',{class:'v38-accueil-actions'});
    if(devis){
      devis.classList.add('v38-accent-action');
      const s=devis.querySelector('small');if(s)s.textContent='Préparer une offre';
      shortcuts.append(devis);
    }else shortcuts.append(lien('#/nouveau','+ Nouveau devis','v38-accent-action'));
    shortcuts.append(
      h('a',{class:'v38-shortcut',href:'#/tournee'},
        h('span',{class:'v38-shortcut-icon'},'⌖'),
        h('strong',{},'Tournée'),h('small',{},'Mes visites')),
      h('a',{class:'v38-shortcut',href:'#/agent'},
        h('span',{class:'v38-shortcut-icon'},'✦'),
        h('strong',{},'Mon assistant'),h('small',{},'Claude · Agent 01'))
    );
    (next||headline).after(shortcuts);
    const oldAgent=app.querySelector('.v35-accueil');
    if(oldAgent)oldAgent.remove();
    // L'objectif reste avant la prochaine action et les raccourcis.
    const produits=app.querySelector('.v23-produits');
    if(produits)produits.classList.add('v38-produits');
  };

  const tourneeAvant=pageTournee;
  pageTournee=async function(){
    await tourneeAvant();
    if(location.hash!=='#/tournee')return;
    app.prepend(titreSection('Tournée du jour',
      'Une visite à la fois. Les horaires et les déplacements viennent uniquement de ton planning.'));
  };

  const clientsAvant=pageClients;
  pageClients=async function(){
    await clientsAvant();
    if(location.hash!=='#/clients')return;
    const p=titreSection('Mes garages',
      'Clients et prospects. Retrouve la bonne fiche, puis agis.');
    app.prepend(p);
  };

  const catalogueAvant=pageCatalogue;
  pageCatalogue=async function(){
    await catalogueAvant();
    if(location.hash!=='#/catalogue')return;
    app.prepend(titreSection('Catalogue produits',
      'Recherche EBP et catalogues fournisseurs, avec sources distinctes.'));
  };

  const devisListeAvant=pageDevisListe;
  pageDevisListe=async function(filtre){
    await devisListeAvant(filtre);
    if(!(location.hash||'').startsWith('#/devis'))return;
    if(/^#\/devis\/\d+$/.test(location.hash||''))return;
    app.prepend(titreSection('Mes devis','Préparer, envoyer et suivre les offres des garages.'));
  };

  const devisAvant=pageDevis;
  pageDevis=async function(id){
    await devisAvant(id);
    if(location.hash!=='#/devis/'+id)return;
    const d=await get('devis',id);
    if(!d)return;
    app.prepend(titreSection('Devis · '+court(d.clientNom,70),
      'Montants issus des articles saisis et tarifs présents dans ton catalogue.'));
  };

  const regAvant=pageReglages;
  pageReglages=async function(){
    await regAvant();
    const t=app.querySelector('.v25-etat .v25-etat-titre strong');
    if(t)t.textContent='ODICOLOR Solution · v40';
  };

  window.__premiumProV38={optimiserPhoto,enregistrerPhoto,photoPour,supprimerPhoto,statutGarage};
})();
