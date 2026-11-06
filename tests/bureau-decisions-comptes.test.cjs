'use strict';
// Lot A — mémoire des décisions de compte (bureau/decisions-comptes.js) + effet dans le modèle Ma Ville. DONNÉES FICTIVES.
// Exécution : node --test tests/bureau-decisions-comptes.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const DC = require('../bureau/decisions-comptes.js');
const M = require('../bureau/ville/modele-commune.js');

const T = '2026-11-07T09:00:00.000Z';
const terrain = () => [
  { id: 1, nom: 'CARROSSERIE FICTIVE UN', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect' },
  { id: 2, nom: 'GARAGE FICTIF DEUX', ville: 'Goussainville', cp: '95190', statutCrm: 'client' },
  { id: 3, nom: 'MÉCA FICTIVE TROIS', ville: 'Gonesse', cp: '95500', statutCrm: 'prospect' },
  { id: 4, nom: 'CARROSSERIE FICTIVE QUATRE', ville: 'Gonesse', cp: '95500', statutCrm: 'prospect' }
];
const clientsEbp = () => [
  { code: 'C10', nom: 'SARL GARAGE FICTIF DEUX', ville: 'Goussainville', cp: '95190', statut: 'Actif', famille: 'Carrosserie' },
  { code: 'C20', nom: 'CARROSSERIE FICTIVE QUATRE', ville: 'Gonesse', cp: '95500', statut: 'Actif', famille: 'Carrosserie' }
];
const cible = g => ({ tel: g.id, nom: g.nom, cp: g.cp });
const NAZ = 'Vérificateur fictif';
function journal(...ops) { let j = DC.creerJournal(); for (const o of ops) j = DC.decider(j, Object.assign({ auteur: NAZ, date: '2026-11-07' }, o), { maintenant: T }).journal; return j; }
function modele(j, t = terrain(), c = clientsEbp()) {
  const a = DC.appliquer(j, { terrain: t, clientsEbp: c, exportClientsDu: '2026-11-06' });
  const m = M.construire({ arrete: '2026-11-06', terrain: t, clientsEbp: c, liaisonsValidees: a.liaisonsValidees, verificationsCompte: a.verificationsCompte, aRevoir: a.aRevoir });
  const tous = [...m.communes.values()].flatMap(x => x.etablissements).concat(m.aClasser);
  return { a, m, de: id => tous.find(e => e.sources.some(s => s.ref === 'tel:' + id)) };
}
const [G1, G2, G3, G4] = terrain();

test('1. une décision exige auteur, date, garage visé (nom + code postal) et, pour une liaison, un code EBP', () => {
  const j = DC.creerJournal(), essai = o => () => DC.decider(j, o, { maintenant: T });
  assert.throws(essai({ type: 'absence', date: '2026-11-07', cible: cible(G1) }), /Auteur obligatoire/);
  assert.throws(essai({ type: 'absence', auteur: NAZ, date: '07/11/2026', cible: cible(G1) }), /Date obligatoire/);
  assert.throws(essai({ type: 'absence', auteur: NAZ, date: '2026-11-08', cible: cible(G1) }), /futur/);
  assert.throws(essai({ type: 'absence', auteur: NAZ, cible: { tel: 1 } }), /Nom et code postal/);
  assert.throws(essai({ type: 'liaison', auteur: NAZ, cible: cible(G2) }), /Code client EBP obligatoire/);
  assert.throws(essai({ type: 'fusion', auteur: NAZ, cible: cible(G2) }), /Type de décision inconnu/);
  const r = DC.decider(j, { type: 'absence', auteur: NAZ, cible: cible(G1) }, { maintenant: T });
  assert.equal(r.decision.date, '2026-11-07', 'date du jour par défaut');
  assert.equal(r.decision.source, 'Absence de compte vérifiée dans EBP');
  assert.equal(j.decisions.length, 0, 'le journal reçu n’est jamais modifié');
});

test('2. sans décision humaine : aucune liaison, aucun « sans compte », même avec un nom proche dans EBP', () => {
  const { a, de, m } = modele(DC.creerJournal());
  assert.deepEqual([a.liaisonsValidees, a.verificationsCompte], [[], []]);
  assert.equal(de(2).compte.statut, 'a_verifier', '« SARL GARAGE FICTIF DEUX » ressemble mais n’est jamais relié seul');
  assert.equal(de(4).compte.statut, 'a_verifier', 'même nom exact dans EBP : proposition seulement');
  assert.ok(m.propositions.some(p => p.statut === 'a_confirmer'), 'le rapprochement incertain reste une proposition');
  for (const x of [1, 2, 3, 4]) assert.notEqual(de(x).compte.statut, 'sans_compte');
});

test('3. liaison validée → EN COMPTE (auteur, date, source) ; absence vérifiée → SANS COMPTE', () => {
  const { a, de } = modele(journal({ type: 'liaison', cible: cible(G2), codeEbp: 'C10', exportClientsDu: '2026-11-06' }, { type: 'absence', cible: cible(G1) }));
  assert.deepEqual(a.liaisonsValidees.map(l => [l.a, l.b, l.par, l.date]), [['tel:2', 'ebp:C10', NAZ, '2026-11-07']]);
  assert.equal(de(2).compte.statut, 'en_compte'); assert.deepEqual(de(2).codesEbp, ['C10']);
  assert.equal(de(1).compte.statut, 'sans_compte'); assert.match(de(1).compte.motif, new RegExp(NAZ)); assert.equal(de(1).compte.date, '2026-11-07');
  assert.equal(a.bilan.appliquees, 2);
});

test('4. ressemblance de nom : n’annule jamais une décision ; alerte visible à examiner ; la personne peut écarter la fiche', () => {
  const j = journal({ type: 'absence', cible: cible(G4) });
  const { a, de } = modele(j);
  assert.equal(a.etats[0].etat, 'appliquee', 'la décision humaine reste appliquée');
  assert.match(a.etats[0].alerte, /même nom et même code postal.*C20.*à examiner/); assert.deepEqual(a.etats[0].codesProches, ['C20']);
  assert.equal(a.bilan.alertes, 1);
  assert.equal(de(4).compte.statut, 'sans_compte'); assert.match(de(4).compte.motif, /⚠ .*C20/);
  assert.equal(j.decisions.length, 1, 'la décision reste dans le journal');
  // « Ce n'est pas ce garage » : nouvelle décision qui écarte la fiche, l'ancienne est remplacée (historique gardé).
  const j2 = DC.decider(j, { type: 'absence', cible: cible(G4), ecarte: ['C20'], auteur: NAZ }, { maintenant: T }).journal;
  const r2 = modele(j2);
  assert.deepEqual(r2.a.etats.map(e => e.etat), ['remplacee', 'appliquee']); assert.equal(r2.a.etats[1].alerte, undefined);
  assert.equal(r2.de(4).compte.statut, 'sans_compte'); assert.doesNotMatch(r2.de(4).compte.motif, /⚠/);
  assert.match(r2.de(4).compte.motif, /auteur déclaré, non authentifié/);
});

test('5. la décision la plus récente remplace la précédente ; annuler ne réactive rien ; historique complet', () => {
  let j = journal({ type: 'absence', cible: cible(G3) }, { type: 'liaison', cible: cible(G3), codeEbp: 'C10' });
  let r = modele(j);
  assert.deepEqual(r.a.etats.map(e => e.etat), ['remplacee', 'appliquee']);
  assert.equal(r.de(3).compte.statut, 'en_compte');
  j = DC.decider(j, { type: 'annulation', annule: 'D000002', auteur: NAZ }, { maintenant: T }).journal;
  r = modele(j);
  assert.deepEqual(r.a.etats.map(e => e.etat), ['remplacee', 'annulee', 'appliquee']);
  assert.equal(r.de(3).compte.statut, 'a_verifier', 'l’absence remplacée n’est pas réactivée');
  assert.equal(j.decisions.length, 3);
  assert.throws(() => DC.decider(j, { type: 'annulation', annule: 'D000002', auteur: NAZ }, { maintenant: T }), /déjà annulée/);
  assert.throws(() => DC.decider(j, { type: 'annulation', annule: 'D999999', auteur: NAZ }, { maintenant: T }), /introuvable/);
});

test('6. même n° de téléphone mais autre nom ou autre code postal → décision non appliquée, garage à revérifier', () => {
  const j = journal({ type: 'liaison', cible: cible(G2), codeEbp: 'C10' }, { type: 'absence', cible: cible(G1) });
  const t = terrain(); t[1] = Object.assign({}, t[1], { nom: 'AUTRE GARAGE FICTIF' }); t[0] = Object.assign({}, t[0], { cp: '95500', ville: 'Gonesse' });
  const { a, de } = modele(j, t);
  assert.deepEqual(a.etats.map(e => e.etat), ['a_reverifier', 'a_reverifier']);
  assert.equal(de(2).compte.statut, 'a_verifier'); assert.deepEqual(de(2).codesEbp, [], 'aucune liaison appliquée en silence');
  assert.match(de(1).compte.motif, /a changé/);
});

test('7. garage disparu de la sauvegarde : décision orpheline, conservée et listée, jamais perdue', () => {
  const j = journal({ type: 'absence', cible: cible(G3) });
  const { a, m } = modele(j, terrain().filter(g => g.id !== 3));
  assert.equal(a.etats[0].etat, 'orpheline'); assert.match(a.etats[0].motif, /conservée/);
  assert.equal(a.bilan.orphelines, 1); assert.equal(j.decisions.length, 1); assert.ok(m.bilan.conservation);
});

test('8. un code EBP relié à deux garages = conflit : rien appliqué ; code absent des exports = en attente, rien inventé', () => {
  const r = modele(journal({ type: 'liaison', cible: cible(G1), codeEbp: 'C10' }, { type: 'liaison', cible: cible(G2), codeEbp: 'C10' }));
  assert.deepEqual(r.a.etats.map(e => e.etat), ['conflit', 'conflit']);
  assert.equal(r.de(1).compte.statut, 'a_verifier'); assert.equal(r.de(2).compte.statut, 'a_verifier');
  const att = modele(journal({ type: 'liaison', cible: cible(G3), codeEbp: 'C99' }));
  assert.equal(att.a.etats[0].etat, 'en_attente'); assert.equal(att.de(3).compte.statut, 'a_verifier');
});

test('9. aucune donnée terrain modifiée ni perdue ; aucun doublon créé', () => {
  const t = terrain().map(g => Object.freeze(g)), c = clientsEbp().map(g => Object.freeze(g));
  const j = journal({ type: 'liaison', cible: cible(G2), codeEbp: 'C10' }, { type: 'absence', cible: cible(G1) });
  const avant = JSON.stringify([t, c, j]);
  const { m } = modele(j, t, c);
  assert.equal(JSON.stringify([t, c, j]), avant);
  assert.ok(m.bilan.conservation);
  const uids = [...m.communes.values()].flatMap(x => x.etablissements.map(e => e.uid));
  assert.equal(new Set(uids).size, uids.length);
  assert.equal(m.bilan.etablissements, 5, '4 garages + 1 client EBP (C20 non relié) ; C10 fusionné avec le garage 2 par la liaison validée');
});

test('10. relecture du coffre : journal identique après aller-retour ; décision altérée signalée, jamais effacée', () => {
  const j = journal({ type: 'liaison', cible: cible(G2), codeEbp: 'C10' }, { type: 'absence', cible: cible(G1) });
  const relu = DC.lire(JSON.parse(JSON.stringify(j)));
  assert.deepEqual(relu.journal, j); assert.deepEqual(relu.illisibles, []);
  assert.deepEqual(DC.appliquer(relu.journal, { terrain: terrain(), clientsEbp: clientsEbp() }).bilan, DC.appliquer(j, { terrain: terrain(), clientsEbp: clientsEbp() }).bilan);
  const abime = JSON.parse(JSON.stringify(j)); delete abime.decisions[1].auteur;
  const r = DC.lire(abime);
  assert.equal(r.journal.decisions.length, 2, 'rien n’est jeté'); assert.deepEqual(r.illisibles, [{ position: 2, motif: 'Auteur obligatoire' }]);
  assert.match(DC.lire({ version: 9, decisions: [] }).erreur, /format inconnu/);
  assert.deepEqual(DC.lire(null).journal, DC.creerJournal(), 'ancien coffre sans journal : journal vide');
});
