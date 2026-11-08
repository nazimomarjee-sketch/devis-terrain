'use strict';
// Carte commerciale du téléphone (émulation Chromium, Galaxy S9+, réseau coupé). 1 600 garages FICTIFS. Émulation ≠ vrai Samsung.
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
  await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  return {context,page,errs};
}
const peupler=(page,n)=>page.evaluate(n=>{const rows=ODICOLOR_COMMUNES_CENTRES.filter(r=>r[4]);return putMany('clients',Array.from({length:n},(_,i)=>{const r=rows[(i*7)%rows.length];return {id:i+1,nom:'GARAGE FICTIF '+String(i+1).padStart(4,'0'),ville:r[1],cp:r[4].split(' ')[0],statutCrm:i%5===0?'client':'prospect',priorite:i%9===0?'A':''}}))},n);
test('1 600 garages : la carte s’affiche en groupes, rapide, sans perte, aucune erreur',async()=>{
  const {context,page,errs}=await ouvrir();await peupler(page,1600);
  await page.goto(origin+'/#/carte');await page.locator('canvas[data-groupes]').waitFor();
  await page.getByText(/1600 garage\(s\) sur la carte/).waitFor();
  const d=await page.locator('canvas').evaluate(c=>({g:+c.dataset.groupes,v:+c.dataset.visibles,ms:+c.dataset.ms}));
  assert.equal(d.v,1600,'tous les garages sont dans la vue « tout voir »');assert.ok(d.g>3&&d.g<500,'groupes '+d.g);assert.ok(d.ms<120,'premier rendu '+d.ms+' ms');
  // 30 gestes de zoom/déplacement : temps moyen par rendu
  const moy=await page.evaluate(async()=>{const c=document.querySelector('canvas');const t=performance.now();for(let i=0;i<30;i++){c.dispatchEvent(new WheelEvent('wheel',{deltaY:i%2?100:-100,clientX:150,clientY:200,offsetX:150,offsetY:200,bubbles:true,cancelable:true}));await new Promise(r=>requestAnimationFrame(r));}return (performance.now()-t)/30;});
  assert.ok(moy<80,'moyenne par geste '+moy.toFixed(1)+' ms');
  assert.deepEqual(errs,[]);await context.close();
});
test('toucher une zone : liste des garages avec Visiter / Fiche ; le filtre « Clients » réduit la vue',async()=>{
  const {context,page,errs}=await ouvrir();await peupler(page,400);
  await page.goto(origin+'/#/carte');await page.locator('canvas[data-groupes]').waitFor();
  await page.getByRole('button',{name:'Clients',exact:true}).click();
  await page.waitForFunction(()=>+document.querySelector('canvas').dataset.visibles===80);
  // toucher le plus gros groupe : on le retrouve par un balayage de la grille
  const box=await page.locator('canvas').boundingBox();let ouvert=false;
  for(let y=20;y<box.height&&!ouvert;y+=22)for(let x=20;x<box.width&&!ouvert;x+=22){await page.mouse.click(box.x+x,box.y+y);ouvert=await page.getByRole('region',{name:'Zone touchée'}).count()>0;}
  assert.ok(ouvert,'une zone a pu être ouverte');
  await page.getByRole('link',{name:'Visiter'}).first().waitFor();await page.getByRole('link',{name:'Fiche'}).first().waitFor();
  assert.deepEqual(errs,[]);await context.close();
});
test('marché recensé : import CSV par commune, nombres affichés, mention « pas des carrosseries-peinture », conservé dans la sauvegarde',async()=>{
  const {context,page,errs}=await ouvrir();await peupler(page,50);
  await page.goto(origin+'/#/carte');await page.locator('canvas[data-groupes]').waitFor();await page.getByText('Marché recensé : importer un fichier').click();
  const csv='commune_insee;commune;departement;etablissements;diffusion_partielle;sans_nom\r\n91174;Corbeil-Essonnes;91;25;3;3\r\n91228;Évry-Courcouronnes;91;18;2;2\r\nXX;Mauvaise;91;5;0;0\r\n91174;Doublon;91;1;0;0';
  await page.getByLabel('Recensement par commune (CSV)').setInputFiles({name:'par-commune-test.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.getByText(/marché recensé : 43 établissements/).waitFor();
  const m=await page.evaluate(()=>get('meta','marche'));assert.deepEqual(m.communes,[['91174',25],['91228',18]]);assert.match(m.note,/Pas des carrosseries-peinture/);
  const ok=await page.evaluate(async()=>{const d=await ODICOLOR_BACKUP.read(DB.db),{file}=await ODICOLOR_BACKUP.encodeChiffre(d,'phrase fictive carte 123'),o=await ODICOLOR_BACKUP.decode(file,{phrase:'phrase fictive carte 123'});return new Map(o.stores.meta).get('marche').communes.length;});
  assert.equal(ok,2);assert.deepEqual(errs,[]);await context.close();
});
