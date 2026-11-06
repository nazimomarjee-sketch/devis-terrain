'use strict';
// Construction déterministe ; aucune dépendance, aucun réseau, aucune publication.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function build(root=path.resolve(__dirname,'..'),check=false){
const read=p=>fs.readFileSync(path.join(root,p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const template=read('pwa/index.template.html').toString(),recovery=read('pwa/recuperation-v47.template.html').toString();
const matches=html=>[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1]).filter(p=>!p.includes(':'));
const fixed=['icon-192.png','icon-512.png','icon-maskable-512.png','logo-96.png','odicolor-logo-officiel.png','xlsx.mini.min.js','barlow-condensed-latin-700-normal.woff2','barlow-condensed-latin-800-normal.woff2'];
const inputs=[...new Set([...matches(template),...matches(recovery),...fixed])].filter(p=>p!=='pwa-client.js').sort();
const raw=Object.fromEntries(inputs.map(p=>[p,read(p)]));
const release=hash(Buffer.concat([...Object.entries(raw).map(([p,b])=>Buffer.from(p+'\0'+hash(b)+'\n')),read('pwa/index.template.html'),read('pwa/recuperation-v47.template.html'),read('pwa/client.template.js'),read('pwa/worker-template.js'),read('scripts/build-pwa.cjs')]));
const urls=Object.fromEntries(Object.entries(raw).map(([p,b])=>[p,p+'?odicolor='+hash(b)]));
const client=read('pwa/client.template.js').toString().replace('__ODICOLOR_RELEASE__',JSON.stringify(release)).replace('__ODICOLOR_ASSETS__',JSON.stringify(urls));
raw['pwa-client.js']=Buffer.from(client);
function html(source){return source.replace(/<(script|link|img)\b[^>]*>/g,tag=>tag.replace(/(src|href)="([^"]+)"/,(_m,attr,p)=>{
  if(!raw[p])throw Error('Ressource inconnue : '+p);
  const h=hash(raw[p]),integrity=(tag.startsWith('<script')||/rel="stylesheet"/.test(tag))?' integrity="sha256-'+Buffer.from(h,'hex').toString('base64')+'" crossorigin="anonymous"':'';
  return attr+'="'+p+'?odicolor='+h+'"'+integrity;
}));}
const generated={'pwa-client.js':client,'index.html':html(template),'recuperation-v47.html':html(recovery)};
for(const [p,b]of Object.entries(generated))raw[p]=Buffer.from(b);
const manifest={id:release,assets:Object.entries(raw).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,b])=>({path:p,sha256:hash(b)}))};
generated['pwa-release.json']=JSON.stringify(manifest,null,2)+'\n';
generated['sw.js']="'use strict';\n/* Généré par scripts/build-pwa.cjs. Ne pas modifier directement. */\nconst RELEASE_MANIFEST="+JSON.stringify(manifest)+';\n'+read('pwa/worker-template.js').toString();
for(const [p,text]of Object.entries(generated)){
  if(check){if(!fs.existsSync(path.join(root,p))||read(p).toString()!==text)throw Error(p+' périmé : exécuter node scripts/build-pwa.cjs');}
  else fs.writeFileSync(path.join(root,p),text);
}
console.log((check?'Construction vérifiée : ':'Construction préparée : ')+release.slice(0,12)+' · '+manifest.assets.length+' ressources.');
return manifest;
}
if(require.main===module)build(undefined,process.argv.includes('--check'));
module.exports=build;
