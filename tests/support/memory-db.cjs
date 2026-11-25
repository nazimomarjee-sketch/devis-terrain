'use strict';
// Simulation pour tests de rollback ; les tests navigateur utilisent IndexedDB réel.
const {setImmediate}=require('node:timers');
module.exports=function memoryDb(initial,options={}){
  const current={};let calls=0;
  for(const n of ['articles','clients','devis','meta','recuperations'])current[n]=new Map((initial[n]||[]).map(([k,v])=>[k,structuredClone(v)]));
  const db={transaction(names,mode){
    calls++;names=Array.isArray(names)?names:[names];
    const staged=Object.fromEntries(names.map(n=>[n,new Map([...current[n]].map(([k,v])=>[k,structuredClone(v)]))]));
    let pending=0,ended=false,scheduled=false;
    const tx={error:null,abort(){if(ended)return;ended=true;setImmediate(()=>tx.onabort?.());},objectStore(name){
      if(!staged[name])throw Error('Magasin hors transaction');
      const request=fn=>{const req={};pending++;setImmediate(()=>{if(ended)return;try{req.result=fn();req.onsuccess?.({target:req});}catch(e){req.error=e;tx.error=e;req.onerror?.({target:req});tx.onerror?.({target:tx});tx.abort();}pending--;finish();});return req;};
      const write=(v,key,add)=>{
        if(options.failSync===name)throw Error('Écriture synchrone impossible');
        return request(()=>{if(mode!=='readwrite')throw Error('Lecture seule');if(options.failAsync===name)throw Error('Écriture asynchrone impossible');const k=key===undefined?v.code??v.id:key;if(k===undefined)throw Error('Clé absente');if(add&&staged[name].has(k))throw Error('Clé déjà présente');staged[name].set(k,structuredClone(v));return k;});
      };
      return {getAll:()=>request(()=>[...staged[name].keys()].sort().map(k=>structuredClone(staged[name].get(k)))),getAllKeys:()=>request(()=>[...staged[name].keys()].sort()),get:k=>request(()=>structuredClone(staged[name].get(k))),clear:()=>request(()=>staged[name].clear()),put:(v,k)=>write(v,k,false),add:(v,k)=>write(v,k,true)};
    }};
    function finish(){if(pending||ended||scheduled)return;scheduled=true;setImmediate(()=>{scheduled=false;if(pending||ended)return;if(options.failCommit){tx.error=Error('Quota : commit impossible');tx.abort();return;}ended=true;if(mode==='readwrite')for(const n of names)current[n]=staged[n];tx.oncomplete?.();});}
    finish();return tx;
  }};
  return {db,current,get calls(){return calls;}};
};
