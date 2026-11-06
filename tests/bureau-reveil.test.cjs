'use strict';
// Réveil du cockpit : un voyant ne s'allume jamais sans sa donnée (bureau/reveil.js). Données fictives.
// Exécution : node --test tests/bureau-reveil.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { voyants } = require('../bureau/reveil.js');

const etats = r => Object.fromEntries(r.groupes.flatMap(g => g.voyants).map(v => [v.id, v.etat]));
const plan = (o = {}) => Object.assign({ kpi: { mois: { cmdN: 2, facN: 1 }, echu: null }, actions: [], rapprochements: [],
  sources: { preuvesCommerciales: { fiable: true, restrictions: [], signaux: 0 } } }, o);
const garages = [{ id: 1, nom: 'GARAGE FICTIF', commune: 'Massy', statut: 'prospect' }];

test('rien de chargé : 21 voyants, tous éteints', () => {
  const r = voyants({});
  assert.equal(r.total, 21); assert.equal(r.eteints, 21);
});

test('devis du téléphone non retrouvés dans EBP : partiel, jamais « allumé » avec 0', () => {
  const e = etats(voyants({ garagesTelephone: garages, telephone: { devis: [{}] }, pieces: { liens: true }, plan: plan() }));
  assert.equal(e.devis, 'partiel');
});

test('colonnes absentes : actions sans n° d’origine, clients sans famille ni statut → partiel', () => {
  const e = etats(voyants({ garagesTelephone: garages, pieces: { liens: false }, plan: plan(), clients: { clients: [], correspondance: [{ cle: 'code' }, { cle: 'nom' }] } }));
  assert.equal(e.actions, 'partiel'); assert.equal(e.couleurs, 'partiel'); assert.equal(e.bloques, 'partiel');
});

test('historique EBP trop court : signaux et inactifs partiels, avec la raison', () => {
  const r = voyants({ garagesTelephone: garages, pieces: { liens: true }, clients: { clients: [], correspondance: [{ cle: 'famille' }, { cle: 'statut' }] },
    plan: plan({ sources: { preuvesCommerciales: { fiable: false, restrictions: ['Historique depuis le 2026-06-01 seulement.'], signaux: 0 } } }) });
  const e = etats(r), sig = r.groupes[1].voyants.find(v => v.id === 'signaux');
  assert.equal(e.signaux, 'partiel'); assert.equal(e.inactifs, 'partiel'); assert.match(sig.manque, /2026-06-01/);
});

test('sans échéancier : aucun impayé déclaré', () => {
  assert.equal(etats(voyants({ garagesTelephone: garages, pieces: { liens: true }, plan: plan() })).echu, 'eteint');
});

test('« À venir » (marge, objectif, panier, canaux, offres, supervision, essais) : jamais allumés aujourd’hui', () => {
  const r = voyants({ garagesTelephone: garages, telephone: { devis: [] }, pieces: { liens: true }, reglements: {}, clients: { clients: [], correspondance: [{ cle: 'famille' }, { cle: 'statut' }] },
    plan: plan({ rapprochements: [{}] }), ebpVille: { rapport: { relies: 1, ambigus: [] } }, garages });
  const avenir = r.groupes.find(g => g.id === 'avenir').voyants;
  assert.equal(avenir.length, 7);
  for (const v of avenir) { assert.equal(v.etat, 'eteint', v.id); assert.ok(v.manque, v.id + ' : la donnée manquante est dite'); }
});
