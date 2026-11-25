const {Coffre}=require('../../local/coffre.js'),fs=require('fs'),os=require('os'),path=require('path');
const d=fs.mkdtempSync(path.join(os.tmpdir(),'cf-')); const kdf={algo:'scrypt',N:2**14,r:8,p:1};
const c=Coffre.creer(d,'Phrase-Fictive-Du-Coffre-2026',{kdf}).coffre;
const gar=Array.from({length:4},(_,i)=>({id:'r'+i,source:'reel',nom:'GARAGE FICTIF '+i,ville:'Goussainville',cp:'95190',adresse:'',tel:'',statut:'prospect',classement:{dep:'95',commune:'Goussainville',insee:'95280',cp:'95190',niveau:'sur',motif:'Commune et code postal concordants'},position:null,caMois:null,potentiel:null}));
const etat={version:2,telephone:{date:'2026-11-06',clients:gar,devis:[]},garagesTelephone:gar,rapport:{lus:4},ebp:{pieces:null,reglements:null,clients:{clients:[{code:'C10',nom:'SARL GARAGE FICTIF DEUX'}],ignorees:[],correspondance:[],lues:3,fichier:'clients.csv'},arrete:'2026-11-07'},decisionsComptes:{version:1,decisions:[{id:'D000001',type:'liaison',auteur:'Vérificateur fictif',codeEbp:'C10',source:'Liaison EBP validée par une personne'}]}};
const N=4000, besoins=['C10','C20','GARAGE FICTIF','Vérificateur fictif','liaison','Phrase-Fictive'];
const n={}; besoins.forEach(b=>n[b]=0); let taille=0, ex=null;
for(let i=0;i<N;i++){ c.ecrire({bureau:etat,enregistreLe:new Date().toISOString()});
  const t=['coffre.odc','coffre.precedent.odc'].map(f=>fs.readFileSync(path.join(d,f),'latin1')).join('\n'); taille=t.length;
  for(const b of besoins){ const k=t.indexOf(b); if(k>=0){ n[b]++; if(b==='C10'&&!ex) ex=t.slice(Math.max(0,k-30),k+33);} } }
console.log('écritures:',N,'| taille lue ≈',taille,'caractères');
for(const b of besoins) console.log(b.padEnd(22),'trouvé dans',n[b],'écritures ('+(100*n[b]/N).toFixed(2)+' %)');
console.log('attendu pour un mot de 3 caractères ≈',(100*taille*Math.pow(1/64,3)).toFixed(2),'%');
console.log('exemple de contexte :',JSON.stringify(ex));
fs.rmSync(d,{recursive:true,force:true});
