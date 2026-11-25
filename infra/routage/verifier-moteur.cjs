'use strict';
/* Vérifie un moteur routier réel (OSRM + VROOM) pour CHARLIE, secteurs de Laurent depuis Massy–Palaiseau.
 * Usage : node infra/routage/verifier-moteur.cjs [http://127.0.0.1:5000] [http://127.0.0.1:3000]
 * Contrôles : OSRM répond, matrice carrée valide, durées plausibles (route ≥ vol d'oiseau, ≤ 4× et vitesse moyenne 15-110 km/h),
 * une destination par département de Laurent est atteignable ; VROOM renvoie une tournée acceptée par le contrôleur de CHARLIE.
 * Ne détecte PAS un graphe périmé ni le trafic : « temps estimés, trafic temps réel non garanti ». Sortie : code 0 seulement si tout passe. */
const T=require('../../charlie-optimiseur-v50.js'),CENTRES=require('../../communes-centres.js');
const OSRM=(process.argv[2]||'http://127.0.0.1:5000').replace(/\/$/,''),VROOM=(process.argv[3]||'http://127.0.0.1:3000').replace(/\/$/,'');
const f=(cle)=>{const r=CENTRES.find(x=>x[0]===cle||x[1]===cle&&x[0].startsWith(DEP[cle]||''));if(!r)throw new Error('commune '+cle+' absente des centres');return{lat:r[2],lng:r[3],nom:r[1]};};
const DEP={'Ozoir-la-Ferrière':'77','Le Thillay':'95','Créteil':'94','Saint-Denis':'93','Nanterre':'92','Massy':'91'};
// Une commune de référence par secteur (centre de commune, hypothèse de test, pas une adresse de client).
const REF={'77':'Ozoir-la-Ferrière','95':'Le Thillay','94':'Créteil','93':'Saint-Denis','92':'Nanterre','91':'Massy'};
async function main(osrm=OSRM,vroom=VROOM){
  let tout=true;const rap=[];const ok=(c,m)=>{rap.push((c?'OK    ':'ÉCHEC ')+m);if(!c)tout=false;};
  const depart=f('91477'),pts=[depart,...Object.entries(REF).map(([d,i])=>({...f(i),dep:d}))];
  let M=null;
  try{M=await T.matriceOSRM(pts,{base:osrm,fetchImpl:fetch});ok(true,'OSRM répond, matrice '+pts.length+'×'+pts.length+' valide ('+M.source+')');}catch(e){ok(false,'OSRM : '+e.message);}
  if(M){
    pts.slice(1).forEach((p,i)=>{const d=M.distances[0][i+1]/1000,t=M.durees[0][i+1]/3600,v=T.distanceKm(depart,p);
      const plausible=d>=v*0.95&&d<=v*4+1&&(v<2||(d/t>=15&&d/t<=110));
      ok(plausible,'Massy–Palaiseau → secteur '+p.dep+' ('+p.nom+') : '+d.toFixed(1)+' km, '+Math.round(t*60)+' min (vol d’oiseau '+v.toFixed(1)+' km)');});
    ok(M.durees[0].every((x,i)=>i===0?x===0:x>0),'durées positives hors diagonale');
  }
  try{
    const prep=T.preparerVisites({depart:[depart.lng,depart.lat],plage:[8*3600,17*3600],pauses:[{creneau:[12*3600,14*3600],duree:2700}],
      visites:pts.slice(1,4).map((p,i)=>({id:'V'+i,position:[p.lng,p.lat],duree:1800,priorite:50,creneaux:[[8*3600,17*3600]],obligatoire:false}))});
    const r=await fetch(vroom+'/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(prep.requete)});
    if(!r.ok)throw new Error('VROOM HTTP '+r.status);
    const v=T.verifierProposition(prep,await r.json());ok(true,'VROOM : tournée acceptée par le contrôleur ('+v.ordre.length+' visite(s), '+v.nonPlanifies.length+' non planifiée(s))');
  }catch(e){ok(false,'VROOM : '+e.message);}
  return{ok:tout,rapport:rap};
}
if(require.main===module)main().then(r=>{console.log(r.rapport.join('\n'));process.exit(r.ok?0:1);}).catch(e=>{console.error('ÉCHEC '+e.message);process.exit(1);});
module.exports={main,REF};
