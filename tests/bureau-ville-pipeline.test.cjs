'use strict';
// Maquette « Ville LEGO connectée » : correspondance pipeline → états visuels EXISTANTS de la Ville.
// Exécution : node --test tests/bureau-ville-pipeline.test.cjs — données 100 % fictives.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const E = require('../bureau/ebp-import.js'), P = require('../bureau/pipeline.js'), V = require('../bureau/ville-pipeline.js'), B = require('../bureau/bureau-logique.js');

const F = join(__dirname, 'fixtures', 'bureau'), table = n => E.lireCsv(E.decoderTexte(readFileSync(join(F, n))).texte);
const AUJ = '2026-11-06';
function scenario() {
  const piecesEbp = [...E.lirePieces(table('ebp-pieces.csv')).pieces, ...E.lirePieces(table('ebp-pieces-historique.csv')).pieces];
  const clientsEbp = [...E.lireClientsEbp(table('ebp-clients.csv')).clients, ...E.lireClientsEbp(table('ebp-clients-historique.csv')).clients];
  const plan = P.construirePlan({ piecesEbp, reglements: E.lireReglements(table('ebp-reglements.csv')).reglements, clientsEbp, arrete: AUJ, maintenant: AUJ + 'T07:00:00.000Z' });
  const tel = [['ALPHA', 'Massy', '91300', 'prospect'], ['BETA', 'Palaiseau', '91120', 'client'], ['DELTA', 'Massy', '91300', 'client'], ['EPSILON', 'Évry-Courcouronnes', '91000', 'client'],
    ['GAMMA', 'Orsay', '91400', 'client'], ['OMEGA', 'Massy', '91300', 'client'], ['SIGMA', 'Orsay', '91400', 'client'], ['KAPPA', 'Palaiseau', '91120', 'client'],
    ['ZETA', 'Les Ulis', '91940', 'client'], ['ZETA', 'Les Ulis', '91940', 'prospect'], ['NU', 'Palaiseau', '91120', 'prospect']]
    .map(([n, ville, cp, statutCrm], i) => ({ id: i + 1, nom: 'GARAGE FICTIF ' + n, ville, cp, statutCrm, etape: n === 'NU' ? 'Première visite (saisie au téléphone)' : '', etapeDate: n === 'NU' ? '2026-11-09' : '' }));
  const garages = B.lireClients(tel, AUJ).garages;
  return { garages, plan, piecesEbp, clientsEbp };
}
const parNom = r => Object.fromEntries(r.garages.map(g => [g.nom + (g.id ? '#' + g.id : ''), g]));

test('statuts : uniquement les 4 couleurs existantes de la Ville, selon les faits EBP', () => {
  const s = scenario(), r = V.alimenterVille(s.garages, s), g = n => r.garages.find(x => x.nom === 'GARAGE FICTIF ' + n);
  assert.equal(g('EPSILON').statut, 'risque', 'facture échue');
  assert.equal(g('GAMMA').statut, 'risque', 'compte bloqué dans EBP');
  assert.equal(g('OMEGA').statut, 'dormant', 'à reconquérir');
  assert.equal(g('ALPHA').statut, 'actif', 'commande EBP sur 12 mois (le téléphone disait prospect)');
  assert.equal(g('ALPHA').statutTelephone, 'prospect');
  for (const n of ['BETA', 'DELTA', 'KAPPA', 'SIGMA']) assert.equal(g(n).statut, 'actif', n);
  assert.equal(g('NU').statut, 'prospect', 'absent d’EBP : statut du téléphone conservé');
  for (const x of r.garages) assert.ok(Object.keys(B.STATUTS).includes(x.statut), x.statut);
});

test('homonymes : jamais reliés au hasard, signalés comme ambigus', () => {
  const s = scenario(), r = V.alimenterVille(s.garages, s);
  assert.deepEqual(r.rapport.ambigus, ['GARAGE FICTIF ZETA', 'GARAGE FICTIF ZETA']);
  for (const z of r.garages.filter(x => x.nom === 'GARAGE FICTIF ZETA')) { assert.equal(z.ebp, undefined); assert.equal(z.caMois, null); }
  assert.equal(r.rapport.relies, 8);
  assert.deepEqual(r.rapport.ebpSansGarage, ['GARAGE FICTIF LAMBDA'], 'client EBP sans fiche au téléphone : signalé, pas ajouté à la Ville');
});

test('CA du mois : commandes EBP du mois (euros), jamais inventé', () => {
  const s = scenario(), r = V.alimenterVille(s.garages, s), g = n => r.garages.find(x => x.nom === 'GARAGE FICTIF ' + n);
  assert.equal(g('BETA').caMois, 2100);
  assert.equal(g('KAPPA').caMois, 500);
  assert.equal(g('ALPHA').caMois, 0);
  assert.equal(g('NU').caMois, null, 'pas de donnée EBP : rien affiché');
  assert.equal(g('OMEGA').ebp.ca12, 7200);
  // Commandes et facturé jamais confondus, chaque montant justifié par ses pièces EBP.
  assert.deepEqual([g('BETA').caMois, g('BETA').factureMois, g('BETA').ebp.commandesMois], [2100, 0, ['CC-2001']]);
  assert.deepEqual([g('ZETA') && g('ZETA').caMois], [null]);
  const e = r.garages.find(x => x.nom === 'GARAGE FICTIF EPSILON');
  assert.deepEqual([e.caMois, e.factureMois, e.ebp.ca12, e.ebp.facture12, e.ebp.arrete], [0, 0, 3000, 3000, '2026-11-06']);
  assert.equal(g('OMEGA').ebp.derniereCommande, '2026-07-15');
});

test('fil d’actions : priorités du plan d’abord (pictos existants), puis étapes du téléphone', () => {
  const s = scenario(), r = V.alimenterVille(s.garages, s), fil = V.filActions(r.garages);
  assert.deepEqual(fil.slice(0, 3).map(e => [e.t, e.x.nom, e.quand]), [
    ['relance', 'GARAGE FICTIF EPSILON', 'Priorité du jour'], ['devis', 'GARAGE FICTIF BETA', 'Priorité du jour'], ['action', 'GARAGE FICTIF DELTA', 'Priorité du jour']]);
  assert.ok(fil.some(e => e.texte === 'Première visite (saisie au téléphone)'), 'étape saisie au téléphone conservée');
  for (const e of fil) assert.ok(['visite', 'devis', 'essai', 'relance', 'prospect', 'action'].includes(e.t), 'picto existant : ' + e.t);
});

test('aucune modification des fiches reçues, classement géographique conservé', () => {
  const s = scenario(), avant = JSON.stringify(s.garages), r = V.alimenterVille(s.garages, s);
  assert.equal(JSON.stringify(s.garages), avant);
  for (let i = 0; i < r.garages.length; i++) {
    assert.equal(r.garages[i].territoire, s.garages[i].territoire);
    assert.equal(r.garages[i].etape, s.garages[i].etape);
  }
});

test('Offres de conquête : anneau seulement pour une offre en cours, historique conservé, couleur inchangée', () => {
  const OC = require('../socle/offres-conquete.js');
  const lignes = [{ produit: 'Vernis', quantite: 2, prixTarifCents: 12000, prixOffreCents: 10500, coutAchatCents: 7000 }];
  const cadeaux = [{ libelle: 'Pistolet de peinture', coutReelCents: 18000, remis: true }];
  const t = OC.tableau([
    { uid: 'oc-1', garageUid: 'GARAGE FICTIF ALPHA', titre: 'Offre de conquête ALPHA', statut: 'en_cours', lignes, cadeaux, proposeePar: 'u-developpement', debut: '2026-10-01' },
    { uid: 'oc-2', garageUid: 'GARAGE FICTIF BETA', titre: 'Offre de conquête BETA', statut: 'terminee', lignes, cadeaux, proposeePar: 'u-developpement', debut: '2026-06-01' }], [], AUJ);
  const s = scenario(), g = V.offresParGarage(s.garages, t, x => x.nom), x = n => g.find(y => y.nom === 'GARAGE FICTIF ' + n);
  assert.equal(x('ALPHA').offresConquete.enCours.length, 1);
  assert.equal(x('ALPHA').offresConquete.enCours[0].cadeaux[0].libelle, 'Pistolet de peinture');
  assert.deepEqual([x('BETA').offresConquete.enCours.length, x('BETA').offresConquete.historique[0].statut], [0, 'terminee'], 'anneau éteint, historique gardé');
  assert.equal(x('NU').offresConquete, undefined);
  for (const n of ['ALPHA', 'BETA']) assert.equal(x(n).statut, s.garages.find(y => y.nom === 'GARAGE FICTIF ' + n).statut, 'couleur du personnage inchangée');
});
