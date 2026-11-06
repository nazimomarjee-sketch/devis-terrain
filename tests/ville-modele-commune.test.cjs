'use strict';
// Ma Ville — étape 1 : modèle de commune (bureau/ville/modele-commune.js). DONNÉES FICTIVES uniquement.
// Exécution : node --test tests/ville-modele-commune.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../bureau/ville/modele-commune.js');

const ARRETE = '2026-11-06';
const SIRET_A = '12345678900011', SIRET_S = '98765432100022';
// Jeu fictif couvrant tous les cas des exigences du propriétaire.
const jeu = () => ({
  arrete: ARRETE,
  dates: { Terrain: '2026-11-05', Airtable: '2026-11-01', SIRENE: '2026-10-20' },
  terrain: [
    { id: 1, nom: 'CARROSSERIE FICTIVE A', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect', contactNom: 'M. Fictif', ent: { siret: SIRET_A, lu: '2026-10-12T09:00:00Z' } },
    { id: 2, nom: 'GARAGE FICTIF HOMONYME', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect' },
    { id: 3, nom: 'GARAGE FICTIF HOMONYME', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect' }, // homonyme même source
    { id: 4, nom: 'MÉCA FICTIVE TERRAIN', ville: 'Gonesse', cp: '95500', statutCrm: 'client' },        // client déclaré, absent d'EBP
    { id: 5, nom: 'CARROSSERIE FICTIVE PARTAGÉE', ville: 'Gonesse', cp: '95500', statutCrm: 'prospect', etape: 'Démo proposée', etapeDate: '2026-11-03' },
    { id: 6, nom: 'GARAGE SANS COMMUNE', ville: '', cp: '95190', statutCrm: 'prospect' },             // CP partagé → à classer
    { id: 7, nom: 'GARAGE FICTIF LYON', ville: 'Lyon', cp: '69001', statutCrm: 'prospect' },           // hors Île-de-France
    { id: 8, nom: '', ville: 'Gonesse', cp: '95500' },                                                 // sans nom → écarté
    { id: 9, nom: 'CARROSSERIE CHOISY FICTIVE', ville: 'Choisy', cp: '94600', statutCrm: 'prospect' }  // commune approximative
  ],
  clientsEbp: [
    { code: 'C001', nom: 'CARROSSERIE FICTIVE ACTIVE', ville: 'Goussainville', cp: '95190', statut: 'Actif', famille: 'Carrosserie', bloque: false },
    { code: 'C002', nom: 'GARAGE FICTIF ANCIEN', ville: 'Goussainville', cp: '95190', statut: 'Actif', famille: 'Mécan', bloque: false },
    { code: 'C003', nom: 'CARROSSERIE FICTIVE BLOQUÉE', ville: 'Gonesse', cp: '95500', statut: 'Bloqué', famille: 'Carrosserie', bloque: true },
    { code: 'C004', nom: 'CARROSSERIE FICTIVE PARTAGÉE', ville: 'Gonesse', cp: '95500', statut: 'Actif', famille: 'Carrosserie', bloque: false }, // même nom que tel:5
    { code: 'C005', nom: 'GARAGE SANS ACHAT', ville: 'Gonesse', cp: '95500', statut: 'Actif', famille: '', bloque: false },
    { code: 'C006', nom: 'CARROSSERIE EXCLUE MAIS CLIENTE', ville: 'Gonesse', cp: '95500', statut: 'Actif', famille: 'Carrosserie', bloque: false }
  ],
  piecesEbp: [
    { type: 'commande', no: 'CC-1', date: '2026-10-15', code: 'C001', client: 'CARROSSERIE FICTIVE ACTIVE', htCents: 120000 },
    { type: 'facture', no: 'FA-1', date: '2026-10-20', code: 'C001', client: 'CARROSSERIE FICTIVE ACTIVE', htCents: 120000 },
    { type: 'commande', no: 'CC-2', date: '2025-06-10', code: 'C002', client: 'GARAGE FICTIF ANCIEN', htCents: 30000 },
    { type: 'commande', no: 'CC-3', date: '2026-09-01', code: 'C003', client: 'CARROSSERIE FICTIVE BLOQUÉE', htCents: 50000 },
    { type: 'commande', no: 'CC-4', date: '2026-10-01', code: 'C004', client: 'CARROSSERIE FICTIVE PARTAGÉE', htCents: 40000 },
    { type: 'commande', no: 'CC-6', date: '2026-08-01', code: 'C006', client: 'CARROSSERIE EXCLUE MAIS CLIENTE', htCents: 40000 },
    { type: 'commande', no: 'CC-9', date: '2026-10-01', code: 'C009', client: 'CLIENT SEULEMENT DANS LES PIÈCES', htCents: 10000 }
  ],
  airtable: [
    { id: 'rec1', nom: 'GARAGE FICTIF DORMANT AIRTABLE', ville: 'Goussainville', cp: '95190', statut: 'dormant', majLe: '2026-09-15' },
    { id: 'rec2', nom: 'CONTRÔLE FICTIF EXCLU', ville: 'Goussainville', cp: '95190', statut: 'a_exclure' },
    { id: 'rec3', nom: 'CARROSSERIE EXCLUE MAIS CLIENTE', ville: 'Gonesse', cp: '95500', statut: 'a_exclure', codeEbp: 'C006' }, // code EBP certain
    { id: 'rec4', nom: 'GARAGE FICTIF À VÉRIFIER', ville: 'Gonesse', cp: '95500', statut: 'a_verifier' },
    { id: 'rec5', nom: 'CARROSSERIE FICTIVE AIRTABLE', ville: 'Goussainville', cp: '95190', statut: 'prospect', activite: 'carrosserie', contact: 'Gérant' }
  ],
  annuaire: [
    { siret: SIRET_A, nom: 'CARROSSERIE FICTIVE A (SIRENE)', ville: 'Goussainville', cp: '95190', naf: '45.20A' }, // même SIRET que tel:1
    { siret: SIRET_S, nom: 'ATELIER FICTIF SIRENE', ville: 'Goussainville', cp: '95190', naf: '45.20A' }
  ]
});
const tous = r => [...[...r.communes.values()].flatMap(c => c.etablissements), ...r.aClasser];
const parNom = (r, n) => tous(r).filter(e => e.nom.valeur === n);
const un = (r, n) => { const l = parNom(r, n); assert.equal(l.length, 1, n + ' : ' + l.length + ' établissement(s)'); return l[0]; };

test('1. aucune disparition : chaque fiche d’entrée finit dans une commune, « à classer » ou « écartées »', () => {
  const r = M.construire(jeu());
  assert.equal(r.bilan.conservation, true);
  assert.deepEqual(r.bilan.entrees, { EBP: 7, Airtable: 5, Terrain: 9, SIRENE: 2 }); // 6 clients + 1 client vu seulement dans les pièces
  const refs = tous(r).flatMap(e => e.sources.map(s => s.ref)).concat(r.ecartees.map(x => x.source === 'Terrain' ? 'tel:8' : x.ref));
  for (const ref of ['tel:1', 'tel:2', 'tel:3', 'tel:4', 'tel:5', 'tel:6', 'tel:7', 'tel:8', 'tel:9', 'ebp:C001', 'ebp:C002', 'ebp:C003', 'ebp:C004', 'ebp:C005', 'ebp:C006', 'ebp:C009',
    'air:rec1', 'air:rec2', 'air:rec3', 'air:rec4', 'air:rec5', 'sir:' + SIRET_A, 'sir:' + SIRET_S])
    assert.equal(refs.filter(x => x === ref).length, 1, ref + ' présent exactement une fois');
  assert.deepEqual(r.ecartees.map(x => x.motif), ['Nom absent']);
});

test('2. fusion seulement sur identifiant certain : SIRET (téléphone ↔ SIRENE), code EBP (Airtable ↔ EBP)', () => {
  const r = M.construire(jeu());
  const a = tous(r).find(e => e.siret && e.siret.valeur === SIRET_A);
  assert.deepEqual(a.sources.map(s => s.source).sort(), ['SIRENE', 'Terrain']);
  assert.equal(a.uid, 'siret:' + SIRET_A);
  const c6 = un(r, 'CARROSSERIE EXCLUE MAIS CLIENTE');
  assert.deepEqual(c6.sources.map(s => s.ref).sort(), ['air:rec3', 'ebp:C006']);
});

test('3. rapprochement incertain (même nom, même commune, sans identifiant commun) : PROPOSÉ, jamais appliqué', () => {
  const r = M.construire(jeu());
  assert.equal(parNom(r, 'CARROSSERIE FICTIVE PARTAGÉE').length, 2, 'les deux fiches restent séparées');
  const p = r.propositions.find(x => x.nom === 'CARROSSERIE FICTIVE PARTAGÉE');
  assert.equal(p.statut, 'a_confirmer');
  assert.deepEqual(p.refs.sort(), ['ebp:C004', 'tel:5']);
  // Validée par une personne → fusion.
  const v = M.construire({ ...jeu(), liaisonsValidees: [{ a: 'tel:5', b: 'ebp:C004', par: 'proprietaire', le: '2026-11-06' }] });
  const f = un(v, 'CARROSSERIE FICTIVE PARTAGÉE');
  assert.deepEqual(f.sources.map(s => s.ref).sort(), ['ebp:C004', 'tel:5']);
  assert.equal(f.categorie, 'client');
  assert.equal(f.etapeTerrain.valeur, 'Démo proposée', 'l’information terrain est conservée après fusion');
  assert.equal(v.propositions.some(x => x.nom === 'CARROSSERIE FICTIVE PARTAGÉE'), false);
});

test('4. homonymes d’une même source : ni fusionnés, ni proposés au rapprochement', () => {
  const r = M.construire(jeu());
  assert.equal(parNom(r, 'GARAGE FICTIF HOMONYME').length, 2);
  assert.equal(r.propositions.some(x => x.nom === 'GARAGE FICTIF HOMONYME'), false);
});

test('5. catégories distinctes : client, dormant (reste client), prospect, à qualifier, hors cible', () => {
  const r = M.construire(jeu());
  const actif = un(r, 'CARROSSERIE FICTIVE ACTIVE');
  assert.deepEqual([actif.categorie, actif.dormant, actif.segment, actif.qualification], ['client', null, 'client-carrosserie', 'confirme']);
  const ancien = un(r, 'GARAGE FICTIF ANCIEN');
  assert.equal(ancien.categorie, 'client');
  assert.equal(ancien.segment, 'client-mecanique');
  assert.equal(ancien.dormant.depuisMois, 16);
  assert.match(ancien.dormant.motif, /2025-06-10/);
  const sansAchat = un(r, 'GARAGE SANS ACHAT');
  assert.equal(sansAchat.categorie, 'client'); assert.equal(sansAchat.dormant.depuisJours, null, 'durée inconnue : jamais devinée');
  const dormAir = un(r, 'GARAGE FICTIF DORMANT AIRTABLE');
  assert.deepEqual([dormAir.categorie, dormAir.confirmeEbp, dormAir.qualification, dormAir.dormant.source], ['client', false, 'a_verifier', 'Airtable']);
  assert.equal(un(r, 'CONTRÔLE FICTIF EXCLU').categorie, 'hors_cible');
  const sir = un(r, 'ATELIER FICTIF SIRENE');
  assert.deepEqual([sir.categorie, sir.qualification], ['a_qualifier', 'probable'], 'SIRENE seul : jamais une carrosserie confirmée');
  assert.deepEqual([un(r, 'GARAGE FICTIF À VÉRIFIER').categorie, un(r, 'GARAGE FICTIF À VÉRIFIER').qualification], ['a_qualifier', 'a_verifier']);
  assert.equal(un(r, 'CARROSSERIE FICTIVE AIRTABLE').segment, 'prospect-carrosserie');
});

test('6. conflits signalés, jamais tranchés en silence', () => {
  const r = M.construire(jeu());
  const c6 = un(r, 'CARROSSERIE EXCLUE MAIS CLIENTE');
  assert.equal(c6.categorie, 'client', 'un client EBP n’est jamais effacé par « hors cible »');
  assert.match(c6.avertissements.join(' '), /hors cible.*client EBP/);
  const tel4 = un(r, 'MÉCA FICTIVE TERRAIN');
  assert.deepEqual([tel4.categorie, tel4.qualification, tel4.confirmeEbp], ['client', 'a_verifier', false]);
  assert.match(tel4.avertissements.join(' '), /non retrouvé dans EBP/);
  assert.ok(un(r, 'CARROSSERIE FICTIVE BLOQUÉE').alertes.some(a => a.type === 'compte_bloque' && a.source === 'EBP'));
});

test('7. comptes : total = clients + prospects + à qualifier + hors cible ; les dormants comptent parmi les clients', () => {
  const r = M.construire(jeu());
  for (const c of r.communes.values()) {
    const k = c.comptes;
    assert.equal(k.total, k.clients + k.prospects + k.aQualifier + k.horsCible, c.commune);
    assert.equal(k.total, c.etablissements.length);
    assert.ok(k.dontDormants <= k.clients);
  }
  const g = M.commune(r, '95280').comptes; // Goussainville
  assert.deepEqual([g.clients, g.dontDormants, g.dontClientsNonConfirmesEbp, g.horsCible, g.aQualifier], [3, 2, 1, 1, 1]);
});

test('8. source et date conservées ; rien d’inventé (pas de CA, suivi vide)', () => {
  const r = M.construire(jeu());
  const a = tous(r).find(e => e.siret && e.siret.valeur === SIRET_A);
  assert.deepEqual(a.siret, { valeur: SIRET_A, source: 'Terrain', date: '2026-10-12' });
  assert.deepEqual(a.nom, { valeur: 'CARROSSERIE FICTIVE A', source: 'Terrain', date: '2026-11-05' });
  assert.deepEqual(a.interlocuteur, { valeur: true, source: 'Terrain', date: '2026-11-05' });
  const actif = un(r, 'CARROSSERIE FICTIVE ACTIVE');
  assert.deepEqual(actif.dernierAchat, { type: 'facture', no: 'FA-1', date: '2026-10-20', source: 'EBP', exportDu: ARRETE });
  assert.equal(un(r, 'GARAGE FICTIF DORMANT AIRTABLE').sources[0].date, '2026-09-15', 'date de la fiche Airtable');
  for (const e of tous(r)) {
    assert.deepEqual(e.suivi, { dernierPointage: null, obstaclesOuverts: null, aideDirection: null });
    assert.equal('ca' in e || 'caCents' in e, false, 'aucun chiffre d’affaires calculé ici');
  }
  assert.equal(un(r, 'MÉCA FICTIVE TERRAIN').segment, 'client-mecanique', 'activité lue dans le nom : signalée probable');
  assert.equal(un(r, 'MÉCA FICTIVE TERRAIN').activite.probable, true);
  assert.equal(parNom(r, 'GARAGE FICTIF HOMONYME')[0].segment, null, 'activité inconnue : pas de couleur devinée');
});

test('9. rattachement à la commune : sûr, approximatif ou « à classer » avec motif', () => {
  const r = M.construire(jeu());
  assert.equal(un(r, 'CARROSSERIE CHOISY FICTIVE').commune, 'Choisy-le-Roi');
  assert.equal(un(r, 'CARROSSERIE CHOISY FICTIVE').rattachement.niveau, 'cp');
  const ac = r.aClasser.map(e => [e.nom.valeur, e.rattachement.niveau]);
  assert.deepEqual(ac.sort(), [['CLIENT SEULEMENT DANS LES PIÈCES', 'non_classe'], ['GARAGE FICTIF LYON', 'hors_idf'], ['GARAGE SANS COMMUNE', 'cp']]);
  assert.equal(un(r, 'CLIENT SEULEMENT DANS LES PIÈCES').categorie, 'client', 'client EBP vu seulement dans les pièces : conservé');
});

test('10. liste ordonnée et numérotée ; résultat identique quel que soit l’ordre des fichiers', () => {
  const r = M.construire(jeu());
  for (const c of r.communes.values()) {
    assert.deepEqual(c.etablissements.map(e => e.numero), c.etablissements.map((_, i) => i + 1));
    const cats = c.etablissements.map(e => e.categorie), ordre = ['client', 'prospect', 'a_qualifier', 'hors_cible'];
    assert.deepEqual(cats, [...cats].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b)), c.commune + ' : clients d’abord, hors cible en dernier');
  }
  const j = jeu(); for (const k of ['terrain', 'clientsEbp', 'piecesEbp', 'airtable', 'annuaire']) j[k].reverse();
  const r2 = M.construire(j), resume = x => [...x.communes.values()].map(c => [c.insee, c.etablissements.map(e => e.uid + '#' + e.numero)]).sort();
  assert.deepEqual(resume(r2), resume(r));
});

test('11. lecture seule : les données d’entrée ne sont jamais modifiées', () => {
  const j = jeu(), copie = JSON.parse(JSON.stringify(j));
  M.construire({ ...j, liaisonsValidees: [{ a: 'tel:5', b: 'ebp:C004' }] });
  assert.deepEqual(j, copie);
});

test('12. liaison validée vers une fiche absente : signalée, aucune fusion', () => {
  const r = M.construire({ ...jeu(), liaisonsValidees: [{ a: 'tel:5', b: 'ebp:INCONNU' }] });
  assert.equal(r.conflits[0].type, 'liaison_inconnue');
  assert.equal(parNom(r, 'CARROSSERIE FICTIVE PARTAGÉE').length, 2);
});

test('13. arrêté EBP obligatoire (les dates des chiffres ne sont jamais supposées)', () => {
  assert.throws(() => M.construire({ ...jeu(), arrete: '' }), /arrêté/);
});

test('14. volume : 1 500 établissements fictifs dont 200 dans une même commune, en moins d’une seconde', () => {
  const terrain = Array.from({ length: 1300 }, (_, i) => ({ id: 1000 + i, nom: 'GARAGE FICTIF ' + i, ville: ['Goussainville', 'Gonesse', 'Sarcelles', 'Argenteuil', 'Créteil'][i % 5], cp: ['95190', '95500', '95200', '95100', '94000'][i % 5], statutCrm: 'prospect' }));
  const annuaire = Array.from({ length: 200 }, (_, i) => ({ siret: String(10000000000000 + i), nom: 'ATELIER FICTIF ' + i, ville: 'Cergy', cp: '95000' }));
  const t0 = performance.now(); const r = M.construire({ arrete: ARRETE, terrain, annuaire }); const ms = performance.now() - t0;
  assert.equal(r.bilan.etablissements, 1500); assert.equal(r.bilan.conservation, true);
  assert.equal(M.commune(r, '95127').etablissements.length, 200); // Cergy
  assert.ok(ms < 1000, ms.toFixed(0) + ' ms');
});
