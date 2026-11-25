'use strict';
// Lot 9 : sécurité de l'import et contrôle des données, dans Chromium. Données FICTIVES, Internet coupé.
// 1-3 : Bureau ouvert directement (fichier). 4 : application locale réelle (coffre chiffré), programme arrêté BRUTALEMENT
// pendant l'enregistrement puis relancé. Exécution : node tests/bureau-lot9-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'bureau', 'index.html');
const SERVEUR = path.resolve(__dirname, '..', 'local', 'serveur.js'), MDP = 'Phrase-Fictive-Du-Coffre-2026';
let nav, dossier;
const ENT = 'Type;N° pièce;Date;Code client;Client;Montant HT;N° de pièce d’origine';
before(async () => {
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-lot9-'));
  const w = (n, l) => fs.writeFileSync(path.join(dossier, n), l.join('\n') + '\n');
  w('pieces-a.csv', [ENT, 'Devis;DE-1;02/11/2026;C1;GARAGE FICTIF HT;1 000,00;', 'Commande;CC-1;03/11/2026;C1;GARAGE FICTIF HT;1 000,00;DE-1', 'Facture;FA-1;05/11/2026;C1;GARAGE FICTIF HT;1 000,00;CC-1', 'Facture;FA-2;06/11/2026;;SANS CODE FICTIF;300,00;']);
  w('pieces-b.csv', [ENT, 'Facture;FA-9;07/11/2026;C1;GARAGE FICTIF HT;5 000,00;']);
  w('pieces-mauvaises.csv', [ENT, 'Facture;FA-7;03/11/2026;C1;G;1,00;', 'Facture;FA-8;hier;C1;G;1,00;', 'Facture;FA-9;?;C1;G;1,00;']);
  w('reglements.csv', ['N° facture;Échéance;Date de règlement;Montant TTC;Reste à payer', 'FA-1;05/12/2026;10/11/2026;1 200,00;0,00']);
  w('clients.csv', ['Code client;Nom;Ville;Code postal', 'C1;GARAGE FICTIF HT;Massy;91300']);
});
after(async () => { await nav?.close(); fs.rmSync(dossier, { recursive: true, force: true }); });
async function ouvrirFichier(hash = '#import-ebp') {
  const ctx = await nav.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true }); // résolution courante d'un PC portable Windows
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-14T10:00:00'));
  await p.goto(PAGE + hash); return { ctx, p, erreurs };
}
async function allerPieces(p) {
  await p.waitForSelector('[data-assistant="etape-arrete"]');
  await p.fill('[data-assistant="arrete"]', '2026-11-14'); await p.dispatchEvent('[data-assistant="arrete"]', 'change');
  for (let i = 0; i < 2; i++) await p.click('[data-assistant="suivant"]'); await p.waitForSelector('[data-assistant="etape-pieces"]');
}
const nbLots = p => p.evaluate(() => window.OdicolorBureau.exporter().ebp.pieces ? window.OdicolorBureau.exporter().ebp.pieces.consolidation.imports : 0);

test('1. double validation rapide : un seul import ; plus de la moitié des lignes rejetées : confirmation exigée', async () => {
  const { ctx, p, erreurs } = await ouvrirFichier();
  try {
    await allerPieces(p);
    await p.setInputFiles('[data-assistant="fichier-pieces"]', path.join(dossier, 'pieces-a.csv')); await p.waitForSelector('[data-assistant="apercu-pieces"]');
    await p.dblclick('[data-assistant="valider"]'); // deux pressions très rapprochées
    await p.waitForSelector('[data-assistant="bilan-pieces"] .badge');
    assert.equal(await nbLots(p), 1, 'un seul import enregistré malgré le double clic');
    await p.setInputFiles('[data-assistant="fichier-pieces"]', path.join(dossier, 'pieces-mauvaises.csv')); await p.waitForSelector('[data-assistant="apercu-pieces"]');
    assert.match(await p.textContent('[data-assistant="anomalies"]'), /À confirmer.*Plus de la moitié des lignes sont rejetées \(2 sur 3\)/);
    assert.equal(await p.isDisabled('[data-assistant="valider"]'), true, 'bloqué tant que non confirmé');
    await p.check('[data-assistant="confirmer"]'); assert.equal(await p.isDisabled('[data-assistant="valider"]'), false);
    await p.click('[data-assistant="annuler"]'); assert.equal(await nbLots(p), 1);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('2. import classique (boutons du Bureau) : plus de la moitié rejetée ⇒ refusé, données précédentes conservées', async () => {
  const { ctx, p, erreurs } = await ouvrirFichier('#bureau');
  try {
    await p.waitForSelector('#ebp-pieces', { state: 'attached' });
    await p.setInputFiles('#ebp-pieces', path.join(dossier, 'pieces-a.csv')); await p.waitForSelector('#ebp-pieces >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]');
    const avant = await p.evaluate(() => JSON.stringify(window.OdicolorBureau.exporter().ebp.pieces.pieces));
    await p.setInputFiles('#ebp-pieces', path.join(dossier, 'pieces-mauvaises.csv'));
    await p.waitForSelector('text=Plus de la moitié des lignes rejetées');
    assert.equal(await p.evaluate(() => JSON.stringify(window.OdicolorBureau.exporter().ebp.pieces.pieces)), avant);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('3. EBP → Commerce → Pilotage → Contrôle : HT facturé et TTC encaissé distincts ; code client manquant = non attribué, CA non nul', async () => {
  const { ctx, p, erreurs } = await ouvrirFichier();
  const t = s => p.textContent(s).then(x => x.replace(/\s+/g, ' ').trim());
  try {
    await allerPieces(p);
    await p.click('[data-assistant="precedent"]'); await p.setInputFiles('[data-assistant="fichier-clients"]', path.join(dossier, 'clients.csv')); await p.click('[data-assistant="valider"]'); await p.waitForSelector('[data-assistant="bilan-clients"] .badge');
    await p.click('[data-assistant="suivant"]');
    await p.setInputFiles('[data-assistant="fichier-pieces"]', path.join(dossier, 'pieces-a.csv')); await p.waitForSelector('[data-assistant="apercu-pieces"]');
    assert.match(await t('[data-assistant="anomalies"]'), /1 pièce\(s\) sans code client/);
    await p.click('[data-assistant="valider"]'); await p.waitForSelector('[data-assistant="bilan-pieces"] .badge');
    await p.click('[data-assistant="suivant"]'); await p.setInputFiles('[data-assistant="fichier-reglements"]', path.join(dossier, 'reglements.csv')); await p.click('[data-assistant="valider"]'); await p.waitForSelector('[data-assistant="bilan-reglements"] .badge');
    await p.evaluate(() => { location.hash = '#pilotage'; }); await p.waitForSelector('[data-pilotage="fait"]');
    assert.match(await t('[data-pilotage="fait"]'), /^1 300,00 € HT/, 'facture sans code client comptée dans le total');
    assert.match(await t('[data-pilotage="fait"]'), /À vérifier : .*non attribuée/);
    await p.evaluate(() => { location.hash = '#commerce'; }); await p.waitForSelector('[data-commerce="ca"]');
    assert.match(await t('[data-commerce="ca"]'), /^1 300,00 € HT/, 'même CA HT que le Pilotage');
    await p.evaluate(() => { location.hash = '#controle'; }); await p.waitForSelector('[data-controle="tableau"]');
    const c = await t('[data-controle="tableau"]');
    assert.match(c, /CA facturé HT du mois \(factures − avoirs\).*À vérifier/); assert.match(c, /Échéancier des règlements \(TTC\)/); assert.match(c, /jamais additionnées ni comparées/);
    assert.match(c, /Sauvegarde du téléphone.*Manquant/); assert.match(await t('[data-controle="resume"]'), /\d+ fiable\(s\) · \d+ à vérifier · \d+ manquante\(s\)/);
    const largeur = await p.evaluate(() => document.documentElement.scrollWidth); assert.ok(largeur <= 1366, 'aucun défilement horizontal sur un écran PC 1366 px : ' + largeur);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

// Application locale réelle : panne pendant l'enregistrement.
function lancer(d) {
  return new Promise((ok, ko) => { const pr = spawn(process.execPath, [SERVEUR, '--dossier', d, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] }); let j = '';
    pr.stdout.on('data', x => { j += x; const m = /prête : (http:\/\/127\.0\.0\.1:\d+\/)/.exec(j); if (m && !pr.adresse) { pr.adresse = m[1]; ok(pr); } }); pr.stderr.on('data', x => { j += x; });
    pr.on('exit', () => { if (!pr.adresse) ko(new Error('Arrêt au démarrage : ' + j)); }); setTimeout(() => ko(new Error('Démarrage trop long')), 15000); });
}
const tuer = pr => new Promise(r => { pr.once('exit', r); pr.kill('SIGKILL'); });
const generation = p => p.evaluate(() => Number(document.documentElement.dataset.coffreGeneration || 0));
const attendreEnregistrement = (p, g) => p.waitForFunction(x => Number(document.documentElement.dataset.coffreGeneration || 0) > x, g);
async function pageLocale(adresse) {
  const ctx = await nav.newContext({ viewport: { width: 1366, height: 900 } }); await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); await p.clock.setFixedTime(new Date('2026-11-14T10:00:00')); await p.goto(adresse); return { ctx, p, erreurs };
}

test('4. panne pendant l’enregistrement (programme arrêté) : alerte affichée ; au redémarrage, la dernière version COMPLÈTE est retrouvée', async () => {
  const coffre = path.join(dossier, 'coffre-panne'); let pr = await lancer(coffre), ctx, p, erreurs;
  try {
    ({ ctx, p, erreurs } = await pageLocale(pr.adresse));
    await p.waitForSelector('#f-creer:not([hidden])'); await p.fill('#nouveau-mdp', MDP); await p.fill('#nouveau-mdp2', MDP); await p.click('#creer');
    await p.waitForSelector('#s-secours-cle:not([hidden])'); await p.check('#note'); await p.click('#continuer'); await p.waitForSelector('html[data-coffre="pret"]');
    await p.evaluate(() => { location.hash = 'import-ebp'; }); await allerPieces(p);
    await p.waitForFunction(() => Number(document.documentElement.dataset.coffreGeneration || 0) >= 1); // enregistrement de la date d'export terminé
    await p.setInputFiles('[data-assistant="fichier-pieces"]', path.join(dossier, 'pieces-a.csv')); await p.waitForSelector('[data-assistant="apercu-pieces"]');
    const g = await generation(p); await p.click('[data-assistant="valider"]'); await attendreEnregistrement(p, g); // enregistrement de l'import A
    const versionA = await p.evaluate(() => JSON.stringify(window.OdicolorBureau.exporter().ebp.pieces.pieces.map(x => x.no).sort()));
    await tuer(pr); // le programme s'arrête : l'enregistrement suivant échouera
    await p.setInputFiles('[data-assistant="fichier-pieces"]', path.join(dossier, 'pieces-b.csv')); await p.waitForSelector('[data-assistant="apercu-pieces"]');
    await p.click('[data-assistant="valider"]');
    await p.waitForSelector('#coffre-alerte:not([hidden])'); assert.match(await p.textContent('#coffre-alerte'), /Enregistrement dans le coffre impossible/);
    await ctx.close();
    pr = await lancer(coffre); ({ ctx, p, erreurs } = await pageLocale(pr.adresse));
    await p.waitForSelector('#f-ouvrir:not([hidden])'); await p.fill('#mdp', MDP); await p.click('#valider'); await p.waitForSelector('html[data-coffre="pret"]');
    await p.waitForFunction(() => !!window.OdicolorBureau.exporter().ebp.pieces);
    assert.equal(await p.evaluate(() => JSON.stringify(window.OdicolorBureau.exporter().ebp.pieces.pieces.map(x => x.no).sort())), versionA, 'version A intacte, ni partielle ni mélangée');
    assert.deepEqual(erreurs, []);
  } finally { try { await ctx?.close(); } catch (e) {} await tuer(pr).catch(() => {}); }
});
