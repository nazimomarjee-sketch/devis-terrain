'use strict';
// Socle 0 — modèle commun et droits par rôle. Exécution : node --test tests/socle-droits.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const O = require('../socle/organisation.js'), M = require('../socle/modele.js'), D = require('../socle/droits.js');

const NAZIM = { uid: 'u-developpement', nom: 'Responsable du développement (fictif)', role: 'developpement', actif: true };
const FAIZAL = { uid: 'u-direction', nom: 'Direction (fictif)', role: 'direction', actif: true };
const ok = (u, op) => D.peut(u, op).ok;
const decision = (o = {}) => Object.assign({ uid: 'd-00000001', type: 'remise', titre: 'Remise 10 % garage fictif', proposeePar: NAZIM.uid, statut: 'proposee' }, o);

test('organisation : 2 rôles actifs au départ, futurs pôles déclarés mais inactifs', () => {
  assert.deepEqual(Object.keys(O.ROLES).filter(O.roleActif), ['developpement', 'direction']);
  assert.deepEqual(Object.entries(O.POLES).filter(([, p]) => !p.actif).map(([k]) => k), ['magasin', 'formation', 'administratif', 'marketing']);
  for (const [, p] of Object.entries(O.POLES).filter(([, p]) => !p.actif)) assert.match(p.activation, /Décision de la direction/);
  assert.ok(O.DECISIONS_DIRECTION.includes('activation-pole'));
});

test('modèle : objets valides acceptés, champ inconnu ou valeur invalide refusés avec la cause', () => {
  assert.deepEqual(M.valider('garage', { uid: 'g-00000001', nom: 'GARAGE FICTIF', statut: 'prospect' }), []);
  assert.deepEqual(M.valider('garage', { uid: 'g-00000001', nom: 'X', statut: 'prospect', couleur: 'rouge' }), ['Champ inconnu : couleur']);
  assert.deepEqual(M.valider('garage', { uid: 'g-00000001', statut: 'vip' }), ['Valeur invalide : statut', 'Champ obligatoire : nom']);
  assert.deepEqual(M.valider('devisTerrain', { uid: 'v-00000001', garageUid: 'g-00000001', totalCents: 10.5, statut: 'envoye', date: '2026-11-06' }), ['Valeur invalide : totalCents']);
  assert.deepEqual(M.valider('visite', { uid: 'v-00000001', garageUid: 'g-00000001', date: '2026-02-30', resultat: 'vu' }), ['Valeur invalide : date']);
  assert.deepEqual(M.valider('garage', { uid: 'X', nom: 'A', statut: 'client' }), ['uid invalide']);
  assert.deepEqual(M.valider('inconnue', {}), ['Entité inconnue : inconnue']);
});

test('responsable du développement : pilote le terrain, ne supprime rien, n’écrit jamais EBP', () => {
  for (const e of ['garage', 'visite', 'action', 'devisTerrain']) {
    assert.ok(ok(NAZIM, { type: 'creer', entite: e, champs: {} }), e);
    assert.ok(ok(NAZIM, { type: 'modifier', entite: e, avant: {}, champs: {} }), e);
    assert.equal(ok(NAZIM, { type: 'supprimer', entite: e }), false, e);
  }
  assert.ok(ok(NAZIM, { type: 'importer', entite: 'pieceEbp', champs: {} }));
  assert.equal(ok(NAZIM, { type: 'modifier', entite: 'pieceEbp', avant: {}, champs: { htCents: 1 } }), false);
  assert.equal(ok(NAZIM, { type: 'creer', entite: 'pieceEbp', champs: {} }), false);
  assert.equal(ok(NAZIM, { type: 'creer', entite: 'utilisateur', champs: {} }), false, 'comptes : direction');
});

test('responsable du développement : propose les décisions de direction, ne peut jamais les trancher', () => {
  assert.ok(ok(NAZIM, { type: 'creer', entite: 'decision', champs: decision() }));
  assert.equal(ok(NAZIM, { type: 'creer', entite: 'decision', champs: decision({ statut: 'validee', decideePar: NAZIM.uid }) }), false);
  assert.equal(ok(NAZIM, { type: 'creer', entite: 'decision', champs: decision({ proposeePar: FAIZAL.uid }) }), false, 'au nom d’un autre');
  assert.ok(ok(NAZIM, { type: 'modifier', entite: 'decision', avant: decision(), champs: { expose: 'Précision' } }));
  for (const statut of ['validee', 'refusee', 'a_completer'])
    assert.equal(ok(NAZIM, { type: 'modifier', entite: 'decision', avant: decision(), champs: { statut } }), false, statut);
  assert.equal(ok(NAZIM, { type: 'modifier', entite: 'decision', avant: decision(), champs: { motifDirection: 'ok' } }), false);
  assert.equal(ok(NAZIM, { type: 'modifier', entite: 'decision', avant: decision({ statut: 'validee' }), champs: { titre: 'Autre' } }), false, 'décision tranchée figée');
  assert.ok(ok(NAZIM, { type: 'modifier', entite: 'decision', avant: decision({ statut: 'a_completer' }), champs: { expose: 'Complément', statut: 'proposee' } }), 'renvoi après complément');
  assert.equal(ok(NAZIM, { type: 'modifier', entite: 'decision', avant: decision({ proposeePar: 'u-autre-personne' }), champs: { expose: 'x' } }), false);
});

test('objectifs : proposés par le développement, validés uniquement par la direction', () => {
  assert.ok(ok(NAZIM, { type: 'creer', entite: 'objectif', champs: { statut: 'propose' } }));
  assert.equal(ok(NAZIM, { type: 'creer', entite: 'objectif', champs: { statut: 'valide', valideePar: NAZIM.uid } }), false);
  assert.equal(ok(NAZIM, { type: 'modifier', entite: 'objectif', avant: { statut: 'propose' }, champs: { statut: 'valide' } }), false);
  assert.equal(ok(NAZIM, { type: 'modifier', entite: 'objectif', avant: { statut: 'valide' }, champs: { caCents: 1 } }), false);
  assert.ok(ok(FAIZAL, { type: 'modifier', entite: 'objectif', avant: { statut: 'propose' }, champs: { statut: 'valide', valideePar: FAIZAL.uid } }));
  assert.equal(ok(FAIZAL, { type: 'modifier', entite: 'objectif', avant: { statut: 'propose' }, champs: { statut: 'valide' } }), false, 'qui a validé ?');
});

test('direction : consulte tout, tranche les décisions, demande des actions, ne réécrit pas le terrain', () => {
  for (const e of Object.keys(M.ENTITES)) assert.ok(ok(FAIZAL, { type: 'lire', entite: e }), e);
  assert.ok(ok(FAIZAL, { type: 'modifier', entite: 'decision', avant: decision(), champs: { statut: 'validee', decideePar: FAIZAL.uid, decideeLe: '2026-11-07', motifDirection: 'Accord' } }));
  assert.ok(ok(FAIZAL, { type: 'modifier', entite: 'decision', avant: decision(), champs: { statut: 'a_completer', motifDirection: 'Chiffrer la marge' } }));
  assert.equal(ok(FAIZAL, { type: 'modifier', entite: 'decision', avant: decision(), champs: { statut: 'validee' } }), false, 'qui a décidé ?');
  assert.equal(ok(FAIZAL, { type: 'modifier', entite: 'decision', avant: decision(), champs: { titre: 'Réécrite' } }), false, 'le contenu reste celui de l’auteur');
  assert.ok(ok(FAIZAL, { type: 'creer', entite: 'action', champs: { source: 'direction' } }));
  assert.equal(ok(FAIZAL, { type: 'creer', entite: 'action', champs: { source: 'terrain' } }), false);
  for (const e of ['garage', 'visite', 'devisTerrain']) assert.equal(ok(FAIZAL, { type: 'modifier', entite: e, avant: {}, champs: {} }), false, e);
  assert.equal(ok(FAIZAL, { type: 'importer', entite: 'pieceEbp', champs: {} }), false);
  assert.ok(ok(FAIZAL, { type: 'creer', entite: 'utilisateur', champs: {} }), 'gouvernance des comptes');
});

test('comptes désactivés et rôles futurs : aucun droit, sur aucune entité', () => {
  const ops = ['lire', 'creer', 'modifier', 'importer', 'supprimer'];
  const comptes = [{ ...NAZIM, actif: false }, ...['commercial', 'magasin', 'formation', 'administratif'].map(role => ({ uid: 'u-' + role, nom: role, role, actif: true }))];
  for (const u of comptes) for (const e of Object.keys(M.ENTITES)) for (const type of ops)
    assert.equal(ok(u, { type, entite: e, avant: {}, champs: {} }), false, u.role + ' ' + type + ' ' + e);
  assert.equal(D.filtrerLecture({ uid: 'u-magasin', role: 'magasin', actif: true }, 'garage', {}), null);
});

test('lecture : copie (jamais l’objet d’origine), montants visibles pour les 2 rôles actifs', () => {
  const p = { uid: 'p-00000001', htCents: 12345 };
  const lu = D.filtrerLecture(FAIZAL, 'pieceEbp', p);
  assert.deepEqual(lu, p); assert.notEqual(lu, p);
});
