'use strict';
/* « Un seul cerveau » : le cœur de ce dépôt doit être identique à celui du cockpit (src/coeur/charlie-optimiseur-v50.cjs).
   L'empreinte du cockpit est recopiée ici à chaque resynchronisation volontaire ; un écart = cœur modifié d'un seul côté. */
const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const EMPREINTE_COCKPIT='f328bbcb7a3c6c605c81fb7dec82cd3d42232d3c133b503e65e9ec2e4efb0593';
test('le cœur de devis-terrain est identique au cœur déployé dans le cockpit CHARLIE',()=>{
  const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..','charlie-optimiseur-v50.js'))).digest('hex');
  assert.equal(sha,EMPREINTE_COCKPIT,'resynchroniser : node scripts/resynchroniser-coeur.mjs (dépôt cockpit) puis mettre à jour EMPREINTE_COCKPIT');
});
