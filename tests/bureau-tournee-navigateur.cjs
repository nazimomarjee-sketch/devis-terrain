'use strict';
// Lot 2 : ordre de tournée dans le Bureau. Sauvegarde téléphone FICTIVE, date figée, Internet coupé.
// Exécution : node tests/bureau-tournee-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { chromium } = require('playwright');

const racine = path.resolve(__dirname, '..');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
let nav, serveur, origine, dossier;

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-tournee-'));
  fs.writeFileSync(path.join(dossier, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', reglages: {}, devis: [],
    clients: [{ id: 1, nom: 'GARAGE FICTIF ALPHA', ville: 'Massy', cp: '91300', statutCrm: 'client' }, { id: 2, nom: 'GARAGE FICTIF BETA', ville: 'Les Ulis', cp: '91940', statutCrm: 'client' },
      { id: 3, nom: 'GARAGE FICTIF GAMMA', ville: 'Orsay', cp: '91400', statutCrm: 'prospect' }] }));
  serveur = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), f = path.resolve(racine, '.' + p);
    if (!f.startsWith(racine + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
  });
  await new Promise(r => serveur.listen(0, '127.0.0.1', r)); origine = 'http://127.0.0.1:' + serveur.address().port;
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await nav?.close(); await new Promise(r => serveur.close(r)); fs.rmSync(dossier, { recursive: true, force: true }); });

test('« Planifier une visite » : ordre proposé depuis Palaiseau, km annoncés comme estimation, une ligne par garage', async () => {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('dialog', d => d.accept());
  try {
    await p.clock.setFixedTime(new Date('2026-11-06T09:00:00'));
    await p.goto(origine + '/bureau/index.html#carte-91'); await p.waitForSelector('#mode');
    await p.click('#mode');
    await p.setInputFiles('#fichier-sauvegarde', path.join(dossier, 'sauvegarde.json'));
    await p.waitForSelector('button.ligne');
    for (const nom of ['GARAGE FICTIF BETA', 'GARAGE FICTIF ALPHA']) {
      await p.click(`button.ligne:has-text("${nom}")`);
      await p.click('text=Planifier une visite');
      await p.waitForSelector('aside.fiche', { state: 'detached' }); // la fiche se ferme d'elle-même après l'ajout
    }
    await p.waitForSelector('[data-tournee="resume"]');
    assert.match(await p.textContent('[data-tournee="resume"]'), /Ordre proposé depuis Palaiseau, retour compris · environ \d+ km \(estimation\)/);
    const etapes = await p.$$eval('[data-tournee="etape"]', l => l.map(x => x.textContent));
    assert.equal(etapes.length, 2); assert.ok(etapes.every(t => !/à placer toi-même/.test(t)), 'communes du 91 : positions connues');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
