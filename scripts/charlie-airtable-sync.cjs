#!/usr/bin/env node
'use strict';
/* Lecture SEULE de l'Airtable ODICOLOR pour CHARLIE. Jeton : variable AIRTABLE_TOKEN (jamais en argument, jamais dans le dépôt).
 * Usage : AIRTABLE_TOKEN=... node scripts/charlie-airtable-sync.cjs --base appXXXX --sortie C:\CheminPrive\airtable-snapshot.json
 * Le fichier de sortie contient des données commerciales : il est REFUSÉ s'il est dans le dépôt (dépôt public). */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const A=require('../charlie-airtable-v50.js');
function arg(n){const i=process.argv.indexOf('--'+n);return i>0?process.argv[i+1]:null;}
function dansDepot(chemin){try{const racine=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:__dirname,encoding:'utf8'}).trim();const r=path.relative(racine,path.resolve(chemin));return !r.startsWith('..')&&!path.isAbsolute(r);}catch(e){return false;}}
async function tout(base,table,jeton,fetchImpl=fetch){
  const out=[];let offset=null;
  do{const u='https://api.airtable.com/v0/'+base+'/'+encodeURIComponent(table)+'?pageSize=100'+(offset?'&offset='+encodeURIComponent(offset):'');
    const r=await fetchImpl(u,{headers:{Authorization:'Bearer '+jeton},credentials:'omit',referrerPolicy:'no-referrer'});
    if(!r.ok)throw new Error('Airtable '+table+' : HTTP '+r.status);
    const j=await r.json();out.push(...(j.records||[]));offset=j.offset||null;await new Promise(ok=>setTimeout(ok,250));}while(offset);
  return out;
}
async function main(){
  const base=arg('base'),sortie=arg('sortie'),jeton=process.env.AIRTABLE_TOKEN;
  if(!jeton)throw new Error('AIRTABLE_TOKEN absent (variable d’environnement).');if(!/^app[A-Za-z0-9]{14}$/.test(base||''))throw new Error('--base invalide.');
  if(!sortie)throw new Error('--sortie obligatoire.');if(dansDepot(sortie))throw new Error('Sortie refusée : le fichier serait dans le dépôt public. Choisir un dossier privé.');
  const comptes=A.comptesDepuis(await tout(base,'Comptes',jeton)),tournees=A.tourneesDepuis(await tout(base,'Tournées',jeton));
  const controle=A.controlerSecteurs(tournees,comptes);
  fs.writeFileSync(sortie,JSON.stringify({schema:'charlie-airtable/v1',lu:new Date().toISOString(),comptes,tournees,controle},null,1),{mode:0o600});
  console.log('OK : '+comptes.length+' comptes, '+tournees.length+' journées de Laurent, '+controle.length+' point(s) de contrôle → '+sortie);
}
if(require.main===module)main().catch(e=>{console.error('ÉCHEC : '+e.message);process.exit(1);});
module.exports={tout,dansDepot,main};
