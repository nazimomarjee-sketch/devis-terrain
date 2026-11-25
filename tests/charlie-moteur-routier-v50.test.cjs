'use strict';
/* Le script de vérification du moteur est testé contre de FAUX serveurs OSRM/VROOM (aucun vrai moteur ici). Ce test valide le script
   et le contrat HTTP ; il ne prouve PAS qu'un vrai OSRM/VROOM d'Île-de-France fonctionne (à exécuter sur la machine cible). */
const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const T=require('../charlie-optimiseur-v50.js'),V=require('../infra/routage/verifier-moteur.cjs');
function serveur(fn){return new Promise(ok=>{const s=http.createServer(fn);s.listen(0,'127.0.0.1',()=>ok(s));});}
const url=(s)=>'http://127.0.0.1:'+s.address().port;
const corps=(q)=>new Promise(ok=>{let b='';q.on('data',d=>b+=d);q.on('end',()=>ok(b));});
function faussOSRM(facteurVitesse=45,facteurRoute=1.3){return serveur((q,r)=>{
  const m=/\/table\/v1\/driving\/([^?]+)/.exec(q.url);if(!m){r.writeHead(404).end();return;}
  const pts=m[1].split(';').map(x=>x.split(',').map(Number)).map(([lng,lat])=>({lat,lng}));
  const dist=pts.map(a=>pts.map(b=>Math.round(T.distanceKm(a,b)*facteurRoute*1000))),dur=dist.map(l=>l.map(d=>Math.round(d/1000/facteurVitesse*3600)));
  r.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({code:'Ok',durations:dur,distances:dist}));});}
function faussVROOM(){return serveur(async(q,r)=>{const req=JSON.parse(await corps(q));
  const v=req.vehicles[0];const jobs=req.jobs;let t=v.time_window[0];const steps=[{type:'start',arrival:t}];
  let pris=false;for(const j of jobs.slice(0,2)){const a=t+1800;steps.push({type:'job',id:j.id,arrival:a,service:j.service});t=a+j.service;}
  for(const b of v.breaks){steps.push({type:'break',id:b.id,arrival:Math.max(t,b.time_windows[0][0]),service:b.service});t=Math.max(t,b.time_windows[0][0])+b.service;}
  steps.push({type:'end',arrival:t+1800});
  r.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({code:0,routes:[{vehicle:1,steps}],unassigned:jobs.slice(2).map(j=>({id:j.id}))}));});}
test('moteur plausible : les 6 secteurs de Laurent sont atteignables et VROOM est accepté',async()=>{
  const o=await faussOSRM(),v=await faussVROOM();
  try{const r=await V.main(url(o),url(v));assert.equal(r.ok,true,r.rapport.join('\n'));
    for(const d of ['77','95','94','93','92','91'])assert.ok(r.rapport.some(l=>l.includes('secteur '+d)&&l.startsWith('OK')),d);}
  finally{o.close();v.close();}
});
test('moteur absurde refusé : vitesse 400 km/h ou durées nulles',async()=>{
  const v=await faussVROOM();
  for(const vit of [400,0.5]){const o=await faussOSRM(vit);try{const r=await V.main(url(o),url(v));assert.equal(r.ok,false,'vitesse '+vit);}finally{o.close();}}
  v.close();
});
test('moteur éteint ou réponse invalide : échec clair, jamais de succès',async()=>{
  const r1=await V.main('http://127.0.0.1:1','http://127.0.0.1:1');assert.equal(r1.ok,false);assert.ok(r1.rapport.some(l=>/OSRM/.test(l)));assert.ok(r1.rapport.some(l=>/VROOM/.test(l)));
  const o=await faussOSRM(),mauvais=await serveur((q,r)=>r.writeHead(200).end('{"code":1}'));
  try{const r2=await V.main(url(o),url(mauvais));assert.equal(r2.ok,false);assert.ok(r2.rapport.some(l=>/VROOM/.test(l)&&l.startsWith('ÉCHEC')));}finally{o.close();mauvais.close();}
});
