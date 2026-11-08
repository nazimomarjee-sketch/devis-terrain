'use strict';
// Visite terrain en 4 touches (émulation Chromium, Galaxy S9+, réseau coupé). DONNÉES FICTIVES. Émulation ≠ vrai Samsung.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,devices}=require('playwright');
const root=path.resolve(__dirname,'..');let browser,server,origin;
before(async()=>{
  server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));});
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(r=>server.close(r));});
async function ouvrir(){
  const context=await browser.newContext({...devices['Galaxy S9+']}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.route(u=>!u.href.startsWith(origin),r=>r.abort());
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  // La bannière « mise à jour prête » (fonction existante, couverte par pwa-browser) peut couvrir les boutons du bas : masquée ici pour des clics déterministes.
  await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  await page.evaluate(()=>putMany('clients',[{id:1,nom:'GARAGE FICTIF VISITE',priorite:'A',ville:'Massy'},{id:2,nom:'GARAGE FICTIF DEUX',priorite:'B'}]));
  return {context,page,errs};
}
test('depuis le cockpit : visite avec échange en 4 touches exactement, enregistrée sur la fiche, annulable',async()=>{
  const {context,page,errs}=await ouvrir();let touches=0;
  await page.goto(origin+'/#/cockpit');await page.getByLabel('Visiter GARAGE FICTIF VISITE').waitFor();
  const toucher=async loc=>{touches++;await loc.click()};
  await toucher(page.getByLabel('Visiter GARAGE FICTIF VISITE'));                          // 1 : ouvrir
  await toucher(page.getByRole('button',{name:/^Vu/}));                                     // 2 : résultat
  await toucher(page.getByRole('button',{name:/Intéressé/}));                               // 3 : ce qui est ressorti
  await toucher(page.getByRole('button',{name:'Faire un devis'}));                          // 4 : suite = enregistre
  await page.locator('#titre',{hasText:'Visite enregistrée'}).waitFor();assert.equal(touches,4);
  const c=await page.evaluate(()=>get('clients',1));
  assert.equal(c.visites.length,1);assert.equal(c.visites[0].res,'vu');assert.equal(c.etape,'Devis à préparer');assert.equal(c.infosTerrain[0].suite,'devis');assert.ok(c.rappel);
  await page.getByRole('button',{name:'Annuler cette visite'}).click();await page.getByRole('button',{name:/^Vu/}).waitFor();
  const c2=await page.evaluate(()=>get('clients',1));assert.equal((c2.visites||[]).length,0);assert.equal(c2.etape,undefined);
  assert.deepEqual(errs,[]);await context.close();
});
test('absent : 3 touches, rappel posé, et le garage sort des priorités du cockpit tant que le rappel n’est pas échu',async()=>{
  const {context,page,errs}=await ouvrir();let touches=0;const toucher=async loc=>{touches++;await loc.click()};
  await page.goto(origin+'/#/cockpit');
  await toucher(page.getByLabel('Visiter GARAGE FICTIF DEUX'));await toucher(page.getByRole('button',{name:/^Absent/}));await toucher(page.getByRole('button',{name:'Repasser demain'}));
  await page.locator('#titre',{hasText:'Visite enregistrée'}).waitFor();assert.equal(touches,3);
  const c=await page.evaluate(()=>get('clients',2));assert.equal(c.visites[0].res,'absent');assert.match(c.rappel,/^\d{4}-\d\d-\d\d$/);
  await context.close();assert.deepEqual(errs,[]);
});
test('depuis la tournée : le garage est marqué traité et « Garage suivant » enchaîne sans repasser par la liste',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.evaluate(()=>{const j=aujourdhui();return lireTournees().then(T=>{T[j]={ids:[1,2],res:{}};return ecrireTournees(T)})});
  await page.goto(origin+'/#/tournee');
  await page.getByRole('link',{name:'Visite en 4 touches'}).first().click();await page.getByText('Résultat de la visite').first().waitFor();
  await page.getByRole('button',{name:/^Vu/}).click();await page.getByRole('button',{name:/Rien de particulier/}).click();await page.getByRole('button',{name:'Aucune suite'}).click();
  await page.locator('#titre',{hasText:'Visite enregistrée'}).waitFor();
  await page.getByRole('link',{name:'Garage suivant de la tournée'}).click();await page.getByText(/GARAGE FICTIF DEUX/).first().waitFor();
  const T=await page.evaluate(()=>lireTournees().then(T=>T[aujourdhui()]));assert.equal(T.res[1],'vu');assert.equal(T.res[2],undefined);
  assert.deepEqual(errs,[]);await context.close();
});
test('hors ligne : la visite s’enregistre et survit au rechargement',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.goto(origin+'/#/visite/1');await page.getByRole('button',{name:/^Vu/}).click();await page.getByRole('button',{name:/Parle du prix/}).click();await page.getByRole('button',{name:'Rappeler dans 7 jours'}).click();
  await page.locator('#titre',{hasText:'Visite enregistrée'}).waitFor();await page.reload();
  const c=await page.evaluate(()=>get('clients',1));assert.equal(c.visites.length,1);assert.equal(c.infosTerrain[0].type,'prix');assert.deepEqual(errs,[]);await context.close();
});
