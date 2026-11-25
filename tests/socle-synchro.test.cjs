'use strict';
// Socle 0 — synchronisation simulée téléphone ↔ ordinateur ↔ direction. Aucun réseau, données fictives.
// Exécution : node --test tests/socle-synchro.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Serveur, Appareil } = require('../socle/synchro.js');

const NAZIM = { uid: 'u-developpement', nom: 'Responsable du développement (fictif)', role: 'developpement', actif: true };
const FAIZAL = { uid: 'u-direction', nom: 'Direction (fictif)', role: 'direction', actif: true };

function monde() {
  let n = 0; const genId = () => 'id-' + String(++n).padStart(6, '0');
  let t = 0; const horloge = () => '2026-11-07T08:' + String(t++ % 60).padStart(2, '0') + ':00.000Z';
  const s = new Serveur({ genId, horloge }); s.initialiser([NAZIM, FAIZAL]);
  const app = (u, nom) => new Appareil({ nom, jeton: s.enregistrerAppareil(u.uid, nom), auteur: u.uid, genId });
  return { s, tel: app(NAZIM, 'téléphone'), pc: app(NAZIM, 'ordinateur'), dir: app(FAIZAL, 'ordinateur direction') };
}
const GARAGE = { uid: 'g-00000001', nom: 'GARAGE FICTIF ALPHA', ville: 'Massy', statut: 'prospect' };
// Contenu des appareils, trié (l'ordre d'arrivée des données peut différer d'un appareil à l'autre).
const trie = v => Array.isArray(v) ? v.map(trie) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, trie(v[k])])) : v;
const etat = a => JSON.stringify(trie(Object.fromEntries(Object.entries(a.objets).map(([e, l]) => [e, Object.fromEntries(Object.entries(l).map(([u, o]) => [u, o.valeurs]))]))));

test('hors connexion : saisies du téléphone et de l’ordinateur réunies, les 3 appareils convergent', () => {
  const { s, tel, pc, dir } = monde();
  tel.creer('garage', GARAGE);
  tel.creer('visite', { uid: 'v-00000001', garageUid: GARAGE.uid, date: '2026-11-07', resultat: 'vu' });
  pc.creer('action', { uid: 'a-00000001', titre: 'Préparer la tournée de Massy', responsable: NAZIM.uid, priorite: 1, statut: 'a_faire', source: 'terrain' });
  assert.equal(tel.file.length, 2, 'en attente tant qu’il n’y a pas de réseau');
  for (const a of [tel, pc, dir, tel]) a.synchroniser(s);
  assert.equal(etat(tel), etat(pc)); assert.equal(etat(pc), etat(dir));
  assert.equal(dir.lire('garage', GARAGE.uid).nom, 'GARAGE FICTIF ALPHA', 'la direction consulte');
  assert.equal(s.conflitsOuverts().length, 0);
});

test('conflit : même champ modifié sur deux appareils → rien n’est écrasé, les deux valeurs sont gardées, un humain tranche', () => {
  const { s, tel, pc } = monde();
  tel.creer('garage', GARAGE); tel.synchroniser(s); pc.synchroniser(s);
  tel.modifier('garage', GARAGE.uid, { notes: 'Rappeler lundi (téléphone)' });
  pc.modifier('garage', GARAGE.uid, { notes: 'Essai vernis prévu (ordinateur)' });
  assert.equal(pc.synchroniser(s).conflits, 0);
  const b = tel.synchroniser(s);
  assert.equal(b.conflits, 1);
  const [c] = s.conflitsOuverts();
  assert.deepEqual([c.champ, c.valeurServeur, c.valeurAppareil, c.appareil], ['notes', 'Essai vernis prévu (ordinateur)', 'Rappeler lundi (téléphone)', 'téléphone']);
  assert.equal(tel.alertes[0].statut, 'conflit', 'l’utilisateur est prévenu');
  assert.equal(tel.lire('garage', GARAGE.uid).notes, 'Essai vernis prévu (ordinateur)', 'l’appareil reprend la valeur du serveur ; la sienne reste dans le conflit');
  tel.modifier('garage', GARAGE.uid, { notes: 'Essai vernis prévu ; rappeler lundi' }, [c.id]);
  tel.synchroniser(s); pc.synchroniser(s);
  assert.equal(s.conflitsOuverts().length, 0);
  assert.equal(pc.lire('garage', GARAGE.uid).notes, 'Essai vernis prévu ; rappeler lundi');
});

test('pas de faux conflit : même valeur des deux côtés, ou plusieurs saisies hors connexion sur le même garage', () => {
  const { s, tel, pc } = monde();
  tel.creer('garage', GARAGE); tel.synchroniser(s); pc.synchroniser(s);
  tel.modifier('garage', GARAGE.uid, { statut: 'client' }); pc.modifier('garage', GARAGE.uid, { statut: 'client' });
  pc.synchroniser(s); assert.equal(tel.synchroniser(s).conflits, 0);
  tel.modifier('garage', GARAGE.uid, { notes: 'a' }); tel.modifier('garage', GARAGE.uid, { notes: 'b' }); tel.modifier('garage', GARAGE.uid, { ville: 'Palaiseau' });
  assert.equal(tel.file.length, 1, 'saisies regroupées');
  assert.equal(tel.synchroniser(s).conflits, 0);
  assert.deepEqual([tel.lire('garage', GARAGE.uid).notes, tel.lire('garage', GARAGE.uid).ville], ['b', 'Palaiseau']);
});

test('coupure réseau avant l’envoi : rien n’est perdu, reprise plus tard', () => {
  const { s, tel } = monde();
  tel.creer('garage', GARAGE);
  tel.creer('visite', { uid: 'v-00000001', garageUid: GARAGE.uid, date: '2026-11-07', resultat: 'vu' });
  const b = tel.synchroniser(s, n => n < 1); // le réseau tombe après le 1er envoi
  assert.equal(b.interrompu, true); assert.equal(tel.file.length, 1);
  tel.synchroniser(s);
  assert.equal(tel.file.length, 0);
  assert.ok(s.etatObjet(tel.jeton, 'visite', 'v-00000001'));
});

test('réponse perdue : l’opération renvoyée n’est appliquée qu’une fois, les saisies suivantes ne sont pas perdues', () => {
  const { s, tel, pc } = monde();
  tel.creer('garage', GARAGE); tel.synchroniser(s);
  tel.modifier('garage', GARAGE.uid, { notes: 'Première note' });
  tel.synchroniser(s, () => 'perdue'); // le serveur a reçu, le téléphone ne le sait pas
  tel.modifier('garage', GARAGE.uid, { ville: 'Orsay' }); // nouvelle saisie après la coupure
  assert.equal(tel.file.length, 2, 'la nouvelle saisie n’est pas fondue dans l’opération déjà partie');
  const b = tel.synchroniser(s);
  assert.equal(b.conflits + b.refusees, 0);
  pc.synchroniser(s);
  assert.deepEqual([pc.lire('garage', GARAGE.uid).notes, pc.lire('garage', GARAGE.uid).ville], ['Première note', 'Orsay']);
  assert.equal(s.flux.filter(f => f.champs.notes === 'Première note').length, 1, 'appliquée une seule fois');
});

test('décision de direction de bout en bout : proposée au téléphone, tranchée par la direction, visible partout', () => {
  const { s, tel, dir } = monde();
  tel.creer('decision', { uid: 'd-00000001', type: 'remise', titre: 'Remise 10 % GARAGE FICTIF ALPHA', expose: 'Essai concluant (fictif)', montantCents: 15000, proposeePar: NAZIM.uid, proposeeLe: '2026-11-07', statut: 'proposee' });
  tel.synchroniser(s); dir.synchroniser(s);
  tel.modifier('decision', 'd-00000001', { statut: 'validee', decideePar: NAZIM.uid });
  assert.equal(tel.synchroniser(s).refusees, 1, 'le développement ne peut pas valider');
  assert.match(tel.alertes[0].motif, /relève de la direction/);
  assert.equal(tel.lire('decision', 'd-00000001').statut, 'proposee', 'valeur du serveur reprise');
  dir.modifier('decision', 'd-00000001', { statut: 'validee', decideePar: FAIZAL.uid, decideeLe: '2026-11-07', motifDirection: 'Accord, limité à 3 mois' });
  dir.synchroniser(s); tel.synchroniser(s);
  assert.deepEqual([tel.lire('decision', 'd-00000001').statut, tel.lire('decision', 'd-00000001').motifDirection], ['validee', 'Accord, limité à 3 mois']);
});

test('sécurité : appareil inconnu ou révoqué, usurpation d’auteur, pièce EBP modifiée, donnée invalide → refusés et tracés', () => {
  const { s, tel, dir } = monde();
  assert.equal(s.recevoir('jeton-inconnu', { id: 'x1', type: 'creer', entite: 'garage', uid: GARAGE.uid, auteur: NAZIM.uid, champs: GARAGE }).statut, 'refuse');
  assert.match(s.recevoir(dir.jeton, { id: 'x2', type: 'creer', entite: 'garage', uid: GARAGE.uid, auteur: NAZIM.uid, champs: { nom: 'X', statut: 'client' } }).motif, /titulaire/);
  tel.importer('pieceEbp', { uid: 'p-00000001', type: 'commande', no: 'CC-1', date: '2026-11-02', client: 'GARAGE FICTIF ALPHA', htCents: 100000, arrete: '2026-11-06' });
  tel.synchroniser(s);
  tel.modifier('pieceEbp', 'p-00000001', { htCents: 1 });
  tel.creer('garage', { uid: 'g-00000002', nom: '', statut: 'vip' });
  const b = tel.synchroniser(s);
  assert.equal(b.refusees, 2);
  assert.match(tel.alertes.map(a => a.motif).join(' | '), /EBP fait foi.*Donnée invalide/);
  assert.equal(tel.lire('pieceEbp', 'p-00000001').htCents, 100000, 'montant EBP intact');
  assert.equal(tel.lire('garage', 'g-00000002'), null, 'objet refusé retiré de l’appareil, motif conservé dans les alertes');
  dir.modifier('garage', GARAGE.uid, { notes: 'x' });
  s.revoquerAppareil(tel.jeton);
  assert.throws(() => tel.synchroniser(s), /révoqué/);
  const refus = s.audit.filter(e => e.statut === 'refuse');
  assert.ok(refus.length >= 4);
  assert.ok(refus.every(e => e.motif && e.le), 'chaque refus est daté et motivé');
  assert.throws(() => { 'use strict'; s.audit[0].statut = 'falsifié'; }, TypeError, 'journal non modifiable');
});

test('la direction ne voit que des copies : modifier sa copie locale ne change rien au serveur', () => {
  const { s, tel, dir } = monde();
  tel.creer('garage', GARAGE); tel.synchroniser(s); dir.synchroniser(s);
  dir.objets.garage[GARAGE.uid].valeurs.nom = 'MODIFIÉ EN LOCAL';
  assert.equal(s.etatObjet(tel.jeton, 'garage', GARAGE.uid).valeurs.nom, 'GARAGE FICTIF ALPHA');
});
