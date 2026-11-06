'use strict';
// Coffre inaccessible : AUCUNE décision de compte ne peut être enregistrée (pas seulement un avertissement). DONNÉES FICTIVES.
// Cas : programme local arrêté pendant que la page est ouverte ; coffre verrouillé ; relance et réouverture.
// Exécution : node tests/local-coffre-inaccessible-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const SERVEUR = path.resolve(__dirname, '..', 'local', 'serveur.js');
const MDP = 'Phrase-Fictive-Du-Coffre-2026', AUTEUR = 'Vérificateur fictif';
const GARAGES = [['CARROSSERIE FICTIVE UN', 'Goussainville', '95190', 'prospect'], ['MÉCA FICTIVE TROIS', 'Gonesse', '95500', 'prospect'], ['ATELIER FICTIF CINQ', 'Sarcelles', '95200', 'prospect']]
  .map(([nom, ville, cp, statutCrm], i) => ({ id: i + 1, nom, ville, cp, statutCrm }));
let nav, travail, prog;
before(async () => {
  travail = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-inacc-'));
  fs.writeFileSync(path.join(travail, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', clients: GARAGES, devis: [] }));
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
const tuer = p => new Promise(r => { if (!p || p.exitCode !== null || p.signalCode) return r(); p.once('exit', r); p.kill('SIGKILL'); });
after(async () => { await tuer(prog); await nav?.close(); fs.rmSync(travail, { recursive: true, force: true }); });

function lancer(dossier, port = 0) {
  return new Promise((ok, ko) => {
    const p = spawn(process.execPath, [SERVEUR, '--dossier', dossier, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let j = '';
    p.stdout.on('data', d => { j += d; const m = /prête : (http:\/\/127\.0\.0\.1:(\d+)\/)/.exec(j); if (m && !p.adresse) { p.adresse = m[1]; p.port = Number(m[2]); ok(p); } });
    p.stderr.on('data', d => { j += d; }); p.on('exit', () => { if (!p.adresse) ko(new Error(j)); });
    setTimeout(() => ko(new Error('Démarrage trop long')), 15000);
  });
}
async function page(adresse) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-07T09:00:00'));
  await p.goto(adresse);
  return { ctx, p, erreurs };
}
const gen = p => p.evaluate(() => Number(document.documentElement.dataset.coffreGeneration || 0));
const attendre = (p, g) => p.waitForFunction(x => Number(document.documentElement.dataset.coffreGeneration || 0) > x, g);
async function creer(p) { await p.waitForSelector('#f-creer:not([hidden])'); await p.fill('#nouveau-mdp', MDP); await p.fill('#nouveau-mdp2', MDP); await p.click('#creer');
  await p.waitForSelector('#s-secours-cle:not([hidden])'); await p.check('#note'); await p.click('#continuer'); await p.waitForSelector('html[data-coffre="pret"]'); }
async function ouvrir(p) { await p.waitForSelector('#f-ouvrir:not([hidden])'); await p.fill('#mdp', MDP); await p.click('#valider'); await p.waitForSelector('html[data-coffre="pret"]'); }
const decider = (p, n) => p.evaluate(g => { try { OdicolorBureau.decisions.decider({ type: 'absence', cible: g, auteur: 'Vérificateur fictif' }); return null; } catch (e) { return e.message; } },
  { tel: n, nom: GARAGES[n - 1].nom, cp: GARAGES[n - 1].cp });
const nbDecisions = p => p.evaluate(() => OdicolorBureau.decisions.journal().decisions.length);
const dossier = () => path.join(travail, 'coffre');

test('1. programme local arrêté, page ouverte : la décision est ANNULÉE, les suivantes REFUSÉES, rien de faux affiché', async () => {
  prog = await lancer(dossier());
  const port = prog.port;
  let { ctx, p, erreurs } = await page(prog.adresse);
  try {
    await creer(p);
    await p.click('#mode'); let g = await gen(p); await p.setInputFiles('#fichier-sauvegarde', path.join(travail, 'sauvegarde.json')); await attendre(p, g); await p.click('#mode');
    await p.evaluate(() => { location.hash = 'verifier-comptes'; }); await p.waitForSelector('.vf-compteurs');
    g = await gen(p); assert.equal(await decider(p, 1), null); await attendre(p, g);               // coffre vivant : la décision passe
    assert.equal(await nbDecisions(p), 1); assert.equal(await p.getAttribute('html', 'data-coffre'), 'enregistre');
    const avant = await p.evaluate(() => JSON.stringify(OdicolorBureau.decisions.journal()));

    await tuer(prog);                                                                              // le programme local s'arrête
    assert.equal(await decider(p, 2), null, 'pas encore détectable : la décision est tentée…');
    await p.waitForSelector('html[data-coffre="erreur"]');                                         // … l'enregistrement échoue
    assert.equal(await nbDecisions(p), 1, '… et la décision NON enregistrée est annulée');
    assert.equal(await p.evaluate(() => JSON.stringify(OdicolorBureau.decisions.journal())), avant, 'journal identique à celui du coffre');
    const refus = await decider(p, 3);
    assert.match(refus, /Les décisions de compte sont suspendues/, 'décision suivante refusée à la source');
    assert.equal(await nbDecisions(p), 1);
    await p.waitForSelector('[data-vf-msg]');
    assert.match(await p.textContent('[data-vf-msg]'), /1 décision\(s\) NON enregistrée\(s\) dans le coffre : annulée\(s\)/);
    assert.match(await p.textContent('.vf-enreg'), /⛔.*Enregistrement dans le coffre impossible/);
    await p.click('.vf-ligne');
    assert.equal(await p.isDisabled('[data-decision="absence"]'), true, 'bouton bloqué');
    assert.equal(await p.$$eval('.vf-hist li', l => l.length), 0, 'aucune décision fantôme dans l’historique');
    await ctx.close();

    // Relance du programme, mot de passe : seule la décision enregistrée existe, et les décisions sont de nouveau possibles.
    prog = await lancer(dossier(), port);
    ({ ctx, p, erreurs } = await page(prog.adresse)); await ouvrir(p); await p.waitForSelector('#kpis .kpi', { state: 'attached' });
    assert.equal(await p.evaluate(() => JSON.stringify(OdicolorBureau.decisions.journal())), avant);
    g = await gen(p); assert.equal(await decider(p, 2), null); await attendre(p, g);
    assert.equal(await nbDecisions(p), 2, 'décisions de nouveau possibles quand le coffre répond');
    assert.deepEqual(erreurs, []);
  } finally { await ctx?.close().catch(() => {}); }
});

test('2. coffre verrouillé en cours de route : décision non conservée, retour au mot de passe, rien de perdu ni de faux', async () => {
  let { ctx, p } = await page(prog.adresse);
  try {
    await ouvrir(p); await p.waitForSelector('#kpis .kpi', { state: 'attached' });
    const avant = await p.evaluate(() => JSON.stringify(OdicolorBureau.decisions.journal()));
    assert.equal(await p.evaluate(async () => (await fetch('/api/verrouiller', { method: 'POST', headers: { 'X-ODICOLOR': '1' } })).status), 200);
    assert.equal(await decider(p, 3), null, 'verrou pas encore connu de la page : la décision est tentée…');
    await p.waitForSelector('#f-ouvrir:not([hidden])');                                            // … le coffre refuse : retour à l'écran de mot de passe
    await ouvrir(p); await p.waitForSelector('#kpis .kpi', { state: 'attached' });
    assert.equal(await p.evaluate(() => JSON.stringify(OdicolorBureau.decisions.journal())), avant, 'la décision tentée pendant le verrou n’existe pas');
  } finally { await ctx.close(); }
});

test('3. aucune décision possible sans application locale, même avec des garages chargés', async () => {
  const ctx = await nav.newContext(); await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  try {
    await p.goto('file://' + path.resolve(__dirname, '..', 'bureau', 'index.html'));
    await p.click('#mode'); await p.setInputFiles('#fichier-sauvegarde', path.join(travail, 'sauvegarde.json')); await p.waitForFunction(() => document.querySelector('#mode').textContent === 'Mes garages');
    assert.match(await decider(p, 1), /coffre chiffré est inaccessible/);
    assert.equal(await nbDecisions(p), 0);
  } finally { await ctx.close(); }
});
