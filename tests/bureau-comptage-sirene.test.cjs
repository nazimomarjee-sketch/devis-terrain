'use strict';
// Recensement, étape 1 : comptage des établissements actifs 45.20A (bureau/comptage-sirene.js). Fausse API aux vrais formats, DONNÉES FICTIVES.
// Exécution : node --test tests/bureau-comptage-sirene.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../bureau/comptage-sirene.js');

let n = 0;
const siret = () => String(10000000000000 + (++n));
const etab = (commune, o = {}) => Object.assign({ siret: siret(), activite_principale: '45.20A', etat_administratif: 'A', commune, code_postal: commune + '0' }, o);
const ent = (siren, code, etabs, o = {}) => Object.assign({ siren, activite_principale: code, etat_administratif: 'A', date_mise_a_jour_insee: '2026-10-30T10:00:00', _etabs: etabs }, o);

// Fausse API : filtre au niveau ENTREPRISE (code principal) et renvoie, par entreprise, les établissements du département (tous codes, tous états),
// exactement comme l'API officielle (vérifié le 07/11/2026).
function api(entreprises, { echecs = 0, ratePage = null, perPage = 25, repeter = false } = {}) {
  let appels = 0;
  const f = async url => {
    appels++;
    if (appels <= echecs) return { ok: false, status: 503, json: async () => ({}) };
    const p = new URL(url).searchParams, codes = p.get('activite_principale').split(','), dep = p.get('departement'), q = p.get('q');
    const page = Number(p.get('page')), pe = Number(p.get('page_etablissements') || 1), lim = Number(p.get('limite_matching_etablissements'));
    let liste = entreprises.filter(e => codes.includes(e.activite_principale) && e._etabs.some(x => x.commune.startsWith(dep)) && (!q || e.siren === q));
    const total = liste.length, pages = Math.max(1, Math.ceil(total / perPage));
    if (ratePage === page) liste = [];                                   // page manquante
    else liste = liste.slice((page - 1) * perPage, page * perPage);
    if (repeter === 'ajout' && page > 1) liste = [entreprises[0]].concat(liste);                  // une entreprise réapparaît, aucune n'est perdue
    else if (repeter && page > 1) liste = [entreprises[0]].concat(liste.slice(0, perPage - 1));  // elle réapparaît ET en pousse une autre hors de la page
    const results = liste.map(e => { const { _etabs, ...base } = e; return { ...base, matching_etablissements: _etabs.filter(x => x.commune.startsWith(dep)).slice((pe - 1) * lim, pe * lim) }; });
    return { ok: true, status: 200, json: async () => ({ results, total_results: total, page, per_page: perPage, total_pages: pages }) };
  };
  f.appels = () => appels;
  return f;
}
const opts = f => ({ fetch: f, pause: 0, reprise: 0 });

test('1. seuls les établissements 45.20A, actifs, du département sont comptés (fermés, autre code, autre département écartés)', async () => {
  const f = api([
    ent('100000001', '45.20A', [etab('95280'), etab('95280', { etat_administratif: 'F' }), etab('95277', { activite_principale: '68.20B' }), etab('75112')]),
    ent('100000002', '45.20A', [etab('95127'), etab('95127')])]);
  const r = await C.compterDepartement('95', { ...opts(f), sansCodesVoisins: true });
  assert.equal(r.statut, 'complet'); assert.equal(r.etablissementsActifs, 3);
  assert.deepEqual(r.ecartes, { fermes: 1, autreCode: 1, horsDepartement: 0 }, 'ce qui est écarté est compté et visible, jamais perdu');
  assert.equal(r.entreprisesDistinctesLues, 2);
});

test('2. un même SIRET vu deux fois (entreprise répétée, pages qui se recouvrent) n’est compté qu’une fois', async () => {
  const e1 = etab('94028'), partage = ent('200000001', '45.20A', [e1, etab('94028')]);
  const f = api([partage, { ...partage, siren: '200000002' }]);   // même établissement rattaché à deux entreprises de la fausse API
  const r = await C.compterDepartement('94', { ...opts(f), sansCodesVoisins: true });
  assert.equal(r.etablissementsActifs, 2, 'les 2 établissements apparaissent chacun deux fois : comptés une fois');
  assert.equal(r.entreprisesDistinctesLues, 2); assert.equal(r.etablissementsExamines, 4);
});

test('3. codes voisins : établissement 45.20A d’une entreprise d’un autre code compté À PART, sans doublon avec le chiffre principal', async () => {
  const commun = etab('91228');
  const f = api([ent('300000001', '45.20A', [commun]), ent('300000002', '45.11Z', [etab('91228'), etab('91228', { activite_principale: '45.11Z' })]),
    ent('300000003', '45.19Z', [commun])]);                                // même SIRET via une 2ᵉ entreprise : une seule fois
  const r = await C.compterDepartement('91', opts(f));
  assert.equal(r.etablissementsActifs, 2); assert.equal(r.dontEntreprisesCode452A, 1); assert.equal(r.dontEntreprisesCodesVoisins, 1);
  assert.deepEqual(r.codesVoisinsInterroges, [...C.CODES_VOISINS]);
});

test('4. plus de 100 établissements pour une même entreprise dans le département : toutes les pages sont lues', async () => {
  const gros = ent('400000001', '45.20A', Array.from({ length: 230 }, () => etab('77288')));
  const r = await C.compterDepartement('77', { ...opts(api([gros])), sansCodesVoisins: true });
  assert.equal(r.etablissementsActifs, 230); assert.equal(r.troncatures, 0);
});

test('5. coupure passagère : la source est relancée puis le résultat est complet', async () => {
  const f = api([ent('500000001', '45.20A', [etab('93066')])], { echecs: 2 });
  const r = await C.compterDepartement('93', { ...opts(f), sansCodesVoisins: true });
  assert.equal(r.statut, 'complet'); assert.equal(r.etablissementsActifs, 1); assert.ok(f.appels() >= 3);
});

test('6. BLOCAGE : source injoignable → « incomplet », AUCUN nombre (ni 0, ni total partiel)', async () => {
  const f = async () => { throw new Error('ENOTFOUND'); };
  const r = await C.compterDepartement('95', { ...opts(f), sansCodesVoisins: true });
  assert.equal(r.statut, 'incomplet'); assert.equal(r.etablissementsActifs, null); assert.match(r.motif, /injoignable/);
  assert.ok(!('dontEntreprisesCode452A' in r), 'aucun chiffre partiel');
}, { timeout: 60000 });

test('7. page manquante en cours de route : « incomplet », jamais un total partiel', async () => {
  const entreprises = Array.from({ length: 60 }, (_, i) => ent('6000000' + String(i).padStart(2, '0'), '45.20A', [etab('95280')]));
  const r = await C.compterDepartement('95', { ...opts(api(entreprises, { ratePage: 2 })), sansCodesVoisins: true });
  assert.equal(r.statut, 'incomplet'); assert.equal(r.etablissementsActifs, null); assert.match(r.motif, /inférieures au total annoncé/);
});

test('8. réponse au format inattendu : refusée', async () => {
  const f = async () => ({ ok: true, status: 200, json: async () => ({ message: 'autre chose' }) });
  const r = await C.compterDepartement('94', { ...opts(f), sansCodesVoisins: true });
  assert.equal(r.statut, 'incomplet'); assert.match(r.motif, /format inattendu/);
});

test('9. cinq départements : ordre demandé conservé, aucun classement, aucune somme si l’un est incomplet', async () => {
  assert.deepEqual([...C.DEPARTEMENTS], ['95', '94', '91', '77', '93']);
  const entreprises = [ent('700000001', '45.20A', [etab('95280'), etab('95280'), etab('95280')]), ent('700000002', '45.20A', [etab('94028')]), ent('700000003', '45.20A', [etab('93066'), etab('93066')])];
  const r = await C.compterTous({ ...opts(api(entreprises)), sansCodesVoisins: true });
  assert.deepEqual(r.departements.map(d => d.departement), ['95', '94', '91', '77', '93'], 'ordre donné, pas trié par nombre');
  assert.deepEqual(r.departements.map(d => d.etablissementsActifs), [3, 1, 0, 0, 2], '0 réel quand la source est lue et ne trouve rien');
  assert.equal(r.total, 6); assert.ok(r.complet);
  let k = 0; const f = api(entreprises), capricieux = async (u, o) => { if (new URL(u).searchParams.get('departement') === '91') throw new Error('panne'); return f(u, o); };
  const r2 = await C.compterTous({ fetch: capricieux, pause: 0, reprise: 0, sansCodesVoisins: true });
  assert.equal(r2.complet, false); assert.equal(r2.total, null, 'pas de total quand un département manque');
  assert.equal(r2.departements.find(d => d.departement === '91').etablissementsActifs, null, '« non renseigné », pas 0');
  assert.equal(r2.departements.find(d => d.departement === '95').etablissementsActifs, 3, 'les autres restent valides');
}, { timeout: 90000 });

test('10. limites et avertissement toujours joints ; 45.20A jamais présenté comme atelier peinture confirmé', async () => {
  const r = await C.compterDepartement('95', { ...opts(api([ent('800000001', '45.20A', [etab('95280')])])), sansCodesVoisins: true });
  assert.match(r.avertissement, /pas une confirmation d’activité de peinture/);
  assert.ok(r.limites.some(l => /Nombre minimal/.test(l)) && r.limites.some(l => /non diffusibles/.test(l)));
  assert.equal(r.donneesInseeAuPlusTard, '2026-10-30'); assert.match(r.source, /SIRENE/);
  assert.ok(!JSON.stringify(r).match(/peinture confirm|atelier peinture|carrosserie confirm/i) || /pas une confirmation/.test(r.avertissement));
});

test('11. la requête interroge bien le département et l’activité, en réponse minimale', () => {
  const p = new URL(C.url('94', [C.NAF], 3)).searchParams;
  assert.equal(p.get('departement'), '94'); assert.equal(p.get('activite_principale'), '45.20A'); assert.equal(p.get('page'), '3');
  assert.equal(p.get('etat_administratif'), 'A'); assert.equal(p.get('minimal'), 'true'); assert.equal(p.get('limite_matching_etablissements'), '100');
});

test('12. la source bouge pendant la lecture : une entreprise réapparaît sur une autre page → comptée une fois ; une entreprise manquée → incomplet', async () => {
  const entreprises = Array.from({ length: 60 }, (_, i) => ent('9000000' + String(i).padStart(2, '0'), '45.20A', [etab('95280')]));
  // Réapparition d'une entreprise sur les pages suivantes : les 60 lignes sont lues avec des doublons, mais les entreprises distinctes sont décalées.
  const r = await C.compterDepartement('95', { ...opts(api(entreprises, { repeter: 'ajout' })), sansCodesVoisins: true });
  assert.equal(r.statut, 'complet'); assert.equal(r.etablissementsActifs, 60, 'établissements dédoublonnés');
  assert.ok(r.entreprisesReapparues > 0, 'les réapparitions sont signalées, pas cachées');
  const decalee = api(entreprises, { repeter: true });
  const r2 = await C.compterDepartement('95', { ...opts(decalee), sansCodesVoisins: true });
  assert.equal(r2.statut, 'incomplet', 'une entreprise a disparu de la lecture (remplacée par une réapparition) : refusé, jamais un total présenté comme complet');
  assert.match(r2.motif, /inférieures au total annoncé/);
});
