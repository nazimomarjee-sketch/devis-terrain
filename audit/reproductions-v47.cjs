'use strict';
// Probes d'audit : un succès confirme le défaut V47, pas sa correction.
// Données synthétiques uniquement. Le mock ne remplace pas IndexedDB/Chrome.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
function env(){
  const context=vm.createContext({console,structuredClone,queueMicrotask,URL,Blob,
    setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,
    document:{querySelector:()=>({}),documentElement:{setAttribute(){}},querySelectorAll:()=>[]},
    navigator:{},location:{hash:'#/'},addEventListener(){},window:{}});
  vm.runInContext(source.slice(0,source.indexOf('// ---------- démarrage ----------')),context);
  return {context,run:code=>vm.runInContext(code,context),load:file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context)};
}
const valid="({appli:'devis-terrain',version:1,clients:[{id:1,nom:'Garage synthétique'}],devis:[]})";
test('A01 : lignes invalides, référence orpheline et version future acceptées',()=>{
  const {run}=env();
  assert.equal(run(`const o=${valid};o.version=999;o.devis=[{id:1,clientId:999,lignes:[null]}];verifierSauvegardeLocale(o).devis`),1);
  assert.throws(()=>run('totaux(o.devis[0])'),/null/);
});
test('A02 : une modification de TVA recalcule un ancien devis',()=>{
  const {run}=env();
  assert.equal(run("const d={lignes:[{q:100,pu:10000,r:0}]};S.tva100=850;totaux(d).ttc"),10850);
  assert.equal(run('S.tva100=2000;totaux(d).ttc'),12000);
});
test('A03 : les bornes autorisées dépassent la précision entière de Number',()=>{
  const {run}=env();
  assert.equal(run("Number.isSafeInteger(ligneTotal({q:parseQte('999999.99'),pu:parseCents('999999999999.99'),r:0}))"),false);
});
test('A04 : la dictée découpe les décimales françaises',()=>{
  const {run}=env();
  const x=run("analyserTexte('1,5 VERNIS remise 2,5')");
  assert.equal(x.length,3);
  assert.equal(x[1].q,'5');assert.equal(x[1].r,'2');
});
test('A05 : deux références distinctes sont tronquées vers la même clé',()=>{
  const {run}=env();
  assert.equal(run("const prefix='A'.repeat(60);const r=importerArticles([['c','d','p'],[prefix+'X','Produit X',1],[prefix+'Y','Produit Y',2]],0,{code:0,des:1,prix:2},new Set());r.items.length"),2);
  assert.equal(run('r.items[0].code===r.items[1].code'),true);
  assert.equal(run('r.items[0].pu!==r.items[1].pu'),true);
});
test('A06 : put() réussit au succès de requête sans attendre le commit',async()=>{
  const {run,context}=env();
  const tx={objectStore:()=>({put:()=>{const r={result:1};queueMicrotask(()=>r.onsuccess());return r;}})};
  context.mockTx=tx;run('DB.db={transaction:()=>mockTx}');
  assert.equal(await run("put('meta',{preuve:true},'audit')"),1);
  assert.equal(tx.oncomplete,undefined);assert.equal(tx.onabort,undefined);
});
test('A07 : la 61e photo de signalement est supprimée automatiquement',async()=>{
  const {run}=env();
  run('DB.db={transaction:()=>({objectStore:()=>({put:()=>{const r={};queueMicrotask(()=>r.onsuccess());return r;}})})}');
  await run("const sigs=Array.from({length:61},(_,i)=>({id:i,photo:'data:image/jpeg;base64,AA=='}));ecrireSig(sigs)");
  assert.equal(run("'photo' in sigs[60]"),false);
});
test('A08 : la 101e visite efface la plus ancienne',async()=>{
  const {run}=env();
  run('DB.db={transaction:()=>{const tx={objectStore:()=>({put(){}})};queueMicrotask(()=>tx.oncomplete());return tx}}');
  await run("const c={id:1,visites:Array.from({length:100},(_,i)=>({date:'2026-01-01',res:'vu',note:String(i)}))};marquerVisite(c,'vu')");
  assert.equal(run('c.visites.length'),100);assert.equal(run('c.visites[0].note'),'1');
});
test('A09 : sauvegarde sans catalogue, plan PC ni pièces jointes',async()=>{
  const {run,context}=env();
  run(`DB.db={transaction:()=>({objectStore:()=>({getAll:()=>req([]),get:()=>req(null)})})};
    function req(result){const r={result};queueMicrotask(()=>r.onsuccess());return r;}
    telecharger=(nom,contenu)=>{window.backup=JSON.parse(contenu)};`);
  await run('exporterSauvegarde()');
  const b=context.window.backup;
  for(const k of ['articles','pc','pcArchives','agent01Contexte','agent01Avis','pdfFournisseursIndex'])assert.equal(k in b,false,k);
});
test('A10 : une restauration garde les anciennes métadonnées liées aux IDs',async()=>{
  const {run,context}=env();
  const meta=new Map([['signalements',[{clientId:1,clientNom:'Ancien garage'}]],['pc',{actions:[{client:'Ancien garage'}]}]]);
  context.meta=meta;
  run(`DB.db={transaction:()=>{const tx={objectStore:name=>({clear(){},put:(v,k)=>{if(name==='meta')meta.set(k,v)}})};queueMicrotask(()=>tx.oncomplete());return tx}}`);
  await run(`const b=${valid};b.clients[0].nom='Autre garage';b.signalements=null;restaurerSauvegardeLocale(b)`);
  assert.equal(meta.get('signalements')[0].clientNom,'Ancien garage');assert.equal(meta.has('pc'),true);
});
test('A11 : deux créations de notes concurrentes perdent une des notes',async()=>{
  const {context,load}=env();load('notes-terrain-v29.js');
  let record={id:1,nom:'Garage synthétique',infosTerrain:[]};
  // Les deux lectures précèdent les écritures, comme deux onglets simultanés.
  const get=async()=>structuredClone(record);
  const putMany=async(_name,items)=>{record=structuredClone(items[0]);};
  const fn=vm.runInContext(fs.readFileSync(path.join(root,'notes-terrain-v29.js'),'utf8')+'\nwindow.__notesTerrainV29.sauverNote',
    vm.createContext({get,putMany,nouvelUid:()=>require('node:crypto').randomUUID(),
      pageReglages(){},pageAccueil(){},pageClient(){},pagePlus(){},route(){},window:{}}));
  const n={texte:'Note synthétique de test',type:'autre',source:'vendeur',suite:'aucune'};
  await Promise.all([fn(1,n),fn(1,n)]);
  assert.equal(record.infosTerrain.length,1);
  assert.ok(context.window.__notesTerrainV29);
});
test('A12 : le suivi des notes réécrit seulement les entrées reconnues',async()=>{
  const {context,load}=env();load('notes-terrain-v29.js');
  let record={id:1,infosTerrain:[{id:'archive',nature:'ancien-format',texte:'À conserver'}]};
  const fn=vm.runInNewContext(fs.readFileSync(path.join(root,'notes-terrain-v29.js'),'utf8')+'\nwindow.__notesTerrainV29.sauverNote',
    {get:async()=>structuredClone(record),putMany:async(_,items)=>{record=structuredClone(items[0])},nouvelUid:()=> 'nouveau',
      pageReglages(){},pageAccueil(){},pageClient(){},pagePlus(){},route(){},window:{}});
  await fn(1,{texte:'Nouvelle note synthétique',type:'autre',source:'vendeur',suite:'aucune'});
  assert.equal(record.infosTerrain.some(x=>x.id==='archive'),false);
  assert.ok(context.window.__notesTerrainV29);
});
test('A13 : service worker retourne une erreur HTTP 503 malgré le cache',async()=>{
  const handlers={},unavailable={ok:false,status:503},cached={ok:true,status:200};
  vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),{
    self:{addEventListener:(k,f)=>{handlers[k]=f}},location:{origin:'https://audit.invalid'},URL,
    fetch:async()=>unavailable,caches:{match:async()=>cached}});
  let result;
  handlers.fetch({request:{url:'https://audit.invalid/app.js',method:'GET',mode:'same-origin'},respondWith:p=>{result=p}});
  assert.equal((await result).status,503);
});
test('A14 : le fallback EBP v22 associe le premier homonyme sans code client',async()=>{
  const {run,load}=env();
  run(`function req(result){const r={result};queueMicrotask(()=>r.onsuccess());return r;}
    const pc={appli:'plan-pc',actions:[],arrete:jourLocal(new Date()),chiffre:{source:'import'},sources:{commercial:{fiable:true},importIgnorees:0},clients:[{nom:'Garage Alpha',code:'A',niveau:'bad',lignes:['Facture du garage A']},{nom:'Garage Alpha',code:'B',lignes:['Facture du garage B']}]};
    DB.db={transaction:()=>({objectStore:()=>({get:()=>req(pc),getAll:()=>req([{id:1,nom:'Garage Alpha',code:'A'},{id:2,nom:'Garage Alpha',code:'B'}])})})};
    h=(tag,attrs,...kids)=>({tag,attrs,kids});`);
  load('commercial-v22.js');
  const result=await run("blocPCClient({id:2,nom:'Garage Alpha',code:'B'})");
  assert.match(JSON.stringify(result),/Facture du garage A/);
});
test('A15 : les KPI EBP acceptent une source démo si la période correspond',()=>{
  const {run}=env();
  assert.equal(run("ebpTravail({chiffre:{source:'demo'},kpi:{semaine:{debut:'2026-10-26',cmdHt:123}}},{kc:'semaine',kp:'passee',debut:'2026-10-26',pdebut:'2026-10-19'}).cur.cmdHt"),123);
});
test('A16 : le comparateur accepte un coût de base nul et produit Infinity',()=>{
  const {run}=env();
  assert.equal(run('const a=coutPae({pPeint:0,kPeint:4,pDur:0,kDur:1,pDil:0,kDil:1,rend:10});const b=coutPae({pPeint:10,kPeint:4,pDur:2,kDur:1,pDil:1,kDil:1,rend:10});(b.m2-a.m2)/a.m2*100'),Infinity);
});
