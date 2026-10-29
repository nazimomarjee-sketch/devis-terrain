'use strict';
// Serveurs locaux uniquement, profils Chromium jetables, aucune donnée réelle.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
let browser,server,temp,alternate,legacy,manifestA,manifestB,origin,mode='A';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
before(async()=>{
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'odicolor-pwa-'));alternate=path.join(temp,'B');fs.mkdirSync(alternate);
  manifestA=JSON.parse(fs.readFileSync(path.join(root,'pwa-release.json'),'utf8'));
  for(const f of [...manifestA.assets.map(e=>e.path),'pwa/index.template.html','pwa/recuperation-v47.template.html','pwa/client.template.js','pwa/worker-template.js','scripts/build-pwa.cjs']){const out=path.join(alternate,f);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(root,f),out);}
  fs.appendFileSync(path.join(alternate,'pwa/client.template.js'),'\n/* Variante synthétique B pour vérifier le changement de version. */\n');
  manifestB=require('../scripts/build-pwa.cjs')(alternate);
  legacy=require('../scripts/preparer-retour-v47.cjs').prepare(path.join(temp,'V47')).destination;
  server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://localhost').pathname;
    const dir=mode==='legacy'?legacy:mode==='A'||mode==='initial-bad'?root:alternate;
    const file=path.resolve(dir,'.'+(p==='/'?'/index.html':p));
    if(!file.startsWith(dir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    const blocked=p==='/techniques-commerciales-v46.js';
    if(blocked&&mode==='bad-503'){res.writeHead(503);res.end('indisponible');return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.webmanifest')?'application/manifest+json':'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    if(blocked&&['bad-sha','initial-bad'].includes(mode)){res.end('/* contenu incorrect de test */');return;}
    res.end(fs.readFileSync(file));
  });
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(r=>server.close(r));if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function installed(context,old=false){
  const page=await context.newPage();await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:old?'Télécharger une sauvegarde':'Télécharger une sauvegarde complète',exact:true}).waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await page.getByRole('button',{name:old?'Télécharger une sauvegarde':'Télécharger une sauvegarde complète',exact:true}).waitFor();return page;
}
async function waiting(page){await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);}
async function nextVersion(context,page){
  await page.close();
  for(let i=0;i<6;i++){
    await delay(250);const p=await context.newPage();await p.goto(origin+'/#/reglages');
    await p.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();
    if(await p.evaluate(()=>window.ODICOLOR_PWA.release)===manifestB.id)return p;
    await p.close();
  }
  throw Error('La nouvelle version ne s’est pas activée après fermeture des fenêtres.');
}
async function failedInstall(page){
  await page.evaluate(()=>new Promise(async(resolve,reject)=>{
    const reg=await navigator.serviceWorker.getRegistration();const timeout=setTimeout(()=>reject(Error('Installation non terminée')),20000);
    reg.addEventListener('updatefound',()=>{const w=reg.installing;w.addEventListener('statechange',()=>{if(w.state==='redundant'){clearTimeout(timeout);resolve()}})},{once:true});
    reg.update().catch(()=>{});
  }));
}
for(const failure of ['bad-503','bad-sha'])test('installation '+failure+' refusée, ancien shell conservé hors ligne',async()=>{
  mode='A';const context=await browser.newContext(),page=await installed(context);
  await page.evaluate(()=>putMany('clients',[{id:1,nom:'GARAGE SYNTHETIQUE A'}]));
  mode=failure;await failedInstall(page);
  assert.equal(await page.evaluate(()=>ODICOLOR_PWA.release),manifestA.id);
  const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.some(k=>k.endsWith(manifestA.id)));assert.equal(keys.some(k=>k.endsWith(manifestB.id)),false);
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();assert.equal(await page.evaluate(async()=>(await get('clients',1)).nom),'GARAGE SYNTHETIQUE A');assert.equal(await page.evaluate(()=>ODICOLOR_PWA.release),manifestA.id);await context.close();
});
test('mise à jour en attente : saisie conservée, activation à la fermeture, aucun mélange',async()=>{
  mode='A';const context=await browser.newContext();let page=await installed(context);
  await page.locator('input[aria-label="Nom sur le devis"]').fill('BROUILLON SYNTHETIQUE NON ENREGISTRE');
  mode='B';await waiting(page);assert.equal(await page.locator('input[aria-label="Nom sur le devis"]').inputValue(),'BROUILLON SYNTHETIQUE NON ENREGISTRE');assert.equal(await page.evaluate(()=>ODICOLOR_PWA.release),manifestA.id);
  await page.getByRole('button',{name:'Plus tard',exact:true}).click();assert.equal(await page.evaluate(()=>ODICOLOR_PWA.release),manifestA.id);
  page=await nextVersion(context,page);assert.equal(await page.evaluate(()=>ODICOLOR_PWA.release),manifestB.id);
  const old=manifestA.assets.find(e=>e.path==='pwa-client.js');const text=await page.evaluate(async url=>(await fetch(url)).text(),'pwa-client.js?odicolor='+old.sha256);assert.ok(text.includes(manifestA.id));
  assert.equal(await page.evaluate(async()=>(await fetch('app.js')).status),503);
  assert.equal(await page.evaluate(async()=>(await fetch('app.js?odicolor='+'0'.repeat(64))).status),503);
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();assert.equal(await page.evaluate(()=>ODICOLOR_PWA.release),manifestB.id);await context.close();
});
test('premier chargement incohérent : intégrité bloquante avant toute migration',async()=>{
  mode='initial-bad';const context=await browser.newContext(),page=await context.newPage();await page.goto(origin+'/#/reglages');await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(async()=>(await indexedDB.databases()).some(d=>d.name==='devis-terrain')),false);assert.match(await page.getByRole('alert').textContent(),/Chargement incomplet/);await context.close();
});
test('transition depuis le vrai terrain-v47 : ancien écran intact puis migration cohérente',async()=>{
  mode='legacy';const context=await browser.newContext();let page=await installed(context,true);
  await page.evaluate(()=>putMany('clients',[{id:1,nom:'GARAGE SYNTHETIQUE V47'}]));await page.locator('input[aria-label="Nom sur le devis"]').fill('BROUILLON V47');
  mode='B';await waiting(page);assert.equal(await page.evaluate(()=>DB.db.version),1);assert.equal(await page.locator('input[aria-label="Nom sur le devis"]').inputValue(),'BROUILLON V47');
  page=await nextVersion(context,page);assert.equal(await page.evaluate(()=>DB.db.version),2);assert.equal(await page.evaluate(async()=>(await get('clients',1)).nom),'GARAGE SYNTHETIQUE V47');assert.ok((await page.evaluate(()=>caches.keys())).includes('terrain-v47'));
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();assert.equal(await page.evaluate(()=>ODICOLOR_PWA.release),manifestB.id);await context.close();
});
test('réparation en ligne d’une ressource évincée : uniquement ses octets attendus',async()=>{
  mode='A';const context=await browser.newContext(),page=await installed(context),entry=manifestA.assets.find(e=>e.path==='app.js'),url=origin+'/app.js?odicolor='+entry.sha256;
  await page.evaluate(async({id,url})=>{for(const k of await caches.keys())if(k.endsWith(id))await (await caches.open(k)).delete(url)},{id:manifestA.id,url});
  assert.equal(await page.evaluate(async url=>(await fetch(url)).status,url),200);
  await page.waitForFunction(async({id,url})=>{for(const k of await caches.keys())if(k.endsWith(id))return !!await(await caches.open(k)).match(url);return false},{id:manifestA.id,url});
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();assert.equal(await page.evaluate(()=>ODICOLOR_PWA.release),manifestA.id);await context.close();
});
