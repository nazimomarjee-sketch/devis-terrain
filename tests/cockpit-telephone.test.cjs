'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const K=require('../cockpit-v48.js');
const AUJ='2026-11-10',ht=d=>d.total||0;
const sec=(r,id)=>r.sections.find(s=>s.id===id);
const base=()=>({auj:AUJ,totalDevis:ht,relanceJours:3,clients:[],devis:[],ca:{renseigne:false},objectifMoisCents:0,jours:{ouvresTotal:21,ouvresFaits:7}});
test('rien à afficher sur une base vide : aucune section inventée, rythme non calculable avec son motif',()=>{
  const r=K.calculer(base());assert.ok(r.sections.every(s=>s.total===0&&s.lignes.length===0));assert.equal(r.rythme.calculable,false);assert.match(r.rythme.motif,/CA facturé non saisi/);
});
test('rythme : CA saisi + objectif réglé → écart au prorata des jours ouvrés ; sans objectif → motif, pas de chiffre',()=>{
  const d=base();d.ca={renseigne:true,moisCents:600000};
  assert.match(K.calculer(d).rythme.motif,/objectif/);
  d.objectifMoisCents=1800000;const r=K.calculer(d).rythme;
  assert.deepEqual([r.attenduCents,r.ecartCents,r.pct,r.resteCents,r.resteParJourOuvre],[600000,0,33,1200000,Math.ceil(1200000/14)]);
});
test('priorités : rappels échus, devis à relancer (après N jours), acceptés non commandés, impayés échus, comptes bloqués — avec la raison',()=>{
  const d=base();
  d.clients=[{id:1,nom:'A',rappel:'2026-11-08'},{id:2,nom:'B',rappel:'2026-11-12'},{id:3,nom:'C',compte:{statut:'bloque'}},{id:4,nom:'D',factures:[{num:'F1',montant:5000,echeance:'2026-11-01'},{num:'F2',montant:100,echeance:'2026-11-01',regleLe:'2026-11-02'},{num:'F3',montant:7,echeance:'2026-11-30'}]}];
  d.devis=[{id:10,clientNom:'A',statut:'envoye',creeLe:'2026-11-05T08:00:00Z',lignes:[1],total:30000},{id:11,clientNom:'B',statut:'envoye',creeLe:'2026-11-09T08:00:00Z',lignes:[1],total:99999},
    {id:12,clientNom:'C',statut:'accepte',lignes:[1],total:50000},{id:13,clientNom:'D',statut:'accepte',commandeLe:'2026-11-09',lignes:[1],total:1},{id:14,clientNom:'E',statut:'envoye',creeLe:'2026-11-01T00:00:00Z',lignes:[],total:5}];
  const r=K.calculer(d);
  assert.deepEqual(sec(r,'rappels').lignes.map(x=>x.id),[1]);assert.match(sec(r,'rappels').lignes[0].raison,/2026-11-08/);
  assert.deepEqual(sec(r,'devis').lignes.map(x=>[x.id,x.jours]),[[10,5]],'le devis d’hier n’est pas encore à relancer ; un devis vide jamais');
  assert.deepEqual(sec(r,'accepte').lignes.map(x=>x.id),[12]);assert.equal(sec(r,'accepte').montant,50000);
  assert.deepEqual(sec(r,'impayes').lignes.map(x=>[x.nom,x.montant,x.jours]),[['D',5000,9]]);assert.equal(sec(r,'impayes').montant,5000);
  assert.deepEqual(sec(r,'bloques').lignes.map(x=>x.id),[3]);
});
test('prospects : priorité A avant B, jamais visités d’abord, visités depuis moins de 14 j exclus, refus/convertis exclus',()=>{
  const d=base();const v=j=>[{date:j,res:'vu'}];
  d.clients=[{id:1,nom:'B-ancien',priorite:'B',visites:v('2026-09-01')},{id:2,nom:'A-recent',priorite:'A',visites:v('2026-11-05')},{id:3,nom:'A-jamais',priorite:'A'},{id:4,nom:'A-ancien',priorite:'A',visites:v('2026-10-01')},
    {id:5,nom:'C',priorite:'C'},{id:6,nom:'A-refus',priorite:'A',conv:'refus'},{id:7,nom:'client',statutCrm:'client',priorite:'A'},{id:8,nom:'A-absent',priorite:'A',visites:[{date:'2026-11-09',res:'absent'}]}];
  assert.deepEqual(sec(K.calculer(d),'prospects').lignes.map(x=>x.id),[3,8,4,1]);
});
test('clients à risque : pas vus depuis plus de 45 j, ou jamais visités ; le plus ancien en premier ; total réel même au-delà de la limite',()=>{
  const d=base();d.clients=Array.from({length:9},(_,i)=>({id:i+1,nom:'C'+i,statutCrm:'client',visites:i===0?[{date:'2026-11-01',res:'vu'}]:[{date:'2026-09-'+String(10+i).padStart(2,'0'),res:'vu'}]}));
  const s=sec(K.calculer(d),'risque');assert.equal(s.total,8);assert.equal(s.lignes.length,5);assert.equal(s.lignes[0].id,2);
});
