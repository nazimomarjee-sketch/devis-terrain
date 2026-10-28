'use strict';
// Préparation locale exclusivement : aucun SDK d'hébergement, réseau ou déploiement.
const fs=require('node:fs'),path=require('node:path');
const {prepare}=require('./preparer-validation.cjs');
const {generate}=require('./generer-jeu-synthetique.cjs');
function origin(value){
  const u=new URL(value);
  // Les seuls hôtes autorisés sont des projets Pages distincts : jamais GitHub Pages
  // ni le domaine métier. La disponibilité des noms sera vérifiée après accord.
  if(u.protocol!=='https:'||!/^odicolor-test-[a-z0-9-]+\.pages\.dev$/.test(u.hostname)||u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)
    throw Error('Une origine HTTPS odicolor-test-*.pages.dev sans chemin est requise.');
  return u.origin;
}
const headers='/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-store\n';
async function preparePreview(destination,a,b){
  a=origin(a);b=origin(b);
  if(a===b)throw Error('A et B doivent avoir des origines distinctes.');
  if(fs.existsSync(destination))throw Error('Destination existante : aucun écrasement autorisé.');
  fs.mkdirSync(destination,{recursive:true});
  const runtime=prepare(path.join(destination,'a'));
  prepare(path.join(destination,'b'));
  const portal=path.join(destination,'guide');fs.mkdirSync(portal);
  const dataset=await generate('smoke',path.join(portal,'synthetique'));
  const template=fs.readFileSync(path.join(__dirname,'..','validation','samsung.template.html'),'utf8');
  fs.writeFileSync(path.join(portal,'index.html'),template.replaceAll('__ORIGIN_A__',a).replaceAll('__ORIGIN_B__',b).replaceAll('__RELEASE__',runtime.release));
  for(const folder of ['a','b','guide']){
    fs.writeFileSync(path.join(destination,folder,'_headers'),headers);
    // Évite le fallback SPA de Pages ; le worker conserve sa navigation applicative.
    fs.writeFileSync(path.join(destination,folder,'404.html'),'<!doctype html><html lang="fr"><meta charset="utf-8"><title>Introuvable</title><p>Fichier de test introuvable.</p></html>');
  }
  const result={status:'PREPARE_NON_PUBLIE',origins:{a,b},release:runtime.release,dataset,folders:['guide','a','b']};
  fs.writeFileSync(path.join(destination,'preparation.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
if(require.main===module){
  const [destination,a,b]=process.argv.slice(2);
  if(!destination||!a||!b){console.error('Usage technique : node scripts/preparer-preview-samsung.cjs destination https://odicolor-test-…-a.pages.dev https://odicolor-test-…-b.pages.dev');process.exitCode=1;}
  else preparePreview(path.resolve(destination),a,b).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
}
module.exports={preparePreview,origin};
