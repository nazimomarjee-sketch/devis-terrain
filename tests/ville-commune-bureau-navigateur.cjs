'use strict';
// Ma Ville — étape 3 : vue Commune intégrée au Bureau (bureau/index.html), DONNÉES FICTIVES, Internet coupé.
// Parcours complet : Bureau → Recherche → Commune → Garage → Fiche ; sélecteur EN COMPTE | SANS COMPTE | À VÉRIFIER (Département et Commune, PC et format Samsung).
// Exécution : node tests/ville-commune-bureau-navigateur.cjs   (captures : CAPTURES=dossier node tests/ville-commune-bureau-navigateur.cjs)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const { chromium, devices } = require('playwright');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'bureau', 'index.html');
let nav;
before(async () => { nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); });
after(async () => { await nav?.close(); });

async function ouvrir(hash = '', contexte = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await nav.newContext({ ...contexte, deviceScaleFactor: process.env.CAPTURES ? 2 : (contexte.deviceScaleFactor || 1) });
  const sorties = [];
  await ctx.route(/^https?:/, r => { sorties.push(r.request().url()); r.abort(); });
  const p = await ctx.newPage(), erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(PAGE + hash); await p.waitForSelector('#kpis .kpi', { state: 'attached' });
  return { ctx, p, erreurs, sorties };
}
const capture = async (p, nom) => { if (process.env.CAPTURES) { fs.mkdirSync(process.env.CAPTURES, { recursive: true }); await p.screenshot({ path: path.join(process.env.CAPTURES, nom + '.png') }); } };
// Le modèle tel que le Bureau le construit (même fonction, mêmes données fictives) : référence des vérifications.
const modele = p => p.evaluate(() => { const r = ModeleCommune.construire(FICTIF_IDF.avecDemoBureau(BureauLogique.garagesDemo(2026)));
  const tous = [...r.communes.values()].flatMap(c => c.etablissements).concat(r.aClasser);
  return { agr: ModeleCommune.agreger(r), etabs: tous.map(e => ({ uid: e.uid, nom: e.nom.valeur, insee: e.insee, numero: e.numero, compte: e.compte.statut, siret: e.siret && e.siret.valeur,
    categorie: e.categorie, dormant: !!e.dormant, bloque: e.alertes.some(a => a.type === 'compte_bloque'), segment: e.segment })) }; });
const chercher = async (p, q) => { await p.fill('#recherche-globale', ''); await p.type('#recherche-globale', q); await p.waitForSelector('.resultats:not([hidden])'); };
const champ = (p, n) => p.evaluate(n => { const c = [...document.querySelectorAll('#couche-fiche .champ')].find(x => x.querySelector('.n').textContent === n); return c ? c.textContent : null; }, n);

test('1. parcours complet PC : Bureau → recherche « Goussainville » → commune → garage (aperçu) → fiche commerciale', async () => {
  const { ctx, p, erreurs, sorties } = await ouvrir();
  try {
    const m = await modele(p), gouss = m.etabs.filter(e => e.insee === '95280');
    await chercher(p, 'Goussainv');
    assert.ok(!!await p.$('.mv-res[data-mv="commune"]'), 'la commune est proposée');
    await capture(p, 'parcours-1-recherche');
    await p.click('.mv-res[data-mv="commune"]');
    await p.waitForSelector('.vc-hote .vc-ligne');
    assert.equal(await p.evaluate(() => location.hash), '#commune-95280');
    assert.equal(await p.$$eval('.vc-ligne', l => l.length), gouss.length, 'tous les établissements de la commune sont listés');
    assert.match(await p.textContent('.vc-fil'), /Île-de-France › Val-d'Oise \(95\) › Goussainville/);
    assert.equal(await p.$eval('#kpis', k => k.hidden), true, 'les indicateurs de la Ville ne se mélangent pas aux données fictives');
    await capture(p, 'parcours-2-commune');
    const a = gouss.find(e => e.nom === 'CARROSSERIE FICTIVE A');
    await p.click(`.vc-cible[data-num="${a.numero}"] circle`, { force: true });
    await p.waitForSelector('.vc-apercu:not([hidden])');
    assert.equal(await p.$$eval('#couche-fiche .fiche', l => l.length), 0, '1er clic : aperçu seulement');
    assert.match(await p.textContent('.vc-apercu'), /En compte.*potentiellement dormant/s);
    await capture(p, 'parcours-3-apercu');
    await p.click(`.vc-cible[data-num="${a.numero}"] circle`, { force: true });
    await p.waitForSelector('#couche-fiche .fiche');
    assert.equal(await p.textContent('#fiche-titre'), 'CARROSSERIE FICTIVE A', '2e clic : la fiche commerciale existante');
    assert.match(await p.textContent('#couche-fiche .pastille-statut'), /Client ODICOLOR carrosserie/);
    assert.match(await champ(p, 'Compte ODICOLOR'), /En compte · Code client EBP F01 · potentiellement dormant/);
    assert.match(await champ(p, 'Signal d’achat'), /Potentiellement dormant.*75 j/);
    assert.ok(!!await p.$('#couche-fiche [role="tab"]'), 'onglets de la fiche existante');
    await capture(p, 'parcours-4-fiche');
    await p.keyboard.press('Escape');
    assert.equal(await p.$eval('#couche-fiche', c => c.hidden), true, 'Échap ferme la fiche');
    assert.deepEqual(erreurs, []); assert.deepEqual(sorties.filter(u => !/cdnjs.cloudflare.com\/ajax\/libs\/leaflet|fonts.googleapis.com|fonts.gstatic.com/.test(u)), [], 'aucun envoi réseau en plus de ceux du Bureau existant (police, fond de carte)');
  } finally { await ctx.close(); }
});

test('2. garage de démo du Bureau : même fiche que dans la Ville, complétée par Ma Ville ; aucun doublon', async () => {
  const { ctx, p } = await ouvrir('#commune-95280');
  try {
    await p.waitForSelector('.vc-ligne');
    const lignes = await p.$$eval('.vc-ligne .vc-nom', l => l.map(x => x.textContent.trim()));
    assert.equal(lignes.filter(n => n === 'Carrosserie démo 047').length, 1, 'le garage de démo apparaît une fois (terrain + EBP reliés)');
    await p.click('.vc-ligne:has(.vc-nom:text-is("Carrosserie démo 047"))'); await p.click('.vc-apercu .vc-ouvrir');
    await p.waitForSelector('#couche-fiche .fiche');
    assert.match(await champ(p, 'Potentiel'), /€ \/ mois/, 'fiche d’origine du garage de démo (mêmes données que la Ville)');
    assert.match(await champ(p, 'Compte ODICOLOR'), /En compte/);
    assert.match(await p.textContent('#couche-fiche .pastille-statut'), /Client ODICOLOR carrosserie/);
  } finally { await ctx.close(); }
});

test('3. recherche par SIRET dans une commune de plusieurs centaines d’établissements : garage sélectionné même hors dessin', async () => {
  const { ctx, p, erreurs } = await ouvrir();
  try {
    const m = await modele(p), sarc = m.etabs.filter(e => e.insee === '95585');
    assert.ok(sarc.length > 300, 'commune dense : ' + sarc.length);
    const cible = sarc.find(e => e.siret === '44444444400317');
    // Sélection EN COMPTE active : le garage cherché (à vérifier) doit quand même apparaître.
    await p.evaluate(() => { location.hash = '#communes'; }); await p.waitForSelector('.vc-dep .vc-cpt'); await p.click('.vc-cpt-en_compte');
    await chercher(p, '44444444400317');
    assert.match(await p.textContent('.mv-res[data-mv="garage"]'), /ATELIER FICTIF SARCELLES 318.*Sarcelles.*SIRET 44444444400317/s);
    await p.click('.mv-res[data-mv="garage"]');
    await p.waitForSelector('.vc-apercu:not([hidden])');
    assert.match(await p.textContent('.vc-apercu h4'), new RegExp('^' + cible.numero + ' · ATELIER FICTIF SARCELLES 318'));
    assert.match(await p.textContent('.vc-apercu'), /dans la liste \(îlot\)/, 'hors des 39 bâtiments dessinés : accessible quand même');
    assert.equal(await p.$eval(`.vc-ligne[data-uid="${cible.uid}"]`, b => b.hasAttribute('aria-current')), true);
    assert.equal(await p.$eval('.vc-cpt-tous', b => b.getAttribute('aria-pressed')), 'true', 'sélection élargie à TOUT pour montrer le garage cherché');
    await capture(p, 'parcours-5-siret-commune-dense');
    // Chaque établissement de la commune est dans la liste, une seule fois ; la recherche interne retrouve n'importe lequel.
    const uids = await p.$$eval('.vc-ligne', l => l.map(b => b.dataset.uid));
    assert.equal(uids.length, sarc.length); assert.equal(new Set(uids).size, uids.length);
    assert.deepEqual([...uids].sort(), sarc.map(e => e.uid).sort());
    await p.fill('.vc-chercher', 'atelier fictif sarcelles 007');
    assert.equal(await p.$$eval('.vc-liste li:not([hidden])', l => l.length), 1);
    await p.click('.vc-liste li:not([hidden]) .vc-ligne'); await p.click('.vc-apercu .vc-ouvrir');
    await p.waitForSelector('#couche-fiche .fiche');
    assert.equal(await p.textContent('#fiche-titre'), 'ATELIER FICTIF SARCELLES 007');
    assert.match(await p.textContent('#couche-fiche .pastille-statut'), /\? À qualifier/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('4. statuts, alertes et sources identiques entre scène, liste, aperçu et fiche', async () => {
  const { ctx, p } = await ouvrir('#commune-95280');
  try {
    await p.waitForSelector('.vc-ligne');
    const m = await modele(p), L = { en_compte: 'En compte', sans_compte: 'Sans compte', a_verifier: 'À vérifier' };
    for (const e of m.etabs.filter(x => x.insee === '95280')) {
      const ligne = `.vc-ligne[data-uid="${e.uid}"]`;
      assert.equal(await p.$eval(ligne, b => Number(b.dataset.num)), e.numero, e.nom);
      assert.equal(await p.$eval(ligne + ' [class*="vc-bc-"]', b => b.textContent), L[e.compte], e.nom + ' : compte dans la liste');
      assert.ok(!!await p.$(`.vc-cible[data-uid="${e.uid}"][data-num="${e.numero}"]`), e.nom + ' : même numéro sur la scène');
    }
    const cas = [['CARROSSERIE FICTIVE F', /En compte · Code client EBP F03 · compte bloqué/, /Client ODICOLOR carrosserie/],
      ['CARROSSERIE FICTIVE B', /Sans compte · Absence de compte vérifiée, déclarée par Vérificateur fictif \(auteur déclaré, non authentifié\)/, /Prospect carrosserie/],
      ['CONTRÔLE TECHNIQUE FICTIF', /Sans compte/, /⊘ Hors cible/]];
    for (const [nom, compte, pastille] of cas) {
      await p.click(`.vc-ligne:has(.vc-nom:text-is("${nom}"))`); await p.click('.vc-apercu .vc-ouvrir');
      await p.waitForSelector('#couche-fiche .fiche');
      assert.match(await champ(p, 'Compte ODICOLOR'), compte, nom);
      assert.match(await p.textContent('#couche-fiche .pastille-statut'), pastille, nom);
      if (nom === 'CARROSSERIE FICTIVE F') { assert.match(await champ(p, 'Alerte'), /Compte bloqué dans EBP.*EBP/); assert.match(await p.textContent('#couche-fiche .fiche-tete'), /Risque de règlement/); }
      assert.match(await champ(p, 'Sources'), /du \d\d\/\d\d\/2026/, nom + ' : sources datées');
      await p.click('#couche-fiche .fermer');
    }
    // Homonyme : deux lignes séparées ; l'absence vérifiée par une personne est conservée, avec une alerte à examiner.
    const g = m.etabs.filter(e => e.nom === 'CARROSSERIE FICTIVE G');
    assert.deepEqual(g.map(e => e.compte).sort(), ['en_compte', 'sans_compte']);
    const u = g.find(e => e.compte === 'sans_compte');
    await p.click(`.vc-ligne[data-uid="${u.uid}"]`); await p.click('.vc-apercu .vc-ouvrir'); await p.waitForSelector('#couche-fiche .fiche');
    assert.match(await champ(p, 'Compte ODICOLOR'), /Sans compte · .*⚠ Fiche proche : même nom dans la même commune/);
  } finally { await ctx.close(); }
});

test('5. sélecteur dans la vue Commune : EN COMPTE (dormants et bloqués compris) | SANS COMPTE | À VÉRIFIER, numéros et couleurs inchangés', async () => {
  const { ctx, p } = await ouvrir('#commune-95280');
  try {
    await p.waitForSelector('.vc-ligne');
    const m = await modele(p), gouss = m.etabs.filter(e => e.insee === '95280');
    const couleurs = Object.fromEntries(await p.$$eval('.vc-ligne', l => l.map(b => [b.dataset.uid, b.querySelector('.vc-num').style.background])));
    const n = async c => Number(await p.textContent(`.vc-cpt-${c} .vc-cpt-n`));
    for (const c of ['en_compte', 'sans_compte', 'a_verifier']) assert.equal(await n(c), gouss.filter(e => e.compte === c).length, c);
    assert.equal(await n('en_compte') + await n('sans_compte') + await n('a_verifier'), await n('tous'), 'sans doublon : somme = total');
    for (const c of ['en_compte', 'sans_compte', 'a_verifier']) {
      await p.click(`.vc-cpt-${c}`); await p.waitForSelector(`.vc-cpt-${c}[aria-pressed="true"]`);
      const vus = await p.$$eval('.vc-ligne', l => l.map(b => ({ uid: b.dataset.uid, num: Number(b.dataset.num), bg: b.querySelector('.vc-num').style.background })));
      const attendus = gouss.filter(e => e.compte === c);
      assert.deepEqual(vus.map(v => v.uid).sort(), attendus.map(e => e.uid).sort(), c + ' : bonne sélection');
      for (const v of vus) { assert.equal(v.num, gouss.find(e => e.uid === v.uid).numero, 'numéro conservé'); assert.equal(v.bg, couleurs[v.uid], 'couleur conservée'); }
      assert.deepEqual((await p.$$eval('.vc-cible', l => l.map(g => g.dataset.uid))).sort(), attendus.map(e => e.uid).sort(), c + ' : scène = liste');
      if (c === 'en_compte') { assert.ok(attendus.some(e => e.dormant) && attendus.some(e => e.bloque), 'dormants et bloqués restent EN COMPTE');
        assert.match(await p.textContent('.vc-cpt-en_compte small'), /dormant.*bloqué/); }
      if (c === 'sans_compte') await capture(p, 'parcours-6-commune-sans-compte');
    }
  } finally { await ctx.close(); }
});

test('6. sélecteur dans la vue Département (Île-de-France → 95 → commune) : compteurs sans doublon, choix conservé', async () => {
  const { ctx, p } = await ouvrir('#communes');
  try {
    await p.waitForSelector('.vc-dep .vc-cpt');
    const { agr } = await modele(p);
    const n = async c => Number(await p.textContent(`.vc-cpt-${c} .vc-cpt-n`));
    for (const c of ['en_compte', 'sans_compte', 'a_verifier']) assert.equal(await n(c), agr.idf[c], 'IDF ' + c);
    assert.equal(await n('tous'), agr.idf.total);
    assert.match(await p.textContent('.vc-dep'), new RegExp(agr.aClasser.total + ' établissement\\(s\\) sans commune'), 'les « à classer » restent visibles');
    await p.click('.vc-cpt-sans_compte'); await p.waitForSelector('.vc-cpt-sans_compte[aria-pressed="true"]');
    assert.equal(await p.$$eval('.vc-dep-ligne', l => l.length), agr.parDep.filter(d => d.sans_compte > 0).length, 'seuls les départements ayant des SANS COMPTE');
    await capture(p, 'parcours-7-idf-sans-compte');
    await p.click('.vc-dep-ligne[href="#communes-95"]'); await p.waitForSelector('.vc-fil a[href="#communes"]');
    const d95 = agr.parDep.find(d => d.dep === '95');
    assert.equal(await n('sans_compte'), d95.sans_compte); assert.equal(await p.$eval('.vc-cpt-sans_compte', b => b.getAttribute('aria-pressed')), 'true', 'choix conservé');
    const lignes = await p.$$eval('.vc-dep-ligne', l => l.map(a => [a.getAttribute('href'), Number(a.querySelector('.vc-dep-n b').textContent)]));
    const att = agr.parCommune.filter(c => c.dep === '95' && c.sans_compte > 0);
    assert.deepEqual(lignes.map(l => l[0]).sort(), att.map(c => '#commune-' + c.insee).sort());
    assert.equal(lignes.reduce((s, l) => s + l[1], 0), d95.sans_compte, 'somme des communes = département');
    await p.click('.vc-dep-ligne[href="#commune-95280"]'); await p.waitForSelector('.vc-hote .vc-ligne');
    assert.equal(await p.$eval('.vc-cpt-sans_compte', b => b.getAttribute('aria-pressed')), 'true', 'la commune s’ouvre sur la même sélection');
    await p.click('.vc-fil a[href="#communes-95"]'); await p.waitForSelector('.vc-dep');
  } finally { await ctx.close(); }
});

test('7. format Samsung (Galaxy) : sélecteur visible et utilisable dans Département et Commune, zones ≥ 44 px, pas de défilement horizontal', async () => {
  const { ctx, p, erreurs } = await ouvrir('#communes-95', { ...devices['Galaxy S9+'] });
  try {
    await p.waitForSelector('.vc-dep .vc-cpt');
    await p.tap('.vc-cpt-en_compte'); await p.waitForSelector('.vc-cpt-en_compte[aria-pressed="true"]');
    await capture(p, 'parcours-8-samsung-departement');
    await p.tap('.vc-dep-ligne[href="#commune-95280"]'); await p.waitForSelector('.vc-hote .vc-ligne');
    assert.equal(await p.$eval('.vc-cpt-en_compte', b => b.getAttribute('aria-pressed')), 'true');
    for (const sel of ['.vc-cpt', '.vc-ligne', '.vc-zoom button']) {
      const hmin = await p.$$eval(sel, l => Math.min(...l.map(e => e.getBoundingClientRect().height)));
      assert.ok(hmin >= 44, sel + ' : ' + hmin + ' px');
    }
    await p.tap('.vc-ligne'); await p.waitForSelector('.vc-apercu:not([hidden])');
    await p.tap('.vc-apercu .vc-ouvrir'); await p.waitForSelector('#couche-fiche .fiche');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'aucun défilement horizontal');
    await p.tap('#couche-fiche .fermer');
    await p.evaluate(() => document.querySelector('.vc-panneau').scrollIntoView());
    await capture(p, 'parcours-9-samsung-commune');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('8. préservation : Ville actuelle intacte, rien écrit, données réelles jamais mélangées aux fictives', async () => {
  const { ctx, p, erreurs } = await ouvrir();
  try {
    await p.waitForSelector('#scene');
    assert.equal(await p.$$eval('.vc', l => l.length), 0, 'la Ville LEGO actuelle ne contient pas la nouvelle vue');
    const avant = await p.evaluate(() => JSON.stringify(window.OdicolorBureau.exporter()));
    const stock = await p.evaluate(() => { try { return localStorage.length; } catch (e) { return -1; } });
    await p.evaluate(() => { location.hash = '#commune-95280'; }); await p.waitForSelector('.vc-ligne');
    await p.click('.vc-ligne'); await p.click('.vc-apercu .vc-ouvrir'); await p.waitForSelector('#couche-fiche .fiche');
    assert.equal(await p.$eval('#couche-fiche .actions-fiche .principal', b => b.disabled), true, 'aucune visite planifiée sur un établissement fictif');
    await p.keyboard.press('Escape');
    await p.evaluate(() => { location.hash = '#communes'; }); await p.waitForSelector('.vc-dep'); await p.click('.vc-cpt-sans_compte');
    assert.equal(await p.evaluate(() => JSON.stringify(window.OdicolorBureau.exporter())), avant, 'état du coffre inchangé');
    assert.equal(await p.evaluate(() => { try { return localStorage.length; } catch (e) { return -1; } }), stock, 'rien enregistré dans le navigateur');
    await p.evaluate(() => { location.hash = '#ville'; }); await p.waitForSelector('#scene');
    assert.equal(await p.$eval('#kpis', k => k.hidden), false, 'la Ville retrouve ses indicateurs');
    // Mode réel (sauvegarde téléphone fictive au format V47) : la vue Commune n'affiche PAS les données fictives.
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-')), f = path.join(dossier, 'sauvegarde.json');
    fs.writeFileSync(f, JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-01T10:00:00.000Z', reglages: {}, devis: [], clients: [{ nom: 'GARAGE TEMOIN', ville: 'Massy', cp: '91300', statut: 'prospect' }] }));
    await p.click('#mode'); await p.setInputFiles('#fichier-sauvegarde', f);
    await p.waitForFunction(() => document.querySelector('#mode').textContent === 'Mes garages');
    await p.evaluate(() => { location.hash = '#commune-95280'; }); await p.waitForSelector('#vue .bloc');
    assert.equal(await p.$$eval('.vc-ligne', l => l.length), 0); assert.match(await p.textContent('#vue'), /seulement sur des données fictives/);
    await chercher(p, 'Goussainv');
    assert.equal(await p.$$eval('.mv-res', l => l.length), 0, 'pas de résultat fictif dans la recherche en mode réel');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
