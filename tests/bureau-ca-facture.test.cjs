'use strict';
// CA facturé HT du mois (bureau/ca-facture.js). DONNÉES FICTIVES uniquement (bureau/ville/fictif-idf.js).
// Exécution : node --test tests/bureau-ca-facture.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../bureau/ca-facture.js');
const M = require('../bureau/ville/modele-commune.js');
const L0 = require('../bureau/bureau-logique.js');
const F = require('../bureau/ville/fictif-idf.js');
const Pipeline = require('../bureau/pipeline.js');
const E = require('../bureau/ebp-import.js');

const D = F.avecDemoBureau(L0.garagesDemo(2026)), MODELE = M.construire(D);
const calc = (o = {}) => C.calculer(Object.assign({ pieces: D.piecesEbp, avoirs: D.avoirsEbp, clientsEbp: D.clientsEbp, modele: MODELE, arrete: '2026-11-06', aujourdhui: '2026-11-06' }, o));
const etab = nom => [...MODELE.communes.values()].flatMap(c => c.etablissements).concat(MODELE.aClasser).find(e => e.nom.valeur === nom);
const somme = o => Object.values(o).reduce((s, v) => s + v, 0);

test('1. seulement les factures du mois, avoirs déduits à leur date ; jamais commandes, devis ni encaissements', () => {
  const r = calc();
  assert.ok(r.lignes.every(l => l.type === 'facture' || l.type === 'avoir'));
  assert.ok(!r.lignes.some(l => ['CDE-NOV', 'DEV-NOV', 'FA-0999', 'AV-0901'].includes(l.no)), 'commande, devis, facture et avoir d’octobre exclus');
  assert.equal(r.avoirsCents, -8000, 'avoir de novembre déduit');
  assert.equal(r.totalCents, r.facturesCents + r.avoirsCents);
  const f = etab('CARROSSERIE FICTIVE F');
  assert.equal(C.valeur(r, 'etablissement', f).cents, 48000 - 8000, 'facture moins avoir du même client');
  // Un avoir daté du mois suivant ne touche pas ce mois ; le même avoir daté de ce mois oui.
  const r2 = calc({ avoirs: [{ no: 'AV-X', date: '2026-12-01', code: 'F03', htCents: -5000 }] });
  assert.equal(r2.avoirsCents, 0);
  assert.equal(calc({ avoirs: [{ no: 'AV-X', date: '2026-11-06', code: 'F03', htCents: 5000 }] }).avoirsCents, -5000, 'avoir toujours en déduction, quel que soit son signe dans l’export');
  assert.equal(calc({ avoirs: [{ no: 'AV-X', date: '2026-11-07', code: 'F03', htCents: -5000 }] }).avoirsCents, 0, 'pièce postérieure à l’export ignorée');
});

test('2. doublons de factures comptés une fois et signalés ; avoir illisible signalé, non déduit', () => {
  const r = calc();
  assert.equal(r.lignes.filter(l => l.no === 'FA-1001').length, 1);
  assert.deepEqual(r.doublons, [{ type: 'facture', no: 'FA-1001', identique: true }]);
  assert.ok(r.incomplets.some(t => /en double.*FA-1001/.test(t)));
  assert.ok(r.incomplets.some(t => /AV-ILLISIBLE.*non déduit/.test(t)));
  assert.ok(calc({ ignorees: [{ ligne: 4, motif: 'x' }] }).incomplets.some(t => /1 ligne\(s\).*sous-estimé/.test(t)));
});

test('3. rattachement par le code client EBP seulement ; non attribué affiché à part ; aucun double comptage entre niveaux', () => {
  const r = calc();
  const sansCode = r.nonAttribue.lignes.find(l => l.no === 'FA-9903');
  assert.match(sansCode.motif, /aucun rapprochement par le nom/, 'le nom « CARROSSERIE FICTIVE B » existe à Goussainville mais n’est jamais utilisé');
  assert.equal(C.valeur(r, 'etablissement', etab('CARROSSERIE FICTIVE B')).cents, null, 'prospect sans compte EBP : pas de CA');
  assert.deepEqual(r.nonAttribue.lignes.map(l => l.no).sort(), ['FA-9901', 'FA-9902', 'FA-9903']);
  assert.equal(r.nonAttribue.cents, 30000 + 15000 + 20000);
  assert.ok(r.controle.ok);
  assert.equal(r.idfCents + r.nonAttribue.cents, r.totalCents, 'global = Île-de-France + non attribué');
  assert.equal(somme(r.parDep), r.idfCents, 'départements → Île-de-France');
  assert.equal(somme(r.parCommune), r.idfCents, 'communes → Île-de-France');
  for (const c of MODELE.communes.values()) {
    const s = c.etablissements.reduce((t, x) => t + (r.parEtablissement[x.uid] || 0), 0);
    assert.equal(s, r.parCommune[c.insee] || 0, c.commune + ' : établissements → commune');
  }
  const deps = {}; for (const c of MODELE.communes.values()) deps[c.dep] = (deps[c.dep] || 0) + (r.parCommune[c.insee] || 0);
  for (const [d, v] of Object.entries(deps)) assert.equal(v, r.parDep[d] || 0, d + ' : communes → département');
  // Sans modèle Ma Ville : rien n'est attribué, tout reste visible dans « non attribué ».
  const nu = calc({ modele: null });
  assert.equal(nu.idfCents, 0); assert.equal(nu.nonAttribue.cents, nu.totalCents);
});

test('4. « Non renseigné » plutôt qu’un faux zéro', () => {
  assert.equal(calc({ pieces: undefined }).totalCents, null);
  assert.match(calc({ pieces: undefined }).motif, /non chargé/);
  const vieux = calc({ arrete: '2026-10-31' });
  assert.equal(vieux.totalCents, null); assert.match(vieux.motif, /antérieur au mois en cours/);
  assert.equal(C.valeur(vieux, 'dep', '95').cents, null);
  assert.equal(C.euros(null), 'Non renseigné');
  const r = calc();
  assert.equal(C.valeur(r, 'etablissement', etab('CARROSSERIE FICTIVE A')).cents, 0, 'client en compte sans facture ce mois : 0 réel (export couvrant le mois)');
  assert.equal(C.valeur(r, 'commune', '95127').cents, 0, 'commune sans facture : 0 réel');
  assert.match(C.fraicheur(r), /Export EBP du 06\/11\/2026 · pas en temps réel/);
});

test('5. CA personnel seulement si le portefeuille EBP le permet', () => {
  assert.match(calc().personnel.motif, /code représentant EBP n’est pas renseigné/);
  const sansRep = calc({ clientsEbp: D.clientsEbp.map(c => Object.assign({}, c, { commercial: '' })), monCommercial: 'REP-A' });
  assert.equal(sansRep.personnel.totalCents, null); assert.match(sansRep.personnel.motif, /n’indique pas le représentant/);
  const r = calc({ monCommercial: 'REP-A' }), rep = new Map(D.clientsEbp.map(c => [c.code, c.commercial]));
  const attendu = r.lignes.filter(l => rep.get(l.code) === 'REP-A').reduce((s, l) => s + l.cents, 0);
  assert.equal(r.personnel.totalCents, attendu);
  assert.ok(r.personnel.totalCents < r.totalCents, 'personnel ≠ agence');
  const b = calc({ monCommercial: 'REP-B' });
  assert.equal(r.personnel.totalCents + b.personnel.totalCents + r.personnel.nonRattacheCents, r.totalCents, 'A + B + sans représentant = agence');
});

test('6. concordance Bureau ↔ téléphone : « Factures émises » du téléphone = factures du Bureau avant avoirs', () => {
  const pieces = D.piecesEbp.filter((p, i, t) => t.findIndex(q => q.type === p.type && q.no === p.no) === i); // comme après l'import EBP (un numéro = une pièce)
  const k = Pipeline.kpi(pieces, [], [], '2026-11-06').mois;
  const r = calc({ pieces });
  assert.equal(Math.round(k.facHt * 100), r.facturesCents, 'même total de factures');
  assert.equal(k.facN, r.nbFactures, 'même nombre de factures');
  assert.notEqual(r.totalCents, r.facturesCents, 'le CA net (avoirs déduits) diffère : le téléphone devra l’afficher à part (audit)');
});

test('7. import EBP : colonne représentant lue ; « Nom commercial » n’est jamais pris pour le représentant ; avoir avec code client', () => {
  const c = E.lireClientsEbp([['Code', 'Nom commercial', 'Ville', 'Représentant'], ['C1', 'GARAGE FICTIF', 'Goussainville', 'REP-A']]);
  assert.equal(c.clients[0].nom, 'GARAGE FICTIF'); assert.equal(c.clients[0].commercial, 'REP-A');
  const p = E.lirePieces([['Type', 'N° pièce', 'Date', 'Code client', 'Client', 'Total HT'], ['Avoir', 'AV-1', '04/11/2026', 'C1', 'GARAGE FICTIF', '-50,00']]);
  assert.equal(p.avoirs[0].code, 'C1');
});
