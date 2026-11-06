'use strict';
// Réveil du cockpit — démonstration sur données FICTIVES, Chromium, Internet coupé, date figée au 06/11/2026.
// 5 étapes : rien → sauvegarde du téléphone → pièces EBP (12 mois) → échéancier → fichier clients avec famille.
// À chaque étape : quels voyants s'allument, et la Ville LEGO reste intacte.
// Exécution : node tests/bureau-reveil-navigateur.cjs   (captures : CAPTURES=dossier node tests/bureau-reveil-navigateur.cjs)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { chromium } = require('playwright');

const racine = path.resolve(__dirname, '..');
let nav, serveur, origine, dossier;

// Jeu fictif : 6 clients EBP (dont 1 bloqué, 1 inactif), 1 homonyme, 5 prospects. Aucun nom réel.
const CLIENTS = [['C001', 'GARAGE FICTIF ALPHA', 'Massy', '91300', 'Actif', 'Carrosserie'], ['C002', 'GARAGE FICTIF BETA', 'Palaiseau', '91120', 'Actif', 'Mécan'],
  ['C003', 'GARAGE FICTIF GAMMA', 'Orsay', '91400', 'Bloqué', 'Carrosserie'], ['C004', 'GARAGE FICTIF DELTA', 'Évry-Courcouronnes', '91000', 'Actif', 'Carrosserie'],
  ['C005', 'GARAGE FICTIF EPSILON', 'Versailles', '78000', 'Actif', 'Mécan'], ['C006', 'GARAGE FICTIF ANCIEN', 'Massy', '91300', 'Actif', 'Carrosserie']];
const PIECES = [
  ['Devis', 'DV-1', '02/10/2026', 'C001', 'GARAGE FICTIF ALPHA', '1 250,00', ''],
  ['Commande client', 'CC-1', '03/11/2026', 'C001', 'GARAGE FICTIF ALPHA', '1 100,00', 'DV-1'],
  ['Commande client', 'CC-2', '04/11/2026', 'C002', 'GARAGE FICTIF BETA', '480,00', ''],
  ['Facture client', 'FA-2', '05/11/2026', 'C002', 'GARAGE FICTIF BETA', '480,00', 'CC-2'],
  ['Commande client', 'CC-3', '12/09/2026', 'C003', 'GARAGE FICTIF GAMMA', '900,00', ''],
  ['Facture client', 'FA-3', '15/09/2026', 'C003', 'GARAGE FICTIF GAMMA', '900,00', 'CC-3'],
  ...['15/11/2025', '15/01/2026', '15/03/2026', '15/05/2026', '15/07/2026'].map((d, i) => ['Commande client', 'CC-D' + i, d, 'C004', 'GARAGE FICTIF DELTA', '1 500,00', '']),
  ['Commande client', 'CC-E1', '20/10/2026', 'C005', 'GARAGE FICTIF EPSILON', '650,00', ''],
  ['Commande client', 'CC-A0', '10/06/2025', 'C006', 'GARAGE FICTIF ANCIEN', '300,00', '']];
const REGLEMENTS = [['FA-3', '15/10/2026', '', '1 080,00', '1 080,00'], ['FA-2', '05/12/2026', '', '576,00', '576,00']];
const TERRAIN = [['GARAGE FICTIF ALPHA', 'Massy', '91300', 'client'], ['GARAGE FICTIF BETA', 'Palaiseau', '91120', 'client'], ['GARAGE FICTIF GAMMA', 'Orsay', '91400', 'client'],
  ['GARAGE FICTIF DELTA', 'Évry-Courcouronnes', '91000', 'client'], ['GARAGE FICTIF EPSILON', 'Versailles', '78000', 'client'], ['GARAGE FICTIF ANCIEN', 'Massy', '91300', 'client'],
  ['CARROSSERIE FICTIVE DU PARC', 'Palaiseau', '91120', 'prospect'], ['MÉCANIQUE FICTIVE DES ULIS', 'Les Ulis', '91940', 'prospect'],
  ['CARROSSERIE FICTIVE DU LAC', 'Créteil', '94000', 'prospect'], ['PNEUS FICTIFS', 'Nanterre', '92000', 'prospect'], ['GARAGE FICTIF SANS INDICE', 'Massy', '91300', 'prospect']];

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-reveil-'));
  const ecrire = (n, l) => fs.writeFileSync(path.join(dossier, n), Buffer.from(l.map(x => x.join(';')).join('\r\n') + '\r\n', 'latin1'));
  ecrire('clients.csv', [['Code client', 'Raison sociale', 'Ville', 'Code postal', 'Statut du compte', 'Famille client'], ...CLIENTS]);
  ecrire('pieces.csv', [['Type de pièce', 'N° pièce', 'Date', 'Code client', 'Nom du client', 'Montant HT', 'N° pièce d\'origine'], ...PIECES]);
  ecrire('reglements.csv', [['N° facture', 'Date d\'échéance', 'Date de règlement', 'Montant TTC', 'Reste à payer'], ...REGLEMENTS]);
  const clients = TERRAIN.map(([nom, ville, cp, statutCrm], i) => ({ id: i + 1, nom, ville, cp, statutCrm }));
  // Format réel des devis du téléphone (comme tests/fixtures/bureau/telephone-devis-pipeline.json).
  const devis = [{ id: 11, clientId: 1, clientNom: 'GARAGE FICTIF ALPHA', creeLe: '2026-10-02T09:00:00.000Z', statut: 'envoye', lignes: [{ code: 'SYN-1', des: 'ARTICLE FICTIF', q: 100, pu: 125000, r: 0 }] }];
  fs.writeFileSync(path.join(dossier, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', clients, devis }));
  serveur = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), f = path.resolve(racine, '.' + p);
    if (!f.startsWith(racine + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(f));
  });
  await new Promise((r, j) => { serveur.once('error', j); serveur.listen(0, '127.0.0.1', r); });
  origine = 'http://127.0.0.1:' + serveur.address().port;
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await nav?.close(); if (serveur?.listening) await new Promise(r => serveur.close(r)); fs.rmSync(dossier, { recursive: true, force: true }); });

const etats = page => page.$$eval('.reveil .voyant', l => Object.fromEntries(l.map(v => [v.dataset.id, v.dataset.etat])));
const resume = page => page.textContent('.reveil .sous');
async function capturer(page, nom) {
  if (!process.env.CAPTURES) return;
  fs.mkdirSync(process.env.CAPTURES, { recursive: true });
  await page.$eval('.reveil', e => e.querySelectorAll('details').forEach(d => { d.open = true; }));
  await page.addStyleTag({ content: 'header,.entete{position:static!important}' }); // capture seulement : l'en-tête ne masque pas le titre
  await page.locator('.reveil').screenshot({ path: path.join(process.env.CAPTURES, nom + '.png') });
}
async function charger(page, type, f) {
  await page.setInputFiles('#ebp-' + type, path.join(dossier, f));
  await page.waitForSelector('#ebp-' + type + ' >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]');
}

test('réveil du cockpit : 5 étapes, chaque import allume ses voyants, rien n’est inventé', async () => {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: process.env.CAPTURES ? 2 : 1 });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage(), erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-06T09:00:00'));
  try {
    // Étape 0 : rien de chargé → tout est éteint, aucun chiffre affiché.
    await page.goto(origine + '/bureau/index.html#bureau'); await page.waitForSelector('.reveil');
    let e = await etats(page);
    assert.equal(Object.keys(e).length, 21);
    assert.ok(Object.values(e).every(x => x === 'eteint'), 'étape 0 : tout éteint');
    assert.match(await resume(page), /^0 allumé/);
    await capturer(page, 'reveil-0-rien');

    // Étape 1 : sauvegarde du téléphone → la Ville et le terrain s'allument.
    await page.click('#mode'); await page.setInputFiles('#fichier-sauvegarde', path.join(dossier, 'sauvegarde.json'));
    await page.waitForSelector('text=Ancienne sauvegarde V47'); await page.click('#mode');
    await page.evaluate(() => { location.hash = 'ville'; }); await page.waitForSelector('svg[aria-label^="Ville ODICOLOR"]');
    await page.evaluate(() => { location.hash = 'bureau'; }); await page.waitForSelector('.reveil');
    e = await etats(page);
    for (const id of ['ville', 'communes', 'prospects']) assert.equal(e[id], 'allume', id);
    assert.equal(e.couleurs, 'partiel', 'sans EBP : couleurs probables seulement');
    for (const id of ['commandes', 'facture', 'actions', 'echu', 'relies', 'marge']) assert.equal(e[id], 'eteint', id);
    assert.match(await page.textContent('.reveil [data-id="ville"]'), /11 garages/);
    await capturer(page, 'reveil-1-terrain');

    // Étape 2 : pièces EBP → ventes, actions, plan du matin, Ville reliée.
    await charger(page, 'pieces', 'pieces.csv');
    e = await etats(page);
    for (const id of ['commandes', 'facture', 'actions', 'plan', 'signaux', 'devis']) assert.equal(e[id], 'allume', id);
    assert.equal(e.relies, 'allume');
    assert.match(await page.textContent('.reveil [data-id="devis"]'), /1 devis reconnu dans EBP/);
    assert.match(await page.textContent('.reveil [data-id="relies"]'), /6 garages reliés/);
    assert.equal(e.echu, 'eteint', 'sans échéancier : impayé jamais déclaré');
    assert.match(await page.textContent('.reveil [data-id="commandes"]'), /2 commandes ce mois/);
    assert.equal(e.inactifs, 'partiel', 'sans fichier clients : inactifs non repérables, dit clairement');
    await capturer(page, 'reveil-2-pieces');

    // Étape 3 : échéancier → échu et risque de règlement.
    await charger(page, 'reglements', 'reglements.csv');
    e = await etats(page);
    assert.equal(e.echu, 'allume');
    assert.match(await page.textContent('.reveil [data-id="echu"]'), /1 facture échue/);
    await capturer(page, 'reveil-3-reglements');

    // Étape 4 : fichier clients avec famille → 4 couleurs fiables et comptes bloqués.
    await charger(page, 'clients', 'clients.csv');
    e = await etats(page);
    for (const id of ['couleurs', 'bloques']) assert.equal(e[id], 'allume', id);
    assert.match(await page.textContent('.reveil [data-id="bloques"]'), /1 compte/);
    assert.equal(e.inactifs, 'allume');
    assert.match(await page.textContent('.reveil [data-id="inactifs"]'), /· 1 client(?!s)/);
    for (const id of ['marge', 'objectif', 'panier', 'canaux', 'offres', 'supervision', 'essais']) assert.equal(e[id], 'eteint', id + ' : jamais allumé sans sa donnée');
    assert.match(await resume(page), /^14 allumé\(s\) · 0 partiel\(s\) · 7 éteint\(s\) sur 21/);
    await capturer(page, 'reveil-4-clients');

    // La Ville connectée reste la Ville LEGO : personnages, bâtiments, animation.
    await page.evaluate(() => { location.hash = 'ville'; }); await page.waitForSelector('svg[aria-label^="Ville ODICOLOR"]');
    assert.equal(await page.$eval('.agent', x => getComputedStyle(x).animationName), 'balance');
    assert.ok(await page.$$eval('.perso', l => l.length) > 0);
    if (process.env.CAPTURES) await page.screenshot({ path: path.join(process.env.CAPTURES, 'reveil-5-ville.png') });
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
