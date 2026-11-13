'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const DOSSIER = fs.mkdtempSync(path.join(os.tmpdir(), 'banque-test-'));
process.env.BANQUE_DOSSIER = DOSSIER;
process.env.BANQUE_PORT = '18765';
const B = require('../bureau.cjs');
B.preparer();
test.after(() => fs.rmSync(DOSSIER, { recursive: true, force: true }));

const RELEVE = 'Date;Libellé;Montant\n02/10/2026;VIR SEPA SALAIRE OCT;2 100,00\n05/10/2026;PRLV SEPA NETFLIX.COM;-13,49\n20/10/2026;CB GARAGE DUPONT;-450,00\n';
fs.writeFileSync(path.join(B.F.entree, 'octobre.csv'), RELEVE);
fs.writeFileSync(path.join(DOSSIER, 'secret.csv'), RELEVE);
const autoriser = oui => fs.writeFileSync(B.F.config, JSON.stringify({ detailPourAssistant: oui }));

test('import : aperçu sans écriture, puis enregistrement, puis réimport sans doublon', () => {
  const a = B.executer('importer', { fichier: 'octobre.csv' }, 'test');
  assert.equal(a.enregistre, false);
  assert.deepEqual([a.apercu.nouvelles, a.apercu.totalEntrees, a.apercu.totalSorties], [3, 2100, -463.49]);
  assert.equal(B.lire().ops.length, 0);
  assert.equal(B.executer('importer', { fichier: 'octobre.csv', confirmer: true }, 'test').enregistre, true);
  assert.equal(B.lire().ops.length, 3);
  const encore = B.executer('importer', { fichier: 'octobre.csv', confirmer: true }, 'test');
  assert.deepEqual([encore.apercu.nouvelles, encore.apercu.dejaPresentes], [0, 3]);
  assert.equal(B.lire().ops.length, 3);
});

test('import : impossible de lire un fichier hors du dossier d\'import', () => {
  for (const f of ['../secret.csv', path.join(DOSSIER, 'secret.csv'), '..', 'absent.csv'])
    assert.throws(() => B.executer('importer', { fichier: f }, 'test'), /introuvable|ordinaire/i, f);
});

test('sans autorisation : totaux visibles, libellés et écritures de catégorie refusés', () => {
  autoriser(false);
  const s = B.executer('synthese', {}, 'test');
  assert.deepEqual([s.mois, s.entrees, s.sorties, s.solde], ['2026-10', 2100, -463.49, 1636.51]);
  const visible = JSON.stringify([s, B.executer('etat', {}, 'test'), B.executer('resume', {}, 'test'), B.executer('recurrentes', {}, 'test')]);
  for (const mot of ['NETFLIX', 'GARAGE', 'DUPONT', 'SALAIRE']) assert.equal(visible.includes(mot), false, mot);
  for (const [nom, args] of [['operations', {}], ['regles', {}], ['classer', { id: 'x', categorie: 'Transport' }], ['ajouter_regle', { motCle: 'garage', categorie: 'Transport' }], ['supprimer_regle', { motCle: 'garage' }]])
    assert.throws(() => B.executer(nom, args, 'test'), /libellés désactivé/, nom);
});

test('avec autorisation : lister, classer, créer une règle', () => {
  autoriser(true);
  const l = B.executer('operations', { categorie: 'À classer' }, 'test');
  assert.equal(l.total, 1);
  assert.equal(l.operations[0].libelle, 'CB GARAGE DUPONT');
  assert.throws(() => B.executer('classer', { id: l.operations[0].id, categorie: 'Voitures' }, 'test'), /Catégorie inconnue/);
  B.executer('classer', { id: l.operations[0].id, categorie: 'Loisirs' }, 'test');
  const r = B.executer('ajouter_regle', { motCle: 'garage dupont', categorie: 'Transport' }, 'test');
  assert.equal(r.operationsConcernees, 1);
  assert.equal(B.executer('synthese', {}, 'test').parCategorie.Transport, -450);
  assert.deepEqual(B.executer('regles', {}, 'test').regles, [{ motCle: 'GARAGE DUPONT', categorie: 'Transport' }]);
  autoriser(false);
});

test('aucune action d\'effacement ou de restauration, action inconnue refusée, journal tenu', () => {
  assert.equal(Object.keys(B.ACTIONS).some(n => /effac|supprimer_op|restaur|remplac|vider/i.test(n)), false);
  assert.throws(() => B.executer('__proto__', {}, 'test'), /Action inconnue/);
  assert.throws(() => B.executer('importer', {}, 'test'), /Paramètre manquant/);
  const journal = fs.readFileSync(B.F.journal, 'utf8');
  assert.match(journal, /test\timporter\toctobre\.csv \(enregistré\)/);
  assert.match(journal, /REFUS/);
});

test('fichier de données corrompu : erreur, jamais écrasé', () => {
  const bon = fs.readFileSync(B.F.donnees, 'utf8');
  fs.writeFileSync(B.F.donnees, '{cassé');
  assert.throws(() => B.executer('importer', { fichier: 'octobre.csv', confirmer: true }, 'test'), /illisible/);
  assert.equal(fs.readFileSync(B.F.donnees, 'utf8'), '{cassé');
  fs.writeFileSync(B.F.donnees, bon);
});

test('connecteur MCP : initialisation, liste des outils, appel, refus propre', async () => {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'bureau.cjs'), 'mcp'], { env: process.env });
  const reponses = new Map(); let tampon = '';
  p.stdout.on('data', d => { tampon += d; let i; while ((i = tampon.indexOf('\n')) >= 0) { const m = JSON.parse(tampon.slice(0, i)); tampon = tampon.slice(i + 1); reponses.set(m.id, m); } });
  const appeler = async (id, method, params) => {
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    for (let k = 0; k < 200 && !reponses.has(id); k++) await new Promise(r => setTimeout(r, 10));
    return reponses.get(id);
  };
  try {
    const init = await appeler(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
    assert.equal(init.result.serverInfo.name, 'banque-locale');
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const outils = (await appeler(2, 'tools/list')).result.tools;
    assert.deepEqual(outils.map(o => o.name).sort(), Object.keys(B.ACTIONS).sort());
    assert.equal(outils.find(o => o.name === 'importer').inputSchema.required[0], 'fichier');
    const s = await appeler(3, 'tools/call', { name: 'synthese', arguments: { mois: '2026-10' } });
    assert.equal(JSON.parse(s.result.content[0].text).solde, 1636.51);
    const refus = await appeler(4, 'tools/call', { name: 'operations', arguments: {} });
    assert.equal(refus.result.isError, true);
    assert.equal((await appeler(5, 'inconnue')).error.code, -32601);
  } finally { p.kill(); }
});

test('serveur local : jeton obligatoire, hôte vérifié, écoute sur 127.0.0.1 seulement', async () => {
  const serveur = B.demarrerServeur();
  await new Promise(r => serveur.once('listening', r));
  const jeton = fs.readFileSync(B.F.jeton, 'utf8').trim();
  const req = (methode, chemin, entetes, corps) => new Promise((ok, ko) => {
    const r = http.request({ host: '127.0.0.1', port: 18765, path: chemin, method: methode, headers: entetes || {} }, rep => {
      let t = ''; rep.on('data', d => (t += d)); rep.on('end', () => ok({ code: rep.statusCode, texte: t }));
    });
    r.on('error', ko); r.end(corps);
  });
  try {
    assert.equal(serveur.address().address, '127.0.0.1');
    const page = await req('GET', '/');
    assert.equal(page.code, 200);
    assert.match(page.texte, /http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self';/);
    assert.doesNotMatch(page.texte, /content="[^"]*connect-src 'none'/);
    assert.equal(page.texte.includes(jeton), true);
    assert.equal((await req('GET', '/bureau.cjs')).code, 404);
    assert.equal((await req('GET', '/../donnees.json')).code, 404);
    assert.equal((await req('GET', '/api/donnees')).code, 401);
    assert.equal((await req('GET', '/api/donnees', { Authorization: 'Bearer faux' })).code, 401);
    assert.equal((await req('GET', '/api/donnees', { Authorization: 'Bearer ' + jeton, Host: 'site-malveillant.example' })).code, 403);
    const d = JSON.parse((await req('GET', '/api/donnees', { Authorization: 'Bearer ' + jeton })).texte);
    assert.equal(d.ops.length, 3);
    const a = await req('POST', '/api/action/synthese', { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' }, '{}');
    assert.equal(JSON.parse(a.texte).resultat.solde, 1636.51);
    const invalide = await req('POST', '/api/ops', { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' }, JSON.stringify({ ops: [{ id: 'x', montant: 1.5 }] }));
    assert.equal(invalide.code, 400);
    assert.equal(B.lire().ops.length, 3);
  } finally { serveur.close(); }
});
