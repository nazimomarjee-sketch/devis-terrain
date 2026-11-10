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
test('origine terrain : base vide, création persistante, démonstration inaccessible ; marqueur fictif jamais masqué',async()=>{
  // Le routage teste l’origine HTTPS exacte avec le serveur local ; le hors-ligne est couvert ci-dessus.
  const terrain='https://terrain-odicolor-production.up.railway.app';
  const context=await browser.newContext({...devices['Galaxy S9+'],serviceWorkers:'block'}),errs=[];
  await context.route(terrain+'/**',async route=>{
    const u=new URL(route.request().url());
    const response=await route.fetch({url:origin+u.pathname+u.search,headers:{Authorization:'Basic '+Buffer.from(USER+':'+PASS).toString('base64')}});
    await route.fulfill({response});
  });
  let page=await context.newPage();page.on('pageerror',e=>errs.push(e.message));
  await page.goto(terrain+'/#/nouveau-garage');await page.getByLabel('Nom du garage',{exact:true}).waitFor();
  assert.equal(await page.evaluate(async()=>(await getAll('clients')).length),0);
  assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-test-env')),false);
  await page.getByLabel('Nom du garage',{exact:true}).fill('Garage test isolé');
  await page.getByLabel('Ville du garage',{exact:true}).fill('Palaiseau');
  await page.getByRole('button',{name:'Créer et vérifier le prospect',exact:true}).click();
  await page.waitForURL('**/#/dossier-prospect/*');await page.close();
  page=await context.newPage();page.on('pageerror',e=>errs.push(e.message));
  await page.goto(terrain+'/#/clients');await page.getByText('Garage test isolé',{exact:true}).first().waitFor();
  assert.equal(await page.evaluate(async()=>(await getAll('clients')).length),1);
  await page.goto(terrain+'/#/plus');await page.getByRole('link',{name:/Autotest du téléphone/}).waitFor();
  assert.equal(await page.locator('a[href="#/demo"]').count(),0);
  await page.goto(terrain+'/#/demo');await page.getByText('Cet espace est réservé à tes garages.').waitFor();
  assert.equal(await page.getByRole('button',{name:'Charger la démonstration'}).count(),0);
  assert.equal(await page.evaluate(async()=>(await getAll('clients')).length),1);
  await page.evaluate(async()=>{await put('meta',true,'demo');await marquerDemo();});
  assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-demo')),true);
  assert.deepEqual(errs,[]);await context.close();
});
test('première ouverture : aucun bandeau « mise à jour prête » (ce n’est pas une mise à jour) ; la page n’est pas recouverte',async()=>{
  const context=await browser.newContext({...devices['Galaxy S9+'],httpCredentials:{username:USER,password:PASS}}),page=await context.newPage();
  await page.goto(origin+'/#/');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForTimeout(1500);
  assert.equal(await page.locator('#v25-maj').count(),0,'bandeau affiché à tort à la première installation');
  await page.reload();await page.waitForTimeout(1200);assert.equal(await page.locator('#v25-maj').count(),0);await context.close();
});
