'use strict';
// Génère communes-centres.js à partir des réponses de l'API publique geo.api.gouv.fr (Licence Ouverte) :
//   GET /departements/{dep}/communes?fields=nom,code,centre,codesPostaux&format=json&geometry=centre
// Usage : node scripts/generer-centres-communes.cjs fichier91.json fichier95.json ...
// Données publiques (centres de communes) : aucune donnée de client ni de registre d'établissements.
const fs=require('fs');
const rows=[];for(const f of process.argv.slice(2))for(const c of JSON.parse(fs.readFileSync(f,'utf8'))){
  if(!c.centre||!c.centre.coordinates)throw new Error('centre absent : '+c.code);
  const [lng,lat]=c.centre.coordinates;rows.push([c.code,c.nom,Math.round(lat*1e4)/1e4,Math.round(lng*1e4)/1e4,(c.codesPostaux||[]).join(' ')]);}
// Code présent dans le fichier officiel Sirene mais fusionné dans Saint-Denis (93066) dans le découpage actuel : centre approximatif ajouté à la main (≈ 48,967 N ; 2,361 E), à remplacer si une source officielle le fournit.
if(!rows.some(r=>r[0]==='93059'))rows.push(['93059','Pierrefitte-sur-Seine',48.967,2.361,'93380']);
rows.sort((a,b)=>a[0]<b[0]?-1:1);
if(new Set(rows.map(r=>r[0])).size!==rows.length)throw new Error('code commune répété');
fs.writeFileSync(__dirname+'/../communes-centres.js',"'use strict';\n/* Centres des communes des départements 91, 95, 94, 77, 93 — généré par scripts/generer-centres-communes.cjs.\n   Source : API Découpage administratif (geo.api.gouv.fr, Licence Ouverte) le "+new Date().toISOString().slice(0,10)+". Colonnes : code INSEE, nom, latitude, longitude, codes postaux.\n   Position = centre de la commune (approximation), JAMAIS l'adresse d'un garage. */\nconst ODICOLOR_COMMUNES_CENTRES="+JSON.stringify(rows)+";\nif (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_COMMUNES_CENTRES;\n");
console.log(rows.length+' communes');
