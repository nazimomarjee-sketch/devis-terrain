'use strict';
// Plan du PC le matin : un export EBP daté du jour doit être accepté AVANT midi (cockpit du matin).
// Défaut corrigé : commercial-v22.js comptait des heures (« daté de -1 jours » entre minuit et midi).
// Vérifie aussi, dans l'appli complète, les 3 fonctions qui dépendent de « chiffre » et « sources » :
// ligne EBP de l'accueil, garage présélectionné pour la note terrain, page Opportunités.
// Serveur local, profil jetable, données 100 % fictives. Exécution : node tests/plan-pc-matin-browser.cjs
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser, server, origin, dossier;

// Plan v2 fictif au format produit par le Bureau (bureau/pipeline.js).
function plan(arrete) {
  const k = (debut, fin) => ({ debut, fin, cmdN: 1, cmdHt: 500, facN: 0, facHt: 0 });
  return { appli: 'plan-pc', version: 2, date: arrete + 'T06:00:00.000Z', arrete, chiffre: { source: 'import', arrete },
    sources: { ebpDate: arrete, importStats: { pieces: { ignorees: 0 } }, preuvesCommerciales: { fiable: true, restrictions: [], signaux: 1 } },
    kpi: { semaine: k('2026-11-02', '2026-11-08'), passee: k('2026-10-26', '2026-11-01'), avant: k('2026-10-19', '2026-10-25'), mois: k('2026-11-01', '2026-11-30'), moisPrec: k('2026-10-01', '2026-10-31') },
    indicateurs: [], changement: null,
    actions: [{ id: 'chaine:reconquete:C101', prio: 1, statut: 'a_faire', t: 'Reconquérir : GARAGE FICTIF OMEGA', d: 'Plus de commande depuis 114 j', tag: 'Visite', responsable: 'Toi',
      client: 'GARAGE FICTIF OMEGA', preuve: 'CA commandé sur 12 mois : 7 200,00 € HT (fictif)', source: 'Export EBP du ' + arrete, qualite: 'Historique de commandes EBP', jour: arrete }],
    clients: [{ nom: 'GARAGE FICTIF OMEGA', code: 'C101', niveau: 'warn', lignes: ['À reconquérir · Aucune commande depuis 114 j'],
      signaux: [{ type: 'reconquete', titre: 'Aucune commande depuis 114 j (dernière le 2026-07-15)', preuve: 'CA commandé sur 12 mois : 7 200,00 € HT (fictif)',
        source: 'Export EBP du ' + arrete + ' (commandes)', dateDernier: '2026-07-15', ca12: 7200, pieces: ['CC-7009'], seuil: 'Plus de 60 jours sans commande', actionId: 'chaine:reconquete:C101' }] }] };
}

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-matin-'));
  fs.writeFileSync(path.join(dossier, 'plan.json'), JSON.stringify(plan('2026-11-06')));
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://localhost').pathname, file = path.resolve(root, '.' + (p === '/' ? '/index.html' : p));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); res.end(fs.readFileSync(file));
  });
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); });
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (server?.listening) await new Promise(r => server.close(r)); fs.rmSync(dossier, { recursive: true, force: true }); });

async function telephoneAvecPlan(heure) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message)); page.on('dialog', d => d.accept());
  await page.clock.setFixedTime(new Date('2026-11-06T' + heure + ':00'));
  await page.goto(origin + '/#/reglages');
  await page.getByRole('button', { name: 'Télécharger une sauvegarde chiffrée', exact: true }).waitFor();
  await page.evaluate(() => putMany('clients', [{ id: 1, nom: 'GARAGE FICTIF OMEGA', ville: 'Massy', statutCrm: 'client' }, { id: 2, nom: 'GARAGE FICTIF KAPPA', ville: 'Palaiseau', statutCrm: 'client' }]));
  await page.click('text=Plan commercial du PC');
  await page.getByLabel('Plan PC à importer').setInputFiles(path.join(dossier, 'plan.json'));
  await page.getByRole('button', { name: 'Importer le plan PC' }).click();
  await page.waitForSelector('text=Plan du PC importé : 1 action(s)');
  return { context, page, erreurs };
}

for (const heure of ['08:30', '11:59', '14:00', '23:30']) test('export du jour accepté à ' + heure + ' : opportunités, accueil EBP et garage présélectionné', async () => {
  const { context, page, erreurs } = await telephoneAvecPlan(heure);
  try {
    const f = await page.evaluate(async () => window.__commercialV22.fiabilite(await lirePC()));
    assert.deepEqual(f.ok, true, f.raison);
    // 1. Opportunités : le signal EBP du client est affiché.
    await page.goto(origin + '/#/opportunites');
    await page.waitForSelector('text=Client à reconquérir');
    assert.match(await page.textContent('body'), /GARAGE FICTIF OMEGA[\s\S]*Aucune commande depuis 114 j/);
    // 2. Accueil : la ligne « montants EBP » et 3. le garage présélectionné pour la note terrain.
    await page.goto(origin + '/#/');
    await page.getByLabel('Détails du CA facturé', {exact:true}).click();
    await page.waitForSelector('text=montants EBP à consulter sur Mon travail');
    await page.waitForSelector('.v29-home-note small:has-text("Pour GARAGE FICTIF OMEGA")');
    assert.deepEqual(erreurs, []);
  } finally { await context.close(); }
});

test('export de plus de 7 jours : opportunités toujours suspendues (règle inchangée)', async () => {
  const { context, page } = await telephoneAvecPlan('09:00');
  try {
    await page.clock.setFixedTime(new Date('2026-11-14T09:00:00'));
    const f = await page.evaluate(async () => window.__commercialV22.fiabilite(await lirePC()));
    assert.equal(f.ok, false);
    assert.match(f.raison, /daté de 8 jours/);
  } finally { await context.close(); }
});
