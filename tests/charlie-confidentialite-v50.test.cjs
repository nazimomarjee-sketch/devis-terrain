'use strict';
/* Le dépôt est PUBLIC : aucun fichier CHARLIE ne doit contenir de coordonnée réelle (téléphone, e-mail, SIRET, jeton) ni de classeur. */
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const suivis=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean);
const concernes=suivis.filter(f=>/^(charlie-|bureau\/charlie-|infra\/routage\/|scripts\/charlie-|tests\/charlie-|tests\/navigateur\/charlie-|docs\/CHARLIE|docs\/ROUTAGE)/.test(f)&&/\.(js|cjs|mjs|md|html|css|yml|yaml|ps1|sh|json)$/.test(f));
test('aucun classeur ni extraction de données dans le dépôt',()=>{
  assert.deepEqual(suivis.filter(f=>/\.(xlsx|xls|csv)$/i.test(f)&&!/^tests\/fixtures\//.test(f)),[]);
  assert.deepEqual(suivis.filter(f=>/snapshot\.json$|^charlie-tournee-.*\.json$/.test(f)),[]);
});
test('fichiers CHARLIE : pas de téléphone, e-mail, SIRET, jeton ou mot de passe en clair',()=>{
  assert.ok(concernes.length>10,'périmètre inspecté : '+concernes.length);
  const motifs=[[/\b0[1-9](?:[ .]?\d{2}){4}\b/,'téléphone français'],[/\+33\s?[1-9](?:[ .]?\d{2}){4}/,'téléphone +33'],[/[\w.+-]+@[\w-]+\.[\w.]{2,}/,'e-mail'],[/\b\d{14}\b/,'SIRET'],[/\b(?:pat|key)[A-Za-z0-9]{14}\.[a-f0-9]{30,}/,'jeton Airtable'],[/\b(?:sk|ghp|xox[bp])[-_][A-Za-z0-9-]{20,}/,'jeton']];
  const fautes=[];
  for(const f of concernes){const t=fs.readFileSync(path.join(root,f),'utf8');for(const [re,nom] of motifs){const m=re.exec(t);if(m&&!/^tests\//.test(f)||m&&!/0100000|0262|exemple|test/.test(m[0]))fautes.push(f+' : '+nom+' « '+m[0].slice(0,20)+' »');}}
  assert.deepEqual(fautes,[]);
});
