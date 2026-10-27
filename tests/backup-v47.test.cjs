'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {runInNewContext}=require('node:vm');
const {webcrypto}=require('node:crypto');
const app=readFileSync(join(__dirname,'..','app.js'),'utf8');
const block=app.slice(app.indexOf('const SAUVEGARDE_MAX'),app.indexOf('// ---------- lien avec le PC'));
const defaults=app.match(/const SET_DEF = (.*);/)[1];
function mockDb(initial={},opts={}){
  let called=0;
  const current=Object.fromEntries(['articles','clients','devis','meta'].map(n=>[n,new Map(structuredClone(initial[n]||[]))]));
  const db={transaction(names,mode){
    called++;
    const staged=Object.fromEntries(names.map(n=>[n,new Map(current[n])]));
    const tx={error:null,aborted:false,abort(){this.aborted=true;queueMicrotask(()=>this.onabort?.());},objectStore(n){
      return {
        getAll(){const r={};queueMicrotask(()=>{r.result=[...staged[n].values()];r.onsuccess?.();});return r;},
        getAllKeys(){const r={};queueMicrotask(()=>{r.result=[...staged[n].keys()];r.onsuccess?.();});return r;},
        clear(){staged[n].clear();},
        put(v,k){
          if(opts.failOnPut===n)throw Error('Écriture impossible');
          if(opts.abortOnPut===n){tx.error=new Error('QuotaExceededError');queueMicrotask(()=>tx.abort());}
          staged[n].set(k===undefined?(n==='articles'?v.code:v.id):k,structuredClone(v));
        }
      };
    }};
    setImmediate(()=>{if(tx.aborted)return;if(mode==='readwrite')for(const n of names)current[n]=staged[n];tx.oncomplete?.();});
    return tx;
  }};
  return {db,current,get called(){return called}};
}
function helpers(mock=mockDb()){
  return runInNewContext('const SET_DEF='+defaults+';\n'+block+'\n({verifierSauvegardeLocale,preparerSauvegardeLocale,restaurerSauvegardeLocale,lireInstantaneSauvegarde,encoderInstantaneSauvegarde,SAUVEGARDE_MAX})',
    {DB:{db:mock.db},Set,Map,Number,Error,Promise,Blob,Uint8Array,crypto:webcrypto,btoa,atob});
}
const date='2026-10-27T12:00:00.000Z';
const valide={appli:'devis-terrain',version:1,clients:[{id:7,nom:'Garage synthétique',infosTerrain:[{texte:'Visite prévue',inconnu:{x:1}}]}],
  devis:[{id:21,clientId:7,creeLe:date,statut:'brouillon',lignes:[{code:'V',des:'Vernis',q:100,pu:1250,r:500}]}],
  reglages:{societe:'ODICOLOR'},pcActions:[{id:'A1',statut:'a_faire'}]};
const original={articles:[['OLD',{code:'OLD',des:'Ancien',pu:200}]],clients:[[1,{id:1,nom:'Original'}]],devis:[],meta:[['signalements',[{id:'old',clientId:1}]],['pc',{appli:'plan-pc',actions:[]}],['agent01Avis',{ancien:true}],['garage-photo-v38:1',{blob:new Blob(['photo'],{type:'image/png'})}],['inconnue',{conserver:true}]]};
const snapshot=m=>structuredClone([...Object.entries(m.current)].map(([n,v])=>[n,[...v]]));
async function complet(h){
  return h.encoderInstantaneSauvegarde({articles:[{code:'V',des:'Vernis',pu:1250,champInconnu:'préservé'}],clients:valide.clients,devis:valide.devis,meta:[
    ['settings',valide.reglages],['rapport_articles',{date,fichier:'synthetique.csv'}],['pc',{appli:'plan-pc',actions:[],clients:[],indicateurs:[]}],['pcArchives',[]],['pcPrecedent',null],['pcActions',valide.pcActions],
    ['agent01Contexte',{id:'ctx',candidats:[]}],['agent01Avis',{date,avis:[]}],['tournees',{'2026-10-27':{ids:[7],res:{7:'vu'}}}],
    ['garage-photo-v38:7',{blob:new Blob(['PHOTO synthétique'],{type:'image/png'}),date}],
    ['pdfFournisseursIndex',[{id:'p1',nom:'Synthétique.pdf',fournisseur:'Test'}]],['pdfFournisseur:p1',{id:'p1',blob:new Blob(['%PDF-1.4 synthétique'],{type:''}),date}],
    ['extensionInconnue',{texte:'préservé',liste:[1,2,3]}]
  ]});
}
test('ancien format valide : migration explicite sans dépendre du poste courant',async()=>{
 const h=helpers();assert.equal(h.verifierSauvegardeLocale(valide).garages,1);
 const e=await h.preparerSauvegardeLocale(valide);assert.equal(e.articles.length,0);assert.equal(e.meta.some(([k])=>k==='pc'),false);
 assert.equal(e.clients[0].infosTerrain[0].inconnu.x,1);
});
test('versions inconnues, corruption métier, dates, statuts, nombres et relations refusés sans transaction',async()=>{
 const cas=[o=>o.version=999,o=>o.appli='autre',o=>o.clients.push(o.clients[0]),o=>o.clients[0].nom='',o=>o.devis[0].lignes=null,o=>o.devis[0].lignes=[null],o=>o.devis[0].clientId=999,
  o=>o.devis[0].statut='invente',o=>o.devis[0].creeLe='2026-02-30',o=>o.devis[0].lignes[0].q=-1,o=>o.devis[0].lignes[0].pu=1.2,o=>o.devis[0].lignes[0].r=10001,
  o=>o.reglages.tva100='850',o=>o.reglages.remiseMax100=Infinity,o=>o.devis[0].lignes[0].pu=Number.MAX_SAFE_INTEGER,o=>o.clients[0].visites=[null],o=>o.tournees={'2026-10-27':{ids:[999]}}];
 for(const modifier of cas){const m=mockDb(original),h=helpers(m),o=structuredClone(valide);modifier(o);const avant=snapshot(m);await assert.rejects(async()=>h.restaurerSauvegardeLocale(o));assert.equal(m.called,0);assert.deepEqual(snapshot(m),avant);}
});
test('v1 : remplacement atomique, aucun reste du portefeuille, archive complète récupérable',async()=>{
 const m=mockDb(original),h=helpers(m);await h.restaurerSauvegardeLocale(valide);
 assert.equal(m.current.clients.has(1),false);assert.equal(m.current.clients.get(7).infosTerrain[0].texte,'Visite prévue');
 assert.equal(m.current.articles.size,0);
 for(const k of ['signalements','pc','agent01Avis','garage-photo-v38:1','inconnue'])assert.equal(m.current.meta.has(k),false,k);
 const archives=[...m.current.meta].filter(([k])=>k.startsWith('restauration-v2:'));assert.equal(archives.length,1);
 assert.equal(archives[0][1].clients[0].nom,'Original');assert.equal(archives[0][1].articles[0].code,'OLD');
 assert.equal(await archives[0][1].meta.find(([k])=>k==='garage-photo-v38:1')[1].blob.text(),'photo');
 assert.equal(m.called,1);
});
test('échec synchrone et abort asynchrone : données ET archives inchangées, aucun faux succès',async()=>{
 for(const opts of [{failOnPut:'devis'},{abortOnPut:'meta'}]){
  const m=mockDb(original,opts),h=helpers(m),avant=snapshot(m);await assert.rejects(h.restaurerSauvegardeLocale(valide));assert.deepEqual(snapshot(m),avant);
 }
});
test('v2 : récupération sur poste vierge, prix/historiques/PC/assistant/pièces/octets identiques',async()=>{
 const m=mockDb(),h=helpers(m),o=await complet(h);assert.equal(o.manifeste.complet,true);assert.equal(o.manifeste.pieces.length,2);
 const parsed=JSON.parse(JSON.stringify(o));await h.restaurerSauvegardeLocale(parsed);
 assert.equal(m.current.articles.get('V').pu,1250);assert.equal(m.current.articles.get('V').champInconnu,'préservé');
 assert.equal(m.current.clients.get(7).infosTerrain[0].inconnu.x,1);
 for(const k of ['pc','pcArchives','pcPrecedent','pcActions','agent01Contexte','agent01Avis','rapport_articles','extensionInconnue'])assert.ok(m.current.meta.has(k),k);
 assert.equal(await m.current.meta.get('garage-photo-v38:7').blob.text(),'PHOTO synthétique');
 assert.equal(await m.current.meta.get('pdfFournisseur:p1').blob.text(),'%PDF-1.4 synthétique');
 const retour=await h.encoderInstantaneSauvegarde(await h.lireInstantaneSauvegarde());
 assert.deepEqual(JSON.parse(JSON.stringify(retour.manifeste)),JSON.parse(JSON.stringify(o.manifeste)));
 assert.deepEqual(JSON.parse(JSON.stringify(retour.meta)),JSON.parse(JSON.stringify(o.meta)));
});
test('pièce tronquée, empreinte, manifeste et index incomplets : refus avant écriture',async()=>{
 const h=helpers(),o=await complet(h);
 const cas=[x=>x.meta.find(([k])=>k==='garage-photo-v38:7')[1].blob.base64='AA==',x=>x.manifeste.pieces.pop(),x=>x.manifeste.complet=false,x=>x.meta=x.meta.filter(([k])=>k!=='pdfFournisseur:p1'),x=>x.meta.push(x.meta[0]),x=>x.clients=[]];
 for(const modifier of cas){const m=mockDb(original),f=helpers(m),x=JSON.parse(JSON.stringify(o));modifier(x);await assert.rejects(f.restaurerSauvegardeLocale(x));assert.equal(m.called,0);}
});
test('archives de plusieurs restaurations conservées sans imbriquer les anciens instantanés',async()=>{
 const m=mockDb(),h=helpers(m),o=await complet(h);await h.restaurerSauvegardeLocale(o);await h.restaurerSauvegardeLocale(valide);
 const archives=[...m.current.meta].filter(([k])=>k.startsWith('restauration-v2:'));assert.equal(archives.length,2);
 for(const [,v] of archives)assert.equal(v.meta.some(([k])=>k.startsWith('restauration-v2:')),false);
 const retour=await h.encoderInstantaneSauvegarde(archives.find(([,v])=>v.clients.length)[1]);await h.restaurerSauvegardeLocale(JSON.parse(JSON.stringify(retour)));
 assert.equal(await m.current.meta.get('pdfFournisseur:p1').blob.text(),'%PDF-1.4 synthétique');
});
test('seuil partagé export/import et ancien plafond de fiches supprimé : 20 001 garages restaurables',async()=>{
 const m=mockDb(),h=helpers(m),o={...structuredClone(valide),clients:Array.from({length:20001},(_,i)=>({id:i+1,nom:'Garage '+(i+1)}))};
 assert.equal(h.SAUVEGARDE_MAX,600*1024*1024);await h.restaurerSauvegardeLocale(o);assert.equal(m.current.clients.size,20001);
});
