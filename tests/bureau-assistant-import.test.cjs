'use strict';
// Lot 7 : assistant d'import EBP (bilans). Fichiers FICTIFS. node --test tests/bureau-assistant-import.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../bureau/assistant-import.js'), E = require('../bureau/ebp-import.js'), P = require('../bureau/performance.js');

test('pièces sans « pièce d’origine » ni code client : conséquences expliquées ; lignes écartées regroupées par raison', () => {
  const r = E.lirePieces([['Type', 'N° pièce', 'Date', 'Client', 'Montant HT'], ['Facture', 'FA-1', '03/11/2026', 'G', '100,00'], ['Facture', 'FA-2', '03/11/2026', 'G', '1.234'], ['Facture', 'FA-3', 'hier', 'G', '5,00']]);
  const b = A.bilanFichier('pieces', r);
  assert.deepEqual([b.lues, b.retenues, b.ecartees], [3, 1, 2]);
  assert.deepEqual(b.absentes.map(x => x.cle).sort(), ['code', 'origine', 'ref']);
  assert.match(b.absentes.find(x => x.cle === 'origine').consequence, /impossible de relier devis → commande → facture/);
  assert.deepEqual(b.motifs.map(m => m.motif).sort(), ['Date illisible', 'Montant HT ambigu']);
  assert.equal(b.niveau, 'erreur', 'plus de la moitié des lignes écartées');
});

test('corrections détectées : fichier rechargé, pièce modifiée, pièce hors période, export sans période', () => {
  const mk = (l, emp, f, periode) => Object.assign(E.lirePieces([['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Montant HT'], ...l]), { fichier: f, provenance: { fichier: f, empreinte: emp, periode } });
  const a = mk([['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '100,00']], 'e1', 'a.csv', { du: '2026-11-01', au: '2026-11-14' });
  const b = mk([['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '120,00'], ['Facture', 'FA-9', '01/09/2026', 'C1', 'G', '10,00']], 'e2', 'b.csv', { du: '2026-11-01', au: '2026-11-14' });
  const c = mk([['Facture', 'FA-5', '04/11/2026', 'C1', 'G', '10,00']], 'e3', 'c.csv', null);
  const C = P.consolider([a, a, b, c]);
  const t = A.bilanFichier('pieces', b, C).corrections.join(' | ');
  assert.match(t, /Fichier déjà chargé, ignoré : a\.csv/); assert.match(t, /1 pièce\(s\) modifiée\(s\).*FA-1/); assert.match(t, /hors de la période déclarée : FA-9 \(2026-09-01\)/); assert.match(t, /1 export\(s\) de pièces sans période déclarée/);
});

test('clients : SIRET invalide signalé comme correction ; échéancier sans reste : conséquence ; données absentes du Bureau', () => {
  const c = E.lireClientsEbp([['Code client', 'Nom', 'SIRET'], ['C1', 'G', '99999999900018']]);
  const b = A.bilanFichier('clients', c);
  assert.match(b.corrections.join(), /SIRET invalide/); assert.ok(b.absentes.some(x => x.cle === 'statut' && /comptes bloqués/.test(x.consequence)));
  const r = E.lireReglements([['N° facture', 'Échéance', 'Date de règlement', 'Montant TTC'], ['FA-1', '01/11/2026', '', '10,00']]);
  assert.match(A.bilanFichier('reglements', r).absentes.find(x => x.cle === 'reste').consequence, /jamais considéré comme soldé/);
  assert.equal(A.bilanFichier('reglements', null).charge, false);
  const d = A.donneesAbsentes({ arreteConfirmee: false, clients: null, pieces: { consolidation: { periodes: [] } }, reglements: null });
  assert.equal(d.length, 4); assert.match(d.join(), /Aucune période d’export déclarée/);
  assert.deepEqual(A.ETAPES.map(e => e.id), ['arrete', 'clients', 'pieces', 'reglements', 'bilan']);
});
