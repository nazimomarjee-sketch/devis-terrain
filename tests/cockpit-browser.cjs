'use strict';
// Cockpit du téléphone (émulation Chromium, Galaxy S9+). DONNÉES FICTIVES. Émulation ≠ vrai Samsung.
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
const jour=n=>{const d=new Date(Date.now()+n*864e5);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
test('cockpit : base vide honnête, puis priorités issues des données saisies, liens vers les fiches, sans erreur',async()=>{
  const context=await browser.newContext({...devices['Galaxy S9+']}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.route(u=>!u.href.startsWith(origin),r=>r.abort());
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  // La bannière « mise à jour prête » (fonction existante, couverte par pwa-browser) peut couvrir les boutons du bas : masquée ici pour des clics déterministes.
  await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  await page.goto(origin+'/#/cockpit');await page.getByText('Rythme non calculable').waitFor();await page.getByText(/Rien d’urgent d’après tes données/).waitFor();
  await page.evaluate(({r,e})=>putMany('clients',[{id:1,nom:'GARAGE FICTIF RAPPEL',rappel:r},{id:2,nom:'GARAGE FICTIF IMPAYE',statutCrm:'client',visites:[{date:e,res:'vu'}],factures:[{id:'f',num:'F-77',montant:123400,echeance:e}]},{id:3,nom:'GARAGE FICTIF PROSPECT A',priorite:'A',ville:'Massy'}]),{r:jour(-2),e:jour(-20)});
  await page.reload();await page.getByText('GARAGE FICTIF RAPPEL').waitFor();await page.getByText(/Facture F-77 échue depuis 20 j/).waitFor();await page.getByText(/Priorité A · jamais visité/).waitFor();
  assert.equal(await page.getByText('GARAGE FICTIF PROSPECT A').count(),1);
  await page.getByLabel('Visiter GARAGE FICTIF RAPPEL').click();await page.waitForURL(/#\/visite\/1$/);
  assert.deepEqual(errs,[]);await context.close();
});
