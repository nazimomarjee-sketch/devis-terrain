'use strict';
// Intégration TÉLÉPHONE → BUREAU sur un gros volume : le VRAI code du téléphone (sauvegarde-locale.js) fabrique une sauvegarde .odicolor de 1 500 garages
// d'Île-de-France ; le Bureau la relit (bureau/lecture-sauvegarde.js), la classe par commune et construit le modèle Ma Ville avec des exports EBP fictifs.
// DONNÉES FICTIVES (noms, SIRET et codes inventés). Exécution : node --test tests/integration-telephone-bureau.test.cjs
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../sauvegarde-locale.js');
const LS = require('../bureau/lecture-sauvegarde.js');
const MC = require('../bureau/ville/modele-commune.js');
const COMMUNES = require('../bureau/communes-idf.js');

const N = 1500, DEPS = ['95', '94', '91', '77', '93'];
const communes = COMMUNES.filter(c => DEPS.includes(c[1]) && c[2]).map(c => ({ nom: c[0], dep: c[1], cp: c[2].split(' ')[0], insee: c[3], parent: c[4] }));
let fichier, clients, lu, t = {};

before(async () => {
  clients = Array.from({ length: N }, (_, i) => {
    const c = communes[(i * 7) % communes.length];
    return { id: i + 1, nom: 'GARAGE INTEGRATION ' + String(i + 1).padStart(4, '0'), tel: '', ville: c.nom, villeProspection: c.nom, cp: c.cp, statutCrm: i % 5 === 0 ? 'client' : 'prospect',
      contactNom: i % 3 === 0 ? 'CONTACT FICTIF' : '', etape: i % 11 === 0 ? 'Visite à planifier' : '', etapeDate: i % 11 === 0 ? '2026-11-20' : '',
      ent: i % 7 === 0 ? { siret: String(70000000000000 + i), lu: '2026-10-12T09:00:00Z' } : undefined };
  });
  const stores = { articles: [], clients, devis: [], meta: [['settings', { societe: 'ODICOLOR — INTEGRATION', vendeur: 'TEST UNIQUEMENT' }]], recuperations: [] };
  const { file } = await B.encode(stores); fichier = file;
});

test('1. le Bureau relit sans aucune perte les 1 500 garages fabriqués par le code du téléphone', async () => {
  const d0 = Date.now(); lu = await LS.lire(fichier); t.lecture = Date.now() - d0;
  assert.equal(lu.telephone.clients.length, N); assert.equal(lu.garages.length, N);
  assert.equal(new Set(lu.telephone.clients.map(c => c.id)).size, N, 'identifiants du téléphone uniques et conservés');
  assert.deepEqual(lu.telephone.clients.map(c => [c.id, c.nom, c.cp, c.statutCrm]), clients.map(c => [c.id, c.nom, c.cp, c.statutCrm]), 'mêmes garages, même ordre, mêmes statuts');
  assert.equal(lu.rapport.lus, N); assert.equal(lu.rapport.aVerifier + lu.rapport.hors + lu.rapport.nonClasses + lu.rapport.classes, N, 'chaque garage est classé, à vérifier ou écarté avec son motif');
  assert.ok(lu.rapport.classes > N * 0.95, 'communes et codes postaux officiels : ' + lu.rapport.classes + ' classés sur ' + N);
});

test('2. le modèle Ma Ville place chaque garage (téléphone + EBP fictif) une seule fois, sans doublon ni perte, avec compteurs cohérents', () => {
  const ebp = clients.filter((_, i) => i % 5 === 0).slice(0, 200).map((c, k) => ({ code: 'EBP' + String(k).padStart(4, '0'), nom: c.nom, ville: c.ville, cp: c.cp, statut: 'Actif', famille: 'Carrosserie' }));
  const liaisons = clients.filter((_, i) => i % 5 === 0).slice(0, 200).map((c, k) => ({ a: 'tel:' + c.id, b: 'ebp:EBP' + String(k).padStart(4, '0'), par: 'Intégration', date: '2026-11-08' }));
  const d0 = Date.now();
  const m = MC.construire({ arrete: '2026-11-08', terrain: lu.telephone.clients, clientsEbp: ebp, liaisonsValidees: liaisons, dates: { Terrain: '2026-11-05' } }); t.modele = Date.now() - d0;
  assert.ok(m.bilan.conservation, 'chaque fiche d’entrée se retrouve dans une commune, « à classer » ou écartée');
  const tous = [...m.communes.values()].flatMap(c => c.etablissements).concat(m.aClasser);
  assert.equal(new Set(tous.map(e => e.uid)).size, tous.length, 'aucun établissement compté deux fois');
  assert.equal(tous.length, N, '1 500 garages du téléphone, les 200 clients EBP reliés par liaison validée ne s’y ajoutent pas');
  for (const c of m.communes.values()) { const k = c.comptes.compte; assert.equal(k.en_compte + k.sans_compte + k.a_verifier, c.comptes.total, c.commune); }
  assert.equal(tous.filter(e => e.compte.statut === 'en_compte').length, 200);
  assert.ok(tous.every(e => e.portee === 'mes_garages'));
  const dep = MC.agreger(m).idf; assert.equal(dep.total + MC.agreger(m).aClasser.total, N);
});

test('3. performance : lecture de 1 500 garages et construction du modèle en quelques secondes au plus', () => {
  assert.ok(t.lecture < 5000, 'lecture ' + t.lecture + ' ms'); assert.ok(t.modele < 3000, 'modèle ' + t.modele + ' ms');
});
