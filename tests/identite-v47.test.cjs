'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const source=readFileSync(join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('async function verifierCompatibilitePhotosSauvegarde(o)');
const end=source.indexOf('async function restaurerSauvegardeLocale(o)',start);
assert.ok(start>0&&end>start);
const guard=source.slice(start,end);

function verifier(o){
  if(!Array.isArray(o.clients))throw Error('clients absents');
}
const normNom=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const numeroGarage=v=>{
 let n=String(v||'').replace(/\D/g,'');
 if(n.startsWith('0033')&&n.length===13)n='0'+n.slice(4);
 else if(n.startsWith('33')&&n.length===11)n='0'+n.slice(2);
 return n;
};
function isoler(current,backup,keys){
  const st=()=>({getAllKeys(){return keys}});
  const rq=async v=>v;
  const getAll=async()=>current;
  const f=new Function('verifierSauvegardeLocale','rq','st','getAll','normNom','numeroGarage',
    guard+'return verifierCompatibilitePhotosSauvegarde');
  return f(verifier,rq,st,getAll,normNom,numeroGarage)({clients:backup});
}
const local={id:1,nom:'Carrosserie Alpha',tel:'0601020304',villeProspection:'Massy'};
const other={id:1,nom:'Carrosserie Beta',tel:'0602020202',villeProspection:'Évry'};
const key='garage-photo-v38:1';

test('aucune photo ne bloque une restauration cohérente',async()=>{
  const r=await isoler([local],[other],[]);
  assert.equal(r.photos,0);
});
test('photo conservée si même ID, nom et numéro',async()=>{
  const r=await isoler([local],[{...local,tel:'+33 6 01 02 03 04'}],[key]);
  assert.equal(r.photos,1);
});
test('photo bloquée si l’identité a changé pour le même ID',async()=>{
  await assert.rejects(isoler([local],[other],[key]),/identité diffère/);
});
test('photo bloquée si la fiche a disparu de la sauvegarde',async()=>{
  await assert.rejects(isoler([local],[],[key]),/absente/);
});
test('photo bloquée pour simple homonyme sans ville ni téléphone',async()=>{
  const a={id:1,nom:'Garage Alpha'};
  await assert.rejects(isoler([a],[{...a}],[key]),/insuffisante/);
});
test('photo bloquée si les données connues se contredisent',async()=>{
  await assert.rejects(isoler([local],[{...local,villeProspection:'Paris'}],[key]),/contradictoire/);
});
test('photo conservée si seul le nom et la ville fiable sont connus',async()=>{
  const a={id:1,nom:'Garage Alpha',ville:'Massy'};
  const r=await isoler([a],[{...a}],[key]);
  assert.equal(r.photos,1);
});

const b=source.indexOf('function numeroGarage('),e=source.indexOf('// ---------- routage ----------',b);
assert.ok(b>0&&e>b);
const importer=new Function('normNom','clean','nouveauRapport','err',source.slice(b,e)+
  'return importerClients')(
 normNom,v=>String(v??'').trim(),
 ()=>({lues:0,crees:0,maj:0,ignorees:0,erreurs:[],avertissements:[]}),
 (rep,ligne,msg)=>rep.erreurs.push({ligne,msg})
);
const line=(tel='',ville='')=>[['Nom','Téléphone','Ville'],['Garage Alpha',tel,ville]];
const map={nom:0,tel:1,ville:2};

test('import ne fusionne jamais un nom sans preuve téléphonique ou géographique',()=>{
 const existing=[{id:1,nom:'Garage Alpha',tel:'',villeProspection:''}];
 const r=importer(line(),0,map,existing);
 assert.equal(r.rep.maj,0);assert.equal(r.rep.ignorees,1);
 assert.equal(r.items.length,0);
});
test('import accepte le même téléphone normalisé',()=>{
 const existing=[{id:1,nom:'Garage Alpha',tel:'0601020304'}];
 const r=importer(line('+33 6 01 02 03 04'),0,map,existing);
 assert.equal(r.rep.maj,1);assert.equal(r.items[0].id,1);
});
test('import accepte même ville connue et conserve les notes',()=>{
 const existing=[{id:1,nom:'Garage Alpha',villeProspection:'Massy',infosTerrain:[{texte:'Visite'}]}];
 const r=importer(line('','Massy'),0,map,existing);
 assert.equal(r.rep.maj,1);assert.equal(r.items[0].infosTerrain[0].texte,'Visite');
});
test('import respecte deux garages homonymes dans deux villes',()=>{
 const existing=[{id:1,nom:'Garage Alpha',villeProspection:'Massy'}];
 const r=importer(line('','Évry'),0,map,existing);
 assert.equal(r.rep.crees,1);assert.equal(r.items[0].id,undefined);
});
