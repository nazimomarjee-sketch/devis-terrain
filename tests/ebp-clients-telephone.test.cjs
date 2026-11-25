'use strict';
// Import EBP des clients et rapprochement des codes. DONNÉES FICTIVES — colonnes EBP = hypothèse.
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../ebp-clients-v48.js'),B=require('../sauvegarde-locale.js');
const EN=['Code client','Raison sociale','Ville','Code postal','Bloqué','Famille client','Représentant'];
const ctx={auj:'2026-11-10',fichier:'clients-test.csv',auteur:'Moi'};
const lire=l=>E.lire([EN,...l]);
test('lecture : colonnes détectées et affichées, bloqué lu, doublon de code identique ignoré, code répété avec un autre nom = conflit, lignes sans code/nom ignorées avec motif',()=>{
  const r=lire([['C001','GARAGE DUPONT SARL','Massy','91300','Non','Carrosserie','REP1'],['C002','AUTO MARTIN','Palaiseau','91120','Oui','Mécanique',''],['C001','Garage Dupont','Massy','91300','Non','',''],['C002','AUTRE NOM','x','','','',''],['','SANS CODE','','','','',''],['C009','','','','','','']]);
  assert.equal(r.ok,true);assert.equal(r.clients.length,2);assert.equal(r.clients[1].bloque,true);assert.equal(r.clients[0].bloque,false);assert.equal(r.conflitsCode.length,1);assert.equal(r.ignorees.length,2);
  assert.ok(r.correspondance.some(c=>c.cle==='code'&&c.colonne==='Code client'));
});
test('colonnes obligatoires absentes : refus avec les colonnes lues',()=>{const r=E.lire([['Client','Ville'],['x','y']]);assert.equal(r.ok,false);assert.match(r.erreur,/Code client/);assert.match(r.erreur,/Ville/);assert.equal(E.lire([]).ok,false);});
const garages=()=>[{id:1,nom:'Garage Dupont',cp:'91300',ville:'Massy'},{id:2,nom:'Martin Auto',cp:'91120'},{id:3,nom:'GARAGE DUMONT',cp:'95000',ville:'Cergy'},{id:4,nom:'Garage Dumont',cp:'94000',ville:'Créteil'},{id:5,nom:'Centre Bernard',cp:'77000'}];
test('proposition FORTE : même nom (formes juridiques et casse ignorées) et même code postal, unique ; jamais une liaison automatique',()=>{
  const ebp=lire([['C001','GARAGE DUPONT SARL','Massy','91300','','','']]).clients,r=E.rapprocher(ebp,garages());
  assert.deepEqual(r.fortes.map(f=>[f.code,f.id]),[['C001',1]]);assert.match(r.fortes[0].raison,/code postal \(91300\)/);assert.equal(r.aVerifier.length+r.sansGarage.length,0);
  assert.equal(garages()[0].codeEbp,undefined,'rapprocher ne modifie rien');
});
test('à vérifier : homonymes dans deux lieux, nom proche + même CP, lieu inconnu ; sans garage : aucun candidat',()=>{
  const ebp=lire([['C010','GARAGE DUMONT','Evry','91000','','',''],['C011','Martin Auto Services','x','91120','','',''],['C012','Centre Bernard','','','','',''],['C013','Totalement Inconnu','Paris','75001','','','']]).clients,r=E.rapprocher(ebp,garages());
  assert.equal(r.fortes.length,0);const par=Object.fromEntries(r.aVerifier.map(a=>[a.code,a]));
  assert.equal(par.C010.candidats.length,2);assert.match(par.C010.raison,/Plusieurs/);assert.equal(par.C011.candidats[0].id,2);assert.match(par.C011.candidats[0].raison,/proche/);assert.equal(par.C012.candidats[0].id,5);assert.deepEqual(r.sansGarage,['C013']);
});
test('unicité : deux codes EBP pour le même nom+lieu, ou un même garage visé deux fois, ne donnent JAMAIS de proposition forte',()=>{
  const ebp=lire([['C020','Garage Dupont','Massy','91300','','',''],['C021','GARAGE DUPONT SARL','Massy','91300','','','']]).clients,r=E.rapprocher(ebp,garages());
  assert.equal(r.fortes.length,0);assert.equal(r.aVerifier.length,2);
  const g2=[...garages(),{id:6,nom:'Garage Dupont',cp:'91300'}];assert.equal(E.rapprocher(lire([['C030','Garage Dupont','Massy','91300','','','']]).clients,g2).fortes.length,0,'deux garages candidats');
});
test('codes déjà liés : reconnus « déjà liés », jamais reproposés ; un garage déjà lié n’est plus candidat',()=>{
  const g=garages();g[0].codeEbp='C001';const ebp=lire([['C001','Garage Dupont','Massy','91300','','',''],['C050','Garage Dupont','Massy','91300','','','']]).clients,r=E.rapprocher(ebp,g);
  assert.deepEqual(r.liees,[{code:'C001',id:1}]);assert.equal(r.fortes.length,0);assert.deepEqual(r.sansGarage,['C050']);
});
test('application : trace complète (qui, quand, source, méthode), copies (originaux intacts), refus d’un code ou garage déjà pris, remplacement seulement si demandé',()=>{
  const g=garages(),ebp=lire([['C001','Garage Dupont SARL','Massy','91300','Oui','Carrosserie','REP1'],['C002','Autre','x','','','','']]).clients,m=new Map(ebp.map(c=>[c.code,c]));
  const r=E.appliquer(g,[{code:'C001',id:1,methode:'nom+cp'},{code:'C001',id:2},{code:'C002',id:1}],m,ctx);
  assert.equal(r.modifies.length,1);const x=r.modifies[0];assert.deepEqual([x.codeEbp,x.liaisonEbp.par,x.liaisonEbp.le,x.liaisonEbp.methode,x.ebp.bloque],['C001','Moi','2026-11-10','nom+cp',true]);assert.match(x.liaisonEbp.source,/clients-test\.csv/);
  assert.equal(g[0].codeEbp,undefined);assert.equal(r.refus.length,2);assert.ok(r.refus.some(f=>/déjà lié à un autre garage/.test(f.motif)));
  const g2=garages();g2[0].codeEbp='OLD';assert.match(E.appliquer(g2,[{code:'C001',id:1}],m,ctx).refus[0].motif,/déjà lié au code OLD/);
  const r3=E.appliquer(g2,[{code:'C001',id:1,remplacer:true}],m,ctx);assert.equal(r3.modifies[0].liaisonEbp.ancienCode,'OLD');
});
test('création explicite d’une fiche garage depuis un client EBP ; les fiches liées restent valides pour la sauvegarde',async()=>{
  const c=lire([['C070','Nouveau Garage','Évry','91000','','Carrosserie','']]).clients[0],n=E.nouveauGarage(c,ctx);assert.equal(n.statutCrm,'client');assert.equal(n.codeEbp,'C070');assert.equal(n.id,undefined);
  const lie=E.appliquer(garages(),[{code:'C001',id:1}],new Map([['C001',{code:'C001',nom:'x',bloque:false}]]),ctx).modifies[0];
  const s={articles:[],clients:[{...n,id:1},{...lie,id:2}],devis:[],meta:[],recuperations:[]};
  assert.doesNotThrow(()=>B.validateStores(s));
  const {file}=await B.encodeChiffre(s,'phrase fictive clients ebp 1'),o=await B.decode(file,{phrase:'phrase fictive clients ebp 1'});assert.equal(o.stores.clients[0].liaisonEbp.methode,'creation');
});
test('volume : 3 000 clients EBP × 2 000 garages rapprochés en moins de 2 s',()=>{
  const g=Array.from({length:2000},(_,i)=>({id:i+1,nom:'Garage Numero '+i,cp:String(91000+(i%300)),ville:'V'+i%300})),l=[EN];for(let i=0;i<3000;i++)l.push(['C'+i,'GARAGE NUMERO '+i+' SARL','V'+i%300,String(91000+(i%300)),'','','']);
  const t=Date.now(),r=E.rapprocher(E.lire(l).clients,g);assert.ok(Date.now()-t<2000);assert.equal(r.fortes.length,2000);assert.equal(r.sansGarage.length,1000);
});
