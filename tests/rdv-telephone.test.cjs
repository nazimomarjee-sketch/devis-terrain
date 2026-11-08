'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../rdv-v48.js'),B=require('../sauvegarde-locale.js');
let n=0;const ctx=(x={})=>({id:'r'+(++n),maintenant:'2026-11-10T08:00:00Z',auj:'2026-11-10',...x});
const rdv=(clientId,date,heure,duree=30,extra={})=>({clientId,clientNom:'G'+clientId,date,heure,duree,...extra});
test('création : champs contrôlés (garage, date non passée, heure valide, durée), objet nettoyé',()=>{
  let m=R.ajouter(R.vide(),rdv(1,'2026-11-10','09:00',45,{objet:'  Présenter\nle vernis '}),ctx());assert.equal(m.rdv[0].objet,'Présenter le vernis');assert.equal(m.rdv[0].statut,'prevu');
  for(const [r,re] of [[rdv(0,'2026-11-10','09:00'),/garage/],[rdv(1,'2026-11-09','09:00'),/passée/],[rdv(1,'2026-02-31','09:00'),/Date invalide/],[rdv(1,'2026-11-10','9h'),/Heure invalide/],[rdv(1,'2026-11-10','09:00',2),/Durée/],[rdv(1,'2026-11-10','23:30',60),/minuit/]])assert.throws(()=>R.ajouter(R.vide(),r,ctx()),re);
});
test('chevauchement refusé, jours différents et créneaux contigus acceptés ; même garage deux fois le même jour : confirmation',()=>{
  let m=R.ajouter(R.vide(),rdv(1,'2026-11-10','09:00',60),ctx());
  assert.throws(()=>R.ajouter(m,rdv(2,'2026-11-10','09:30',30),ctx()),/Chevauche/);
  m=R.ajouter(m,rdv(2,'2026-11-10','10:00',30),ctx());m=R.ajouter(m,rdv(3,'2026-11-11','09:00',60),ctx());
  assert.throws(()=>R.ajouter(m,rdv(2,'2026-11-10','14:00'),ctx()),e=>e.confirmation===true);assert.equal(R.ajouter(m,rdv(2,'2026-11-10','14:00'),ctx({confirme:true})).rdv.length,4);
});
test('un rendez-vous annulé libère son créneau ; l’historique reste ; terminer ; déplacer avec contrôle',()=>{
  let m=R.ajouter(R.vide(),rdv(1,'2026-11-10','09:00',60),ctx());const id=m.rdv[0].id;
  assert.throws(()=>R.annuler(m,id,' ',ctx()),/motif/);const a=R.annuler(m,id,'Client absent',ctx());assert.equal(a.rdv.length,1);assert.equal(R.duJour(a,'2026-11-10').length,0);
  const m2=R.ajouter(a,rdv(2,'2026-11-10','09:15'),ctx());assert.equal(R.duJour(m2,'2026-11-10').length,1);
  const m3=R.ajouter(R.vide(),rdv(1,'2026-11-10','09:00'),ctx()),m4=R.ajouter(m3,rdv(2,'2026-11-10','11:00'),ctx());
  assert.throws(()=>R.deplacer(m4,m4.rdv[1].id,'2026-11-10','09:10',ctx()),/Chevauche/);const d=R.deplacer(m4,m4.rdv[1].id,'2026-11-12','15:00',ctx());assert.deepEqual(d.rdv[1].ancien,{date:'2026-11-10',heure:'11:00'});
  assert.equal(R.terminer(m3,m3.rdv[0].id,ctx()).rdv[0].statut,'fait');
});
test('agenda : du jour trié par heure ; à venir sur N jours ; clos exclus',()=>{
  let m=R.vide();for(const [c,d,h] of [[1,'2026-11-10','14:00'],[2,'2026-11-10','08:30'],[3,'2026-11-12','10:00'],[4,'2026-11-30','10:00']])m=R.ajouter(m,rdv(c,d,h),ctx());
  assert.deepEqual(R.duJour(m,'2026-11-10').map(r=>r.clientId),[2,1]);assert.deepEqual(R.aVenir(m,'2026-11-10',7).map(r=>r.clientId),[2,1,3]);
});
const P={1:{lat:48.60,lng:2.40},2:{lat:48.70,lng:2.20},3:{lat:48.61,lng:2.41},4:{lat:48.69,lng:2.21},5:{lat:48.65,lng:2.30}};const pos=id=>P[id]||null;
test('intégration : les rendez-vous sont des points fixes dans l’ordre des heures ; les libres s’insèrent près de leur voisin ; sans position en fin',()=>{
  let m=R.vide();m=R.ajouter(m,rdv(1,'2026-11-10','09:00'),ctx());m=R.ajouter(m,rdv(2,'2026-11-10','14:00'),ctx());
  const r=R.integrer(R.duJour(m,'2026-11-10'),[3,4,99],pos);
  assert.deepEqual(r.sequence.map(s=>s.id),[1,3,4,2,99]);assert.equal(r.sequence[0].rdv.heure,'09:00');assert.equal(r.sequence[3].rdv.heure,'14:00');assert.equal(r.sequence[1].rdv,undefined);
});
test('un garage libre qui a déjà un rendez-vous n’est pas dupliqué ; faisabilité : avertissement si le temps manque, rien si large',()=>{
  let m=R.vide();m=R.ajouter(m,rdv(1,'2026-11-10','09:00',30),ctx());m=R.ajouter(m,rdv(2,'2026-11-10','09:50',30),ctx());
  const r=R.integrer(R.duJour(m,'2026-11-10'),[1,3,4,5],pos);assert.equal(r.sequence.filter(s=>s.id===1).length,1);
  assert.ok(r.avertissements.some(a=>/min nécessaires/.test(a)),'20 minutes pour ≈ 14 km + visites : insuffisant');
  const large=R.ajouter(R.ajouter(R.vide(),rdv(1,'2026-11-10','09:00',30),ctx()),rdv(2,'2026-11-10','16:00',30),ctx());
  assert.deepEqual(R.integrer(R.duJour(large,'2026-11-10'),[3],pos).avertissements,[]);
});
test('sauvegarde : l’agenda est conservé (chiffré) ; un agenda incohérent est refusé',async()=>{
  const m=R.ajouter(R.vide(),rdv(1,'2026-11-10','09:00'),ctx());R.valider(m);
  const s={articles:[],clients:[{id:1,nom:'G1'}],devis:[],meta:[['agenda',m]],recuperations:[]};
  const {file}=await B.encodeChiffre(s,'phrase fictive agenda 12'),o=await B.decode(file,{phrase:'phrase fictive agenda 12'});assert.deepEqual(new Map(o.stores.meta).get('agenda'),m);
  for(const bad of [{...m,rdv:[m.rdv[0],m.rdv[0]]},{...m,rdv:[{...m.rdv[0],heure:'25:00'}]},{...m,rdv:[{...m.rdv[0],clientId:99}]},{...m,rdv:[{...m.rdv[0],statut:'annule'}]}])assert.throws(()=>B.validateStores({...s,meta:[['agenda',bad]]}),/Agenda/);
});
