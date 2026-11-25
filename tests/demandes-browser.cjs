'use strict';
// Lot 5 : demande de devis depuis la fiche garage (émulation Chromium, Galaxy S9+, réseau coupé). DONNÉES FICTIVES. Émulation ≠ vrai Samsung.
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium, devices } = require('playwright');
const root = path.resolve(__dirname, '..'); let browser, server, origin;
before(async () => {
  server = http.createServer((req, res) => { const p = new URL(req.url, 'http://localhost').pathname, file = path.resolve(root, '.' + (p === '/' ? '/index.html' : p));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.end(fs.readFileSync(file)); });
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); }); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (server?.listening) await new Promise(r => server.close(r)); });
async function ouvrir(clients) {
  const context = await browser.newContext({ ...devices['Galaxy S9+'] }), page = await context.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(u => !u.href.startsWith(origin), r => r.abort());
  await page.goto(origin + '/#/reglages'); await page.getByRole('button', { name: 'Télécharger une sauvegarde chiffrée', exact: true }).waitFor();
  await page.addStyleTag({ content: '#v25-maj{display:none!important}' });
  await page.evaluate(() => { window.__ouverts = []; window.open = u => { window.__ouverts.push(u); return null; }; });
  await page.evaluate(cl => putMany('clients', cl), clients);
  await page.evaluate(() => putMany('articles', [{ code: 'CS-FICT-01', des: 'Vernis fictif HS', pu: 1000, marque: 'Carsystem', conditionnement: '5 L' }, { code: 'RB-FICT-01', des: 'Vernis ancien', pu: 1000, marque: 'Roberlo' }]));
  await page.evaluate(() => chargerBase());
  return { context, page, errs };
}

test('fiche garage → demande : produit du catalogue, quantité, récapitulatif pour Mohamed, n° EBP, envoyé, accepté — jamais un devis', async () => {
  const { context, page, errs } = await ouvrir([{ id: 5, nom: 'GARAGE FICTIF DEMANDE', ville: 'Massy', statutCrm: 'client', codeEbp: 'C905' }]);
  try {
    await page.goto(origin + '/#/client/5');
    const b = page.locator('[data-demande="nouvelle"]'); await b.waitFor(); assert.ok((await b.boundingBox()).height >= 70);
    await b.click(); await page.locator('text=ce n’est PAS un devis EBP').waitFor();
    await page.getByLabel('Chercher un produit').fill('vernis');
    assert.equal(await page.locator('text=RB-FICT-01').count(), 0, 'Roberlo jamais proposée');
    await page.locator('button.ligne', { hasText: 'CS-FICT-01' }).click();
    await page.locator('text=CS-FICT-01 · Vernis fictif HS').first().waitFor();
    await page.locator('[data-etape="a_traiter"]').click();
    const u = (await page.evaluate(() => window.__ouverts))[0];
    assert.match(decodeURIComponent(u.split('text=')[1]), /^DEMANDE DE DEVIS — à établir dans EBP \(ce message n’est pas un devis\)[\s\S]*CS-FICT-01 — Vernis fictif HS \[Carsystem\] · 5 L × 1/);
    await page.locator('[data-etape="traite_ebp"]').click();
    await page.locator('text=Numéro du devis EBP obligatoire').first().waitFor();
    await page.fill('[data-demande="no-ebp"]', 'DE-FICT-55'); await page.locator('[data-etape="traite_ebp"]').click();
    await page.locator('[data-etape="envoye"]').click(); await page.locator('[data-etape="accepte"]').click();
    await page.locator('text=la vente n’est comptée qu’une fois la commande puis la facture présentes dans EBP').waitFor();
    const d = (await page.evaluate(() => get('meta', 'demandesDevis')))[0];
    assert.deepEqual([d.statut, d.noDevisEbp, d.codeEbp], ['accepte', 'DE-FICT-55', 'C905']);
    assert.deepEqual(d.historique.map(x => x.etape), ['brouillon', 'a_traiter', 'traite_ebp', 'envoye', 'accepte']);
    assert.equal('prix' in d.lignes[0], false);
    await page.goto(origin + '/#/client/5'); await page.locator('[data-demande="' + d.uid + '"]', { hasText: 'Accepté par le client' }).waitFor();
    assert.deepEqual(errs, []);
  } finally { await context.close(); }
});

test('compte bloqué : la demande reste en brouillon, motif affiché', async () => {
  const { context, page, errs } = await ouvrir([{ id: 6, nom: 'GARAGE FICTIF BLOQUE', ville: 'Massy', compte: { statut: 'bloque' } }]);
  try {
    await page.goto(origin + '/#/demande/nouvelle/6'); await page.locator('text=COMPTE BLOQUÉ').first().waitFor();
    await page.getByLabel('Besoin du garage').fill('Apprêt'); await page.getByLabel('Besoin du garage').dispatchEvent('change');
    await page.locator('[data-etape="a_traiter"]').click();
    await page.locator('text=Compte client bloqué dans EBP').first().waitFor();
    assert.equal((await page.evaluate(() => get('meta', 'demandesDevis')))[0].statut, 'brouillon');
    assert.deepEqual(await page.evaluate(() => window.__ouverts), []); assert.deepEqual(errs, []);
  } finally { await context.close(); }
});
