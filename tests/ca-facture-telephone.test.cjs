'use strict';
// CA facturé HT du téléphone. DONNÉES FICTIVES.
const {test}=require('node:test'),assert=require('node:assert/strict');
const CA=require('../ca-facture-v48.js'),B=require('../sauvegarde-locale.js');
const AUJ='2026-11-08',ctx=(i,extra={})=>({id:'p'+i,maintenant:'2026-11-08T10:00:00Z',auj:AUJ,...extra});
const f=(numero,date,montantHt,extra={})=>({type:'facture',numero,date,montantHt,...extra});
test('le CA = factures HT moins avoirs, par période, pièces annulées ignorées',()=>{
  let m=CA.vide();
  m=CA.ajouter(m,f('F-001','2026-11-02',100000),ctx(1));m=CA.ajouter(m,f('F-002','2026-11-05',50000),ctx(2));
  m=CA.ajouter(m,{type:'avoir',numero:'A-001',date:'2026-11-06',montantHt:20000},ctx(3));m=CA.ajouter(m,f('F-000','2026-10-31',999999),ctx(4));
  const r=CA.calculerMois(m,'2026-11');assert.deepEqual([r.facturesCents,r.avoirsCents,r.totalCents,r.nFactures,r.nAvoirs],[150000,20000,130000,2,1]);
  assert.equal(CA.calculerMois(m,'2026-10').totalCents,999999);
  m=CA.annuler(m,'p2','Saisie en double d’un autre bon',{maintenant:'2026-11-08T11:00:00Z'});
  assert.equal(CA.calculerMois(m,'2026-11').totalCents,80000);assert.equal(m.entrees.length,4,'rien n’est supprimé');assert.equal(CA.calculerMois(m,'2026-11').annulees,1);
});
test('un avoir peut dépasser les factures du mois : le total devient négatif, sans être caché',()=>{
  let m=CA.ajouter(CA.vide(),f('F-1','2026-11-01',10000),ctx(1));m=CA.ajouter(m,{type:'avoir',numero:'A-1',date:'2026-11-02',montantHt:30000},ctx(2));
  assert.equal(CA.calculerMois(m,'2026-11').totalCents,-20000);
});
test('doublon refusé : même numéro (casse, espaces et tirets ignorés), pour une facture comme pour un avoir',()=>{
  let m=CA.ajouter(CA.vide(),f('FA 2026/001','2026-11-02',10000),ctx(1));
  assert.throws(()=>CA.ajouter(m,f('fa2026-001','2026-11-03',10000),ctx(2)),/Doublon/);
  m=CA.ajouter(m,{type:'avoir',numero:'FA 2026/001',date:'2026-11-03',montantHt:500},ctx(3));assert.equal(m.entrees.length,2,'une facture et un avoir de même numéro sont deux pièces distinctes');
});
test('une pièce annulée libère son numéro (ressaisie corrigée possible), l’historique reste',()=>{
  let m=CA.ajouter(CA.vide(),f('F-9','2026-11-02',10000),ctx(1));m=CA.annuler(m,'p1','Mauvais montant',{maintenant:'x'});
  m=CA.ajouter(m,f('F-9','2026-11-02',12000),ctx(2));assert.equal(CA.calculerMois(m,'2026-11').totalCents,12000);assert.equal(m.entrees.length,2);
  assert.throws(()=>CA.annuler(m,'p1','encore',{maintenant:'x'}),/déjà annulée/);assert.throws(()=>CA.annuler(m,'p2','  ',{maintenant:'x'}),/motif/);
});
test('refus : numéro absent, date invalide ou future, montant nul/négatif/décimal/non fini',()=>{
  for(const [e,re] of [[f('','2026-11-02',100),/numéro/],[f('F','2026-02-31',100),/Date invalide/],[f('F','2026-11-09',100),/futur/],[f('F','2026-11-02',0),/supérieur à 0/],[f('F','2026-11-02',-5),/supérieur à 0/],[f('F','2026-11-02',10.5),/supérieur à 0/],[f('F','2026-11-02',NaN),/supérieur à 0/],[{type:'devis',numero:'F',date:'2026-11-02',montantHt:1},/facture ou avoir/]])
    assert.throws(()=>CA.ajouter(CA.vide(),e,ctx(1)),re);
});
test('avertissements à confirmer : gros montant, même client/date/montant sous un autre numéro',()=>{
  assert.throws(()=>CA.ajouter(CA.vide(),f('F-BIG','2026-11-02',6000000),ctx(1)),e=>e.confirmation===true);
  assert.equal(CA.ajouter(CA.vide(),f('F-BIG','2026-11-02',6000000),ctx(1,{confirme:true})).entrees.length,1);
  let m=CA.ajouter(CA.vide(),f('F-1','2026-11-02',10000,{clientId:3}),ctx(1));
  assert.throws(()=>CA.ajouter(m,f('F-2','2026-11-02',10000,{clientId:3}),ctx(2)),e=>e.confirmation===true&&/doublon possible/.test(e.message));
});
test('sans aucune pièce : « non renseigné », jamais un faux zéro',()=>{assert.equal(CA.aDesPieces(CA.vide()),false);assert.equal(CA.aDesPieces(null),false);
  const m=CA.annuler(CA.ajouter(CA.vide(),f('F','2026-11-02',100),ctx(1)),'p1','erreur',{maintenant:'x'});assert.equal(CA.aDesPieces(m),false);});
test('la sauvegarde conserve le CA facturé, et refuse un magasin incohérent',async()=>{
  const m=CA.ajouter(CA.vide(),f('F-1','2026-11-02',10000,{clientId:1,clientNom:'GARAGE FICTIF'}),ctx(1));
  const s={articles:[],clients:[{id:1,nom:'GARAGE FICTIF'}],devis:[],meta:[['settings',{}],['caFacture',m]],recuperations:[]};
  const {file}=await B.encodeChiffre(s,'phrase fictive de test 99'),o=await B.decode(file,{phrase:'phrase fictive de test 99'});
  assert.deepEqual(new Map(o.stores.meta).get('caFacture'),m);
  for(const bad of [{version:1,entrees:[m.entrees[0],m.entrees[0]]},{version:2,entrees:[]},{version:1,entrees:[{...m.entrees[0],montantHt:-1}]}])
    assert.throws(()=>B.validateStores({...s,meta:[['caFacture',bad]]}),/CA facturé/);
});
