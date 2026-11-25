'use strict';
const {test,before}=require('node:test'),assert=require('node:assert/strict');
const S=require('../secteur-v48.js'),K=require('../carte-v48.js'),CENTRES=require('../communes-centres.js');
before(()=>K.charger(CENTRES));
const AUJ='2026-11-10',communes=new Map(CENTRES.map(r=>[r[0],{nom:r[1]}]));
const ctx=(clients,fact,extra={})=>({auj:AUJ,clients,facturation:fact,placer:c=>{const p=K.placer(c);return p.insee?{insee:p.insee,commune:p.commune}:null},communes,marche:[],...extra});
const CORB={ville:'Corbeil-Essonnes',cp:'91100'},MASSY={ville:'Massy',cp:'91300'};
test('classement actif / dormant / sans suivi : uniquement sur preuve de facturation ; un client non lié n’est jamais « dormant »',()=>{
  const cl=[{id:1,nom:'A',statutCrm:'client',codeEbp:'C1',...CORB},{id:2,nom:'B',statutCrm:'client',codeEbp:'C2',...CORB},{id:3,nom:'C',statutCrm:'client',...CORB},{id:4,nom:'D',statutCrm:'client',codeEbp:'C4',...CORB}];
  const r=S.calculer(ctx(cl,{1:{derniere:'2026-10-20',moisCents:0},2:{derniere:'2026-06-01',moisCents:0}}));
  const c=r.communes.find(x=>x.id==='91174');assert.deepEqual([c.clients,c.actifs,c.dormants,c.sansSuivi],[4,1,2,1],'B dormant (170 j), D lié sans facture = dormant, C non lié = sans suivi');
});
test('CA par secteur = somme des codes liés ; non attribué à part ; total contrôlé',()=>{
  const cl=[{id:1,nom:'A',statutCrm:'client',codeEbp:'C1',...CORB},{id:2,nom:'B',statutCrm:'client',codeEbp:'C2',...MASSY},{id:3,nom:'SANS LIEU',statutCrm:'client',codeEbp:'C3'}];
  const r=S.calculer(ctx(cl,{1:{derniere:'2026-11-02',moisCents:100000},2:{derniere:'2026-11-03',moisCents:50000},3:{derniere:'2026-11-04',moisCents:7000}},{caTotalMoisCents:200000}));
  assert.equal(r.communes.find(x=>x.id==='91174').caMoisCents,100000);assert.equal(r.departements.find(x=>x.id==='91').caMoisCents,150000);assert.equal(r.sans.caMoisCents,7000);
  assert.equal(r.controle.secteursCents,157000);assert.equal(r.controle.nonAttribueCents,43000);assert.equal(r.controle.ok,true,'les secteurs ne dépassent jamais le total');
  const somme=r.communes.reduce((s,x)=>s+x.caMoisCents,0);assert.equal(somme,150000);assert.equal(r.departements.reduce((s,x)=>s+x.caMoisCents,0),somme,'départements = communes');
});
test('prospects, priorités A/B, jamais visités, visites récentes, refus exclus, comptes bloqués (compte ou EBP)',()=>{
  const cl=[{id:1,nom:'P1',priorite:'A',...CORB},{id:2,nom:'P2',priorite:'B',visites:[{date:'2026-11-01',res:'vu'}],...CORB},{id:3,nom:'P3',conv:'refus',...CORB},{id:4,nom:'P4',...CORB},{id:5,nom:'K',statutCrm:'client',compte:{statut:'bloque'},...CORB},{id:6,nom:'K2',statutCrm:'client',ebp:{bloque:true},...CORB}];
  const c=S.calculer(ctx(cl,{})).communes[0];assert.deepEqual([c.prospects,c.prospectsPrio,c.visites30,c.bloques],[3,2,1,2]);assert.equal(c.jamaisVisites,5);
});
test('couverture du marché recensé et priorité : le secteur qui rapporte le plus vite est en tête, avec ses raisons',()=>{
  const cl=[{id:1,nom:'D1',statutCrm:'client',codeEbp:'C1',...CORB},{id:2,nom:'D2',statutCrm:'client',codeEbp:'C2',...CORB},{id:3,nom:'P',priorite:'A',...MASSY}];
  const r=S.calculer(ctx(cl,{},{marche:[['91174',40],['91377',10]]}));
  assert.equal(r.communes[0].id,'91174');assert.match(r.communes[0].raisons.join(' '),/2 client\(s\) dormant\(s\)/);assert.equal(r.communes[0].couverturePct,5);assert.equal(r.departements[0].marche>=50,true);
  assert.ok(r.communes.find(x=>x.id==='91377'));
});
test('garages sans commune : comptés à part, jamais perdus ; totaux cohérents',()=>{
  const cl=[{id:1,nom:'X',statutCrm:'client'},{id:2,nom:'Y',...CORB},{id:3,nom:'Z',...MASSY}];const r=S.calculer(ctx(cl,{}));
  assert.equal(r.sans.garages,1);assert.equal(r.communes.reduce((s,x)=>s+x.garages,0)+r.sans.garages,3);assert.equal(r.totaux.garages,3);
});
test('performance : 5 000 garages, 971 communes en moins de 300 ms',()=>{
  const rows=CENTRES.filter(r=>r[4]),cl=Array.from({length:5000},(_,i)=>{const r=rows[(i*7)%rows.length];return {id:i+1,nom:'G'+i,ville:r[1],cp:r[4].split(' ')[0],statutCrm:i%4?'prospect':'client',codeEbp:i%8===0?'C'+i:undefined,priorite:i%9?'':'A'}});
  const t=Date.now(),r=S.calculer(ctx(cl,{},{marche:CENTRES.map(x=>[x[0],20])}));assert.ok(Date.now()-t<300,(Date.now()-t)+' ms');assert.equal(r.communes.reduce((s,x)=>s+x.garages,0)+r.sans.garages,5000);
});
test('« sans commune » porte aussi ses raisons (aucun champ manquant pour l’affichage)',()=>{const r=S.calculer(ctx([{id:1,nom:'X',statutCrm:'client',codeEbp:'C'}],{}));assert.ok(Array.isArray(r.sans.raisons));assert.equal(typeof r.sans.score,'number');});
