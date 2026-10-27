'use strict';
const fs=require('node:fs'),path=require('node:path');
const B=require('../sauvegarde-locale.js');
const profiles={smoke:{clients:3,devis:12,articles:30,photos:3,pdf:2,photoSize:1024,pdfSize:2048},terrain:{clients:2000,devis:10000,articles:20000,photos:200,pdf:6,photoSize:300*1024,pdfSize:5*1024*1024}};
function syntheticPdf(label,size){
  const content='BT /F1 18 Tf 40 750 Td ('+label+') Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>','<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let text='%PDF-1.4\n',offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+o+'\nendobj\n'});
  text+='%'+'.'.repeat(Math.max(0,size-Buffer.byteLength(text)-256))+'\n';
  const xref=Buffer.byteLength(text);text+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return new Blob([text],{type:'application/pdf'});
}
function create(profile='smoke'){
  const p=profiles[profile];if(!p)throw Error('Profil attendu : smoke ou terrain.');
  const date='2026-10-26T09:00:00.000Z';
  const articles=Array.from({length:p.articles},(_,i)=>({code:'SYN-'+String(i+1).padStart(5,'0'),des:'ARTICLE SYNTHETIQUE '+(i+1),pu:1000+i%5000}));
  const clients=Array.from({length:p.clients},(_,i)=>({id:i+1,nom:'GARAGE SYNTHETIQUE '+String(i+1).padStart(4,'0'),tel:'',villeProspection:'ZONE TEST '+i%10,statutCrm:i%2?'client':'prospect',priorite:'B',creeLe:date,
    visites:Array.from({length:20},(_,j)=>({date:'2026-10-'+String(1+j).padStart(2,'0'),res:'vu',note:'VISITE SYNTHETIQUE '+j})),
    infosTerrain:Array.from({length:10},(_,j)=>({id:'note-'+i+'-'+j,nature:'note-commerciale',type:'autre',source:'vendeur',suite:'aucune',statut:'information',creeLe:date,texte:'NOTE SYNTHETIQUE '+i+' / '+j})),
    besoinsProduits:Array.from({length:5},(_,j)=>({id:'besoin-'+i+'-'+j,famille:'Vernis',detail:'BESOIN SYNTHETIQUE '+j,source:'vendeur',suite:'aucun',statut:'traite',creeLe:date})),
    factures:[{id:'facture-'+i,num:'SYN-FACT-'+i,montant:10000+i,echeance:'2026-12-31',date:'2026-10-26',relances:[]}]}));
  const devis=Array.from({length:p.devis},(_,i)=>({id:i+1,uid:'SYN-DEVIS-'+i,clientId:i%p.clients+1,clientNom:clients[i%p.clients].nom,creeLe:date,statut:'brouillon',lignes:[0,1,2].map(j=>{const a=articles[(i+j)%articles.length];return {code:a.code,des:a.des,q:100,pu:a.pu,r:0}}),notes:'DEVIS SYNTHETIQUE ; aucun usage commercial réel'}));
  const meta=[['settings',{societe:'ODICOLOR — SYNTHETIQUE',vendeur:'TEST UNIQUEMENT',indicatif:'33',tva100:850,remiseMax100:6000,objectifs:[100000,100000,100000],objDepart:'2027-01'}],['jeuSynthetique',{profile,date,usage:'TEST UNIQUEMENT'}]];
  for(let i=1;i<=p.photos;i++){
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="'+(i%2?'#D41F2B':'#152334')+'"/><text x="25" y="200" fill="white" font-size="32">PHOTO SYNTHETIQUE '+i+'</text><!--'+'.'.repeat(p.photoSize)+'--></svg>';
    meta.push(['garage-photo-v38:'+i,{blob:new Blob([svg],{type:'image/svg+xml'}),date,origine:'SYNTHETIQUE'}]);
  }
  const index=[];for(let i=1;i<=p.pdf;i++){const id='pdf-synthetique-'+i,blob=syntheticPdf('PDF SYNTHETIQUE '+i,p.pdfSize);index.push({id,nom:id+'.pdf',fournisseur:'FOURNISSEUR SYNTHETIQUE',size:blob.size,date});meta.push(['pdfFournisseur:'+id,{id,nom:id+'.pdf',date,blob}]);}
  meta.push(['pdfFournisseursIndex',index]);
  return {stores:{articles,clients,devis,meta,recuperations:[]},expected:{profile,clients:p.clients,devis:p.devis,articles:p.articles,photos:p.photos,pdf:p.pdf,visites:p.clients*20,notes:p.clients*10,besoins:p.clients*5,factures:p.clients,totalHtCents:devis.reduce((n,d)=>n+d.lignes.reduce((n,l)=>n+l.pu,0),0)}};
}
async function generate(profile,destination){
  const {stores,expected}=create(profile),{file}=await B.encode(stores),bytes=Buffer.from(await file.arrayBuffer());
  fs.mkdirSync(destination,{recursive:true});
  const write=(name,data)=>fs.writeFileSync(path.join(destination,name),data,{flag:'wx'});
  write('jeu-'+profile+'.odicolor',bytes);write('attendus-'+profile+'.json',JSON.stringify({...expected,octets:bytes.length},null,2)+'\n');
  const broken=Buffer.from(bytes);broken[broken.length-1]^=1;write('corrompu-'+profile+'.odicolor',broken);write('tronque-'+profile+'.odicolor',bytes.subarray(0,Math.floor(bytes.length/2)));
  return {...expected,octets:bytes.length,destination};
}
if(require.main===module)generate(process.argv[2]||'smoke',path.resolve(process.argv[3]||'scratch/validation-samsung')).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={create,generate};
