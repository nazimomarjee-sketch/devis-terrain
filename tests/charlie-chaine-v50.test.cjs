'use strict';
/* RECETTE DE LA CHAÎNE COMPLÈTE sur données 100 % synthétiques : Airtable → feuille de Laurent → EBP/CA → optimisation → validation →
   synchronisation (faux serveur CHARLIE) → client absent → recalcul → visites → mémoire/enseignements → vue Bureau. */
const {test}=require('node:test');const assert=require('node:assert/strict');
const T=require('../charlie-optimiseur-v50.js'),A=require('../charlie-airtable-v50.js'),X=require('../charlie-contexte-v50.js'),S=require('../charlie-sync-v50.js'),B=require('../bureau/charlie-carte.js'),K=require('../carte-v48.js'),CENTRES=require('../communes-centres.js');
K.charger(CENTRES);const H=T.hms,JOUR='2026-12-10'; // jeudi S2, secteur 91/92
const communes=['Massy','Palaiseau','Antony','Brunoy','Morangis','Villiers-sur-Orge','Vigneux-sur-Seine','Nanterre'];
const cp=(v)=>{const r=CENTRES.find(x=>x[1]===v&&/^9[12]/.test(x[0]));return r?r[4].split(' ')[0]:null;};
const comptesAT=communes.map((v,i)=>({id:'rec'+i,fields:{'Établissement':'Garage Synthétique '+(i+1),'Statut compte':{name:i%3?'Client actif':'Prospect'},'Segment':{name:'AB'[i%2]},'Adresse':(i+1)+' rue test '+cp(v)+' '+v.toUpperCase(),'Ville':v,'Code client EBP':i<4?'SYN0'+i:undefined,'Vérité financière':{name:i<4?'Vérifiée EBP':'Estimée'},'CA 12 mois':i<4?[15000,6000,800,0][i]:undefined}}));
const comptes=A.comptesDepuis(comptesAT);
const clients=comptes.map((c,i)=>({id:i+1,nom:c.nom,ville:c.ville,cp:cp(communes[i]),codeEbp:c.codeEbp||'',priorite:c.segment,statutCrm:c.statut==='Prospect'?'prospect':'client',visites:[],tel:'0100000'+i}));
const tournee=A.tourneesDepuis([{id:'recT',fields:{'Tournée':'Laurent | '+JOUR+' | S2 | jeudi 91/92','Date':JOUR,'Zone':'91/92','Comptes prévus':'1. Garage Synthétique 1\n2. Garage Synthétique 2\n3. Garage Synthétique 3\n4. Garage Synthétique 4\n5. Garage Synthétique 9'}}])[0];
const caStore={version:1,entrees:[{id:'a',type:'facture',numero:'F1',date:'2026-11-20',montantHt:1500000,codeEbp:'SYN00',source:'ebp'},{id:'b',type:'facture',numero:'F2',date:'2026-05-02',montantHt:600000,codeEbp:'SYN01',source:'ebp'}]};
const mem=()=>{const m=new Map();return{get:async k=>m.has(k)?JSON.parse(m.get(k)):undefined,put:async(k,v)=>{m.set(k,JSON.stringify(v));}};};
function serveur(){const j={};return{j,f:async(u,o)=>{const m=/jour\/([\d-]+)$/.exec(u);if(m&&o.method==='GET')return{ok:true,status:200,json:async()=>({version:(j[m[1]]||{}).version||0,etat:(j[m[1]]||{}).etat||null})};
  if(m&&o.method==='PUT'){const b=JSON.parse(o.body),c=j[m[1]]||{version:0};if(b.baseVersion!==c.version)return{ok:false,status:409,json:async()=>c};j[m[1]]={version:c.version+1,etat:b.etat};return{ok:true,status:200,json:async()=>({version:c.version+1})};}
  return{ok:true,status:200,json:async()=>({})};}};}
test('chaîne complète d’une journée de Laurent (jeudi 91/92) : de la feuille au bilan',async()=>{
  const now=Date.parse(JOUR+'T07:30:00');
  // 1. Feuille de Laurent → fiches : le garage 9 n'existe pas dans la base : signalé, jamais inventé
  assert.deepEqual(tournee.secteurs,['91','92']);assert.deepEqual(T.secteursDuJour(JOUR),['91','92']);
  const L=X.resoudreLaurent({noms:tournee.garages,clients});assert.deepEqual(L.laurent.map(l=>l.id),['1','2','3','4']);assert.equal(L.inconnus.length,1);assert.equal(L.complet,false);
  // 2. EBP : seules les pièces EBP comptent
  const finance=X.financeParClient({clients,caStore,maintenant:now});assert.equal(finance(clients[0]).source,'EBP');assert.equal(finance(clients[2]).source,null);
  // 3. Optimisation depuis Massy–Palaiseau
  const H0=X.horairesDuJour({},JOUR),depart=(()=>{const r=CENTRES.find(x=>x[0]==='91477');return{lat:r[2],lng:r[3]};})();
  const ctxFns={placer:(c)=>{const p=K.placer(c);return p&&p.precision?p:null;},finance,echeance:()=>({pct:999}),relanceDue:()=>null,montantHt:()=>null};
  const r=await T.organiserJournee({clients,devis:[],laurent:L.laurent,secteurs:['91','92'],depart,plage:H0.plage,pauses:H0.pauses,maintenant:now,ctxFns,...X.optionsMoteur({})});
  assert.ok(['PROPOSITION_A_VALIDER','CONFLIT_A_RESOUDRE'].includes(r.statut));assert.equal(r.audit.ok,true);assert.equal(r.validationHumaineRequise,true);
  for(const id of ['1','2','3','4'])assert.ok(r.plan.ordre.some(o=>o.garageId===id),'visite de Laurent '+id+' planifiée');
  assert.ok(r.plan.alertes.some(a=>/CENTRE DE LEUR COMMUNE/.test(a)),'positions par commune signalées');
  const ord=r.plan.ordre.find(o=>o.garageId==='1');assert.ok(ord.composantes.some(c=>c.code==='CA_FORT'),'CA EBP fort pris en compte');
  assert.match(ord.dureeSource,/HYPOTHÈSE/);
  // 4. Validation humaine puis synchronisation vers CHARLIE
  const srv=serveur(),sync=S.creer({config:async()=>({url:'https://charlie.exemple.test',jeton:'J'}),stockage:mem(),fetchImpl:srv.f});
  let etat={jour:JOUR,plan:{...r.plan,requete:undefined,valideLe:'2026-12-10T07:40:00Z'},reel:[],faits:[],retires:[],depart};
  assert.equal((await sync.pousser(JOUR,etat)).statut,'synchronise');
  // 5. Client absent chez le 1er : recalcul depuis sa position, à valider
  const premier=etat.plan.ordre[0];etat.reel.push({garageId:premier.garageId,arriveeS:premier.debutS,finS:premier.debutS,resultat:'absent'});etat.faits.push(premier.garageId);etat.retires.push(premier.garageId);
  const {candidats}=T.construireCandidats({clients,devis:[],laurent:L.laurent,maintenant:now,ctxFns,secteurs:['91','92']});
  const rec=await T.recalculer({candidats,tous:candidats,faits:etat.faits,retires:etat.retires,planPrecedent:etat.plan,positionActuelle:premier.pos,depart,maintenantS:premier.debutS+300,plage:H0.plage,pauses:H0.pauses,laurent:L.laurent.map(l=>l.id)},{type:'absent',id:premier.garageId});
  assert.equal(rec.validationHumaineRequise,true);assert.ok(!rec.ordre.some(o=>o.garageId===premier.garageId));assert.ok(rec.ordre.every(o=>o.debutS>=premier.debutS+300));assert.ok(Array.isArray(rec.modifications),'écarts listés (vide si le reste est inchangé)');
  // 6. Visites réelles → mémoire et apprentissage
  let J=T.nouveauJournal(),AP=T.nouvelApprentissage();
  rec.ordre.slice(0,2).forEach((o,i)=>{etat.reel.push({garageId:o.garageId,arriveeS:o.debutS,finS:o.debutS+2400,resultat:'vu'});etat.faits.push(o.garageId);AP=T.apprendre(AP,{garageId:o.garageId,resultat:'vu',dureeS:2400,jour:4,debutS:o.debutS,finS:o.debutS+2400});J=T.journaliser(J,{type:'visite',jour:JOUR,garageId:o.garageId,dureeS:2400,dureePrevueS:o.duree});});
  J=T.journaliser(J,{type:'absent',jour:JOUR,garageId:premier.garageId});
  assert.equal(J.evenements.length,3);assert.equal(T.dureeAppris(AP,rec.ordre[0].garageId),null,'une seule visite : pas de durée apprise');
  // 7. Synchronisation finale + vue Bureau identique
  assert.equal((await sync.pousser(JOUR,etat)).statut,'synchronise');
  const vue=B.vueJournee({schema:'charlie-tournee/v1',...srv.j[JOUR].etat});
  assert.equal(vue.kpi.vus,2);assert.equal(vue.kpi.absents,1);assert.equal(vue.kpi.prevus,r.plan.ordre.length);
  const bilan=T.comparerPrevuReel(etat.plan,etat.reel);assert.equal(bilan.absents,1);assert.equal(bilan.vus,2);
  // 8. Rien de confidentiel dans la requête envoyée à un solveur
  const req=JSON.stringify(r.plan.requete);for(const c of clients){assert.ok(!req.includes(c.nom));assert.ok(!req.includes(c.tel));}
});
test('chaîne : CHARLIE injoignable → tout fonctionne en autonome puis se rattrape sans perte',async()=>{
  const srv=serveur();let panne=true;const f=async(u,o)=>{if(panne)throw new Error('hors ligne');return srv.f(u,o);};
  const sync=S.creer({config:async()=>({url:'https://charlie.exemple.test',jeton:'J'}),stockage:mem(),fetchImpl:f});
  const etat={jour:JOUR,plan:{valideLe:'x',ordre:[]},reel:[{garageId:'1',finS:100,resultat:'vu'}],faits:['1'],retires:[]};
  assert.equal((await sync.pousser(JOUR,etat)).statut,'hors_ligne');etat.reel.push({garageId:'2',finS:200,resultat:'vu'});etat.faits.push('2');await sync.pousser(JOUR,etat);
  assert.equal((await sync.statut()).enAttente,1);panne=false;assert.equal((await sync.vider()).statut,'synchronise');assert.equal(srv.j[JOUR].etat.reel.length,2);
});
