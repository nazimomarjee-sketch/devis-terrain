'use strict';
// Bureau ODICOLOR — logique pure (classement, lecture des sauvegardes téléphone, démo, simulation).
// Exécution : node --test tests/bureau-logique.test.cjs
// Aucun réseau, aucune donnée réelle : uniquement des garages fictifs.
// Recréé le 05/11/2026 : le fichier d'origine (tests/bureau-lot1.test.cjs) n'a pas été récupéré.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../bureau/bureau-logique.js');

// Gèle un objet en profondeur : toute tentative d'écriture lève une erreur en mode strict.
function geler(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(geler); Object.freeze(o); }
  return o;
}

// Sauvegarde fictive au format V47 du téléphone (app.js : exporterSauvegarde).
function sauvegardeV47(clients) {
  return { appli: 'devis-terrain', version: 1, date: '2026-11-01T10:00:00.000Z', reglages: {}, clients, devis: [] };
}

test('classement sûr : commune et code postal concordants', () => {
  const r = B.classer({ commune: 'Massy', cp: '91300' });
  assert.equal(r.niveau, 'sur');
  assert.equal(r.dep, '91');
  assert.equal(r.insee, '91377');
});

test('classement : saisies terrain courantes (St, s/, CEDEX, arrondissement)', () => {
  assert.equal(B.classer({ commune: 'Gif s/ Yvette', cp: '91190' }).niveau, 'sur');
  assert.equal(B.classer({ commune: 'ST MICHEL SUR ORGE', cp: '91240' }).niveau, 'sur');
  assert.equal(B.classer({ commune: 'Évry-Courcouronnes CEDEX', cp: '91000' }).niveau, 'sur');
  const paris = B.classer({ commune: 'Paris 15e', cp: '75015' });
  assert.equal(paris.niveau, 'sur');
  assert.equal(paris.insee, '75056');
});

test('classement : code postal faux pour la commune → à vérifier, jamais deviné', () => {
  const r = B.classer({ commune: 'Saclay', cp: '91190' }); // Saclay = 91400
  assert.equal(r.niveau, 'a_verifier');
  assert.equal(r.commune, '');
  assert.match(r.motif, /ne correspond pas/);
});

test('classement : homonyme dans deux départements sans code postal → à vérifier', () => {
  const r = B.classer({ commune: 'Marolles-en-Brie' }); // 77 et 94
  assert.equal(r.niveau, 'a_verifier');
  assert.match(r.motif, /plusieurs départements/);
});

test('classement : hors Île-de-France, vide, inconnu', () => {
  assert.equal(B.classer({ commune: 'Chartres', cp: '28000' }).niveau, 'hors_idf');
  assert.equal(B.classer({}).niveau, 'non_classe');
  assert.equal(B.classer({ commune: 'Ville imaginaire' }).niveau, 'non_classe');
  assert.equal(B.classer({ cp: '91999' }).niveau, 'a_verifier');
});

test('classement : code postal retrouvé dans l’adresse si le champ est vide', () => {
  const r = B.classer({ commune: 'Massy', adresse: '1 rue fictive 91300 Massy' });
  assert.equal(r.niveau, 'sur');
  assert.equal(r.cp, '91300');
});

test('classement : code postal partagé par plusieurs communes → commune à préciser', () => {
  const r = B.classer({ cp: '91190' }); // Gif-sur-Yvette, Saint-Aubin, Villiers-le-Bâcle…
  assert.equal(r.niveau, 'cp');
  assert.equal(r.commune, '');
  assert.match(r.motif, /partagé/);
});

test('statut : risque de règlement prioritaire, puis statut commercial', () => {
  assert.equal(B.statutGarage({ statut: 'client', compteStatut: 'Bloqué' }), 'risque');
  assert.equal(B.statutGarage({ statut: 'Client' }), 'actif');
  assert.equal(B.statutGarage({ statut: 'prospect' }), 'prospect');
  assert.equal(B.statutGarage({ statutCrm: 'Dormant' }), 'dormant');
  assert.equal(B.statutGarage({ statut: 'perdu' }), 'perdu');
  assert.equal(B.statutGarage({ statut: 'xyz' }), 'inconnu');
  assert.equal(B.statutGarage({}), 'prospect');
});

test('lecture sauvegarde V47 : ne modifie jamais le fichier reçu', () => {
  const s = geler(sauvegardeV47([
    { nom: 'Garage fictif A', ville: 'Massy', cp: '91300', statut: 'client', lat: 48.73, lng: 2.27 },
    { nom: 'Garage fictif B', ville: 'Saclay', cp: '91190', statut: 'prospect' }
  ]));
  const r = B.lireSauvegarde(s); // lèverait une TypeError si le code écrivait dans l'objet gelé
  assert.equal(r.garages.length, 2);
  assert.equal(r.garages[0].source, 'reel');
  assert.equal(r.garages[0].statut, 'actif');
  assert.deepEqual(r.garages[0].position, { lat: 48.73, lng: 2.27 });
  assert.equal(r.rapport.lus, 2);
  assert.equal(r.rapport.sur, 1);
  assert.equal(r.rapport.aVerifier, 1);
});

test('lecture sauvegarde : aucun montant inventé pour des données réelles', () => {
  const r = B.lireSauvegarde(sauvegardeV47([{ nom: 'Garage fictif', ville: 'Massy', cp: '91300', statut: 'client' }]));
  assert.equal(r.garages[0].caMois, null);
  assert.equal(r.garages[0].potentiel, null);
  assert.equal(B.statsDepartement(r.garages, '91').caMois, null, 'CA absent = null, jamais 0 ni estimé');
});

test('lecture sauvegarde : fichiers refusés avec un message clair', () => {
  assert.throws(() => B.lireSauvegarde(null), /illisible/);
  assert.throws(() => B.lireSauvegarde({ clients: [] }), /appli/);
  assert.throws(() => B.lireSauvegarde({ appli: 'plan-pc', clients: [] }), /appli/);
});

test('lecture sauvegarde : champs nettoyés et bornés (pas de caractères de contrôle, 5000 garages max)', () => {
  const r = B.lireSauvegarde(sauvegardeV47([{ nom: 'A\u0000B' + 'x'.repeat(500), ville: 'Massy', cp: '91300', lat: 999, lng: 2 }]));
  assert.ok(!r.garages[0].nom.includes('\u0000'));
  assert.ok(r.garages[0].nom.length <= 120);
  assert.equal(r.garages[0].position, null, 'latitude impossible rejetée');
  const beaucoup = Array.from({ length: 5100 }, (_, i) => ({ nom: 'G' + i, ville: 'Massy', cp: '91300' }));
  assert.equal(B.lireSauvegarde(sauvegardeV47(beaucoup)).garages.length, 5000);
});

test('lecture sauvegarde : homonymes conservés comme fiches distinctes', () => {
  const r = B.lireSauvegarde(sauvegardeV47([
    { nom: 'Carrosserie fictive', ville: 'Massy', cp: '91300' },
    { nom: 'Carrosserie fictive', ville: 'Massy', cp: '91300' }
  ]));
  assert.equal(r.garages.length, 2);
  assert.notEqual(r.garages[0].id, r.garages[1].id);
});

// Écart connu, à traiter au chantier « liaison téléphone → Bureau » (voir docs/FEUILLE_DE_ROUTE_TELEPHONE_BUREAU.md).
// Le nouveau format complet du Lot 1 (.odicolor, version 2) place les clients dans « stores ».
// Aujourd'hui le Bureau lirait 0 garage SANS message d'erreur : c'est trompeur.
test('sauvegarde Lot 1 version 2 : refus explicite ou lecture des clients', { todo: 'Liaison téléphone → Bureau : lire le format .odicolor v2' }, () => {
  const v2 = { appli: 'devis-terrain', version: 2, date: '2026-11-01T10:00:00.000Z', stores: { clients: [{ nom: 'Garage fictif', ville: 'Massy', cp: '91300' }] } };
  let r = null;
  try { r = B.lireSauvegarde(v2); } catch (e) { return; } // un refus explicite est acceptable
  assert.equal(r.garages.length, 1);
});

test('démo : reproductible (même graine = mêmes garages) et 100 % fictive', () => {
  const a = B.garagesDemo(2026), b = B.garagesDemo(2026);
  assert.deepEqual(a, b);
  assert.notDeepEqual(B.garagesDemo(7).map(g => g.statut), a.map(g => g.statut));
  assert.equal(a.length, 58);
  for (const g of a) {
    assert.equal(g.source, 'demo');
    assert.match(g.nom, /^Carrosserie démo \d{3}$/);
    assert.equal(g.tel, '');
    assert.equal(g.adresse, '');
    assert.equal(g.position, null, 'aucune position GPS inventée');
  }
  const rap = B.rapportClassement(a);
  assert.deepEqual([rap.aVerifier, rap.hors], [2, 1], 'les 3 cas pièges de la démo restent visibles');
});

test('statistiques : cohérence des comptes par département et par porte', () => {
  const g = B.garagesDemo(2026);
  const s = B.statsDepartement(g, '91');
  assert.equal(s.total, s.actif + s.prospect + s.dormant + s.risque + s.perdu + s.inconnu);
  assert.equal(s.alertes, s.risque + s.dormant);
  const totalIdf = ['75', '77', '78', '91', '92', '93', '94', '95'].reduce((n, d) => n + B.statsDepartement(g, d).total, 0);
  assert.equal(totalIdf + B.aClasser(g).length, g.length, 'chaque garage est compté une seule fois');
  const communes = B.communesDuDepartement(g, '91');
  assert.equal(communes.reduce((n, [, k]) => n + k, 0), s.total);
  for (const t of B.TERRITOIRES) assert.ok(B.statsTerritoire(g, t.id).total <= B.statsDepartement(g, t.dep).total);
});

test('simulation : agents fictifs reproductibles, budgets marqués « hypothèse »', () => {
  const a = B.agentsSimulation(2026);
  assert.deepEqual(a, B.agentsSimulation(2026));
  assert.equal(a.length, B.FAMILLES.reduce((n, f) => n + f.nb, 0));
  assert.equal(a.length, 30);
  for (const x of a) {
    assert.equal(x.source, 'simulation');
    assert.equal(x.budget.nature, 'hypothese');
    assert.ok(x.budget.min < x.budget.max);
  }
});

test('acteurs : 8 rôles, personnes réelles présentées comme rôles simulés, autres fictifs', () => {
  assert.equal(B.ACTEURS.length, 8);
  for (const a of B.ACTEURS) assert.ok(['Rôle simulé', 'Fictif'].includes(a.nature), a.nom);
  for (const id of ['act-com1', 'act-com2']) assert.equal(B.ACTEURS.find(a => a.id === id).nature, 'Fictif');
});

test('apparence des personnages : même garage = même visage', () => {
  assert.deepEqual(B.apparence('d12'), B.apparence('d12'));
});

test('territoires : chaque porte de la Ville est une vraie commune de son département', () => {
  assert.equal(B.TERRITOIRES.length, 8);
  for (const t of B.TERRITOIRES) {
    const r = B.classer({ commune: t.nom });
    assert.equal(r.insee, t.insee, t.nom);
    assert.equal(r.dep, t.dep, t.nom);
  }
});
