'use strict';
// L'application derrière le serveur protégé : identifiants du navigateur, service worker, installation hors ligne, démonstration. Émulation ≠ vrai Samsung.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');const {creer}=require('../scripts/serveur-demo.cjs');
const USER='demo',PASS='mot-de-passe-de-test-123';let browser,srv,origin;
before(async()=>{srv=creer({user:USER,pass:PASS});await new Promise(r=>srv.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+srv.address().port;browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();srv?.close();});
test('sans identifiants : rien ne s’affiche ; avec : l’application démarre, hors ligne complète, démonstration chargeable',async()=>{
  const sans=await browser.newContext(),p0=await sans.newPage();const r0=await p0.goto(origin+'/');assert.equal(r0.status(),401);await sans.close();
  const context=await browser.newContext({...devices['Galaxy S9+'],httpCredentials:{username:USER,password:PASS}}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  await context.setOffline(false);await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  await page.goto(origin+'/#/demo');await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Charger la démonstration'}).click()]);
  await page.getByText('Rendez-vous aujourd’hui').first().waitFor();assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-demo')),true);
  assert.deepEqual(errs,[]);await context.close();
});
test('autotest embarqué : tous les contrôles automatiques réussissent (via le serveur protégé), rapport prêt à copier',async()=>{
  const context=await browser.newContext({...devices['Galaxy S9+'],httpCredentials:{username:USER,password:PASS}}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await page.goto(origin+'/#/autotest');await page.getByText(/Tous les contrôles automatiques réussis/).waitFor({timeout:60000});
  const lignes=await page.locator('[data-controle]').evaluateAll(l=>l.map(x=>[x.dataset.controle,x.dataset.ok]));assert.equal(lignes.length,8);assert.ok(lignes.every(([,ok])=>ok==='1'),JSON.stringify(lignes));
  const rapport=await page.getByLabel('Rapport de l’autotest').inputValue();assert.match(rapport,/\[OK\]\s+Sauvegarde chiffrée/);assert.match(rapport,/À FAIRE À LA MAIN/);assert.doesNotMatch(rapport,/\b(null|undefined|NaN)\b/);
  assert.deepEqual(errs,[]);await context.close();
});
