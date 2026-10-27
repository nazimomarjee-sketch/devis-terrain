'use strict';
// Test d'intégration : application réelle, quatre magasins IndexedDB natifs et Blob.
// npm install --no-save --ignore-scripts playwright@1.56.1
// npx playwright install chromium && node tests/backup-browser-v47.cjs
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve,extname}=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.ODICOLOR_CHROMIUM?{executablePath:process.env.ODICOLOR_CHROMIUM}:{}),args:['--no-sandbox']});
 try{
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:412,height:915}});
  await ctx.route('https://odicolor.test/**',route=>{
   const name=decodeURIComponent(new URL(route.request().url()).pathname).slice(1)||'index.html';
   if(name.includes('..'))return route.abort();
   const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
   try{return route.fulfill({body:readFileSync(resolve(__dirname,'..',name)),contentType:types[extname(name)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://odicolor.test/');await page.waitForFunction(()=>DB.db!==null);
  const result=await page.evaluate(async()=>{
   const date='2026-10-27T12:00:00.000Z';
   const etat={articles:[{code:'V',des:'Vernis synthétique',pu:1250}],clients:[{id:7,nom:'Garage synthétique',infosTerrain:[{texte:'Test navigateur'}]}],devis:[{id:21,clientId:7,creeLe:date,statut:'brouillon',lignes:[{code:'V',des:'Vernis',q:100,pu:1250,r:500}]}],meta:[['settings',{...SET_DEF}],['garage-photo-v38:7',{blob:new Blob(['photo'],{type:'image/png'})}],['pdfFournisseursIndex',[{id:'p',nom:'Test.pdf',fournisseur:'Test'}]],['pdfFournisseur:p',{blob:new Blob(['%PDF-1.4 synthétique'],{type:'application/pdf'})}],['agent01Avis',{test:true}],['pc',{appli:'plan-pc',actions:[],clients:[],indicateurs:[]}]]};
   const o=await encoderInstantaneSauvegarde(etat);
   await restaurerSauvegardeLocale(JSON.parse(JSON.stringify(o)));await chargerBase();
   const avant=JSON.stringify(await encoderInstantaneSauvegarde(await lireInstantaneSauvegarde()));
   let refuse=false;const invalide=structuredClone(o);invalide.devis[0].lignes=[null];
   try{await restaurerSauvegardeLocale(invalide);}catch{refuse=true;}
   const apres=JSON.stringify({...JSON.parse(avant),...await encoderInstantaneSauvegarde(await lireInstantaneSauvegarde()),date:JSON.parse(avant).date});
   // Provoquer un abort natif après les requêtes d'écriture, avant oncomplete.
   const putOriginal=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){const r=putOriginal.apply(this,args);if(this.name==='devis')this.transaction.abort();return r;};
   let abort=false;try{await restaurerSauvegardeLocale(o);}catch{abort=true;}finally{IDBObjectStore.prototype.put=putOriginal;}
   const apresAbort=await encoderInstantaneSauvegarde(await lireInstantaneSauvegarde());apresAbort.date=JSON.parse(avant).date;
   const keys=await rq(st('meta').getAllKeys());
   const photo=await (await get('meta','garage-photo-v38:7')).blob.text();
   const pdf=await (await get('meta','pdfFournisseur:p')).blob.text();
   const totals=totaux((await getAll('devis'))[0]);
   // Un autre portefeuille ne récupère ni assistant, ni photo/PDF/PC du précédent.
   await restaurerSauvegardeLocale({appli:'devis-terrain',version:1,clients:[{id:7,nom:'Autre garage'}],devis:[]});
   const reste=await lireInstantaneSauvegarde();
   return {refuse,identique:avant===apres,abort,identiqueAbort:avant===JSON.stringify(apresAbort),archives:keys.filter(k=>k.startsWith('restauration-v2:')).length,photo,pdf,totals,metaRestantes:reste.meta.map(([k])=>k),articlesRestants:reste.articles.length};
  });
  assert.equal(result.refuse,true);assert.equal(result.identique,true);assert.equal(result.abort,true);assert.equal(result.identiqueAbort,true);assert.equal(result.archives,1);
  assert.equal(result.photo,'photo');assert.equal(result.pdf,'%PDF-1.4 synthétique');assert.equal(result.totals.ht,1188);assert.equal(result.articlesRestants,0);assert.deepEqual(result.metaRestantes,['settings']);
  assert.deepEqual(errors,[]);
  console.log('OK Chromium : 15 scripts chargés, restauration vierge, octets Blob/PDF, calculs, corruption sans écriture, abort natif, archives et remplacement v1.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
