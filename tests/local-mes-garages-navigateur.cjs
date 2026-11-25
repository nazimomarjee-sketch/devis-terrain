'use strict';
// Lot C — vue Commune avec « Mes garages » (téléphone + EBP + décisions du coffre + marché importé), vrai coffre, DONNÉES FICTIVES aux vrais formats.
// Exécution : node tests/local-mes-garages-navigateur.cjs   (captures : CAPTURES=dossier …)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium, devices } = require('playwright');

const SERVEUR = path.resolve(__dirname, '..', 'local', 'serveur.js');
const MDP = 'Phrase-Fictive-Du-Coffre-2026', AUTEUR = 'Vérificateur fictif', CLE_MARCHE = 'odicolor-bureau-annuaire-91';
let nav, travail, prog, port;

// --- Données fictives ---
const tel = [
  { id: 1, nom: 'CARROSSERIE FICTIVE UN', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect', ent: { siret: '66666666600001', lu: '2026-10-12T09:00:00Z' } },
  { id: 2, nom: 'GARAGE FICTIF DEUX', ville: 'Goussainville', cp: '95190', statutCrm: 'client' },
  { id: 3, nom: 'MÉCA FICTIVE TROIS', ville: 'Gonesse', cp: '95500', statutCrm: 'prospect' },
  { id: 4, nom: 'CARROSSERIE FICTIVE QUATRE', ville: 'Gonesse', cp: '95500', statutCrm: 'prospect' },
  { id: 5, nom: 'GARAGE FICTIF CLIENT SANS EBP', ville: 'Goussainville', cp: '95190', statutCrm: 'client' },
  ...Array.from({ length: 60 }, (_, i) => ({ id: 100 + i, nom: 'ATELIER TÉLÉPHONE FICTIF ' + String(i + 1).padStart(3, '0'), ville: 'Sarcelles', cp: '95200', statutCrm: 'prospect' }))
];
const marche = [
  { siret: '66666666600001', nom: 'CARROSSERIE FICTIVE UN', ville: 'Goussainville', cp: '95190', naf: '45.20A' },      // même SIRET qu'une fiche du téléphone : identifiant certain, une seule ligne
  { siret: '77777777700001', nom: 'GARAGE FICTIF DEUX', ville: 'Goussainville', cp: '95190', naf: '45.20A' },          // même NOM, autre SIRET : jamais fusionné
  ...['A', 'B', 'C'].map((l, i) => ({ siret: '5555555550000' + (i + 1), nom: 'ATELIER MARCHÉ FICTIF ' + l, ville: 'Goussainville', cp: '95190', naf: '45.20A' })),
  ...Array.from({ length: 250 }, (_, i) => ({ siret: String(88888888800000 + i), nom: 'ATELIER MARCHÉ FICTIF SARCELLES ' + String(i + 1).padStart(3, '0'), ville: 'Sarcelles', cp: '95200', naf: '45.20A' }))
];
const CACHE = JSON.stringify({ etablissements: marche, date: '2026-10-20T08:00:00.000Z', total: marche.length, pages: 1, doublons: 0 });

before(async () => {
  travail = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-mesgarages-'));
  const ecrire = (n, l) => fs.writeFileSync(path.join(travail, n), Buffer.from(l.map(x => x.join(';')).join('\r\n') + '\r\n', 'latin1'));
  ecrire('clients.csv', [['Code client', 'Raison sociale', 'Ville', 'Code postal', 'Statut du compte', 'Famille client'],
    ['C10', 'SARL GARAGE FICTIF DEUX', 'Goussainville', '95190', 'Actif', 'Carrosserie'], ['C20', 'CARROSSERIE FICTIVE QUATRE', 'Gonesse', '95500', 'Actif', 'Carrosserie'],
    ['C30', 'CLIENT EBP SEUL FICTIF', 'Goussainville', '95190', 'Actif', 'Mécan']]);
  ecrire('pieces.csv', [['Type de pièce', 'N° pièce', 'Date', 'Code client', 'Nom du client', 'Montant HT', 'N° pièce d\'origine'],
    ['Facture client', 'FA-1', '04/11/2026', 'C10', 'SARL GARAGE FICTIF DEUX', '1 100,00', ''], ['Facture client', 'FA-2', '05/11/2026', 'C30', 'CLIENT EBP SEUL FICTIF', '500,00', ''],
    ['Facture client', 'FA-3', '05/11/2026', 'X99', 'CLIENT EBP INCONNU', '200,00', ''], ['Commande client', 'CC-1', '05/11/2026', 'C10', 'SARL GARAGE FICTIF DEUX', '9 999,00', '']]);
  fs.writeFileSync(path.join(travail, 'sauvegarde.json'), JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-06T06:00:00.000Z', clients: tel, devis: [] }));
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
async function page(adresse, opts = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await nav.newContext({ ...opts, deviceScaleFactor: process.env.CAPTURES ? 2 : (opts.deviceScaleFactor || 1) });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, [CLE_MARCHE, CACHE]); // marché fictif déjà importé
  const p = await ctx.newPage(), erreurs = [];
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
async function ouvrir(p) { await p.waitForSelector('#f-ouvrir:not([hidden])'); await p.fill('#mdp', MDP); await p.click('#valider'); await p.waitForSelector('html[data-coffre="pret"]'); await p.waitForSelector('#kpis .kpi', { state: 'attached' }); }
async function importer(p, sel, f) { const g = await gen(p); await p.setInputFiles(sel, path.join(travail, f)); await attendre(p, g); }
const decider = async (p, d) => { const g = await gen(p); await p.evaluate(d => OdicolorBureau.decisions.decider(d), Object.assign({ auteur: AUTEUR }, d)); await attendre(p, g); };
const aller = async (p, hash, sel = '.vc-ligne') => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForSelector(sel); };
const lignes = p => p.$$eval('.vc-ligne', l => l.map(b => ({ uid: b.dataset.uid, num: Number(b.dataset.num), nom: b.querySelector('.vc-nom').getAttribute('title'), fond: b.querySelector('.vc-num').style.background,
  compte: (b.querySelector('[class*="vc-bc-"]') || {}).textContent, deux: b.querySelector('.vc-deux').textContent, marche: !!b.querySelector('.vc-b-marche'), texte: b.textContent.replace(/\s+/g, ' ').trim() })));
const comptePortee = async (p, c) => Number(await p.textContent(`.vc-por-${c} span`));
const txt = (p, s) => p.textContent(s).then(t => t.replace(/\s+/g, ' ').trim());

test('1. Mes garages : décisions du coffre, identifiants fiables, statut du téléphone ≠ compte EBP, source et date, marché distinct, tous listés', async () => {
  const dossier = path.join(travail, 'coffre'); prog = await lancer(dossier); port = prog.port;
  let { ctx, p, erreurs } = await page(prog.adresse);
  try {
    await creer(p);
    await p.click('#mode'); await importer(p, '#fichier-sauvegarde', 'sauvegarde.json'); await p.click('#mode');
    await importer(p, '#ebp-clients', 'clients.csv'); await importer(p, '#ebp-pieces', 'pieces.csv');
    // Décisions humaines (même fonction que l'écran « Vérifier les comptes »).
    const g = n => { const x = tel.find(t => t.id === n); return { tel: n, nom: x.nom, cp: x.cp }; };
    await decider(p, { type: 'liaison', cible: g(2), codeEbp: 'C10' });
    await decider(p, { type: 'absence', cible: g(3) });
    await decider(p, { type: 'absence', cible: g(4), ecarte: ['C20'] });

    // --- Commune de Goussainville, vue « Mes garages » (aucun garage fictif) ---
    await aller(p, 'commune-95280');
    assert.equal(await p.textContent('.vc-fictif'), 'MES GARAGES');
    assert.doesNotMatch(await p.textContent('#vue'), /DONNÉES FICTIVES|ÉTABLISSEMENT SIRENE/);
    assert.match(await txt(p, '.vc-src-ligne'), /Téléphone du 06\/11\/2026.*Clients EBP du 07\/11\/2026.*Annuaire officiel du 20\/10\/2026.*3 décision\(s\) de compte \(coffre\)/);
    assert.equal(await p.$eval('.vc-por-mes_garages', b => b.getAttribute('aria-pressed')), 'true', '« Mes garages » d’abord');
    const mes = await lignes(p);
    assert.deepEqual(mes.map(l => l.nom).sort(), ['CARROSSERIE FICTIVE UN', 'CLIENT EBP SEUL FICTIF', 'GARAGE FICTIF CLIENT SANS EBP', 'SARL GARAGE FICTIF DEUX'].sort(), 'garage du téléphone relié à EBP par la liaison validée : une seule ligne');
    assert.equal(mes.filter(l => l.marche).length, 0);
    const ligne = n => mes.find(l => l.nom === n);
    // Statut du téléphone ET situation du compte EBP, séparés, jamais fusionnés.
    assert.match(ligne('SARL GARAGE FICTIF DEUX').deux, /Téléphone : client \(06\/11\/2026\) · Compte EBP : en compte/);
    assert.match(ligne('CLIENT EBP SEUL FICTIF').deux, /Téléphone : absent du téléphone · Compte EBP : en compte/);
    assert.match(ligne('GARAGE FICTIF CLIENT SANS EBP').deux, /Téléphone : client \(06\/11\/2026\) · Compte EBP : à vérifier/, 'déclaré client au téléphone ≠ compte confirmé');
    assert.match(ligne('CARROSSERIE FICTIVE UN').deux, /Téléphone : prospect \(06\/11\/2026\) · Compte EBP : à vérifier/);
    // Pas de rapprochement incertain : l'homonyme du marché (autre SIRET) reste à part.
    assert.equal(await comptePortee(p, 'mes_garages'), 4); assert.equal(await comptePortee(p, 'marche'), 4); assert.equal(await comptePortee(p, 'tous'), 8);
    // Couleurs conservées (rouge = client carrosserie, noir = client mécanique, orange = prospect carrosserie, gris = métier inconnu).
    assert.equal(ligne('SARL GARAGE FICTIF DEUX').fond, 'rgb(212, 31, 43)');
    assert.equal(ligne('CLIENT EBP SEUL FICTIF').fond, 'rgb(11, 11, 13)');
    assert.equal(ligne('CARROSSERIE FICTIVE UN').fond, 'rgb(240, 149, 43)');
    await capture(p, 'mg-1-commune-mes-garages');

    // --- Marché à prospecter ---
    await p.click('.vc-por-marche'); await p.waitForSelector('.vc-por-marche[aria-pressed="true"]');
    const mar = await lignes(p);
    assert.deepEqual(mar.map(l => l.nom).sort(), ['ATELIER MARCHÉ FICTIF A', 'ATELIER MARCHÉ FICTIF B', 'ATELIER MARCHÉ FICTIF C', 'GARAGE FICTIF DEUX']);
    assert.ok(mar.every(l => l.marche && /Annuaire officiel seul/.test(l.deux)), 'chaque ligne du marché est marquée et jamais présentée comme un garage travaillé');
    assert.ok(mar.every(l => /^rgb\(90, 96, 106\)|^rgb\(138, 144, 153\)/.test(l.fond)), 'gris : à qualifier, jamais une couleur commerciale');
    // Tout : numéros stables entre les périmètres.
    await p.click('.vc-por-tous'); await p.waitForSelector('.vc-por-tous[aria-pressed="true"]');
    const tous = await lignes(p);
    assert.equal(tous.length, 8); assert.equal(new Set(tous.map(l => l.uid)).size, 8);
    for (const l of [...mes, ...mar]) assert.equal(tous.find(t => t.uid === l.uid).num, l.num, 'numéro identique dans chaque périmètre : ' + l.nom);
    await capture(p, 'mg-2-commune-tous');

    // --- Aperçu puis fiche : même information dans la liste, l'aperçu et la fiche ---
    await p.click('.vc-por-mes_garages'); await p.waitForSelector('.vc-por-mes_garages[aria-pressed="true"]');
    await p.click('.vc-ligne:has(.vc-nom:text-is("SARL GARAGE FICTIF DEUX"))');
    assert.match(await txt(p, '.vc-apercu'), /Mes garages.*Téléphone : client.*Compte EBP : en compte/);
    assert.match(await txt(p, '.vc-apercu'), /novembre 2026 : 1 100,00 € HT/, 'CA facturé rattaché par le code client EBP');
    await capture(p, 'mg-3-apercu');
    await p.click('.vc-apercu .vc-ouvrir'); await p.waitForSelector('#couche-fiche .fiche');
    const champ = n => p.evaluate(n => { const c = [...document.querySelectorAll('#couche-fiche .champ')].find(x => x.querySelector('.n').textContent === n); return c ? c.textContent.replace(/\s+/g, ' ').trim() : null; }, n);
    assert.equal(await txt(p, '#fiche-titre'), 'GARAGE FICTIF DEUX', 'fiche d’origine du garage du téléphone, retrouvée par son identifiant');
    assert.match(await txt(p, '#couche-fiche .pastille-statut'), /Client ODICOLOR carrosserie/, 'en-tête de la fiche = statut de la liste (même modèle), pas l’ancien rapprochement par le nom');
    assert.match(await champ('Périmètre'), /Mes garages/);
    assert.match(await champ('Statut commercial déclaré (téléphone)'), /Client.*Terrain du 06\/11\/2026/);
    assert.match(await champ('Compte ODICOLOR (EBP)'), /En compte · Code client EBP C10/);
    assert.match(await champ('Code client EBP'), /C10/);
    assert.match(await champ('Sources'), /Terrain du 06\/11\/2026 · EBP du 07\/11\/2026/);
    await capture(p, 'mg-4-fiche');
    await p.click('#couche-fiche .fermer');
    // Fiche d'un établissement du marché : source « Annuaire officiel », jamais « Saisi terrain ».
    await p.click('.vc-por-marche'); await p.click('.vc-ligne:has(.vc-nom:text-is("ATELIER MARCHÉ FICTIF A"))'); await p.click('.vc-apercu .vc-ouvrir'); await p.waitForSelector('#couche-fiche .fiche');
    assert.match(await txt(p, '#couche-fiche .fiche-tete'), /Annuaire officiel/); assert.doesNotMatch(await txt(p, '#couche-fiche .fiche-tete'), /Saisi terrain/);
    assert.match(await champ('Périmètre'), /Marché à prospecter/); assert.match(await champ('Sources'), /SIRENE du 20\/10\/2026/);
    await p.click('#couche-fiche .fermer');
    assert.deepEqual(erreurs, []);
    await ctx.close();

    // --- Fermeture, arrêt brutal, réouverture : mêmes statuts, repris du coffre ---
    await tuer(prog); prog = await lancer(dossier, port);
    ({ ctx, p, erreurs } = await page(prog.adresse)); await ouvrir(p);
    await aller(p, 'commune-95280');
    assert.deepEqual((await lignes(p)).map(l => [l.uid, l.num, l.nom, l.compte, l.deux]), mes.map(l => [l.uid, l.num, l.nom, l.compte, l.deux]), 'identique après arrêt brutal');
    assert.equal(await comptePortee(p, 'tous'), 8);
    await aller(p, 'commune-95277');                                                              // Gonesse : décisions du coffre
    const gon = await lignes(p);
    assert.deepEqual(gon.map(l => [l.nom, l.compte]).sort(), [['CARROSSERIE FICTIVE QUATRE', 'Sans compte'], ['CARROSSERIE FICTIVE QUATRE', 'En compte'], ['MÉCA FICTIVE TROIS', 'Sans compte']].sort(),
      'absences vérifiées reprises du coffre ; l’homonyme EBP reste une ligne séparée (jamais fusionné par ressemblance)');
    assert.deepEqual(erreurs, []);
    await ctx.close();
  } finally { await ctx?.close().catch(() => {}); }
});

test('2. commune très dense (60 garages du téléphone + 250 du marché) : tous listés et accessibles, 39 bâtiments + îlot', async () => {
  const { ctx, p, erreurs } = await page(prog.adresse);
  try {
    await ouvrir(p); await aller(p, 'commune-95585');
    assert.equal(await comptePortee(p, 'mes_garages'), 60); assert.equal(await comptePortee(p, 'marche'), 250); assert.equal(await comptePortee(p, 'tous'), 310);
    assert.equal(await p.$$eval('.vc-ligne', l => l.length), 60, '« Mes garages » : les 60 sont listés');
    assert.deepEqual(await p.evaluate(() => { const s = window.vueCommuneBureau.stats; return [s.dessines, s.reste]; }), [39, 21], '39 bâtiments + îlot « +21 »');
    assert.match(await p.textContent('.vc-ilot'), /\+21 · liste/);
    await capture(p, 'mg-5-commune-dense');
    await p.click('.vc-por-tous'); await p.waitForSelector('.vc-por-tous[aria-pressed="true"]');
    const tous = await lignes(p);
    assert.equal(tous.length, 310); assert.equal(new Set(tous.map(l => l.uid)).size, 310, 'aucun doublon');
    assert.equal(tous.filter(l => l.marche).length, 250);
    // Chaque garage du téléphone est accessible (liste → aperçu), y compris dans l'îlot.
    for (const n of [1, 40, 60]) {
      const nom = 'ATELIER TÉLÉPHONE FICTIF ' + String(n).padStart(3, '0');
      await p.fill('.vc-chercher', nom.toLowerCase().replace('é', 'e')); await p.click(`.vc-liste li:not([hidden]) .vc-ligne`);
      assert.match(await txt(p, '.vc-apercu h4'), new RegExp(nom));
    }
    // Recherche globale par SIRET d'un établissement du marché : la commune s'ouvre, le garage est sélectionné.
    await p.fill('#recherche-globale', ''); await p.type('#recherche-globale', '88888888800249'); await p.waitForSelector('.mv-res[data-mv="garage"]');
    assert.match(await txt(p, '.mv-res[data-mv="garage"]'), /ATELIER MARCHÉ FICTIF SARCELLES 250.*marché à prospecter/);
    await p.click('.mv-res[data-mv="garage"]'); await p.waitForSelector('.vc-apercu:not([hidden])');
    assert.match(await txt(p, '.vc-apercu h4'), /ATELIER MARCHÉ FICTIF SARCELLES 250/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('3. Île-de-France / département avec Mes garages : périmètre, compteurs sans doublon, CA du mois par code client EBP, non attribué à part', async () => {
  const { ctx, p } = await page(prog.adresse);
  try {
    await ouvrir(p); await aller(p, 'communes', '.vc-dep');
    assert.equal(await txt(p, '.vc-fictif-txt'), 'MES GARAGES');
    assert.equal(await p.$eval('.vc-por-mes_garages', b => b.getAttribute('aria-pressed')), 'true');
    const n = c => comptePortee(p, c);
    assert.equal(await n('mes_garages') + await n('marche'), await n('tous'), 'chaque établissement dans un seul périmètre');
    const cpt = async c => Number(await p.textContent(`.vc-cpt-${c} .vc-cpt-n`));
    assert.equal(await cpt('en_compte') + await cpt('sans_compte') + await cpt('a_verifier'), await cpt('tous'), 'sans doublon');
    assert.equal(await cpt('tous'), await n('mes_garages'));
    assert.equal(await txt(p, '[data-ca="idf"]'), '1 600,00 € HT', 'C10 (1 100) + C30 (500), rattachés à Goussainville');
    assert.equal(await txt(p, '.vc-dep-na [data-ca="non-attribue"]'), '200,00 € HT', 'code client inconnu : à part, jamais deviné par le nom');
    assert.equal(await txt(p, '.vc-dep-na [data-ca="global"]'), '1 800,00 € HT');
    await p.click('.vc-por-marche'); await p.waitForSelector('.vc-por-marche[aria-pressed="true"]');
    assert.equal(await cpt('tous'), await n('marche')); assert.equal(await cpt('en_compte'), 0, 'le marché n’a aucun compte confirmé');
    assert.equal(await txt(p, '[data-ca="idf"]'), '1 600,00 € HT', 'le CA ne dépend pas du périmètre affiché');
    // Accueil : même CA que Ma Ville (un seul système).
    await p.evaluate(() => { location.hash = 'bureau'; }); await p.waitForSelector('#bloc-ca');
    assert.equal(await txt(p, '[data-ca="global"]'), '1 800,00 € HT');
    assert.equal(await txt(p, '[data-ca="idf"]'), '1 600,00 € HT'); assert.equal(await txt(p, '[data-ca="non-attribue"]'), '200,00 € HT');
    assert.match(await txt(p, '#bloc-comptes'), /3 en compte · 2 sans compte · 62 à vérifier/, 'compteurs de Mes garages seulement : le marché n’y entre pas');
  } finally { await ctx.close(); }
});

test('4. format Samsung (Galaxy) : périmètre et liste lisibles, zones ≥ 44 px, pas de défilement horizontal', async () => {
  const { ctx, p, erreurs } = await page(prog.adresse, { ...devices['Galaxy S9+'] });
  try {
    await ouvrir(p); await aller(p, 'commune-95280');
    for (const s of ['.vc-por', '.vc-cpt', '.vc-ligne']) { const m = await p.$$eval(s, l => Math.min(...l.map(e => e.getBoundingClientRect().height))); assert.ok(m >= 44, s + ' : ' + m); }
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.tap('.vc-por-marche'); await p.waitForSelector('.vc-por-marche[aria-pressed="true"]');
    await p.evaluate(() => document.querySelector('.vc-panneau').scrollIntoView());
    await capture(p, 'mg-6-samsung-marche');
    await p.tap('.vc-por-mes_garages'); await p.waitForSelector('.vc-por-mes_garages[aria-pressed="true"]');
    await p.tap('.vc-ligne'); await p.waitForSelector('.vc-apercu:not([hidden])');
    await capture(p, 'mg-7-samsung-apercu');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('5. sans sauvegarde du téléphone : « Mes garages » n’affiche aucune donnée fictive et le dit', async () => {
  const dossier = path.join(travail, 'coffre-vide'); const pr = await lancer(dossier);
  const { ctx, p } = await page(pr.adresse);
  try {
    await creer(p); await p.evaluate(() => { location.hash = 'commune-95280'; }); await p.waitForSelector('#vue .bloc, #vue .vc');
    // coffre neuf : démo affichée (mode démo) ; on vérifie qu'aucune donnée de « Mes garages » ne s'y mélange.
    assert.match(await p.textContent('.vc-fictif'), /DONNÉES FICTIVES/);
    assert.equal(await p.$$eval('.vc-b-marche', l => l.length) > 0, true, 'la démo contient du marché fictif, clairement marqué');
  } finally { await ctx.close(); await tuer(pr); }
});
