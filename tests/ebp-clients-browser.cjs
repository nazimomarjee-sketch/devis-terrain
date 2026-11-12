'use strict';
// Import EBP des clients et rapprochement (émulation Chromium, Galaxy S9+, réseau coupé). DONNÉES FICTIVES. Émulation ≠ vrai Samsung.
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
  const context=await browser.newContext({...devices['Galaxy S9+']}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(u=>!u.href.startsWith(origin),r=>r.abort());
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  return {context,page,errs};
}
const CSV=['Code client;Raison sociale;Ville;Code postal;Bloqué;Famille client','C001;GARAGE DUPONT SARL;Massy;91300;Non;Carrosserie','C002;AUTO MARTIN;Palaiseau;91120;Oui;Mécanique','C003;GARAGE DUMONT;Evry;91000;Non;','C004;CARROSSERIE INCONNUE;Paris;75001;Non;'].join('\r\n');
test('import clients EBP : propositions, aucun lien sans validation, liaison cochée, vérifié, création explicite ; traçabilité et alerte « compte bloqué »',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.evaluate(()=>putMany('clients',[{id:1,nom:'Garage Dupont',ville:'Massy',cp:'91300',statutCrm:'prospect'},{id:2,nom:'Auto Martin Services',cp:'91120',statutCrm:'prospect'},{id:3,nom:'Garage Dumont',ville:'Cergy',cp:'95000'},{id:4,nom:'GARAGE DUMONT',ville:'Créteil',cp:'94000'}]));
  await page.goto(origin+'/#/clients-ebp');await page.getByLabel('Export EBP des clients').setInputFiles({name:'clients-ebp-test.csv',mimeType:'text/csv',buffer:Buffer.from(CSV,'latin1')});
  await page.getByText(/4 client\(s\) EBP · 0 déjà lié\(s\) · 1 proposition\(s\) forte\(s\) · 2 à vérifier · 1 sans garage · 1 compte\(s\) bloqué/).waitFor();
  assert.equal((await page.evaluate(()=>getAll('clients'))).filter(c=>c.codeEbp).length,0,'aucun lien tant que rien n’est validé');
  await page.getByLabel('Lier C001',{exact:true}).check();await page.getByRole('button',{name:'Lier les liens cochés'}).click();
  await page.getByText(/1 déjà lié\(s\)/).waitFor();
  // à vérifier : C002 (nom proche + même CP) choisi à la main
  await page.getByText(/À vérifier · 2/).click();
  await page.getByLabel('Garage pour C002').selectOption({index:1});await page.getByRole('button',{name:'Lier'}).first().click();await page.getByText(/2 déjà lié\(s\)/).waitFor();
  // sans garage : création explicite
  await page.getByText(/Sans garage correspondant · 1/).click();await page.getByRole('button',{name:'Créer la fiche'}).click();await page.getByText(/Fiche créée/).waitFor();
  const cl=await page.evaluate(()=>getAll('clients')),g1=cl.find(c=>c.id===1),g2=cl.find(c=>c.id===2);
  assert.equal(g1.codeEbp,'C001');assert.equal(g1.liaisonEbp.methode,'nom+lieu');assert.match(g1.liaisonEbp.source,/clients-ebp-test\.csv/);assert.equal(g2.codeEbp,'C002');assert.equal(g2.ebp.bloque,true);
  assert.ok(cl.some(c=>c.codeEbp==='C004'&&c.statutCrm==='client'),'fiche créée sur demande');assert.equal(cl.find(c=>c.id===3).codeEbp,undefined);assert.equal(cl.find(c=>c.id===4).codeEbp,undefined);
  // l'alerte du cockpit reprend le compte bloqué EBP
  await page.goto(origin+'/#/cockpit');await page.getByText(/Compte bloqué dans EBP/).waitFor();
  // sauvegarde chiffrée : liaisons et liste EBP conservées
  const ok=await page.evaluate(async()=>{const d=await ODICOLOR_BACKUP.read(DB.db),{file}=await ODICOLOR_BACKUP.encodeChiffre(d,'phrase fictive ebp clients'),o=await ODICOLOR_BACKUP.decode(file,{phrase:'phrase fictive ebp clients'});return [o.stores.clients.filter(c=>c.codeEbp).length,new Map(o.stores.meta).get('ebpClients').clients.length];});
  assert.deepEqual(ok,[3,4]);assert.deepEqual(errs,[]);await context.close();
});
test('import clients EBP : colonne « Code client » absente → refus clair, rien écrit',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.goto(origin+'/#/clients-ebp');await page.getByLabel('Export EBP des clients').setInputFiles({name:'mauvais.csv',mimeType:'text/csv',buffer:Buffer.from('Nom;Ville\r\nX;Y')});
  await page.getByText(/Colonne\(s\) obligatoire\(s\) introuvable\(s\)/).waitFor();assert.equal(await page.evaluate(()=>get('meta','ebpClients')),undefined);
  // choix manuel : la colonne « Nom » sert de code faute de mieux → la lecture aboutit, sans rien enregistrer
  await page.getByLabel('Colonne pour Ville').selectOption({value:''});await page.getByLabel('Colonne pour Code client').selectOption({label:'Ville'});await page.getByRole('button',{name:'Utiliser ces colonnes'}).click();await page.getByText(/1 client\(s\) EBP/).waitFor();assert.equal(await page.evaluate(()=>get('meta','ebpClients')),undefined);assert.deepEqual(errs,[]);await context.close();
});
