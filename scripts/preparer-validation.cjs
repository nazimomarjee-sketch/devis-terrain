'use strict';
// Dossier de fichiers statiques pour test local USB, sans serveur ni publication.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),build=require('./build-pwa.cjs');
function prepare(destination){
  const manifest=build(root,true);
  if(fs.existsSync(destination))throw Error('Choisis une destination inexistante. Aucun dossier existant n’est remplacé.');
  fs.mkdirSync(destination,{recursive:true});
  for(const file of [...manifest.assets.map(e=>e.path),'sw.js','pwa-release.json']){const out=path.join(destination,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(root,file),out,fs.constants.COPYFILE_EXCL);}
  return {destination,release:manifest.id,resources:manifest.assets.length};
}
if(require.main===module){try{console.log(JSON.stringify(prepare(path.resolve(process.argv[2]||'scratch/site-validation-'+Date.now())),null,2))}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={prepare};
