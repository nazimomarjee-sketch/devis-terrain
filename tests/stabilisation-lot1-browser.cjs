'use strict';
// Stabilisation Lot 1 — points restés « non prouvés » lors des essais Samsung du 29/10/2026 :
//  - restauration complète HORS CONNEXION via l'écran Réglages (application installée) ;
//  - prix affiché dans le Catalogue après restauration (« Tarif dans B : non formellement prouvé ») ;
//  - photos et PDF disponibles hors connexion, octets identiques à l'origine ;
//  - PDF importé sans type MIME (cas traité par la PR #3) conservé par la sauvegarde complète.
// Exécution : node tests/stabilisation-lot1-browser.cjs  — serveur local, profil jetable, données synthétiques.
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const B = require('../sauvegarde-locale.js');
const jeu = require('../scripts/generer-jeu-synthetique.cjs');
const root = path.resolve(__dirname, '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
let browser, server, origin, requetes = 0;

before(async () => {
  server = http.createServer((req, res) => {
    requetes++;
    const p = new URL(req.url, 'http://localhost').pathname, file = path.resolve(root, '.' + (p === '/' ? '/index.html' : p));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); res.end(fs.readFileSync(file));
  });
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); });
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (server?.listening) await new Promise(r => server.close(r)); });

// Application installée (service worker actif) dans un profil vierge, au format d'un Samsung.
async function installer() {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(origin + '/#/reglages');
  await page.getByRole('button', { name: 'Télécharger une sauvegarde complète', exact: true }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  return { context, page, erreurs };
}

async function restaurerDepuisReglages(page, chemin) {
  await page.goto(origin + '/#/reglages');
  await page.getByRole('button', { name: 'Restaurer après contrôle', exact: true }).waitFor();
  await page.getByLabel('Fichier de sauvegarde').setInputFiles(chemin);
  const recharge = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Restaurer après contrôle', exact: true }).click();
  await recharge;
  await page.getByRole('navigation').first().waitFor().catch(() => {});
}

test('parcours Samsung hors connexion : restauration, prix au Catalogue, photos et PDF intacts', async () => {
  const dossier = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'odicolor-stab-'));
  const { stores } = jeu.create('smoke');
  const pieces = Object.fromEntries(await Promise.all(stores.meta.filter(([, v]) => v && v.blob instanceof Blob)
    .map(async ([k, v]) => [k, sha(Buffer.from(await v.blob.arrayBuffer()))])));
  const { file } = await B.encode(stores);
  const chemin = path.join(dossier, 'jeu-smoke.odicolor');
  fs.writeFileSync(chemin, Buffer.from(await file.arrayBuffer()));

  const { context, page, erreurs } = await installer();
  try {
    await context.setOffline(true);
    const avant = requetes;
    await page.reload();
    await page.getByRole('button', { name: 'Télécharger une sauvegarde complète', exact: true }).waitFor();
    await restaurerDepuisReglages(page, chemin);

    // Données restaurées (lecture directe d'IndexedDB par les fonctions de l'appli).
    const etat = await page.evaluate(async () => ({ clients: (await getAll('clients')).length, devis: (await getAll('devis')).length,
      article: (await getAll('articles')).find(a => a.code === 'SYN-00001') }));
    assert.equal(etat.clients, 3);
    assert.equal(etat.devis, 12);
    assert.equal(etat.article.pu, 1000, 'prix en centimes conservé : 10,00 € HT');

    // Prix visible à l'écran, comme le commercial le verrait (Catalogue → recherche).
    await page.goto(origin + '/#/catalogue');
    await page.getByLabel('Chercher dans le catalogue').fill('SYN-00001');
    await page.waitForSelector('text=SYN-00001');
    const ligne = await page.locator('a.ligne', { hasText: 'SYN-00001' }).first().textContent();
    assert.match(ligne.replace(/\s/g, ' '), /10,00/, 'prix 10,00 affiché : ' + ligne);

    // Photos et PDF : présents hors connexion, octets identiques à l'origine.
    const lus = await page.evaluate(async cles => {
      const out = {};
      for (const k of cles) {
        const v = await get('meta', k);
        out[k] = v && v.blob ? Array.from(new Uint8Array(await v.blob.arrayBuffer())) : null;
      }
      return out;
    }, Object.keys(pieces));
    for (const [k, attendu] of Object.entries(pieces)) {
      assert.ok(lus[k], k + ' absent après restauration');
      assert.equal(sha(Buffer.from(lus[k])), attendu, k + ' modifié');
    }

    // Écran Catalogues fournisseurs (PDF) : les 2 documents listés hors connexion.
    await page.evaluate(() => { location.hash = '#/catalogue'; });
    const texte = await page.evaluate(async () => (await window.__cataloguesPDFV32.indexPDF()).map(x => x.nom));
    assert.deepEqual(texte.sort(), ['pdf-synthetique-1.pdf', 'pdf-synthetique-2.pdf']);
    const doc = await page.evaluate(async () => { const d = await window.__cataloguesPDFV32.obtenirDocument('pdf-synthetique-1'); return d && d.blob.size; });
    assert.ok(doc > 0, 'PDF ouvrable hors connexion');
    assert.equal(requetes, avant, 'aucune requête au serveur : tout le parcours s’est fait hors connexion');
    assert.deepEqual(erreurs, []);
  } finally { await context.close(); fs.rmSync(dossier, { recursive: true, force: true }); }
});

test('PDF importé sans type MIME : accepté à l’import, conservé à l’identique par la sauvegarde complète', async () => {
  const { context, page, erreurs } = await installer();
  try {
    const r = await page.evaluate(async () => {
      const octets = new TextEncoder().encode('%PDF-1.4\n% PDF SYNTHETIQUE SANS MIME\n%%EOF\n');
      const fichier = new File([octets], 'catalogue-sans-mime.pdf', { type: '' });
      await window.__cataloguesPDFV32.sauvegarderPDF(fichier, 'FOURNISSEUR SYNTHETIQUE');
      const index = await window.__cataloguesPDFV32.indexPDF();
      const stores = await ODICOLOR_BACKUP.read(DB.db);
      const { file } = await ODICOLOR_BACKUP.encode(stores);
      const relu = await ODICOLOR_BACKUP.decode(file);
      const entree = relu.stores.meta.find(([k]) => k === 'pdfFournisseur:' + index[0].id)[1];
      return { nb: index.length, type: entree.blob.type, identique: new Uint8Array(await entree.blob.arrayBuffer()).join() === octets.join() };
    });
    assert.equal(r.nb, 1);
    assert.equal(r.type, '', 'type vide conservé tel quel');
    assert.equal(r.identique, true, 'octets du PDF identiques après aller-retour');
    assert.deepEqual(erreurs, []);
  } finally { await context.close(); }
});
