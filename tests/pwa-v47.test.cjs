'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const html=readFileSync(join(root,'index.html'),'utf8');
const sw=readFileSync(join(root,'sw.js'),'utf8');
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(x=>x[1]);
const css=[...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(x=>x[1]);
const manifest=[...html.matchAll(/<link\s+rel="manifest"\s+href="([^"]+)"/g)].map(x=>x[1]);
const shellBlock=sw.match(/const SHELL=\[([\s\S]*?)\];/);
assert.ok(shellBlock,'Liste SHELL du service worker absente');
const shell=[...shellBlock[1].matchAll(/'([^']+)'/g)].map(x=>x[1].replace(/^\.\//,''));
test('tous les fichiers HTML essentiels existent',()=>{
 for(const p of [...scripts,...css,...manifest])assert.ok(existsSync(join(root,p)),p+' absent');
});
test('tous les fichiers du cache hors ligne existent',()=>{
 for(const p of shell)if(p!=='.')assert.ok(existsSync(join(root,p)),p+' absent');
});
test('toutes les feuilles de style et tous les scripts sont accessibles hors ligne',()=>{
 for(const p of [...scripts,...css,...manifest])assert.ok(shell.includes(p),p+' non inclus dans SHELL');
});
test('pas de doublon dans les ressources hors ligne',()=>{
 assert.equal(new Set(shell).size,shell.length);
});
test('version cache et afficheur préparés pour V47',()=>{
 assert.match(sw,/const CACHE='terrain-v47'/);
 assert.match(readFileSync(join(root,'imports-centralises-v40.js'),'utf8'),/ODICOLOR Solution · v47/);
});
