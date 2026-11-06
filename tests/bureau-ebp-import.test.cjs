'use strict';
// Bureau ODICOLOR — lecture des exports EBP. Exécution : node --test tests/bureau-ebp-import.test.cjs
// Fichiers d'essai 100 % fictifs (tests/fixtures/bureau/ebp-*.csv), encodés en Windows-1252 avec « ; ».
// HYPOTHÈSE : noms de colonnes EBP réels non encore connus ; à confronter à un export réel anonymisé.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const E = require('../bureau/ebp-import.js');

const fixture = n => readFileSync(join(__dirname, 'fixtures', 'bureau', n));
const table = n => E.lireCsv(E.decoderTexte(fixture(n)).texte);

test('encodage : Windows-1252 détecté, accents conservés ; UTF-8 avec BOM accepté', () => {
  const d = E.decoderTexte(fixture('ebp-clients.csv'));
  assert.equal(d.encodage, 'Windows-1252');
  assert.match(d.texte, /Évry-Courcouronnes/);
  assert.match(d.texte, /Bloqué/);
  const u = E.decoderTexte(new TextEncoder().encode('﻿Code;Nom\nC1;Été'));
  assert.equal(u.encodage, 'UTF-8');
  assert.equal(u.texte, 'Code;Nom\nC1;Été');
});

test('CSV : séparateur détecté, guillemets, point-virgule et retour à la ligne dans une cellule', () => {
  assert.deepEqual(E.lireCsv('a;b\r\n"x;1";"dit ""oui"""\n\n'), [['a', 'b'], ['x;1', 'dit "oui"']]);
  assert.deepEqual(E.lireCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(E.lireCsv('a,b\n"l1\nl2",2'), [['a', 'b'], ['l1\nl2', '2']]);
});

test('dates : formats français et Excel, dates impossibles refusées', () => {
  assert.equal(E.lireDate('06/11/2026'), '2026-11-06');
  assert.equal(E.lireDate('6-11-26'), '2026-11-06');
  assert.equal(E.lireDate('2026-11-06T10:00'), '2026-11-06');
  assert.equal(E.lireDate('06.11.2026 14:32'), '2026-11-06');
  assert.equal(E.lireDate(46332), '2026-11-06'); // numéro de série Excel
  assert.equal(E.lireDate('31/02/2026'), '');
  assert.equal(E.lireDate('2026-13-01'), '');
  assert.equal(E.lireDate('demain'), '');
  assert.equal(E.lireDate(''), '');
});

test('montants : centimes exacts, formats français, négatifs, illisibles = null (jamais 0)', () => {
  assert.equal(E.lireMontant('1 234,56'), 123456);
  assert.equal(E.lireMontant('1 234,56 €'), 123456);
  assert.equal(E.lireMontant('1.234,56'), 123456);
  assert.equal(E.lireMontant('1234.5'), 123450);
  assert.equal(E.lireMontant('1,234.50'), 123450);
  assert.equal(E.lireMontant('-100,00'), -10000);
  assert.equal(E.lireMontant('(100,00)'), -10000);
  assert.equal(E.lireMontant(0.1 + 0.2), 30);
  assert.equal(E.lireMontant('abc'), null);
  assert.equal(E.lireMontant(''), null);
});

test('type de pièce : colonne type ou préfixe du numéro ; avoirs isolés', () => {
  assert.equal(E.lireType('Commande client', ''), 'commande');
  assert.equal(E.lireType('Bon de livraison', ''), 'bl');
  assert.equal(E.lireType('', 'FA-12'), 'facture');
  assert.equal(E.lireType('', 'DV-12'), 'devis');
  assert.equal(E.lireType('Avoir', 'FA-12'), 'avoir');
  assert.equal(E.lireType('', 'XYZ'), '');
});

test('pièces : lecture du fichier d’essai, correspondance des colonnes affichable', () => {
  const r = E.lirePieces(table('ebp-pieces.csv'));
  assert.equal(r.lues, 18);
  assert.equal(r.pieces.length, 15);
  assert.deepEqual(r.correspondance.map(c => c.cle), ['type', 'no', 'date', 'code', 'client', 'ht', 'origine', 'ref']);
  const cc = r.pieces.find(p => p.no === 'CC-2001');
  assert.equal(cc.htCents, 210000, 'export ligne par article : la pièce est totalisée');
  assert.equal(cc.lignesSource, 2);
  assert.deepEqual(r.pieces.find(p => p.no === 'BL-3001'), { type: 'bl', no: 'BL-3001', date: '2026-10-16', code: 'C001', client: 'GARAGE FICTIF ALPHA', htCents: 180000, origine: 'CC-2002', ref: '', source: 'ebp', lignesSource: 1 });
});

test('pièces : ligne écartée avec motif ; avoir gardé à part (pièce normale, jamais « écartée »)', () => {
  const r = E.lirePieces(table('ebp-pieces.csv'));
  assert.deepEqual(r.ignorees, [{ ligne: 19, motif: 'Date illisible pour CC-2006' }]);
  assert.deepEqual(r.avoirs, [{ ligne: 18, no: 'AV-5001', date: '2026-11-04', client: 'GARAGE FICTIF ALPHA', htCents: -10000, origine: 'FA-4001', code: 'C001' }]);
  assert.equal(r.liens, true, 'colonne « pièce d’origine » présente');
  assert.equal(E.lirePieces([['N° pièce', 'Date', 'Nom du client', 'Montant HT'], ['FA-1', '01/11/2026', 'A', '1,00']]).liens, false);
});

test('pièces : refus clair si une colonne obligatoire manque, avec les colonnes lues', () => {
  assert.throws(() => E.lirePieces([['N° pièce', 'Date', 'Client'], ['FA-1', '01/11/2026', 'X']]), /Montant HT.*Colonnes lues : N° pièce \| Date \| Client/);
  assert.throws(() => E.lirePieces([['N° pièce', 'Date', 'Client', 'Montant HT']]), /vide/);
});

test('pièces : même numéro avec des informations contradictoires = écarté, jamais fusionné', () => {
  const r = E.lirePieces([['N° pièce', 'Date', 'Nom du client', 'Montant HT'], ['FA-1', '01/11/2026', 'A', '10,00'], ['FA-1', '02/11/2026', 'B', '10,00']]);
  assert.equal(r.pieces.length, 1);
  assert.match(r.ignorees[0].motif, /en double avec des informations différentes/);
});

test('règlements : reste lu dans l’échéancier ; sans colonne « reste », déduit de la date de règlement', () => {
  const r = E.lireReglements(table('ebp-reglements.csv'));
  assert.deepEqual(r.reglements.map(x => [x.facture, x.echeance, x.reglement, x.montantCents, x.resteCents]), [
    ['FA-4001', '2026-11-16', '', 216000, 216000], ['FA-4002', '2026-10-31', '', 360000, 360000], ['FA-4003', '2026-12-03', '2026-11-05', 84000, 0]]);
  const s = E.lireReglements([['N° facture', 'Échéance', 'Date de règlement', 'Montant TTC'], ['F1', '01/11/2026', '', '120,00'], ['F2', '01/11/2026', '02/11/2026', '60,00']]);
  assert.deepEqual(s.reglements.map(x => x.resteCents), [12000, 0]);
  assert.equal(s.reglements[0].resteDeclare, false);
});

test('clients : compte bloqué repéré, code en double écarté', () => {
  const r = E.lireClientsEbp(table('ebp-clients.csv'));
  assert.equal(r.clients.length, 6);
  assert.deepEqual(r.clients.filter(c => c.bloque).map(c => c.code), ['C003']);
  const d = E.lireClientsEbp([['Code client', 'Nom'], ['C1', 'A'], ['C1', 'B']]);
  assert.equal(d.clients.length, 1);
  assert.match(d.ignorees[0].motif, /en double/);
});

test('aucune donnée réelle dans les fichiers d’essai', () => {
  for (const n of ['ebp-pieces.csv', 'ebp-reglements.csv', 'ebp-clients.csv']) {
    const t = E.decoderTexte(fixture(n)).texte;
    for (const nom of t.match(/GARAGE [A-Z ]+/g) || []) assert.match(nom, /^GARAGE FICTIF [A-Z]+ ?$/, n);
    assert.doesNotMatch(t, /@|\b0[1-9](\s?\d{2}){4}\b|\b\d{14}\b/, n + ' : ni e-mail, ni téléphone, ni SIRET');
  }
});

// Corrections du 08/11/2026 (guide d'extraction EBP) : confusions de colonnes et cases à cocher Oui / Non.
test('fichier clients : « Code postal » et « Compte comptable » ne sont jamais pris pour le code ou le statut', () => {
  const E = require('../bureau/ebp-import.js');
  const c = h => Object.fromEntries(E.associerColonnes('clients', h).correspondance.map(x => [x.cle, x.colonne]));
  assert.deepEqual(c(['Code postal', 'Code client', 'Nom', 'Compte comptable', 'Famille']), { code: 'Code client', nom: 'Nom', cp: 'Code postal', famille: 'Famille' });
  assert.equal(c(['Code', 'Nom', 'Code postal', 'Compte comptable', 'En sommeil']).statut, 'En sommeil');
});
test('fichier clients : colonnes « Bloqué » / « En sommeil » en Oui / Non comprises', () => {
  const E = require('../bureau/ebp-import.js');
  const b = E.lireClientsEbp([['Code', 'Nom', 'Bloqué'], ['C1', 'A', 'Oui'], ['C2', 'B', 'Non'], ['C3', 'C', '']]).clients;
  assert.deepEqual(b.map(x => x.bloque), [true, false, false]);
  assert.equal(E.lireClientsEbp([['Code', 'Nom', 'En sommeil'], ['C1', 'A', 'Oui']]).clients[0].statut, 'En sommeil');
});
