'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const T=require('../charlie-optimiseur-v50.js');const B=require('../bureau/charlie-carte.js');
const cli=(id,nom,lat,lng,extra={})=>({id,nom,priorite:'A',statutCrm:'client',visites:[],ent:{lat,lng},...extra});
async function plan(){
  const r=await T.organiserJournee({clients:[cli(1,'G1',-20.88,55.45),cli(2,'G2',-20.90,55.51),cli(3,'G3',-20.94,55.29)],devis:[],laurent:[{id:1},{id:2}],depart:{lat:-20.8789,lng:55.4481},plage:[28800,61200],
    maintenant:Date.parse('2026-12-01T08:00:00'),ctxFns:{echeance:()=>({pct:999}),relanceDue:()=>null,montantHt:()=>null}});
  return r.plan;
}
test('export Samsung → vue Bureau : même schéma, mêmes visites, kpi cohérents',async()=>{
  const p=await plan();const d={schema:'charlie-tournee/v1',jour:'2026-12-01',plan:{...p,requete:undefined},reel:[{garageId:p.ordre[0].garageId,arriveeS:p.ordre[0].debutS+120,finS:p.ordre[0].finS,resultat:'vu'}],faits:[p.ordre[0].garageId],retires:[],depart:{lat:-20.8789,lng:55.4481}};
  const v=B.vueJournee(JSON.parse(JSON.stringify(d)));
  assert.equal(v.noeuds.length,p.ordre.length);assert.equal(v.kpi.vus,1);assert.equal(v.kpi.restants,p.ordre.length-1);assert.equal(v.kpi.km,p.totaux.km);
  assert.equal(v.bilan.vus,1);assert.ok(v.noeuds.every(n=>n.x>=0&&n.x<=760&&n.y>=0&&n.y<=520));assert.ok(v.depart);
  assert.ok(v.noeuds.some(n=>n.laurent));assert.match(v.trace,/^\d/);
});
test('fichier invalide ou piégé refusé',()=>{
  for(const d of [null,{},{schema:'autre'},{schema:'charlie-tournee/v1'},{schema:'charlie-tournee/v1',plan:{ordre:[{nom:'x',pos:{lat:'a',lng:1}}]}}])assert.throws(()=>B.vueJournee(d));
});
test('projection : un seul point et aucun point ne cassent la carte',()=>{
  assert.deepEqual(B.projeter([],100,100),[]);const p=B.projeter([{lat:-21,lng:55}],760,520);assert.ok(Number.isFinite(p[0].x)&&Number.isFinite(p[0].y));
});
