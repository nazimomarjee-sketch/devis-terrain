'use strict';
// Lot 6 : pilotage de la performance (Bureau). Données EBP FICTIVES. node --test tests/bureau-performance.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../bureau/performance.js'), E = require('../bureau/ebp-import.js'), CA = require('../bureau/ca-facture.js'), PL = require('../bureau/pipeline.js');
const AUJ = '2026-11-14';
const ent = ['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Montant HT', 'N° de pièce d’origine'];
// Période d'export DÉCLARÉE (lot 7) : par défaut, du 01/01/2025 au 14/11/2026.
const lot = (lignes, emp, fichier = 'pieces.csv', periode = { du: '2025-01-01', au: '2026-11-14' }) => Object.assign(E.lirePieces([ent, ...lignes]), { provenance: { fichier, empreinte: emp, importeLe: '2026-11-14T08:00:00Z', periode } });
const ca = (c, auj = AUJ, arrete = AUJ) => CA.calculer({ pieces: c.pieces, avoirs: c.avoirs, arrete, aujourdhui: auj });

test('import répété : même fichier ignoré, pièces communes comptées une fois, correction d’EBP retenue et signalée', () => {
  const l1 = lot([['Facture', 'FA-1', '03/11/2026', 'C1', 'G1', '1 000,00', ''], ['Facture', 'FA-2', '05/11/2026', 'C2', 'G2', '500,00', '']], 'e1', 'oct.csv');
  const l2 = lot([['Facture', 'FA-2', '05/11/2026', 'C2', 'G2', '550,00', ''], ['Facture', 'FA-3', '10/11/2026', 'C1', 'G1', '200,00', '']], 'e2', 'nov.csv');
  const c = P.consolider([l1, l1, l2]);
  assert.deepEqual(c.doublonsFichier, ['oct.csv']); assert.equal(c.imports, 2);
  assert.deepEqual(c.pieces.map(p => [p.no, p.htCents]).sort(), [['FA-1', 100000], ['FA-2', 55000], ['FA-3', 20000]]);
  assert.deepEqual(c.modifiees.map(m => [m.no, m.avant.htCents, m.apres.htCents]), [['FA-2', 50000, 55000]]);
  assert.equal(ca(c).totalCents, 175000, 'aucun double comptage');
  assert.deepEqual(c.couverture, { debut: '2026-11-03', fin: '2026-11-10' }); assert.equal(c.dernierImport.fichier, 'nov.csv');
});

test('facture puis avoir : CA HT = factures − avoirs de la période ; paiement partiel ⇒ facture à surveiller', () => {
  const c = P.consolider([lot([['Facture', 'FA-1', '03/11/2026', 'C1', 'G1', '1 000,00', ''], ['Avoir', 'AV-1', '06/11/2026', 'C1', 'G1', '200,00', 'FA-1']], 'e')]);
  assert.equal(ca(c).totalCents, 80000);
  const R = E.lireReglements([['N° facture', 'Échéance', 'Date de règlement', 'Montant TTC', 'Reste à payer'], ['FA-1', '05/11/2026', '06/11/2026', '960,00', '360,00']]).reglements;
  const r = P.recommandations({ pieces: c.pieces, reglements: R, liens: true, arrete: AUJ, periodes: c.periodes });
  const f = r.liste.find(x => x.type === 'facture_a_surveiller'); assert.match(f.raison, /FA-1 échue depuis 9 jours, reste 360,00 € TTC/);
});

test('catégories : existant, nouveau, réactivé avec historique suffisant ; sinon « Non déterminé » (jamais deviné)', () => {
  const hist = lot([
    ['Facture', 'FA-A0', '10/03/2026', 'CA', 'EXISTANT', '100,00', ''], ['Facture', 'FA-A1', '04/11/2026', 'CA', 'EXISTANT', '300,00', ''],
    ['Facture', 'FA-R0', '15/06/2025', 'CR', 'REACTIVE', '100,00', ''], ['Facture', 'FA-R1', '05/11/2026', 'CR', 'REACTIVE', '400,00', ''],
    ['Facture', 'FA-N1', '06/11/2026', 'CN', 'NOUVEAU', '700,00', ''], ['Facture', 'FA-X', '01/06/2025', 'CZ', 'ANCIEN', '10,00', '']], 'h');
  const c = P.consolider([hist]);
  const k = P.categories({ pieces: c.pieces, avoirs: c.avoirs, periodes: c.periodes, aujourdhui: AUJ, garages: [{ id: 1, statutCrm: 'prospect' }, { id: 2, statutCrm: 'client', codeEbp: 'CA' }] });
  assert.equal(k.historiqueSuffisant, true);
  assert.deepEqual(['existant', 'nouveau', 'reactive', 'non_determine'].map(x => [k.lignes[x].nb, k.lignes[x].htCents]), [[1, 30000], [1, 70000], [1, 40000], [0, 0]]);
  assert.equal(k.prospectsNonConvertis.nb, 1); assert.match(k.regles.nouveau, /12 mois précédents/);
  const court = P.consolider([lot([['Facture', 'FA-A1', '04/11/2026', 'CA', 'X', '300,00', ''], ['Facture', 'FA-N1', '06/11/2026', 'CN', 'Y', '700,00', '']], 'c', 'nov.csv', { du: '2026-11-01', au: '2026-11-14' })]);
  const k2 = P.categories({ pieces: court.pieces, avoirs: court.avoirs, periodes: court.periodes, aujourdhui: AUJ });
  assert.deepEqual([k2.historiqueSuffisant, k2.lignes.non_determine.nb, k2.lignes.nouveau.nb], [false, 2, 0], 'historique incomplet : non déterminé');
});

test('objectif : absent = non renseigné ; saisi = reste et % ; projection étiquetée estimation ; mois précédent seulement s’il est complet', () => {
  const c = P.consolider([lot([['Facture', 'FA-S', '30/09/2026', 'C1', 'G', '100,00', ''], ['Facture', 'FA-P', '15/10/2026', 'C1', 'G', '8 000,00', ''], ['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '6 000,00', '']], 'o')]);
  const cur = ca(c), prec = CA.calculer({ pieces: c.pieces, avoirs: c.avoirs, arrete: AUJ, aujourdhui: '2026-10-31' });
  const sans = P.objectif({ ca: cur, caPrec: prec, aujourdhui: AUJ, joursOuvres: PL.joursOuvres, periodes: c.periodes });
  assert.deepEqual([sans.faitCents, sans.resteCents, sans.pct], [600000, null, null]); assert.match(sans.motifs.join(), /Objectif mensuel non saisi/);
  const avec = P.objectif({ ca: cur, caPrec: prec, objectifCents: 2000000, aujourdhui: AUJ, joursOuvres: PL.joursOuvres, periodes: c.periodes });
  assert.deepEqual([avec.resteCents, avec.pct], [1400000, 30]);
  assert.equal(avec.projection.estimation, true); assert.match(avec.projection.base, /jours ouvrés écoulés/);
  assert.equal(avec.projection.cents, Math.round(600000 / PL.joursOuvres('2026-10-31', '2026-11-14') * PL.joursOuvres('2026-10-31', '2026-11-30')));
  assert.equal(avec.moisPrecedent.cents, 800000);
  const debutTardif = P.objectif({ ca: cur, caPrec: prec, objectifCents: 2000000, aujourdhui: AUJ, joursOuvres: PL.joursOuvres, periodes: [{ du: '2026-10-15', au: '2026-11-14' }] });
  assert.equal(debutTardif.moisPrecedent, null, 'export déclaré seulement depuis le 15/10 : octobre non comparable');
  const sansHist = P.objectif({ ca: cur, caPrec: CA.calculer({ pieces: c.pieces, avoirs: c.avoirs, arrete: '2026-10-20', aujourdhui: '2026-10-31' }), objectifCents: 2000000, aujourdhui: AUJ, joursOuvres: PL.joursOuvres });
  assert.equal(sansHist.moisPrecedent, null); assert.match(sansHist.motifs.join(), /non couvert/);
});

test('recommandations : devis accepté sans commande, devis sans suite, commande non facturée ou bloquée, dormant ; raisons et preuves', () => {
  const c = P.consolider([lot([
    ['Devis', 'DE-1', '20/10/2026', 'C1', 'G1', '500,00', ''], ['Devis', 'DE-2', '01/11/2026', 'C2', 'G2', '900,00', ''],
    ['Commande', 'CC-2', '03/11/2026', 'C2', 'G2', '900,00', 'DE-2'], ['Commande', 'CC-3', '12/11/2026', 'CB', 'BLOQUE', '100,00', ''],
    ['Facture', 'FA-D0', '10/10/2025', 'CD', 'DORMANT', '2 000,00', ''], ['Facture', 'FA-D1', '01/07/2026', 'CD', 'DORMANT', '1 500,00', '']], 'r')]);
  const demandes = [{ uid: 'U1', clientNom: 'G9', statut: 'accepte', noDevisEbp: 'DE-1', historique: [{ etape: 'envoye', le: '2026-10-21T09:00:00Z' }] }];
  const r = P.recommandations({ pieces: c.pieces, liens: true, arrete: AUJ, periodes: c.periodes, demandes, clientsEbp: [{ code: 'CB', bloque: true }] });
  const par = t => r.liste.filter(x => x.type === t).map(x => x.raison);
  assert.ok(par('devis_a_relancer').some(x => /DE-1 sans commande depuis 25 jours/.test(x)));
  assert.ok(!par('devis_a_relancer').some(x => /DE-2/.test(x)), 'devis suivi d’une commande : pas de relance');
  assert.ok(par('commande_bloquee').some(x => /accepté par le client mais aucune commande/.test(x)));
  assert.ok(par('commande_bloquee').some(x => /CC-3 d’un compte BLOQUÉ/.test(x)));
  assert.ok(!par('commande_bloquee').some(x => /CC-2/.test(x)), 'commande de 11 jours : sous le seuil de 15 jours, non signalée');
  assert.ok(par('dormant_a_reactiver').some(x => /DORMANT|sans facture depuis 136 jours/.test(x)));
  assert.equal(r.liste[0].type, 'garage_a_visiter'); assert.ok(r.liste.every(x => x.raison && x.action && Array.isArray(x.preuve)));
});

test('liens absents ou historique court : aucune recommandation inventée, manques expliqués', () => {
  const c = P.consolider([Object.assign(E.lirePieces([['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Montant HT'], ['Devis', 'DE-1', '20/10/2026', 'C1', 'G1', '500,00']]), { provenance: { empreinte: 'x' } })]);
  assert.equal(c.liens, false);
  const r = P.recommandations({ pieces: c.pieces, liens: c.liens, arrete: AUJ, periodes: c.periodes });
  assert.equal(r.liste.length, 0);
  assert.match(r.manques.join(' | '), /pièce d’origine.*\|.*Échéancier.*\|.*12 derniers mois/);
});

test('décisions du responsable : journal qui ne fait que grandir, dernière décision retenue', () => {
  let j = P.decider([], { id: 'devis_a_relancer|DE-1', decision: 'valide', le: 'L1', par: 'Responsable fictif' });
  j = P.decider(j, { id: 'devis_a_relancer|DE-1', decision: 'ecarte', le: 'L2' });
  assert.equal(j.length, 2); assert.equal(P.derniereDecision(j, 'devis_a_relancer|DE-1').decision, 'ecarte');
  assert.throws(() => P.decider(j, { id: 'x', decision: 'envoyer' }), /inconnue/);
});

// ---------- Lot 7 ----------
test('lot 7 — couverture : seules les périodes DÉCLARÉES comptent, jamais les dates des pièces', () => {
  const avecPieces = lot([['Facture', 'FA-O', '01/10/2026', 'C1', 'G', '100,00', ''], ['Facture', 'FA-O2', '31/10/2026', 'C1', 'G', '100,00', ''], ['Facture', 'FA-N', '03/11/2026', 'C1', 'G', '100,00', '']], 'x', 'f.csv', null);
  const c = P.consolider([avecPieces]);
  assert.equal(c.nonDeclares, 1); assert.deepEqual(c.periodes, []);
  const cur = ca(c), prec = CA.calculer({ pieces: c.pieces, avoirs: c.avoirs, arrete: AUJ, aujourdhui: '2026-10-31' });
  assert.equal(P.objectif({ ca: cur, caPrec: prec, objectifCents: 1, aujourdhui: AUJ, joursOuvres: PL.joursOuvres, periodes: c.periodes }).moisPrecedent, null, 'pièces du 01/10 au 31/10 mais période non déclarée : pas de comparaison');
  // Périodes déclarées sur deux exports contigus : fusionnées, octobre couvert.
  const c2 = P.consolider([lot([['Devis', 'DE-O', '05/10/2026', 'C1', 'G', '50,00', '']], 'a', 'oct.csv', { du: '2026-10-01', au: '2026-10-31' }), lot([['Facture', 'FA-N', '03/11/2026', 'C1', 'G', '100,00', '']], 'b', 'nov.csv', { du: '2026-11-01', au: '2026-11-14' })]);
  assert.deepEqual(c2.periodes, [{ du: '2026-10-01', au: '2026-11-14' }]);
  assert.equal(P.couvre(c2.periodes, '2026-10-01', '2026-10-31'), true);
  assert.equal(P.couvre(c2.periodes, '2026-09-01', '2026-09-30'), false);
  assert.equal(P.objectif({ ca: ca(c2), caPrec: CA.calculer({ pieces: c2.pieces, avoirs: c2.avoirs, arrete: AUJ, aujourdhui: '2026-10-31' }), aujourdhui: AUJ, joursOuvres: PL.joursOuvres, periodes: c2.periodes }).moisPrecedent.cents, 0, 'octobre déclaré exporté et sans vente : 0 € est alors un vrai chiffre');
  // Trou entre deux périodes : non couvert.
  assert.equal(P.couvre(P.fusionnerPeriodes([{ du: '2026-09-01', au: '2026-09-30' }, { du: '2026-10-02', au: '2026-10-31' }]), '2026-09-01', '2026-10-31'), false);
});

test('lot 7 — pièce hors de la période déclarée : signalée (erreur d’export ou de saisie)', () => {
  const c = P.consolider([lot([['Facture', 'FA-H', '15/09/2026', 'C1', 'G', '100,00', ''], ['Facture', 'FA-I', '03/11/2026', 'C1', 'G', '100,00', '']], 'h', 'nov.csv', { du: '2026-11-01', au: '2026-11-14' })]);
  assert.deepEqual(c.horsPeriode.map(x => x.no), ['FA-H']);
});

test('lot 7 — réglages : objectif et seuils validés, bornés, valeurs par défaut si absents', () => {
  const r = P.reglages({ objectifCents: 2000000, seuils: { devisSansCommandeJours: 14, dormantMinJours: 60 } });
  assert.deepEqual([r.objectifCents, r.seuils.devisSansCommandeJours, r.seuils.dormantMinJours, r.seuils.commandeSansFactureJours, r.erreurs.length], [2000000, 14, 60, 15, 0]);
  const m = P.reglages({ objectifCents: -5, seuils: { devisSansCommandeJours: 0, dormantMinJours: 400, dormantMaxJours: 365 } });
  assert.equal(m.objectifCents, null); assert.equal(m.seuils.devisSansCommandeJours, 10); assert.ok(m.erreurs.length >= 3);
  assert.deepEqual(P.reglages().seuils, P.SEUILS);
  const rec = P.recommandations({ pieces: P.consolider([lot([['Devis', 'DE-1', '01/11/2026', 'C1', 'G', '1,00', '']], 'd')]).pieces, liens: true, arrete: AUJ, seuils: { devisSansCommandeJours: 14 } });
  assert.equal(rec.liste.filter(x => x.type === 'devis_a_relancer').length, 0, 'devis de 13 jours, seuil réglé à 14 : non relancé');
});
