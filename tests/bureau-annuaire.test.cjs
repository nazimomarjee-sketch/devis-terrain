'use strict';
// Bureau ODICOLOR — Lot 2 : marché des garages issu de l'annuaire officiel (API Recherche d'entreprises).
// Exécution : node --test tests/bureau-annuaire.test.cjs
// Aucun appel réseau : l'annuaire est simulé par un faux « fetch » qui sert des établissements fictifs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../bureau/annuaire.js');

// Établissement fictif au format de l'API (champs utilisés par annuaire.js).
function etab(siret, o = {}) {
  return Object.assign({ siret, code_postal: '91300', libelle_commune: 'MASSY', etat_administratif: 'A',
    activite_principale: '45.20A', latitude: '48.73', longitude: '2.27', liste_enseignes: null, tranche_effectif_salarie: 'NN', est_siege: true }, o);
}
function resultat(siren, nom, etabs) { return { siren, nom_complet: nom, nom_raison_sociale: nom, matching_etablissements: etabs }; }

// Faux annuaire paginé : 3 pages, 1 doublon entre pages, des lignes à écarter.
function fauxAnnuaire({ pannes = 0 } = {}) {
  const pages = {
    1: [resultat('100000001', 'CARROSSERIE FICTIVE UN', [etab('10000000100011')]),
        resultat('100000002', 'GARAGE FICTIF DEUX', [etab('10000000200011', { code_postal: '75015' })]), // hors 91 → écarté
        resultat('100000003', 'PNEUS FICTIFS', [etab('10000000300011', { tranche_effectif_salarie: '11' })])],
    2: [resultat('100000004', 'ATELIER FICTIF', [etab('10000000400011', { latitude: null, longitude: null })]),
        resultat('100000001', 'CARROSSERIE FICTIVE UN', [etab('10000000100011')])], // doublon de la page 1
    3: [resultat('100000005', 'GARAGE FERME', [etab('10000000500011', { etat_administratif: 'F' })]), // fermé → écarté
        resultat('100000006', 'AUTRE ACTIVITE', [etab('10000000600011', { activite_principale: '45.11Z' })])] // autre NAF → écarté
  };
  const appels = [];
  let restantes = pannes;
  const fetch = async (url) => {
    appels.push(url);
    if (restantes > 0) { restantes--; return { ok: false, status: 429, json: async () => ({}) }; }
    const p = Number(new URL(url).searchParams.get('page'));
    return { ok: true, status: 200, json: async () => ({ results: pages[p] || [], total_results: 7, total_pages: 3 }) };
  };
  return { fetch, appels };
}

test('requête : uniquement activité, département, état actif et pagination — aucune donnée client envoyée', () => {
  const u = new URL(A.urlPage('91', 2));
  assert.equal(u.origin + u.pathname, 'https://recherche-entreprises.api.gouv.fr/search');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['activite_principale', 'departement', 'etat_administratif', 'page', 'per_page']);
  assert.equal(u.searchParams.get('activite_principale'), '45.20A');
  assert.equal(u.searchParams.get('departement'), '91');
  assert.equal(u.searchParams.get('etat_administratif'), 'A');
});

test('lecture d’une page : garde les établissements actifs du 91 en 45.20A, écarte le reste', () => {
  const lus = A.lirePage({ results: [
    resultat('1', 'CARROSSERIE X', [etab('11111111100011')]),
    resultat('2', 'GARAGE Y', [etab('22222222200011', { code_postal: '75015' })]),
    resultat('3', 'GARAGE Z', [etab('33333333300011', { etat_administratif: 'F' })]),
    resultat('4', 'GARAGE W', [etab('44444444400011', { activite_principale: '45.11Z' })]),
    resultat('5', 'SANS SIRET', [etab(null)])
  ] }, '91');
  assert.deepEqual(lus.map(e => e.siret), ['11111111100011']);
  const e = lus[0];
  assert.equal(e.statut, 'marche', 'un établissement de l’annuaire n’est jamais un prospect qualifié');
  assert.equal(e.source, 'annuaire');
});

test('lecture d’une page : réponse au mauvais format refusée', () => {
  assert.throws(() => A.lirePage({}, '91'), /results/);
  assert.throws(() => A.lirePage(null, '91'), /results/);
});

test('type probable : déduit du nom seulement, présenté comme probable', () => {
  assert.equal(A.typeProbable('Carrosserie du Centre').type, 'carrosserie');
  assert.equal(A.typeProbable('ATELIER PEINTURE AUTO').type, 'carrosserie');
  assert.equal(A.typeProbable('Pneus Express').type, 'mecanique');
  assert.equal(A.typeProbable('SARL Dupont').type, 'a_qualifier');
  assert.match(A.typeProbable('SARL Dupont').motif, /vérifier/);
});

test('score de priorité : borné 0–100 et toujours expliqué', () => {
  const [e] = A.lirePage({ results: [resultat('1', 'CARROSSERIE X', [etab('11111111100011', { tranche_effectif_salarie: '12' })])] }, '91');
  assert.ok(e.score >= 0 && e.score <= 100);
  assert.ok(e.raisons.length >= 2);
  assert.ok(e.raisons.some(r => /carrosserie/.test(r)));
  const [sans] = A.lirePage({ results: [resultat('2', 'SARL', [etab('22222222200011', { latitude: null, longitude: null })])] }, '91');
  assert.equal(sans.position, null);
  assert.ok(sans.raisons.some(r => /pas de position/.test(r)));
});

test('distance : Massy-Palaiseau → Paris centre ≈ 15 km', () => {
  const d = A.distanceKm(A.BASE, { lat: 48.8566, lng: 2.3522 });
  assert.ok(d > 13 && d < 18, String(d));
});

test('fusion : pas de doublon de SIRET', () => {
  const liste = [{ siret: '1' }];
  const r = A.fusionner(liste, [{ siret: '1' }, { siret: '2' }, { siret: '2' }]);
  assert.deepEqual(r, { ajoutes: 1, doublons: 2 });
  assert.equal(liste.length, 2);
});

test('rapprochement avec mes garages : par SIRET ou par nom + commune', () => {
  const marche = A.lirePage({ results: [
    resultat('1', 'CARROSSERIE X', [etab('11111111100011')]),
    resultat('2', 'CARROSSERIE Y', [etab('22222222200011')]),
    resultat('3', 'CARROSSERIE Z', [etab('33333333300011')])
  ] }, '91');
  const n = A.rapprocher(marche, [
    { id: 'r1', siret: '11111111100011', nom: 'Autre nom', commune: 'Massy' },
    { id: 'r2', nom: 'Carrosserie Y', commune: 'Massy' }
  ]);
  assert.equal(n, 2);
  assert.deepEqual(marche.map(e => e.dejaTravaille), ['r1', 'r2', null]);
  assert.deepEqual(A.prioritaires(marche).map(e => e.siret), ['33333333300011'], 'déjà travaillés exclus des priorités');
});

test('indicateurs de commune : couverture et conquête calculées, null si aucune cible', () => {
  const marche = A.lirePage({ results: [resultat('1', 'CARROSSERIE X', [etab('11111111100011')]), resultat('2', 'CARROSSERIE Y', [etab('22222222200011')])] }, '91');
  const i = A.indicateursCommune(marche, [{ commune: 'Massy', statut: 'actif' }], 'Massy');
  assert.deepEqual([i.cibles, i.travailles, i.clients, i.couverture, i.conquete], [2, 1, 1, 50, 50]);
  assert.equal(A.indicateursCommune(marche, [], 'Orsay').couverture, null);
});

test('test de connexion : 2 pages maximum et contrôle de la pagination', async () => {
  const f = fauxAnnuaire();
  const r = await A.tester('91', { fetch: f.fetch, pause: 0 });
  assert.equal(f.appels.length, 2);
  assert.equal(r.total, 7);
  assert.equal(r.pages, 3);
  assert.equal(r.paginationOk, false, 'un doublon entre page 1 et 2 signale une pagination douteuse');
});

test('import complet : toutes les pages, doublons et lignes hors critères écartés', async () => {
  const f = fauxAnnuaire();
  const vues = [];
  const r = await A.importer('91', { fetch: f.fetch, pause: 0, progression: (p, n, k) => vues.push([p, n, k]) });
  assert.equal(f.appels.length, 3);
  assert.deepEqual(r.etablissements.map(e => e.siret).sort(), ['10000000100011', '10000000300011', '10000000400011']);
  assert.equal(r.doublons, 1);
  assert.deepEqual(vues.map(v => v[0]), [1, 2, 3]);
});

test('import : reprise automatique si l’annuaire est saturé (429)', async () => {
  const f = fauxAnnuaire({ pannes: 1 });
  const r = await A.importer('91', { fetch: f.fetch, pause: 0, maxPages: 1 });
  assert.equal(r.etablissements.length, 2);
  assert.equal(f.appels.length, 2);
});

test('import : arrêt demandé par l’utilisateur', async () => {
  const f = fauxAnnuaire();
  const c = new AbortController();
  const promesse = A.importer('91', { fetch: f.fetch, pause: 0, signal: c.signal, progression: (p) => { if (p === 1) c.abort(); } });
  await assert.rejects(promesse, /arrêté/);
});

test('import : erreur claire si l’annuaire refuse (403)', async () => {
  const fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(A.importer('91', { fetch, pause: 0 }), /403/);
});
