'use strict';
// Lot A — décisions de compte enregistrées dans le coffre chiffré, de bout en bout : vrai programme local (processus séparé),
// fermeture, ARRÊT BRUTAL, relance, mot de passe, récupération. DONNÉES FICTIVES.
// Exécution : node tests/local-decisions-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { chercherEnClair } = require('./support/en-clair.cjs');

const SERVEUR = path.resolve(__dirname, '..', 'local', 'serveur.js');
const MDP = 'Phrase-Fictive-Du-Coffre-2026';
const AUTEUR = 'Vérificateur fictif';
let nav, travail;
const garages = renomme => [['CARROSSERIE FICTIVE UN', 'Goussainville', '95190', 'prospect'], [renomme || 'GARAGE FICTIF DEUX', 'Goussainville', '95190', 'client'],
  ['MÉCA FICTIVE TROIS', 'Gonesse', '95500', 'prospect'], ['CARROSSERIE FICTIVE QUATRE', 'Gonesse', '95500', 'prospect']].map(([nom, ville, cp, statutCrm], i) => ({ id: i + 1, nom, ville, cp, statutCrm }));

before(async () => {
  travail = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-decisions-'));
  const ecrire = (n, l) => fs.writeFileSync(path.join(travail, n), Buffer.from(l.map(x => x.join(';')).join('\r\n') + '\r\n', 'latin1'));
  ecrire('clients.csv', [['Code client', 'Raison sociale', 'Ville', 'Code postal', 'Statut du compte', 'Famille client'],
    ['C10', 'SARL GARAGE FICTIF DEUX', 'Goussainville', '95190', 'Actif', 'Carrosserie'], ['C20', 'CARROSSERIE FICTIVE QUATRE', 'Gonesse', '95500', 'Actif', 'Carrosserie']]);
  fs.writeFileSync(path.join(travail, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', clients: garages(), devis: [] }));
  fs.writeFileSync(path.join(travail, 'sauvegarde-renommee.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-07T06:00:00.000Z', clients: garages('AUTRE NOM FICTIF'), devis: [] }));
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await nav?.close(); fs.rmSync(travail, { recursive: true, force: true }); });

function lancer(dossier) {
  return new Promise((ok, ko) => {
    const p = spawn(process.execPath, [SERVEUR, '--dossier', dossier, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let journal = '';
    const lire = d => { journal += d; const m = /prête : (http:\/\/127\.0\.0\.1:\d+\/)/.exec(journal); if (m && !p.adresse) { p.adresse = m[1]; ok(p); } };
    p.stdout.on('data', lire); p.stderr.on('data', d => { journal += d; });
    p.on('exit', () => { if (!p.adresse) ko(new Error('Arrêt au démarrage : ' + journal)); });
    p.journal = () => journal;
    setTimeout(() => ko(new Error('Démarrage trop long')), 15000);
  });
}
const tuer = p => new Promise(r => { if (p.exitCode !== null || p.signalCode) return r(); p.once('exit', r); p.kill('SIGKILL'); });
async function page(adresse) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-07T09:00:00'));
  await p.goto(adresse);
  return { ctx, p, erreurs };
}
const generation = p => p.evaluate(() => Number(document.documentElement.dataset.coffreGeneration || 0));
const attendre = (p, g) => p.waitForFunction(x => Number(document.documentElement.dataset.coffreGeneration || 0) > x, g);
async function creer(p) {
  await p.waitForSelector('#f-creer:not([hidden])');
  await p.fill('#nouveau-mdp', MDP); await p.fill('#nouveau-mdp2', MDP); await p.click('#creer');
  await p.waitForSelector('#s-secours-cle:not([hidden])'); await p.check('#note'); await p.click('#continuer');
  await p.waitForSelector('html[data-coffre="pret"]');
}
async function ouvrirCoffre(p) { await p.waitForSelector('#f-ouvrir:not([hidden])'); await p.fill('#mdp', MDP); await p.click('#valider'); await p.waitForSelector('html[data-coffre="pret"]'); }
async function importer(p, sel, f) { const g = await generation(p); await p.setInputFiles(sel, path.join(travail, f)); await attendre(p, g); }
const decider = async (p, d) => { const g = await generation(p); const r = await p.evaluate(d => window.OdicolorBureau.decisions.decider(d), d); await attendre(p, g); return r; };
const photo = p => p.evaluate(() => ({ journal: OdicolorBureau.decisions.journal(), etats: OdicolorBureau.decisions.appliquer().etats.map(e => [e.id, e.etat]),
  telephone: OdicolorBureau.exporter().telephone, garages: OdicolorBureau.exporter().garagesTelephone.length }));

test('1. décisions enregistrées, page fermée, programme ARRÊTÉ BRUTALEMENT, relance : tout est retrouvé à l’identique', async () => {
  const dossier = path.join(travail, 'coffre-1');
  let prog = await lancer(dossier), ctx, p, erreurs;
  try {
    ({ ctx, p, erreurs } = await page(prog.adresse)); await creer(p);
    await p.click('#mode'); await importer(p, '#fichier-sauvegarde', 'sauvegarde.json'); await p.click('#mode');
    await importer(p, '#ebp-clients', 'clients.csv');
    const g = n => ({ tel: n, nom: garages()[n - 1].nom, cp: garages()[n - 1].cp });
    const d1 = await decider(p, { type: 'liaison', cible: g(2), codeEbp: 'C10', auteur: AUTEUR });
    await decider(p, { type: 'absence', cible: g(1), auteur: AUTEUR });
    await decider(p, { type: 'absence', cible: g(4), auteur: AUTEUR });
    assert.equal(d1.source, 'Liaison EBP validée par une personne'); assert.equal(d1.exportClientsDu, '2026-11-07', 'date de l’export clients consulté');
    const avant = await photo(p);
    assert.deepEqual(avant.etats, [['D000001', 'appliquee'], ['D000002', 'appliquee'], ['D000003', 'appliquee']], 'une ressemblance de nom n’annule pas la décision');
    assert.match(await p.evaluate(() => OdicolorBureau.decisions.appliquer().etats[2].alerte), /C20.*à examiner/, 'G4 : alerte visible');
    await ctx.close();
    await tuer(prog); prog = await lancer(dossier);
    ({ ctx, p, erreurs } = await page(prog.adresse)); await ouvrirCoffre(p);
    await p.waitForSelector('#kpis .kpi', { state: 'attached' });
    assert.deepEqual(await photo(p), avant, 'journal, état de chaque décision et garages du téléphone identiques');
    assert.match(await p.evaluate(() => { document.querySelector('#mode').click(); return document.querySelector('#donnees').textContent; }), /3 décision\(s\) de compte retrouvée\(s\)/);
    assert.deepEqual(erreurs, []);
    await ctx.close(); await tuer(prog);
    const disque = fs.readdirSync(dossier).map(f => fs.readFileSync(path.join(dossier, f), 'latin1')).join('\n') + prog.journal();
    assert.deepEqual(chercherEnClair(disque, [AUTEUR, '"codeEbp":"C10"', 'GARAGE FICTIF DEUX', 'Liaison EBP validée par une personne', 'Absence de compte vérifiée dans EBP']), [], 'rien en clair');
  } finally { await ctx?.close().catch(() => {}); await tuer(prog); }
});

test('2. contradiction après un nouvel import : garage renommé → décision « à revérifier », historique et garages conservés', async () => {
  const dossier = path.join(travail, 'coffre-2');
  let prog = await lancer(dossier), ctx, p;
  try {
    ({ ctx, p } = await page(prog.adresse)); await creer(p);
    await p.click('#mode'); await importer(p, '#fichier-sauvegarde', 'sauvegarde.json'); await p.click('#mode');
    await importer(p, '#ebp-clients', 'clients.csv');
    await decider(p, { type: 'liaison', cible: { tel: 2, nom: 'GARAGE FICTIF DEUX', cp: '95190' }, codeEbp: 'C10', auteur: AUTEUR });
    await p.click('#mode'); await importer(p, '#fichier-sauvegarde', 'sauvegarde-renommee.json'); await p.click('#mode');
    const r = await p.evaluate(() => OdicolorBureau.decisions.appliquer());
    assert.equal(r.etats[0].etat, 'a_reverifier'); assert.match(r.etats[0].motif, /a changé/);
    assert.equal(r.liaisonsValidees.length, 0, 'jamais appliquée en silence');
    await ctx.close(); await tuer(prog); prog = await lancer(dossier);
    ({ ctx, p } = await page(prog.adresse)); await ouvrirCoffre(p); await p.waitForSelector('#kpis .kpi', { state: 'attached' });
    const apres = await photo(p);
    assert.equal(apres.journal.decisions.length, 1, 'historique conservé');
    assert.deepEqual(apres.etats, [['D000001', 'a_reverifier']]);
    assert.equal(apres.telephone.clients[1].nom, 'AUTRE NOM FICTIF'); assert.equal(apres.garages, 4, 'aucun garage perdu');
  } finally { await ctx?.close().catch(() => {}); await tuer(prog); }
});

test('3. ancien coffre (état version 1, avant le lot A) : s’ouvre, journal vide, puis décisions enregistrées en version 2', async () => {
  const dossier = path.join(travail, 'coffre-3');
  let prog = await lancer(dossier), ctx, p;
  try {
    ({ ctx, p } = await page(prog.adresse)); await creer(p);
    // L'ancien Bureau enregistrait un état version 1 : on l'écrit tel quel dans le coffre.
    const v1 = { version: 1, telephone: { date: '2026-11-06T06:00:00.000Z', clients: garages(), devis: [] }, garagesTelephone: [], rapport: null, ebp: { pieces: null, reglements: null, clients: null, arrete: '2026-11-06' } };
    v1.garagesTelephone = await p.evaluate(c => BureauLogique.lireClients(c, '2026-11-06').garages, v1.telephone.clients);
    assert.equal(await p.evaluate(async e => (await fetch('/api/etat', { method: 'PUT', headers: { 'X-ODICOLOR': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(e) })).status, v1), 200);
    await ctx.close(); await tuer(prog); prog = await lancer(dossier);
    ({ ctx, p } = await page(prog.adresse)); await ouvrirCoffre(p); await p.waitForSelector('#kpis .kpi', { state: 'attached' });
    assert.equal(await p.textContent('#mode'), 'Mes garages', 'ancien état retrouvé');
    assert.deepEqual((await photo(p)).journal, { version: 1, decisions: [] });
    await decider(p, { type: 'absence', cible: { tel: 3, nom: 'MÉCA FICTIVE TROIS', cp: '95500' }, auteur: AUTEUR });
    assert.equal(await p.evaluate(async () => (await (await fetch('/api/etat', { headers: { 'X-ODICOLOR': '1' } })).json()).etat.version), 2, 'enregistré en version 2');
    await ctx.close(); await tuer(prog); prog = await lancer(dossier);
    ({ ctx, p } = await page(prog.adresse)); await ouvrirCoffre(p); await p.waitForSelector('#kpis .kpi', { state: 'attached' });
    const f = await photo(p);
    assert.equal(f.journal.decisions.length, 1); assert.deepEqual(f.etats, [['D000001', 'appliquee']]);
    assert.deepEqual(f.telephone.clients, garages(), 'fiches du téléphone intactes');
  } finally { await ctx?.close().catch(() => {}); await tuer(prog); }
});

test('4. démo : aucune décision possible, rien enregistré', async () => {
  const dossier = path.join(travail, 'coffre-4');
  let prog = await lancer(dossier), ctx, p;
  try {
    ({ ctx, p } = await page(prog.adresse)); await creer(p);
    const g = await generation(p);
    const err = await p.evaluate(() => { try { OdicolorBureau.decisions.decider({ type: 'absence', cible: { tel: 1, nom: 'X', cp: '95190' }, auteur: 'X' }); return null; } catch (e) { return e.message; } });
    assert.match(err, /sauvegarde de ton téléphone/);
    await new Promise(r => setTimeout(r, 400));
    assert.equal(await generation(p), g, 'aucun enregistrement');
  } finally { await ctx?.close().catch(() => {}); await tuer(prog); }
});
