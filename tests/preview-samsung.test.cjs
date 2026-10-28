'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {preparePreview,origin}=require('../scripts/preparer-preview-samsung.cjs');
const root=path.resolve(__dirname,'..'),a='https://odicolor-test-session-a.pages.dev',b='https://odicolor-test-session-b.pages.dev';
test('la prévisualisation refuse les chemins partagés, domaines métier et identifiants URL',()=>{
  for(const u of ['http://odicolor-test-a.pages.dev','https://nazimomarjee-sketch.github.io/devis-terrain/test/','https://odicolor.fr','https://odicolor-test-a.pages.dev/test/','https://odicolor-test-a.pages.dev.evil.invalid','https://x:y@odicolor-test-a.pages.dev/','https://odicolor-test-a.pages.dev/?x=1'])assert.throws(()=>origin(u));
  assert.equal(origin(a+'/'),a);
});
test('la préparation ne remplace aucun dossier et exige deux origines indépendantes',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'odicolor-preview-'));
  try{const sentinel=path.join(temp,'preuve');fs.writeFileSync(sentinel,'à conserver');await assert.rejects(preparePreview(temp,a,b),/existante/);assert.equal(fs.readFileSync(sentinel,'utf8'),'à conserver');const out=path.join(temp,'absent');await assert.rejects(preparePreview(out,a,a),/distinctes/);assert.equal(fs.existsSync(out),false);}finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('paquet téléphone : runtime exact sur A/B, guide indépendant et données exclusivement synthétiques',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'odicolor-preview-'));
  try{
    const dest=path.join(temp,'paquet'),r=await preparePreview(dest,a,b);
    assert.equal(r.status,'PREPARE_NON_PUBLIE');
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'pwa-release.json')));
    for(const folder of ['a','b'])for(const file of [...manifest.assets.map(e=>e.path),'sw.js','pwa-release.json'])assert.deepEqual(fs.readFileSync(path.join(dest,folder,file)),fs.readFileSync(path.join(root,file)),folder+'/'+file);
    for(const folder of ['a','b','guide']){assert.equal(fs.existsSync(path.join(dest,folder,'.git')),false);assert.equal(fs.existsSync(path.join(dest,folder,'.github')),false);assert.match(fs.readFileSync(path.join(dest,folder,'_headers'),'utf8'),/X-Robots-Tag: noindex/);}
    const guide=path.join(dest,'guide'),html=fs.readFileSync(path.join(guide,'index.html'),'utf8');
    assert.equal(fs.existsSync(path.join(guide,'sw.js')),false);assert.doesNotMatch(html,/<script\b|__ORIGIN_|__RELEASE__/);assert.ok(html.includes(a+'/'));assert.ok(html.includes(b+'/'));
    for(const m of html.matchAll(/href="(synthetique\/[^"]+)"/g))assert.ok(fs.existsSync(path.join(guide,m[1])),m[1]);
    const B=require('../sauvegarde-locale.js'),data=fs.readFileSync(path.join(guide,'synthetique/jeu-smoke.odicolor'));
    const decoded=await B.decode(new Blob([data]));assert.equal(decoded.stores.clients.length,3);assert.ok(decoded.stores.clients.every(c=>c.nom.startsWith('GARAGE SYNTHETIQUE')&&c.tel===''));assert.equal(decoded.stores.devis.length,12);assert.equal(decoded.stores.articles.length,30);assert.equal(data.length,34117);
    const {inspect}=require('../scripts/verifier-sauvegarde.cjs');assert.deepEqual(await inspect(decoded.stores),JSON.parse(fs.readFileSync(path.join(guide,'synthetique/attendus-smoke.json'),'utf8'),(key,value)=>key==='octets'?undefined:value));
    for(const name of ['corrompu','tronque'])await assert.rejects(B.decode(new Blob([fs.readFileSync(path.join(guide,'synthetique/'+name+'-smoke.odicolor'))])));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
