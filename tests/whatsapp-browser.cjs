'use strict';
// Lot 3 : WhatsApp depuis la fiche garage (émulation Chromium, Galaxy S9+, réseau coupé). DONNÉES ET NUMÉROS FICTIFS. Émulation ≠ vrai Samsung.
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
  // window.open intercepté : on vérifie le lien préparé, rien ne part réellement.
  await page.evaluate(() => { window.__ouverts = []; window.open = (u) => { window.__ouverts.push(u); return null; }; });
  await page.evaluate(cl => putMany('clients', cl), clients);
  return { context, page, errs };
}

test('fiche garage : WhatsApp en 2 touches, lien wa.me prérempli, journal « ouvert » sans doublon, relance devenue rappel', async () => {
  const { context, page, errs } = await ouvrir([{ id: 1, nom: 'GARAGE FICTIF WA', ville: 'Massy', tel: '06 39 98 12 34', contactNom: 'M. Fictif', visites: [{ date: '2026-11-01', res: 'vu', note: '' }] }]);
  try {
    await page.goto(origin + '/#/client/1');
    const btn = page.locator('[data-wa="preparer"]'); await btn.waitFor();
    assert.match(await btn.textContent(), /WhatsApp · \+33 6 39 98 12 34/);
    const boite = await btn.boundingBox(); assert.ok(boite.height >= 48, 'zone tactile ≥ 48 px : ' + boite.height);
    await btn.click(); await page.locator('[data-wa="ouvrir"]').click();
    const ouverts = await page.evaluate(() => window.__ouverts);
    assert.equal(ouverts.length, 1); assert.match(ouverts[0], /^https:\/\/wa\.me\/33639981234\?text=Bonjour%20M\.%20Fictif/);
    await page.locator('.wa-histo small', { hasText: 'WhatsApp ouvert (envoi non confirmé)' }).waitFor();
    let c = await page.evaluate(() => get('clients', 1));
    assert.equal(c.contacts.length, 1); assert.equal(c.contacts[0].statut, 'whatsapp_ouvert'); assert.match(c.rappel, /^\d{4}-\d\d-\d\d$/);
    assert.equal(c.visites.length, 1, 'données existantes préservées');
    await page.locator('[data-wa="ouvrir"]').click(); // même texte, même jour : rouvert, pas de doublon
    c = await page.evaluate(() => get('clients', 1)); assert.equal(c.contacts.length, 1);
    assert.doesNotMatch(await page.textContent('body'), /message envoyé/i);
    assert.deepEqual(errs, []);
  } finally { await context.close(); }
});

test('numéro invalide : bouton désactivé avec le motif ; aucun lien ouvert', async () => {
  const { context, page, errs } = await ouvrir([{ id: 2, nom: 'GARAGE FICTIF SANS NUMERO', ville: 'Massy', tel: '08 99 00 12 34' }]);
  try {
    await page.goto(origin + '/#/client/2');
    await page.locator('.v49-wa', { hasText: 'Numéro spécial' }).waitFor();
    assert.equal(await page.locator('.v49-wa button').isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.__ouverts), []); assert.deepEqual(errs, []);
  } finally { await context.close(); }
});
