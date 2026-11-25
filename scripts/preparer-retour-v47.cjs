'use strict';
// Kit local, jamais publié par ce script. Aucun accès aux bases du navigateur.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const REFERENCE='15358121354f9cf050d4f90e51a7b87272af78f9';
function prepare(destination){
  if(fs.existsSync(destination))throw Error('La destination doit être inexistante : aucun fichier ne sera remplacé.');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'odicolor-kit-'));
  try{
    const archive=path.join(temp,'reference.tar');
    cp.execFileSync('git',['archive','--format=tar','--output='+archive,REFERENCE],{cwd:root});
    fs.mkdirSync(destination,{recursive:true});
    cp.execFileSync('tar',['-xf',archive,'--no-same-owner','--no-same-permissions','-C',destination]);
    for(const file of ['sauvegarde-locale.js','recuperation-v47.js','recuperation-v47.html'])fs.copyFileSync(path.join(root,file),path.join(destination,file),fs.constants.COPYFILE_EXCL);
    const files={};
    const walk=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,item.name);if(item.isDirectory())walk(f);else files[path.relative(destination,f).split(path.sep).join('/')]=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}};
    walk(destination);
    fs.writeFileSync(path.join(destination,'kit-manifest.json'),JSON.stringify({reference:REFERENCE,usage:'Copie vers une destination vierge uniquement ; garder la base v2 source.',files},null,2)+'\n',{flag:'wx'});
    return {destination,reference:REFERENCE,files:files};
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
if(require.main===module){const destination=path.resolve(process.argv[2]||path.join(os.tmpdir(),'odicolor-retour-v47-'+Date.now()));console.log(JSON.stringify(prepare(destination),null,2));}
module.exports={prepare,REFERENCE};
