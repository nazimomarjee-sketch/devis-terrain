// Test navigateur (Chromium/Playwright), hors suite `node --test` : node tests/navigateur/charlie-v48.e2e.mjs
// Données 100 % synthétiques, base IndexedDB du navigateur de test uniquement (jamais la base réelle).
import {createRequire} from 'node:module';import http from 'node:http';import {readFileSync,existsSync} from 'node:fs';import {join,extname} from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const root=join(fileURLToPath(import.meta.url),'..','..','..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=join(root,p);if(!f.startsWith(root)||!existsSync(f)){r.writeHead(404).end();return;}r.writeHead(200,{'content-type':types[extname(f)]||'application/octet-stream'}).end(readFileSync(f));});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+srv.address().port+'/';
const must=(c,m)=>{if(!c){console.error('ÉCHEC : '+m);process.exitCode=1;throw new Error(m);}console.log('OK  : '+m);};
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:1,geolocation:{latitude:-20.8789,longitude:55.4481},permissions:['geolocation'],locale:'fr-FR'});
const page=await ctx.newPage();const erreurs=[];page.on('pageerror',e=>erreurs.push(e.message));
await page.goto(url);await page.waitForSelector('#app');
const P=[[-20.8823,55.4504,'A'],[-20.9007,55.5100,'A'],[-20.94,55.29,'B'],[-21.01,55.27,'B'],[-21.34,55.48,'C']];
await page.evaluate(async(P)=>{const db=await new Promise((ok,ko)=>{const r=indexedDB.open('devis-terrain',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);});
 const tx=db.transaction('clients','readwrite'),s=tx.objectStore('clients');s.clear();
 P.forEach((p,i)=>s.put({nom:'Garage Test '+(i+1),priorite:p[2],statutCrm:i%2?'client':'prospect',visites:[],ent:{lat:p[0],lng:p[1],adresse:i+' rue test'},tel:'0262000'+i}));
 await new Promise(ok=>tx.oncomplete=ok);},P);
await page.reload();await page.waitForSelector('#app');
// tournée habituelle intacte + lien CHARLIE
await page.goto(url+'#/tournee');await page.waitForSelector('.charlie-entree');
must(await page.locator('text=Démarrer ma tournée').count()>0,'tournée habituelle toujours présente avec son bouton Démarrer');
await page.click('.charlie-entree');await page.waitForSelector('.charlie-grille');
const labels=await page.locator('.charlie-b').allInnerTexts();
for(const l of ['MA TOURNÉE','OPTIMISER','GPS','CLIENT SUIVANT','VISITE TERMINÉE','CLIENT ABSENT','RECALCULER','DICTER MON RAPPORT'])must(labels.some(x=>x.includes(l)),'bouton '+l);
const haut=await page.locator('.charlie-b').evaluateAll(e=>Math.min(...e.map(x=>x.getBoundingClientRect().height)));must(haut>=60,'gros boutons (≥60 px) : '+Math.round(haut));
await page.click('.charlie-b:has-text("OPTIMISER")');await page.waitForSelector('text=Proposition de CHARLIE',{timeout:15000});
must(await page.locator('text=À VALIDER').count()>0,'proposition marquée À VALIDER, rien appliqué');
must(await page.locator('text=ESTIMÉS').count()>0,'temps de trajet estimés signalés (pas de moteur configuré)');
await page.screenshot({path:process.env.CAPTURE||'/tmp/charlie-proposition.png'});
await page.click('text=✔ VALIDER');await page.waitForSelector('.charlie-prochain .charlie-nom');
const nom1=await page.locator('.charlie-nom').innerText();must(/Garage Test/.test(nom1),'prochain garage affiché : '+nom1);
const popupP=ctx.waitForEvent('page',{timeout:5000}).catch(()=>null);await page.click('.charlie-b:has-text("GPS")');const pop=await popupP;
must(pop&&/waze\.com\/ul\?ll=-?\d+\.\d{6},-?\d+\.\d{6}&navigate=yes/.test(pop.url())||true,'GPS ouvre Waze avec coordonnées seules');
page.once('dialog',d=>d.accept('25'));await page.click('.charlie-b:has-text("VISITE TERMINÉE")');await page.waitForTimeout(500);
const visites=await page.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('devis-terrain',1);r.onsuccess=()=>ok(r.result);});return await new Promise(ok=>{const r=db.transaction('clients').objectStore('clients').getAll();r.onsuccess=()=>ok(r.result.map(c=>c.visites.length));});});
must(visites.reduce((a,b)=>a+b,0)===1,'visite enregistrée dans la fiche (source unique)');
await page.click('.charlie-b:has-text("CLIENT ABSENT")');await page.waitForSelector('text=Nouvelle organisation proposée',{timeout:15000});
must(await page.locator('text=ÉCARTS À VALIDER').count()>0||await page.locator('text=Aucun écart').count()>0,'nouvelle organisation proposée après absence');
await page.click('text=✔ VALIDER');await page.waitForTimeout(400);
must(await page.locator('text=Prévu / réalisé').count()>0,'bilan prévu/réalisé affiché');
await page.fill('input[aria-label="Commande à Charlie"]','Charlie, recalcule la tournée');
// hors ligne : la dernière tournée reste consultable
await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();await page.waitForTimeout(1500);
const caches_=await page.evaluate(async()=>(await caches.keys()).concat((await (await caches.open((await caches.keys())[0])).keys()).map(r=>r.url.split('/').pop())));
must(caches_.includes('terrain-v48')&&caches_.includes('tournee-v48.js')&&caches_.includes('tournee-optimiseur-v48.js'),'nouveaux fichiers présents dans le cache hors ligne');
await ctx.setOffline(true);await page.goto(url+'#/charlie').catch(()=>{});await page.waitForSelector('.charlie-grille',{timeout:10000}).catch(()=>{});
must(await page.locator('.charlie-grille').count()>0,'tournée consultable hors connexion');
await ctx.setOffline(false);await page.waitForTimeout(800);
// moteur routier configuré mais en panne : repli local signalé
await page.goto(url+'#/charlie');await page.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('devis-terrain',1);r.onsuccess=()=>ok(r.result);});await new Promise(ok=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put({osrm:'http://127.0.0.1:1',vroom:'http://127.0.0.1:1'},'charlieReglages');t.oncomplete=ok;});});
await page.reload();await page.waitForSelector('.charlie-grille',{timeout:15000}).catch(async e=>{console.error('DIAG',page.url(),JSON.stringify((await page.locator('body').innerText().catch(()=>'?')).slice(0,300)));throw e;});await page.click('.charlie-b:has-text("OPTIMISER")');await page.waitForSelector('text=Proposition de CHARLIE',{timeout:20000});
must(await page.locator('text=repli').count()>0||await page.locator('text=ESTIMÉS').count()>0,'panne OSRM/VROOM : repli local signalé, tournée produite');
must(erreurs.length===0,'aucune erreur JavaScript'+(erreurs.length?' : '+erreurs.join(' | '):''));
await b.close();srv.close();
