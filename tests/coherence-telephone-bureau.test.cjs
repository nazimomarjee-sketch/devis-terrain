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
test('Secteurs, Carte et Ma Ville comptent les garages par commune de la même façon (même placement) ; écarts listés, jamais silencieux',()=>{
  const CEN=require('../communes-centres.js'),K=require('../carte-v48.js'),S=require('../secteur-v48.js');K.charger(CEN);
  const rows=CEN.filter(r=>r[4]),clients=Array.from({length:600},(_,i)=>{const r=rows[(i*11)%rows.length];return {id:i+1,nom:'GARAGE FICTIF '+i,ville:r[1],cp:r[4].split(' ')[0],statutCrm:i%3?'prospect':'client'}});
  clients.push({id:9001,nom:'SANS LIEU'},{id:9002,nom:'LIEU INCONNU',ville:'Nulle-Part',cp:'99999'});
  const m=MC.construire({arrete:AUJ,dates:{Terrain:AUJ},terrain:clients,clientsEbp:[],piecesEbp:[],annuaire:[],liaisonsValidees:[]}),ag=MC.agreger(m,{portee:'mes_garages'});
  const sec=S.calculer({auj:AUJ,clients,facturation:{},communes:new Map(CEN.map(r=>[r[0],{nom:r[1]}])),marche:[],placer:c=>{const p=K.placer(c);return p.insee?{insee:p.insee,commune:p.commune}:null}});
  const vVille=new Map(ag.parCommune.map(c=>[c.insee,c.total])),vSect=new Map(sec.communes.map(c=>[c.id,c.garages]));
  const ecarts=[...new Set([...vVille.keys(),...vSect.keys()])].filter(k=>(vVille.get(k)||0)!==(vSect.get(k)||0));
  assert.equal(ag.idf.total+ag.aClasser.total,602,'Ma Ville : aucun garage perdu');assert.equal(sec.communes.reduce((s,c)=>s+c.garages,0)+sec.sans.garages,602,'Secteurs : aucun garage perdu');
  assert.deepEqual(ecarts,[],'communes où Ma Ville et Secteurs divergent : '+ecarts.join(', '));
});
test('sauvegarde complète avec TOUTES les données de cockpit : le Bureau lit les garages et ignore sans erreur agenda, CA, clients EBP, marché ; les liaisons EBP des fiches sont conservées',async()=>{
  const R=require('../rdv-v48.js'),EC=require('../ebp-clients-v48.js');
  const g=[{id:1,nom:'GARAGE FICTIF A',ville:'Massy',cp:'91300',statutCrm:'client'}],ebp=new Map([['C1',{code:'C1',nom:'GARAGE FICTIF A',bloque:true,famille:'',commercial:'',statut:''}]]),lie=EC.appliquer(g,[{code:'C1',id:1}],ebp,{auj:AUJ,fichier:'f.csv'}).modifies[0];
  const agenda=R.ajouter(R.vide(),{clientId:1,clientNom:'A',date:'2026-12-01',heure:'10:00',duree:30},{id:'r',maintenant:'t',auj:AUJ});
  const stores={articles:[],clients:[lie],devis:[],meta:[['settings',{}],['agenda',agenda],['caFacture',CAP.vide()],['ebpClients',{version:1,fichier:'f',importeLe:'t',clients:[{code:'C1',nom:'A'}]}],['marche',{version:1,fichier:'f',importeLe:'t',note:'n',communes:[['91174',3]]}]],recuperations:[]};
  const {file}=await PH.encodeChiffre(stores,'phrase fictive tout cockpit 1'),lu=await LS.lire(file,{phrase:'phrase fictive tout cockpit 1'}),dec=await PH.decode(file,{phrase:'phrase fictive tout cockpit 1'});
  assert.equal(lu.telephone.clients.length,1);assert.equal(lu.telephone.clients[0].codeEbp,'C1');assert.equal(dec.stores.clients[0].liaisonEbp.methode,'manuel');assert.equal(new Map(dec.stores.meta).get('agenda').rdv.length,1);
});
