'use strict';
// Démonstration 100 % fictive (émulation Chromium, Galaxy S9+, réseau coupé). Émulation ≠ vrai Samsung.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
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
  const context=await browser.newContext({...devices['Galaxy S9+'],acceptDownloads:true}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(u=>!u.href.startsWith(origin),r=>r.abort());
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  return {context,page,errs};
}
test('démonstration : chargement sur base vide, bannière permanente, parcours complet avec les fichiers d’essai, sortie propre',async()=>{
  const {context,page,errs}=await ouvrir();const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'demo-'));
  await page.goto(origin+'/#/demo');await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Charger la démonstration'}).click()]);
  await page.waitForURL(/#\/cockpit$/);await page.getByText('Rendez-vous aujourd’hui').first().waitFor();
  assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-demo')),true,'bannière de démonstration');
  const cl=await page.evaluate(()=>getAll('clients'));assert.equal(cl.length,150);assert.ok(cl.every(c=>c.nom.startsWith('DÉMO ')));
  // les fichiers d'essai se téléchargent ; on les réimporte (parcours réel)
  await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  await page.goto(origin+'/#/demo');const fich={};
  for(const nom of ['demo-ebp-clients.csv','demo-ebp-pieces.csv','demo-recensement-par-commune.csv']){const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger '+nom}).click();const d=await dl;const f=path.join(tmp,nom);await d.saveAs(f);fich[nom]=f;}
  await page.goto(origin+'/#/clients-ebp');await page.getByLabel('Export EBP des clients').setInputFiles(fich['demo-ebp-clients.csv']);
  await page.getByText(/proposition\(s\) forte\(s\)/).waitFor();await page.getByRole('button',{name:'Tout cocher'}).click();await page.getByRole('button',{name:'Lier les liens cochés'}).click();await page.getByText(/déjà lié\(s\)/).waitFor();
  await page.goto(origin+'/#/ca/import');await page.getByLabel('Export EBP des pièces').setInputFiles(fich['demo-ebp-pieces.csv']);
  await page.getByText(/pièce\(s\) à ajouter/).waitFor();await page.getByRole('button',{name:/^Importer ces/}).click();await page.waitForURL(/#\/ca$/);
  await page.goto(origin+'/#/secteurs');await page.getByText(/actif\(s\)/).first().waitFor();
  await page.goto(origin+'/#/carte');await page.getByText('Marché recensé : importer un fichier').click();await page.getByLabel('Recensement par commune (CSV)').setInputFiles(fich['demo-recensement-par-commune.csv']);await page.getByText(/marché recensé :/).waitFor();
  await page.goto(origin+'/#/cockpit');await page.locator('.cg-grille').waitFor();
  // sortie : tout est effacé, plus de bannière
  await page.goto(origin+'/#/demo');await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Quitter la démonstration'}).click()]);await page.goto(origin+'/#/demo');await page.getByRole('button',{name:'Charger la démonstration'}).waitFor();
  assert.equal((await page.evaluate(()=>getAll('clients'))).length,0);assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-demo')),false);
  assert.deepEqual(errs,[]);await context.close();fs.rmSync(tmp,{recursive:true,force:true});
});
test('protection : la démonstration refuse de se charger sur un téléphone qui contient déjà des données',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.evaluate(()=>putMany('clients',[{id:1,nom:'VRAI GARAGE FICTIF',statutCrm:'client'}]));
  await page.goto(origin+'/#/demo');await page.getByText(/ne peut pas y être chargée/).waitFor();assert.equal(await page.getByRole('button',{name:'Charger la démonstration'}).count(),0);
  assert.equal((await page.evaluate(()=>getAll('clients'))).length,1,'rien n’est touché');assert.deepEqual(errs,[]);await context.close();
});
