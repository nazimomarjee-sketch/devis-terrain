'use strict';
// Application locale ODICOLOR 2.0 — étape 2 : Bureau relié au coffre chiffré, de bout en bout dans Chromium.
// Données FICTIVES. Le programme local tourne dans un vrai processus séparé, arrêté BRUTALEMENT puis relancé.
// Exécution : node tests/local-bureau-navigateur.cjs   (captures : CAPTURES=dossier node tests/local-bureau-navigateur.cjs)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { chercherEnClair } = require('./support/en-clair.cjs');
const { demarrer } = require('../local/serveur.js');

const SERVEUR = path.resolve(__dirname, '..', 'local', 'serveur.js');
const MDP = 'Phrase-Fictive-Du-Coffre-2026';
let nav, travail;

before(async () => {
  travail = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-local-'));
  const ecrire = (n, l) => fs.writeFileSync(path.join(travail, n), Buffer.from(l.map(x => x.join(';')).join('\r\n') + '\r\n', 'latin1'));
  ecrire('clients.csv', [['Code client', 'Raison sociale', 'Ville', 'Code postal', 'Statut du compte', 'Famille client'],
    ['C001', 'GARAGE FICTIF ALPHA', 'Massy', '91300', 'Actif', 'Carrosserie'], ['C002', 'GARAGE FICTIF BETA', 'Palaiseau', '91120', 'Bloqué', 'Mécan']]);
  ecrire('pieces.csv', [['Type de pièce', 'N° pièce', 'Date', 'Code client', 'Nom du client', 'Montant HT', 'N° pièce d\'origine'],
    ['Commande client', 'CC-1', '03/11/2026', 'C001', 'GARAGE FICTIF ALPHA', '1 100,00', ''], ['Facture client', 'FA-1', '04/11/2026', 'C001', 'GARAGE FICTIF ALPHA', '1 100,00', 'CC-1'],
    ['Commande client', 'CC-0', '15/10/2025', 'C002', 'GARAGE FICTIF BETA', '700,00', '']]);
  ecrire('reglements.csv', [['N° facture', 'Date d\'échéance', 'Date de règlement', 'Montant TTC', 'Reste à payer'], ['FA-1', '05/12/2026', '', '1 320,00', '1 320,00']]);
  const clients = [['GARAGE FICTIF ALPHA', 'Massy', '91300', 'client'], ['GARAGE FICTIF BETA', 'Palaiseau', '91120', 'client'], ['CARROSSERIE FICTIVE DU PARC', 'Orsay', '91400', 'prospect']]
    .map(([nom, ville, cp, statutCrm], i) => ({ id: i + 1, nom, ville, cp, statutCrm }));
  fs.writeFileSync(path.join(travail, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', clients, devis: [] }));
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await nav?.close(); fs.rmSync(travail, { recursive: true, force: true }); });

// Programme local dans un processus séparé (comme sur le PC). Renvoie son adresse et son journal.
function lancer(dossier) {
  return new Promise((ok, ko) => {
    const p = spawn(process.execPath, [SERVEUR, '--dossier', dossier, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let journal = '';
    const lire = d => { journal += d; const m = /prête : (http:\/\/127\.0\.0\.1:\d+\/)/.exec(journal); if (m && !p.adresse) { p.adresse = m[1]; ok(p); } };
    p.stdout.on('data', lire); p.stderr.on('data', d => { journal += d; });
    p.on('exit', c => { if (!p.adresse) ko(new Error('Arrêt au démarrage : ' + journal)); });
    p.journal = () => journal;
    setTimeout(() => ko(new Error('Démarrage trop long')), 15000);
  });
}
const tuer = p => new Promise(r => { p.once('exit', r); p.kill('SIGKILL'); }); // coupure brutale : aucune fermeture propre

async function page(adresse) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: process.env.CAPTURES ? 2 : 1 });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // Internet coupé
  const p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  p.on('console', m => { if (/Content Security Policy|Refused to/.test(m.text())) erreurs.push(m.text()); });
  await p.clock.setFixedTime(new Date('2026-11-06T09:00:00'));
  await p.goto(adresse);
  return { ctx, p, erreurs };
}
const generation = p => p.evaluate(() => Number(document.documentElement.dataset.coffreGeneration || 0));
async function attendreEnregistrement(p, avant) { await p.waitForFunction(g => Number(document.documentElement.dataset.coffreGeneration || 0) > g, avant); }
async function importerEbp(p, type, f) {
  const g = await generation(p);
  await p.setInputFiles('#ebp-' + type, path.join(travail, f));
  await attendreEnregistrement(p, g);
}
const capture = async (p, nom) => { if (process.env.CAPTURES) { fs.mkdirSync(process.env.CAPTURES, { recursive: true }); await p.screenshot({ path: path.join(process.env.CAPTURES, nom + '.png') }); } };

test('création du coffre, imports, ARRÊT BRUTAL, redémarrage : cockpit, garages et Ville retrouvés après mot de passe', async () => {
  const dossier = path.join(travail, 'coffre-1');
  let prog = await lancer(dossier), ctx, p, erreurs;
  try {
  // 1. Première ouverture : écran de création, clé de secours affichée une fois.
  ({ ctx, p, erreurs } = await page(prog.adresse));
  await p.waitForSelector('#f-creer:not([hidden])');
  await capture(p, 'local-1-creation');
  await p.fill('#nouveau-mdp', MDP); await p.fill('#nouveau-mdp2', MDP); await p.click('#creer');
  await p.waitForSelector('#s-secours-cle:not([hidden])');
  assert.match(await p.textContent('#cle-secours'), /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  assert.equal(await p.isDisabled('#continuer'), true, 'impossible de continuer sans confirmer avoir noté la clé');
  await p.check('#note'); await p.click('#continuer');
  await p.waitForSelector('html[data-coffre="pret"]');
  assert.match(p.url(), /\/bureau\/index\.html#bureau$/);
  // 2. Imports fictifs : chacun est enregistré dans le coffre.
  await p.click('#mode'); let g = await generation(p);
  await p.setInputFiles('#fichier-sauvegarde', path.join(travail, 'sauvegarde.json')); await attendreEnregistrement(p, g);
  await p.click('#mode');
  for (const [t, f] of [['pieces', 'pieces.csv'], ['reglements', 'reglements.csv'], ['clients', 'clients.csv']]) await importerEbp(p, t, f);
  const voyants = await p.textContent('.reveil .sous');
  assert.match(voyants, /^\d+ allumé/);
  const personnages = async () => { await p.evaluate(() => { location.hash = 'ville'; }); await p.waitForSelector('svg[aria-label^="Ville ODICOLOR"]');
    return p.$$eval('.perso', l => l.map(x => x.getAttribute('aria-label')).sort()); };
  const villeAvant = await personnages();
  assert.ok(villeAvant.some(x => x.startsWith('GARAGE FICTIF ALPHA,')));
  // Lot 7 : objectif et seuils réglés dans le Pilotage, enregistrés dans le coffre (et non seulement dans ce navigateur).
  await p.evaluate(() => { location.hash = 'pilotage'; }); await p.waitForSelector('[data-pilotage="objectif-saisie"]');
  g = await generation(p); await p.fill('[data-pilotage="objectif-saisie"]', '20000'); await p.dispatchEvent('[data-pilotage="objectif-saisie"]', 'change'); await attendreEnregistrement(p, g);
  await p.click('[data-pilotage="reglages"] summary'); await p.fill('[data-seuil="devisSansCommandeJours"]', '14');
  g = await generation(p); await p.click('[data-pilotage="enregistrer-reglages"]'); await attendreEnregistrement(p, g);
  await ctx.close();
  // 3. Coupure brutale du programme local (comme une panne de courant), puis relance.
  await tuer(prog);
  prog = await lancer(dossier);
  ({ ctx, p, erreurs } = await page(prog.adresse));
  await p.waitForSelector('#f-ouvrir:not([hidden])');
  await capture(p, 'local-2-mot-de-passe');
  // Mauvais mot de passe : refus, rien n'apparaît.
  await p.fill('#mdp', 'Mauvais-mot-de-passe-fictif'); await p.click('#valider');
  await p.waitForSelector('#message.erreur');
  assert.match(await p.textContent('#message'), /incorrect/);
  assert.equal(await p.inputValue('#mdp'), '', 'champ vidé après envoi');
  await p.fill('#mdp', MDP); await p.click('#valider');
  await p.waitForSelector('html[data-coffre="pret"]');
  // 4. Tout est retrouvé : voyants identiques, garages réels, message daté.
  await p.waitForSelector('.reveil');
  assert.equal(await p.textContent('.reveil .sous'), voyants);
  assert.match(await p.textContent('.reveil [data-id="ville"]'), /3 garages/);
  assert.equal(await p.textContent('#mode'), 'Mes garages');
  // Lot 7 : réglages retrouvés depuis le coffre (nouveau navigateur : rien dans son stockage local).
  await p.evaluate(() => { location.hash = 'pilotage'; }); await p.waitForSelector('[data-pilotage="objectif"]');
  assert.match((await p.textContent('[data-pilotage="objectif"]')).replace(/\s+/g, ' '), /20 000,00 € HT/);
  await p.click('[data-pilotage="reglages"] summary'); assert.equal(await p.inputValue('[data-seuil="devisSansCommandeJours"]'), '14');
  await p.evaluate(() => { location.hash = 'bureau'; }); await p.waitForSelector('.reveil');
  await capture(p, 'local-3-cockpit-retrouve');
  assert.deepEqual(await personnages(), villeAvant, 'Ville LEGO : mêmes personnages (nom, segment, alerte) qu’avant la coupure');
  assert.equal(await p.$eval('.agent', x => getComputedStyle(x).animationName), 'balance', 'animations intactes');
  await capture(p, 'local-4-ville-retrouvee');
  assert.deepEqual(erreurs, [], 'aucune erreur ni blocage de sécurité dans la page');
  await ctx.close(); await tuer(prog);
  // 5. Rien en clair : ni mot de passe, ni noms de garages, ni montants, dans les fichiers du coffre ou le journal du programme.
  const disque = fs.readdirSync(dossier).map(f => fs.readFileSync(path.join(dossier, f), 'latin1')).join('\n') + prog.journal();
  assert.deepEqual(chercherEnClair(disque, [MDP, 'Mauvais-mot-de-passe', 'GARAGE FICTIF ALPHA', 'CARROSSERIE FICTIVE DU PARC', '1 100,00', '"code":"C001"']), [], 'rien en clair');
  } finally { await ctx?.close().catch(() => {}); if (prog.exitCode === null && !prog.signalCode) await tuer(prog); }
});

test('verrouillage après inactivité : retour à l’écran de mot de passe ; la démo n’est jamais enregistrée', async () => {
  const dossier = path.join(travail, 'coffre-2');
  const app = await demarrer({ dossier, port: 0, delaiVerrouillageMs: 2500, controleMs: 1000, journal: () => {} });
  const { ctx, p } = await page(app.adresse);
  try {
    await p.waitForSelector('#f-creer:not([hidden])');
    await p.fill('#nouveau-mdp', MDP); await p.fill('#nouveau-mdp2', MDP); await p.click('#creer');
    await p.check('#note'); await p.click('#continuer'); await p.waitForSelector('html[data-coffre="pret"]');
    // Démo affichée, rien importé : le coffre reste vide.
    const etat = await p.evaluate(async () => (await (await fetch('/api/etat', { headers: { 'X-ODICOLOR': '1' } })).json()).etat);
    assert.equal(etat, null, 'la démo n’est jamais enregistrée');
    // Inactivité : le coffre se verrouille, la page revient à l'écran de mot de passe.
    await p.clock.runFor(0); // horloge figée pour les dates seulement : les minuteries tournent normalement
    await p.waitForURL(/\/ouvrir\.html\?raison=verrouille$/, { timeout: 15000 });
    await p.waitForSelector('#f-ouvrir:not([hidden])');
    assert.match(await p.textContent('#message'), /verrouillé/);
    assert.equal((await p.evaluate(async () => (await fetch('/api/etat', { headers: { 'X-ODICOLOR': '1' } })).status)), 401);
  } finally { await ctx.close(); await app.arreter(); }
});

test('le Bureau ouvert sans l’application locale (double-clic) fonctionne comme avant, sans rien chercher à enregistrer', async () => {
  const ctx = await nav.newContext(); await ctx.route(/^https?:\/\//, r => r.abort()); const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '..', 'bureau', 'index.html') + '#bureau');
  await p.waitForSelector('.reveil');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.coffre || ''), '');
  assert.deepEqual(erreurs, []); await ctx.close();
});
