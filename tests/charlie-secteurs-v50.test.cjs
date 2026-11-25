'use strict';
const {test,before}=require('node:test');const assert=require('node:assert/strict');
const T=require('../charlie-optimiseur-v50.js'),K=require('../carte-v48.js'),CENTRES=require('../communes-centres.js');
before(()=>K.charger(CENTRES));
const H=T.hms,ctxFns={echeance:()=>({pct:999}),relanceDue:()=>null,montantHt:()=>null,placer:(c)=>{const p=K.placer(c);return p&&p.precision?p:null;}};
const palaiseau=(()=>{const r=CENTRES.find(x=>x[0]==='91477');return{lat:r[2],lng:r[3]};})();
// Garages 100 % synthétiques posés sur de vraies communes (centres) de chaque département.
function garages(dep,n,depart=0){
  const rows=CENTRES.filter(r=>r[0].startsWith(dep)&&r[4]).slice(depart,depart+n);
  return rows.map((r,i)=>({id:Number(dep)*100+i+1,nom:'Garage Synthétique '+dep+'-'+(i+1),ville:r[1],cp:r[4].split(' ')[0],priorite:'AB'[i%2],statutCrm:'client',visites:[]}));
}
test('grille du classeur de Laurent : S1 95/77/95/94/93, S2 95/77/95/91-92/93, dates cohérentes avec le cockpit',()=>{
  const g=T.SECTEURS_LAURENT;assert.equal(Object.keys(g).length,10);
  assert.deepEqual(Object.values(g),['95','77','95','94','93','95','77','95','91/92','93']);
  for(const [jour,sec] of Object.entries(g)){const wd=new Date(jour+'T12:00:00Z').getUTCDay();assert.ok(wd>=1&&wd<=5,jour+' jour ouvré');}
  assert.equal(g['2026-12-01'],'77','mardi 1er décembre = secteur 77 (J1 du cockpit)');assert.equal(g['2026-12-10'],'91/92');assert.equal(g['2026-12-14'],undefined,'au-delà de S2 : rien d’extrapolé');
});
test('table de Laurent : tous les secteurs des deux semaines, 91/92 en deux départements',()=>{
  assert.deepEqual(T.secteursLaurent(),['77','91','92','93','94','95']);
  assert.deepEqual(T.secteursDuJour('2026-12-10'),['91','92']);assert.deepEqual(T.secteursDuJour('2026-12-01'),['77']);
  assert.deepEqual(T.secteursDuJour('2026-12-05'),[],'samedi : pas de secteur inventé');
  assert.deepEqual(T.parserSecteurs('99/95'),['95'],'département hors Île-de-France ignoré');
});
test('rattachement par défaut = Massy–Palaiseau et centres disponibles pour les 6 secteurs',()=>{
  assert.ok(T.DEFAUTS.rattachement.insee.includes('91477'));assert.ok(palaiseau.lat>48.6&&palaiseau.lat<48.8);
  for(const d of T.secteursLaurent())assert.ok(CENTRES.some(r=>r[0].startsWith(d)),'centres du '+d);
});
for(const [jour,sect] of Object.entries(T.SECTEURS_LAURENT)){
  test('journée du '+jour+' (secteur '+sect+') : tournée valide depuis Massy–Palaiseau, positions par commune signalées',async()=>{
    const deps=T.parserSecteurs(sect);
    const clients=deps.flatMap((d)=>garages(d,5));
    const laurent=clients.slice(0,4).map(c=>({id:c.id}));
    const r=await T.organiserJournee({clients,devis:[],laurent,secteurs:deps,depart:palaiseau,plage:[H('08:00'),H('17:00')],maintenant:Date.parse(jour+'T08:00:00'),ctxFns});
    assert.ok(['PROPOSITION_A_VALIDER','CONFLIT_A_RESOUDRE'].includes(r.statut),jour+' '+r.statut+' '+(r.erreur||''));
    assert.equal(r.audit.ok,true,JSON.stringify(r.audit.violations));assert.equal(r.validationHumaineRequise,true);
    assert.ok(r.plan.ordre.length>0);const parId=new Map(clients.map(c=>[String(c.id),c]));assert.ok(r.plan.ordre.every(o=>deps.includes(T.departementDe(null,parId.get(o.garageId).cp))),'tous dans le secteur du jour');
    assert.ok(r.plan.alertes.some(a=>/CENTRE DE LEUR COMMUNE/.test(a)),'précision commune signalée');
    for(const l of laurent)assert.ok(r.plan.ordre.some(o=>o.garageId===String(l.id))||r.plan.nonPlanifies.some(n=>n.garageId===String(l.id)),'Laurent '+l.id+' jamais perdu');
    assert.ok(r.trace.find(t=>t.agent==='secteur'));
  });
}
test('hors secteur du jour : non proposé ; garage de Laurent hors secteur conservé avec alerte',async()=>{
  const g95=garages('95',3),g94=garages('94',3),clients=g95.concat(g94);
  const r=await T.organiserJournee({clients,devis:[],laurent:[{id:g94[0].id}],secteurs:['95'],depart:palaiseau,plage:[H('08:00'),H('17:00')],maintenant:0,ctxFns});
  assert.ok(r.exclus.filter(e=>e.raison==='HORS_SECTEUR_DU_JOUR').length===2,'les 2 autres du 94 ne sont pas proposés');
  assert.ok(r.plan.ordre.some(o=>o.garageId===String(g94[0].id)),'visite de Laurent conservée');
  assert.ok(r.plan.alertes.some(a=>/SECTEUR_DIFFERENT/.test(a)));
  assert.ok(!r.plan.ordre.some(o=>o.garageId===String(g94[1].id)));
});
test('adresse GPS vérifiée prioritaire sur le centre de commune',()=>{
  const c={id:1,nom:'G',ville:'Massy',cp:'91300',ent:{lat:48.73,lng:2.27},priorite:'A',visites:[]};
  const {candidats}=T.construireCandidats({clients:[c],devis:[],laurent:[],maintenant:0,ctxFns});
  assert.equal(candidats[0].posQualite,'gps');assert.equal(candidats[0].dep,'91');
  const {candidats:c2}=T.construireCandidats({clients:[{...c,ent:undefined}],devis:[],laurent:[],maintenant:0,ctxFns});
  assert.equal(c2[0].posQualite,'commune');
});
