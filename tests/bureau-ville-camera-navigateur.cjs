'use strict';
// Recette dédiée : node --test tests/bureau-ville-camera-navigateur.cjs
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const PAGE='file://'+path.resolve(__dirname,'..','bureau','index.html')+'#ville';
let nav;
before(async()=>{nav=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await nav?.close();});
const largeur=p=>p.locator('#scene > svg').getAttribute('viewBox').then(s=>Number(s.split(/\s+/)[2]));
async function ouvrir(options){
  const ctx=await nav.newContext(options);
  await ctx.route(/^https?:/,r=>r.abort());
  const p=await ctx.newPage(), erreurs=[];
  p.on('pageerror',e=>erreurs.push(e.message));
  await p.goto(PAGE);
  await p.waitForSelector('.ville-camera-commandes');
  return {ctx,p,erreurs};
}
test('PC : zoom animé, retour entier et mode original',async()=>{
  const {ctx,p,erreurs}=await ouvrir({viewport:{width:1440,height:900}});
  try{
    assert.equal(await largeur(p),990);
    await p.getByRole('button',{name:'Caméra immersive',exact:true}).click();
    await p.waitForFunction(()=>Number(document.querySelector('#scene > svg').getAttribute('viewBox').split(/\s+/)[2])<640);
    await p.getByRole('button',{name:'Zoomer',exact:true}).click();
    await p.waitForFunction(()=>Number(document.querySelector('#scene > svg').getAttribute('viewBox').split(/\s+/)[2])<500);
    await p.getByRole('button',{name:'Revenir à la vue entière',exact:true}).click();
    await p.waitForFunction(()=>Number(document.querySelector('#scene > svg').getAttribute('viewBox').split(/\s+/)[2])===990);
    await p.getByRole('button',{name:'Caméra immersive',exact:true}).click();
    assert.equal(await largeur(p),990);
    assert.deepEqual(erreurs,[]);
  }finally{await ctx.close();}
});
test('Samsung émulé : gros boutons, pincement, changement de territoire et mouvement réduit',async()=>{
  const {ctx,p,erreurs}=await ouvrir({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',deviceScaleFactor:2.75});
  try{
    const mode=p.getByRole('button',{name:'Caméra immersive',exact:true});
    assert.ok((await mode.boundingBox()).height>=70);
    await mode.click();
    const avant=await largeur(p);
    assert.ok(avant<990);
    await p.locator('#scene').evaluate(sc=>{
      const r=sc.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      const envoyer=(type,d)=>{const touches=[-d,d].map((a,i)=>new Touch({identifier:i,target:sc,clientX:x+a,clientY:y}));sc.dispatchEvent(new TouchEvent(type,{touches,bubbles:true,cancelable:true}));};
      envoyer('touchstart',30);envoyer('touchmove',60);
      sc.dispatchEvent(new TouchEvent('touchend',{bubbles:true}));
    });
    assert.ok(await largeur(p)<avant);
    const choix=await p.locator('.terr.choisi').getAttribute('aria-label');
    await p.locator('.terr:not(.choisi)').first().dispatchEvent('click');
    assert.notEqual(await p.locator('.terr.choisi').getAttribute('aria-label'),choix);
    assert.equal(await mode.getAttribute('aria-pressed'),'true');
    await p.getByRole('button',{name:'Revenir à la vue entière',exact:true}).click();
    assert.equal(await largeur(p),990);
    assert.deepEqual(erreurs,[]);
  }finally{await ctx.close();}
});
