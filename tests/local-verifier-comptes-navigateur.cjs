'use strict';
// Lot B — écran « Vérifier les comptes », parcours complet avec le VRAI coffre (programme local en processus séparé),
// fermeture, arrêt brutal, relance, réouverture. DONNÉES FICTIVES.
// Exécution : node tests/local-verifier-comptes-navigateur.cjs   (captures : CAPTURES=dossier …)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium, devices } = require('playwright');

const SERVEUR = path.resolve(__dirname, '..', 'local', 'serveur.js');
const MDP = 'Phrase-Fictive-Du-Coffre-2026', AUTEUR = 'Vérificateur fictif';
let nav, travail;
const GARAGES = [['CARROSSERIE FICTIVE UN', 'Goussainville', '95190', 'prospect'], ['GARAGE FICTIF DEUX', 'Goussainville', '95190', 'client'],
  ['MÉCA FICTIVE TROIS', 'Gonesse', '95500', 'prospect'], ['CARROSSERIE FICTIVE QUATRE', 'Gonesse', '95500', 'prospect'],
  ['ATELIER FICTIF CINQ', 'Sarcelles', '95200', 'prospect'], ['CARROSSERIE FICTIVE SIX', 'Sarcelles', '95200', 'prospect']]
  .map(([nom, ville, cp, statutCrm], i) => ({ id: i + 1, nom, ville, cp, statutCrm }));
const CLIENTS = [['C10', 'SARL GARAGE FICTIF DEUX', 'Goussainville', '95190'], ['C20', 'CARROSSERIE FICTIVE QUATRE', 'Gonesse', '95500'], ['C30', 'GARAGE FICTIF AUTRE', 'Cergy', '95000']];

before(async () => {
  travail = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-vf-'));
  const ecrire = (n, l) => fs.writeFileSync(path.join(travail, n), Buffer.from(l.map(x => x.join(';')).join('\r\n') + '\r\n', 'latin1'));
  const ent = ['Code client', 'Raison sociale', 'Ville', 'Code postal', 'Statut du compte', 'Famille client'];
  ecrire('clients.csv', [ent, ...CLIENTS.map(c => [...c, 'Actif', 'Carrosserie'])]);
  ecrire('clients-2.csv', [ent, ...CLIENTS.map(c => [...c, 'Actif', 'Carrosserie']), ['C40', 'CARROSSERIE FICTIVE UN', 'Goussainville', '95190', 'Actif', 'Carrosserie']]);
  fs.writeFileSync(path.join(travail, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', clients: GARAGES, devis: [] }));
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await tuer(prog); await nav?.close(); fs.rmSync(travail, { recursive: true, force: true }); }); // le programme local est toujours arrêté, même après un échec

function lancer(dossier) {
  return new Promise((ok, ko) => {
    const p = spawn(process.execPath, [SERVEUR, '--dossier', dossier, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let j = '';
    p.stdout.on('data', d => { j += d; const m = /prête : (http:\/\/127\.0\.0\.1:\d+\/)/.exec(j); if (m && !p.adresse) { p.adresse = m[1]; ok(p); } });
    p.stderr.on('data', d => { j += d; }); p.on('exit', () => { if (!p.adresse) ko(new Error(j)); });
    setTimeout(() => ko(new Error('Démarrage trop long')), 15000);
  });
}
const tuer = p => new Promise(r => { if (!p || p.exitCode !== null || p.signalCode) return r(); p.once('exit', r); p.kill('SIGKILL'); });
async function page(adresse, opts = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await nav.newContext({ ...opts, deviceScaleFactor: process.env.CAPTURES ? 2 : (opts.deviceScaleFactor || 1) });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage(), erreurs = [];
  if (process.env.DELAI_MS) p.setDefaultTimeout(Number(process.env.DELAI_MS)); // vérifications par sabotage : échec rapide
  p.on('pageerror', e => erreurs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-07T09:00:00'));
  await p.goto(adresse);
  return { ctx, p, erreurs };
}
const capture = async (p, nom) => { if (process.env.CAPTURES) { fs.mkdirSync(process.env.CAPTURES, { recursive: true }); await p.screenshot({ path: path.join(process.env.CAPTURES, nom + '.png') }); } };
const gen = p => p.evaluate(() => Number(document.documentElement.dataset.coffreGeneration || 0));
const attendre = (p, g) => p.waitForFunction(x => Number(document.documentElement.dataset.coffreGeneration || 0) > x, g);
async function creer(p) { await p.waitForSelector('#f-creer:not([hidden])'); await p.fill('#nouveau-mdp', MDP); await p.fill('#nouveau-mdp2', MDP); await p.click('#creer');
  await p.waitForSelector('#s-secours-cle:not([hidden])'); await p.check('#note'); await p.click('#continuer'); await p.waitForSelector('html[data-coffre="pret"]'); }
async function ouvrir(p) { await p.waitForSelector('#f-ouvrir:not([hidden])'); await p.fill('#mdp', MDP); await p.click('#valider'); await p.waitForSelector('html[data-coffre="pret"]'); }
async function importer(p, sel, f) { const g = await gen(p); await p.setInputFiles(sel, path.join(travail, f)); await attendre(p, g); }
const ecran = async p => { await p.evaluate(() => { location.hash = 'verifier-comptes'; }); await p.waitForSelector('.vf-compteurs'); };
const compteurs = p => p.$$eval('[data-vf]', l => Object.fromEntries(l.map(b => [b.dataset.vf, Number(b.textContent)])));
const choisir = (p, nom) => p.click(`.vf-ligne:has(b:text-is("${nom}"))`);
const statutCarte = p => p.textContent('.vf-fiche .vf-statut');
const histo = p => p.$$eval('.vf-hist li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
const journal = p => p.evaluate(() => OdicolorBureau.decisions.journal());

let dossier, prog;
test('1. parcours complet avec le vrai coffre : groupé, liaison, absence, je ne sais pas, correction, annulation, fermeture et réouverture', async () => {
  dossier = path.join(travail, 'coffre'); prog = await lancer(dossier);
  let { ctx, p, erreurs } = await page(prog.adresse);
  try {
    await creer(p);
    await p.click('#mode'); await importer(p, '#fichier-sauvegarde', 'sauvegarde.json'); await p.click('#mode');
    await importer(p, '#ebp-clients', 'clients.csv');
    await p.waitForSelector('#bloc-comptes'); assert.match(await p.textContent('#bloc-comptes'), /3 en compte · 0 sans compte · 6 à vérifier/);
    await ecran(p);
    assert.deepEqual(await compteurs(p), { en_compte: 3, sans_compte: 0, a_verifier: 6, total: 9 });
    assert.match(await p.textContent('.vf-enreg'), /enregistrée dans le coffre chiffré/);
    // Suggestions : jamais pré-cochées ; « C'est ce client EBP » inactif ; la touche 1 ne fait rien.
    await choisir(p, 'GARAGE FICTIF DEUX');
    assert.equal(await p.$$eval('input[name="vf-code"]', l => l.length), 1);
    assert.match(await p.textContent('.vf-sug'), /SARL GARAGE FICTIF DEUX.*Code C10.*mot\(s\) commun\(s\) : DEUX · même code postal/s);
    assert.equal(await p.$$eval('input[name="vf-code"]:checked', l => l.length), 0, 'aucune suggestion pré-sélectionnée');
    assert.equal(await p.isDisabled('[data-decision="liaison"]'), true);
    let g0 = await gen(p); await p.keyboard.press('1'); await p.waitForTimeout(300);
    assert.equal(await gen(p), g0, 'rien n’est enregistré sans choix');
    await capture(p, 'vf-1-ecran');

    // A. Déclaration groupée : confirmation explicite exigée ; garages à risque exclus.
    for (const n of ['CARROSSERIE FICTIVE UN', 'MÉCA FICTIVE TROIS', 'CARROSSERIE FICTIVE QUATRE', 'GARAGE FICTIF DEUX'])
      await p.check(`.vf-item:has(b:text-is("${n}")) input[data-coche]`);
    await p.click('[data-groupe]');
    await p.fill('#vf-auteur', AUTEUR); await p.click('.vf-modale [data-ok]');               // auteur déclaré une seule fois
    await p.waitForSelector('.vf-modale:has-text("Déclaration groupée")');
    assert.match(await p.textContent('.vf-modale'), /2 garage\(s\).*2 exclu\(s\), à traiter un par un/s);
    assert.equal(await p.isDisabled('.vf-modale [data-ok]'), true, 'confirmation explicite obligatoire');
    await capture(p, 'vf-2-groupe');
    g0 = await gen(p); await p.check('.vf-modale [data-requis]'); await p.click('.vf-modale [data-ok]'); await attendre(p, g0);
    await p.waitForFunction(() => document.querySelector('[data-vf="sans_compte"]').textContent === '2');
    assert.deepEqual(await compteurs(p), { en_compte: 3, sans_compte: 2, a_verifier: 4, total: 9 });
    assert.match(await p.textContent('.vf-auteur'), /Auteur déclaré : Vérificateur fictif \(non authentifié\)/);

    // B. Liaison : choisir la suggestion, confirmer.
    await choisir(p, 'GARAGE FICTIF DEUX'); await p.check('input[name="vf-code"][value="C10"]');
    await p.click('[data-decision="liaison"]'); g0 = await gen(p); await p.click('.vf-modale [data-ok]'); await attendre(p, g0);
    await p.waitForFunction(() => document.querySelector('[data-vf="total"]').textContent === '8');
    assert.deepEqual(await compteurs(p), { en_compte: 3, sans_compte: 2, a_verifier: 3, total: 8 }, 'garage et client EBP réunis : aucun doublon');

    // C. Absence avec fiche EBP au même nom : case « aucune de ces fiches n'est ce garage » obligatoire, fiche notée écartée.
    await choisir(p, 'CARROSSERIE FICTIVE QUATRE'); await p.click('[data-decision="absence"]');
    assert.match(await p.textContent('.vf-modale'), /Ces fiches EBP lui ressemblent.*C20/s);
    assert.equal(await p.isDisabled('.vf-modale [data-ok]'), true);
    await capture(p, 'vf-3-absence-confirmation');
    g0 = await gen(p); await p.check('.vf-modale [data-requis]'); await p.click('.vf-modale [data-ok]'); await attendre(p, g0);
    await p.waitForFunction(() => document.querySelector('[data-vf="sans_compte"]').textContent === '3');

    // D. Je ne sais pas : rien n'est enregistré.
    await choisir(p, 'ATELIER FICTIF CINQ'); g0 = await gen(p);
    await p.click('[data-decision="nsp"]'); await p.waitForTimeout(400);
    assert.equal(await gen(p), g0); assert.match(await p.textContent('.vf-item:has(b:text-is("ATELIER FICTIF CINQ"))'), /Passé/);

    // E. Correction sans effacer : MÉCA TROIS (sans compte) → relié à C30 ; puis annulation.
    await p.click('[data-onglet="decides"]'); await choisir(p, 'MÉCA FICTIVE TROIS');
    assert.match(await statutCarte(p), /Sans compte/);
    await p.fill('#vf-code-libre', 'C30'); await p.click('[data-decision="liaison"]'); g0 = await gen(p); await p.click('.vf-modale [data-ok]'); await attendre(p, g0);
    await p.click('[data-onglet="decides"]'); await choisir(p, 'MÉCA FICTIVE TROIS');
    assert.match(await statutCarte(p), /En compte/);
    assert.match(await p.textContent('.vf-fiche-tete'), /Gonesse \(95500\) · n° 3 au téléphone · déclaré prospect au téléphone.*Fiche EBP reliée : code C30 · GARAGE FICTIF AUTRE · Cergy 95000/s, 'adresse du téléphone et adresse EBP, chacune à sa place');
    let h = await histo(p);
    assert.equal(h.length, 2); assert.match(h[0], /Aucun compte ODICOLOR vérifié · auteur déclaré : Vérificateur fictif · Remplacée/); assert.match(h[1], /C’est ce client EBP \(code C30\).*Appliquée/);
    await capture(p, 'vf-4-correction-historique');
    await p.click('[data-annuler]'); g0 = await gen(p); await p.click('.vf-modale [data-ok]'); await attendre(p, g0);
    await p.click('[data-onglet="a_verifier"]'); await choisir(p, 'MÉCA FICTIVE TROIS');
    assert.match(await statutCarte(p), /À vérifier/);
    h = await histo(p); assert.match(h[0], /Remplacée/); assert.match(h[1], /Annulée/);
    const avant = { c: await compteurs(p), j: await journal(p) };
    assert.deepEqual(avant.c, { en_compte: 3, sans_compte: 2, a_verifier: 3, total: 8 });
    assert.equal(avant.j.decisions.length, 6, '2 groupées + liaison + absence + liaison + annulation : rien d’effacé');
    assert.ok(avant.j.decisions.every(d => d.auteur === AUTEUR && /^2026-11-07$/.test(d.date) && d.source));
    assert.deepEqual(erreurs, []);
    await ctx.close();

    // F. Fermeture, ARRÊT BRUTAL, relance, réouverture : tout est retrouvé.
    await tuer(prog); prog = await lancer(dossier);
    ({ ctx, p, erreurs } = await page(prog.adresse)); await ouvrir(p); await ecran(p);
    assert.deepEqual(await compteurs(p), avant.c); assert.deepEqual(await journal(p), avant.j);
    assert.match(await p.textContent('.vf-auteur'), /Déclarer l’auteur/, 'l’auteur déclaré n’est pas retenu d’une session à l’autre');
    // G. Nouvel export clients : fiche au même nom que « CARROSSERIE FICTIVE UN » → alerte, la décision reste (ressemblance ≠ annulation).
    await p.evaluate(() => { location.hash = 'bureau'; }); await p.waitForSelector('#ebp-clients', { state: 'attached' });
    await importer(p, '#ebp-clients', 'clients-2.csv'); await ecran(p);
    const c2 = await compteurs(p);
    assert.equal(c2.sans_compte, 2, 'aucune décision annulée par une ressemblance'); assert.equal(c2.en_compte, 4);
    assert.equal(c2.en_compte + c2.sans_compte + c2.a_verifier, c2.total, 'sans doublon');
    assert.match(await p.textContent('[data-onglet="alertes"]'), /Alertes 1/);
    await p.click('[data-onglet="alertes"]'); await p.click('.vf-ligne:has-text("CARROSSERIE FICTIVE UN")');
    assert.match(await p.textContent('.vf-boite-alerte'), /Alerte à examiner.*C40.*La décision reste en vigueur/s);
    assert.match(await statutCarte(p), /Sans compte/);
    await capture(p, 'vf-5-alerte');
    assert.deepEqual(erreurs, []);
    await ctx.close();
  } finally { await ctx?.close().catch(() => {}); }
});

test('2. format tactile (Galaxy) : boutons ≥ 44 px, pas de défilement horizontal', async () => {
  const { ctx, p, erreurs } = await page(prog.adresse, { ...devices['Galaxy S9+'] });
  try {
    await ouvrir(p); await ecran(p);
    await choisir(p, 'ATELIER FICTIF CINQ');
    await capture(p, 'vf-6-samsung');
    for (const s of ['.vf-btn', '.vf-onglets button', '.vf-ligne']) { const m = await p.$$eval(s, l => Math.min(...l.map(e => e.getBoundingClientRect().height))); assert.ok(m >= 44, s + ' : ' + m); }
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.tap('[data-decision="absence"]'); await p.waitForSelector('.vf-modale');
    await capture(p, 'vf-7-samsung-auteur');
    await p.tap('.vf-modale [data-annuler-modale]');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); await tuer(prog); }
});

test('3. sans l’application locale (fichier ouvert directement) : l’écran prévient que rien n’est enregistré', async () => {
  const ctx = await nav.newContext(); await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  try {
    await p.goto('file://' + path.resolve(__dirname, '..', 'bureau', 'index.html') + '#verifier-comptes');
    await p.waitForSelector('#vue .bloc');
    assert.match(await p.textContent('#vue'), /Aucune décision n’est possible sur la démo/);
    await p.click('#mode'); await p.setInputFiles('#fichier-sauvegarde', path.join(travail, 'sauvegarde.json'));
    await p.waitForSelector('.vf-enreg');
    assert.match(await p.textContent('.vf-enreg'), /sans l’application locale.*perdues à la fermeture/);
  } finally { await ctx.close(); }
});
