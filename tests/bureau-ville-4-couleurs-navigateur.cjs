'use strict';
// Ma Ville en 4 couleurs (validée le 07/11/2026, option A pour le noir) — essai Chromium, Internet coupé, données fictives.
// Rouge = client carrosserie · noir + liseré blanc lumineux = client Mécan · orange = prospect carrosserie · bleu = prospect mécanique.
// Les alertes (règlement, dormant, client EBP inactif) restent signalées ; animations et LED des bâtiments inchangées.
// Exécution : node tests/bureau-ville-4-couleurs-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { chromium } = require('playwright');

const racine = path.resolve(__dirname, '..');
const COULEURS = { '#D41F2B': 'client-carrosserie', '#0B0B0D': 'client-mecanique', '#F0952B': 'prospect-carrosserie', '#3E86F0': 'prospect-mecanique', '#6E737B': 'a_qualifier' };
let nav, serveur, origine, dossier;

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-4c-'));
  const ecrire = (n, l) => fs.writeFileSync(path.join(dossier, n), Buffer.from(l.map(x => x.join(';')).join('\r\n') + '\r\n', 'latin1'));
  ecrire('clients.csv', [['Code client', 'Raison sociale', 'Ville', 'Code postal', 'Statut du compte', 'Famille client'],
    ['C001', 'GARAGE FICTIF ALPHA', 'Massy', '91300', 'Actif', 'Carrosserie'], ['C002', 'GARAGE FICTIF BETA', 'Palaiseau', '91120', 'Actif', 'Mécan'],
    ['C003', 'GARAGE FICTIF GAMMA', 'Massy', '91300', 'Bloqué', 'Carrosserie'], ['C200', 'GARAGE FICTIF ANCIEN', 'Massy', '91300', 'Actif', 'Mécan']]);
  ecrire('pieces.csv', [['Type de pièce', 'N° pièce', 'Date', 'Code client', 'Nom du client', 'Montant HT', 'N° pièce d\'origine'],
    ['Commande client', 'CC-1', '02/11/2026', 'C001', 'GARAGE FICTIF ALPHA', '1 000,00', ''], ['Commande client', 'CC-2', '03/11/2026', 'C002', 'GARAGE FICTIF BETA', '500,00', ''],
    ['Commande client', 'CC-3', '10/03/2026', 'C003', 'GARAGE FICTIF GAMMA', '800,00', ''], ['Commande client', 'CC-4', '10/06/2025', 'C200', 'GARAGE FICTIF ANCIEN', '300,00', '']]);
  const tel = [['ALPHA', 'Massy', '91300', 'client'], ['BETA', 'Palaiseau', '91120', 'client'], ['GAMMA', 'Massy', '91300', 'client'], ['ANCIEN', 'Massy', '91300', 'client'],
    ['CARROSSERIE FICTIVE DU PARC', 'Palaiseau', '91120', 'prospect'], ['PNEUS FICTIFS', 'Palaiseau', '91120', 'prospect'], ['NU', 'Massy', '91300', 'prospect']]
    .map(([n, ville, cp, statutCrm], i) => ({ id: i + 1, nom: n.startsWith('CARROSSERIE') || n.startsWith('PNEUS') ? n : 'GARAGE FICTIF ' + n, ville, cp, statutCrm }));
  fs.writeFileSync(path.join(dossier, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', clients: tel, devis: [] }));
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

async function ouvrir() {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 } }); await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage(), erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-06T09:00:00'));
  return { ctx, page, erreurs };
}
// Anneau de chaque personnage de la Ville : couleur, présence du liseré.
const anneaux = page => page.$$eval('svg[aria-label^="Ville ODICOLOR"] .perso .corps', l => l.map(c => {
  const e = c.querySelector('ellipse'); return { couleur: e.getAttribute('stroke'), lisere: !!c.querySelector('ellipse.lisere'), nom: c.closest('.perso').getAttribute('aria-label') };
}));
async function villeConnectee(page) {
  await page.goto(origine + '/bureau/index.html#bureau');
  await page.click('#mode'); await page.setInputFiles('#fichier-sauvegarde', path.join(dossier, 'sauvegarde.json'));
  await page.waitForSelector('text=Ancienne sauvegarde V47'); await page.click('#mode');
  for (const [t, f] of [['pieces', 'pieces.csv'], ['clients', 'clients.csv']]) {
    await page.setInputFiles('#ebp-' + t, path.join(dossier, f));
    await page.waitForSelector('#ebp-' + t + ' >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]');
  }
  await page.evaluate(() => { location.hash = 'ville'; });
  await page.waitForSelector('svg[aria-label^="Ville ODICOLOR"]');
}

test('démo : les 4 couleurs sont présentes, le noir a toujours son liseré blanc', async () => {
  const { ctx, page, erreurs } = await ouvrir();
  try {
    await page.goto(origine + '/bureau/index.html#ville'); await page.waitForSelector('svg[aria-label^="Ville ODICOLOR"]');
    const a = await anneaux(page), vues = new Set(a.map(x => COULEURS[x.couleur]));
    for (const s of ['client-carrosserie', 'client-mecanique', 'prospect-carrosserie', 'prospect-mecanique']) assert.ok(vues.has(s), s);
    for (const x of a) assert.equal(x.lisere, x.couleur === '#0B0B0D', x.nom);
    const legende = await page.textContent('.legende');
    for (const l of ['Client ODICOLOR carrosserie', 'Client ODICOLOR Mécan', 'Prospect carrosserie', 'Prospect mécanique']) assert.ok(legende.includes(l), l);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('démo : filtre « Client ODICOLOR Mécan » → uniquement des personnages noirs à liseré', async () => {
  const { ctx, page } = await ouvrir();
  try {
    await page.goto(origine + '/bureau/index.html#ville'); await page.waitForSelector('svg[aria-label^="Ville ODICOLOR"]');
    await page.click('.puce:has-text("Client ODICOLOR Mécan")');
    const a = await anneaux(page);
    assert.ok(a.length > 0);
    assert.ok(a.every(x => x.couleur === '#0B0B0D' && x.lisere));
  } finally { await ctx.close(); }
});

test('Ville connectée à EBP : couleur par famille EBP, alertes conservées, client inactif identifiable', async () => {
  const { ctx, page, erreurs } = await ouvrir();
  try {
    await villeConnectee(page);
    const a = await anneaux(page), de = n => COULEURS[a.find(x => x.nom.startsWith(n + ',')).couleur];
    assert.equal(de('GARAGE FICTIF ALPHA'), 'client-carrosserie');
    assert.equal(de('GARAGE FICTIF BETA'), 'client-mecanique');
    assert.equal(de('GARAGE FICTIF GAMMA'), 'client-carrosserie', 'compte bloqué : reste client carrosserie');
    assert.match(a.find(x => x.nom.startsWith('GARAGE FICTIF GAMMA,')).nom, /Risque de règlement/, 'alerte toujours annoncée');
    assert.equal(de('CARROSSERIE FICTIVE DU PARC'), 'prospect-carrosserie');
    assert.equal(de('PNEUS FICTIFS'), 'prospect-mecanique');
    assert.equal(de('GARAGE FICTIF NU'), 'a_qualifier', 'activité inconnue : gris, jamais devinée');
    assert.match(await page.textContent('#kpis'), /Risque règlement\s*1/);
    await page.click('.puce:has-text("Alertes")');
    const alertes = (await anneaux(page)).map(x => x.nom.split(',')[0]).sort();
    assert.deepEqual(alertes, ['GARAGE FICTIF ANCIEN', 'GARAGE FICTIF GAMMA']);
    await page.evaluate(() => { [...document.querySelectorAll('.perso')].find(p => p.getAttribute('aria-label').startsWith('GARAGE FICTIF ANCIEN,')).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await page.waitForSelector('.fiche');
    assert.match(await page.textContent('.fiche'), /Client ODICOLOR Mécan[\s\S]*Client EBP inactif/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('style LEGO Premium : animations des personnages et LED des bâtiments inchangées', async () => {
  const { ctx, page } = await ouvrir();
  try {
    await page.goto(origine + '/bureau/index.html#ville'); await page.waitForSelector('svg[aria-label^="Ville ODICOLOR"]');
    assert.equal(await page.$eval('.agent', e => getComputedStyle(e).animationName), 'balance');
    const led = await page.$$eval('svg[aria-label^="Ville ODICOLOR"] polygon.neon', l => [...new Set(l.map(p => p.getAttribute('fill')))]);
    assert.ok(led.length > 0 && led.every(c => ['#2FA866', '#3E7BE0', '#E8922B', '#C81E2A'].includes(c)), 'LED des bâtiments : couleurs d’origine (' + led + ')');
  } finally { await ctx.close(); }
});
