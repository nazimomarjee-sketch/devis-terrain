'use strict';
// Contrôle Chromium/IndexedDB réel, sans donnée commerciale ni sortie réseau.
// CI : npm install --no-save playwright@1.56.1 && npx playwright install chromium
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');
let server,browser,page,legacyServer,temp;
before(async()=>{
  const root=path.resolve(__dirname,'..');
  server=http.createServer((req,res)=>{
    const requestPath=new URL(req.url,'http://localhost').pathname;
    const pathname=requestPath==='/'?'/index.html':requestPath;
    if(pathname==='/test'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/sauvegarde-locale.js"></script></body></html>');return;}
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
  });
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'odicolor-retour-test-'));
  const kit=require('../scripts/preparer-retour-v47.cjs').prepare(path.join(temp,'kit'));
  legacyServer=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(kit.destination,'.'+(p==='/'?'/index.html':p));
    if(!file.startsWith(kit.destination+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
  });
  await new Promise((r,j)=>{legacyServer.once('error',j);legacyServer.listen(0,'127.0.0.1',r)});
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port+'/test');
  await page.evaluate(()=>{
    window.B=ODICOLOR_BACKUP;
    window.openTest=(name,version=2)=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>{if(version===1){for(const n of B.STORES)r.result.createObjectStore(n,n==='meta'?undefined:{keyPath:n==='articles'?'code':'id',autoIncrement:n!=='articles'});}else B.schema(r.result)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    window.seed=(db,stores)=>new Promise((resolve,reject)=>{const t=db.transaction(Object.keys(stores),'readwrite');t.oncomplete=resolve;t.onabort=()=>reject(t.error);for(const [n,rows]of Object.entries(stores))for(const row of rows)n==='meta'?t.objectStore(n).put(row[1],row[0]):t.objectStore(n).put(row)});
    window.sample=()=>({articles:[{code:'V',des:'Vernis test',pu:1234}],clients:[{id:7,nom:'Garage test',infosTerrain:[{nature:'ancien-format',texte:'À conserver'}]}],devis:[{id:21,clientId:7,clientNom:'Garage test',creeLe:'2026-10-20T09:00:00Z',statut:'brouillon',lignes:[{code:'V',des:'Vernis test',q:100,pu:1234,r:0}]}],meta:[['settings',{tva100:850,remiseMax100:6000}],['garage-photo-v38:7',{blob:new Blob(['photo'],{type:'image/webp'})}]],recuperations:[]});
  });
});
after(async()=>{await browser?.close();for(const s of [server,legacyServer])if(s?.listening)await new Promise(r=>s.close(r));if(temp)fs.rmSync(temp,{recursive:true,force:true});});
test('migration IndexedDB v1 → v2 conserve les fiches et ajoute seulement les archives',async()=>{
  const result=await page.evaluate(async()=>{const name='migration-'+crypto.randomUUID(),old=await openTest(name,1);await seed(old,{clients:[{id:1,nom:'Garage initial'}]});old.close();const db=await openTest(name),s=await B.read(db);const out={names:[...db.objectStoreNames],clients:s.clients};db.close();indexedDB.deleteDatabase(name);return out;});
  assert.deepEqual(result.names,['articles','clients','devis','meta','recuperations']);assert.equal(result.clients[0].nom,'Garage initial');
});
test('cycle complet vers une base vierge avec Blob réel, tarifs, notes et archives',async()=>{
  const r=await page.evaluate(async()=>{const source=await openTest('source-'+crypto.randomUUID()),target=await openTest('target-'+crypto.randomUUID()),s=sample();const pdf=new Blob(['%PDF-test'],{type:'application/pdf'});s.meta.push(['pdfFournisseursIndex',[{id:'pdf',nom:'Guide.pdf',fournisseur:'Test',size:pdf.size}]],['pdfFournisseur:pdf',{id:'pdf',blob:pdf}],['extension',{preuve:'inconnue'}]);await seed(source,s);const encoded=await B.encode(await B.read(source)),decoded=await B.decode(encoded.file);await B.restore(target,decoded);const out=await B.read(target),m=new Map(out.meta);source.close();target.close();return {articles:out.articles,notes:out.clients[0].infosTerrain,pdf:await m.get('pdfFournisseur:pdf').blob.text(),photo:await m.get('garage-photo-v38:7').blob.text(),recovery:out.recuperations.length};});
  assert.equal(r.articles[0].pu,1234);assert.equal(r.notes[0].nature,'ancien-format');assert.equal(r.pdf,'%PDF-test');assert.equal(r.photo,'photo');assert.equal(r.recovery,1);
});
test('abort asynchrone réel après clear/put restaure aussi l’archive',async()=>{
  const r=await page.evaluate(async()=>{const db=await openTest('abort-'+crypto.randomUUID());await seed(db,{clients:[{id:1,nom:'Initial'}]});let aborted=false;const proxy={transaction(names,mode){const t=db.transaction(names,mode);const objectStore=t.objectStore.bind(t);t.objectStore=n=>{const store=objectStore(n);if(n==='devis'){const put=store.put.bind(store);store.put=(...args)=>{const req=put(...args);req.addEventListener('success',()=>{aborted=true;t.abort()});return req}}return store};return t}};let rejected=false;try{await B.restore(proxy,{appli:'devis-terrain',version:2,date:new Date().toISOString(),stores:sample()})}catch(_){rejected=true}const out=await B.read(db);db.close();return {rejected,aborted,clients:out.clients,archives:out.recuperations.length,articles:out.articles.length};});
  assert.equal(r.rejected,true);assert.equal(r.aborted,true);assert.equal(r.clients[0].id,1);assert.equal(r.archives,0);assert.equal(r.articles,0);
});
test('legacy JSON ne réassocie pas les anciennes métadonnées et garde une récupération',async()=>{
  const r=await page.evaluate(async()=>{const db=await openTest('legacy-'+crypto.randomUUID());await seed(db,sample());const legacy={appli:'devis-terrain',version:1,clients:[{id:7,nom:'Autre garage'}],devis:[]};await B.restore(db,await B.decode(new Blob([JSON.stringify(legacy)])));const out=await B.read(db),old=out.recuperations[0];db.close();return {photo:new Map(out.meta).has('garage-photo-v38:7'),oldPhoto:await new Map(old.stores.meta).get('garage-photo-v38:7').blob.text(),articles:out.articles.length,previousArticle:old.stores.articles[0].code,name:out.clients[0].nom};});
  assert.equal(r.photo,false);assert.equal(r.oldPhoto,'photo');assert.equal(r.articles,0);assert.equal(r.previousArticle,'V');assert.equal(r.name,'Autre garage');
});
test('application complète : modules chargés et sauvegarde complète dans Réglages',async()=>{
  const ui=await browser.newPage({viewport:{width:412,height:915}}),errors=[];ui.on('pageerror',e=>errors.push(e.message));
  await ui.goto('http://127.0.0.1:'+server.address().port+'/#/reglages');
  await ui.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();
  const file=ui.waitForEvent('download');await ui.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).click();
  const download=await file;assert.match(download.suggestedFilename(),/\.odicolor$/);
  assert.deepEqual(errors,[]);await ui.close();
});
test('deux onglets : une ancienne fiche ne peut plus écrire après restauration',async()=>{
  const context=await browser.newContext(),first=await context.newPage(),second=await context.newPage();
  const url='http://127.0.0.1:'+server.address().port+'/#/reglages';
  await first.goto(url);await first.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();
  await second.goto(url);await second.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();
  await second.evaluate(()=>{window.ancienneFiche={id:1,nom:'Ancien portefeuille'};});
  await first.evaluate(async()=>{await restaurerSauvegardeLocale({appli:'devis-terrain',version:2,date:new Date().toISOString(),stores:{articles:[],clients:[{id:1,nom:'Nouveau portefeuille'}],devis:[],meta:[]}})});
  const blocked=await second.evaluate(async()=>{try{await putMany('clients',[window.ancienneFiche]);return false}catch(_){return true}});
  assert.equal(blocked,true);
  assert.equal(await first.evaluate(async()=>(await get('clients',1)).nom),'Nouveau portefeuille');
  await second.reload();await second.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();
  assert.equal(await second.evaluate(async()=>(await get('clients',1)).nom),'Nouveau portefeuille');
  await context.close();
});
test('échec de migration : la base v1 et ses données restent intactes',async()=>{
  const r=await page.evaluate(async()=>{const name='migration-abort-'+crypto.randomUUID(),old=await openTest(name,1);await seed(old,{clients:[{id:1,nom:'Initial'}]});old.close();let rejected=false;await new Promise(resolve=>{const req=indexedDB.open(name,2);req.onupgradeneeded=()=>{B.schema(req.result);req.transaction.abort()};req.onerror=()=>{rejected=true;resolve()}});const db=await openTest(name,1),tx=db.transaction('clients'),clients=await new Promise(r=>{const q=tx.objectStore('clients').getAll();q.onsuccess=()=>r(q.result)});const result={version:db.version,hasRecovery:db.objectStoreNames.contains('recuperations'),clients,rejected};db.close();return result;});
  assert.equal(r.version,1);assert.equal(r.hasRecovery,false);assert.equal(r.clients[0].nom,'Initial');assert.equal(r.rejected,true);
});
test('retour refusé sur une base v2 existante, sans baisse de version ni effacement',async()=>{
  const r=await page.evaluate(async()=>{const name='no-downgrade-'+crypto.randomUUID(),db=await openTest(name);await seed(db,sample());db.close();let refused=false;try{await B.createV47Copy({appli:'devis-terrain',version:2,date:new Date().toISOString(),stores:sample()},name)}catch(_){refused=true}const after=await openTest(name),s=await B.read(after);const result={refused,version:after.version,name:s.clients[0].nom,photos:new Map(s.meta).has('garage-photo-v38:7')};after.close();return result;});
  assert.equal(r.refused,true);assert.equal(r.version,2);assert.equal(r.name,'Garage test');assert.equal(r.photos,true);
});
test('procédure complète : exporter v2, créer une copie v1 et ouvrir le vrai code V47 figé',async()=>{
  const context=await browser.newContext(),source=await context.newPage(),target=await context.newPage();
  await source.goto('http://127.0.0.1:'+server.address().port+'/test');
  await source.evaluate(async()=>{const B=ODICOLOR_BACKUP;const req=indexedDB.open('devis-terrain',2);const db=await new Promise((r,j)=>{req.onupgradeneeded=()=>B.schema(req.result);req.onsuccess=()=>r(req.result);req.onerror=()=>j(req.error)});const {stores}=await (async()=>({stores:{articles:[{code:'V',des:'Vernis test',pu:1234}],clients:[{id:7,nom:'Garage retour synthétique',visites:[{date:'2026-10-20',res:'vu'}],infosTerrain:[{nature:'ancien-format',texte:'Ne pas filtrer'}]}],devis:[],meta:[['garage-photo-v38:7',{blob:new Blob(['photo'],{type:'image/webp'})}]],recuperations:[]}}))();await B.restore(db,{appli:'devis-terrain',version:2,date:new Date().toISOString(),stores});db.close()});
  await source.goto('http://127.0.0.1:'+server.address().port+'/recuperation-v47.html');
  const promise=source.waitForEvent('download');await source.getByRole('button',{name:'Télécharger la sauvegarde complète de cette origine'}).click();const download=await promise,file=path.join(temp,'retour-complet.odicolor');await download.saveAs(file);
  await target.goto('http://127.0.0.1:'+legacyServer.address().port+'/recuperation-v47.html');await target.locator('#fichier').setInputFiles(file);await target.locator('#isole').check();target.on('dialog',d=>d.accept());await target.locator('#copier-v47').click();await target.waitForFunction(()=>document.querySelector('#resultat').textContent.includes('Copie créée au schéma 1'));
  await target.goto('http://127.0.0.1:'+legacyServer.address().port+'/#/reglages');await target.getByRole('button',{name:'Télécharger une sauvegarde',exact:true}).waitFor();
  const restored=await target.evaluate(async()=>({version:DB.db.version,clients:await getAll('clients'),articles:await getAll('articles'),photo:await (await get('meta','garage-photo-v38:7')).blob.text(),archives:(await getAll('recuperations')).length}));
  assert.equal(restored.version,1);assert.equal(restored.clients[0].nom,'Garage retour synthétique');assert.equal(restored.clients[0].infosTerrain[0].texte,'Ne pas filtrer');assert.equal(restored.articles[0].pu,1234);assert.equal(restored.photo,'photo');assert.ok(restored.archives>=1);
  const unchanged=await source.evaluate(async()=>{const req=indexedDB.open('devis-terrain');const db=await new Promise(r=>req.onsuccess=()=>r(req.result)),s=await ODICOLOR_BACKUP.read(db),v=db.version;db.close();return {version:v,clients:s.clients,photo:await new Map(s.meta).get('garage-photo-v38:7').blob.text()}});
  assert.equal(unchanged.version,2);assert.deepEqual(unchanged.clients,restored.clients);assert.equal(unchanged.photo,'photo');await context.close();
});
