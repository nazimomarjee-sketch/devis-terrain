'use strict';
// Tournée compacte et formes cohérentes (AGENTS.md). Formats Samsung émulés ; émulation ≠ vrai Samsung. DONNÉES FICTIVES.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');let browser,server,origin;
before(async()=>{
  server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));});
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(r=>server.close(r));});
async function ouvrir(w=360,h=740){
  const context=await browser.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,deviceScaleFactor:2}),page=await context.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.route(u=>!u.href.startsWith(origin),r=>r.abort());
  await page.goto(origin+'/#/reglages');await page.getByRole('button',{name:'Télécharger une sauvegarde chiffrée',exact:true}).waitFor();
  await page.addStyleTag({content:'#v25-maj{display:none!important}'});
  await page.evaluate(()=>{const rows=ODICOLOR_COMMUNES_CENTRES.filter(r=>r[4]);const cl=Array.from({length:8},(_,i)=>({id:i+1,nom:'GARAGE FICTIF NUMERO '+(i+1),ville:rows[i*9][1],cp:rows[i*9][4].split(' ')[0],statutCrm:'client'}));
    return putMany('clients',cl).then(()=>lireTournees()).then(T=>{T[aujourdhui()]={ids:[1,2,3,4,5,6,7,8],res:{},rdv:{2:'14:00'}};return ecrireTournees(T)})});
  await page.goto(origin+'/#/tournee');await page.locator('.t-liste').waitFor();
  return {context,page,errs};
}
const mesures=page=>page.evaluate(()=>{const nav=document.querySelector('.onglets,nav'),lim=Math.min(innerHeight,nav?nav.getBoundingClientRect().top:innerHeight);
  const lignes=[...document.querySelectorAll('.t-liste .t-ligne')],vis=lignes.filter(r=>{const b=r.getBoundingClientRect();return b.top>=0&&b.bottom<=lim}).length;
  const cibles=[...document.querySelectorAll('main a,main button,main summary')].map(e=>({e,b:e.getBoundingClientRect()})).filter(x=>x.b.height>0&&x.b.top<lim);
  const petites=cibles.filter(x=>x.b.width<47.5||x.b.height<47.5).map(x=>(x.e.textContent||'').trim().slice(0,18)+' '+Math.round(x.b.width)+'×'+Math.round(x.b.height));
  let chevauche=0;for(let i=0;i<cibles.length;i++)for(let j=i+1;j<cibles.length;j++){const a=cibles[i].b,c=cibles[j].b;if(cibles[i].e.contains(cibles[j].e)||cibles[j].e.contains(cibles[i].e))continue;if(a.left<c.right-1&&c.left<a.right-1&&a.top<c.bottom-1&&c.top<a.bottom-1)chevauche++;}
  return {vis,total:lignes.length,petites,chevauche,debordH:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
test('Samsung 360×740 : ≥ 5 garages entièrement visibles, aucune cible < 48 px, aucun chevauchement, aucun défilement horizontal',async()=>{
  const {context,page,errs}=await ouvrir(360,740),m=await mesures(page);
  assert.ok(m.vis>=5,'garages visibles : '+m.vis);assert.deepEqual(m.petites,[]);assert.equal(m.chevauche,0);assert.ok(m.debordH<=0,'défilement horizontal '+m.debordH);assert.equal(m.total,8);
  assert.deepEqual(errs,[]);await context.close();
});
test('autres formats : grand Samsung ≥ 6 garages visibles ; petit écran 320×658 reste utilisable (cibles ≥ 48 px, pas de défilement horizontal)',async()=>{
  const g=await ouvrir(412,915),mg=await mesures(g.page);assert.ok(mg.vis>=6,'412×915 : '+mg.vis);assert.deepEqual(mg.petites,[]);await g.context.close();
  const p=await ouvrir(320,658),mp=await mesures(p.page);assert.ok(mp.vis>=3,'320×658 : '+mp.vis);assert.deepEqual(mp.petites,[]);assert.ok(mp.debordH<=0);await p.context.close();
});
test('une ligne = nom, commune, heure du rendez-vous, bouton Visite ; détails au toucher ; terminés repliés ; correction possible',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.getByText('⏰ 14:00 · GARAGE FICTIF NUMERO 2').waitFor();assert.equal(await page.locator('.t-detail:visible').count(),0,'détails fermés par défaut');
  assert.equal(await page.getByRole('link',{name:/^Visite chez/}).count(),8);
  await page.getByRole('button',{name:/GARAGE FICTIF NUMERO 1, détails/}).click();await page.getByRole('button',{name:'Absent'}).waitFor();
  await page.getByRole('button',{name:'Absent'}).click();await page.getByText(/Déjà traités \(1\)/).waitFor();
  assert.equal(await page.locator('details.t-faits').evaluate(d=>d.open),false,'terminés fermés par défaut');
  await page.getByText(/Déjà traités \(1\)/).click();await page.getByRole('button',{name:/GARAGE FICTIF NUMERO 1, détails/}).click();await page.getByRole('button',{name:'Corriger : remettre dans la tournée'}).click();await page.waitForFunction(()=>!document.querySelector('details.t-faits'));
  assert.equal((await page.evaluate(()=>lireTournees().then(T=>T[aujourdhui()]))).res[1],undefined,'le garage est remis dans la tournée');
  await page.getByRole('link',{name:/^Visite chez GARAGE FICTIF NUMERO 3/}).click();await page.waitForURL(/#\/visite\/3\?t=1$/);
  assert.deepEqual(errs,[]);await context.close();
});
test('formes cohérentes : mêmes rayons pour cartes, boutons et champs sur toutes les pages ; aucune règle de forme sur la Ville LEGO',async()=>{
  const {context,page,errs}=await ouvrir();const rayons=async()=>page.evaluate(()=>{const r=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).borderTopLeftRadius:null};return {btn:r('main .btn'),carte:r('main .carte:not(.obj):not(.hero)'),champ:r('main input:not([type=checkbox]):not([type=radio]),main select'),hero:r('main .carte.obj,main .carte.hero')}});
  const vus=[];for(const h of ['#/tournee','#/cockpit','#/ca','#/clients-ebp','#/agenda','#/secteurs','#/demo']){await page.goto(origin+'/'+h);await page.waitForTimeout(350);vus.push([h,await rayons()]);}
  for(const [h,r] of vus){if(r.btn)assert.equal(r.btn,'16px',h+' bouton');if(r.carte)assert.equal(r.carte,'20px',h+' carte');if(r.champ)assert.equal(r.champ,'14px',h+' champ');if(r.hero)assert.equal(r.hero,'24px',h+' carte principale');}
  assert.ok(vus.some(([,r])=>r.btn)&&vus.some(([,r])=>r.carte)&&vus.some(([,r])=>r.champ),'chaque famille de forme a été mesurée');
  const css=fs.readFileSync(path.join(root,'formes-v49.css'),'utf8');assert.doesNotMatch(css.split('Tournée compacte')[0].replace(/\/\*[\s\S]*?\*\//g,''),/\.vc/,'aucune règle sur la Ville LEGO');
  assert.deepEqual(errs,[]);await context.close();
});
test('accueil : objectif puis action, tournée résumée ; grandes polices à 200 % sur les trois parcours',async()=>{
  const {context,page,errs}=await ouvrir();
  await page.goto(origin+'/#/');await page.locator('.v49-tournee').waitFor();
  assert.equal(await page.locator('.v49-tournee').getByRole('link',{name:'Voir toute la tournée'}).count(),1);
  assert.equal(await page.locator('.v49-tournee .t-ligne').count(),0);
  assert.equal(await page.locator('.v23-objectif + .v23-prochaine').count(),1);
  await page.addStyleTag({content:'html{font-size:200%!important}'});
  for(const hash of ['#/','#/tournee','#/visite/1']) {
    await page.goto(origin+'/'+hash);await page.waitForTimeout(250);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=0,hash+' déborde de '+overflow+' px');
    if(hash==='#/visite/1') {
      await page.getByRole('button',{name:/^Vu/}).click();await page.getByRole('button',{name:/Intéressé/}).click();
      assert.ok(await page.getByLabel('Échéance de la prochaine action').isVisible());
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
    }
  }
  assert.deepEqual(errs,[]);await context.close();
});

test('accueil compact : CA et action visibles sans défiler, vide ou avec une tournée, 360×740 et 412×915',async()=>{
  for(const [w,h] of [[360,740],[412,915]]) for(const vide of [true,false]) {
    const {context,page,errs}=await ouvrir(w,h);
    if(vide)await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const tx=DB.db.transaction('clients','readwrite');tx.objectStore('clients').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});await ecrireTournees({})});
    await page.goto(origin+'/#/');await page.locator('.v38-accueil-hero').waitFor();
    const m=await page.evaluate(()=>{
      const box=s=>document.querySelector(s).getBoundingClientRect();
      return {bandeau:box('.v38-accueil-hero').height,ca:box('.v23-objectif').height,bouton:box('.v23-primary').bottom,nav:box('.onglets').top,
        photo:getComputedStyle(document.querySelector('.v38-accueil-hero')).backgroundImage.includes('data:image/webp'),
        fondu:getComputedStyle(document.querySelector('.v38-accueil-hero')).backgroundImage.includes('linear-gradient'),
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        petits:[...document.querySelectorAll('.v23-objectif summary,.v23-objectif a,.v23-prochaine summary,.v23-primary')].map(e=>e.getBoundingClientRect()).filter(b=>b.height>0&&(b.height<48||b.width<48)).length};
    });
    assert.ok(m.bandeau<=120,'bandeau : '+m.bandeau);assert.ok(m.ca<=100,'CA compact : '+m.ca);assert.ok(m.bouton<=m.nav,'action cachée : '+JSON.stringify(m));
    assert.equal(m.photo,true);assert.equal(m.fondu,true);assert.equal(m.petits,0);assert.ok(m.overflow<=0);
    assert.equal(await page.locator('.v49-ca-details').evaluate(e=>e.open),false);
    await page.getByLabel('Détails du CA facturé',{exact:true}).click();await page.getByText(/Source : factures et avoirs HT saisis/).waitFor();
    await page.getByLabel('Détails du CA facturé',{exact:true}).click();
    if(vide&&w===412&&process.env.ODICOLOR_CAPTURE_DIR){fs.mkdirSync(process.env.ODICOLOR_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ODICOLOR_CAPTURE_DIR,'accueil-compact.png')});}
    await page.getByRole('link',{name:'Saisir mon CA facturé',exact:true}).click();await page.waitForURL(/#\/ca$/);
    assert.deepEqual(errs,[]);console.log({format:w+'×'+h,vide,...m});await context.close();
  }
});
