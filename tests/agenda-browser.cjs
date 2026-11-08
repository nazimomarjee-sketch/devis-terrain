'use strict';
// Rendez-vous avec heure et intégration à la tournée (émulation Chromium, Galaxy S9+, réseau coupé). DONNÉES FICTIVES. Émulation ≠ vrai Samsung.
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
  const context=await browser.newContext({...devices['Galaxy S9+']}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('dialog',d=>d.accept('Client absent'));
  await page.route(u=>!u.href.startsWith(origin),r=>r.abort());
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  await page.evaluate(()=>{const c0=ODICOLOR_COMMUNES_CENTRES.find(r=>r[0]==='91174'),rows=ODICOLOR_COMMUNES_CENTRES.filter(r=>r[4]&&Math.hypot((r[2]-c0[2])*111,(r[3]-c0[3])*73)<9).slice(0,5);
    return putMany('clients',rows.map((r,i)=>({id:i+1,nom:'GARAGE FICTIF '+(i+1),ville:r[1],cp:r[4].split(' ')[0],statutCrm:'client',rappel:'2026-01-01'})))});
  return {context,page,errs};
}
test('agenda : création contrôlée, chevauchement refusé, déplacement, annulation motivée ; cockpit affiche le rendez-vous du jour',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.goto(origin+'/#/agenda');await page.getByRole('heading',{name:'Nouveau rendez-vous'}).waitFor();
  const saisir=async(nom,heure)=>{await page.getByLabel('Garage du rendez-vous').selectOption({label:nom});await page.getByLabel('Heure du rendez-vous').fill(heure);await page.getByRole('button',{name:'Enregistrer',exact:true}).click();};
  await saisir('GARAGE FICTIF 1','23:00');                                                       // avant l'heure courante ? la date du jour reste valide (jour entier)
  await page.getByText('1 rendez-vous aujourd’hui').waitFor();
  await saisir('GARAGE FICTIF 2','23:15');await page.getByText(/Chevauche le rendez-vous de 23:00/).waitFor();   // 23:00 + 30 min chevauche 23:15
  await page.getByText('Déplacer').first().click();await page.getByLabel('Nouvelle heure').fill('07:30');await page.getByRole('button',{name:'Enregistrer le déplacement'}).click();
  await page.getByText(/07:30 · GARAGE FICTIF 1/).waitFor();
  await page.goto(origin+'/#/cockpit');await page.getByLabel(/Rendez-vous 07:30 GARAGE FICTIF 1/).waitFor();
  await page.goto(origin+'/#/agenda');await page.getByRole('button',{name:'Annuler',exact:true}).first().click();await page.getByText('1 rendez-vous aujourd’hui').waitFor({state:'detached'}).catch(()=>{});
  const m=await page.evaluate(()=>get('meta','agenda'));assert.equal(m.rdv.length,1);assert.equal(m.rdv[0].statut,'annule');assert.equal(m.rdv[0].motif,'Client absent');
  assert.deepEqual(errs,[]);await context.close();
});
test('tournée proposée : le rendez-vous du jour est un point fixe avec son heure ; visite faite → rendez-vous terminé ; annulation de la visite le remet « prévu »',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.evaluate(()=>{const j=aujourdhui();return put('meta',{version:1,rdv:[{id:'r1',clientId:3,clientNom:'GARAGE FICTIF 3',date:j,heure:'14:00',duree:30,objet:'',statut:'prevu',creeLe:new Date().toISOString()}]},'agenda')});
  await page.goto(origin+'/#/proposition');await page.getByText(/⏰ RDV 14:00/).waitFor();
  await page.getByRole('button',{name:'Valider cette tournée'}).click();await page.waitForURL(/#\/tournee$/);
  await page.getByText(/⏰ 14:00 · GARAGE FICTIF 3/).waitFor();
  const T=await page.evaluate(()=>lireTournees().then(T=>T[aujourdhui()]));assert.equal(T.rdv[3],'14:00');
  await page.goto(origin+'/#/visite/3?t=1');await page.getByRole('button',{name:/^Vu/}).click();await page.getByRole('button',{name:/Rien de particulier/}).click();await page.getByRole('button',{name:'Aucune suite'}).click();
  await page.locator('#titre',{hasText:'Visite enregistrée'}).waitFor();
  assert.equal((await page.evaluate(()=>get('meta','agenda'))).rdv[0].statut,'fait');
  await page.getByRole('button',{name:'Annuler cette visite'}).click();await page.getByRole('button',{name:/^Vu/}).waitFor();
  assert.equal((await page.evaluate(()=>get('meta','agenda'))).rdv[0].statut,'prevu','annuler la visite remet le rendez-vous');
  assert.deepEqual(errs,[]);await context.close();
});
test('sauvegarde chiffrée : l’agenda est conservé et restauré',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.evaluate(()=>put('meta',{version:1,rdv:[{id:'r1',clientId:1,clientNom:'G',date:'2026-12-01',heure:'10:00',duree:45,objet:'x',statut:'prevu',creeLe:'t'}]},'agenda'));
  const n=await page.evaluate(async()=>{const d=await ODICOLOR_BACKUP.read(DB.db),{file}=await ODICOLOR_BACKUP.encodeChiffre(d,'phrase fictive agenda 99'),o=await ODICOLOR_BACKUP.decode(file,{phrase:'phrase fictive agenda 99'});return new Map(o.stores.meta).get('agenda').rdv.length});
  assert.equal(n,1);assert.deepEqual(errs,[]);await context.close();
});
