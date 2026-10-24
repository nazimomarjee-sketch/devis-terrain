'use strict';
// Exécution : node --test tests/backup-v47.test.cjs
// Aucun réseau, package externe ou donnée réelle nécessaire.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {runInNewContext}=require('node:vm');

const app=readFileSync(join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function verifierSauvegardeLocale(o)');
const end=app.indexOf('// ---------- lien avec le PC',start);
assert.ok(start>0 && end>start,'Le bloc de restauration sécurisée doit exister.');

function mockDb(initial,opts={}){
  let called=0;
  const current={};
  for(const [name,items] of Object.entries(initial))
    current[name]=new Map(items.map(([key,value])=>[key,structuredClone(value)]));
  const db={transaction(names,mode){
    assert.equal(mode,'readwrite');called++;
    const staged={};
    for(const name of names)staged[name]=new Map(current[name]);
    const tx={onabort:null,oncomplete:null,onerror:null,error:null,aborted:false,
      abort(){if(this.aborted)return;this.aborted=true;if(this.onabort)this.onabort();},
      objectStore(name){
        if(!staged[name])throw Error('Magasin absent : '+name);
        return {
          clear(){staged[name].clear();},
          put(item,key){
            if(opts.failOnPut===name)throw Error('Écriture impossible : '+name);
            const id=key===undefined?item.id:key;
            if(id==null)throw Error('Clé absente');
            staged[name].set(id,structuredClone(item));
          }
        };
      }
    };
    queueMicrotask(()=>{
      if(tx.aborted)return;
      for(const name of names)current[name]=staged[name];
      if(tx.oncomplete)tx.oncomplete();
    });
    return tx;
  }};
  return {db,current,get called(){return called}};
}
function helpers(mock){
  return runInNewContext(app.slice(start,end)+
    '\n({verifierSauvegardeLocale,restaurerSauvegardeLocale})',
    {DB:{db:mock.db},SET_DEF:{societe:'Odicolor'},Set,Number,Error,Promise});
}
const original={
  clients:[[1,{id:1,nom:'Garage original',visites:[{date:'2026-10-01'}]}]],
  devis:[[1,{id:1,clientId:1,lignes:[{code:'AB'}]}]],
  meta:[['settings',{societe:'ODICOLOR'}],['pcActions',[{id:'P1'}]]]
};
const valide={
  appli:'devis-terrain',version:1,
  clients:[{id:7,nom:'Garage nouveau',infosTerrain:[{texte:'Visite prévue'}]}],
  devis:[{id:21,clientId:7,lignes:[{code:'V'}]}],
  pcActions:[{id:'A1',statut:'a_faire'}],reglages:{societe:'ODICOLOR'}
};
function refuse(f,mot){
  assert.throws(()=>f(),e=>e&&new RegExp(mot,'i').test(e.message));
}

test('valide une sauvegarde existante',()=>{
  const {verifierSauvegardeLocale}=helpers(mockDb(original));
  assert.deepEqual(JSON.parse(JSON.stringify(verifierSauvegardeLocale(valide))),{garages:1,devis:1});
});
test('refuse origine et format incorrects',()=>{
  const {verifierSauvegardeLocale:v}=helpers(mockDb(original));
  refuse(()=>v({...valide,appli:'autre'}),'ODICOLOR');
  refuse(()=>v({...valide,clients:'faux'}),'ODICOLOR');
});
test('refuse les IDs en double, invalides et données incomplètes',()=>{
  const {verifierSauvegardeLocale:v}=helpers(mockDb(original));
  refuse(()=>v({...valide,clients:[{id:7,nom:'A'},{id:7,nom:'B'}]}),'identifiant');
  refuse(()=>v({...valide,devis:[valide.devis[0],valide.devis[0]]}),'identifiant');
  refuse(()=>v({...valide,clients:[{id:-2,nom:'A'}]}),'identifiant');
  refuse(()=>v({...valide,clients:[{id:1,nom:''}]}),'nom');
  refuse(()=>v({...valide,devis:[{id:2,lignes:null}]}),'lignes');
});
test('n’ouvre aucune transaction si le fichier est invalide',async()=>{
  const m=mockDb(original),{restaurerSauvegardeLocale:r}=helpers(m);
  await assert.rejects(r({...valide,clients:[{id:1,nom:''}]}));
  assert.equal(m.called,0);
  assert.equal(m.current.clients.get(1).nom,'Garage original');
});
test('remplace les garages et devis ensemble, sans perdre les notes importées',async()=>{
  const m=mockDb(original),{restaurerSauvegardeLocale:r}=helpers(m);
  await r(valide);
  assert.equal(m.current.clients.size,1);
  assert.equal(m.current.clients.get(7).infosTerrain[0].texte,'Visite prévue');
  assert.equal(m.current.devis.get(21).clientId,7);
  assert.equal(m.current.clients.has(1),false);
  assert.equal(m.current.meta.get('pcActions')[0].id,'A1');
});
test('en cas d’erreur d’écriture les anciens clients et devis restent intacts',async()=>{
  const m=mockDb(original,{failOnPut:'devis'}),{restaurerSauvegardeLocale:r}=helpers(m);
  await assert.rejects(r(valide),/écriture|transaction|impossible/i);
  assert.equal(m.current.clients.get(1).nom,'Garage original');
  assert.equal(m.current.devis.get(1).clientId,1);
  assert.equal(m.current.clients.has(7),false);
  assert.equal(m.current.devis.has(21),false);
});
