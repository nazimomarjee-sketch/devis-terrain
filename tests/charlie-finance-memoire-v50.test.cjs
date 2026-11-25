'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const T=require('../charlie-optimiseur-v50.js');const H=T.hms;
const NOW=Date.parse('2026-12-01T08:00:00');
const base=(extra={})=>({id:1,nom:'Garage Synthétique',priorite:'B',statutCrm:'client',visites:[],ent:{lat:48.73,lng:2.27},...extra});
const sc=(c,F,extra={})=>T.scorer(c,{maintenant:NOW,devis:[],echeance:()=>({pct:50}),finance:()=>F,...extra});
const codes=(s)=>s.composantes.map(x=>x.code);
test('EBP : CA fort, réachat et baisse ne comptent que si la source est EBP',()=>{
  const F={source:'EBP',ca12Cents:1500000,ca90Cents:100000,derniereFacture:'2026-09-01',retardCents:0,bloque:false};
  const s=sc(base(),F);for(const c of['CA_FORT','REACHAT','BAISSE'])assert.ok(codes(s).includes(c),c);
  assert.ok(s.manquants.includes('marge'),'marge jamais inventée');
  for(const src of [null,'declare','saisie']){const x=sc(base(),{...F,source:src});assert.ok(!codes(x).some(c=>/CA_|REACHAT|BAISSE/.test(c)),String(src));assert.ok(x.manquants.includes('ca_ebp'));}
  assert.ok(sc(base(),null).manquants.includes('ca_ebp'));
});
test('EBP : seuils CA réglables et CA nul sans points',()=>{
  const F=(ca)=>({source:'EBP',ca12Cents:ca,ca90Cents:ca,derniereFacture:'2026-11-20'});
  assert.ok(codes(sc(base(),F(500000))).includes('CA_MOYEN'));assert.ok(codes(sc(base(),F(500000),{seuilsCA12:{fort:4000,moyen:1000}})).includes('CA_FORT'));
  assert.ok(codes(sc(base(),F(10000))).includes('CA_FAIBLE'));assert.ok(!codes(sc(base(),F(0))).some(c=>/^CA_/.test(c)));
});
test('compte bloqué et retard déclarés (sans CA EBP) : alertes quand même, protecteur',()=>{
  const s=sc(base(),{source:'declare',ca12Cents:900000,retardCents:5000,bloque:true});
  assert.ok(s.finance.alertes.includes('COMPTE_BLOQUE'));assert.ok(s.finance.alertes.includes('RETARD_PAIEMENT'));assert.ok(!codes(s).some(c=>/^CA_/.test(c)),'CA non vérifié : aucun point');
});
test('retard de paiement : signalé, jamais caché ; compte bloqué : pas de visite commerciale proposée, Laurent conservé avec alerte',async()=>{
  const ctxFns={echeance:()=>({pct:999}),relanceDue:()=>null,montantHt:()=>null,finance:(c)=>({source:'EBP',ca12Cents:900000,ca90Cents:300000,derniereFacture:'2026-11-25',retardCents:c.id===2?150000:0,bloque:c.id===3})};
  const clients=[1,2,3,4].map(i=>base({id:i,nom:'G'+i,ent:{lat:48.73+i*0.01,lng:2.27}}));
  const r=await T.organiserJournee({clients,devis:[],laurent:[{id:3}],depart:{lat:48.7263,lng:2.2696},plage:[H('08:00'),H('17:00')],maintenant:NOW,ctxFns});
  assert.ok(r.plan.ordre.some(o=>o.garageId==='3'),'Laurent conservé');assert.ok(r.plan.alertes.some(a=>/COMPTE_BLOQUE : G3/.test(a)));assert.ok(r.plan.alertes.some(a=>/RETARD_PAIEMENT : G2/.test(a)));
  const r2=await T.organiserJournee({clients,devis:[],laurent:[],depart:{lat:48.7263,lng:2.2696},plage:[H('08:00'),H('17:00')],maintenant:NOW,ctxFns});
  assert.ok(!r2.plan.ordre.some(o=>o.garageId==='3'));assert.equal(r2.exclus.find(e=>e.id==='3').raison,'COMPTE_BLOQUE_EBP');
  assert.equal(r2.audit.ok,true);
});
test('durées par type et réglage général, durée de Laurent et durée apprise prioritaires',()=>{
  const ctxFns={echeance:()=>({pct:50}),relanceDue:()=>null,montantHt:()=>null};
  const cl=[base({id:1,statutCrm:'prospect'}),base({id:2}),base({id:3})];
  const {candidats}=T.construireCandidats({clients:cl,devis:[],laurent:[{id:3,duree:3600}],maintenant:NOW,ctxFns,dureeVisite:20*60,dureesParType:{prospect:45*60}});
  const d=(id)=>candidats.find(c=>c.id===String(id));
  assert.equal(d(1).duree,45*60);assert.match(d(1).dureeSource,/réglage « prospect »/);assert.equal(d(2).duree,20*60);assert.match(d(2).dureeSource,/réglage général/);assert.equal(d(3).duree,3600);assert.match(d(3).dureeSource,/Laurent/);
  const A=T.apprendre(T.apprendre(T.nouvelApprentissage(),{garageId:2,resultat:'vu',dureeS:1500,jour:1}),{garageId:2,resultat:'vu',dureeS:1500,jour:2});
  const {candidats:c2}=T.construireCandidats({clients:cl,devis:[],laurent:[],maintenant:NOW,ctxFns,dureeVisite:20*60,appris:A});assert.equal(c2.find(c=>c.id==='2').duree,1500);
});
test('noms de Laurent : exact, ordre des mots, qualificatifs ; fautes de frappe proposées jamais appliquées ; répétitions conservées',()=>{
  const cl=[{id:1,nom:'Garage de la Montagne'},{id:2,nom:'GARAGE DECEMBRE (Nazim)'},{id:3,nom:'BCR AUTOS'},{id:4,nom:'Auto Plus 1'},{id:5,nom:'Auto Plus 1'}];
  const r=T.rapprocherNoms(['GARAGE DECEMBRE','Garage de la Montange','BCR AUTOS','Autos BCR','BCR AUTOS','Auto Plus 1','Inconnu Totalement'],cl);
  assert.deepEqual(r.laurent.map(x=>[x.id,x.rapprochement]),[['2','exact'],['3','exact']],'« Autos BCR » (mots) est la répétition du 3');
  assert.equal(r.repetitions.length,1);assert.deepEqual(r.repetitions[0].rangs,[3,4,5]);
  const faute=r.inconnus.find(x=>x.nom==='Garage de la Montange');assert.equal(faute.candidats[0].id,'1','proposé à confirmation');assert.ok(!r.laurent.some(x=>x.id==='1'),'jamais appliqué sans confirmation');
  assert.equal(r.ambigus.length,1);assert.equal(r.ambigus[0].candidats.length,2);
  assert.equal(r.inconnus.find(x=>x.nom==='Inconnu Totalement').candidats.length,0);
});
test('mémoire : journal borné, événements validés, aucune donnée libre dangereuse',()=>{
  let J=T.nouveauJournal();
  assert.throws(()=>T.journaliser(J,{type:'inconnu'}));
  for(let i=0;i<1600;i++)J=T.journaliser(J,{type:'note',jour:'2026-12-01',note:'x'.repeat(900)});
  assert.equal(J.evenements.length,1500);assert.equal(J.evenements[0].note.length,500);
  J=T.journaliser(T.nouveauJournal(),{type:'visite',jour:'bad',garageId:7,secret:'ne doit pas passer'});assert.equal(J.evenements[0].jour,null);assert.equal(J.evenements[0].secret,undefined);
});
test('enseignements : seulement sur effectifs suffisants, avec n et « mesuré »',()=>{
  let J=T.nouveauJournal();
  for(let i=0;i<2;i++)J=T.journaliser(J,{type:'visite',jour:'2026-12-0'+(i+1),garageId:5,dureeS:3600,dureePrevueS:1800});
  assert.equal(T.enseignements(J).length,0,'2 visites : pas assez');
  J=T.journaliser(J,{type:'visite',jour:'2026-12-03',garageId:5,dureeS:3600,dureePrevueS:1800});
  const l=T.enseignements(J);assert.equal(l[0].code,'DUREE_ECART');assert.equal(l[0].n,3);assert.match(l[0].message,/\+100 %/);assert.equal(l[0].confiance,'mesuré');
  J=T.journaliser(T.journaliser(J,{type:'absent',garageId:9}),{type:'absent',garageId:9});assert.ok(T.enseignements(J).some(x=>x.code==='ABSENCES_REPETEES'&&x.garageId==='9'));
  let K=T.nouveauJournal();for(let i=0;i<3;i++)K=T.journaliser(K,{type:'journee',finReelleS:60000,finPrevueS:57000});assert.match(T.enseignements(K)[0].message,/50 min plus tard/);
  let P=T.nouveauJournal();for(let i=0;i<3;i++)P=T.journaliser(P,{type:'proposition_refusee'});for(let i=0;i<2;i++)P=T.journaliser(P,{type:'proposition_validee'});assert.ok(T.enseignements(P).some(x=>x.code==='PROPOSITIONS_REFUSEES'));
});
