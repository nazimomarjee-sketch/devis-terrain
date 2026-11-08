'use strict';
// CA facturé HT sur le téléphone (émulation Chromium, Galaxy S9+, réseau coupé). DONNÉES FICTIVES. Émulation ≠ vrai Samsung.
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
const auj=new Date(),iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),AUJ=iso(auj),MOIS=AUJ.slice(0,7);
async function ouvrir(){
  const context=await browser.newContext({...devices['Galaxy S9+']}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.route(u=>!u.href.startsWith(origin),r=>r.abort());
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  return {context,page,errs};
}
const saisir=async(page,{type='facture',num,date=AUJ,montant,confirm=false})=>{
  await page.locator('select[aria-label="Type de pièce"]').selectOption(type);await page.getByLabel('Numéro de la pièce').fill(num);await page.getByLabel('Date de la pièce').fill(date);await page.getByLabel('Montant hors taxes').fill(montant);
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
};
test('saisie contrôlée : CA = factures − avoirs ; doublon et futur refusés ; commandes et CA distincts sur l’accueil',async()=>{
  const {context,page,errs}=await ouvrir();
  // une commande envoyée de 9 999 € : ne doit JAMAIS entrer dans le CA
  await page.evaluate(({AUJ})=>putMany('clients',[{id:1,nom:'GARAGE FICTIF CA',factures:[]}]).then(()=>putMany('devis',[{id:1,clientId:1,clientNom:'GARAGE FICTIF CA',creeLe:AUJ+'T08:00:00Z',statut:'envoye',commandeLe:AUJ,lignes:[{code:'X',des:'Produit fictif',q:100,pu:999900,r:0}]}])),{AUJ});
  await page.evaluate(()=>put('meta',{...S,objDepart:new Date().toISOString().slice(0,7),objectifs:[100000000,0,0]},'settings').then(()=>{S={...S,objDepart:new Date().toISOString().slice(0,7),objectifs:[100000000,0,0]};}));
  await page.goto(origin+'/#/');await page.getByText('CA non renseigné').waitFor();
  await page.goto(origin+'/#/ca');await page.getByRole('heading',{name:'Ajouter une pièce'}).waitFor();
  await saisir(page,{num:'F-2026-001',montant:'1 000,00'});await page.getByText('Facture F-2026-001').waitFor();
  await saisir(page,{num:'F-2026-002',montant:'500'});await page.getByText('Facture F-2026-002').waitFor();
  await saisir(page,{type:'avoir',num:'A-2026-001',montant:'200'});await page.getByText('Avoir A-2026-001').waitFor();
  // doublon (casse/tirets différents) refusé avec message
  await saisir(page,{num:'f2026001',montant:'1000'});await page.getByText(/Doublon/).waitFor();
  // date future refusée
  const demain=new Date(auj.getTime()+864e5);await saisir(page,{num:'F-FUTUR',date:iso(demain),montant:'10'});
  // le champ date a max=aujourd'hui : le contrôle métier doit aussi refuser
  const r=await page.evaluate(()=>get('meta','caFacture'));
  assert.equal(r.entrees.length,3,'seules les trois pièces valides sont enregistrées');
  await page.getByText('1 300,00 €').first().waitFor();                      // 1000 + 500 − 200
  // accueil : CA facturé 1 300 €, commandes 9 999 € affichées séparément
  await page.goto(origin+'/#/');await page.locator('.v23-objectif').getByText(/commandes envoyées 9.999,00 € HT/).waitFor();
  const carte=page.locator('.v23-objectif'),texte=await carte.innerText();
  assert.match(texte,/OBJECTIF · CA FACTURÉ HT/);assert.match(texte,/Mois : 1[  ]300,00 €/);assert.doesNotMatch(texte.split('Source')[0],/9[  ]999/,'les commandes ne sont pas dans le chiffre d’objectif');
  assert.deepEqual(errs,[]);await context.close();
});
test('annulation avec motif : la pièce reste dans l’historique et sort du CA ; le numéro est réutilisable',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.goto(origin+'/#/ca');await page.getByRole('heading',{name:'Ajouter une pièce'}).waitFor();
  await saisir(page,{num:'F-A',montant:'300'});await page.getByText('Facture F-A').waitFor();
  page.once('dialog',d=>d.accept('Erreur de montant'));await page.getByRole('button',{name:'Annuler cette pièce'}).click();
  await page.getByText(/annulé\(e\)/).waitFor();await page.getByText(/motif : Erreur de montant/).waitFor();
  const r=await page.evaluate(()=>get('meta','caFacture'));assert.equal(r.entrees.length,1);assert.equal(r.entrees[0].annule.motif,'Erreur de montant');
  await saisir(page,{num:'F-A',montant:'320'});await page.getByText('320,00 € HT').waitFor();
  assert.deepEqual(errs,[]);await context.close();
});
test('rechargement : le CA saisi est conservé, et la sauvegarde chiffrée le restitue',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.goto(origin+'/#/ca');await page.getByRole('heading',{name:'Ajouter une pièce'}).waitFor();
  await saisir(page,{num:'F-OFF',montant:'123,45'});await page.getByText('Facture F-OFF').waitFor();
  await page.reload();await page.getByText('Facture F-OFF').waitFor();
  const octets=await page.evaluate(async()=>{const d=await ODICOLOR_BACKUP.read(DB.db),{file}=await ODICOLOR_BACKUP.encodeChiffre(d,'phrase fictive de test CA');const o=await ODICOLOR_BACKUP.decode(file,{phrase:'phrase fictive de test CA'});return new Map(o.stores.meta).get('caFacture').entrees.map(e=>[e.numero,e.montantHt]);});
  assert.deepEqual(octets,[['F-OFF',12345]]);assert.deepEqual(errs,[]);await context.close();
});

test('import EBP : aperçu sans écriture, import, réimport sans doublon, conflit non écrasé, annulation de l’import — CSV Windows-1252',async()=>{
  const {context,page,errs}=await ouvrir();
  const d1=iso(new Date(auj.getTime()-2*864e5)).split('-').reverse().join('/');
  const csv=l=>Buffer.from(l.join('\r\n'),'latin1');
  const f1=csv(['Type;N° de pièce;Date;Nom du client;Total HT','Facture;FA-100;'+d1+';GARAGE FICTIF É;1 000,00','Facture;FA-101;'+d1+';GARAGE FICTIF B;250,50','Avoir;AV-100;'+d1+';GARAGE FICTIF B;-50,00','Devis;DE-1;'+d1+';GARAGE FICTIF C;9 999,00']);
  await page.goto(origin+'/#/ca/import');
  await page.getByLabel('Export EBP des pièces').setInputFiles({name:'export-ebp-test.csv',mimeType:'text/csv',buffer:f1});
  await page.getByText('3 pièce(s) à ajouter').waitFor();await page.getByText(/1 devis/).waitFor();
  assert.equal(await page.evaluate(()=>get('meta','caFacture')),undefined,'rien n’est écrit avant confirmation');
  await page.getByRole('button',{name:'Importer ces 3 pièces'}).click();await page.waitForURL(/#\/ca$/);
  await page.getByText('1 200,50 €').first().waitFor();                       // 1000 + 250,50 − 50
  // réimport du même fichier : 0 nouvelle
  await page.goto(origin+'/#/ca/import');await page.getByLabel('Export EBP des pièces').setInputFiles({name:'export-ebp-test.csv',mimeType:'text/csv',buffer:f1});
  await page.getByText('0 pièce(s) à ajouter').waitFor();await page.getByText(/3 déjà présente/).waitFor();
  // conflit : même numéro, autre montant
  const f2=csv(['Type;N° de pièce;Date;Nom du client;Total HT','Facture;FA-100;'+d1+';GARAGE FICTIF É;2 000,00']);
  await page.getByLabel('Export EBP des pièces').setInputFiles({name:'export-modifie.csv',mimeType:'text/csv',buffer:f2});
  await page.getByText(/1 conflit\(s\) non importé/).waitFor();
  assert.equal((await page.evaluate(()=>get('meta','caFacture'))).entrees.length,3,'aucun écrasement');
  // historique + annulation de l’import
  await page.goto(origin+'/#/ca');await page.getByText(/export-ebp-test\.csv/).first().waitFor();
  page.once('dialog',d=>d.accept('Mauvais fichier de test'));await page.getByRole('button',{name:'Annuler cet import'}).click();
  await page.getByText(/export-ebp-test\.csv · annulé/).waitFor();
  const m=await page.evaluate(()=>get('meta','caFacture'));assert.equal(m.entrees.length,3);assert.ok(m.entrees.every(e=>e.annule&&e.source==='ebp'&&e.import.fichier==='export-ebp-test.csv'));
  assert.deepEqual(errs,[]);await context.close();
});
test('import EBP : fichier sans colonne HT refusé avec un message clair, rien écrit',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.goto(origin+'/#/ca/import');await page.getByLabel('Export EBP des pièces').setInputFiles({name:'ttc.csv',mimeType:'text/csv',buffer:Buffer.from('Type;N° de pièce;Date;Client;Total TTC\r\nFacture;FA-1;01/11/2026;G;120')});
  await page.getByText(/Colonne\(s\) obligatoire\(s\) introuvable\(s\)/).waitFor();assert.equal(await page.evaluate(()=>get('meta','caFacture')),undefined);
  assert.deepEqual(errs,[]);await context.close();
});
