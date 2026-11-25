'use strict';
// Robustesse des imports EBP face à de VRAIS fichiers dont on ne connaît pas encore la forme : libellés variés, lignes de titre et de total,
// colonnes TTC voisines, choix manuel des colonnes, fichier sans colonne « type ». DONNÉES FICTIVES — aucun export réel reçu : ces formes sont des hypothèses.
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../ca-ebp-v48.js'),C=require('../ebp-clients-v48.js'),CA=require('../ca-facture-v48.js');
const AUJ='2026-11-12',ctx=(x={})=>({auj:AUJ,existantes:[],...x});
test('libellés d’en-têtes variés : la détection trouve numéro, date, HT, code et nom ; elle ne prend jamais une colonne TTC pour le HT',()=>{
  for(const ent of [
    ['Type de document','Numéro du document','Date du document','Code tiers','Nom du tiers','Total TTC','Total HT net'],
    ['Nature','N° pièce','Date pièce','Code client','Raison sociale','Montant TTC','Montant HT'],
    ['Type','Numéro','Date','Compte client','Intitulé du client','Net HT','TTC'],
    ['Document','N° de facture','Date de facture','N° client','Client','Total H.T.','Total T.T.C.']]){
    const an=E.analyser([ent,['Facture','FA1','05/11/2026','C1','G','120','100']]);assert.equal(an.ok,true);assert.deepEqual(an.manque,[],ent.join('|'));
    assert.doesNotMatch(ent[an.carte.ht].toLowerCase().replace(/\./g,''),/ttc/,'HT ≠ TTC : '+ent[an.carte.ht]);assert.ok(an.carte.code!=null&&an.carte.client!=null,ent.join('|'));
  }
});
test('HT et TTC côte à côte : c’est bien le HT qui est compté',()=>{
  const ap=E.apercu([['Type','N° pièce','Date','Client','Total TTC','Total HT'],['Facture','FA-1','05/11/2026','G','1 200,00','1 000,00']],ctx());
  assert.equal(ap.nouvelles[0].montantHt,100000);
});
test('lignes de titre avant les en-têtes, lignes vides, ligne « Total » en bas : seules les pièces comptent',()=>{
  const rows=[['Liste des documents de vente'],['Édité le 12/11/2026'],[],['Type','N° pièce','Date','Client','Total HT'],['Facture','FA-1','05/11/2026','G','100,00'],[],['Facture','FA-2','06/11/2026','G','50,00'],['Total','','','','150,00'],['','','','Total général','150,00']];
  const ap=E.apercu(rows,ctx());assert.equal(ap.nouvelles.length,2);assert.equal(ap.totaux.nouvellesCents,15000);assert.equal(ap.lignesTotal,2);assert.equal(ap.ignorees.length,0);
});
test('colonnes non reconnues : refus AVEC l’analyse (titres seulement) ; le choix manuel des colonnes fait passer l’import',()=>{
  const rows=[['Col A','Réf interne','Jour','Qui','Somme hors taxe'],['Facture','X-1','05/11/2026','G','100']];
  const r=E.apercu(rows,ctx());assert.equal(r.ok,false);assert.ok(r.analyse&&r.analyse.entetes.length===5);assert.match(r.erreur,/à la main/);
  const ok=E.apercu(rows,ctx({colonnes:{debut:0,carte:{type:0,no:1,date:2,client:3,ht:4}}}));assert.equal(ok.ok,true);assert.equal(ok.nouvelles[0].montantHt,10000);
  assert.equal(E.apercu(rows,ctx({colonnes:{debut:0,carte:{no:1,date:1,ht:4}}})).ok,false,'même colonne pour deux champs : refusé');
});
test('fichier sans colonne « type » et numéros sans préfixe : ignoré par défaut (compté), accepté si l’utilisateur déclare « factures et avoirs seulement » ; un montant négatif devient un avoir',()=>{
  const rows=[['Numéro','Date','Client','Total HT'],['2026-0001','05/11/2026','G','100'],['2026-0002','06/11/2026','G','-30']];
  const a=E.apercu(rows,ctx());assert.equal(a.nouvelles.length,0);assert.equal(a.sansType,2);
  const b=E.apercu(rows,ctx({typeDefaut:'facture'}));assert.deepEqual(b.nouvelles.map(x=>[x.type,x.montantHt]),[['facture',10000],['avoir',3000]]);assert.equal(b.totaux.nouvellesCents,7000);
});
test('« Facture d’avoir », « Note de crédit » = avoir ; dates Excel (numéro de série) et montants numériques d’un .xlsx',()=>{
  const ap=E.apercu([['Type','N° pièce','Date','Client','Total HT'],['Facture d’avoir','FA-9','05/11/2026','G','-10'],['Note de crédit','NC-1','05/11/2026','G','5'],['Facture','FA-1',46331,'G',1234.5]],ctx());
  assert.deepEqual(ap.nouvelles.map(x=>x.type).sort(),['avoir','avoir','facture']);const f=ap.nouvelles.find(x=>x.numero==='FA-1');assert.equal(f.montantHt,123450);assert.match(f.date,/^2026-11-\d\d$/);
});
test('clients : libellés variés, « Code postal » jamais pris pour le code client, choix manuel, analyse disponible en cas d’échec',()=>{
  for(const ent of [['Code postal','Code tiers','Nom du tiers','Ville'],['Compte client','Intitulé','CP','Commune'],['N° client','Dénomination','Code postal','Ville'],['Code','Raison sociale','Code postal','Ville']]){
    const an=C.analyser([ent,['x','y','z','w']]);assert.deepEqual(an.manque,[],ent.join('|'));assert.doesNotMatch(ent[an.carte.code].toLowerCase(),/postal/);
  }
  const rows=[['Identifiant','Appellation','Lieu'],['C1','GARAGE FICTIF','Massy']],r=C.lire(rows);assert.equal(r.ok,false);assert.ok(r.analyse);
  const ok=C.lire(rows,{debut:0,carte:{code:0,nom:1,ville:2}});assert.equal(ok.ok,true);assert.deepEqual([ok.clients[0].code,ok.clients[0].nom,ok.clients[0].ville],['C1','GARAGE FICTIF','Massy']);
});
test('import puis calcul : le résultat reste cohérent avec le CA (aucun centime créé ni perdu) sur 2 000 lignes mêlant factures, avoirs, totaux et autres pièces',()=>{
  const rows=[['Type','N° pièce','Date','Code client','Client','Total HT']];let att=0;
  for(let i=0;i<2000;i++){const t=i%10===0?'Avoir':i%7===0?'Devis':i%13===0?'Commande':'Facture',m=100+i;rows.push([t,(t==='Avoir'?'AV':t==='Devis'?'DE':t==='Commande'?'CC':'FA')+i,'05/11/2026','C'+i%50,'G',String(m)+',50']);if(t==='Facture')att+=m*100+50;if(t==='Avoir')att-=m*100+50;if(i%400===0)rows.push(['Sous-total','','','','','999']);}
  const ap=E.apercu(rows,ctx());assert.equal(ap.totaux.nouvellesCents,att);
  const m=E.appliquer(CA.vide(),ap,{idImport:'i',nouvelId:(n=>()=>'e'+(++n))(0),maintenant:'t',fichier:'f',auj:AUJ});assert.equal(CA.calculerMois(m,'2026-11').totalCents,att);
});
