'use strict';
// Lot 5 : écran Commerce du Bureau. Sauvegarde .odicolor FICTIVE produite par le code du téléphone + exports EBP fictifs.
// Exécution : node tests/bureau-commerce-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { chromium } = require('playwright');
const D = require('../demandes-v50.js'), PH = require('../sauvegarde-locale.js');
const racine = path.resolve(__dirname, '..');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
let nav, serveur, origine, dossier;
const M = '2026-11-02T09:00:00.000Z';
before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-commerce-'));
  let d = D.nouvelle({ id: 1, nom: 'GARAGE FICTIF PARCOURS', codeEbp: 'C901' }, { uid: 'U-P', maintenant: M });
  d = D.ajouterLigne(d, { ref: 'CS-FICT-01', des: 'Vernis fictif', marque: 'Carsystem', qte: 4 });
  for (const [v, x] of [['a_traiter', {}], ['traite_ebp', { noDevisEbp: 'DE-F1' }], ['envoye', {}], ['accepte', {}]]) d = D.passer(d, v, { maintenant: M, ...x });
  let d2 = D.nouvelle({ id: 2, nom: 'GARAGE FICTIF ATTENTE', codeEbp: 'C902' }, { uid: 'U-A', maintenant: M }); d2 = { ...d2, besoins: 'Mastic' };
  for (const [v, x] of [['a_traiter', {}], ['traite_ebp', { noDevisEbp: 'DE-F2' }], ['envoye', {}]]) d2 = D.passer(d2, v, { maintenant: M, ...x });
  const stores = { articles: [], devis: [], clients: [{ id: 1, nom: 'GARAGE FICTIF PARCOURS', ville: 'Massy', cp: '91300', statutCrm: 'client' }, { id: 2, nom: 'GARAGE FICTIF ATTENTE', ville: 'Orsay', cp: '91400', statutCrm: 'client' }],
    meta: [['settings', {}], ['demandesDevis', [d, d2]]] };
  fs.writeFileSync(path.join(dossier, 'sauvegarde.odicolor'), Buffer.from(await (await PH.encode(stores)).file.arrayBuffer()));
  fs.writeFileSync(path.join(dossier, 'pieces.csv'), ['Type;N° pièce;Date;Code client;Client;Montant HT;N° de pièce d’origine',
    'Devis;DE-F1;02/11/2026;C901;GARAGE FICTIF PARCOURS;1 000,00;', 'Devis;DE-F2;02/11/2026;C902;GARAGE FICTIF ATTENTE;500,00;',
    'Commande;CC-F1;05/11/2026;C901;GARAGE FICTIF PARCOURS;1 000,00;DE-F1', 'Facture;FA-F1;07/11/2026;C901;GARAGE FICTIF PARCOURS;1 000,00;CC-F1'].join('\n'));
  fs.writeFileSync(path.join(dossier, 'reglements.csv'), 'N° facture;Échéance;Date de règlement;Montant TTC;Reste à payer\nFA-F1;07/12/2026;10/11/2026;1 200,00;480,00\n');
  serveur = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), f = path.resolve(racine, '.' + p);
    if (!f.startsWith(racine + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
  await new Promise(r => serveur.listen(0, '127.0.0.1', r)); origine = 'http://127.0.0.1:' + serveur.address().port;
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await nav?.close(); await new Promise(r => serveur.close(r)); fs.rmSync(dossier, { recursive: true, force: true }); });

test('Commerce : parcours garage → demande → devis EBP → commande → facture → encaissement, indicateurs sourcés', async () => {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('dialog', d => d.accept());
  try {
    await p.clock.setFixedTime(new Date('2026-11-14T09:00:00'));
    await p.goto(origine + '/bureau/index.html#commerce'); await p.waitForSelector('[data-commerce="tableau"]');
    assert.match(await p.textContent('[data-commerce="ca"]'), /Non renseigné/, 'démo : jamais un CA fictif présenté comme réel');
    await p.click('#mode'); await p.setInputFiles('#fichier-sauvegarde', path.join(dossier, 'sauvegarde.odicolor'));
    await p.waitForFunction(() => document.querySelector('#mode').textContent.trim() !== 'Démo');
    await p.goto(origine + '/bureau/index.html#bureau'); await p.waitForSelector('#ebp-pieces', { state: 'attached' });
    await p.setInputFiles('#ebp-pieces', path.join(dossier, 'pieces.csv')); await p.waitForSelector('#ebp-pieces >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]');
    await p.setInputFiles('#ebp-reglements', path.join(dossier, 'reglements.csv')); await p.waitForSelector('#ebp-reglements >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]');
    await p.fill('#ebp-arrete', '2026-11-14'); await p.dispatchEvent('#ebp-arrete', 'change');
    await p.evaluate(() => { location.hash = '#commerce'; }); await p.waitForSelector('[data-suivi="U-P"]');
    const t = s => p.textContent(s).then(x => x.replace(/\s+/g, ' ').trim());
    assert.match(await t('[data-suivi="U-P"]'), /Facturé \(EBP\) · DE-F1 · CC-F1 · FA-F1/);
    assert.match(await t('[data-suivi="U-P"]'), /Facturé 1 000,00 € HT · encaissé 720,00 € TTC · reste 480,00 € TTC/);
    assert.match(await t('[data-suivi="U-A"]'), /Devis EBP · DE-F2/);
    assert.match(await t('[data-commerce="ca"]'), /1 000,00 € HT/);
    assert.match(await t('[data-commerce="objectif"]'), /Non renseigné.*20 000 € HT/);
    assert.match(await t('[data-commerce="attente"]'), /^1/); assert.match(await t('[data-commerce="taux"]'), /100 % \(1\)/);
    assert.match(await t('[data-commerce="relancer"]'), /^1.*GARAGE FICTIF ATTENTE/);
    assert.match(await t('[data-commerce="ecommerce"]'), /Désactivée : aucun panier public, aucun paiement/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
