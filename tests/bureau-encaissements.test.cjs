'use strict';
// Lot 1 (13/11/2026) : encaissements constatés, créances, comptes bloqués. DONNÉES FICTIVES. node --test tests/bureau-encaissements.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../bureau/ebp-import.js');
const EN = require('../bureau/encaissements.js');

const reglements = E.lireReglements([['N° facture', 'Échéance', 'Date de règlement', 'Montant TTC', 'Reste à payer'],
  ['FA-E1', '31/10/2026', '04/11/2026', '1 200,00', '0,00'],     // soldée en novembre : 1 200 encaissés
  ['FA-E2', '31/10/2026', '05/11/2026', '600,00', '200,00'],     // partiel : 400 encaissés, 200 restants, échus
  ['FA-E3', '30/11/2026', '', '900,00', '900,00'],               // non échue
  ['FA-E4', '15/10/2026', '20/10/2026', '300,00', '0,00']]).reglements; // réglée le mois précédent : hors mois
const pieces = [{ type: 'facture', no: 'FA-E2', code: 'C9' }, { type: 'facture', no: 'FA-E3', code: 'C1' }];
const clientsEbp = E.lireClientsEbp([['Code client', 'Nom', 'Statut du compte'], ['C9', 'GARAGE FICTIF BLOQUÉ', 'Bloqué'], ['C1', 'GARAGE FICTIF ACTIF', 'Actif']]).clients;

test('encaissé du mois, créances, échu et comptes bloqués : calculés depuis l’échéancier, en TTC', () => {
  const r = EN.calculer({ reglements, pieces, clientsEbp, arrete: '2026-11-10', aujourdhui: '2026-11-10' });
  assert.equal(r.ttc, true);
  assert.deepEqual([r.encaisseMois.statut, r.encaisseMois.cents], ['valide', 160000]);
  assert.deepEqual([r.creances.statut, r.creances.cents, r.creances.nb], ['valide', 110000, 2]);
  assert.deepEqual([r.echu.cents, r.echu.lignes.map(x => x.facture)], [20000, ['FA-E2']]);
  assert.deepEqual(r.bloques.liste, [{ code: 'C9', nom: 'GARAGE FICTIF BLOQUÉ', statut: 'Bloqué', creanceConnueCents: 20000 }]);
});

test('règlement daté sans montant : jamais compté comme encaissé ; indicateurs « douteux » avec motif', () => {
  const s = E.lireReglements([['N° facture', 'Échéance', 'Date de règlement', 'Montant TTC'], ['FA-X', '31/10/2026', '03/11/2026', '500,00'], ['FA-Y', '31/10/2026', '', '250,00']]).reglements;
  const r = EN.calculer({ reglements: s, arrete: '2026-11-10' });
  assert.deepEqual([r.encaisseMois.statut, r.encaisseMois.cents], ['douteux', 0]); assert.match(r.encaisseMois.motif, /FA-X/);
  assert.deepEqual([r.creances.statut, r.creances.cents, r.creances.aVerifier.nb, r.creances.aVerifier.maxCents], ['douteux', 25000, 1, 50000]);
});

test('sans échéancier ou sans date d’export : « absent » (null), jamais zéro', () => {
  for (const r of [EN.calculer({ arrete: '2026-11-10' }), EN.calculer({ reglements, arrete: '' })]) {
    for (const k of ['encaisseMois', 'creances', 'echu']) { assert.equal(r[k].statut, 'absent'); assert.equal(r[k].cents, null); }
  }
  assert.equal(EN.calculer({ reglements, arrete: '2026-11-10' }).bloques.statut, 'absent', 'fichier clients absent : bloqués non renseignés');
});
