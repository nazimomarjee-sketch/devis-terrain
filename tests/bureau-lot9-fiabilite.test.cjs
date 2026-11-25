'use strict';
// Lot 9 : fiabilité des chiffres et contrôle des données. Données FICTIVES. node --test tests/bureau-lot9-fiabilite.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../bureau/ebp-import.js'), CA = require('../bureau/ca-facture.js'), P = require('../bureau/performance.js'), A = require('../bureau/assistant-import.js');
const EN = require('../bureau/encaissements.js'), C = require('../bureau/commerce.js'), D = require('../demandes-v50.js'), PL = require('../bureau/pipeline.js');
const ENT = ['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Montant HT', 'N° de pièce d’origine'];

test('code client manquant : le CA global reste calculé (jamais nul), le montant est « non attribué » ; fiabilité « à vérifier »', () => {
  const p = E.lirePieces([ENT, ['Facture', 'FA-1', '03/11/2026', 'C1', 'G1', '1 000,00', ''], ['Facture', 'FA-2', '04/11/2026', '', 'SANS CODE', '400,00', '']]);
  const r = CA.calculer({ pieces: p.pieces, avoirs: p.avoirs, arrete: '2026-11-14', aujourdhui: '2026-11-14' });
  assert.equal(r.statut, 'renseigne'); assert.equal(r.totalCents, 140000); assert.equal(r.nonAttribue.cents, 140000, 'sans modèle Ma Ville : tout est hors communes, mais compté');
  assert.equal(r.controle.ok, true);
  const f = P.fiabiliteCA(r, [{ du: '2026-11-01', au: '2026-11-14' }], '2026-11-14');
  assert.equal(f.niveau, 'a_verifier'); assert.match(f.raisons.join(), /non attribuée.*comptées dans le total/);
  assert.equal(P.objectif({ ca: r, aujourdhui: '2026-11-14', joursOuvres: PL.joursOuvres }).faitCents, 140000);
});

test('date de l’export respectée : facture postérieure exclue ; export du mois précédent ⇒ CA « manquant » avec la raison', () => {
  const p = E.lirePieces([ENT, ['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '100,00', ''], ['Facture', 'FA-2', '20/11/2026', 'C1', 'G', '900,00', '']]);
  assert.equal(CA.calculer({ pieces: p.pieces, avoirs: [], arrete: '2026-11-14', aujourdhui: '2026-11-14' }).totalCents, 10000);
  const vieux = CA.calculer({ pieces: p.pieces, avoirs: [], arrete: '2026-10-31', aujourdhui: '2026-11-14' });
  const f = P.fiabiliteCA(vieux, [], '2026-10-31'); assert.equal(f.niveau, 'manquant'); assert.match(f.raisons[0], /antérieur au mois en cours/);
});

test('périodes déclarées : fiable seulement si elles couvrent du 1er du mois à la date d’export', () => {
  const p = E.lirePieces([ENT, ['Facture', 'FA-1', '06/11/2026', 'C1', 'G', '100,00', '']]);
  // Client EBP rattaché à une commune (modèle Ma Ville) : aucune part non attribuée.
  const clients = E.lireClientsEbp([['Code client', 'Nom', 'Ville', 'Code postal'], ['C1', 'G', 'Massy', '91300']]).clients;
  const modele = require('../bureau/ville/modele-commune.js').construire({ clientsEbp: clients, piecesEbp: p.pieces, arrete: '2026-11-14' });
  const r = CA.calculer({ pieces: p.pieces, avoirs: [], arrete: '2026-11-14', aujourdhui: '2026-11-14', modele });
  assert.equal(r.nonAttribue.cents, 0);
  assert.equal(P.fiabiliteCA(r, [{ du: '2025-11-01', au: '2026-11-14' }], '2026-11-14').niveau, 'fiable');
  assert.match(P.fiabiliteCA(r, [{ du: '2026-11-05', au: '2026-11-14' }], '2026-11-14').raisons.join(), /ne couvre pas tout le mois/);
  assert.match(P.fiabiliteCA(r, [], '2026-11-14').raisons.join(), /Aucune période/);
});

test('plus de la moitié des lignes rejetées : confirmation explicite exigée ; exactement la moitié : simple avertissement', () => {
  const plus = E.lirePieces([ENT, ['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '1,00', ''], ['Facture', 'FA-2', 'x', 'C1', 'G', '1,00', ''], ['Facture', 'FA-3', 'y', 'C1', 'G', '1,00', '']]);
  const a = A.apercu({ type: 'pieces', r: plus, existant: {} });
  assert.equal(a.confirmationRequise, true); assert.equal(a.validable, true); assert.match(a.anomalies.find(x => x.gravite === 'confirmation').texte, /2 sur 3/);
  const moitie = E.lirePieces([ENT, ['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '1,00', ''], ['Facture', 'FA-2', 'x', 'C1', 'G', '1,00', '']]);
  assert.equal(A.apercu({ type: 'pieces', r: moitie, existant: {} }).confirmationRequise, false);
});

test('CA HT et règlements TTC jamais confondus : parcours EBP → Commerce → Pilotage', () => {
  let d = D.nouvelle({ id: 1, nom: 'GARAGE FICTIF HT', codeEbp: 'C1' }, { uid: 'U', maintenant: '2026-11-02T08:00:00Z' }); d = D.ajouterLigne(d, { ref: 'X', des: 'Vernis fictif', marque: 'Carsystem', qte: 1 });
  for (const [v, o] of [['a_traiter', {}], ['traite_ebp', { noDevisEbp: 'DE-1' }], ['envoye', {}], ['accepte', {}]]) d = D.passer(d, v, { maintenant: '2026-11-02T09:00:00Z', ...o });
  const p = E.lirePieces([ENT, ['Devis', 'DE-1', '02/11/2026', 'C1', 'G', '1 000,00', ''], ['Commande', 'CC-1', '03/11/2026', 'C1', 'G', '1 000,00', 'DE-1'], ['Facture', 'FA-1', '05/11/2026', 'C1', 'G', '1 000,00', 'CC-1']]);
  const R = E.lireReglements([['N° facture', 'Échéance', 'Date de règlement', 'Montant TTC', 'Reste à payer'], ['FA-1', '05/12/2026', '10/11/2026', '1 200,00', '0,00']]).reglements;
  const ca = CA.calculer({ pieces: p.pieces, avoirs: p.avoirs, arrete: '2026-11-14', aujourdhui: '2026-11-14' });
  const [s] = C.suivre({ demandes: [d], pieces: p.pieces, avoirs: p.avoirs, reglements: R, liens: p.liens });
  const enc = EN.calculer({ reglements: R, pieces: p.pieces, arrete: '2026-11-14', aujourdhui: '2026-11-14' });
  const O = P.objectif({ ca, objectifCents: 2000000, aujourdhui: '2026-11-14', joursOuvres: PL.joursOuvres });
  assert.deepEqual([ca.totalCents, s.factureHtCents, O.faitCents], [100000, 100000, 100000], 'HT partout pour le facturé');
  assert.deepEqual([s.encaisseTtcCents, enc.encaisseMois.cents, enc.ttc], [120000, 120000, true], 'TTC pour l’encaissé');
  assert.equal(O.resteCents, 1900000, 'le reste à réaliser est calculé sur le HT, jamais sur l’encaissé TTC');
});

test('écran de contrôle : fiable / à vérifier / manquant avec raisons', () => {
  const vide = A.controle({ E: { erreur: {} } });
  assert.equal(vide.resume.fiable, 0); assert.ok(vide.lignes.every(l => l.niveau === 'manquant'));
  const p = Object.assign(E.lirePieces([ENT, ['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '1,00', '']]), { fichier: 'p.csv' });
  p.consolidation = P.consolider([Object.assign(p, { provenance: { fichier: 'p.csv', empreinte: 'e', periode: { du: '2025-11-01', au: '2026-11-14' } } })]);
  const ca = CA.calculer({ pieces: p.pieces, avoirs: [], arrete: '2026-11-14', aujourdhui: '2026-11-14' });
  const r = A.controle({ E: { erreur: {}, arrete: '2026-11-14', arreteConfirmee: true, pieces: p }, objectifCents: 2000000, fiabiliteCA: P.fiabiliteCA(ca, p.consolidation.periodes, '2026-11-14') });
  const niv = Object.fromEntries(r.lignes.map(l => [l.domaine, l.niveau]));
  assert.equal(niv['Date de l’export EBP'], 'fiable'); assert.equal(niv['Périodes d’export déclarées'], 'fiable'); assert.equal(niv['Objectif mensuel'], 'fiable');
  assert.equal(niv['Pièces de vente'], 'a_verifier', 'colonne « pièce d’origine » vide mais présente ; référence absente : signalé');
  assert.equal(niv['Fichier clients'], 'manquant'); assert.equal(niv['Sauvegarde du téléphone'], 'manquant');
});
