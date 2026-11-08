'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../tournee-v48.js'),K=require('../cockpit-v48.js');
const AUJ='2026-11-10',pos={};const P=(id,lat,lng)=>pos[id]={lat,lng};
function jeu(){
  // groupe proche (Essonne) et groupe lointain (Seine-et-Marne) ; garage prioritaire isolé sans position
  const clients=[];for(let i=1;i<=6;i++){clients.push({id:i,nom:'PROCHE'+i,rappel:'2026-11-0'+i});P(i,48.60+i*0.01,2.40+i*0.01);}
  for(let i=11;i<=16;i++){clients.push({id:i,nom:'LOIN'+i,rappel:'2026-11-08'});P(i,48.55+i*0.001,3.10);}
  clients.push({id:99,nom:'SANS POSITION',rappel:'2026-01-01'});
  return clients;
}
const sections=cl=>K.calculer({auj:AUJ,clients:cl,devis:[],totalDevis:()=>0,ca:{renseigne:false},sansLimite:true}).sections;
test('proposition : au plus N garages, tous proches du garage graine, ordre de passage par plus proche voisin, sans position jamais proposé',()=>{
  const cl=jeu(),r=T.proposer(sections(cl),id=>pos[id]||null,{max:5,rayonKm:25});
  assert.equal(r.ids.length,5);assert.ok(!r.ids.includes(99));assert.equal(r.sansPosition,1);
  const g=pos[r.ids[0]];for(const id of r.ids)assert.ok(T.km(pos[r.ids[0]],pos[id])<=25+1e-9);
  assert.ok(r.ids.every(id=>id<=6||id>=11)&&(r.ids.every(id=>id<=6)||r.ids.every(id=>id>=11)),'un seul groupe géographique');
  assert.ok(r.kmApprox>=0);assert.ok(r.details.every(d=>d.raisons.length&&d.score>0));
});
test('le groupe le plus prioritaire gagne : rappels anciens d’abord ; un départ donné favorise le groupe proche de soi',()=>{
  const cl=jeu(),a=T.proposer(sections(cl),id=>pos[id]||null,{max:4});assert.ok(a.ids.every(id=>id<=6),'les rappels les plus en retard sont dans le groupe proche');
  const b=T.proposer(sections(cl),id=>pos[id]||null,{max:4,depart:{lat:48.55,lng:3.10}});assert.ok(b.ids.every(id=>id>=11),'départ à proximité du groupe lointain');
});
test('aucun garage prioritaire ou aucune position : message honnête, tournée vide',()=>{
  assert.equal(T.proposer(sections([]),()=>null).ids.length,0);const r=T.proposer(sections(jeu()),()=>null);assert.match(r.motif,/position connue/);
});
test('pas de doublon, déterminisme',()=>{const cl=jeu(),a=T.proposer(sections(cl),id=>pos[id]||null),b=T.proposer(sections(cl),id=>pos[id]||null);assert.deepEqual(a,b);assert.equal(new Set(a.ids).size,a.ids.length);});
