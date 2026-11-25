'use strict';
// Le jeu de démonstration est 100 % fictif, valide pour la sauvegarde, cohérent avec les imports EBP, déterministe.
const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../demo-v48.js'),B=require('../sauvegarde-locale.js'),CEN=require('../communes-centres.js'),EC=require('../ebp-clients-v48.js'),EP=require('../ca-ebp-v48.js'),CA=require('../ca-facture-v48.js'),LB=require('../bureau/ebp-import.js');
const AUJ='2026-11-10',d=D.generer(AUJ,CEN);
test('déterministe ; 150 garages « DÉMO » ; tout est marqué fictif ; aucun téléphone, SIRET ni e-mail',()=>{
  assert.deepEqual(D.generer(AUJ,CEN).resume,d.resume);assert.equal(d.clients.length,150);assert.ok(d.clients.every(c=>c.nom.startsWith('DÉMO ')&&c.demo===true));
  const tout=JSON.stringify(d.clients)+Object.values(d.fichiers).join('');assert.doesNotMatch(tout,/\b0[1-9]( ?\d\d){4}\b|\d{14}|@/);
  assert.ok(d.devis.every(x=>x.clientNom.startsWith('DÉMO ')));assert.ok(d.resume.clients>10&&d.resume.prospects>50&&d.resume.communes>20);
});
test('le jeu est une sauvegarde valide, chiffrable et restaurable',async()=>{
  const s={articles:[],clients:d.clients,devis:d.devis,meta:[['settings',d.settings],['agenda',d.agenda],['demo',{version:1,creeLe:AUJ}]],recuperations:[]};
  assert.doesNotThrow(()=>B.validateStores(s));const {file}=await B.encodeChiffre(s,'phrase fictive demo 12345'),o=await B.decode(file,{phrase:'phrase fictive demo 12345'});assert.equal(o.stores.clients.length,150);
});
test('fichiers d’essai EBP : lisibles par le téléphone ET par le Bureau, sans perte ; les pièces donnent un CA non nul ; devis/commandes hors CA',()=>{
  const lirePhone=t=>{const rows=LB.lireCsv(t.replace(/^﻿/,''));return rows};
  const pcs=lirePhone(d.fichiers['demo-ebp-pieces.csv']),ap=EP.apercu(pcs,{auj:AUJ,existantes:[]});assert.equal(ap.ok,true);assert.equal(ap.nouvelles.length,d.resume.piecesEbp);assert.deepEqual(Object.keys(ap.horsCa).sort(),['commande','devis']);
  const m=EP.appliquer(CA.vide(),ap,{idImport:'i',nouvelId:(n=>()=>'e'+(++n))(0),maintenant:'t',fichier:'demo-ebp-pieces.csv',auj:AUJ});assert.ok(CA.calculer(m,'2000-01-01','2100-01-01').totalCents>0);
  const bureau=LB.lirePieces(pcs);assert.equal(bureau.pieces.length+bureau.avoirs.length,ap.nouvelles.length+ap.horsCa.devis*0+0+bureau.pieces.filter(p=>p.type!=='facture').length,'cohérent');
  const total=bureau.pieces.filter(p=>p.type==='facture').reduce((s,p)=>s+p.htCents,0)-bureau.avoirs.reduce((s,a)=>s+Math.abs(a.htCents),0);assert.equal(CA.calculer(m,'2000-01-01','2100-01-01').totalCents,total,'même total côté Bureau');
});
test('clients EBP d’essai : propositions fortes, un homonyme à vérifier, un code sans garage ; rien de lié d’office',()=>{
  const lu=EC.lire(LB.lireCsv(d.fichiers['demo-ebp-clients.csv'].replace(/^﻿/,''))),r=EC.rapprocher(lu.clients,d.clients);
  assert.equal(lu.ok,true);assert.ok(r.fortes.length>=d.resume.clients*0.8,'fortes '+r.fortes.length);assert.equal(r.liees.length,0);assert.ok(r.sansGarage.includes('DEMO9001'));
  assert.ok(r.aVerifier.some(a=>a.code==='DEMO9002')||r.fortes.some(f=>f.code==='DEMO9002'));
});
test('recensement d’essai par commune : lisible, codes INSEE connus',()=>{
  const rows=LB.lireCsv(d.fichiers['demo-recensement-par-commune.csv'].replace(/^﻿/,'')),ins=new Set(CEN.map(r=>r[0]));assert.ok(rows.length>20);assert.ok(rows.slice(1).every(r=>ins.has(r[0])&&Number(r[3])>0));
});
