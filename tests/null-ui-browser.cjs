'use strict';
// Régression issue #4 : aucun texte « null » ne doit apparaître dans l'interface.
// Serveur local uniquement, profils Chromium jetables, données synthétiques uniquement.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
let browser,server,origin;
before(async()=>{
  server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.webmanifest')?'application/manifest+json':'application/octet-stream');
    res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));
  });
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(r=>server.close(r));});
// Compte les nœuds texte dont le contenu est « null » (ou une suite de « null »).
const nullTextNodes=page=>page.evaluate(()=>{
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const found=[];
  for(let n=w.nextNode();n;n=w.nextNode())if(/^(null)+$/.test(n.textContent.trim()))found.push(n.parentElement?.outerHTML.slice(0,120));
  return found;
});
test('Tournée avec base vide : pas de « null » sous « Coche au moins un garage. »',async()=>{
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto(origin+'/#/tournee');
  await page.getByText('Coche au moins un garage.',{exact:true}).waitFor();
  assert.deepEqual(await nullTextNodes(page),[]);
  await context.close();
});
for(const statut of ['','ouvert','comptant'])test('Fiche client, compte « '+(statut||'non renseigné')+' » : pas de « null » dans la section Compte',async()=>{
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto(origin+'/#/reglages');
  await page.getByRole('button',{name:'Télécharger une sauvegarde complète',exact:true}).waitFor();
  await page.evaluate(s=>putMany('clients',[{id:1,nom:'GARAGE SYNTHETIQUE NULL',compte:{statut:s},factures:[]}]),statut);
  await page.goto(origin+'/#/client/1');await page.reload();
  await page.getByText('à encaisser',{exact:true}).first().waitFor({state:'attached'});
  assert.deepEqual(await nullTextNodes(page),[]);
  await context.close();
});
