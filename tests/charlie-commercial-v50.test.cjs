'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const T=require('../charlie-optimiseur-v50.js'),CC=require('../charlie-commercial-v50.js');
const cl=[1,2,3,4].map(i=>({id:i,nom:'Garage Synthétique '+i,priorite:'AB'[i%2],statutCrm:i===3?'prospect':'client',visites:i===2?[{res:'vu',date:'2026-10-01'}]:[],ent:{lat:48.73+i*0.01,lng:2.27}}));
const fin=(c)=>({1:{source:'EBP',ca12Cents:900000,derniereFacture:'2026-11-20',retardCents:0,encoursCents:0,bloque:false},2:{source:'EBP',ca12Cents:100000,retardCents:30000,bloque:false},4:{source:null,bloque:true}}[c.id]||null);
async function plan(){const ctx={echeance:()=>({pct:999}),relanceDue:()=>null,montantHt:()=>null,finance:fin};const r=await T.organiserJournee({clients:cl,devis:[],laurent:[{id:1},{id:3}],depart:{lat:48.7263,lng:2.2696},plage:[28800,61200],pauses:[],maintenant:Date.parse('2026-12-01T07:00:00'),ctxFns:ctx});return r.plan;}
test('matin : 3 actions maximum avec preuve, vigilance bloqué/retard, aucune donnée inventée',async()=>{
  const p=await plan(),m=CC.preparerMatin({jour:'2026-12-01',plan:p,clients:cl,finance:fin});
  assert.ok(m.troisActions.length>=1&&m.troisActions.length<=3);m.troisActions.forEach((a,i)=>{assert.equal(a.ordre,i+1);assert.ok(a.preuve&&a.source);});
  assert.match(m.troisActions[0].action,/feuille de Laurent/);
  const f2=m.fiches.find(f=>f.garageId==='2');if(f2)assert.ok(f2.vigilance.some(v=>/Règlement en retard : 300 €/.test(v)));
  const f1=m.fiches.find(f=>f.garageId==='1');assert.equal(f1.resume.ca12,'9 000 € HT');assert.equal(f1.resume.encours,'0 € HT');
  const f3=m.fiches.find(f=>f.garageId==='3');assert.equal(f3.resume.ca12,'non disponible');assert.ok(f3.informationsManquantes.some(x=>/CA EBP non disponible/.test(x)));assert.ok(f3.informationsManquantes.some(x=>/Marge non disponible/.test(x)));
  assert.ok(m.fiches.every(f=>f.questions.length>=3));assert.match(m.transition,/sans supposer les sentiments/);assert.match(m.avertissement,/aucune remise/i);
  assert.ok(!JSON.stringify(m).match(/\d+ ?%\s*de remise|garanti/i),'aucune promesse commerciale');
});
test('matin : passage de Laurent non tenable signalé dans l’action prioritaire',()=>{
  const m=CC.preparerMatin({jour:'2026-12-01',plan:{ordre:[{garageId:'1',nom:'A',laurent:true,type:'client',debut:'09:00'}],nonPlanifies:[{garageId:'2',obligatoire:true}]},clients:cl,finance:()=>null});
  assert.match(m.troisActions[0].action,/ATTENTION : 1 ne tiennent pas, décision de Laurent requise/);
});
test('soir : prévu/réalisé, relances des absents, passages non faits signalés à Laurent, rien d’envoyé',async()=>{
  const p=await plan();const o=p.ordre;const reel=[{garageId:o[0].garageId,arriveeS:o[0].debutS+2400,finS:o[0].debutS+2400+o[0].duree*2,resultat:'vu'},{garageId:o[1].garageId,arriveeS:o[1].debutS,finS:o[1].debutS,resultat:'absent'}];
  let J=T.nouveauJournal();for(let i=0;i<2;i++)J=T.journaliser(J,{type:'absent',garageId:o[1].garageId});
  const b=CC.bilanSoir({jour:'2026-12-01',plan:p,reel,journal:J});
  assert.equal(b.prevuRealise.vus,1);assert.equal(b.prevuRealise.absents,1);assert.ok(b.relances.some(r=>r.garageId===o[1].garageId&&/absent/.test(r.action)));
  assert.ok(b.difficultes.some(d=>/min d’écart|au lieu de/.test(d)));assert.ok(b.ajustementsProposes.every(a=>/à valider/.test(a.application)));
  if(o.length>2)assert.ok(b.relances.some(r=>/Laurent non réalisé/.test(r.action)||/non réalisée/.test(r.action)));
  assert.equal(b.resultatsCommerciaux.devisEnvoyes,'non disponible (à saisir)');assert.equal(b.memoire.donneesInventees,0);
  assert.throws(()=>CC.bilanSoir({jour:'x',plan:null}));
});
test('objectif 20 000 € : base inconnue sans EBP, trajectoire indicative sinon, jamais inventée',()=>{
  const sans=CC.suivreObjectif({mois:{},aujourdhui:'2026-12-01'});assert.equal(sans.statut,'BASE_INCONNUE');assert.equal(sans.jalonsLineaires,undefined);assert.equal(sans.moisRestants,3);
  const o=CC.suivreObjectif({mois:{'2026-10':600000,'2026-11':800000},aujourdhui:'2026-12-01'});
  assert.equal(o.statut,'TRAJECTOIRE_INDICATIVE');assert.equal(o.dernierMoisCents,800000);assert.equal(o.ecartCents,1200000);assert.equal(o.multiple,2.5);assert.equal(o.jalonsLineaires.at(-1).objectifCents,2000000);assert.equal(o.jalonsLineaires.length,3);assert.match(o.note,/aucune garantie/);
});
