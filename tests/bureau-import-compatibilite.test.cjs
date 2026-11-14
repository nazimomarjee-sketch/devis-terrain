'use strict';
// Lot 8 : compatibilité des exports et aperçu avant import. Exports FICTIFS (noms de colonnes inventés pour les tests,
// pas ceux d'EBP qui restent à confirmer). node --test tests/bureau-import-compatibilite.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../bureau/ebp-import.js'), A = require('../bureau/assistant-import.js');

const utf16le = s => Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(s, 'utf16le')]);
test('encodages : UTF-8, Windows-1252 (accents), UTF-16 « Texte Unicode » ; séparateurs ; et tabulation', () => {
  const csv = 'N° pièce\tDate\tClient\tMontant HT\tType\nFA-1\t05/11/2026\tGarage Éléphant\t1 234,50\tFacture\n';
  const d = E.decoderTexte(utf16le(csv)); assert.equal(d.encodage, 'UTF-16');
  const p = E.lirePieces(E.lireCsv(d.texte)); assert.deepEqual(p.pieces.map(x => [x.no, x.client, x.htCents]), [['FA-1', 'Garage Éléphant', 123450]]);
  assert.equal(E.decoderTexte(Buffer.from('Nom;Ville\nÉtienne;Évry\n', 'latin1')).encodage, 'Windows-1252');
  assert.equal(E.decoderTexte(Buffer.from('﻿Nom;Ville\n', 'utf8')).encodage, 'UTF-8');
  assert.deepEqual(E.lireCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('lignes de titre d’un état au-dessus des en-têtes : ignorées, numéros de ligne exacts', () => {
  const l = [['ÉTAT DES VENTES (fictif)'], ['Période : novembre 2026'], [], ['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Montant HT'], ['Facture', 'FA-1', '05/11/2026', 'C1', 'G', '10,00'], ['Facture', 'FA-2', 'xx', 'C1', 'G', '10,00']];
  assert.equal(E.trouverEntete('pieces', l), 3);
  const p = E.lirePieces(l); assert.deepEqual(p.pieces.map(x => x.no), ['FA-1']); assert.equal(p.ignorees[0].ligne, 6, 'ligne 6 du fichier');
});

test('colonnes inconnues : association manuelle par NOM de colonne, obligatoire manquante signalée, choix réutilisable', () => {
  const l = [['Pièce', 'Jour', 'Raison', 'Valeur nette', 'Genre'], ['FA-9', '07/11/2026', 'G', '99,00', 'Facture']];
  const a0 = E.analyser('pieces', l);
  assert.ok(a0.manquantes.length >= 2, 'noms inhabituels : non devinés'); assert.throws(() => E.lirePieces(l), /obligatoire/);
  const carte = { no: 'Pièce', date: 'Jour', client: 'Raison', ht: 'Valeur nette', type: 'Genre' };
  const a = E.analyser('pieces', l, { carte }); assert.deepEqual(a.manquantes, []); assert.equal(a.manuel, true);
  const p = E.lirePieces(l, { carte }); assert.deepEqual(p.pieces.map(x => [x.no, x.date, x.htCents, x.type]), [['FA-9', '2026-11-07', 9900, 'facture']]);
  assert.throws(() => E.analyser('pieces', l, { carte: { no: 'Colonne inexistante' } }), /absente de ce fichier/);
  const m = A.memoriserCorrespondance([], a); assert.equal(A.correspondancePour(m, E.analyser('pieces', [l[0]]).signature).carte.ht, 'Valeur nette');
  assert.equal(A.correspondancePour(m, E.analyser('pieces', [['Autre', 'En-tête']]).signature), null, 'autre format : pas réutilisé');
  assert.equal(A.memoriserCorrespondance(m, a).length, 1, 'même format : remplacé, pas dupliqué');
});

test('Excel : dates en numéro de série et montants numériques acceptés', () => {
  const p = E.lirePieces([['Type', 'N° pièce', 'Date', 'Client', 'Montant HT'], ['Facture', 'FA-X', 46331, 'G', 1234.5]]);
  assert.deepEqual(p.pieces.map(x => [x.date, x.htCents]), [['2026-11-05', 123450]]);
});

test('aperçu : nouvelles, identiques, modifiées, clients non rapprochés, dates incohérentes, période absente — en français simple', () => {
  const existant = E.lirePieces([['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Montant HT'], ['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '100,00'], ['Facture', 'FA-2', '04/11/2026', 'C1', 'G', '50,00']]);
  const r = E.lirePieces([['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Montant HT'], ['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '100,00'], ['Facture', 'FA-2', '04/11/2026', 'C1', 'G', '60,00'],
    ['Facture', 'FA-3', '20/11/2026', 'C9', 'G9', '10,00'], ['Facture', 'FA-4', 'n/a', 'C1', 'G', '1,00']]);
  const ap = A.apercu({ type: 'pieces', r, existant: { pieces: existant.pieces, avoirs: [], empreintes: [] }, clientsEbp: [{ code: 'C1' }], arrete: '2026-11-14', periode: null });
  assert.deepEqual(ap.compte, { lues: 4, reconnues: 3, rejetees: 1, nouvelles: 1, identiques: 1, modifiees: 1 });
  const t = ap.anomalies.map(a => a.gravite + ':' + a.texte).join('\n');
  assert.match(t, /attention:1 ligne\(s\) seront ignorées : Date illisible/);
  assert.match(t, /1 pièce\(s\) déjà connue\(s\) mais modifiée\(s\).*FA-2/);
  assert.match(t, /code\(s\) client absents du fichier clients.*C9/);
  assert.match(t, /datée\(s\) après la date de l’export.*FA-3/);
  assert.match(t, /Période d’export non indiquée/);
  assert.match(t, /n° de pièce d’origine/);
  assert.equal(ap.validable, true, 'des avertissements, rien de bloquant');
});

test('aperçu : rien de lisible ⇒ bloquant ; fichier déjà importé ⇒ rien ne changera ; échéance de facture inconnue', () => {
  const r = E.lirePieces([['Type', 'N° pièce', 'Date', 'Client', 'Montant HT'], ['Facture', 'FA-1', 'x', 'G', '1,00']]);
  assert.equal(A.apercu({ type: 'pieces', r, existant: {} }).validable, false);
  const ok = E.lirePieces([['Type', 'N° pièce', 'Date', 'Client', 'Montant HT'], ['Facture', 'FA-1', '01/11/2026', 'G', '1,00']]);
  assert.match(A.apercu({ type: 'pieces', r: ok, empreinte: 'e1', existant: { empreintes: ['e1'] } }).anomalies.map(a => a.texte).join(), /déjà été importé : rien ne changera/);
  const rg = E.lireReglements([['N° facture', 'Échéance', 'Date de règlement', 'Montant TTC'], ['FA-Z', '01/12/2026', '02/11/2026', '10,00']]);
  const t = A.apercu({ type: 'reglements', r: rg, existant: { pieces: ok.pieces } }).anomalies.map(a => a.texte).join(' | ');
  assert.match(t, /sans montant ni reste.*jamais soldés/); assert.match(t, /factures absentes des pièces chargées : FA-Z/);
});
