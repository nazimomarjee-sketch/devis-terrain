'use strict';
// Ma Ville — 4 segments (client/prospect × carrosserie/mécanique), sources EBP + SIRENE + terrain, aucun doublon automatique.
// Exécution : node --test tests/bureau-ma-ville.test.cjs — données 100 % fictives.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const MV = require('../bureau/ma-ville.js'), B = require('../bureau/bureau-logique.js'), A = require('../bureau/annuaire.js'), E = require('../bureau/ebp-import.js');

const AUJ = '2026-11-06';
const terrain = B.lireClients([
  { id: 1, nom: 'GARAGE FICTIF ALPHA', ville: 'Massy', cp: '91300', statutCrm: 'client' },
  { id: 2, nom: 'GARAGE FICTIF BETA', ville: 'Palaiseau', cp: '91120', statutCrm: 'client' },
  { id: 3, nom: 'CARROSSERIE FICTIVE DU PARC', ville: 'Orsay', cp: '91400', statutCrm: 'prospect' },
  { id: 4, nom: 'GARAGE FICTIF ZETA', ville: 'Les Ulis', cp: '91940', statutCrm: 'client' },
  { id: 5, nom: 'GARAGE FICTIF ZETA', ville: 'Les Ulis', cp: '91940', statutCrm: 'prospect' },
  { id: 6, nom: 'ATELIER FICTIF RAPIDE', ville: 'Massy', cp: '91300', statutCrm: 'prospect' }
], AUJ).garages.map(g => (g.nom === 'CARROSSERIE FICTIVE DU PARC' ? { ...g, siret: '10000000100011' } : g.nom === 'ATELIER FICTIF RAPIDE' ? { ...g, activite: 'Mécanique générale (saisie terrain)' } : g));
const clientsEbp = E.lireClientsEbp([['Code client', 'Raison sociale', 'Ville', 'Code postal', 'Statut du compte', 'Famille client'],
  ['C001', 'GARAGE FICTIF ALPHA', 'Massy', '91300', 'Actif', 'Carrosserie'],
  ['C002', 'GARAGE FICTIF BETA', 'Palaiseau', '91120', 'Actif', 'Mécan'],
  ['C006', 'GARAGE FICTIF ZETA', 'Les Ulis', '91940', 'Actif', 'Carrosserie'],
  ['C104', 'GARAGE FICTIF LAMBDA', 'Massy', '91300', 'Bloqué', 'Mécan'],
  ['C200', 'GARAGE FICTIF ANCIEN', 'Créteil', '94000', 'Actif', 'Carrosserie']]).clients;
const piecesEbp = [
  { type: 'commande', no: 'CC-1', date: '2026-10-02', code: 'C001', client: 'GARAGE FICTIF ALPHA', htCents: 100000 },
  { type: 'commande', no: 'CC-2', date: '2026-11-02', code: 'C002', client: 'GARAGE FICTIF BETA', htCents: 210000 },
  { type: 'commande', no: 'CC-3', date: '2025-06-10', code: 'C200', client: 'GARAGE FICTIF ANCIEN', htCents: 50000 },
  { type: 'commande', no: 'CC-4', date: '2026-03-10', code: 'C104', client: 'GARAGE FICTIF LAMBDA', htCents: 200000 },
  { type: 'commande', no: 'CC-5', date: '2026-09-01', code: 'C300', client: 'GARAGE FICTIF SANS FICHE', htCents: 30000 }];
const sirene = (siret, nom, cp, ville) => ({ siret, nom, cp, ville, typeProbable: A.typeProbable(nom).type });
const annuaire = [sirene('10000000100011', 'SARL PARC AUTO FICTIVE', '91400', 'ORSAY'), sirene('20000000100011', 'GARAGE FICTIF ALPHA', '91300', 'MASSY'),
  sirene('30000000100011', 'PNEUS FICTIFS', '91400', 'ORSAY'), sirene('40000000100011', 'GARAGE FICTIF ZETA', '91940', 'LES ULIS'), sirene('50000000100011', 'SARL FICTIVE', '91000', 'EVRY COURCOURONNES')];
const R = () => MV.construire({ terrain, clientsEbp, piecesEbp, annuaire, arrete: AUJ });
const par = (r, nom) => r.etablissements.filter(e => e.nom === nom);

test('4 couleurs : rouge, noir, orange, bleu (+ gris « à qualifier », jamais deviné)', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(MV.SEGMENTS).map(([k, v]) => [k, v.couleur])), {
    'client-carrosserie': '#D41F2B', 'client-mecanique': '#0B0B0D', 'prospect-carrosserie': '#F0952B', 'prospect-mecanique': '#3E86F0',
    'client-a_qualifier': '#6E737B', 'prospect-a_qualifier': '#6E737B' });
});

test('segments : client = connu dans EBP ; activité par famille EBP, puis terrain, puis nom (probable)', () => {
  const r = R(), s = n => par(r, n).map(e => e.segment);
  assert.deepEqual(s('GARAGE FICTIF ALPHA'), ['client-carrosserie'], 'famille EBP « Carrosserie »');
  assert.deepEqual(s('GARAGE FICTIF BETA'), ['client-mecanique'], 'famille EBP « Mécan »');
  assert.deepEqual(s('CARROSSERIE FICTIVE DU PARC'), ['prospect-carrosserie']);
  assert.deepEqual(s('ATELIER FICTIF RAPIDE'), ['prospect-mecanique'], 'saisie terrain');
  assert.deepEqual(s('PNEUS FICTIFS'), ['prospect-mecanique'], 'nom (probable)');
  assert.equal(par(r, 'PNEUS FICTIFS')[0].activite.probable, true);
  assert.deepEqual(s('SARL FICTIVE'), ['prospect-a_qualifier'], 'aucun indice : à qualifier');
  assert.deepEqual(s('GARAGE FICTIF SANS FICHE'), ['client-a_qualifier'], 'client vu dans les pièces EBP seulement');
});

test('clients EBP inactifs ou bloqués : restent clients et identifiables comme tels', () => {
  const r = R(), e = n => par(r, n)[0];
  assert.deepEqual([e('GARAGE FICTIF ANCIEN').segment, e('GARAGE FICTIF ANCIEN').inactif], ['client-carrosserie', true], 'dernière commande > 12 mois');
  assert.equal(e('GARAGE FICTIF ANCIEN').dep, '94');
  assert.deepEqual([e('GARAGE FICTIF LAMBDA').segment, e('GARAGE FICTIF LAMBDA').compteBloque, e('GARAGE FICTIF LAMBDA').inactif], ['client-mecanique', true, false]);
  assert.equal(e('GARAGE FICTIF ALPHA').inactif, false);
});

test('aucun doublon automatique : SIRET = certain ; nom + commune unique = probable signalé ; plusieurs candidats = mis de côté', () => {
  const r = R();
  const parc = par(r, 'CARROSSERIE FICTIVE DU PARC');
  assert.equal(parc.length, 1); assert.deepEqual(parc[0].sources, ['terrain', 'sirene']); assert.equal(parc[0].rapprochement, 'certain');
  assert.equal(par(r, 'SARL PARC AUTO FICTIVE').length, 0, 'même SIRET : pas de second établissement');
  const alpha = par(r, 'GARAGE FICTIF ALPHA');
  assert.equal(alpha.length, 1); assert.deepEqual(alpha[0].sources, ['terrain', 'ebp', 'sirene']); assert.equal(alpha[0].rapprochement, 'probable');
  assert.equal(par(r, 'GARAGE FICTIF ZETA').length, 2, 'homonymes du terrain jamais fusionnés');
  assert.deepEqual(r.aRapprocher.map(x => [x.source, x.nom]), [['ebp', 'GARAGE FICTIF ZETA'], ['sirene', 'GARAGE FICTIF ZETA']]);
  const cles = r.etablissements.filter(e => e.siret).map(e => e.siret);
  assert.equal(new Set(cles).size, cles.length, 'un SIRET = un seul établissement');
});

test('organisation : 8 départements d’Île-de-France, puis communes, comptes par segment', () => {
  const v = MV.parDepartement(R().etablissements);
  assert.deepEqual(Object.keys(v.departements), ['75', '77', '78', '91', '92', '93', '94', '95']);
  assert.deepEqual(v.departements['91'].communes['Massy'], { 'client-carrosserie': 1, 'prospect-mecanique': 1, 'client-mecanique': 1 });
  assert.equal(v.departements['94'].segments['client-carrosserie'], 1);
  assert.deepEqual(v.hors.map(e => e.nom), ['GARAGE FICTIF SANS FICHE'], 'sans commune connue : mis à part, jamais placé au hasard');
});

test('import EBP : colonne « famille » facultative, reconnue si présente', () => {
  assert.equal(clientsEbp[1].famille, 'Mécan');
  assert.equal(E.lireClientsEbp([['Code client', 'Nom'], ['C1', 'A']]).clients[0].famille, '');
});

test('cockpit : conquête par département (taux de clients parmi les établissements CONNUS)', () => {
  const r = R(), c = MV.conquete(r.etablissements, r.aRapprocher), d91 = c.departements.find(x => x.dep === '91');
  assert.deepEqual([d91.etablissements, d91.clients, d91.clientsActifs, d91.inactifs, d91.bloques, d91.prospects, d91.tauxClients], [9, 3, 3, 0, 1, 6, 33], 'ZETA (EBP) reste « à rapprocher » : ses 2 fiches homonymes restent prospects');
  assert.equal(c.departements.find(x => x.dep === '94').inactifs, 1);
  assert.equal(c.departements.find(x => x.dep === '75').tauxClients, null, 'aucun établissement connu : pas de taux');
  assert.deepEqual([c.aQualifier, c.probables, c.aRapprocher], [4, 2, 2], 'ZETA ×2, SANS FICHE, SARL FICTIVE à qualifier ; ALPHA et BETA rapprochés par le nom');
});

test('lot 1 — SIRET EBP : relie la fiche terrain de même SIRET malgré un nom différent ; un SIRET déjà lié à un autre code va « à rapprocher »', () => {
  const t = B.lireClients([{ id: 1, nom: 'CARROSSERIE FICTIVE OMEGA', ville: 'Massy', cp: '91300', statutCrm: 'prospect' }], AUJ).garages.map(g => ({ ...g, siret: '99999999900017' }));
  const c = E.lireClientsEbp([['Code client', 'Raison sociale', 'SIRET', 'Ville', 'Code postal'],
    ['C701', 'SARL OMEGA FICTIVE', '99999999900017', 'Massy', '91300'], ['C702', 'OMEGA BIS FICTIVE', '999 999 999 00017', 'Massy', '91300']]).clients;
  const r = MV.construire({ terrain: t, clientsEbp: c, piecesEbp: [], annuaire: [], arrete: AUJ });
  const omega = r.etablissements.filter(e => e.siret === '99999999900017');
  assert.equal(omega.length, 1, 'un seul établissement pour un SIRET'); assert.equal(omega[0].codeEbp, 'C701'); assert.ok(omega[0].sources.includes('terrain'));
  assert.ok(r.aRapprocher.some(x => x.code === 'C702' && /déjà lié au code EBP C701/.test(x.motif)), 'jamais de fusion automatique');
  assert.ok(!r.etablissements.some(e => e.codeEbp === 'C702'));
});
