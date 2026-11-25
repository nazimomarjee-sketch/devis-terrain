'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../visite-v48.js'),B=require('../sauvegarde-locale.js');
let n=0;const ctx={auj:'2026-11-10',nouvelId:()=>'n'+(++n),prochainOuvre:j=>{const d=new Date(j+'T12:00:00Z');while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}};
const garage=()=>({id:1,nom:'GARAGE FICTIF',statutCrm:'prospect',conv:'cible',rappel:'2026-11-01',reports:2,reporteAu:'2026-11-12',visites:[{date:'2026-10-01',res:'vu',note:''}]});
const valide=c=>B.validateStores({articles:[],clients:[c],devis:[],meta:[],recuperations:[]});
test('nombre de touches : 4 pour une visite avec échange, 3 pour un absent ; jamais plus',()=>{
  assert.equal(V.touches('vu'),4);assert.equal(V.touches('absent'),3);assert.equal(V.touches('plus_tard'),3);
  assert.deepEqual(V.etapes('vu'),['resultat','retour','suite']);assert.deepEqual(V.etapes('absent'),['resultat','suite']);
});
test('vu + intéressé + devis : visite, note commerciale, étape, rappel demain ouvré, report remis à zéro, fiche valide à la sauvegarde',()=>{
  const {client:c,resume}=V.appliquer(garage(),{resultat:'vu',retour:'interet',suite:'devis'},ctx);
  assert.equal(c.visites.length,2);assert.deepEqual(c.visites[1],{date:'2026-11-10',res:'vu',note:''});assert.equal(c.reports,0);assert.equal(c.reporteAu,'');
  assert.equal(c.rappel,'2026-11-11');assert.equal(c.etape,'Devis à préparer');assert.equal(c.conv,'contacte');
  assert.equal(c.infosTerrain.length,1);assert.deepEqual([c.infosTerrain[0].nature,c.infosTerrain[0].type,c.infosTerrain[0].suite,c.infosTerrain[0].statut],['note-commerciale','demande','devis','a_faire']);
  assert.match(resume,/devis à préparer/);valide(c);
});
test('vu + rien de particulier + aucune suite : une visite, aucune note inventée, rappel effacé',()=>{
  const {client:c}=V.appliquer(garage(),{resultat:'vu',retour:'rien',suite:'aucune'},ctx);
  assert.equal(c.infosTerrain,undefined);assert.equal(c.rappel,'');valide(c);
});
test('note libre facultative conservée dans la visite et la note commerciale ; nettoyée et limitée',()=>{
  const {client:c}=V.appliquer(garage(),{resultat:'vu',retour:'prix',suite:'rappel7',note:'  Compare\navec X  '+'z'.repeat(600)},ctx);
  assert.ok(c.visites[1].note.startsWith('Compare avec X')&&c.visites[1].note.length===500);assert.equal(c.infosTerrain[0].type,'prix');assert.equal(c.rappel,'2026-11-17');valide(c);
});
test('absent : visite « absent », rappel selon le choix, week-end sauté ; plus_tard : report compté, pas de visite',()=>{
  const a=V.appliquer(garage(),{resultat:'absent',suite:'demain'},{...ctx,auj:'2026-11-13'}).client;assert.equal(a.visites[1].res,'absent');assert.equal(a.rappel,'2026-11-16');valide(a);
  const p=V.appliquer(garage(),{resultat:'plus_tard',suite:'rappel2'},ctx).client;assert.equal(p.visites.length,1);assert.equal(p.reports,3);assert.equal(p.reporteAu,'2026-11-12');valide(p);
});
test('l’original n’est jamais modifié ; choix incomplet ou inconnu refusé',()=>{
  const g=garage(),avant=JSON.stringify(g);V.appliquer(g,{resultat:'vu',retour:'rien',suite:'aucune'},ctx);assert.equal(JSON.stringify(g),avant);
  for(const c of [{resultat:'x'},{resultat:'vu',suite:'devis'},{resultat:'vu',retour:'interet'},{resultat:'absent'},{resultat:'absent',suite:'devis'}])assert.throws(()=>V.appliquer(g,c,ctx));
});
test('un client déjà converti ou en essai garde son statut de conversion',()=>{
  const g=garage();g.conv='converti';assert.equal(V.appliquer(g,{resultat:'vu',retour:'rien',suite:'aucune'},ctx).client.conv,'converti');
});

test('échéance explicite conservée et dates invalides refusées sans modifier la fiche',()=>{
  for(const resultat of ['vu','absent','plus_tard']) {
    const c=V.appliquer(garage(),{resultat,retour:'prix',suite:'rappel7',echeance:'2026-11-14',note:'Repasser après appel'},ctx).client;
    assert.equal(c.rappel,'2026-11-14');valide(c);
    if(resultat==='plus_tard') assert.equal(c.infosTerrain[0].texte,'Repasser après appel');
  }
  for(const echeance of ['2026-02-30','incorrect','2026-11-09']) assert.throws(()=>V.appliquer(garage(),{resultat:'vu',retour:'prix',suite:'devis',echeance},ctx));
});
