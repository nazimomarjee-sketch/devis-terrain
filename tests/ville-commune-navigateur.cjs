'use strict';
// Ma Ville — étape 2 : vue Commune (bureau/ville/vue-commune.js), dans Chromium, Internet coupé. DONNÉES FICTIVES.
// Page de démonstration non branchée au Bureau : bureau/ville/demo-commune.html.
// Exécution : node tests/ville-commune-navigateur.cjs   (captures : CAPTURES=dossier node tests/ville-commune-navigateur.cjs)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs');
const { chromium, devices } = require('playwright');

const DEMO = 'file://' + path.resolve(__dirname, '..', 'bureau', 'ville', 'demo-commune.html');
let nav;
before(async () => { nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); });
after(async () => { await nav?.close(); });

async function ouvrir(insee, contexte = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await nav.newContext({ ...contexte, deviceScaleFactor: process.env.CAPTURES ? 2 : (contexte.deviceScaleFactor || 1) });
  await ctx.route(/^https?:\/\//, r => r.abort());
  const p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  await p.goto(DEMO + '?insee=' + insee); await p.waitForSelector('.vc-ligne');
  return { ctx, p, erreurs };
}
const capture = async (p, nom) => { if (process.env.CAPTURES) { fs.mkdirSync(process.env.CAPTURES, { recursive: true }); await p.screenshot({ path: path.join(process.env.CAPTURES, nom + '.png') }); } };
const comptes = (p, insee) => p.evaluate(i => ModeleCommune.commune(r, i).comptes, insee);

test('1. Goussainville : tous les établissements listés, mêmes numéros sur la scène, agence et mentions', async () => {
  const { ctx, p, erreurs } = await ouvrir('95280');
  try {
    const k = await comptes(p, '95280');
    const nums = await p.$$eval('.vc-ligne', l => l.map(b => Number(b.dataset.num)));
    assert.equal(nums.length, k.total);
    assert.deepEqual(nums, nums.map((_, i) => i + 1), 'numéros 1…n dans l’ordre de la liste');
    const surScene = await p.$$eval('.vc-cible', l => l.map(g => Number(g.dataset.num)).sort((a, b) => a - b));
    assert.deepEqual(surScene, nums, 'chaque numéro de la liste a son bâtiment (≤ 40)');
    assert.equal(await p.evaluate(() => vue.stats.agence), true);
    assert.match(await p.textContent('.vc-mention'), /Plan schématique.*emplacements non réels.*agence : emplacement symbolique/);
    assert.match(await p.textContent('.vc-fictif'), /DONNÉES FICTIVES/);
    assert.match(await p.innerHTML('.vc-svg'), /ODICOLOR/);
    await capture(p, 'commune-1-goussainville');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('2. à qualifier ≠ hors cible ; dormant, réachat et alerte visibles sans changer les couleurs', async () => {
  const { ctx, p } = await ouvrir('95280');
  try {
    const k = await comptes(p, '95280');
    assert.equal(await p.$$eval('.vc-num-q', l => l.length), k.aQualifier, '« ? » réservé aux établissements à qualifier');
    assert.equal(await p.$$eval('.vc-num-n', l => l.length), 1, 'prospect au métier inconnu : repère neutre, sans « ? »');
    assert.equal(await p.$$eval('.vc-num-x', l => l.length), k.horsCible);
    assert.equal((await p.$$eval('.vc-b', l => l.map(b => b.textContent))).filter(t => t === '⊘ Hors cible').length, k.horsCible);
    const ligne = async n => (await p.textContent(`.vc-ligne:has(.vc-nom:text-is("${n}"))`)).replace(/\s+/g, ' ');
    assert.match(await ligne('CARROSSERIE FICTIVE A'), /Client carrosserie · potentiellement dormant · 75 j/);
    assert.match(await ligne('CARROSSERIE FICTIVE G'), /réachat à vérifier · 70 j/);
    assert.match(await ligne('CARROSSERIE FICTIVE F'), /compte bloqué/);
    const svg = await p.innerHTML('.vc-svg');
    assert.match(svg, /☾ 2 mois/); assert.match(svg, /↻/); assert.match(svg, /HORS CIBLE/); assert.match(svg, /\? À QUALIFIER/);
    assert.ok(k.dontDormants >= 1 && k.dontDormants <= k.clients, 'un dormant est compté parmi les clients');
  } finally { await ctx.close(); }
});

test('3. gestes : 1er clic = aperçu, 2e clic = fiche ; clavier Entrée ; Échap ferme', async () => {
  const { ctx, p } = await ouvrir('95280');
  try {
    const uid = await p.$eval('.vc-cible[data-num="2"]', g => g.dataset.uid);
    await p.click('.vc-cible[data-num="2"] circle', { force: true });
    await p.waitForSelector('.vc-apercu:not([hidden])');
    assert.match(await p.textContent('.vc-apercu h4'), /^2 · CARROSSERIE FICTIVE A/);
    assert.match(await p.innerHTML('.vc-selection'), /circle/, 'sélection visible sur la scène');
    assert.equal(await p.$eval('.vc-ligne[data-num="2"]', b => b.hasAttribute('aria-current')), true, 'la ligne correspondante est mise en avant');
    await p.click('.vc-cible[data-num="2"] circle', { force: true });
    assert.equal(await p.$eval('#fiche', f => f.dataset.uid), uid, '2e geste : la fiche est demandée');
    await p.keyboard.press('Escape');
    assert.equal(await p.$eval('.vc-apercu', a => a.hidden), true);
    await p.focus('.vc-ligne[data-num="5"]'); await p.keyboard.press('Enter');
    await p.waitForSelector('.vc-apercu:not([hidden])');
    await p.keyboard.press('Enter');
    assert.equal(await p.$eval('#fiche', f => f.dataset.uid), await p.$eval('.vc-ligne[data-num="5"]', b => b.dataset.uid));
    await capture(p, 'commune-2-apercu');
  } finally { await ctx.close(); }
});

test('4. commune dense (60 établissements) : 39 bâtiments + îlot « +21 », les 60 dans la liste et accessibles', async () => {
  const { ctx, p, erreurs } = await ouvrir('95127');
  try {
    assert.deepEqual(await p.evaluate(() => vue.stats), { dessines: 39, reste: 21, personnages: 5, agence: false });
    assert.equal(await p.$$eval('.vc-ligne', l => l.length), 60);
    assert.equal(await p.$$eval('.vc-cible', l => l.length), 39);
    assert.match(await p.textContent('.vc-ilot'), /\+21 · liste/);
    await p.click('.vc-ligne[data-num="55"]');
    await p.waitForSelector('.vc-apercu:not([hidden])');
    assert.match(await p.textContent('.vc-apercu'), /dans la liste \(îlot\)/);
    assert.doesNotMatch(await p.textContent('.vc-mention'), /agence/, 'pas d’agence hors de Goussainville');
    await capture(p, 'commune-3-cergy-ilot');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('5. au plus 5 personnages ; aucune rubrique vide (pointage, obstacles) affichée', async () => {
  for (const insee of ['95280', '95277', '95127']) {
    const { ctx, p } = await ouvrir(insee);
    try {
      assert.ok(await p.evaluate(() => vue.stats.personnages) <= 5, insee);
      const texte = (await p.textContent('.vc')).toLowerCase();
      for (const mot of ['pointage', 'obstacle', 'aide demandée']) assert.ok(!texte.includes(mot), insee + ' : « ' + mot + ' » ne doit pas apparaître');
    } finally { await ctx.close(); }
  }
});

test('6. format Samsung (Galaxy) : liste sous la scène, toucher = aperçu, zones tactiles ≥ 44 px', async () => {
  const { ctx, p, erreurs } = await ouvrir('95280', { ...devices['Galaxy S9+'] });
  try {
    const carte = await p.$eval('.vc-carte', e => e.getBoundingClientRect()), pan = await p.$eval('.vc-panneau', e => e.getBoundingClientRect());
    assert.ok(pan.top >= carte.bottom - 1, 'le panneau passe sous la scène');
    await p.tap('.vc-ligne[data-num="3"]');
    await p.waitForSelector('.vc-apercu:not([hidden])');
    for (const sel of ['.vc-ligne', '.vc-ap-btns button', '.vc-zoom button']) {
      const h = await p.$$eval(sel, l => Math.min(...l.map(e => e.getBoundingClientRect().height)));
      assert.ok(h >= 44, sel + ' : ' + h + ' px');
    }
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'aucun défilement horizontal de la page');
    const chevauche = await p.evaluate(() => { const a = document.querySelector('.vc-mention').getBoundingClientRect(), b = document.querySelector('.vc-fictif').getBoundingClientRect();
      return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top); });
    assert.equal(chevauche, false, 'les mentions « plan schématique » et « données fictives » ne se recouvrent pas');
    await capture(p, 'commune-4-samsung');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('7. rapidité : une commune de 200 établissements affichée en moins de 0,3 s', async () => {
  const { ctx, p } = await ouvrir('95280');
  try {
    const ms = await p.evaluate(() => {
      const annuaire = Array.from({ length: 200 }, (_, i) => ({ siret: String(44444444400000 + i), nom: 'ATELIER FICTIF ' + i, ville: 'Sarcelles', cp: '95200' }));
      const m = ModeleCommune.construire({ arrete: '2026-11-06', annuaire });
      const t0 = performance.now(); const v = VueCommune.monter(document.getElementById('vue'), ModeleCommune.commune(m, '95585'), { fictif: true });
      document.querySelector('.vc-svg').getBoundingClientRect(); return { ms: performance.now() - t0, n: document.querySelectorAll('.vc-ligne').length, d: v.stats.dessines };
    });
    assert.equal(ms.n, 200); assert.equal(ms.d, 39);
    assert.ok(ms.ms < 300, ms.ms.toFixed(0) + ' ms');
  } finally { await ctx.close(); }
});
