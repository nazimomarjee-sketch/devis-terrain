'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const S=require('../charlie-sync-v50.js');
const mem=()=>{const m=new Map();return{get:async k=>m.has(k)?JSON.parse(m.get(k)):undefined,put:async(k,v)=>{m.set(k,JSON.stringify(v));},m};};
// Faux serveur CHARLIE : versions par jour, 409 si baseVersion périmée (même contrat que docs/CHARLIE_TOURNEE_API.md).
function serveur(){const jours={},recu=[];let panne=null;
  const f=async(url,o)=>{recu.push({url,methode:o.method,auth:o.headers.Authorization,corps:o.body&&JSON.parse(o.body)});
    if(panne==='reseau')throw new Error('réseau coupé');if(panne)return{ok:false,status:panne,json:async()=>({})};
    const m=/\/api\/tournee\/jour\/([\d-]+)$/.exec(url);
    if(m&&o.method==='GET'){const j=jours[m[1]];return{ok:true,status:200,json:async()=>j?{jour:m[1],version:j.version,etat:j.etat,majLe:'x'}:{jour:m[1],version:0,etat:null,majLe:null}};}
    if(m&&o.method==='PUT'){const b=JSON.parse(o.body),j=jours[m[1]]||{version:0,etat:null};
      if(b.baseVersion!==j.version)return{ok:false,status:409,json:async()=>({version:j.version,etat:j.etat})};
      jours[m[1]]={version:j.version+1,etat:b.etat};return{ok:true,status:200,json:async()=>({version:j.version+1})};}
    return{ok:true,status:200,json:async()=>({})};};
  return{f,jours,recu,panne:(p)=>{panne=p;}};}
const cfg=(url='https://charlie.exemple.test')=>async()=>({url,jeton:'JETON-SYNTH',appareil:'samsung'});
const etat=(extra={})=>({jour:'2026-12-01',plan:{valideLe:'2026-12-01T07:00:00Z',ordre:[]},reel:[],faits:[],retires:[],maj:'2026-12-01T07:00:00Z',...extra});
test('non configuré ou URL non sécurisée : rien n’est envoyé',async()=>{
  const s=serveur(),st=mem();
  const a=S.creer({config:async()=>null,stockage:st,fetchImpl:s.f});assert.equal((await a.pousser('2026-12-01',etat())).statut,'non_configure');assert.equal(s.recu.length,0);assert.equal((await a.statut()).enAttente,1,'gardé pour plus tard');
  const b=S.creer({config:cfg('http://charlie.exemple.test'),stockage:mem(),fetchImpl:s.f});assert.equal((await b.pousser('2026-12-01',etat())).statut,'non_configure');assert.equal(s.recu.length,0);
  assert.equal(S.urlAutorisee('http://127.0.0.1:8080'),true);assert.equal(S.urlAutorisee('https://x.y'),true);assert.equal(S.urlAutorisee('ftp://x'),false);assert.equal(S.urlAutorisee('n’importe quoi'),false);
});
test('envoi normal : version suivie, jeton en en-tête seulement',async()=>{
  const s=serveur(),c=S.creer({config:cfg(),stockage:mem(),fetchImpl:s.f});
  assert.equal((await c.pousser('2026-12-01',etat())).statut,'synchronise');assert.equal(s.jours['2026-12-01'].version,1);
  await c.pousser('2026-12-01',etat({faits:['5']}));assert.equal(s.jours['2026-12-01'].version,2);assert.deepEqual(s.jours['2026-12-01'].etat.faits,['5']);
  assert.ok(s.recu.every(r=>r.auth==='Bearer JETON-SYNTH'&&!r.url.includes('JETON')));assert.equal((await c.statut()).etat,'synchronise');
});
test('hors ligne : file persistante, un seul état par jour, reprise automatique',async()=>{
  const s=serveur(),st=mem(),c=S.creer({config:cfg(),stockage:st,fetchImpl:s.f});
  s.panne('reseau');
  assert.equal((await c.pousser('2026-12-01',etat({faits:['1']}))).statut,'hors_ligne');await c.pousser('2026-12-01',etat({faits:['1','2']}));await c.observation({garageId:'1',resultat:'vu',dureeS:1800,jour:'2026-12-01'});
  const q=await c.statut();assert.equal(q.etat,'en_attente');assert.equal(q.enAttente,2,'un seul état + une observation');
  s.panne(null);const r=await c.vider();assert.equal(r.statut,'synchronise');assert.deepEqual(s.jours['2026-12-01'].etat.faits,['1','2'],'dernier état seulement');
  assert.ok(s.recu.some(x=>/observation$/.test(x.url)));assert.equal((await c.statut()).enAttente,0);
});
test('erreur serveur 5xx : on s’arrête et on réessaie ; 4xx : mis de côté et signalé, la file continue',async()=>{
  const s=serveur(),c=S.creer({config:cfg(),stockage:mem(),fetchImpl:s.f});
  s.panne(503);assert.equal((await c.pousser('2026-12-01',etat())).statut,'hors_ligne');assert.equal((await c.statut()).enAttente,1);
  s.panne(400);const r=await c.vider();assert.equal(r.statut,'synchronise');const st=await c.statut();assert.equal(st.enAttente,0);assert.equal(st.conflits,1,'rejet signalé, pas silencieux');
});
test('conflit 409 : fusion sans perte des visites des deux appareils',async()=>{
  const s=serveur();const bureau={jour:'2026-12-01',plan:{valideLe:'2026-12-01T07:00:00Z'},reel:[{garageId:'7',finS:40000,resultat:'vu',arriveeS:38000}],faits:['7'],retires:[],maj:'2026-12-01T10:00:00Z'};
  s.jours['2026-12-01']={version:4,etat:bureau};
  const c=S.creer({config:cfg(),stockage:mem(),fetchImpl:s.f});
  const local=etat({reel:[{garageId:'3',finS:36000,resultat:'absent',arriveeS:36000}],faits:['3'],retires:['3']});
  const r=await c.pousser('2026-12-01',local);assert.equal(r.statut,'synchronise');assert.equal(r.fusions.length,1);
  const e=s.jours['2026-12-01'].etat;assert.deepEqual(e.faits.sort(),['3','7']);assert.deepEqual(e.reel.map(x=>x.garageId),['3','7'],'ordre chronologique, rien perdu');assert.equal(s.jours['2026-12-01'].version,5);assert.equal((await c.statut()).conflits,1);
});
test('fusion : plan le plus récent gardé, proposition caduque supprimée, doublons de visite écartés',()=>{
  const a=etat({plan:{valideLe:'2026-12-01T09:00:00Z',ordre:['nouveau']},reel:[{garageId:'1',finS:100,resultat:'vu'}]}),b=etat({plan:{valideLe:'2026-12-01T07:00:00Z',ordre:['ancien']},reel:[{garageId:'1',finS:100,resultat:'vu'},{garageId:'2',finS:200,resultat:'vu'}],proposition:{genereLe:'2026-12-01T08:00:00Z'}});
  const f=S.fusionnerEtats(a,b);assert.deepEqual(f.plan.ordre,['nouveau']);assert.equal(f.reel.length,2);assert.equal(f.proposition,undefined,'proposition plus ancienne que le plan validé');
  assert.deepEqual(S.fusionnerEtats(null,b).faits,b.faits);assert.equal(S.fusionnerEtats(a,null).plan.ordre[0],'nouveau');
  const g=S.fusionnerEtats(etat({proposition:{genereLe:'2026-12-01T12:00:00Z',x:1}}),etat({proposition:{genereLe:'2026-12-01T11:00:00Z',x:2}}));assert.equal(g.proposition.x,1);
});
test('tirer : version retenue pour le prochain envoi ; coupure → hors_ligne',async()=>{
  const s=serveur();s.jours['2026-12-02']={version:9,etat:etat({jour:'2026-12-02'})};
  const c=S.creer({config:cfg(),stockage:mem(),fetchImpl:s.f});const r=await c.tirer('2026-12-02');assert.equal(r.statut,'ok');assert.equal(r.version,9);
  await c.pousser('2026-12-02',etat({jour:'2026-12-02',faits:['4']}));assert.equal(s.jours['2026-12-02'].version,10,'part de la version tirée, pas de 409');
  s.panne('reseau');assert.equal((await c.tirer('2026-12-02')).statut,'hors_ligne');
});
