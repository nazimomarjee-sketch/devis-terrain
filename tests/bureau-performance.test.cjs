'use strict';
// Lot 6 : pilotage de la performance (Bureau). Données EBP FICTIVES. node --test tests/bureau-performance.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../bureau/performance.js'), E = require('../bureau/ebp-import.js'), CA = require('../bureau/ca-facture.js'), PL = require('../bureau/pipeline.js');
const AUJ = '2026-11-14';
const ent = ['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Montant HT', 'N° de pièce d’origine'];
const lot = (lignes, emp, fichier = 'pieces.csv') => Object.assign(E.lirePieces([ent, ...lignes]), { provenance: { fichier, empreinte: emp, importeLe: '2026-11-14T08:00:00Z' } });
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
  const r = P.recommandations({ pieces: c.pieces, reglements: R, liens: true, arrete: AUJ, couverture: c.couverture });
  const f = r.liste.find(x => x.type === 'facture_a_surveiller'); assert.match(f.raison, /FA-1 échue depuis 9 jours, reste 360,00 € TTC/);
});

test('catégories : existant, nouveau, réactivé avec historique suffisant ; sinon « Non déterminé » (jamais deviné)', () => {
  const hist = lot([
    ['Facture', 'FA-A0', '10/03/2026', 'CA', 'EXISTANT', '100,00', ''], ['Facture', 'FA-A1', '04/11/2026', 'CA', 'EXISTANT', '300,00', ''],
    ['Facture', 'FA-R0', '15/06/2025', 'CR', 'REACTIVE', '100,00', ''], ['Facture', 'FA-R1', '05/11/2026', 'CR', 'REACTIVE', '400,00', ''],
    ['Facture', 'FA-N1', '06/11/2026', 'CN', 'NOUVEAU', '700,00', ''], ['Facture', 'FA-X', '01/06/2025', 'CZ', 'ANCIEN', '10,00', '']], 'h');
  const c = P.consolider([hist]);
  const k = P.categories({ pieces: c.pieces, avoirs: c.avoirs, couverture: c.couverture, aujourdhui: AUJ, garages: [{ id: 1, statutCrm: 'prospect' }, { id: 2, statutCrm: 'client', codeEbp: 'CA' }] });
  assert.equal(k.historiqueSuffisant, true);
  assert.deepEqual(['existant', 'nouveau', 'reactive', 'non_determine'].map(x => [k.lignes[x].nb, k.lignes[x].htCents]), [[1, 30000], [1, 70000], [1, 40000], [0, 0]]);
  assert.equal(k.prospectsNonConvertis.nb, 1); assert.match(k.regles.nouveau, /12 mois précédents/);
  const court = P.consolider([lot([['Facture', 'FA-A1', '04/11/2026', 'CA', 'X', '300,00', ''], ['Facture', 'FA-N1', '06/11/2026', 'CN', 'Y', '700,00', '']], 'c')]);
  const k2 = P.categories({ pieces: court.pieces, avoirs: court.avoirs, couverture: court.couverture, aujourdhui: AUJ });
  assert.deepEqual([k2.historiqueSuffisant, k2.lignes.non_determine.nb, k2.lignes.nouveau.nb], [false, 2, 0], 'historique incomplet : non déterminé');
});

test('objectif : absent = non renseigné ; saisi = reste et % ; projection étiquetée estimation ; mois précédent seulement s’il est complet', () => {
  const c = P.consolider([lot([['Facture', 'FA-S', '30/09/2026', 'C1', 'G', '100,00', ''], ['Facture', 'FA-P', '15/10/2026', 'C1', 'G', '8 000,00', ''], ['Facture', 'FA-1', '03/11/2026', 'C1', 'G', '6 000,00', '']], 'o')]);
  const cur = ca(c), prec = CA.calculer({ pieces: c.pieces, avoirs: c.avoirs, arrete: AUJ, aujourdhui: '2026-10-31' });
  const sans = P.objectif({ ca: cur, caPrec: prec, aujourdhui: AUJ, joursOuvres: PL.joursOuvres, couverture: c.couverture });
  assert.deepEqual([sans.faitCents, sans.resteCents, sans.pct], [600000, null, null]); assert.match(sans.motifs.join(), /Objectif mensuel non saisi/);
  const avec = P.objectif({ ca: cur, caPrec: prec, objectifCents: 2000000, aujourdhui: AUJ, joursOuvres: PL.joursOuvres, couverture: c.couverture });
  assert.deepEqual([avec.resteCents, avec.pct], [1400000, 30]);
  assert.equal(avec.projection.estimation, true); assert.match(avec.projection.base, /jours ouvrés écoulés/);
  assert.equal(avec.projection.cents, Math.round(600000 / PL.joursOuvres('2026-10-31', '2026-11-14') * PL.joursOuvres('2026-10-31', '2026-11-30')));
  assert.equal(avec.moisPrecedent.cents, 800000);
  const debutTardif = P.objectif({ ca: cur, caPrec: prec, objectifCents: 2000000, aujourdhui: AUJ, joursOuvres: PL.joursOuvres, couverture: { debut: '2026-10-15', fin: '2026-11-03' } });
  assert.equal(debutTardif.moisPrecedent, null, 'pièces seulement depuis le 15/10 : octobre non comparable');
  const sansHist = P.objectif({ ca: cur, caPrec: CA.calculer({ pieces: c.pieces, avoirs: c.avoirs, arrete: '2026-10-20', aujourdhui: '2026-10-31' }), objectifCents: 2000000, aujourdhui: AUJ, joursOuvres: PL.joursOuvres });
  assert.equal(sansHist.moisPrecedent, null); assert.match(sansHist.motifs.join(), /incomplet/);
});

test('recommandations : devis accepté sans commande, devis sans suite, commande non facturée ou bloquée, dormant ; raisons et preuves', () => {
  const c = P.consolider([lot([
    ['Devis', 'DE-1', '20/10/2026', 'C1', 'G1', '500,00', ''], ['Devis', 'DE-2', '01/11/2026', 'C2', 'G2', '900,00', ''],
    ['Commande', 'CC-2', '03/11/2026', 'C2', 'G2', '900,00', 'DE-2'], ['Commande', 'CC-3', '12/11/2026', 'CB', 'BLOQUE', '100,00', ''],
    ['Facture', 'FA-D0', '10/10/2025', 'CD', 'DORMANT', '2 000,00', ''], ['Facture', 'FA-D1', '01/07/2026', 'CD', 'DORMANT', '1 500,00', '']], 'r')]);
  const demandes = [{ uid: 'U1', clientNom: 'G9', statut: 'accepte', noDevisEbp: 'DE-1', historique: [{ etape: 'envoye', le: '2026-10-21T09:00:00Z' }] }];
  const r = P.recommandations({ pieces: c.pieces, liens: true, arrete: AUJ, couverture: c.couverture, demandes, clientsEbp: [{ code: 'CB', bloque: true }] });
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
  const r = P.recommandations({ pieces: c.pieces, liens: c.liens, arrete: AUJ, couverture: c.couverture });
  assert.equal(r.liste.length, 0);
  assert.match(r.manques.join(' | '), /pièce d’origine.*\|.*Échéancier.*\|.*12 mois/);
});

test('décisions du responsable : journal qui ne fait que grandir, dernière décision retenue', () => {
  let j = P.decider([], { id: 'devis_a_relancer|DE-1', decision: 'valide', le: 'L1', par: 'Responsable fictif' });
  j = P.decider(j, { id: 'devis_a_relancer|DE-1', decision: 'ecarte', le: 'L2' });
  assert.equal(j.length, 2); assert.equal(P.derniereDecision(j, 'devis_a_relancer|DE-1').decision, 'ecarte');
  assert.throws(() => P.decider(j, { id: 'x', decision: 'envoyer' }), /inconnue/);
});
