'use strict';
// Sauvegardes .odicolor CHIFFRÉES par phrase secrète. DONNÉES FICTIVES.
const {test}=require('node:test'),assert=require('node:assert/strict');
const B=require('../sauvegarde-locale.js'),memoryDb=require('./support/memory-db.cjs');
const PHRASE='phrase de test très longue 42',SECRET='GARAGE-CHIFFRE-SECRET-UNIQUE-ZZ';
function stores(){return {articles:[{code:'V',des:'Vernis fictif',pu:1234}],clients:[{id:7,nom:SECRET,tel:'0600000000',factures:[]}],devis:[],
  meta:[['settings',{societe:'ODICOLOR TEST'}],['garage-photo-v38:7',{blob:new Blob(['photo-fictive'],{type:'image/webp'}),date:'2026-10-20'}]],recuperations:[]};}
const octets=async f=>Buffer.from(await f.arrayBuffer());
test('aller-retour chiffré : mêmes garages, photo comprise, intégrité contrôlée',async()=>{
  const {file,summary,chiffre}=await B.encodeChiffre(stores(),PHRASE);
  assert.equal(chiffre,true);assert.equal(await B.estChiffre(file),true);assert.equal(summary.photos,1);
  const o=await B.decode(file,{phrase:PHRASE});
  assert.equal(o.stores.clients[0].nom,SECRET);assert.equal(await new Map(o.stores.meta).get('garage-photo-v38:7').blob.text(),'photo-fictive');
});
test('rien d’identifiable en clair : ni le nom, ni le téléphone, ni la phrase, ni les marqueurs de format',async()=>{
  const {file}=await B.encodeChiffre(stores(),PHRASE),b=await octets(file);
  for(const n of [SECRET,'0600000000 ',PHRASE,'photo-fictive','Vernis fictif','"clients"','devis-terrain"version"'])assert.equal(b.indexOf(Buffer.from(n)),-1,n);
  assert.equal(b.indexOf(Buffer.from(SECRET)),-1);
});
test('deux sauvegardes identiques donnent deux fichiers différents (sel et vecteur aléatoires)',async()=>{
  const a=await octets((await B.encodeChiffre(stores(),PHRASE)).file),c=await octets((await B.encodeChiffre(stores(),PHRASE)).file);
  assert.notDeepEqual(a,c);
});
test('phrase absente → demande de phrase (code) ; phrase fausse → refus sans rien toucher',async()=>{
  const {file}=await B.encodeChiffre(stores(),PHRASE);
  await assert.rejects(B.decode(file),e=>e.code==='PHRASE_REQUISE');
  await assert.rejects(B.decode(file,{phrase:''}),e=>e.code==='PHRASE_REQUISE');
  await assert.rejects(B.decode(file,{phrase:PHRASE+'x'}),e=>e.code==='PHRASE_INCORRECTE'&&/incorrecte/.test(e.message));
});
test('toute altération est détectée : en-tête, contenu, troncature, ajout',async()=>{
  const {file}=await B.encodeChiffre(stores(),PHRASE),b=await octets(file);
  for(const pos of [30,60,b.length>>1,b.length-1]){const c=Buffer.from(b);c[pos]^=1;await assert.rejects(B.decode(new Blob([c]),{phrase:PHRASE}),/incorrecte|illisible|inconnue|invalide|Paramètres/,'octet '+pos);}
  await assert.rejects(B.decode(file.slice(0,-1),{phrase:PHRASE}),/incorrecte/);
  await assert.rejects(B.decode(new Blob([file,'x']),{phrase:PHRASE}),/incorrecte/);
  await assert.rejects(B.decode(file.slice(0,40),{phrase:PHRASE}));
});
test('phrase trop courte refusée avant tout calcul ; la phrase est normalisée (accents)',async()=>{
  await assert.rejects(B.encodeChiffre(stores(),'court'),/trop courte/);await assert.rejects(B.encodeChiffre(stores(),'          '),/vide|courte/);
  const {file}=await B.encodeChiffre(stores(),'éléphant très long 2026');
  assert.equal((await B.decode(file,{phrase:'éléphant très long 2026'})).stores.clients.length,1);
});
test('les anciennes sauvegardes restent importables : v2 non chiffrée et JSON v1',async()=>{
  const {file}=await B.encode(stores());assert.equal(await B.estChiffre(file),false);
  assert.equal((await B.decode(file)).stores.clients[0].nom,SECRET);
  const v1={appli:'devis-terrain',version:1,clients:[{id:1,nom:'Ancien'}],devis:[],reglages:{societe:'X'}};
  assert.equal((await B.decode(new Blob([JSON.stringify(v1)]))).stores.clients[0].nom,'Ancien');
  assert.equal((await B.decode(file,{phrase:'ignorée'})).stores.clients.length,1);
});
test('restauration complète depuis une sauvegarde chiffrée : base identique et état précédent archivé',async()=>{
  const m=memoryDb({articles:[],clients:[[1,{id:1,nom:'Avant'}]],devis:[],meta:[],recuperations:[]});
  const {file}=await B.encodeChiffre(stores(),PHRASE),o=await B.decode(file,{phrase:PHRASE});
  await B.restore(m.db,o);assert.equal(m.current.clients.get(7).nom,SECRET);assert.equal(m.current.clients.has(1),false);
  assert.equal([...m.current.recuperations.values()][0].stores.clients[0].nom,'Avant');
});
test('un ancien décodeur refuse proprement un fichier chiffré (ne l’interprète jamais comme JSON)',async()=>{
  const {file}=await B.encodeChiffre(stores(),PHRASE);const t=await file.slice(0,19).text();
  assert.ok(t.startsWith('ODICOLOR-BACKUP-')&&t!=='ODICOLOR-BACKUP-2\n');
});
test('refuse un nombre d’itérations hors bornes dans l’en-tête',async()=>{
  const {file}=await B.encodeChiffre(stores(),PHRASE),b=await octets(file),o=19,len=b.readUInt32LE(o);
  const h=JSON.parse(b.slice(o+4,o+4+len).toString());h.iterations=10;const nh=Buffer.from(JSON.stringify(h)),len4=Buffer.alloc(4);len4.writeUInt32LE(nh.length);
  await assert.rejects(B.decode(new Blob([b.slice(0,o),len4,nh,b.slice(o+4+len)]),{phrase:PHRASE}),/inconnue/);
});
