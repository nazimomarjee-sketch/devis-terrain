'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const A=require('../charlie-airtable-v50.js'),S=require('../scripts/charlie-airtable-sync.cjs');
// Enregistrements 100 % synthétiques, formes identiques à l'API (noms de champs) et au connecteur (identifiants de champs).
const compteNom={id:'recA',fields:{'Établissement':'Garage Synthétique 1','Statut compte':{name:'Client actif'},'Segment':{name:'A'},'Adresse':'1 rue test 91300 MASSY','Code client EBP':'SYN01','CA 12 mois':12000,'CA 90 jours EBP':1000,'Marge estimée':3000,'Retard de paiement':250,'Dernière facture EBP':'2026-10-01','Vérité financière':{name:'Vérifiée EBP'}}};
const compteId={id:'recB',cellValuesByFieldId:{fldYcmS08ub4wxFP2:'Garage Synthétique 2',fldUCAUiaOXmyfDjY:'SYN02',fldhEzsEMX2byB0cx:9000,fld5XPfjgFZtqKTKC:{name:'Estimée'},fldybrI5Fmx3dlr4X:'2 rue test 94700 MAISONS-ALFORT'}};
test('comptes : noms de champs ET identifiants, types contrôlés',()=>{
  const c=A.comptesDepuis([compteNom,compteId,{id:'recC',fields:{}}]);assert.equal(c.length,2,'compte sans nom ignoré');
  assert.equal(c[0].statut,'Client actif');assert.equal(c[0].ca12,12000);assert.equal(c[1].nom,'Garage Synthétique 2');assert.equal(c[1].ca12,9000);assert.equal(c[1].tel,null);
});
test('finance : « EBP » seulement si vérifiée ET code EBP ; marge jamais reprise comme pourcentage',()=>{
  const [a,b]=A.comptesDepuis([compteNom,compteId]);
  const fa=A.financeDepuisCompte(a),fb=A.financeDepuisCompte(b);
  assert.equal(fa.source,'EBP');assert.equal(fa.ca12Cents,1200000);assert.equal(fa.retardCents,25000);assert.equal(fa.margePct,null);
  assert.equal(fb.source,'estime','non vérifié → ignoré par le scoring');
  assert.equal(A.financeDepuisCompte({...a,codeEbp:null}).source,'estime','vérifié mais sans code EBP : refusé');
  assert.equal(A.financeDepuisCompte({...a,verite:'Déclarée'}).source,'declare');
});
const tour=(date,zone,titre,comptes)=>({id:'rec'+date,fields:{'Tournée':titre,'Date':date,'Zone':zone,'Comptes prévus':comptes}});
test('tournées de Laurent : ordre documentaire, doublons conservés et signalés, semaine lue',()=>{
  const t=A.tourneesDepuis([tour('2026-12-08','77','Laurent | 2026-12-08 | S2 | mardi 77','1. GDLS\n2. BCR AUTOS\n3. GARAGE MB\n4. bcr autos\n5. Auto 77'),tour('2026-12-01','77','Laurent | 2026-12-01 | S1 | mardi 77','1. X\n2. Y'),{id:'recZ',fields:{'Tournée':'sans date'}}]);
  assert.equal(t.length,2);assert.equal(t[0].date,'2026-12-01','trié par date');assert.equal(t[1].semaine,'S2');assert.deepEqual(t[1].garages,['GDLS','BCR AUTOS','GARAGE MB','bcr autos','Auto 77']);
  assert.deepEqual(t[1].repetitions[0].rangs,[2,4]);assert.deepEqual(t[1].secteurs,['77']);assert.equal(t[1].confirme,false);
});
test('contrôle des secteurs : hors secteur, adresse sans code postal, compte introuvable — jamais corrigé',()=>{
  const comptes=A.comptesDepuis([compteNom,compteId,{id:'r3',fields:{'Établissement':'Garage Sans Adresse'}}]);
  const t=A.tourneesDepuis([tour('2026-12-10','91/92','Laurent | 2026-12-10 | S2 | jeudi 91/92','1. Garage Synthétique 1\n2. Garage Synthétique 2\n3. Garage Sans Adresse\n4. Garage Fantôme')]);
  const c=A.controlerSecteurs(t,comptes);
  assert.deepEqual(c.map(x=>x.code),['HORS_SECTEUR','ADRESSE_SANS_CODE_POSTAL','COMPTE_INTROUVABLE']);
  assert.equal(c[0].departement,'94');assert.equal(c[0].secteur,'91/92');assert.equal(c[0].rang,2);
  assert.equal(JSON.stringify(t).includes('"corrige"'),false);
});
test('retour Airtable : charges utiles préparées, validation humaine obligatoire, entrées incomplètes refusées',()=>{
  const v=A.actionVisite({nom:'Garage Synthétique 1',date:'2026-12-01',dureeMin:34.6,resultat:'RDV pris'});
  assert.equal(v.validationHumaineRequise,true);assert.equal(v.fields.Type,'Visite');assert.equal(v.fields['Durée minutes'],35);
  assert.throws(()=>A.actionVisite({nom:'x',date:'pas une date'}));assert.throws(()=>A.actionVisite(null));assert.throws(()=>A.bilanTournee({}));
  assert.equal(A.bilanTournee({date:'2026-12-01',vus:5,km:80}).validationHumaineRequise,true);
});
test('script de synchronisation : refuse une sortie dans le dépôt, lit toutes les pages, jeton en en-tête seulement',async()=>{
  assert.equal(S.dansDepot(path.join(__dirname,'..','snapshot.json')),true);assert.equal(S.dansDepot(path.join(require('node:os').tmpdir(),'x.json')),false);
  const urls=[],hdr=[];const pages=[{records:[{id:'1'}],offset:'o1'},{records:[{id:'2'}]}];
  const f=async(u,o)=>{urls.push(u);hdr.push(o.headers.Authorization);return{ok:true,json:async()=>pages.shift()};};
  const r=await S.tout('appAAAAAAAAAAAAAA','Tournées','TOKEN-SYNTH',f);
  assert.deepEqual(r.map(x=>x.id),['1','2']);assert.ok(urls[1].includes('offset=o1'));assert.ok(urls.every(u=>!u.includes('TOKEN')));assert.deepEqual(hdr,['Bearer TOKEN-SYNTH','Bearer TOKEN-SYNTH']);
  await assert.rejects(()=>S.tout('appAAAAAAAAAAAAAA','Comptes','t',async()=>({ok:false,status:401})),/401/);
});
