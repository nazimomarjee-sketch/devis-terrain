'use strict';
// Serveur de démonstration privée : refuse sans mot de passe, authentifie, bloque la force brute, ne sert que les fichiers de l'application.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {creer,FICHIERS}=require('../scripts/serveur-demo.cjs');
const USER='demo',PASS='mot-de-passe-de-test-123';let srv,base;
const auth=(u,p)=>({Authorization:'Basic '+Buffer.from(u+':'+p).toString('base64')});
before(async()=>{srv=creer({user:USER,pass:PASS});await new Promise(r=>srv.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+srv.address().port;});
after(()=>srv.close());
test('refuse de démarrer sans identifiants ou avec un mot de passe court',()=>{assert.throws(()=>creer({}),/obligatoires/);assert.throws(()=>creer({user:'a',pass:'court'}),/12 caractères/);});
test('sans identifiants : 401 sur l’application ; /sante, manifeste et icônes libres ; rien d’autre',async()=>{
  assert.equal((await fetch(base+'/')).status,401);assert.equal((await fetch(base+'/app.js')).status,401);assert.equal((await fetch(base+'/sw.js')).status,401);
  const s=await fetch(base+'/sante');assert.equal(s.status,200);assert.equal((await s.json()).mode,'demo-prive');
  assert.equal((await fetch(base+'/manifest.webmanifest')).status,200);assert.equal((await fetch(base+'/icon-192.png')).status,200);
  assert.equal((await fetch(base+'/',{headers:auth(USER,'mauvais')})).status,401);
});
test('avec identifiants : l’application est servie, en-têtes de protection, pas d’indexation',async()=>{
  const r=await fetch(base+'/',{headers:auth(USER,PASS)});assert.equal(r.status,200);assert.match(await r.text(),/ODICOLOR|<html/i);
  assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('cache-control'),'no-store');
  const js=await fetch(base+'/app.js?odicolor=x',{headers:auth(USER,PASS)});assert.equal(js.status,200);assert.match(js.headers.get('cache-control'),/immutable/);
});
test('ne sert que la liste de l’application : ni dépôt, ni tests, ni docs, ni remontée de répertoire, ni méthode d’écriture',async()=>{
  for(const p of ['/package.json','/tests/ca-facture-browser.cjs','/docs/RECETTE_SAMSUNG_FINALE.md','/scripts/serveur-demo.cjs','/.git/config','/BLOCKERS.md','/%2e%2e/etc/passwd','/..%2fpackage.json','/recensement-sortie/x.csv'])
    assert.equal((await fetch(base+p,{headers:auth(USER,PASS)})).status,404,p);
  assert.equal((await fetch(base+'/',{method:'POST',headers:auth(USER,PASS)})).status,405);
  assert.ok([...FICHIERS].every(f=>!f.includes('..')&&!f.startsWith('tests/')&&!f.startsWith('docs/')));
});
test('force brute : au bout de 5 échecs, même le bon mot de passe est refusé (429) pendant une minute',async()=>{
  const s2=creer({user:USER,pass:PASS});await new Promise(r=>s2.listen(0,'127.0.0.1',r));const b=`http://127.0.0.1:${s2.address().port}`;
  for(let i=0;i<5;i++)assert.equal((await fetch(b+'/',{headers:auth(USER,'x'+i)})).status,401);
  assert.equal((await fetch(b+'/',{headers:auth(USER,PASS)})).status,429);s2.close();
});
test('terrain privé : accès protégé et mode de santé distinct',async()=>{
  assert.throws(()=>creer({user:USER,pass:PASS,mode:'public'}),/Mode/);
  const s=creer({user:USER,pass:PASS,mode:'terrain-prive'});
  await new Promise(r=>s.listen(0,'127.0.0.1',r));
  try { const b=`http://127.0.0.1:${s.address().port}`;
    const r=await fetch(b+'/');assert.equal(r.status,401);assert.match(r.headers.get('www-authenticate'),/espace de travail/);
    assert.equal((await (await fetch(b+'/sante')).json()).mode,'terrain-prive');
    assert.equal((await fetch(b+'/',{headers:auth(USER,PASS)})).status,200);
  } finally { s.close(); }
});
test('Bureau : page et ressources protégées, outils et documentation non publiés',async()=>{
  assert.equal((await fetch(base+'/bureau/')).status,401);
  for(const p of ['/bureau/','/bureau/index.html','/bureau/pipeline.js','/bureau/ville/dessin-iso.js']) {
    const r=await fetch(base+p,{headers:auth(USER,PASS)});assert.equal(r.status,200,p);assert.equal(r.headers.get('cache-control'),'no-store');
  }
  for(const p of ['/bureau/LISEZ-MOI.md','/bureau/outils/generer-communes.cjs','/bureau/ville/demo-commune.html'])assert.equal((await fetch(base+p,{headers:auth(USER,PASS)})).status,404,p);
});
