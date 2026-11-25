'use strict';
// Lot 8 : import EBP en deux temps (aperçu → valider / annuler). Exports FICTIFS (en-têtes inventés), Internet coupé.
// Exécution : node tests/bureau-import-ebp-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const { chromium } = require('playwright');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'bureau', 'index.html');
let nav, dossier;
before(async () => {
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-import8-'));
  // En-têtes inhabituels (non devinables), séparateur « ; », lignes de titre, Windows-1252.
  fs.writeFileSync(path.join(dossier, 'ventes-a.csv'), Buffer.from(['ETAT DES VENTES FICTIF;;;;', 'Edité le 14/11/2026;;;;', 'Genre;Pièce;Jour;Raison;Valeur nette',
    'Facture;FA-1;03/11/2026;GARAGE FICTIF ÉTOILE;1 000,00', 'Facture;FA-2;04/11/2026;GARAGE FICTIF ÉTOILE;500,00'].join('\r\n'), 'latin1'));
  fs.writeFileSync(path.join(dossier, 'ventes-b.csv'), Buffer.from(['ETAT DES VENTES FICTIF;;;;', 'Genre;Pièce;Jour;Raison;Valeur nette', 'Facture;FA-3;10/11/2026;GARAGE FICTIF ÉTOILE;200,00'].join('\r\n'), 'latin1'));
  // UTF-16 (« Texte Unicode »), tabulations, en-têtes reconnus.
  fs.writeFileSync(path.join(dossier, 'ventes-unicode.txt'), Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('Type\tN° pièce\tDate\tClient\tMontant HT\r\nFacture\tFA-9\t05/11/2026\tGARAGE FICTIF ÉTÉ\t300,00\r\n', 'utf16le')]));
  fs.writeFileSync(path.join(dossier, 'illisible.csv'), 'Type;N° pièce;Date;Client;Montant HT\nFacture;FA-X;pas une date;G;1,00\n');
  fs.writeFileSync(path.join(dossier, 'image.png'), 'pas un export');
});
after(async () => { await nav?.close(); fs.rmSync(dossier, { recursive: true, force: true }); });

async function ouvrir() {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-14T10:00:00'));
  await p.goto(PAGE + '#import-ebp'); await p.waitForSelector('[data-assistant="etape-arrete"]');
  await p.fill('[data-assistant="arrete"]', '2026-11-14'); await p.dispatchEvent('[data-assistant="arrete"]', 'change');
  for (let i = 0; i < 2; i++) await p.click('[data-assistant="suivant"]');
  await p.waitForSelector('[data-assistant="etape-pieces"]');
  return { ctx, p, erreurs };
}
const choisir = (p, f) => p.setInputFiles('[data-assistant="fichier-pieces"]', path.join(dossier, f)).then(() => p.waitForSelector('[data-assistant="apercu-pieces"]'));
const caPieces = p => p.evaluate(() => document.querySelector('[data-assistant="bilan-pieces"]') && document.querySelector('[data-assistant="bilan-pieces"]').textContent);

test('colonnes inconnues : associées à la main, aperçu, validation ; au réimport du même format, reconnues automatiquement', async () => {
  const { ctx, p, erreurs } = await ouvrir();
  try {
    await choisir(p, 'ventes-a.csv');
    assert.match(await p.textContent('[data-assistant="manquantes"]'), /indispensable/);
    assert.equal(await p.isDisabled('[data-assistant="valider"]'), true, 'colonnes indispensables manquantes : validation impossible');
    assert.match(await p.textContent('[data-assistant="apercu-pieces"]'), /2 ligne\(s\) de titre ignorée\(s\)/);
    for (const [k, v] of [['type', 'Genre'], ['no', 'Pièce'], ['date', 'Jour'], ['client', 'Raison'], ['ht', 'Valeur nette']]) await p.selectOption('[data-colonne="' + k + '"]', v);
    await p.click('[data-assistant="recalculer"]'); await p.waitForSelector('[data-assistant="compte"]');
    assert.match(await p.textContent('[data-assistant="compte"]'), /2 ligne\(s\) reconnue\(s\), 0 rejetée\(s\) · 2 nouvelle\(s\)/);
    assert.equal(await p.evaluate(() => !!document.querySelector('[data-assistant="bilan-pieces"] .badge')), false, 'rien d’importé avant validation');
    await p.click('[data-assistant="valider"]'); await p.waitForSelector('[data-assistant="bilan-pieces"] .badge');
    assert.match(await caPieces(p), /GARAGE|ventes-a\.csv : 2 ligne\(s\) lue\(s\)/);
    await choisir(p, 'ventes-b.csv');
    assert.match(await p.textContent('[data-assistant="memoire"]'), /comme lors de ton dernier import/);
    assert.equal(await p.isDisabled('[data-assistant="valider"]'), false);
    const accents = await p.evaluate(() => JSON.stringify(window.OdicolorBureau.exporter().ebp.pieces.pieces.map(x => x.client)));
    assert.match(accents, /ÉTOILE/, 'Windows-1252 : accents conservés');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('annuler : rien ne change ; fichier illisible : validation bloquée ; format non pris en charge : refusé en clair', async () => {
  const { ctx, p, erreurs } = await ouvrir();
  try {
    await choisir(p, 'ventes-unicode.txt');
    assert.match(await p.textContent('[data-assistant="compte"]'), /1 ligne\(s\) reconnue\(s\)/, 'UTF-16 + tabulations lus');
    await p.click('[data-assistant="annuler"]');
    assert.equal(await p.evaluate(() => window.OdicolorBureau.exporter().ebp.pieces), null, 'annulé : aucune pièce chargée');
    await choisir(p, 'illisible.csv');
    assert.equal(await p.isDisabled('[data-assistant="valider"]'), true); assert.match(await p.textContent('[data-assistant="anomalies"]'), /Bloquant.*Aucune ligne n’a pu être lue/);
    await p.setInputFiles('[data-assistant="fichier-pieces"]', path.join(dossier, 'image.png'));
    await p.waitForSelector('[data-assistant="erreur-pieces"]'); assert.match(await p.textContent('[data-assistant="erreur-pieces"]'), /Format non pris en charge/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('échec pendant l’import : les données précédentes restent intactes, l’erreur est expliquée', async () => {
  const { ctx, p, erreurs } = await ouvrir();
  try {
    await choisir(p, 'ventes-unicode.txt'); await p.click('[data-assistant="valider"]'); await p.waitForSelector('[data-assistant="bilan-pieces"] .badge');
    const avant = await p.evaluate(() => JSON.stringify(window.OdicolorBureau.exporter().ebp.pieces.pieces));
    await p.evaluate(() => { window.Performance.consolider = () => { throw new Error('panne simulée'); }; }); // défaillance volontaire, seulement dans ce test
    await p.setInputFiles('[data-assistant="fichier-pieces"]', path.join(dossier, 'ventes-b.csv')); await p.waitForSelector('[data-assistant="apercu-pieces"]');
    for (const [k, v] of [['type', 'Genre'], ['no', 'Pièce'], ['date', 'Jour'], ['client', 'Raison'], ['ht', 'Valeur nette']]) await p.selectOption('[data-colonne="' + k + '"]', v);
    await p.click('[data-assistant="recalculer"]'); await p.waitForSelector('[data-assistant="compte"]');
    await p.click('[data-assistant="valider"]'); await p.waitForSelector('[data-assistant="erreur-pieces"]');
    assert.match(await p.textContent('[data-assistant="erreur-pieces"]'), /Import interrompu : panne simulée\. Les données précédentes sont conservées/);
    assert.equal(await p.evaluate(() => JSON.stringify(window.OdicolorBureau.exporter().ebp.pieces.pieces)), avant, 'données identiques à avant l’échec');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
