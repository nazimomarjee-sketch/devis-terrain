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

test('5. catégories distinctes : client (inactif ou à vérifier, reste client), prospect, à qualifier, hors cible', () => {
  const r = M.construire(jeu());
  const actif = un(r, 'CARROSSERIE FICTIVE ACTIVE');
  assert.deepEqual([actif.categorie, actif.dormant, actif.achat.niveau, actif.segment, actif.qualification], ['client', null, 'actif', 'client-carrosserie', 'confirme']);
  const ancien = un(r, 'GARAGE FICTIF ANCIEN');
  assert.deepEqual([ancien.categorie, ancien.segment, ancien.achat.niveau, ancien.dormant.niveau, ancien.dormant.depuisMois], ['client', 'client-mecanique', 'inactif', 'inactif', 16]);
  const sansAchat = un(r, 'GARAGE SANS ACHAT');
  assert.deepEqual([sansAchat.categorie, sansAchat.achat.niveau, sansAchat.dormant], ['client', 'a_verifier', null], 'aucune commande : « à vérifier », jamais « dormant » affirmé');
  const dormAir = un(r, 'GARAGE FICTIF DORMANT AIRTABLE');
  assert.deepEqual([dormAir.categorie, dormAir.confirmeEbp, dormAir.qualification, dormAir.achat.niveau, dormAir.achat.source, dormAir.dormant], ['client', false, 'a_verifier', 'a_verifier', 'Airtable', null]);
  assert.deepEqual(dormAir.statutsHistoriques, [{ valeur: 'dormant', source: 'Airtable', date: '2026-09-15', ref: 'air:rec1' }], 'statut Airtable conservé avec sa source');
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
  assert.deepEqual([g.clients, g.dontDormants, g.dontClientsNonConfirmesEbp, g.horsCible, g.aQualifier], [3, 1, 1, 1, 1]);
  assert.deepEqual(g.signauxAchat, { reachat: 0, potentiellementDormant: 0, inactif: 1, aVerifier: 1, ralentissent: 0 });
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

// ---------- Signal d'achat (règle du 06/11/2026 : 60 j réachat · 90 j potentiellement dormant · 12 mois inactif) ----------
const jour = n => new Date(Date.UTC(2026, 10, 6) - n * 86400000).toISOString().slice(0, 10); // n jours avant l'arrêté
const client = (code, ilYA) => ({ clientsEbp: [{ code, nom: 'CLIENT FICTIF ' + code, ville: 'Gonesse', cp: '95500', statut: 'Actif', famille: 'Carrosserie' }],
  piecesEbp: ilYA.map((n, i) => ({ type: 'commande', no: code + '-' + i, date: jour(n), code, client: 'CLIENT FICTIF ' + code, htCents: 10000 })) });
function signal(cas, { historique = 400, parametres } = {}) {
  const cl = [], pc = [];
  for (const [code, ilYA] of cas) { const x = client(code, ilYA); cl.push(...x.clientsEbp); pc.push(...x.piecesEbp); }
  if (historique) pc.push({ type: 'facture', no: 'ANCIEN', date: jour(historique), code: 'Z999', client: 'CLIENT FICTIF ANCIEN', htCents: 100 }); // couverture de l'export
  const r = M.construire({ arrete: ARRETE, clientsEbp: cl, piecesEbp: pc, parametres });
  return Object.fromEntries(cas.map(([code]) => [code, un(r, 'CLIENT FICTIF ' + code).achat]));
}

test('15. seuils de départ (rythme inconnu, historique complet) : 60 j réachat · 90 j potentiellement dormant · 12 mois inactif', () => {
  const s = signal([['A', [59]], ['B', [60]], ['C', [89]], ['D', [90]], ['E', [364]], ['F', [365]]]);
  assert.deepEqual(Object.values(s).map(x => x.niveau), ['actif', 'reachat', 'reachat', 'potentiellement_dormant', 'potentiellement_dormant', 'inactif']);
  assert.equal(s.B.base, 'seuils'); assert.equal(s.F.base, 'seuil');
});

test('16. rythme habituel connu (≥ 3 commandes) : le signal suit le rythme du client', () => {
  const s = signal([['RAPIDE', [28, 42, 56]], ['LENT_OK', [100, 220, 340]], ['LENT_RETARD', [200, 320, 440]], ['LENT_PERDU', [250, 370, 490]]], { historique: 500 });
  assert.deepEqual([s.RAPIDE.rythmeJours, s.RAPIDE.niveau], [14, 'reachat'], 'commande toutes les 2 semaines : alerte dès 21 j, sans attendre 60 j');
  assert.deepEqual([s.LENT_OK.rythmeJours, s.LENT_OK.niveau], [120, 'actif'], 'commande tous les 4 mois : 100 j sans commande reste normal');
  assert.equal(s.LENT_RETARD.niveau, 'reachat');
  assert.equal(s.LENT_PERDU.niveau, 'potentiellement_dormant');
  assert.match(s.LENT_OK.motif, /tous les 120 j/);
});

test('17. historique incomplet : « à vérifier » plutôt que « dormant » affirmé', () => {
  const s = signal([['X', [95]], ['Y', [65]]], { historique: 0 }); // export couvrant ~95 jours seulement
  assert.equal(s.X.niveau, 'a_verifier');
  assert.match(s.X.motif, /historique incomplet/);
  assert.equal(s.Y.niveau, 'reachat', 'le réachat reste signalé : c’est déjà une alerte « à vérifier »');
});

test('18. statut Airtable conservé, jamais écrasé : Airtable « dormant » + commande EBP récente → les deux gardés, conflit signalé', () => {
  const r = M.construire({ arrete: ARRETE, ...client('K1', [10]), airtable: [{ id: 'recK', nom: 'CLIENT FICTIF K1', ville: 'Gonesse', cp: '95500', statut: 'dormant', codeEbp: 'K1', majLe: '2026-08-01' }] });
  const e = un(r, 'CLIENT FICTIF K1');
  assert.equal(e.achat.niveau, 'actif');
  assert.deepEqual(e.statutsHistoriques.map(s => [s.valeur, s.source, s.date]), [['dormant', 'Airtable', '2026-08-01']]);
  assert.match(e.avertissements.join(' '), /Airtable : dormant ; EBP : commande récente/);
});

test('19. ralentissement repéré pour l’Agent Business Developer (dernier écart bien plus long que d’habitude)', () => {
  const s = signal([['R', [10, 100, 130, 160, 190]], ['N', [10, 40, 70, 100, 130]]], { historique: 500 });
  assert.equal(s.R.ralentit, true); assert.equal(s.N.ralentit, false);
});

test('20. seuils réglables (valeurs de départ, pas des vérités absolues)', () => {
  const s = signal([['P', [50]]], { parametres: { seuils: { reachat: 45 } } });
  assert.equal(s.P.niveau, 'reachat');
});

// ---------- Étape 3 : compte ODICOLOR (EN COMPTE | SANS COMPTE | À VÉRIFIER), filtre indépendant des 4 couleurs ----------
const F = require('../bureau/ville/fictif-idf.js');
const R = () => M.construire(F);
const nomme = (r, n) => [...r.communes.values(), { etablissements: r.aClasser }].flatMap(c => c.etablissements).filter(e => e.nom.valeur === n);

test('21. EN COMPTE = code client EBP, dormants et comptes bloqués compris, alertes conservées', () => {
  const r = R(), [a] = nomme(r, 'CARROSSERIE FICTIVE A'), [f] = nomme(r, 'CARROSSERIE FICTIVE F');
  assert.equal(a.compte.statut, 'en_compte'); assert.ok(a.dormant, 'le dormant reste en compte');
  assert.equal(f.compte.statut, 'en_compte'); assert.deepEqual(f.alertes.map(x => x.type), ['compte_bloque'], 'le compte bloqué garde son alerte');
  assert.equal(a.segment, 'client-carrosserie', 'la couleur ne change pas');
  const k = M.commune(r, '95280').comptes.compte;
  assert.equal(k.enCompteDormants, 1); assert.equal(k.enCompteBloques, 1);
});

test('22. SANS COMPTE seulement avec une vérification enregistrée (auteur + date) ; jamais par défaut', () => {
  const r = R(), [b] = nomme(r, 'CARROSSERIE FICTIVE B'), [d] = nomme(r, 'CARROSSERIE FICTIVE D'), [s1] = nomme(r, 'ÉTABLISSEMENT SIRENE 1');
  assert.equal(b.compte.statut, 'sans_compte'); assert.equal(b.compte.date, '2026-11-04'); assert.match(b.compte.source, /Vérification EBP/);
  assert.equal(s1.compte.statut, 'sans_compte', 'vérification par SIRET');
  assert.equal(d.compte.statut, 'a_verifier', 'vérification sans auteur : refusée'); assert.match(d.compte.motif, /non vérifiée/);
  assert.equal(nomme(r, 'GARAGE FICTIF SANS INDICE')[0].compte.statut, 'a_verifier', 'vérification sans date : refusée');
  const sansVerif = M.construire(Object.assign({}, F, { verificationsCompte: [] }));
  const tous = [...sansVerif.communes.values()].flatMap(c => c.etablissements);
  assert.equal(tous.filter(e => e.compte.statut === 'sans_compte').length, 0, 'sans vérification, personne n’est « sans compte »');
});

test('23. ressemblance de nom : n’annule pas une absence vérifiée (alerte à examiner) ; sans vérification → À VÉRIFIER ; client déclaré absent d’EBP → À VÉRIFIER', () => {
  const r = R(), g = nomme(r, 'CARROSSERIE FICTIVE G');
  assert.equal(g.length, 2, 'homonymes non fusionnés');
  assert.deepEqual(g.map(e => e.compte.statut).sort(), ['en_compte', 'sans_compte'], 'la vérification humaine est conservée');
  assert.match(g.find(e => e.compte.statut === 'sans_compte').compte.alerte, /même nom dans la même commune.*à examiner/);
  const sansVerif = M.construire(Object.assign({}, F, { verificationsCompte: [] }));
  const g2 = [...sansVerif.communes.values()].flatMap(c => c.etablissements).filter(e => e.nom.valeur === 'CARROSSERIE FICTIVE G');
  assert.match(g2.find(e => e.compte.statut === 'a_verifier').compte.motif, /Rapprochement EBP incertain/);
  const [c] = nomme(r, 'CARROSSERIE FICTIVE DÉCLARÉE CLIENTE');
  assert.equal(c.compte.statut, 'a_verifier'); assert.match(c.compte.motif, /non retrouvé dans EBP/);
});

test('24. compteurs sans doublon : chaque établissement dans une seule case, commune → département → Île-de-France', () => {
  const r = R(), a = M.agreger(r);
  for (const c of r.communes.values()) { const k = c.comptes.compte; assert.equal(k.en_compte + k.sans_compte + k.a_verifier, c.comptes.total, c.commune); }
  const somme = (l, k) => l.reduce((n, x) => n + x[k], 0);
  for (const k of ['total', 'en_compte', 'sans_compte', 'a_verifier']) {
    assert.equal(somme(a.parDep, k), a.idf[k], 'départements → IDF : ' + k);
    assert.equal(somme(a.parCommune, k), a.idf[k], 'communes → IDF : ' + k);
  }
  assert.equal(a.idf.total + a.aClasser.total, r.bilan.etablissements, 'à classer comptés à part, aucun oubli');
  assert.equal(a.aClasser.en_compte, 2, 'clients EBP sans adresse (connus seulement par leurs pièces) : en compte, à classer');
  const uids = [...r.communes.values()].flatMap(c => c.etablissements.map(e => e.uid)).concat(r.aClasser.map(e => e.uid));
  assert.equal(new Set(uids).size, uids.length, 'aucun établissement compté deux fois');
  assert.ok(r.bilan.conservation);
});

test('25. recherche : commune, code postal, département, nom de garage, SIRET', () => {
  const r = R();
  assert.deepEqual(M.rechercher(r, 'sarcel').communes.map(c => c.insee), ['95585']);
  assert.deepEqual(M.rechercher(r, '95585').communes.map(c => c.commune), ['Sarcelles']);
  assert.deepEqual(M.rechercher(r, '93').departements.map(d => d.dep), ['93']);
  assert.deepEqual(M.rechercher(r, 'val d oise').departements.map(d => d.dep), ['95']);
  assert.deepEqual(M.rechercher(r, '44444444400317').etablissements.map(e => e.nom.valeur), ['ATELIER FICTIF SARCELLES 318']);
  const q = M.rechercher(r, 'atelier fictif sarcelles');
  assert.equal(q.nbEtablissements, 320); assert.equal(q.etablissements.length, 8, 'résultats limités, total annoncé');
  assert.deepEqual(M.rechercher(r, 'x'), { communes: [], departements: [], etablissements: [] });
});
