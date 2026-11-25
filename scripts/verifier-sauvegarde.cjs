'use strict';
// Diagnostic local réservé aux jeux synthétiques ; aucune écriture dans IndexedDB.
const fs=require('node:fs'),crypto=require('node:crypto'),B=require('../sauvegarde-locale.js');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function inspect(stores){
  const meta=new Map(stores.meta),jeu=meta.get('jeuSynthetique');
  if(!jeu||jeu.usage!=='TEST UNIQUEMENT')throw Error('Ce vérificateur est réservé aux sauvegardes du générateur synthétique.');
  const blobs=new WeakMap();
  async function canonical(v){
    if(v instanceof Blob){if(!blobs.has(v))blobs.set(v,digest(Buffer.from(await v.arrayBuffer())));return ['blob',v.type,v.size,blobs.get(v),typeof File!=='undefined'&&v instanceof File?v.name:null];}
    if(v instanceof Date)return ['date',v.toISOString()];
    if(v===undefined)return ['undefined'];
    if(Array.isArray(v)){const out=[];for(const x of v)out.push(await canonical(x));return ['array',out];}
    if(v&&typeof v==='object'){const out=[];for(const k of Object.keys(v).sort())out.push([k,await canonical(v[k])]);return ['object',out];}
    return v;
  }
  const business={articles:stores.articles.slice().sort((a,b)=>a.code<b.code?-1:1),clients:stores.clients.slice().sort((a,b)=>a.id-b.id),devis:stores.devis.slice().sort((a,b)=>a.id-b.id),meta:stores.meta.slice().sort(([a],[b])=>a<b?-1:1)};
  const photos=stores.meta.filter(([k])=>k.startsWith('garage-photo-v38:')).length;
  const pieces=[];for(const [key,value]of stores.meta)if(value&&value.blob instanceof Blob)pieces.push({key,type:value.blob.type,size:value.blob.size,sha256:digest(Buffer.from(await value.blob.arrayBuffer()))});pieces.sort((a,b)=>a.key<b.key?-1:1);
  const count=k=>stores.clients.reduce((n,c)=>n+(c[k]||[]).length,0);
  const total=stores.devis.reduce((n,d)=>n+d.lignes.reduce((n,l)=>n+Number((BigInt(l.q)*BigInt(l.pu)*BigInt(10000-l.r)*2n+1000000n)/2000000n),0),0);
  return {profile:jeu.profile,clients:stores.clients.length,devis:stores.devis.length,articles:stores.articles.length,photos,pdf:(meta.get('pdfFournisseursIndex')||[]).length,visites:count('visites'),notes:count('infosTerrain'),besoins:count('besoinsProduits'),factures:count('factures'),totalHtCents:total,businessSha256:digest(Buffer.from(JSON.stringify(await canonical(business)))),pieces};
}
async function verify(file,expectedFile){
  const bytes=fs.readFileSync(file),backup=await B.decode(new Blob([bytes])),report=await inspect(backup.stores);
  if(expectedFile){const expected=JSON.parse(fs.readFileSync(expectedFile,'utf8'));for(const k of Object.keys(report))if(Object.hasOwn(expected,k)&&JSON.stringify(expected[k])!==JSON.stringify(report[k]))throw Error('Différence avec le manifeste synthétique : '+k);}
  return {...report,archives:(backup.stores.recuperations||[]).length,fileSha256:digest(bytes),octets:bytes.length};
}
if(require.main===module)verify(process.argv[2],process.argv[3]).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={inspect,verify};
