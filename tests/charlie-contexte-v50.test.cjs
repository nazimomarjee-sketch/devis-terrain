'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../charlie-contexte-v50.js'),T=require('../charlie-optimiseur-v50.js');
const NOW=Date.parse('2026-12-01T10:00:00Z');
const piece=(id,date,montantHt,extra={})=>({id,type:'facture',numero:'F'+id,date,montantHt,codeEbp:'SYN01',source:'ebp',...extra});
test('finance : seules les pièces EBP comptent ; saisies = déclaratif ; avoirs déduits ; annulées ignorées',()=>{
  const store={version:1,entrees:[piece('1','2026-11-20',500000),piece('2','2026-03-01',300000),piece('3','2024-01-01',999999),piece('4','2026-11-25',100000,{source:'saisie'}),piece('5','2026-11-26',700000,{annule:{motif:'erreur'}}),piece('6','2026-11-27',50000,{type:'avoir'}),piece('9','2026-11-01',10000,{codeEbp:'SYN02',source:'saisie'})]};
  const f=C.financeParClient({clients:[{id:1,codeEbp:'SYN01'},{id:2,codeEbp:'SYN02'},{id:3},{id:4,codeEbp:'ABS'}],caStore:store,maintenant:NOW});
  const a=f({id:1});assert.equal(a.source,'EBP');assert.equal(a.ca12Cents,750000,'5000+3000-500 € ; 2024 hors période ; saisie et annulée exclues');assert.equal(a.ca90Cents,450000);assert.equal(a.derniereFacture,'2026-11-20');
  assert.equal(f({id:2}).source,'declare');assert.equal(f({id:2}).ca12Cents,null,'déclaratif : pas de CA utilisable');assert.equal(f({id:3}).source,null);assert.equal(f({id:4}).source,null);
  assert.equal(f({id:99}),null,'client inconnu');assert.equal(C.financeParClient({clients:[{id:1,codeEbp:'X'}],caStore:null,maintenant:NOW})({id:1}).source,null);
});
test('finance : retard de paiement, encours et compte bloqué depuis les fiches',()=>{
  const cl=[{id:1,factures:[{montant:20000,regleLe:''},{montant:5000,regleLe:'2026-11-01'},{montant:7000,echu:true}],compte:{statut:'bloque'}},{id:2,ebp:{bloque:true}}];
  const f=C.financeParClient({clients:cl,caStore:null,maintenant:NOW,enRetard:(x)=>x.echu===true||x.montant===20000});
  assert.equal(f(cl[0]).retardCents,27000);assert.equal(f(cl[0]).encoursCents,27000);assert.equal(f(cl[0]).bloque,true);assert.equal(f(cl[1]).bloque,true);
});
test('horaires : exceptions par jour, valeurs absurdes refusées, pause incompatible ignorée',()=>{
  const R={fin:'17:00',jours:{5:{fin:'16:00',pauseMin:30}}};
  const ven=C.horairesDuJour(R,'2026-12-04'),mar=C.horairesDuJour(R,'2026-12-01');
  assert.deepEqual(ven.plage,[8*3600,16*3600]);assert.equal(ven.pauses[0].duree,1800);assert.deepEqual(mar.plage,[8*3600,17*3600]);assert.equal(mar.pauses[0].duree,2700);assert.deepEqual(ven.erreurs,[]);
  const k=C.horairesDuJour({debut:'18:00',fin:'09:00'},'2026-12-01');assert.deepEqual(k.plage,T.DEFAUTS.plage);assert.equal(k.erreurs.length,1);
  const p=C.horairesDuJour({pauseDebut:'07:00',pauseFin:'07:30',pauseMin:45},'2026-12-01');assert.equal(p.pauses.length,0);assert.equal(p.erreurs.length,1);
  assert.equal(C.horairesDuJour({pauseMin:0},'2026-12-01').pauses.length,0,'pause désactivable');
  assert.equal(C.horairesDuJour({fin:'8:30'},'2026-12-01').erreurs.length,1,'journée de moins d’une heure refusée');
});
test('options moteur : durées par type, seuils CA, bornes',()=>{
  const o=C.optionsMoteur({dureeVisiteMin:25,dureeProspectMin:45,dureeClientMin:'',dureeDevisMin:1,caFort:'15000',caMoyen:-5,reachatJours:1000});
  assert.equal(o.dureeVisite,1500);assert.equal(o.dureesParType.prospect,2700);assert.equal(o.dureesParType.client,null);assert.equal(o.dureesParType.devis_a_relancer,null,'1 min refusé (borne 5)');
  assert.equal(o.seuilsCA12.fort,15000);assert.equal(o.seuilsCA12.moyen,T.DEFAUTS.seuilsCA12.moyen);assert.equal(o.seuilReachatJours,T.DEFAUTS.seuilReachatJours);
  assert.equal(C.optionsMoteur({}).dureeVisite,null,'rien de réglé → hypothèse signalée par le cœur');
});
test('Laurent : alias confirmés appliqués, inconnus listés, heures de rendez-vous conservées',()=>{
  const cl=[{id:1,nom:'Garage de la Montagne'},{id:2,nom:'BCR AUTOS'},{id:3,nom:'Garage Decembre (Nazim)'}];
  const r=C.resoudreLaurent({noms:['Garage de la Montange','BCR AUTOS','GARAGE DECEMBRE','Inconnu'],clients:cl,heures:{'BCR AUTOS':'10:30'}});
  assert.deepEqual(r.laurent.map(x=>x.id),['2','3']);assert.equal(r.laurent[0].heure,'10:30');assert.equal(r.inconnus.length,2);assert.equal(r.complet,false);
  const k=T.nomCleExporte('Garage de la Montange'),r2=C.resoudreLaurent({noms:['Garage de la Montange','BCR AUTOS'],clients:cl,alias:{[k]:1}});
  assert.deepEqual(r2.laurent.map(x=>[x.id,x.rapprochement]),[['1','confirmé'],['2','exact']]);assert.equal(r2.complet,true);
  const r3=C.resoudreLaurent({noms:['X'],clients:cl,alias:{x:999}});assert.equal(r3.laurent.length,0,'alias vers une fiche supprimée ignoré');
});
