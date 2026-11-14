'use strict';
// Lot 6 : onglet Pilotage du Bureau. Exports EBP FICTIFS, Internet coupé. Exécution : node tests/bureau-pilotage-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const { chromium } = require('playwright');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'bureau', 'index.html');
let nav, dossier;
const ENT = 'Type;N° pièce;Date;Code client;Client;Montant HT;N° de pièce d’origine';
before(async () => {
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-pilotage-'));
  fs.writeFileSync(path.join(dossier, 'pieces-1.csv'), [ENT, 'Devis;DE-1;20/10/2026;C1;GARAGE FICTIF UN;500,00;', 'Facture;FA-1;03/11/2026;C1;GARAGE FICTIF UN;6 000,00;'].join('\n'));
  fs.writeFileSync(path.join(dossier, 'pieces-2.csv'), [ENT, 'Facture;FA-1;03/11/2026;C1;GARAGE FICTIF UN;6 000,00;', 'Avoir;AV-1;06/11/2026;C1;GARAGE FICTIF UN;1 000,00;FA-1', 'Facture;FA-2;10/11/2026;C2;GARAGE FICTIF DEUX;2 000,00;'].join('\n'));
  fs.writeFileSync(path.join(dossier, 'reglements.csv'), 'N° facture;Échéance;Date de règlement;Montant TTC;Reste à payer\nFA-1;05/11/2026;06/11/2026;7 200,00;2 000,00\n');
});
after(async () => { await nav?.close(); fs.rmSync(dossier, { recursive: true, force: true }); });
const charger = async (p, id, f) => { await p.setInputFiles('#ebp-' + id, path.join(dossier, f)); await p.waitForSelector('#ebp-' + id + ' >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]'); };

test('Pilotage : import répété sans double comptage, avoir déduit, paiement partiel, objectif absent puis 20 000 €, action validée', async () => {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  try {
    await p.clock.setFixedTime(new Date('2026-11-14T10:00:00'));
    await p.goto(PAGE + '#bureau'); await p.waitForSelector('#ebp-pieces', { state: 'attached' });
    await charger(p, 'pieces', 'pieces-1.csv'); await charger(p, 'pieces', 'pieces-1.csv'); await charger(p, 'pieces', 'pieces-2.csv');
    await charger(p, 'reglements', 'reglements.csv');
    await p.fill('#ebp-arrete', '2026-11-14'); await p.dispatchEvent('#ebp-arrete', 'change');
    await p.evaluate(() => { location.hash = '#pilotage'; }); await p.waitForSelector('[data-pilotage="synthese"]');
    const t = s => p.textContent(s).then(x => x.replace(/\s+/g, ' ').trim());
    assert.match(await t('[data-pilotage="fait"]'), /^7 000,00 € HT/, '6 000 − 1 000 + 2 000 : FA-1 comptée une fois malgré 3 imports');
    assert.match(await t('[data-pilotage="objectif"]'), /Non renseigné/); assert.match(await t('[data-pilotage="reste"]'), /Non renseigné/);
    assert.match(await t('[data-pilotage="projection"]'), /Estimation/);
    assert.match(await t('[data-pilotage="precedent"]'), /Non disponible/, 'octobre incomplet : pas de comparaison');
    assert.match(await p.textContent('[data-pilotage="donnees"]'), /Fichier\(s\) déjà importé\(s\), ignoré\(s\) : pieces-1\.csv/);
    assert.match(await p.textContent('[data-pilotage="donnees"]'), /2 export\(s\) consolidé\(s\)/);
    assert.match(await t('[data-categorie="non_determine"]'), /2 client\(s\)/, 'historique de quelques jours : non déterminé, jamais deviné');
    assert.match((await p.textContent('[data-pilotage="recommandations"]')).replace(/\s+/g, ' '), /FA-1 échue depuis 9 jours, reste 2 000,00 € TTC/);
    assert.match(await p.textContent('[data-pilotage="manques"]'), /12 mois/);
    await p.fill('[data-pilotage="objectif-saisie"]', '20000'); await p.dispatchEvent('[data-pilotage="objectif-saisie"]', 'change');
    await p.waitForFunction(() => /20\s000,00\s€\sHT/.test(document.querySelector('[data-pilotage="objectif"]').textContent));
    assert.match(await t('[data-pilotage="reste"]'), /13 000,00 € HT/); assert.match(await t('[data-pilotage="pct"]'), /^35 %/);
    const reco = p.locator('[data-reco^="facture_a_surveiller"]').first();
    await reco.locator('[data-decision="valide"]').click();
    await p.locator('[data-reco^="facture_a_surveiller"]', { hasText: 'Validée' }).first().waitFor();
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
