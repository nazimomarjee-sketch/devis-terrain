'use strict';
// Import EBP du CA facturé HT (téléphone). DONNÉES FICTIVES — noms de colonnes EBP = hypothèse.
const {test}=require('node:test'),assert=require('node:assert/strict');
const CA=require('../ca-facture-v48.js'),E=require('../ca-ebp-v48.js'),B=require('../sauvegarde-locale.js');
const AUJ='2026-11-10',EN=['Type','N° de pièce','Date','Nom du client','Total HT'];
let n=0;const ctx=(extra={})=>({idImport:'imp'+(++n),nouvelId:()=>'e'+(++n)+Math.random(),maintenant:'2026-11-10T09:00:00Z',fichier:'export-test.csv',auj:AUJ,...extra});
const lignes=(...l)=>[EN,...l];
test('aperçu : factures et avoirs retenus, devis/commandes/BL comptés à part, avoir positif, sommes en centimes',()=>{
  const ap=E.apercu(lignes(['Facture','FA-001','05/11/2026','GARAGE A','1 000,00'],['Facture','FA-002','2026-11-06','GARAGE B','500.50'],['Avoir','AV-001','07/11/2026','GARAGE A','-200,00'],
    ['Devis','DE-9','01/11/2026','GARAGE C','99 999,00'],['Commande','CC-1','02/11/2026','GARAGE C','5 000'],['Bon de livraison','BL-1','03/11/2026','GARAGE C','1 234']),{auj:AUJ,existantes:[]});
  assert.equal(ap.ok,true);assert.equal(ap.nouvelles.length,3);assert.deepEqual(ap.horsCa,{devis:1,commande:1,bl:1});
  assert.equal(ap.nouvelles.find(e=>e.numero==='AV-001').montantHt,20000);assert.equal(ap.totaux.nouvellesCents,100000+50050-20000);
});
test('une pièce exportée ligne par article est totalisée ; date divergente pour un même numéro est écartée avec son motif',()=>{
  const ap=E.apercu(lignes(['Facture','FA-010','05/11/2026','G','100'],['Facture','FA-010','05/11/2026','G','50,25'],['Facture','FA-011','05/11/2026','G','10'],['Facture','FA-011','06/11/2026','G','10']),{auj:AUJ,existantes:[]});
  assert.equal(ap.nouvelles.find(e=>e.numero==='FA-010').montantHt,15025);assert.match(ap.ignorees[0].motif,/date différente/);
});
test('lignes multiples pour un même numéro : signalées (risque d’export dupliqué)',()=>{
  const ap=E.apercu(lignes(['Facture','FA-10','05/11/2026','G','100'],['Facture','FA-10','05/11/2026','G','100'],['Facture','FA-11','05/11/2026','G','5']),{auj:AUJ,existantes:[]});
  assert.deepEqual(ap.multiLignes,['FA-10']);assert.equal(ap.nouvelles.find(e=>e.numero==='FA-10').montantHt,20000);
});
test('réimport du même fichier : tout est « identique », rien n’est ajouté ni doublé',()=>{
  const rows=lignes(['Facture','FA-001','05/11/2026','G','1000'],['Avoir','AV-1','06/11/2026','G','100']);
  let m=E.appliquer(CA.vide(),E.apercu(rows,{auj:AUJ,existantes:[]}),ctx());assert.equal(m.entrees.length,2);
  const ap2=E.apercu(rows,{auj:AUJ,existantes:m.entrees});assert.equal(ap2.nouvelles.length,0);assert.equal(ap2.identiques.length,2);
  m=E.appliquer(m,ap2,ctx());assert.equal(m.entrees.length,2);assert.equal(m.imports.length,2);assert.equal(m.imports[1].identiques,2);
});
test('conflit : même numéro, montant ou date différents → jamais écrasé, signalé avec l’existant',()=>{
  const m=CA.ajouter(CA.vide(),{type:'facture',numero:'FA-001',date:'2026-11-05',montantHt:100000},{id:'x',maintenant:'t',auj:AUJ});
  const ap=E.apercu(lignes(['Facture','fa 001','05/11/2026','G','1 200,00']),{auj:AUJ,existantes:m.entrees});
  assert.equal(ap.conflits.length,1);assert.equal(ap.conflits[0].existant.montantHt,100000);assert.equal(ap.nouvelles.length,0);
  const m2=E.appliquer(m,ap,ctx());assert.equal(CA.calculerMois(m2,'2026-11').totalCents,100000,'le CA existant est inchangé');assert.equal(m2.imports[0].conflits,1);
});
test('un numéro annulé peut être réimporté ; refus : date future, montant illisible, facture négative, sans numéro',()=>{
  let m=CA.ajouter(CA.vide(),{type:'facture',numero:'FA-1',date:'2026-11-05',montantHt:100},{id:'x',maintenant:'t',auj:AUJ});m=CA.annuler(m,'x','erreur',{maintenant:'t'});
  const ap=E.apercu(lignes(['Facture','FA-1','05/11/2026','G','150'],['Facture','FA-F','11/11/2026','G','10'],['Facture','FA-X','05/11/2026','G','abc'],['Facture','FA-N','05/11/2026','G','-30'],['Facture','','05/11/2026','G','5'],['Facture','FA-D','31/02/2026','G','5']),{auj:AUJ,existantes:m.entrees});
  assert.equal(ap.nouvelles.length,1);assert.equal(ap.ignorees.length,5);assert.ok(ap.ignorees.some(x=>/future/.test(x.motif))&&ap.ignorees.some(x=>/illisible/.test(x.motif))&&ap.ignorees.some(x=>/négatif/.test(x.motif)));
});
test('colonnes : en-têtes sur une ligne décalée acceptés ; TTC seul refusé avec la liste des colonnes lues ; vide refusé',()=>{
  const ap=E.apercu([['Export EBP','',''],[],EN,['Facture','FA-1','05/11/2026','G','100']],{auj:AUJ,existantes:[]});assert.equal(ap.ok,true);assert.equal(ap.nouvelles.length,1);
  const bad=E.apercu([['Type','N° de pièce','Date','Client','Total TTC'],['Facture','FA-1','05/11/2026','G','120']],{auj:AUJ,existantes:[]});assert.equal(bad.ok,false);assert.match(bad.erreur,/Montant HT/);assert.match(bad.erreur,/Total TTC/);
  assert.equal(E.apercu([],{}).ok,false);
});
test('traçabilité : chaque pièce garde fichier + ligne + import ; annulation d’un import en bloc, historique conservé',()=>{
  const rows=lignes(['Facture','FA-1','05/11/2026','G','100'],['Facture','FA-2','05/11/2026','G','200']);
  let m=CA.ajouter(CA.vide(),{type:'facture',numero:'MAN-1',date:'2026-11-01',montantHt:5000},{id:'man',maintenant:'t',auj:AUJ});
  const c=ctx({idImport:'impA'});m=E.appliquer(m,E.apercu(rows,{auj:AUJ,existantes:m.entrees}),c);
  const p=m.entrees.find(e=>e.numero==='FA-2');assert.deepEqual([p.source,p.import.id,p.import.fichier,p.import.ligne],['ebp','impA','export-test.csv',3]);assert.equal(CA.calculerMois(m,'2026-11').totalCents,5000+10000+20000);
  assert.throws(()=>E.annulerImport(m,'impA','  ',{maintenant:'t'}),/motif/);
  const m2=E.annulerImport(m,'impA','Mauvais fichier',{maintenant:'t2'});
  assert.equal(CA.calculerMois(m2,'2026-11').totalCents,5000,'seul l’import est retiré, la saisie manuelle reste');assert.equal(m2.entrees.length,3);assert.ok(m2.imports[0].annule);
  assert.throws(()=>E.annulerImport(m2,'impA','encore',{maintenant:'t3'}),/déjà annulé/);assert.throws(()=>E.annulerImport(m2,'zzz','x',{maintenant:'t'}),/introuvable/);
  assert.doesNotThrow(()=>CA.valider(m2));
});
test('saisie manuelle après import : le contrôle de doublon couvre les pièces EBP ; sauvegarde chiffrée conserve import et historique',async()=>{
  let m=E.appliquer(CA.vide(),E.apercu(lignes(['Facture','FA-1','05/11/2026','G','100']),{auj:AUJ,existantes:[]}),ctx());
  assert.throws(()=>CA.ajouter(m,{type:'facture',numero:'fa1',date:'2026-11-05',montantHt:10000},{id:'z',maintenant:'t',auj:AUJ}),/Doublon/);
  const s={articles:[],clients:[{id:1,nom:'G'}],devis:[],meta:[['settings',{}],['caFacture',m]],recuperations:[]};
  const {file}=await B.encodeChiffre(s,'phrase fictive de test 77'),o=await B.decode(file,{phrase:'phrase fictive de test 77'});
  assert.deepEqual(new Map(o.stores.meta).get('caFacture'),m);
  assert.throws(()=>B.validateStores({...s,meta:[['caFacture',{...m,imports:[m.imports[0],m.imports[0]]}]]}),/import répété/);
});
test('volume : 5 000 lignes (pièces) analysées rapidement',()=>{
  const l=[EN];for(let i=0;i<5000;i++)l.push(['Facture','FA-'+i,'05/11/2026','G'+i,String(100+i)]);
  const t=Date.now(),ap=E.apercu(l,{auj:AUJ,existantes:[]});assert.equal(ap.nouvelles.length,5000);assert.ok(Date.now()-t<2000);
});
