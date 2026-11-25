'use strict';
// Socle 0 — migration à blanc (téléphone + EBP → modèle commun), puis cockpit et supervision.
// Exécution : node --test tests/socle-migration-pilotage.test.cjs — fichiers fictifs de tests/fixtures/bureau.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const LS = require('../bureau/lecture-sauvegarde.js'), E = require('../bureau/ebp-import.js');
const Mig = require('../socle/migration.js'), M = require('../socle/modele.js'), Pil = require('../socle/pilotage.js');
const { Serveur, Appareil } = require('../socle/synchro.js');

const F = join(__dirname, 'fixtures', 'bureau');
const NAZIM = { uid: 'u-developpement', nom: 'Responsable du développement (fictif)', role: 'developpement', actif: true };
const FAIZAL = { uid: 'u-direction', nom: 'Direction (fictif)', role: 'direction', actif: true };
const genUid = (() => { let n = 0; return () => 'm-' + String(++n).padStart(6, '0'); })();
const telephone = async nom => (await LS.lire(new Blob([readFileSync(join(F, nom))]))).telephone;
const table = n => E.lireCsv(E.decoderTexte(readFileSync(join(F, n))).texte);

test('migration du jeu Samsung (.odicolor) : fiches, 60 visites, devis ; chaque élément valide ou écarté avec motif', async () => {
  const t = await telephone('telephone-jeu-samsung.odicolor');
  const r = Mig.depuisTelephone(t, { genUid, responsable: NAZIM.uid });
  const n = e => r.objets.filter(o => o.entite === e).length;
  assert.deepEqual([n('garage'), n('visite'), n('devisTerrain')], [3, 60, 12]);
  for (const { entite, objet } of r.objets) assert.deepEqual(M.valider(entite, objet), [], entite);
  assert.deepEqual(r.ecartes, []);
});

test('migration : homonymes = deux garages distincts ; retour vers le téléphone strictement identique (sans perte)', async () => {
  const t = await telephone('telephone-idf.odicolor');
  const r = Mig.depuisTelephone(t, { genUid, responsable: NAZIM.uid });
  const garages = r.objets.filter(o => o.entite === 'garage').map(o => o.objet);
  assert.equal(garages.filter(g => g.nom === 'GARAGE FICTIF IDF 1').length, 2);
  assert.equal(new Set(garages.map(g => g.uid)).size, garages.length);
  assert.deepEqual(Mig.versTelephone(garages, r.origine), t.clients, 'fiche d’origine rendue telle quelle, champs inconnus compris');
  const modifie = garages.map(g => (g.nom === 'GARAGE FICTIF IDF 2' ? { ...g, statut: 'client' } : g));
  const retour = Mig.versTelephone(modifie, r.origine);
  assert.equal(retour.find(c => c.nom === 'GARAGE FICTIF IDF 2').statutCrm, 'client');
  assert.deepEqual(retour.filter(c => c.nom !== 'GARAGE FICTIF IDF 2'), t.clients.filter(c => c.nom !== 'GARAGE FICTIF IDF 2'));
  const action = r.objets.find(o => o.entite === 'action').objet;
  assert.deepEqual([action.titre, action.echeance, action.source], ['Rappeler pour essai vernis (fictif)', '2026-11-12', 'terrain']);
});

test('migration : données illisibles écartées avec motif, jamais inventées', () => {
  const r = Mig.depuisTelephone({ clients: [{ id: 1, nom: '', statutCrm: 'client' }, { id: 2, nom: 'GARAGE FICTIF', visites: [{ date: 'hier', res: 'vu' }] }], devis: [{ id: 9, clientId: 99, lignes: [] }] }, { genUid, responsable: NAZIM.uid });
  assert.deepEqual(r.ecartes.map(e => [e.entite, e.motif]), [['garage', 'Valeur invalide : nom, Champ obligatoire : nom'], ['visite', 'Valeur invalide : date'], ['devisTerrain', 'Garage du devis introuvable']]);
});

test('EBP : pièces copiées en lecture seule, reliées seulement à un garage unique', async () => {
  const garages = [{ uid: 'g-alpha-0001', nom: 'GARAGE FICTIF ALPHA' }, { uid: 'g-beta-00001', nom: 'GARAGE FICTIF BETA' }, { uid: 'g-beta-00002', nom: 'GARAGE FICTIF BETA' }];
  const r = Mig.depuisEbp(E.lirePieces(table('ebp-pieces.csv')).pieces, { arrete: '2026-11-06', garages, genUid });
  assert.equal(r.objets.length, 15); assert.deepEqual(r.ecartes, []);
  const lien = no => r.objets.find(o => o.objet.no === no).objet.garageUid;
  assert.equal(lien('DV-1001'), 'g-alpha-0001');
  assert.equal(lien('CC-2001'), undefined, 'homonymes : pas de lien au hasard');
});

test('bout en bout : migration chargée via la synchronisation, cockpit et supervision cohérents', async () => {
  let n = 0; const id = () => 'op-' + String(++n).padStart(6, '0');
  const s = new Serveur({ genId: id, horloge: () => '2026-11-07T07:00:00.000Z' }); s.initialiser([NAZIM, FAIZAL]);
  const pc = new Appareil({ nom: 'ordinateur', jeton: s.enregistrerAppareil(NAZIM.uid, 'ordinateur'), auteur: NAZIM.uid, genId: id });
  const dir = new Appareil({ nom: 'ordinateur direction', jeton: s.enregistrerAppareil(FAIZAL.uid, 'ordinateur direction'), auteur: FAIZAL.uid, genId: id });
  const tel = Mig.depuisTelephone(await telephone('telephone-idf.odicolor'), { genUid, responsable: NAZIM.uid });
  for (const { entite, objet } of tel.objets) pc.creer(entite, objet);
  const garages = tel.objets.filter(o => o.entite === 'garage').map(o => o.objet);
  const ebp = Mig.depuisEbp(E.lirePieces(table('ebp-pieces.csv')).pieces, { arrete: '2026-11-06', garages, genUid });
  for (const { objet } of ebp.objets) pc.importer('pieceEbp', objet);
  pc.creer('objectif', { uid: 'o-00000001', periode: '2026-11', caCents: 1000000, statut: 'propose' });
  pc.creer('decision', { uid: 'd-00000001', type: 'objectif', titre: 'Objectif de novembre : 10 000 € HT (fictif)', proposeePar: NAZIM.uid, proposeeLe: '2026-11-07', statut: 'proposee' });
  assert.equal(pc.synchroniser(s).refusees, 0);
  dir.creer('action', { uid: 'a-dir-00001', titre: 'Faire le point sur les impayés (fictif)', responsable: NAZIM.uid, priorite: 1, echeance: '2026-11-06', statut: 'a_faire', source: 'direction' });
  dir.synchroniser(s);

  const etatDe = a => Object.fromEntries(Object.keys(M.ENTITES).map(e => [e, a.liste(e)]));
  const sup = Pil.supervision(etatDe(dir), '2026-11-07');
  assert.deepEqual(sup.aValider.map(d => d.titre), ['Objectif de novembre : 10 000 € HT (fictif)']);
  assert.equal(sup.objectifsAValider.length, 1);
  assert.deepEqual([sup.resultats.caCommandeCents, sup.resultats.commandes, sup.resultats.avancement], [280000, 2, null], 'objectif non validé : pas de pourcentage');
  assert.deepEqual(sup.activite.garages, { clients: 2, prospects: 4, dormants: 0 });

  dir.modifier('objectif', 'o-00000001', { statut: 'valide', valideePar: FAIZAL.uid });
  dir.modifier('decision', 'd-00000001', { statut: 'validee', decideePar: FAIZAL.uid, decideeLe: '2026-11-07', motifDirection: 'Validé (fictif)' });
  assert.equal(dir.synchroniser(s).refusees, 0);
  pc.synchroniser(s);
  const ck = Pil.cockpit(etatDe(pc), NAZIM, '2026-11-07', s.conflitsOuverts());
  assert.deepEqual(ck.priorites.map(a => a.titre), ['Faire le point sur les impayés (fictif)', 'Rappeler pour essai vernis (fictif)']);
  assert.equal(ck.enRetard, 1);
  assert.equal(ck.demandesDirection.length, 1);
  assert.deepEqual(ck.decisionsTranchees.map(d => d.statut), ['validee']);
  assert.equal(ck.resultats.avancement, 28, '2 800 € commandés sur 10 000 € validés');
});
