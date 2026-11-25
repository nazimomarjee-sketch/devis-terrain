'use strict';
// Lot 5 : demandes de devis (logique). Garages et articles FICTIFS. node --test tests/demandes-telephone.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../demandes-v50.js');
const M = '2026-11-14T09:00:00.000Z', G = { id: 7, nom: 'GARAGE FICTIF DEVIS', codeEbp: 'C900' };

test('parcours complet : brouillon → à traiter → traité dans EBP (n° obligatoire) → envoyé → accepté, historique conservé', () => {
  let d = D.nouvelle(G, { uid: 'U1', maintenant: M });
  d = D.ajouterLigne(d, { ref: 'CS-FICT-01', des: 'Vernis fictif', marque: 'Carsystem', qte: 2 });
  d = D.ajouterLigne(d, { ref: 'CS-FICT-01', des: 'Vernis fictif', marque: 'Carsystem', qte: 3 });
  assert.deepEqual(d.lignes.map(l => [l.ref, l.qte]), [['CS-FICT-01', 5]], 'même référence : quantités cumulées');
  d = D.passer(d, 'a_traiter', { maintenant: M });
  assert.throws(() => D.ajouterLigne(d, { ref: 'X', qte: 1 }), /déjà transmise/);
  assert.throws(() => D.passer(d, 'traite_ebp', { maintenant: M }), /Numéro du devis EBP obligatoire/);
  d = D.passer(d, 'traite_ebp', { maintenant: M, noDevisEbp: 'DE-FICT-12' }); assert.equal(d.noDevisEbp, 'DE-FICT-12');
  d = D.passer(d, 'envoye', { maintenant: M }); d = D.passer(d, 'accepte', { maintenant: M });
  assert.deepEqual(d.historique.map(h => h.etape), ['brouillon', 'a_traiter', 'traite_ebp', 'envoye', 'accepte']);
  assert.throws(() => D.passer(d, 'brouillon', { maintenant: M }), /Étape impossible/);
});

test('aucune étape sautée ; compte bloqué ou demande vide : refus avec motif', () => {
  const d = D.nouvelle(G, { uid: 'U2', maintenant: M });
  assert.throws(() => D.passer(d, 'envoye', { maintenant: M }), /Étape impossible/);
  assert.throws(() => D.passer(d, 'a_traiter', { maintenant: M }), /au moins un produit/);
  const d2 = { ...d, besoins: 'Apprêt pour 3 véhicules' };
  assert.throws(() => D.passer(d2, 'a_traiter', { maintenant: M, compteBloque: true }), /Compte client bloqué/);
  assert.equal(D.passer(d2, 'a_traiter', { maintenant: M }).statut, 'a_traiter');
});

test('Roberlo refusée ; quantité contrôlée ; jamais de prix dans une demande', () => {
  const d = D.nouvelle(G, { uid: 'U3', maintenant: M });
  assert.throws(() => D.ajouterLigne(d, { ref: 'R1', marque: 'Roberlo', qte: 1 }), /plus une gamme active/);
  assert.throws(() => D.ajouterLigne(d, { ref: 'R1', qte: 0 }), /Quantité/);
  const e = D.ajouterLigne(d, { ref: 'S1', des: 'Mastic fictif', marque: 'Sifa', qte: 1, prix: 9999 });
  assert.equal('prix' in e.lignes[0], false);
});

test('récapitulatif pour Mohamed : jamais présenté comme un devis, prix renvoyés à EBP', () => {
  let d = D.nouvelle(G, { uid: 'U4', maintenant: M }); d = { ...d, besoins: 'Remplacer le vernis actuel' };
  d = D.ajouterLigne(d, { ref: 'CS-FICT-01', des: 'Vernis fictif', marque: 'Carsystem', conditionnement: '5 L', qte: 2 });
  const r = D.recapitulatif(d, { commercial: 'Commercial fictif' });
  assert.match(r, /^DEMANDE DE DEVIS — à établir dans EBP \(ce message n’est pas un devis\)/);
  assert.match(r, /code EBP C900/); assert.match(r, /1\. CS-FICT-01 — Vernis fictif \[Carsystem\] · 5 L × 2/); assert.match(r, /selon EBP/);
  assert.doesNotMatch(r, /€/);
});

test('indicateurs : à traiter, en attente, taux de transformation, relances ; recherche catalogue sans Roberlo', () => {
  const mk = (uid, etapes, le = '2026-11-01T09:00:00Z') => ({ uid, clientId: 1, clientNom: 'G' + uid, statut: etapes[etapes.length - 1], historique: etapes.map(e => ({ le, etape: e })) });
  const l = [mk('a', ['brouillon', 'a_traiter']), mk('b', ['brouillon', 'a_traiter', 'traite_ebp', 'envoye']), mk('c', ['brouillon', 'a_traiter', 'traite_ebp', 'envoye', 'accepte']),
    mk('d', ['brouillon', 'a_traiter', 'traite_ebp', 'envoye', 'refuse']), mk('e', ['brouillon', 'a_traiter', 'traite_ebp', 'envoye', 'accepte'])];
  const i = D.indicateurs(l, { aujourdhui: '2026-11-14' });
  assert.deepEqual([i.aTraiter, i.enAttenteReponse, i.tauxTransformation], [1, 1, 67]);
  assert.deepEqual(i.aRelancer.map(x => x.uid), ['b']);
  assert.equal(D.indicateurs([], { aujourdhui: '2026-11-14' }).tauxTransformation, null, 'aucune décision : non calculable, jamais 0 %');
  const arts = [{ code: 'CS-1', des: 'Vernis HS', marque: 'Carsystem' }, { code: 'RB-1', des: 'Vernis ancien', marque: 'Roberlo' }, { code: 'SF-1', des: 'Mastic', marque: 'Sifa' }];
  assert.deepEqual(D.chercher(arts, 'vernis').map(a => a.code), ['CS-1']);
  assert.deepEqual(D.chercher(arts, '', { marque: 'Sifa' }).map(a => a.code), ['SF-1']);
});
