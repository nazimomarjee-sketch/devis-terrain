'use strict';
// Volume Lot 1 : décodage + restauration RÉELLE (IndexedDB Chromium) du jeu synthétique « terrain »
// (2 000 garages, 10 000 devis, 20 000 articles, 200 photos, 6 PDF, ≈ 110 Mo), puis relecture et comparaison.
// Exécution : node tests/volume-lot1-browser.cjs  (≈ 1 min ; pas dans la vérification rapide).
// Limite : mesure sur PC ; un Samsung est plus lent et a moins de mémoire — à confirmer sur l'appareil.
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser, server, origin, dossier, attendus;

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-volume-'));
  await require('../scripts/generer-jeu-synthetique.cjs').generate('terrain', path.join(dossier, 'jeu'));
  attendus = JSON.parse(fs.readFileSync(path.join(dossier, 'jeu', 'attendus-terrain.json'), 'utf8'));
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://localhost').pathname;
    if (p === '/test') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><script src="/sauvegarde-locale.js"></script>'); return; }
    if (p === '/jeu.odicolor') { res.setHeader('Content-Type', 'application/octet-stream'); fs.createReadStream(path.join(dossier, 'jeu', 'jeu-terrain.odicolor')).pipe(res); return; }
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(file));
  });
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); });
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (server?.listening) await new Promise(r => server.close(r)); if (dossier) fs.rmSync(dossier, { recursive: true, force: true }); });

test('2 000 garages / 110 Mo : décodage, restauration atomique et relecture complète', { timeout: 300000 }, async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/test');
  const r = await page.evaluate(async () => {
    const B = ODICOLOR_BACKUP, t0 = performance.now();
    const fichier = await (await fetch('/jeu.odicolor')).blob();
    const o = await B.decode(fichier); const t1 = performance.now();
    const db = await new Promise((ok, ko) => { const q = indexedDB.open('volume-' + crypto.randomUUID(), 2); q.onupgradeneeded = () => B.schema(q.result); q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error); });
    await B.restore(db, o); const t2 = performance.now();
    const s = await B.read(db); const t3 = performance.now();
    const pieces = s.meta.filter(([k]) => k.startsWith('garage-photo-v38:') || k.startsWith('pdfFournisseur:')).length;
    const visites = s.clients.reduce((n, c) => n + (c.visites || []).length, 0);
    return { octets: fichier.size, garages: s.clients.length, devis: s.devis.length, articles: s.articles.length, pieces, visites, archives: s.recuperations.length,
      decodage: Math.round(t1 - t0), restauration: Math.round(t2 - t1), relecture: Math.round(t3 - t2) };
  });
  console.log('# mesures (ms) : décodage ' + r.decodage + ', restauration ' + r.restauration + ', relecture ' + r.relecture + ' — ' + Math.round(r.octets / 1048576) + ' Mo');
  assert.equal(r.garages, attendus.clients);
  assert.equal(r.devis, attendus.devis);
  assert.equal(r.articles, attendus.articles);
  assert.equal(r.pieces, attendus.photos + attendus.pdf);
  assert.equal(r.visites, attendus.visites);
  assert.equal(r.archives, 1, 'l’état précédent (vide) est archivé avant remplacement');
  await page.close();
});
