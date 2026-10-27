'use strict';
/* Sauvegarde locale : aucun réseau, aucun effacement d'archive.
 * Le numéro du format est indépendant de la version commerciale de l'application.
 */
const ODICOLOR_BACKUP = (() => {
  const STORES = ['articles', 'clients', 'devis', 'meta'];
  const RECOVERY = 'recuperations';
  const MAGIC = 'ODICOLOR-BACKUP-2\n';
  const MAX_FILE = 1024 * 1024 * 1024, MAX_HEADER = 64 * 1024 * 1024;
  const MAX_ATTACHMENT = 128 * 1024 * 1024, MAX_LEGACY = 25 * 1024 * 1024;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const object = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const fail = message => { throw new Error(message); };
  const integer = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
  const date = s => {
    if (typeof s!=='string' || !/^\d{4}-\d\d-\d\d(?:$|T)/.test(s) || !Number.isFinite(Date.parse(s))) return false;
    const day=s.slice(0,10),civil=new Date(day+'T12:00:00Z');
    return civil.toISOString().slice(0,10)===day;
  };
  const text = s => typeof s === 'string' && s.trim().length > 0;
  const uid = () => crypto.randomUUID();
  const hex = a => Array.from(new Uint8Array(a), n => n.toString(16).padStart(2, '0')).join('');
  const digest = async b => hex(await crypto.subtle.digest('SHA-256', b));
  const state = (o,k,allowed) => { if (own(o,k) && !allowed.includes(o[k])) fail('Statut ou valeur '+k+' invalide.'); };
  const dates = (o,fields) => { for (const k of fields) if (o[k]!=null && o[k]!=='' && !date(o[k])) fail('Date invalide : '+k); };
  function rowIds(rows) {
    const ids=new Set();
    for (const r of rows) if (own(r,'id')) {
      if (!text(r.id) || ids.has(r.id)) fail('Identifiant d’historique invalide ou répété.');
      ids.add(r.id);
    }
  }

  function schema(db) {
    if (!db.objectStoreNames.contains('articles')) db.createObjectStore('articles', {keyPath:'code'});
    if (!db.objectStoreNames.contains('clients')) db.createObjectStore('clients', {keyPath:'id',autoIncrement:true});
    if (!db.objectStoreNames.contains('devis')) db.createObjectStore('devis', {keyPath:'id',autoIncrement:true});
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    if (!db.objectStoreNames.contains(RECOVERY)) db.createObjectStore(RECOVERY, {keyPath:'id'});
  }

  // Tous les getAll sont posés dans la même transaction avant le premier await.
  function read(db, names = [...STORES, RECOVERY]) {
    return new Promise((resolve, reject) => {
      let tx;
      const result = {};
      try {
        tx = db.transaction(names, 'readonly');
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error || new Error('Lecture locale annulée.'));
        tx.onerror = () => {};
        for (const name of names) {
          const store = tx.objectStore(name), values = store.getAll();
          values.onsuccess = () => { result[name] = values.result; };
          if (name === 'meta') {
            const keys = store.getAllKeys();
            keys.onsuccess = () => { result.metaKeys = keys.result; };
          }
        }
      } catch (e) { if (tx) { try { tx.abort(); } catch (_) {} } reject(e); }
    }).then(data => {
      if (data.meta) {
        data.meta = data.meta.map((value, i) => [data.metaKeys[i], value]);
        delete data.metaKeys;
      }
      return data;
    });
  }

  function settings(s) {
    if (!object(s)) fail('Réglages incorrects.');
    for (const k of ['tva100','remiseMax100'])
      if (own(s,k) && !integer(s[k],0,10000)) fail('Réglage '+k+' invalide.');
    for (const k of ['objSemaine','delaiUrgentH','delaiNormalH','relanceJours'])
      if (own(s,k) && !integer(s[k])) fail('Réglage '+k+' invalide.');
    if (own(s,'objectifs') && (!Array.isArray(s.objectifs) || s.objectifs.some(n => !integer(n))))
      fail('Objectifs invalides.');
    if (own(s,'depart') && !object(s.depart)) fail('Point de départ incorrect.');
    if (s.depart && Object.values(s.depart).some(n=>!integer(n))) fail('Point de départ numérique incorrect.');
    for (const k of ['societe','vendeur','indicatif','respNom','respTel','objDepart','heureLimite','accueilNom'])
      if (own(s,k) && typeof s[k] !== 'string') fail('Réglage texte '+k+' invalide.');
    if (s.objDepart && !/^\d{4}-(0[1-9]|1[0-2])$/.test(s.objDepart)) fail('Mois d’objectif invalide.');
    if (s.heureLimite && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.heureLimite)) fail('Heure limite invalide.');
  }

  function plan(p) {
    if (!object(p) || p.appli!=='plan-pc' || !Array.isArray(p.actions) || !Array.isArray(p.clients) || !Array.isArray(p.indicateurs) || !object(p.kpi)) fail('Plan PC invalide.');
    for (const a of p.actions) if (!object(a) || typeof a.id!=='string' || typeof a.t!=='string' || !integer(a.prio,1,3)) fail('Action PC invalide.');
    rowIds(p.actions);
    for (const a of p.actions) { state(a,'statut',['a_faire','fait','reporte','bloque']);dates(a,['jour','jourPrevu','modifieLe']); }
    for (const c of p.clients) if (!object(c) || typeof c.nom!=='string' || !Array.isArray(c.lignes) || c.lignes.some(l=>typeof l!=='string')) fail('Fiche PC invalide.');
    for (const i of p.indicateurs) if (!object(i) || ['l','v','n'].some(k=>typeof i[k]!=='string')) fail('Indicateur PC invalide.');
    for (const k of ['semaine','passee','avant','mois','moisPrec']) if (p.kpi[k]!=null) {
      const v=p.kpi[k];
      if (!object(v) || !date(v.debut) || ['cmdN','cmdHt','facN','facHt'].some(n=>typeof v[n]!=='number'||!Number.isFinite(v[n]))) fail('Chiffres du plan PC invalides.');
    }
  }

  function records(list, name, key) {
    if (!Array.isArray(list)) fail('Rubrique '+name+' absente ou incorrecte.');
    const ids = new Set();
    for (const r of list) {
      if (!object(r) || !(key === 'code' ? text(r[key]) : integer(r[key],1)) || ids.has(r[key]))
        fail('Identifiant invalide ou répété dans '+name+'.');
      ids.add(r[key]);
    }
    return ids;
  }

  function validateStores(stores) {
    if (!object(stores)) fail('Magasins de sauvegarde absents.');
    for (const k of Object.keys(stores)) if (![...STORES,RECOVERY].includes(k)) fail('Magasin inconnu : '+k);
    const clients = records(stores.clients,'garages','id');
    records(stores.devis,'devis','id'); records(stores.articles,'articles','code');
    for (const c of stores.clients) {
      if (!text(c.nom)) fail('Un garage ne possède pas de nom.');
      for (const k of ['visites','essais','infosTerrain','besoinsProduits','factures']) {
        if (own(c,k) && (!Array.isArray(c[k]) || c[k].some(x=>!object(x)))) fail('Historique '+k+' incorrect.');
      }
      for (const k of ['compte','ent','demandeCompteN1','verificationDossier'])
        if (c[k] != null && !object(c[k])) fail('Dossier '+k+' incorrect.');
      for (const k of ['nom','tel','notes','ville','villeProspection','statutCrm','conv','etape','rappel','etapeDate','priorite'])
        if (own(c,k) && typeof c[k] !== 'string') fail('Champ garage '+k+' incorrect.');
      state(c,'statutCrm',['','prospect','client']);state(c,'priorite',['','A','B','C']);state(c,'conv',['','cible','contacte','essai','converti','refus']);
      dates(c,['creeLe','rappel','etapeDate','reporteAu','etapeFaiteLe']);
      if(c.compte){state(c.compte,'statut',['','ouvert','encours','comptant','bloque']);if(own(c.compte,'plafond')&&!integer(c.compte.plafond))fail('Plafond d’encours invalide.');}
      if(c.demandeCompteN1){state(c.demandeCompteN1,'statut',['brouillon','transmis','complements','accord_declare','refus_declare']);dates(c.demandeCompteN1,['modifieLe','transmisLe','retourLe']);}
      for(const k of ['essais','infosTerrain','besoinsProduits','factures'])rowIds(c[k]||[]);
      for (const f of c.factures || []) if (!integer(f.montant) || (f.echeance && !date(f.echeance))) fail('Facture locale invalide.');
      for (const f of c.factures || []) {dates(f,['date','echeance','promesse','regleLe']);if(f.relances!=null&&(!Array.isArray(f.relances)||f.relances.some(d=>!date(d))))fail('Historique de relance invalide.');}
      for (const v of c.visites || []) if (!date(v.date) || !['vu','absent','rappeler'].includes(v.res)) fail('Visite locale invalide.');
      for (const e of c.essais || []) if (!date(e.date) || !['encours','concluant','non','commande'].includes(e.statut) || (e.suivis!=null && !Array.isArray(e.suivis))) fail('Essai local invalide.');
      for(const e of c.essais||[])dates(e,['commandeLe']);
      for(const n of c.infosTerrain||[])if(n.nature==='note-commerciale'){
        if(!text(n.id)||!text(n.texte))fail('Note commerciale invalide.');
        state(n,'statut',['information','a_faire','fait']);state(n,'type',['prix','marque','obstacle','produit','demande','autre']);state(n,'source',['client','vendeur']);state(n,'suite',['aucune','rappel','devis','essai','remonter']);dates(n,['creeLe','modifieLe','suiviLe','faitLe']);
      }
      for(const b of c.besoinsProduits||[]){state(b,'statut',['ouvert','traite']);state(b,'source',['client','vendeur']);state(b,'suite',['aucun','devis','rappel','essai']);dates(b,['creeLe','suiviLe','traiteLe']);}
    }
    for (const a of stores.articles) if (!text(a.des) || !integer(a.pu,1)) fail('Article ou prix invalide.');
    for (const d of stores.devis) {
      if (!Array.isArray(d.lignes)) fail('Un devis ne comporte pas de lignes valides.');
      if (!clients.has(d.clientId)) fail('Devis lié à un garage absent.');
      if (!text(d.clientNom) || !date(d.creeLe) || !['brouillon','envoye','accepte','refuse'].includes(d.statut)) fail('En-tête de devis invalide.');
      let total = 0n;
      for (const l of d.lignes) {
        if (!object(l) || !text(l.code) || !text(l.des) || !integer(l.q,1,99999999) || !integer(l.pu,0) || !integer(l.r,0,10000))
          fail('Ligne de devis invalide (article, quantité, prix ou remise).');
        const numerator = BigInt(l.q)*BigInt(l.pu)*BigInt(10000-l.r);
        total += (numerator*2n+1000000n)/2000000n;
      }
      if (total > BigInt(Number.MAX_SAFE_INTEGER)/2n) fail('Montant du devis trop grand pour un calcul fiable.');
      for (const k of ['t2','reponseLe','relanceLe','commandeLe','cmdPrepaLe']) if (d[k] != null && !date(d[k])) fail('Date de devis invalide : '+k);
    }
    if (!Array.isArray(stores.meta)) fail('Métadonnées absentes.');
    const keys = new Set();
    for (const entry of stores.meta) {
      if (!Array.isArray(entry) || entry.length !== 2 || !text(entry[0]) || keys.has(entry[0])) fail('Clé de métadonnées invalide ou répétée.');
      keys.add(entry[0]);
    }
    const meta = new Map(stores.meta);
    if (meta.has('settings')) settings(meta.get('settings'));
    for (const k of ['signalements','appels','pcActions','pdfFournisseursIndex','pcArchives'])
      if (meta.has(k) && (!Array.isArray(meta.get(k)) || meta.get(k).some(x=>!object(x)))) fail('Rubrique '+k+' incorrecte.');
    for (const k of ['point','comparateur','tournees'])
      if (meta.has(k) && !object(meta.get(k))) fail('Rubrique '+k+' incorrecte.');
    for (const s of meta.get('signalements') || [])
      if (s.clientId != null && !clients.has(s.clientId)) fail('Signalement lié à un garage absent.');
    for(const k of ['signalements','appels','pcActions'])rowIds(meta.get(k)||[]);
    for(const s of meta.get('signalements')||[]){state(s,'statut',['nouveau','envoye','pris','resolu']);dates(s,['date','envoyeLe','priseLe','resoluLe']);}
    for(const a of meta.get('appels')||[])dates(a,['date']);
    for(const a of meta.get('pcActions')||[]){state(a,'statut',['a_faire','fait','reporte','bloque']);dates(a,['jour','jourPrevu','reportLe','modifieLe']);}
    for (const t of Object.values(meta.get('tournees') || {}))
      if (!object(t) || !Array.isArray(t.ids) || t.ids.some(id=>!clients.has(id)) || new Set(t.ids).size!==t.ids.length ||
        (t.res != null && (!object(t.res) || Object.entries(t.res).some(([id,res])=>!t.ids.includes(Number(id)) || !['vu','absent','reporte','auto'].includes(res))))) fail('Tournée ou lien garage invalide.');
    for (const k of ['pc','pcPrecedent']) {
      if (!meta.has(k)) continue;
      plan(meta.get(k));
    }
    for (const [key,value] of meta) {
      if (key.startsWith('garage-photo-v38:')) {
        const id=Number(key.slice('garage-photo-v38:'.length));
        if (!clients.has(id) || !object(value) || !(value.blob instanceof Blob) || !value.blob.type.startsWith('image/')) fail('Photo de garage invalide ou orpheline.');
      }
      if (key.startsWith('pdfFournisseur:') && (!object(value) || !(value.blob instanceof Blob) || value.id!==key.slice('pdfFournisseur:'.length))) fail('Document PDF invalide.');
    }
    const pdfs=meta.get('pdfFournisseursIndex') || [], pdfIds=new Set();
    for (const item of pdfs) {
      if (!text(item.id) || pdfIds.has(item.id) || !text(item.nom) || !text(item.fournisseur)) fail('Index PDF invalide.');
      const doc=meta.get('pdfFournisseur:'+item.id);
      if (!doc || !integer(item.size) || doc.blob.size!==item.size) fail('Pièce PDF manquante ou taille incorrecte.');
      pdfIds.add(item.id);
    }
    for (const k of meta.keys()) if (k.startsWith('pdfFournisseur:') && !pdfIds.has(k.slice(15))) fail('PDF absent de son index.');
    if (stores[RECOVERY] != null) {
      if (!Array.isArray(stores[RECOVERY])) fail('Archives de récupération incorrectes.');
      const ids=new Set();
      for (const r of stores[RECOVERY]) {
        if (!object(r) || !text(r.id) || ids.has(r.id) || !date(r.date) || !object(r.stores) || STORES.some(k=>!Array.isArray(r.stores[k]))) fail('Archive de récupération invalide.');
        ids.add(r.id);
      }
    }
    return {garages:stores.clients.length,devis:stores.devis.length,articles:stores.articles.length,photos:[...meta.keys()].filter(k=>k.startsWith('garage-photo-v38:')).length,pdf:pdfs.length};
  }

  function legacy(o) {
    if (!object(o) || o.appli!=='devis-terrain' || o.version!==1 || (o.type && o.type!=='sauvegarde')) fail('Sauvegarde ODICOLOR de version inconnue ou fichier d’échange PC.');
    const meta=[];
    for (const [from,to] of [['reglages','settings'],['signalements','signalements'],['point','point'],['comparateur','comparateur'],['appels','appels'],['tournees','tournees'],['pcActions','pcActions']])
      if (o[from] != null) meta.push([to,o[from]]);
    const stores={articles:[],clients:o.clients,devis:o.devis,meta};
    validateStores(stores);
    return {appli:'devis-terrain',version:1,stores};
  }
  function validate(o) {
    if (!object(o) || o.appli!=='devis-terrain') fail('Sauvegarde ODICOLOR invalide.');
    if (o.version===1) return validateStores((o.stores ? o : legacy(o)).stores);
    if (!object(o) || o.appli!=='devis-terrain' || o.version!==2 || !date(o.date)) fail('Sauvegarde ODICOLOR de version inconnue.');
    return validateStores(o.stores);
  }

  // Représentation typée : les objets ordinaires restent distincts d'une référence Blob.
  // Les valeurs inconnues sont conservées ; aucun JSON.stringify implicite de Blob.
  async function pack(value, attachments, depth=0) {
    if (depth>64) fail('Données trop profondément imbriquées.');
    if (value===null || typeof value==='string' || typeof value==='boolean') return value;
    if (typeof value==='number') { if (!Number.isFinite(value)) fail('Nombre non fini dans la sauvegarde.'); return value; }
    if (value===undefined) return ['undefined'];
    if (value instanceof Blob) {
      if (value.size>MAX_ATTACHMENT) fail('Pièce jointe trop volumineuse (128 Mo maximum).');
      const hash=await digest(await value.arrayBuffer());
      let i=attachments.findIndex(a=>a.sha256===hash && a.size===value.size && a.type===value.type);
      if (i<0) { i=attachments.length; attachments.push({blob:value,size:value.size,type:value.type,sha256:hash}); }
      if (typeof File!=='undefined' && value instanceof File) return ['file',{index:i,name:value.name,lastModified:value.lastModified}];
      return ['blob',i];
    }
    if (value instanceof Date) { if (!date(value.toISOString())) fail('Date invalide.'); return ['date',value.toISOString()]; }
    if (Array.isArray(value)) {
      const out=[]; for (const v of value) out.push(await pack(v,attachments,depth+1)); return ['array',out];
    }
    if (object(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value))) {
      const out=[]; for (const [k,v] of Object.entries(value)) out.push([k,await pack(v,attachments,depth+1)]); return ['object',out];
    }
    fail('Type de donnée non pris en charge : aucune sauvegarde incomplète ne sera créée.');
  }
  function unpack(value, blobs, depth=0) {
    if (depth>64) fail('Données trop profondément imbriquées.');
    if (value===null || ['string','boolean'].includes(typeof value)) return value;
    if (typeof value==='number') { if (!Number.isFinite(value)) fail('Nombre non fini dans la sauvegarde.');return value; }
    if (!Array.isArray(value)) fail('Encodage de sauvegarde invalide.');
    const [tag,data]=value;
    if (tag==='undefined' && value.length===1) return undefined;
    if (value.length!==2) fail('Encodage de sauvegarde invalide.');
    if (tag==='blob' && integer(data,0,blobs.length-1)) return blobs[data];
    if (tag==='file' && object(data) && integer(data.index,0,blobs.length-1) && typeof data.name==='string' && integer(data.lastModified,-Number.MAX_SAFE_INTEGER))
      return new File([blobs[data.index]],data.name,{type:blobs[data.index].type,lastModified:data.lastModified});
    if (tag==='date' && date(data)) return new Date(data);
    if (tag==='array' && Array.isArray(data)) return data.map(v=>unpack(v,blobs,depth+1));
    if (tag==='object' && Array.isArray(data)) {
      const out={},seen=new Set();
      for (const entry of data) {
        if (!Array.isArray(entry) || entry.length!==2 || typeof entry[0]!=='string' || seen.has(entry[0])) fail('Objet de sauvegarde invalide.');
        seen.add(entry[0]);Object.defineProperty(out,entry[0],{value:unpack(entry[1],blobs,depth+1),enumerable:true,writable:true,configurable:true});
      }
      return out;
    }
    fail('Type de sauvegarde inconnu.');
  }

  async function encode(stores, options={}) {
    let summary,warning='';
    try{summary=validateStores(stores)}catch(e){
      if(!options.recovery)throw e;
      // Une archive d'un état déjà invalide doit rester exportable pour réparation.
      warning=e.message;summary={garages:stores.clients.length,devis:stores.devis.length};
    }
    const attachments=[];
    const data=await pack(stores,attachments);
    const header=new TextEncoder().encode(JSON.stringify({appli:'devis-terrain',version:2,date:new Date().toISOString(),warning,data,attachments:attachments.map(({blob,...a})=>a)}));
    if (header.length>MAX_HEADER) fail('Métadonnées trop volumineuses (64 Mo maximum).');
    const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,header.length,true);
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',header));
    const file=new Blob([MAGIC,size,hash,header,...attachments.map(a=>a.blob)],{type:'application/octet-stream'});
    if (file.size>MAX_FILE) fail('Sauvegarde trop volumineuse (1 Go maximum). Rien n’a été modifié.');
    return {file,summary,warning};
  }

  async function decode(file) {
    if (!(file instanceof Blob) || !file.size || file.size>MAX_FILE) fail('Fichier vide ou trop volumineux (1 Go maximum).');
    if (await file.slice(0,MAGIC.length).text()!==MAGIC) {
      if (file.size>MAX_LEGACY) fail('Ancienne sauvegarde JSON trop volumineuse (25 Mo maximum).');
      let o;try { o=JSON.parse(await file.text()); } catch (_) { fail('Sauvegarde illisible ou tronquée.'); }
      const out=legacy(o);validate(out);return out;
    }
    const offset=MAGIC.length;
    const lenBuffer=await file.slice(offset,offset+4).arrayBuffer();
    if (lenBuffer.byteLength!==4) fail('Sauvegarde tronquée.');
    const len=new DataView(lenBuffer).getUint32(0,true), begin=offset+4+32;
    if (!len || len>MAX_HEADER || begin+len>file.size) fail('En-tête de sauvegarde invalide ou tronqué.');
    const bytes=await file.slice(begin,begin+len).arrayBuffer();
    if (await digest(bytes)!==hex(await file.slice(offset+4,begin).arrayBuffer())) fail('Sauvegarde corrompue (en-tête).');
    let header;try { header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch (_) { fail('En-tête illisible.'); }
    if (!object(header) || header.appli!=='devis-terrain' || header.version!==2 || !date(header.date) || !Array.isArray(header.attachments)) fail('Version ou en-tête de sauvegarde inconnu.');
    if (header.warning) fail('Copie brute à réparer avant restauration : '+String(header.warning).slice(0,200));
    const blobs=[];let cursor=begin+len;
    for (const a of header.attachments) {
      if (!object(a) || !integer(a.size,0,MAX_ATTACHMENT) || typeof a.type!=='string' || !/^[a-f0-9]{64}$/.test(a.sha256) || cursor+a.size>file.size) fail('Pièce jointe invalide ou tronquée.');
      const blob=file.slice(cursor,cursor+a.size,a.type);cursor+=a.size;
      if (await digest(await blob.arrayBuffer())!==a.sha256) fail('Sauvegarde corrompue (pièce jointe).');
      blobs.push(blob);
    }
    if (cursor!==file.size) fail('Contenu supplémentaire inattendu dans la sauvegarde.');
    const o={appli:header.appli,version:header.version,date:header.date,stores:unpack(header.data,blobs)};
    validate(o);return o;
  }

  function restore(db, backup) {
    // Vérification synchrone avant toute ouverture de transaction d'écriture.
    const legacyFile=backup && backup.version===1;
    const normalized=legacyFile && !backup.stores ? legacy(backup) : backup;
    validate(normalized);
    const incoming=normalized.stores;
    return new Promise((resolve,reject)=>{
      let tx,problem;
      try {
        tx=db.transaction([...STORES,RECOVERY],'readwrite');
        tx.oncomplete=()=>resolve({legacy:legacyFile});
        tx.onabort=()=>reject(problem || tx.error || new Error('Restauration annulée : état précédent conservé.'));
        tx.onerror=()=>{};
        const current={},keys={},names=[...STORES,RECOVERY];let pending=names.length+1;
        const abort=e=>{problem=e;try{tx.abort();}catch(_){reject(e)}};
        const ready=()=>{
          if (--pending) return;
          try {
            current.meta=current.meta.map((v,i)=>[keys.meta[i],v]);
            const before=Object.fromEntries(STORES.map(n=>[n,current[n]]));
            // L'archive et le remplacement forment un seul commit ; aucun prune.
            const recovery=tx.objectStore(RECOVERY), existing=new Set(current[RECOVERY].map(r=>r.id));
            const archiveId=uid();
            if(existing.has(archiveId))fail('Identifiant de récupération déjà utilisé. Réessayer.');
            recovery.add({id:archiveId,date:new Date().toISOString(),motif:'Avant restauration',stores:before});
            for (const r of incoming[RECOVERY] || []) {
              const id=existing.has(r.id) || r.id===archiveId ? uid() : r.id;
              if (existing.has(id) || id===archiveId) fail('Collision d’archive de récupération.');
              existing.add(id);recovery.add({...r,id,...(id!==r.id?{sourceId:r.id}:{})});
            }
            for (const n of STORES) {
              if (legacyFile && n==='articles') continue; // Les anciens fichiers n'ont aucun tarif.
              const store=tx.objectStore(n);store.clear();
              for (const v of incoming[n]) n==='meta' ? store.put(v[1],v[0]) : store.put(v);
            }
          } catch (e) { abort(e); }
        };
        for (const n of names) {
          const store=tx.objectStore(n), req=store.getAll();
          req.onsuccess=()=>{current[n]=req.result;ready()};
          if (n==='meta') { const k=store.getAllKeys();k.onsuccess=()=>{keys.meta=k.result;ready()}; }
        }
      } catch (e) { problem=e;if(tx){try{tx.abort();}catch(_){}}reject(e); }
    });
  }

  // JSON v1 réservé à l'outil PC existant ; ce n'est pas la sauvegarde complète.
  function pcExchange(stores) {
    const m=new Map(stores.meta);
    return {appli:'devis-terrain',version:1,date:new Date().toISOString(),reglages:m.get('settings')||{},clients:stores.clients,devis:stores.devis,
      signalements:m.get('signalements')||[],point:m.get('point')||null,comparateur:m.get('comparateur')||null,
      appels:m.get('appels')||[],tournees:m.get('tournees')||{},pcActions:m.get('pcActions')||[]};
  }
  return {schema,read,validate,validateStores,legacy,encode,decode,restore,pcExchange,STORES,RECOVERY,MAX_FILE};
})();
if (typeof module !== 'undefined' && module.exports) module.exports=ODICOLOR_BACKUP;
