'use strict';
// Lot 5 : suivi commerce (Bureau). Parcours FICTIF : garage → besoin → demande → devis EBP → commande → facture → encaissement.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../demandes-v50.js'), C = require('../bureau/commerce.js'), E = require('../bureau/ebp-import.js'), CA = require('../bureau/ca-facture.js');
const M = '2026-11-02T09:00:00.000Z';

function parcours() {
  let d = D.nouvelle({ id: 1, nom: 'GARAGE FICTIF PARCOURS', codeEbp: 'C901' }, { uid: 'U-P', maintenant: M });
  d = { ...d, besoins: 'Vernis pour la cabine' }; d = D.ajouterLigne(d, { ref: 'CS-FICT-01', des: 'Vernis fictif', marque: 'Carsystem', qte: 4 });
  d = D.passer(d, 'a_traiter', { maintenant: M }); d = D.passer(d, 'traite_ebp', { maintenant: M, noDevisEbp: 'DE-F1' });
  d = D.passer(d, 'envoye', { maintenant: M }); d = D.passer(d, 'accepte', { maintenant: '2026-11-04T09:00:00.000Z' });
  const P = E.lirePieces([['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Montant HT', 'N° de pièce d’origine'],
    ['Devis', 'DE-F1', '02/11/2026', 'C901', 'GARAGE FICTIF PARCOURS', '1 000,00', ''],
    ['Commande', 'CC-F1', '05/11/2026', 'C901', 'GARAGE FICTIF PARCOURS', '1 000,00', 'DE-F1'],
    ['Bon de livraison', 'BL-F1', '06/11/2026', 'C901', 'GARAGE FICTIF PARCOURS', '1 000,00', 'CC-F1'],
    ['Facture', 'FA-F1', '07/11/2026', 'C901', 'GARAGE FICTIF PARCOURS', '1 000,00', 'BL-F1'],
    ['Avoir', 'AV-F1', '09/11/2026', 'C901', 'GARAGE FICTIF PARCOURS', '100,00', 'FA-F1']]);
  const R = E.lireReglements([['N° facture', 'Échéance', 'Date de règlement', 'Montant TTC', 'Reste à payer'], ['FA-F1', '07/12/2026', '10/11/2026', '1 200,00', '480,00']]);
  return { d, P, R };
}

test('parcours complet relié par identifiants : devis EBP → commande → facture (avoir déduit) → encaissement partiel', () => {
  const { d, P, R } = parcours();
  const [s] = C.suivre({ demandes: [d], pieces: P.pieces, avoirs: P.avoirs, reglements: R.reglements, liens: P.liens });
  assert.equal(s.devis.no, 'DE-F1'); assert.deepEqual(s.commandes.map(x => x.no), ['CC-F1']); assert.deepEqual(s.factures.map(x => x.no), ['FA-F1']);
  assert.equal(s.factureHtCents, 90000, 'facturé HT : 1 000 − avoir 100');
  assert.deepEqual([s.encaisseTtcCents, s.resteTtcCents, s.etape], [72000, 48000, 'facture']);
  assert.deepEqual(s.manques, []);
});

test('jamais de vente sans commande EBP : demande acceptée mais devis seul ⇒ étape « devis EBP », rien de facturé', () => {
  const { d, P } = parcours();
  const seulDevis = P.pieces.filter(p => p.type === 'devis');
  const [s] = C.suivre({ demandes: [d], pieces: seulDevis, liens: true });
  assert.equal(s.statutDemande, 'accepte'); assert.equal(s.etape, 'devis_ebp'); assert.equal(s.factureHtCents, null); assert.deepEqual(s.commandes, []);
});

test('données manquantes signalées, jamais devinées : sans n° EBP, sans export, devis introuvable, sans pièce d’origine, sans échéancier', () => {
  const { d, P } = parcours();
  const m = x => C.suivre(x)[0].manques.join(' | ');
  assert.match(m({ demandes: [{ ...d, noDevisEbp: '' }] }), /N° de devis EBP non saisi/);
  assert.match(m({ demandes: [d] }), /Export des pièces EBP non chargé/);
  assert.match(m({ demandes: [{ ...d, noDevisEbp: 'DE-INCONNU' }], pieces: P.pieces, liens: true }), /introuvable/);
  assert.match(m({ demandes: [d], pieces: P.pieces, liens: false }), /pièce d’origine/);
  assert.match(m({ demandes: [d], pieces: P.pieces, avoirs: P.avoirs, liens: true }), /Échéancier des règlements non chargé/);
  // Rapprochement par identifiant uniquement : même client, même montant, mais n° différent ⇒ non relié.
  assert.equal(C.suivre({ demandes: [{ ...d, noDevisEbp: 'DE-AUTRE' }], pieces: P.pieces, liens: true })[0].devis, null);
});

test('compte bloqué signalé ; tableau de bord : CA EBP, objectif non saisi = non renseigné, taux et relances', () => {
  const { d, P, R } = parcours();
  const suivi = C.suivre({ demandes: [d], pieces: P.pieces, avoirs: P.avoirs, reglements: R.reglements, liens: true, clientsEbp: [{ code: 'C901', bloque: true }] });
  assert.equal(suivi[0].compteBloque, true);
  const ca = CA.calculer({ pieces: P.pieces, avoirs: P.avoirs, arrete: '2026-11-10', aujourdhui: '2026-11-10' });
  const t0 = C.tableau({ suivi, demandes: [d], ca, liens: true, aujourdhui: '2026-11-10' });
  assert.equal(t0.caMois.cents, 90000); assert.equal(t0.objectif.cents, null); assert.match(t0.objectif.motif, /non saisi/); assert.equal(t0.ecart.cents, null);
  const t1 = C.tableau({ suivi, demandes: [d], ca, objectifCents: 2000000, liens: true, aujourdhui: '2026-11-10' });
  assert.equal(t1.ecart.cents, 1910000); assert.equal(t1.tauxTransformation.pct, 100); assert.equal(t1.tauxTransformation.base, 1);
  assert.equal(C.tableau({ demandes: [], aujourdhui: '2026-11-10' }).caMois.cents, null);
});

test('e-commerce : architecture désactivée — ni panier public, ni paiement, ni transmission de commande', () => {
  assert.deepEqual([C.ECOMMERCE.actif, C.ECOMMERCE.panierPublic, C.ECOMMERCE.paiement, C.ECOMMERCE.transmissionCommandes], [false, false, false, false]);
  assert.ok(Object.isFrozen(C.ECOMMERCE));
});

test('bout en bout des formats : demandes du téléphone dans la sauvegarde .odicolor → lues par le Bureau → reliées à EBP', async () => {
  const PH = require('../sauvegarde-locale.js'), LS = require('../bureau/lecture-sauvegarde.js');
  const { d, P, R } = parcours();
  const stores = { articles: [], clients: [{ id: 1, nom: 'GARAGE FICTIF PARCOURS', ville: 'Massy', cp: '91300', statutCrm: 'client' }], devis: [], meta: [['settings', {}], ['demandesDevis', [d]]] };
  const lu = await LS.lire((await PH.encode(stores)).file);
  assert.equal(lu.telephone.demandes.length, 1); assert.equal(lu.telephone.demandes[0].noDevisEbp, 'DE-F1');
  const [s] = C.suivre({ demandes: lu.telephone.demandes, pieces: P.pieces, avoirs: P.avoirs, reglements: R.reglements, liens: P.liens });
  assert.deepEqual([s.etape, s.factureHtCents, s.encaisseTtcCents], ['facture', 90000, 72000]);
  const ancien = await LS.lire((await PH.encode({ ...stores, meta: [['settings', {}]] })).file);
  assert.deepEqual(ancien.telephone.demandes, [], 'sauvegarde sans demandes (ancienne) : liste vide, compatible');
});
