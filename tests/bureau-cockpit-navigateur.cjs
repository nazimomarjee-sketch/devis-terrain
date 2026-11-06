'use strict';
// Cockpit ODICOLOR — essai de bout en bout dans Chromium, date figée au vendredi 06/11/2026, Internet coupé :
// sauvegarde téléphone + exports EBP fictifs → écran Bureau (3 actions, CA) → plan téléchargé
// → import dans la VRAIE appli téléphone (version en service) → « Mon travail » et l'accueil affichent les chiffres EBP.
// Exécution : node tests/bureau-cockpit-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { chromium } = require('playwright');
const P = require('../bureau/pipeline.js');

const racine = path.resolve(__dirname, '..'), F = path.join(__dirname, 'fixtures', 'bureau');
let navigateur, serveur, origine, dossier;
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-cockpit-'));
  // Sauvegarde téléphone fictive (format V47) contenant les devis du scénario.
  const devis = JSON.parse(fs.readFileSync(path.join(F, 'telephone-devis-pipeline.json'), 'utf8')).devis;
  fs.writeFileSync(path.join(dossier, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', reglages: {},
    clients: [{ id: 1, nom: 'GARAGE FICTIF ALPHA', ville: 'Massy', cp: '91300', statutCrm: 'client' }, { id: 2, nom: 'GARAGE FICTIF BETA', ville: 'Palaiseau', cp: '91120', statutCrm: 'client' }], devis }));
  serveur = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), f = path.resolve(racine, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(racine + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.end(fs.readFileSync(f));
  });
  await new Promise((r, j) => { serveur.once('error', j); serveur.listen(0, '127.0.0.1', r); });
  origine = 'http://127.0.0.1:' + serveur.address().port;
  navigateur = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await navigateur?.close(); if (serveur?.listening) await new Promise(r => serveur.close(r)); fs.rmSync(dossier, { recursive: true, force: true }); });

async function contexte(options = {}) {
  const ctx = await navigateur.newContext({ acceptDownloads: true, ...options });
  const sorties = []; await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { sorties.push(r.request().url()); r.abort(); });
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message)); page.on('dialog', d => d.accept());
  await page.clock.setFixedTime(new Date('2026-11-06T09:00:00'));
  return { ctx, page, erreurs, sorties };
}
async function chargerBureau(page) {
  await page.goto(origine + '/bureau/index.html#bureau');
  await page.waitForSelector('text=Exports EBP');
  await page.click('#mode');
  await page.setInputFiles('#fichier-sauvegarde', path.join(dossier, 'sauvegarde.json'));
  await page.waitForSelector('text=Ancienne sauvegarde V47');
  await page.click('#mode');
  for (const [type, f] of [['pieces', 'ebp-pieces.csv'], ['reglements', 'ebp-reglements.csv'], ['clients', 'ebp-clients.csv']]) {
    await page.setInputFiles('#ebp-' + type, path.join(F, f));
    await page.waitForSelector('#ebp-' + type + ' >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]');
  }
}

test('Bureau : 3 actions, CA EBP, rapprochements et plan conforme', async () => {
  const { ctx, page, erreurs, sorties } = await contexte();
  try {
    await chargerBureau(page);
    const actions = await page.locator('.action b').allTextContents();
    assert.deepEqual(actions.slice(0, 3), ['Relancer le règlement : GARAGE FICTIF EPSILON', 'Débloquer avec Mohamed la commande de GARAGE FICTIF BETA', 'Faire facturer : GARAGE FICTIF DELTA']);
    const texte = await page.textContent('#vue');
    assert.match(texte, /CA commandé cette semaine\s*EBP/);
    assert.match(texte.replace(/\s/g, ' '), /2 800 €/);
    assert.match(texte.replace(/\s/g, ' '), /3 600 €/);
    assert.match(texte, /TEL-D11 = DV-1001, TEL-C13 = CC-2001/);
    assert.match(texte, /1 ligne\(s\) de pièces EBP écartée\(s\)/);
    assert.match(texte, /Ligne 19 : Date illisible pour CC-2006/);
    assert.match(texte, /1 avoir\(s\) lu\(s\), non déduit\(s\) du CA \(règle à valider\) : AV-5001/);
    assert.match(texte, /Historique des commandes EBP depuis le 2026-10-15 seulement/);
    const dl = page.waitForEvent('download');
    await page.click('text=Télécharger le plan du matin');
    const fichier = await dl;
    assert.equal(fichier.suggestedFilename(), 'plan-odicolor-2026-11-06.json');
    const plan = JSON.parse(fs.readFileSync(await fichier.path(), 'utf8'));
    assert.deepEqual(P.verifierPlan(plan), []);
    assert.equal(plan.actions.length, 5);
    fs.writeFileSync(path.join(dossier, 'plan.json'), JSON.stringify(plan));
    // Seules la police et la bibliothèque de carte sont demandées au chargement ; aucune donnée garage ne sort.
    assert.ok(sorties.every(u => /^https:\/\/(fonts\.googleapis\.com|cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet)\//.test(u)), sorties.join(' '));
    assert.ok(!sorties.some(u => /FICTIF|DV-|CC-|FA-|TEL-/i.test(decodeURIComponent(u))), 'aucune donnée garage dans une requête');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('Bureau : export refusé avec la cause, le reste de l’écran reste utilisable', async () => {
  const { ctx, page, erreurs } = await contexte();
  try {
    await page.goto(origine + '/bureau/index.html#bureau');
    await page.setInputFiles('#ebp-pieces', { name: 'faux.csv', mimeType: 'text/csv', buffer: Buffer.from('N° pièce;Date\nFA-1;01/11/2026\n') });
    await page.waitForSelector('text=Refusé : Export pieces : colonne(s) obligatoire(s) introuvable(s)');
    assert.match(await page.textContent('#vue'), /Charge au moins l’export des pièces/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('Téléphone (appli en service) : le plan du Bureau s’importe, chiffres EBP et action n° 1 affichés', async () => {
  const { ctx, page, erreurs } = await contexte({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(origine + '/#/reglages');
    await page.click('text=Plan commercial du PC');
    await page.getByLabel('Plan PC à importer').setInputFiles(path.join(dossier, 'plan.json'));
    await page.getByRole('button', { name: 'Importer le plan PC' }).click();
    await page.waitForSelector('text=Plan du PC importé : 5 action(s)');
    await page.goto(origine + '/#/travail');
    await page.waitForSelector('text=Mon travail');
    const travail = (await page.textContent('#app, body')).replace(/\s/g, ' ');
    assert.match(travail, /2 800,00 €/, 'CA commandé EBP de la semaine affiché');
    await page.goto(origine + '/#/');
    await page.waitForSelector('text=TA PROCHAINE ACTION');
    const accueil = await page.textContent('body');
    assert.match(accueil, /Relancer le règlement : GARAGE FICTIF EPSILON/, 'action n° 1 du Bureau en tête de l’accueil');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('Bureau au format téléphone : pas de défilement horizontal', async () => {
  const { ctx, page, erreurs } = await contexte({ viewport: { width: 384, height: 832 }, isMobile: true, hasTouch: true });
  try {
    await chargerBureau(page);
    // innerWidth s'élargit en mode mobile quand un élément déborde : on compare à la largeur réelle de l'écran (384 px).
    const [large, ecran] = await page.evaluate(() => [Math.max(document.documentElement.scrollWidth, window.innerWidth), document.documentElement.clientWidth]);
    assert.ok(large <= ecran + 1, large + 'px pour ' + ecran + 'px');
    const coupes = await page.$$eval('.onglet', l => l.filter(o => { const r = o.getBoundingClientRect(); return r.left < 0 || r.right > document.documentElement.clientWidth + 1 || o.scrollWidth > o.clientWidth + 1; }).map(o => o.textContent));
    assert.deepEqual(coupes, [], 'chaque onglet est entièrement visible');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('Historique EBP 14 mois → Bureau → téléphone : page Opportunités (reconquête, baisse) et accueil EBP', async () => {
  // 14:00 : la version du téléphone en service (main) refuse encore l'export du jour avant midi ;
  // la correction est sur la PR #2 (tests/plan-pc-matin-browser.cjs, de 08:30 à 23:30).
  const b = await contexte();
  let plan;
  try {
    await b.page.clock.setFixedTime(new Date('2026-11-06T14:00:00'));
    await b.page.goto(origine + '/bureau/index.html#bureau');
    for (const [type, f] of [['pieces', 'ebp-pieces-historique.csv'], ['clients', 'ebp-clients-historique.csv']]) {
      await b.page.setInputFiles('#ebp-' + type, path.join(F, f));
      await b.page.waitForSelector('#ebp-' + type + ' >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]');
    }
    assert.deepEqual((await b.page.locator('.action b').allTextContents()).slice(0, 2), ['Débloquer avec Mohamed la commande de GARAGE FICTIF KAPPA', 'Reconquérir : GARAGE FICTIF OMEGA']);
    const dl = b.page.waitForEvent('download'); await b.page.click('text=Télécharger le plan du matin');
    plan = JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'));
    assert.equal(plan.sources.preuvesCommerciales.fiable, true);
    fs.writeFileSync(path.join(dossier, 'plan-historique.json'), JSON.stringify(plan));
    assert.deepEqual(b.erreurs, []);
  } finally { await b.ctx.close(); }
  const { ctx, page, erreurs } = await contexte({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  try {
    await page.clock.setFixedTime(new Date('2026-11-06T14:00:00'));
    await page.goto(origine + '/#/reglages');
    await page.evaluate(() => putMany('clients', [{ id: 1, nom: 'GARAGE FICTIF OMEGA', statutCrm: 'client' }, { id: 2, nom: 'GARAGE FICTIF SIGMA', statutCrm: 'client' }, { id: 3, nom: 'GARAGE FICTIF KAPPA', statutCrm: 'client' }]));
    await page.click('text=Plan commercial du PC');
    await page.getByLabel('Plan PC à importer').setInputFiles(path.join(dossier, 'plan-historique.json'));
    await page.getByRole('button', { name: 'Importer le plan PC' }).click();
    await page.waitForSelector('text=Plan du PC importé');
    assert.deepEqual(await page.evaluate(async () => window.__commercialV22.fiabilite(await lirePC()).ok), true);
    await page.goto(origine + '/#/opportunites');
    await page.waitForSelector('text=Client à reconquérir');
    const t = await page.textContent('body');
    assert.match(t, /GARAGE FICTIF OMEGA\s*Client à reconquérir\s*Aucune commande depuis 114 j/);
    assert.match(t, /GARAGE FICTIF SIGMA\s*Achats en baisse/);
    assert.match(t, /Règle de détection \(hypothèse\) : Plus de 60 jours sans commande/);
    assert.doesNotMatch(t, /LAMBDA/, 'compte bloqué : aucun signal');
    await page.goto(origine + '/#/');
    await page.waitForSelector('text=montants EBP à consulter sur Mon travail');
    await page.waitForSelector('.v29-home-note small:has-text("Pour GARAGE FICTIF")');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
