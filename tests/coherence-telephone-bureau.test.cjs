'use strict';
// COHÉRENCE téléphone ⇄ Bureau : le même export EBP fictif doit donner le MÊME CA facturé HT sur le téléphone (import EBP) et sur le Bureau (ebp-import + ca-facture) ;
// la même sauvegarde (chiffrée ou non) doit donner les mêmes garages, et le même modèle Ma Ville, sur le téléphone et sur le Bureau. DONNÉES FICTIVES.
const {test}=require('node:test'),assert=require('node:assert/strict');
const PH=require('../sauvegarde-locale.js'),CAP=require('../ca-facture-v48.js'),EBPP=require('../ca-ebp-v48.js');
const EBPB=require('../bureau/ebp-import.js'),CAB=require('../bureau/ca-facture.js'),LS=require('../bureau/lecture-sauvegarde.js'),MC=require('../bureau/ville/modele-commune.js');
const AUJ='2026-11-20',CSV=[
  'Type;N° de pièce;Date;Code client;Nom du client;Total HT',
  'Facture;FA-001;03/11/2026;C001;GARAGE A;1 000,00','Facture;FA-001;03/11/2026;C001;GARAGE A;250,00',          // ligne par article : totalisée (1 250)
  'Facture;FA-002;05/11/2026;C002;GARAGE B;800,00','Facture;FA-002;05/11/2026;C002;GARAGE B;800,00',          // doublon exact : 1 600 si totalisé (même comportement attendu des deux côtés)
  'Facture;FA-003;29/10/2026;C001;GARAGE A;5 000,00',                                                         // mois précédent
  'Avoir;AV-001;10/11/2026;C002;GARAGE B;-300,00','Devis;DE-1;02/11/2026;C003;GARAGE C;99 999,00','Commande;CC-1;02/11/2026;C003;GARAGE C;7 777,00',
  'Facture;FA-004;12/11/2026;C004;GARAGE D;1 234,56'
].join('\r\n');
test('même export EBP → même CA facturé HT du mois sur le téléphone et sur le Bureau (factures − avoirs, mêmes pièces)',()=>{
  const lignes=EBPB.lireCsv(CSV),P=EBPB.lirePieces(lignes);
  const bureau=CAB.calculer({pieces:P.pieces,avoirs:P.avoirs,ignorees:P.ignorees,clientsEbp:[],arrete:AUJ,aujourdhui:AUJ});
  const ap=EBPP.apercu(lignes,{auj:AUJ,existantes:[]});assert.equal(ap.ok,true);
  const m=EBPP.appliquer(CAP.vide(),ap,{idImport:'i',nouvelId:(n=>()=>'e'+(++n))(0),maintenant:'2026-11-20T00:00:00Z',fichier:'x.csv',auj:AUJ});
  const tel=CAP.calculerMois(m,'2026-11');
  assert.equal(bureau.statut,'renseigne');
  assert.equal(tel.totalCents,bureau.totalCents,'CA du mois identique');assert.equal(tel.facturesCents,bureau.facturesCents);assert.equal(tel.avoirsCents,Math.abs(bureau.avoirsCents));
  assert.equal(tel.nFactures,bureau.nbFactures);assert.equal(tel.nAvoirs,bureau.nbAvoirs);
  assert.ok(tel.totalCents>0,'total réel non nul : '+tel.totalCents);
});
test('sauvegarde (chiffrée ou non) : même garages, même ordre, même modèle Ma Ville côté téléphone et côté Bureau ; données inconnues du Bureau (CA, marché) ignorées sans erreur',async()=>{
  const COM=require('../communes-centres.js').filter(r=>r[4]);
  const clients=Array.from({length:400},(_,i)=>({id:i+1,nom:'GARAGE FICTIF '+String(i+1).padStart(3,'0'),ville:COM[(i*5)%COM.length][1],cp:COM[(i*5)%COM.length][4].split(' ')[0],statutCrm:i%4===0?'client':'prospect'}));
  const ca=CAP.ajouter(CAP.vide(),{type:'facture',numero:'F1',date:'2026-11-02',montantHt:10000},{id:'x',maintenant:'t',auj:AUJ});
  const stores={articles:[],clients,devis:[],meta:[['settings',{}],['caFacture',ca],['marche',{version:1,fichier:'f.csv',importeLe:'t',note:'n',communes:[['91174',5]]}]],recuperations:[]};
  const claire=(await PH.encode(stores)).file,chiffree=(await PH.encodeChiffre(stores,'phrase fictive coherence 1')).file;
  const lu1=await LS.lire(claire),lu2=await LS.lire(chiffree,{phrase:'phrase fictive coherence 1'});
  const dec=await PH.decode(chiffree,{phrase:'phrase fictive coherence 1'});
  for(const lu of [lu1,lu2]){assert.equal(lu.telephone.clients.length,400);assert.deepEqual(lu.telephone.clients.map(c=>c.id),clients.map(c=>c.id));}
  assert.deepEqual(dec.stores.clients.map(c=>c.nom),lu2.telephone.clients.map(c=>c.nom),'téléphone (restauré) = Bureau (lu)');
  const build=terrain=>MC.agreger(MC.construire({arrete:AUJ,dates:{Terrain:AUJ},terrain,clientsEbp:[],piecesEbp:[],annuaire:[],liaisonsValidees:[]}),{portee:'mes_garages'});
  const a=build(dec.stores.clients),b=build(lu2.telephone.clients);
  assert.deepEqual(a.idf,b.idf);assert.deepEqual(a.parCommune,b.parCommune);assert.equal(a.idf.total+a.aClasser.total,400,'aucun garage perdu : placés + à classer = 400');
});
test('les indicateurs du cockpit sont cohérents avec les données : un garage compté une seule fois par section, totaux = nombre de lignes',()=>{
  const K=require('../cockpit-v48.js'),clients=Array.from({length:50},(_,i)=>({id:i+1,nom:'G'+i,statutCrm:i%2?'client':'prospect',priorite:i%3?'':'A',rappel:i%7===0?'2026-11-01':'',visites:i%4===0?[{date:'2026-09-01',res:'vu'}]:[]}));
  const r=K.calculer({auj:AUJ,clients,devis:[],totalDevis:()=>0,ca:{renseigne:false}});
  for(const s of r.sections){assert.equal(new Set(s.lignes.map(l=>l.id)).size,s.lignes.length,s.id+' : doublon');assert.ok(s.total>=s.lignes.length);}
  assert.equal(r.sections.find(s=>s.id==='rappels').total,clients.filter(c=>c.rappel).length);
});
