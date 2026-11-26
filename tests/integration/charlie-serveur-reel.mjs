// Intégration RÉELLE : client de synchronisation du téléphone contre le vrai serveur CHARLIE (dépôt cockpit-carrosserie).
// Usage : COCKPIT_DIR=/chemin/cockpit-carrosserie node --disable-warning=ExperimentalWarning tests/integration/charlie-serveur-reel.mjs  (lancer depuis le dépôt cockpit pour ses dépendances)
// Données 100 % synthétiques. Non inclus dans `node --test tests/*.test.cjs` (nécessite l'autre dépôt).
import {createRequire} from 'node:module';import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const RD=join(fileURLToPath(import.meta.url),'..','..','..'),CD=process.env.COCKPIT_DIR||join(RD,'..','cockpit-carrosserie');
const require=createRequire(join(RD,'x.js'));
const T=require(join(RD,'charlie-optimiseur-v50.js')),S=require(join(RD,'charlie-sync-v50.js')),X=require(join(RD,'charlie-contexte-v50.js')),K=require(join(RD,'carte-v48.js')),C=require(join(RD,'communes-centres.js'));
K.charger(C);
const {creerServeur}=await import(join(CD,'src','serveur.js'));
const {environnement,RACINE}=await import(join(CD,'tests','aide.js'));
const U='u'.repeat(30),A='a'.repeat(30),R='r'.repeat(30);
const e=environnement({espace:'odicolor',memoire:false});e.cfg.modePropre=true;
const srv=creerServeur({jarvis:e.jarvis,jeton:U,jetonAdmin:A,jetonRelais:R,dossierPublic:join(RACINE,'public'),cleSauvegarde:'cle-test-integration-0001-unique'});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const port=srv.address().port;
const mem=()=>{const m=new Map();return{get:async k=>m.has(k)?JSON.parse(m.get(k)):undefined,put:async(k,v)=>{m.set(k,JSON.stringify(v));}};};
// le client exige https sauf boucle locale : http://127.0.0.1 accepté
const sync=S.creer({config:async()=>({url:'http://127.0.0.1:'+port,jeton:U,appareil:'samsung'}),stockage:mem(),fetchImpl:fetch});
const log=(ok,m)=>{console.log((ok?'OK    ':'ÉCHEC ')+m);if(!ok)process.exitCode=1;};
try{
  const l=await sync.laurent('2026-12-01');log(l.statut==='ok'&&l.laurent&&l.laurent.garages.length===11&&l.laurent.zone==='77','GET /laurent/2026-12-01 : 11 garages, secteur 77 ('+l.statut+')');
  const l2=await sync.laurent('2027-01-04');log(l2.statut==='erreur'&&l2.http===404,'GET /laurent après le 31/12 : 404, rien d’extrapolé');
  const dep=(()=>{const r=C.find(x=>x[0]==='91477');return{lat:r[2],lng:r[3]};})();
  const clients=['Alpha','Bravo','Charlie','Delta','Echo'].map((n,i)=>({id:i+1,nom:'Garage Synthétique '+n,ville:['Massy','Palaiseau','Antony','Brunoy','Morangis'][i],cp:['91300','91120','92160','91800','91420'][i],priorite:'AB'[i%2],statutCrm:'client',visites:[],tel:'0100000'+i}));
  const ctxFns={placer:c=>{const p=K.placer(c);return p&&p.precision?p:null},echeance:()=>({pct:999}),relanceDue:()=>null,montantHt:()=>null};
  const r=await T.organiserJournee({clients,devis:[],laurent:[{id:1},{id:2}],secteurs:['91','92'],depart:dep,plage:[8*3600,17*3600],pauses:[{creneau:[12*3600,14*3600],duree:2700}],maintenant:Date.parse('2026-12-10T07:30:00'),ctxFns});
  log(r.audit.ok,'cœur du téléphone : plan audité ('+r.plan.ordre.length+' visites)');
  const cands=r.candidats.map(({tel,adresse,...c})=>c);
  const etat={jour:'2026-12-10',plan:{...r.plan,requete:undefined,valideLe:new Date().toISOString()},candidats:cands,plage:[8*3600,17*3600],pauses:[{creneau:[12*3600,14*3600],duree:2700}],secteurs:['91','92'],depart:dep,reel:[],faits:[],retires:[],maj:new Date().toISOString()};
  const p1=await sync.pousser('2026-12-10',etat);log(p1.statut==='synchronise','PUT /jour avec plan + candidats : accepté et audité par le serveur ('+p1.statut+')');
  const g=await sync.tirer('2026-12-10');log(g.statut==='ok'&&g.version>=1&&g.etat&&g.etat.plan.ordre.length===r.plan.ordre.length,'GET /jour : même plan relu (version '+g.version+')');
  const obs=await sync.observation({jour:'2026-12-10',garageId:String(r.plan.ordre[0].garageId),resultat:'vu',dureeS:1500,jourSemaine:4,debutS:30000,finS:31500});log(obs.statut==='synchronise','POST /observation accepté');
  const mm=await sync.memoire({jour:'2026-12-10',type:'proposition_validee',moteur:r.plan.moteur,ecarts:1});log(mm.statut==='synchronise','POST /memoire accepté');
  // plan falsifié : garage inventé → le serveur doit refuser
  const faux=JSON.parse(JSON.stringify(etat));faux.plan.ordre[0].garageId='999';const pf=await sync.pousser('2026-12-10',faux);const st=await sync.statut();log(st.conflits>=1||pf.statut!=='synchronise','plan falsifié refusé/signalé par l’audit serveur ('+pf.statut+', rejets '+st.conflits+')');
  // conflit : deux appareils
  const bureauEtat={...etat,reel:[{garageId:'2',finS:40000,resultat:'vu',arriveeS:38000}],faits:['2'],maj:new Date().toISOString()};
  const r2=await fetch('http://127.0.0.1:'+port+'/api/tournee/jour/2026-12-10',{method:'PUT',headers:{Authorization:'Bearer '+U,'content-type':'application/json'},body:JSON.stringify({baseVersion:g.version+(st.conflits?0:0),appareil:'bureau',etat:bureauEtat})});
  console.log('INFO  PUT bureau → HTTP',r2.status);
  const flux=await fetch('http://127.0.0.1:'+port+'/api/tournee/flux?jour=2026-12-10&depuis=0&attente=500',{headers:{Authorization:'Bearer '+U}});log(flux.ok,'GET /flux répond ('+flux.status+')');
  const sans=await fetch('http://127.0.0.1:'+port+'/api/tournee/jour/2026-12-10');log(sans.status===401,'sans jeton : 401');
}finally{srv.close();e.nettoyer();}
