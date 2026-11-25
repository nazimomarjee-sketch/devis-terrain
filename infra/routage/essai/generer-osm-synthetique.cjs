'use strict';
/* Génère un petit réseau routier 100 % SYNTHÉTIQUE (étoile de routes « primary » depuis Palaiseau vers une commune de référence par secteur).
 * Sert UNIQUEMENT à vérifier la chaîne OSRM (extract → partition → customize → routed → verifier-moteur) sans télécharger l'Île-de-France.
 * Ce n'est PAS la carte réelle : les durées obtenues n'ont aucune valeur commerciale. Usage : node generer-osm-synthetique.cjs sortie.osm */
const fs=require('node:fs'),CENTRES=require('../../../communes-centres.js');
const sortie=process.argv[2]||'synthetique.osm';
const pt=(insee)=>{const r=CENTRES.find(x=>x[0]===insee);return{lat:r[2],lng:r[3]};};
const HUB=pt('91477'),REFS=['91377','77350','95612','94028','93066','92050'].map(pt);
let id=1;const noeuds=[],ways=[];const nouveau=(p)=>{const n={id:id++,lat:p.lat,lng:p.lng};noeuds.push(n);return n;};
const hub=nouveau(HUB);
const distKm=(a,b)=>{const R=6371,r=x=>x*Math.PI/180,dLa=r(b.lat-a.lat),dLo=r(b.lng-a.lng),x=Math.sin(dLa/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
for(const R of REFS){
  const n=Math.max(2,Math.ceil(distKm(HUB,R)/1.5)),liste=[hub];
  for(let i=1;i<n;i++)liste.push(nouveau({lat:HUB.lat+(R.lat-HUB.lat)*i/n,lng:HUB.lng+(R.lng-HUB.lng)*i/n}));
  liste.push(nouveau(R));ways.push(liste);
}
let x='<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6" generator="synthetique">\n';
for(const n of noeuds)x+=`<node id="${n.id}" version="1" timestamp="2026-01-01T00:00:00Z" uid="1" user="x" changeset="1" lat="${n.lat}" lon="${n.lng}"/>\n`;
ways.forEach((w,i)=>{x+=`<way id="${i+1}" version="1" timestamp="2026-01-01T00:00:00Z" uid="1" user="x" changeset="1">\n`+w.map(n=>`<nd ref="${n.id}"/>`).join('')+'\n<tag k="highway" v="primary"/>\n</way>\n';});
x+='</osm>\n';fs.writeFileSync(sortie,x);console.log('OSM synthétique écrit :',sortie,noeuds.length,'nœuds,',ways.length,'routes');
