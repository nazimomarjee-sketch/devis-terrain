'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const source=readFileSync(join(__dirname,'..','app.js'),'utf8');
const normNom=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
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
