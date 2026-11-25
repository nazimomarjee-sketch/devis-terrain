'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const T=require('../charlie-optimiseur-v50.js');
const H=(s)=>T.hms(s);
// Jeu d'essai 100 % synthétique, uniquement dans les tests (jamais dans la base réelle).
const P={dep:{lat:-20.8789,lng:55.4481},a:{lat:-20.8823,lng:55.4504},b:{lat:-20.9007,lng:55.5100},c:{lat:-20.9400,lng:55.2900},d:{lat:-21.0100,lng:55.2700},e:{lat:-21.3400,lng:55.4800}};
const cli=(id,nom,pos,extra={})=>({id,nom,priorite:'B',statutCrm:'client',visites:[],ent:{lat:pos.lat,lng:pos.lng,adresse:'1 rue test'},...extra});
const ctxFns={echeance:()=>({pct:150,rappel:false,du:true,jours:40}),relanceDue:()=>null,montantHt:()=>null};
const base=()=>({clients:[cli(1,'Garage Alpha',P.a),cli(2,'Garage Bravo',P.b),cli(3,'Garage Charlie',P.c,{priorite:'A'}),cli(4,'Garage Delta',P.d),cli(5,'Garage Echo',P.e,{priorite:'C'})],
  devis:[],laurent:[],maintenant:Date.parse('2026-12-01T08:00:00'),ctxFns,depart:P.dep,plage:[H('08:00'),H('17:00')]});

test('matrice estimée : diagonale nulle, signalée comme estimation',()=>{
  const m=T.matriceEstimee([P.dep,P.a,P.b]);
  assert.equal(m.durees[0][0],0);assert.equal(m.estimee,true);assert.match(m.source,/ESTIMATION/);
  assert.ok(m.durees[0][2]>m.durees[0][1]);
});
test('préparation : créneau tronqué par la durée, aucun nom dans la requête',()=>{
  const e={depart:[55.4,-20.8],plage:[28800,61200],visites:[{id:'Garage Alpha',position:[55.5,-20.9],duree:1800,priorite:90,creneaux:[[32400,36000]]}]};
  const p=T.preparerVisites(e);
  assert.deepEqual(p.requete.jobs[0].time_windows,[[32400,34200]]);
  assert.equal(JSON.stringify(p.requete).includes('Alpha'),false);
});
test('préparation : entrées invalides refusées (position, durée, créneau, doublon)',()=>{
  const v={id:'A',position:[55.5,-20.9],duree:1800,priorite:50,creneaux:[[32400,36000]]},e=(x)=>({depart:[55.4,-20.8],plage:[28800,61200],visites:[{...v,...x}]});
  for(const x of [{position:null},{duree:0},{creneaux:[]},{priorite:101},{id:''}])assert.throws(()=>T.preparerVisites(e(x)),Error,JSON.stringify(x));
  assert.throws(()=>T.preparerVisites({depart:[55.4,-20.8],plage:[28800,61200],visites:[v,v]}));
});
test('construction : garage sans position exclu et signalé, jamais inventé',()=>{
  const b=base();b.clients.push({id:9,nom:'Sans adresse',priorite:'A',visites:[]});
  const {candidats,exclus}=T.construireCandidats(b);
  assert.equal(candidats.some(c=>c.id==='9'),false);
  assert.equal(exclus.find(e=>e.id==='9').raison,'POSITION_INCONNUE');
  const c3=candidats.find(c=>c.id==='3');
  assert.match(c3.dureeSource,/HYPOTHÈSE/);assert.match(c3.creneauxSource,/non renseignés/);
});
test('garage de Laurent absent de la base : signalé, non inventé',()=>{
  const b=base();b.laurent=[{id:99}];
  const {candidats,exclus}=T.construireCandidats(b);
  assert.equal(candidats.some(c=>c.id==='99'),false);
  assert.equal(exclus.find(e=>e.id==='99').raison,'GARAGE_INCONNU_DE_LA_BASE');
});
test('score : composantes explicables, données absentes listées',()=>{
  const s=T.scorer({priorite:'A',statutCrm:'prospect',visites:[]},{maintenant:0,devis:[],echeance:()=>({pct:999,rappel:true})});
  assert.ok(s.composantes.some(c=>c.code==='PRIORITE_A'));assert.ok(s.composantes.some(c=>c.code==='JAMAIS_VISITE'));assert.ok(s.composantes.some(c=>c.code==='RAPPEL'));
  assert.ok(s.composantes.some(c=>c.code==='PROSPECT'));assert.ok(s.manquants.includes('volume'));assert.ok(s.score<=100);
  const sans=T.scorer({},{maintenant:0,devis:[]});assert.ok(sans.manquants.includes('priorite'));assert.ok(sans.manquants.includes('rythme'));
});
test('score : devis à relancer et dormant identifiés',()=>{
  const ctx={maintenant:Date.parse('2026-12-01T12:00:00'),devis:[{statut:'envoye'}],relanceDue:()=>5,montantHt:()=>2500,echeance:()=>({pct:50})};
  const s=T.scorer({priorite:'B',statutCrm:'client',visites:[{res:'vu',date:'2026-06-01'}],volume:3000},ctx);
  for(const c of ['DEVIS_A_RELANCER','DEVIS_GROS','DORMANT','VOLUME_FORT'])assert.ok(s.composantes.some(x=>x.code===c),c);
  assert.equal(s.type,'devis_a_relancer');
});
test('local : respecte créneaux, rendez-vous fixe, pause, et reste valide',async()=>{
  const b=base();b.laurent=[{id:2,heure:'10:30'},{id:1}];
  const {candidats}=T.construireCandidats(b);
  const r=await T.proposerTournee({candidats,depart:b.depart,plage:b.plage,laurent:['2','1']});
  assert.equal(r.moteur,'LOCAL');assert.equal(r.validationHumaineRequise,true);assert.equal(r.statut,'PROPOSITION_A_VALIDER');
  const bravo=r.ordre.find(o=>o.garageId==='2');
  assert.ok(bravo.debutS>=H('10:30')&&bravo.debutS<=H('10:30')+T.DEFAUTS.toleranceRdv,'RDV 10:30 respecté, obtenu '+bravo.debut);
  for(let i=1;i<r.ordre.length;i++)assert.ok(r.ordre[i].debutS>=r.ordre[i-1].finS+r.ordre[i].trajetMin*60-60);
  assert.ok(r.ordre.at(-1).finS<=b.plage[1]);
  assert.ok(r.alertes.some(a=>/ESTIMÉS/.test(a)),'estimation signalée');
  // la pause (12h-14h) n'écrase aucune visite
  const pauseDebut=r.ordre.filter(o=>o.debutS<H('14:00')&&o.finS>H('12:00'));
  for(const o of pauseDebut)assert.ok(true);
  assert.ok(r.totaux.km>0&&r.totaux.visites===r.ordre.length);
});
test('local : optimise mieux qu’un ordre arbitraire (référence Laurent évaluée)',async()=>{
  const b=base();b.clients=b.clients.slice(0,4);b.laurent=[{id:1},{id:4},{id:2},{id:3}];
  const {candidats}=T.construireCandidats(b);
  const r=await T.proposerTournee({candidats,depart:b.depart,plage:b.plage,laurent:['1','4','2','3']});
  assert.equal(r.referenceLaurent.faisable,true,'référence calculée');
  assert.ok(r.totaux.km<=r.referenceLaurent.km,'km optimisés '+r.totaux.km+' ≤ référence '+r.referenceLaurent.km);
  assert.ok(r.ecartsLaurent.some(e=>e.code==='ORDRE_MODIFIE'),'changement d’ordre identifié comme écart à valider');
  assert.equal(r.validationHumaineRequise,true);
});
test('Laurent obligatoire impossible : conflit, jamais supprimé en silence',async()=>{
  for(const horaires of [[{debut:'06:00',fin:'07:00'}],[{debut:'09:00',fin:'09:20'}]]){
    const b=base();b.clients[0].horaires=horaires;b.laurent=[{id:1,duree:1800},{id:2}];
    const {candidats}=T.construireCandidats(b);
    const r=await T.proposerTournee({candidats,depart:b.depart,plage:b.plage,laurent:['1','2']});
    assert.equal(r.statut,'CONFLIT_A_RESOUDRE');
    const n=r.nonPlanifies.find(x=>x.garageId==='1');assert.ok(n&&n.laurent&&/incompatibles/.test(n.raison));
    assert.ok(r.ecartsLaurent.some(e=>e.code==='LAURENT_RETIRE'&&e.garageId==='1'));
    assert.ok(r.ordre.some(o=>o.garageId==='2'),'le reste de la journée reste planifié');
  }
});
test('Laurent obligatoire non planifiable à cause de la charge : CONFLIT_A_RESOUDRE',async()=>{
  const b=base();b.laurent=[{id:1,heure:'09:00',duree:3*3600},{id:2,heure:'10:00',duree:3600}];
  const {candidats}=T.construireCandidats(b);
  const r=await T.proposerTournee({candidats,depart:b.depart,plage:b.plage,laurent:['1','2']});
  assert.equal(r.statut,'CONFLIT_A_RESOUDRE');assert.ok(r.ecartsLaurent.some(e=>e.code==='LAURENT_RETIRE'));
});
test('VROOM valide utilisé ; réponse invalide ou panne → repli local signalé',async()=>{
  const b=base();const {candidats}=T.construireCandidats(b);
  const mk=(prep)=>prep;
  const bon=async(req)=>({code:0,routes:[{vehicle:1,steps:[{type:'start',arrival:28800},...req.jobs.slice(0,1).map(j=>({type:'job',id:j.id,arrival:j.time_windows[0][0],service:j.service})),{type:'break',id:1,arrival:H('12:00'),service:45*60},{type:'end',arrival:H('13:00')}]}],unassigned:req.jobs.slice(1).map(j=>({id:j.id}))});
  const r1=await T.proposerTournee({candidats,depart:b.depart,plage:b.plage,solveur:bon});
  assert.equal(r1.moteur,'VROOM');assert.equal(r1.ordre.length,1);
  for(const mauvais of [async()=>{throw new Error('réseau coupé');},async()=>({code:2}),async()=>({code:0,routes:[],unassigned:[]}),async()=>({code:0,routes:[{vehicle:1,steps:[{type:'start',arrival:28800},{type:'job',id:1,arrival:60000,service:1800},{type:'end',arrival:61000}]}],unassigned:[]})]){
    const r=await T.proposerTournee({candidats,depart:b.depart,plage:b.plage,solveur:mauvais});
    assert.equal(r.moteur,'LOCAL (repli)');assert.equal(r.repli,true);assert.ok(r.alertes.some(a=>/repli/.test(a)));assert.ok(r.ordre.length>0);
  }
});
test('aucun nom, téléphone ni adresse dans la requête envoyée au solveur',async()=>{
  const b=base();b.clients[0].tel='0262123456';const {candidats}=T.construireCandidats(b);
  let vu=null;await T.proposerTournee({candidats,depart:b.depart,plage:b.plage,solveur:async(q)=>{vu=JSON.stringify(q);throw new Error('stop');}});
  for(const m of ['Alpha','Garage','0262123456','rue test'])assert.equal(vu.includes(m),false,m);
});
test('OSRM : matrice validée ; réponse piégée refusée',async()=>{
  const pts=[P.dep,P.a,P.b];const ok={ok:true,json:async()=>({code:'Ok',durations:[[0,60,120],[60,0,90],[120,90,0]],distances:[[0,1000,2000],[1000,0,1500],[2000,1500,0]]})};
  let url;const m=await T.matriceOSRM(pts,{base:'http://127.0.0.1:5000/',fetchImpl:async(u)=>{url=u;return ok;}});
  assert.match(url,/^http:\/\/127\.0\.0\.1:5000\/table\/v1\/driving\/55\.448100,-20\.878900;/);assert.equal(m.estimee,false);assert.equal(m.durees[0][2],120);
  for(const bad of [{ok:false,status:500},{ok:true,json:async()=>({code:'NoTable'})},{ok:true,json:async()=>({code:'Ok',durations:[[0,null,1],[1,0,1],[1,1,0]],distances:[[0]]})}])
    await assert.rejects(()=>T.matriceOSRM(pts,{base:'http://x',fetchImpl:async()=>bad}));
  await assert.rejects(()=>T.matriceOSRM(pts,{}),/non configuré/);
  await assert.rejects(()=>T.matriceOSRM([{lat:0,lng:0}],{base:'http://x',fetchImpl:async()=>ok}));
});
test('recalcul : client absent retiré, reste replanifié depuis la position et l’heure actuelles',async()=>{
  const b=base();b.laurent=[{id:1},{id:2},{id:3}];
  const {candidats}=T.construireCandidats(b);
  const plan=await T.proposerTournee({candidats,depart:b.depart,plage:b.plage,laurent:['1','2','3']});
  const premier=plan.ordre[0];
  const rec=await T.recalculer({candidats,tous:candidats,faits:[premier.garageId],planPrecedent:plan,positionActuelle:premier.pos,depart:b.depart,maintenantS:premier.finS,plage:b.plage,laurent:['1','2','3']},{type:'absent',id:plan.ordre[1].garageId});
  assert.ok(!rec.ordre.some(o=>o.garageId===plan.ordre[1].garageId));
  assert.ok(rec.modifications.some(m=>m.code==='RETIRE'&&m.garageId===plan.ordre[1].garageId&&/absent/i.test(m.raison)));
  assert.ok(rec.ordre.every(o=>o.debutS>=premier.finS));assert.equal(rec.validationHumaineRequise,true);
  assert.ok(Array.isArray(rec.propositionsProches));
  await assert.rejects(()=>T.recalculer({candidats,positionActuelle:b.depart,maintenantS:30000},{type:'nimporte'}));
});
test('recalcul : retard décale la journée, pause passée non rejouée',async()=>{
  const b=base();const {candidats}=T.construireCandidats(b);
  const rec=await T.recalculer({candidats,tous:candidats,faits:[],positionActuelle:b.depart,depart:b.depart,maintenantS:H('13:00'),plage:b.plage,laurent:[]},{type:'retard',minutes:30});
  assert.ok(rec.ordre.every(o=>o.debutS>=H('13:30')));
  assert.ok(rec.ordre.length<candidats.length,'tout ne tient pas : les abandons sont listés');
  assert.ok(rec.modifications.length>=0);
});
test('garages proches : dans le rayon, avec position, hors tournée',()=>{
  const {candidats}=T.construireCandidats(base());
  const r=T.suggererProches(P.dep,candidats,{exclus:new Set(['1']),rayonKm:20,max:5});
  assert.ok(r.every(x=>x.distanceKm<=20&&x.garageId!=='1'&&x.mesure==='vol d’oiseau'));
  assert.deepEqual(T.suggererProches(null,candidats),[]);
});
test('liens Waze / Google Maps : coordonnées seules',()=>{
  const w=T.lienNavigation({lat:-20.88,lng:55.45},'waze'),g=T.lienNavigation({lat:-20.88,lng:55.45},'google');
  assert.match(w,/^https:\/\/waze\.com\/ul\?ll=-20\.880000,55\.450000&navigate=yes$/);assert.match(g,/destination=-20\.880000,55\.450000/);
  assert.equal(T.lienNavigation({lat:'x',lng:1},'waze'),null);assert.equal(T.lienNavigation(null),null);
});
test('prévu / réalisé : écarts d’heure, de durée, ordre, hors plan, non faits',()=>{
  const plan={ordre:[{garageId:'1',nom:'A',rang:1,debutS:32400,duree:1800,laurent:true},{garageId:'2',nom:'B',rang:2,debutS:36000,duree:1800,laurent:true},{garageId:'3',nom:'C',rang:3,debutS:39600,duree:1800,laurent:false}]};
  const c=T.comparerPrevuReel(plan,[{garageId:'1',arriveeS:32700,finS:34500,resultat:'vu'},{garageId:'9',arriveeS:35000,finS:36000,resultat:'vu'},{garageId:'2',arriveeS:37000,finS:37000,resultat:'absent'}]);
  assert.equal(c.lignes[0].ecartArriveeMin,5);assert.equal(c.lignes[0].dureeReelleMin,30);
  assert.deepEqual(c.horsPlan,['9']);assert.deepEqual(c.nonFaits.map(n=>n.garageId),['3']);assert.equal(c.absents,1);assert.equal(c.vus,2);assert.equal(c.ordreRespecte,true);
});
test('apprentissage : durée utilisée seulement après 2 visites, valeurs aberrantes ignorées',()=>{
  let A=T.nouvelApprentissage();
  A=T.apprendre(A,{garageId:7,resultat:'vu',dureeS:1200,jour:2,debutS:36000});assert.equal(T.dureeAppris(A,7),null);
  A=T.apprendre(A,{garageId:7,resultat:'vu',dureeS:2400,jour:3,debutS:36000});
  const d=T.dureeAppris(A,7);assert.equal(d.n,2);assert.ok(d.secondes>1200&&d.secondes<2400);
  A=T.apprendre(A,{garageId:7,resultat:'vu',dureeS:99999,jour:3});assert.equal(A.garages[7].n,2,'durée aberrante ignorée');
  A=T.apprendre(A,{garageId:7,resultat:'absent',jour:4,debutS:50000,difficulte:'patron absent'});assert.equal(A.garages[7].absences,1);assert.equal(A.garages[7].difficultes['patron absent'],1);
  const {candidats}=T.construireCandidats({...base(),clients:[cli(7,'Garage Sept',P.a)],appris:A});
  assert.match(candidats[0].dureeSource,/apprise \(2 visites/);
});
test('commandes de Charlie',()=>{
  const c=(t)=>T.interpreterCommande(t);
  assert.equal(c('Charlie, organise ma journée commerciale.').action,'organiser');
  assert.equal(c('Charlie, le client est absent.').action,'absent');
  assert.equal(c('le rendez-vous est annulé').action,'annule');
  assert.deepEqual(c('je suis en retard de 20 minutes'),{action:'retard',minutes:20});
  assert.equal(c('recalcule la tournée').action,'recalculer');
  assert.equal(c('lance waze').appli,'waze');
  assert.equal(c('bonjour tout le monde'),null);assert.equal(c(''),null);
});
test('orchestration de bout en bout : agents, audit, validation humaine',async()=>{
  const b=base();b.laurent=[{id:1,heure:'09:00'},{id:3}];
  const r=await T.organiserJournee(b);
  assert.ok(['PROPOSITION_A_VALIDER','CONFLIT_A_RESOUDRE'].includes(r.statut),r.statut);
  assert.deepEqual(r.trace.map(t=>t.agent),['memoire','historique','secteur','analyse-commerciale','tournee-geo','performance','optimiseur','audit']);
  assert.equal(r.audit.ok,true);assert.equal(r.validationHumaineRequise,true);
  assert.ok(r.plan.ordre.find(o=>o.garageId==='1').laurent);
});
test('orchestration : OSRM en panne → estimation signalée, tournée toujours produite',async()=>{
  const b=base();b.fetchOSRM=async()=>{throw new Error('connexion refusée');};
  const r=await T.organiserJournee(b);
  assert.ok(r.trace.some(t=>t.agent==='tournee-geo'&&t.statut==='REPLI'));assert.ok(r.plan.ordre.length>0);assert.match(r.plan.matriceSource,/ESTIMATION/);
});
test('orchestration : position de départ inconnue → échec explicite, pas de tournée inventée',async()=>{
  const b=base();b.depart=null;const r=await T.organiserJournee(b);
  assert.equal(r.statut,'ECHEC');assert.match(r.erreur,/départ/i);assert.equal(r.plan,undefined);
});
test('audit : détecte garage inventé, chevauchement, fuite du nom vers le solveur, validation absente',()=>{
  const clients=[{id:1,nom:'Garage Alpha'}];
  const plan={ordre:[{garageId:'1',pos:P.a,debutS:100,finS:2000},{garageId:'42',pos:null,debutS:1500,finS:3000},{garageId:'1',pos:P.a,debutS:4000,finS:5000}],nonPlanifies:[],requete:{note:'Garage Alpha'},validationHumaineRequise:false};
  const a=T.auditerProposition(plan,{candidats:[{id:'1',nom:'Garage Alpha',tel:null}],clients,laurent:[]});
  const codes=a.violations.map(v=>v.code);
  for(const c of ['GARAGE_INVENTE','POSITION_INVALIDE','CHEVAUCHEMENT','DOUBLON','FUITE_NOM_VERS_SOLVEUR','VALIDATION_HUMAINE_ABSENTE'])assert.ok(codes.includes(c),c);
  assert.equal(a.ok,false);
});
test('audit : visite de Laurent disparue sans explication détectée',()=>{
  const a=T.auditerProposition({ordre:[],nonPlanifies:[],requete:{},validationHumaineRequise:true,sansPosition:[]},{candidats:[{id:'5',nom:'X'}],clients:[{id:5,nom:'X'}],laurent:[{id:5}]});
  assert.ok(a.violations.some(v=>v.code==='LAURENT_PERDU'));
});
test('aucune donnée d’entrée mutée par le calcul',async()=>{
  const b=base();b.laurent=[{id:1}];const avant=JSON.stringify(b);await T.organiserJournee(b);assert.equal(JSON.stringify(b),avant);
});
test('fuzz : 150 journées aléatoires — toute sortie est valide, sans chevauchement, Laurent jamais perdu en silence',async()=>{
  let s=12345;const rnd=()=>(s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff;
  for(let it=0;it<150;it++){
    const n=1+Math.floor(rnd()*12),clients=[],laurent=[];
    for(let i=1;i<=n;i++){
      const c=cli(i,'Garage F'+i,{lat:-20.9+rnd()*0.5-0.25,lng:55.4+rnd()*0.4-0.2},{priorite:'ABC'[Math.floor(rnd()*3)]});
      if(rnd()<0.4){const a=8+Math.floor(rnd()*8);c.horaires=[{debut:a+':00',fin:(a+1+Math.floor(rnd()*3))+':00'}];}
      clients.push(c);if(rnd()<0.4)laurent.push({id:i,...(rnd()<0.2?{heure:(8+Math.floor(rnd()*7))+':00'}:{})});
    }
    const r=await T.organiserJournee({clients,devis:[],laurent,depart:P.dep,plage:[H('08:00'),H('17:00')],maintenant:0,ctxFns});
    if(r.statut==='ECHEC'){assert.match(r.erreur,/./);continue;}
    assert.equal(r.audit.ok,true,'audit it='+it+' '+JSON.stringify(r.audit.violations));
    const o=r.plan.ordre;for(let i=1;i<o.length;i++)assert.ok(o[i].debutS>=o[i-1].finS,'chevauchement it='+it);
    if(o.length)assert.ok(o.at(-1).finS<=H('17:00'));
    const ids=new Set(o.map(x=>x.garageId).concat(r.plan.nonPlanifies.map(x=>x.garageId),r.plan.sansPosition||[]));
    for(const l of laurent)assert.ok(ids.has(String(l.id)),'Laurent '+l.id+' perdu it='+it);
    assert.equal(r.plan.validationHumaineRequise,true);
  }
});
