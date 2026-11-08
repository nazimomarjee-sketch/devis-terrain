'use strict';
// Ma Ville sur le téléphone (émulation Chromium, Galaxy S9+, réseau coupé). GARAGES FICTIFS. Émulation ≠ vrai Samsung.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,devices}=require('playwright');
const root=path.resolve(__dirname,'..');let browser,server,origin;
before(async()=>{
  server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));});
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(r=>server.close(r));});
async function ouvrir(){
  const context=await browser.newContext({...devices['Galaxy S9+']}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.route(u=>!u.href.startsWith(origin),r=>r.abort());
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  return {context,page,errs};
}
test('Ma Ville : liste des communes, vue Commune tactile, 1er toucher = aperçu, 2e = fiche du téléphone ; 5 personnages au plus',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.evaluate(()=>putMany('clients',[
    {id:1,nom:'GARAGE FICTIF UN',ville:'Corbeil-Essonnes',cp:'91100',statutCrm:'client'},{id:2,nom:'GARAGE FICTIF DEUX',ville:'Corbeil-Essonnes',cp:'91100',statutCrm:'prospect'},
    {id:3,nom:'GARAGE FICTIF TROIS',ville:'Massy',cp:'91300',statutCrm:'prospect'},{id:4,nom:'GARAGE FICTIF SANS COMMUNE',statutCrm:'prospect'}]));
  await page.goto(origin+'/#/ville');await page.getByText('Corbeil-Essonnes').first().waitFor();await page.getByText(/à classer/).first().waitFor();
  await page.getByText('Corbeil-Essonnes').first().click();await page.waitForURL(/#\/ville\/91174$/);
  await page.locator('.vc-svg').waitFor();
  assert.equal(await page.locator('.vc-ligne').count(),2,'tous les garages de la commune sont listés');
  assert.equal(await page.locator('.vc-svg .vc-cible').count()>=2,true);
  await page.locator('.vc-ligne',{hasText:'GARAGE FICTIF UN'}).click();                          // 1er toucher : aperçu
  await page.locator('.vc-apercu h4',{hasText:'GARAGE FICTIF UN'}).waitFor();
  await page.getByRole('button',{name:/Ouvrir la fiche/}).click();                                 // 2e : fiche du téléphone
  await page.waitForURL(/#\/client\/1$/);
  assert.deepEqual(errs,[]);await context.close();
});
test('Ma Ville : lisible sur un écran de téléphone (pas de défilement horizontal de la page), hors ligne',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.evaluate(()=>putMany('clients',Array.from({length:30},(_,i)=>({id:i+1,nom:'GARAGE FICTIF '+i,ville:'Corbeil-Essonnes',cp:'91100',statutCrm:i%3?'prospect':'client'}))));
  await page.goto(origin+'/#/ville/91174');await page.locator('.vc-svg').waitFor();
  const l=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,n:document.querySelectorAll('.vc-ligne').length}));
  assert.equal(l.n,30);assert.ok(l.sw<=l.cw+1,'défilement horizontal : '+l.sw+' > '+l.cw);
  assert.deepEqual(errs,[]);await context.close();
});
test('toutes les nouvelles pages (base vide puis garnie) : jamais de « null », « undefined » ou « NaN » affiché',async()=>{
  const {context,page,errs}=await ouvrir();
  const pages=['#/plus','#/cockpit','#/ca','#/ca/import','#/carte','#/ville','#/visite/1','#/ville/91174'];
  const verifier=async()=>{for(const h of pages){await page.goto(origin+'/'+h);await page.waitForTimeout(250);const t=await page.evaluate(()=>document.body.innerText);const m=t.match(/\b(null|undefined|NaN)\b/g);assert.equal(m,null,h+' affiche '+(m||[]).join(','));}};
  await verifier();
  await page.evaluate(()=>putMany('clients',[{id:1,nom:'GARAGE FICTIF A',ville:'Corbeil-Essonnes',cp:'91100',statutCrm:'client',rappel:'2026-01-01',factures:[{num:'F1',montant:100,echeance:'2026-01-02'}]},{id:2,nom:'GARAGE FICTIF B',priorite:'A'}]));
  await verifier();assert.deepEqual(errs,[]);await context.close();
});
