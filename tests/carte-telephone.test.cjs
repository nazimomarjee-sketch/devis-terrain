'use strict';
const {test,before}=require('node:test'),assert=require('node:assert/strict');
const K=require('../carte-v48.js'),CENTRES=require('../communes-centres.js');
before(()=>K.charger(CENTRES));
const INSEE=new Map(CENTRES.map(r=>[r[0],r]));
test('référentiel : 1 267 communes (1 266 + alias 93059) des HUIT départements d’Île-de-France, centres plausibles, codes uniques',()=>{
  assert.equal(CENTRES.length,1267);assert.equal(new Set(CENTRES.map(r=>r[0])).size,1267);
  assert.deepEqual([...new Set(CENTRES.map(r=>r[0].slice(0,2)))].sort(),['75','77','78','91','92','93','94','95']);
  for(const [c,n,lat,lng] of CENTRES){assert.ok(lat>48.0&&lat<49.3&&lng>1.4&&lng<3.6,c+' '+n+' '+lat+','+lng);}
  assert.equal(INSEE.get('91174')[1],'Corbeil-Essonnes');assert.ok(INSEE.has('93059'));
});
test('placement : GPS prioritaire ; sinon commune+CP ; CP à commune unique ; accents/casse ignorés ; sinon non placé avec motif',()=>{
  assert.equal(K.placer({ent:{lat:48.5,lng:2.4},ville:'x'}).precision,'gps');
  const a=K.placer({ville:'CORBEIL ESSONNES',cp:'91100'});assert.deepEqual([a.precision,a.insee],['commune','91174']);
  const b=K.placer({ville:'Évry',cp:'91000'});assert.equal(b.precision,'commune');
  const cpUnique=CENTRES.find(r=>r[4]&&!r[4].includes(' ')&&CENTRES.filter(q=>q[4].split(' ').includes(r[4])).length===1),c=K.placer({ville:'faute de frappe',cp:cpUnique[4]});assert.deepEqual([c.precision,c.insee],['commune',cpUnique[0]],'CP à commune unique → placé');
  assert.equal(K.placer({ville:'faute de frappe',cp:'91100'}).precision,null,'CP partagé + nom inconnu → non placé');
  const d=K.placer({ville:'Lieu inconnu',cp:'99999'});assert.equal(d.precision,null);assert.match(d.motif,/non reconnue/);
  assert.match(K.placer({}).motif,/Ni commune ni code postal/);
});
test('catégories : client, prospect prioritaire (A/B), prospect, refus',()=>{
  assert.deepEqual(['client','prospect_prio','prospect','refus'],[K.categorie({statutCrm:'client'}),K.categorie({priorite:'B'}),K.categorie({}),K.categorie({conv:'refus',priorite:'A'})]);
});
function jeu(n){const rows=CENTRES.filter(r=>r[4]);return Array.from({length:n},(_,i)=>{const r=rows[(i*7)%rows.length];return {id:i+1,nom:'G'+i,ville:r[1],cp:r[4].split(' ')[0],statutCrm:i%5===0?'client':'prospect',priorite:i%9===0?'A':''}})}
test('conservation : aucun garage perdu ni compté deux fois, vue large ou zoomée ; non placés listés à part',()=>{
  const cl=jeu(2000);cl.push({id:9001,nom:'SANS LIEU'});const prep=K.preparer(cl,null);
  assert.equal(prep.points.length+prep.nonPlaces.length,2001);assert.equal(prep.nonPlaces.length,1);assert.equal(prep.approx,2000);
  const vue=K.cadrer(prep,360,640),r=K.regrouper(prep,vue);
  assert.equal(r.groupes.reduce((s,g)=>s+g.n,0),2000,'chaque garage est dans exactement un groupe');assert.ok(r.groupes.length<400,'groupes: '+r.groupes.length);
  const z=K.zoomer(vue,40,180,320),rz=K.regrouper(prep,z);assert.ok(rz.visibles<2000&&rz.visibles>=0);
});
test('filtre et marché : seuls les garages filtrés ; le marché est agrégé par commune et distinct',()=>{
  const prep=K.preparer(jeu(300),{communes:[['91174',120],['91228',30],['00000',5]]});assert.equal(prep.marche.length,2,'commune inconnue ignorée');
  const vue=K.cadrer(prep,360,640,true),r=K.regrouper(prep,vue,{filtre:p=>p.cat==='client',marche:true});
  assert.equal(r.visibles,60);assert.equal(r.groupes.reduce((s,g)=>s+g.marche,0),150);
  assert.equal(K.regrouper(prep,vue,{marche:false}).groupes.reduce((s,g)=>s+g.marche,0),0);
});
test('performance : 10 000 garages, regroupement < 60 ms (moyenne de 20 gestes)',()=>{
  const prep=K.preparer(jeu(10000),null);let vue=K.cadrer(prep,412,800);const t=process.hrtime.bigint();
  for(let i=0;i<20;i++){vue=K.deplacer(K.zoomer(vue,i%2?1.2:1/1.2,200,400),3,-2);K.regrouper(prep,vue);}
  const ms=Number(process.hrtime.bigint()-t)/1e6/20;assert.ok(ms<60,'moyenne '+ms.toFixed(1)+' ms');
});
test('zoom centré sur le doigt : le point sous le doigt ne bouge pas ; plafonds de zoom',()=>{
  const v={cx:100,cy:-5000,kmParPx:0.1,largeur:400,hauteur:800},z=K.zoomer(v,2,300,200);
  const avant=[(300-200)*v.kmParPx+v.cx,(200-400)*v.kmParPx+v.cy],apres=[(300-200)*z.kmParPx+z.cx,(200-400)*z.kmParPx+z.cy];
  assert.ok(Math.abs(avant[0]-apres[0])<1e-9&&Math.abs(avant[1]-apres[1])<1e-9);assert.equal(K.zoomer(v,1e9,0,0).kmParPx,0.01);assert.equal(K.zoomer(v,1e-9,0,0).kmParPx,2);
});

test('commune fusionnée : un garage de Pierrefitte-sur-Seine est compté dans Saint-Denis (93066), comme dans le Bureau',()=>{
  const p=K.placer({ville:'Pierrefitte-sur-Seine',cp:'93380'});assert.deepEqual([p.precision,p.insee,p.commune],['commune','93066','Saint-Denis']);
});
