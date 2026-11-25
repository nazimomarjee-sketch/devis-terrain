'use strict';
// Ville LEGO connectée (P1–P5, validées le 07/11/2026) — essai Chromium, date figée, Internet coupé, données fictives.
// Conditions du propriétaire : commandes et facturé jamais confondus ; chiffres justifiés par EBP ; graphisme intact.
// Exécution : node tests/bureau-ville-connectee-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { chromium } = require('playwright');

const racine = path.resolve(__dirname, '..'), F = path.join(__dirname, 'fixtures', 'bureau');
let nav, serveur, origine, dossier;
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-ville-'));
  // Exports EBP fictifs : scénario du jour + 14 mois d'historique, dans un seul fichier (même en-tête).
  const lignes = n => fs.readFileSync(path.join(F, n), 'latin1').trim().split(/\r\n/);
  const pieces = lignes('ebp-pieces.csv'), histo = lignes('ebp-pieces-historique.csv');
  fs.writeFileSync(path.join(dossier, 'pieces.csv'), Buffer.from([...pieces, ...histo.slice(1)].join('\r\n') + '\r\n', 'latin1'));
  const cl = lignes('ebp-clients.csv'), clh = lignes('ebp-clients-historique.csv');
  fs.writeFileSync(path.join(dossier, 'clients.csv'), Buffer.from([...cl, ...clh.slice(1)].join('\r\n') + '\r\n', 'latin1'));
  const tel = [['ALPHA', 'Massy', '91300', 'prospect'], ['BETA', 'Palaiseau', '91120', 'client'], ['DELTA', 'Massy', '91300', 'client'], ['EPSILON', 'Évry-Courcouronnes', '91000', 'client'],
    ['GAMMA', 'Massy', '91300', 'client'], ['OMEGA', 'Massy', '91300', 'client'], ['KAPPA', 'Palaiseau', '91120', 'client'], ['NU', 'Palaiseau', '91120', 'prospect']]
    .map(([n, ville, cp, statutCrm], i) => ({ id: i + 1, nom: 'GARAGE FICTIF ' + n, ville, cp, statutCrm }));
  fs.writeFileSync(path.join(dossier, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', clients: tel, devis: [] }));
  serveur = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), f = path.resolve(racine, '.' + p);
    if (!f.startsWith(racine + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
  });
  await new Promise((r, j) => { serveur.once('error', j); serveur.listen(0, '127.0.0.1', r); });
  origine = 'http://127.0.0.1:' + serveur.address().port;
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await nav?.close(); if (serveur?.listening) await new Promise(r => serveur.close(r)); fs.rmSync(dossier, { recursive: true, force: true }); });

async function villeConnectee(options = {}) {
  const ctx = await nav.newContext(options); await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage(), erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-06T09:00:00'));
  await page.goto(origine + '/bureau/index.html#bureau');
  await page.click('#mode');
  await page.setInputFiles('#fichier-sauvegarde', path.join(dossier, 'sauvegarde.json'));
  await page.waitForSelector('text=Ancienne sauvegarde V47');
  await page.click('#mode');
  for (const [t, f] of [['pieces', path.join(dossier, 'pieces.csv')], ['reglements', path.join(F, 'ebp-reglements.csv')], ['clients', path.join(dossier, 'clients.csv')]]) {
    await page.setInputFiles('#ebp-' + t, f);
    await page.waitForSelector('#ebp-' + t + ' >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]');
  }
  await page.evaluate(() => { location.hash = 'ville'; });
  await page.waitForSelector('svg[aria-label^="Ville ODICOLOR"]');
  return { ctx, page, erreurs };
}

test('chiffres du haut : « Commandes du mois » (jamais « CA »), facturé à part, date de l’export EBP', async () => {
  const { ctx, page, erreurs } = await villeConnectee({ viewport: { width: 1280, height: 1000 } });
  try {
    const k = (await page.textContent('#kpis')).replace(/\s+/g, ' ');
    // Garages de la Ville uniquement : la facture de novembre (700 €) concerne ZETA, client EBP absent du téléphone.
    assert.match(k, /Commandes du mois\s*2\s600\s€\s*EBP du 06\/11\/2026\s*facturé 0\s€/);
    assert.doesNotMatch(k, /CA du mois/);
    assert.match(k, /Risque règlement\s*2/, 'EPSILON (facture échue) et GAMMA (compte bloqué)');
    assert.match(k, /\+ 1 dormant/, 'OMEGA à reconquérir');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('étiquettes et panneau des villes : « cmd » et « Commandé ce mois » justifiés par EBP', async () => {
  const { ctx, page } = await villeConnectee({ viewport: { width: 1280, height: 1000 } });
  try {
    assert.match(await page.textContent('svg[aria-label^="Ville ODICOLOR"]'), /Palaiseau\s*2 cl\. · 1 pr\. · cmd 2\s600\s€/);
    await page.evaluate(() => { [...document.querySelectorAll('.dep')].find(b => /Palaiseau/.test(b.textContent))?.click(); });
    const panneau = (await page.textContent('.panneau')).replace(/\s+/g, ' ');
    assert.match(panneau, /Commandé ce mois\s*EBP/);
  } finally { await ctx.close(); }
});

test('fil d’actions : priorités du plan, dans l’ordre du montant en jeu', async () => {
  const { ctx, page } = await villeConnectee({ viewport: { width: 1280, height: 1000 } });
  try {
    assert.match(await page.textContent('#fil-actions'), /Priorités du jour · plan du Bureau/);
    const evts = await page.locator('.evt b').allTextContents();
    assert.equal(evts[0], 'Relancer le règlement : GARAGE FICTIF EPSILON');
  } finally { await ctx.close(); }
});

test('fiche : commandé et facturé séparés, pièces EBP citées, preuve de l’action', async () => {
  const { ctx, page, erreurs } = await villeConnectee({ viewport: { width: 1280, height: 1000 } });
  try {
    await page.locator('.evt').first().click();
    await page.click('.sous-onglets button[data-k="commandes"]');
    const f = (await page.textContent('.fiche')).replace(/\s+/g, ' ');
    assert.match(f, /Commandé sur 12 mois \(HT\)\s*3 000 €\s*EBP du 06\/11\/2026/);
    assert.match(f, /Facturé sur 12 mois \(HT\)\s*3 000 €/);
    assert.match(f, /Preuve · Relancer le règlement : GARAGE FICTIF EPSILON\s*Facture FA-4002/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('sans export EBP ou en démo : comportement d’origine (« CA du mois » de démo, « Non renseigné » en réel)', async () => {
  const ctx = await nav.newContext(); await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  try {
    await page.goto(origine + '/bureau/index.html#ville');
    assert.match(await page.textContent('#kpis'), /CA du mois\s*28 k€\s*Démo/);
    await page.click('#mode');
    await page.setInputFiles('#fichier-sauvegarde', path.join(dossier, 'sauvegarde.json'));
    await page.waitForSelector('text=Ancienne sauvegarde V47');
    assert.match(await page.textContent('#kpis'), /CA du mois\s*Non renseigné/);
  } finally { await ctx.close(); }
});
