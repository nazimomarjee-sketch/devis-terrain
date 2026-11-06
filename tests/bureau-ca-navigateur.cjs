'use strict';
// CA facturé HT du mois dans le Bureau : accueil (objectif), Île-de-France, département, commune, garage (aperçu et fiche).
// DONNÉES FICTIVES, Internet coupé. Exécution : node tests/bureau-ca-navigateur.cjs   (captures : CAPTURES=dossier …)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs');
const { chromium, devices } = require('playwright');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'bureau', 'index.html');
let nav;
before(async () => { nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); });
after(async () => { await nav?.close(); });
async function ouvrir(hash = '', contexte = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await nav.newContext({ ...contexte, deviceScaleFactor: process.env.CAPTURES ? 2 : (contexte.deviceScaleFactor || 1) });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-06T10:00:00'));
  await p.goto(PAGE + hash); await p.waitForSelector('#kpis .kpi', { state: 'attached' });
  return { ctx, p, erreurs };
}
const capture = async (p, nom) => { if (process.env.CAPTURES) { fs.mkdirSync(process.env.CAPTURES, { recursive: true }); await p.screenshot({ path: path.join(process.env.CAPTURES, nom + '.png') }); } };
// Référence : le calcul fait dans la page (mêmes données fictives que Ma Ville).
const ref = (p, mon = '') => p.evaluate(mon => { const d = FICTIF_IDF.avecDemoBureau(BureauLogique.garagesDemo(2026)), m = ModeleCommune.construire(d);
  const r = CaFacture.calculer({ pieces: d.piecesEbp, avoirs: d.avoirsEbp, clientsEbp: d.clientsEbp, modele: m, arrete: d.arrete, aujourdhui: d.arrete, monCommercial: mon });
  return { r, e: CaFacture.euros, f: Object.fromEntries([['global', r.totalCents], ['idf', r.idfCents], ['na', r.nonAttribue.cents], ['perso', r.personnel.totalCents]].map(([k, v]) => [k, CaFacture.euros(v)])),
    dep: Object.fromEntries(Object.entries(r.parDep).map(([k, v]) => [k, CaFacture.euros(v)])), com: Object.fromEntries(Object.entries(r.parCommune).map(([k, v]) => [k, CaFacture.euros(v)])) }; }, mon);
const txt = (p, s) => p.textContent(s).then(t => t.replace(/\s+/g, ' ').trim());

test('1. accueil du Bureau : CA facturé HT global, objectif saisi, progression, CA personnel, fraîcheur', async () => {
  const { ctx, p, erreurs } = await ouvrir('#bureau');
  try {
    await p.waitForSelector('#bloc-ca');
    const R = await ref(p);
    assert.equal(await txt(p, '[data-ca="global"]'), R.f.global.replace(/\s+/g, ' '));
    assert.equal(await txt(p, '[data-ca="non-attribue"]'), R.f.na.replace(/\s+/g, ' '));
    assert.match(await txt(p, '#bloc-ca'), /pas en temps réel/);
    assert.equal(await p.$$eval('[data-ca="progression"]', l => l.length), 0, 'pas d’objectif saisi : pas de fausse progression');
    assert.match(await txt(p, '[data-ca="personnel"]'), /Non renseigné/);
    // Objectif FICTIF pour l'essai (l'objectif réel se saisit dans le Bureau, jamais dans le code).
    await p.fill('[data-ca="objectif"] , input[data-ca="objectif"]', '50000'); await p.press('input[data-ca="objectif"]', 'Enter');
    await p.waitForSelector('[data-ca="progression"]');
    const pct = Math.round(R.r.totalCents / 5000000 * 100);
    assert.match(await txt(p, '[data-ca="progression"]'), new RegExp('^' + pct + ' % · reste '));
    assert.equal(await p.$eval('.ca-jauge', j => j.getAttribute('aria-valuenow')), String(pct));
    await p.fill('input[data-ca="commercial"]', 'REP-A'); await p.press('input[data-ca="commercial"]', 'Enter');
    await p.waitForFunction(() => !/Non renseigné/.test(document.querySelector('[data-ca="personnel"]').textContent));
    assert.equal(await txt(p, '[data-ca="personnel"]'), (await ref(p, 'REP-A')).f.perso.replace(/\s+/g, ' '));
    await capture(p, 'ca-1-accueil');
    await p.evaluate(() => localStorage.clear());
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('2. Ma Ville : Île-de-France → département → commune → garage → fiche, mêmes montants, sans double comptage', async () => {
  const { ctx, p, erreurs } = await ouvrir('#communes');
  try {
    await p.waitForSelector('.vc-dep [data-ca="idf"]');
    const R = await ref(p), n = s => s.replace(/\s+/g, ' ');
    assert.equal(await txt(p, '[data-ca="idf"]'), n(R.f.idf));
    assert.equal(await txt(p, '.vc-dep-na [data-ca="non-attribue"]'), n(R.f.na), 'non attribué affiché à part');
    assert.equal(await txt(p, '.vc-dep-na [data-ca="global"]'), n(R.f.global));
    for (const [d, v] of Object.entries(R.dep)) assert.match(await txt(p, `[data-ca="dep-${d}"]`), new RegExp(n(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), 'département ' + d);
    await capture(p, 'ca-2-ile-de-france');
    await p.click('.vc-dep-ligne[href="#communes-95"]'); await p.waitForSelector('.vc-dep [data-ca="dep-95"]');
    assert.equal(await txt(p, '.vc-ca [data-ca="dep-95"]'), n(R.dep['95']));
    const cents = await p.evaluate(() => [...document.querySelectorAll('.vc-dep-ligne')].map(a => a.getAttribute('href').slice(9)));
    const somme = cents.reduce((s, insee) => s + (R.r.parCommune[insee] || 0), 0);
    assert.equal(somme, R.r.parDep['95'], 'somme des communes = département');
    await p.click('.vc-dep-ligne[href="#commune-95280"]'); await p.waitForSelector('.vc-hote .vc-ca');
    assert.match(await txt(p, '.vc-hote .vc-ca'), new RegExp(n(R.com['95280']).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await p.click('.vc-ligne:has(.vc-nom:text-is("CARROSSERIE FICTIVE F"))');
    assert.match(await txt(p, '.vc-ap-ca'), /novembre 2026 : 400,00 € HT/, 'facture 480 € moins avoir 80 €');
    await capture(p, 'ca-3-commune-garage');
    await p.click('.vc-apercu .vc-ouvrir'); await p.waitForSelector('#couche-fiche .fiche');
    assert.match(await txt(p, '#couche-fiche'), /CA facturé HT · novembre 2026 ?400,00 € HT/);
    await p.click('#couche-fiche .fermer');
    await p.click('.vc-ligne:has(.vc-nom:text-is("CARROSSERIE FICTIVE B"))');
    assert.match(await txt(p, '.vc-ap-ca'), /Non renseigné \(pas de compte client ebp\)/, 'prospect sans compte : jamais un faux zéro');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('3. exports EBP réels (fictifs) importés : CA recalculé ; export d’un mois passé → « Non renseigné »', async () => {
  const { ctx, p } = await ouvrir('#bureau');
  try {
    const csv = ['Type;N° pièce;Date;Code client;Client;Total HT',
      'Facture;FA-1;03/11/2026;C1;GARAGE FICTIF UN;1 000,00', 'Facture;FA-2;04/11/2026;C2;GARAGE FICTIF DEUX;500,00',
      'Avoir;AV-1;05/11/2026;C1;GARAGE FICTIF UN;-100,00', 'Commande;CC-1;05/11/2026;C2;GARAGE FICTIF DEUX;9 999,00',
      'Devis;DE-1;05/11/2026;C2;GARAGE FICTIF DEUX;7 777,00', 'Facture;FA-0;28/10/2026;C1;GARAGE FICTIF UN;3 000,00'].join('\n');
    const clients = 'Code;Nom;Ville;Code postal;Représentant\nC1;GARAGE FICTIF UN;Goussainville;95190;REP-A\n';
    await p.setInputFiles('#ebp-pieces', { name: 'pieces.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await p.setInputFiles('#ebp-clients', { name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from(clients) });
    await p.waitForFunction(() => /1\s400,00/.test(document.querySelector('[data-ca="global"]').textContent));
    const t = await txt(p, '#bloc-ca');
    assert.match(t, /2 factures émise\(s\) 1 500,00 € HT · 1 avoir déduit\(s\) -100,00 € HT/, 'commande, devis et octobre exclus');
    assert.equal(await txt(p, '[data-ca="idf"]'), '900,00 € HT', 'C1 rattaché à Goussainville par son code client');
    assert.equal(await txt(p, '[data-ca="non-attribue"]'), '500,00 € HT', 'C2 absent du fichier clients : à part, jamais deviné par le nom');
    assert.match(t, /EBP/); assert.doesNotMatch(t, /Données fictives/);
    await p.fill('#ebp-arrete', '2026-10-31'); await p.dispatchEvent('#ebp-arrete', 'change');
    await p.waitForFunction(() => /Non renseigné/.test(document.querySelector('[data-ca="global"]').textContent));
    assert.match(await txt(p, '#bloc-ca'), /antérieur au mois en cours/);
  } finally { await ctx.close(); }
});

test('4. format Samsung : bloc CA lisible, pas de défilement horizontal', async () => {
  const { ctx, p, erreurs } = await ouvrir('#communes-95', { ...devices['Galaxy S9+'] });
  try {
    await p.waitForSelector('.vc-dep .vc-ca');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await capture(p, 'ca-4-samsung-departement');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
