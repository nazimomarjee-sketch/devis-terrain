'use strict';
// Offres de conquête — chiffrage, validation par la direction, réachats J30/J60/J90, rentabilité. Données 100 % fictives.
// Exécution : node --test tests/socle-offres-conquete.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const OC = require('../socle/offres-conquete.js'), M = require('../socle/modele.js'), Pil = require('../socle/pilotage.js');
const { Serveur, Appareil } = require('../socle/synchro.js');

const NAZIM = { uid: 'u-developpement', nom: 'Responsable du développement (fictif)', role: 'developpement', actif: true };
const FAIZAL = { uid: 'u-direction', nom: 'Direction (fictif)', role: 'direction', actif: true };
const offre = (o = {}) => Object.assign({ uid: 'oc-00000001', garageUid: 'g-prospect-01', titre: 'Offre de conquête GARAGE FICTIF', statut: 'proposee', proposeePar: NAZIM.uid,
  lignes: [
    { produit: 'Apprêt (carton)', quantite: 6, prixTarifCents: 9000, prixOffreCents: 8000, coutAchatCents: 5500, paliers: [{ aPartirDe: 6, prixCents: 7500 }, { aPartirDe: 12, prixCents: 7000 }] },
    { produit: 'Durcisseur', quantite: 4, prixTarifCents: 4000, prixOffreCents: 3600, coutAchatCents: 2400 },
    { produit: 'Vernis', quantite: 2, prixTarifCents: 12000, prixOffreCents: 10500, coutAchatCents: 7000 }],
  cadeaux: [{ libelle: 'Pistolet de peinture', coutReelCents: 18000, remis: false }],
  engagement: 'Réassort mensuel pendant 3 mois (fictif)', engagementCents: 150000, debut: '2026-06-01', fin: '2026-08-30' }, o);
const cmd = (no, date, ht, marge) => ({ type: 'commande', no, date, htCents: ht, ...(marge == null ? {} : { margeCents: marge }), garageUid: 'g-prospect-01' });
const HISTO = [cmd('CC-1', '2026-06-02', 80400, 23800), cmd('CC-2', '2026-06-25', 30000, 9000), cmd('CC-3', '2026-07-20', 30000, 9000), cmd('CC-4', '2026-08-25', 30000, 9000)];

test('modèle : une Offre de conquête valide est acceptée, une ligne incohérente refusée', () => {
  assert.deepEqual(M.valider('offreConquete', offre()), []);
  assert.deepEqual(M.valider('offreConquete', offre({ lignes: [{ produit: 'Vernis', quantite: 0, prixTarifCents: 1, prixOffreCents: 1, coutAchatCents: null }] })), ['Valeur invalide : lignes']);
  assert.deepEqual(M.valider('offreConquete', offre({ cadeaux: [{ libelle: 'Pistolet', coutReelCents: 10.5, remis: false }] })), ['Valeur invalide : cadeaux']);
});

test('chiffrage : prix dégressif appliqué, remises, coût réel des cadeaux, marge et coût d’acquisition', () => {
  const c = OC.chiffrer(offre());
  assert.deepEqual(c.lignes.map(l => [l.produit, l.prixAppliqueCents, l.caCents, l.remiseCents]), [['Apprêt (carton)', 7500, 45000, 9000], ['Durcisseur', 3600, 14400, 1600], ['Vernis', 10500, 21000, 3000]]);
  assert.deepEqual([c.tarifCents, c.caCents, c.remiseCents, c.coutMarchandiseCents, c.coutCadeauxCents, c.margeCents, c.tauxMarge, c.coutAcquisitionCents],
    [94000, 80400, 13600, 56600, 18000, 5800, 0.072, 31600]);
  assert.equal(c.validationDirection, true);
  assert.deepEqual(c.alertes, ['Taux de marge prévu 7 % (seuil 15 %).'], 'marge volontairement réduite : signalée à la direction');
});

test('chiffrage : coût d’achat ou de cadeau inconnu → marge « non calculable », jamais estimée', () => {
  const c = OC.chiffrer(offre({ lignes: [{ produit: 'Vernis', quantite: 2, prixTarifCents: 12000, prixOffreCents: 10500, coutAchatCents: null }], cadeaux: [{ libelle: 'Pistolet', coutReelCents: null, remis: false }] }));
  assert.deepEqual([c.caCents, c.margeCents, c.tauxMarge, c.coutAcquisitionCents], [21000, null, null, null]);
  assert.match(c.alertes[0], /non calculable/);
});

test('suivi : réachats à 30, 60 et 90 jours, CA et marge cumulés, seuil de rentabilité → conquête réussie', () => {
  const s = OC.suivre(offre({ statut: 'en_cours' }), HISTO, '2026-09-15');
  assert.equal(s.commandeInitiale, 'CC-1');
  assert.deepEqual([s.reachats.j30.commandes, s.reachats.j60.commandes, s.reachats.j90.commandes], [1, 2, 3]);
  assert.deepEqual(s.reachats.j90.pieces, ['CC-2', 'CC-3', 'CC-4']);
  assert.deepEqual([s.caCumuleCents, s.margeCumuleeCents, s.margeNetteCents, s.coutAcquisitionCents, s.seuilRentabilite], [170400, 50800, 32800, 31600, '2026-06-02']);
  assert.deepEqual(s.engagement, { attenduCents: 150000, realiseCents: 170400, taux: 114 });
  assert.deepEqual([s.verdict, s.libelleVerdict], ['reussie', 'Conquête réussie']);
});

test('suivi : distinguer une conquête réussie d’une opération déficitaire', () => {
  const deficit = OC.suivre(offre({ statut: 'terminee' }), [cmd('CC-1', '2026-06-02', 40000, 10000)], '2026-09-15');
  assert.deepEqual([deficit.margeNetteCents, deficit.reachats.j90.commandes, deficit.verdict], [-8000, 0, 'deficitaire']);
  const surveiller = OC.suivre(offre({ statut: 'terminee' }), [cmd('CC-1', '2026-06-02', 80400, 23800)], '2026-09-15');
  assert.equal(surveiller.verdict, 'a_surveiller', 'rentable mais aucun réachat');
  assert.equal(OC.suivre(offre({ statut: 'en_cours' }), HISTO.slice(0, 2), '2026-07-01').verdict, 'en_cours', 'avant J90 : mesure en cours');
  assert.equal(OC.suivre(offre({ statut: 'en_cours' }), [], '2026-07-01').verdict, 'sans_commande');
  const sansMarge = OC.suivre(offre({ statut: 'en_cours' }), HISTO.map(p => ({ ...p, margeCents: undefined })), '2026-09-15');
  assert.deepEqual([sansMarge.verdict, sansMarge.caCumuleCents, sansMarge.reachats.j90.commandes, sansMarge.margeCumuleeCents], ['non_calculable', 170400, 3, null], 'CA et réachats mesurés, marge jamais devinée');
});

test('tableau du cockpit : offres à valider, en cours, bilan réussies / déficitaires', () => {
  const t = OC.tableau([offre({ statut: 'en_cours' }), offre({ uid: 'oc-00000002', garageUid: 'g-prospect-02', statut: 'proposee', debut: null }),
    offre({ uid: 'oc-00000003', garageUid: 'g-prospect-03', statut: 'terminee' })],
    [...HISTO, { ...cmd('CC-9', '2026-06-03', 40000, 10000), garageUid: 'g-prospect-03' }], '2026-09-15');
  assert.deepEqual([t.aValider.length, t.enCours.length, t.bilan.reussies, t.bilan.deficitaires], [1, 1, 1, 1]);
  assert.deepEqual([t.bilan.coutAcquisitionTotalCents, t.bilan.margeNetteTotaleCents], [63200, 24800]);
});

test('validation par la direction de bout en bout ; conditions figées après validation ; historique conservé', () => {
  let n = 0; const id = () => 'op-' + String(++n).padStart(6, '0');
  const s = new Serveur({ genId: id, horloge: () => '2026-06-01T08:00:00.000Z' }); s.initialiser([NAZIM, FAIZAL]);
  const tel = new Appareil({ nom: 'téléphone', jeton: s.enregistrerAppareil(NAZIM.uid, 'téléphone'), auteur: NAZIM.uid, genId: id });
  const dir = new Appareil({ nom: 'direction', jeton: s.enregistrerAppareil(FAIZAL.uid, 'direction'), auteur: FAIZAL.uid, genId: id });
  const o = offre({ statut: 'brouillon', debut: null, fin: null }); delete o.debut; delete o.fin;
  tel.creer('offreConquete', o); tel.modifier('offreConquete', o.uid, { statut: 'proposee' }); tel.synchroniser(s);
  tel.modifier('offreConquete', o.uid, { statut: 'en_cours', debut: '2026-06-01' });
  assert.equal(tel.synchroniser(s).refusees, 1, 'pas de démarrage sans validation');
  tel.modifier('offreConquete', o.uid, { statut: 'validee', valideePar: NAZIM.uid });
  assert.equal(tel.synchroniser(s).refusees, 1, 'le développement ne valide pas');
  dir.synchroniser(s);
  dir.modifier('offreConquete', o.uid, { lignes: [] });
  assert.equal(dir.synchroniser(s).refusees, 1, 'la direction ne réécrit pas l’offre');
  dir.modifier('offreConquete', o.uid, { statut: 'validee', valideePar: FAIZAL.uid, valideeLe: '2026-06-01', motifDirection: 'Accord : marge faible assumée pour 3 mois (fictif)' });
  assert.equal(dir.synchroniser(s).refusees, 0);
  tel.synchroniser(s);
  tel.modifier('offreConquete', o.uid, { lignes: o.lignes.map(l => ({ ...l, prixOffreCents: 1 })) });
  assert.equal(tel.synchroniser(s).refusees, 1, 'conditions validées figées');
  tel.modifier('offreConquete', o.uid, { statut: 'en_cours', debut: '2026-06-01', fin: '2026-08-30' }); assert.equal(tel.synchroniser(s).refusees, 0);
  tel.modifier('offreConquete', o.uid, { cadeaux: [{ libelle: 'Pistolet de peinture', coutReelCents: 1, remis: true }] });
  assert.equal(tel.synchroniser(s).refusees, 1, 'coût du cadeau figé');
  tel.modifier('offreConquete', o.uid, { cadeaux: [{ libelle: 'Pistolet de peinture', coutReelCents: 18000, remis: true }] }); assert.equal(tel.synchroniser(s).refusees, 0, 'remise du cadeau enregistrée');
  tel.modifier('offreConquete', o.uid, { statut: 'terminee', termineeLe: '2026-08-30', bilan: 'Client régulier (fictif)' }); assert.equal(tel.synchroniser(s).refusees, 0);
  tel.modifier('offreConquete', o.uid, { bilan: 'Réécrit' });
  assert.equal(tel.synchroniser(s).refusees, 1, 'offre terminée : historique figé');
  dir.synchroniser(s);
  const h = dir.lire('offreConquete', o.uid);
  assert.deepEqual([h.statut, h.valideePar, h.cadeaux[0].remis, h.bilan], ['terminee', FAIZAL.uid, true, 'Client régulier (fictif)']);
});

test('vocabulaire : uniquement « Offres de conquête » dans le code et les documents ajoutés', () => {
  for (const f of ['socle/offres-conquete.js', 'socle/organisation.js', 'socle/droits.js', 'socle/modele.js']) {
    const t = readFileSync(join(__dirname, '..', f), 'utf8');
    assert.doesNotMatch(t, /\bpromo|campagne|offre (spéciale|promotionnelle|de bienvenue)/i, f);
  }
});

test('cockpit et supervision : Offres de conquête visibles, alertes transmises à la direction', () => {
  const etat = { offreConquete: [offre({ statut: 'en_cours' }), offre({ uid: 'oc-00000002', statut: 'proposee', debut: null })], pieceEbp: HISTO };
  const sup = Pil.supervision(etat, '2026-09-15'), ck = Pil.cockpit(etat, NAZIM, '2026-09-15');
  assert.equal(sup.offresConquete.aValider.length, 1);
  assert.deepEqual(sup.offresConquete.aValider[0].chiffrage.alertes, ['Taux de marge prévu 7 % (seuil 15 %).']);
  assert.deepEqual(ck.offresConquete.enCours.map(o => o.suivi.verdict), ['reussie']);
});
