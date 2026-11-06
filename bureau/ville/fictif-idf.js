/* DONNÉES FICTIVES Île-de-France pour l'étape 3 (vue Commune dans le Bureau, sélecteur EN COMPTE | SANS COMPTE).
   Aucun garage réel : noms, codes EBP, SIRET et vérifications sont inventés. Repart de FICTIF_95 sans le modifier. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const B = node ? require('./fictif-95.js') : racine.FICTIF_95;
  const J = n => new Date(Date.UTC(2026, 10, 6) - n * 86400000).toISOString().slice(0, 10);
  const fac = (no, date, code, client, htCents) => ({ type: 'facture', no, date, code, client, htCents, lignesSource: 1 });
  const cmd = (code, nom, ilYA) => ilYA.map((n, i) => ({ type: 'commande', no: code + '-' + i, date: J(n), code, client: nom, htCents: 40000 }));
  const verif = (ref, date) => ({ ref, resultat: 'aucun_compte', par: 'Vérificateur fictif', date, source: 'Vérification EBP (fictive)' });

  // Autres départements (priorités 95, 94, 91, 77, 93 sans ordre ; 75, 78, 92 secondaires) : quelques établissements chacun.
  const villes = [['Saint-Denis', '93200'], ['Créteil', '94000'], ['Évry-Courcouronnes', '91000'], ['Meaux', '77100'], ['Versailles', '78000'], ['Nanterre', '92000']];
  const terrain = [
    ...B.terrain,
    // Même nom qu'un client EBP de Goussainville : rapprochement incertain → jamais « sans compte », même avec une vérification.
    { id: 6, nom: 'CARROSSERIE FICTIVE G', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect' },
    // Déclaré client au téléphone, absent d'EBP → à vérifier.
    { id: 7, nom: 'CARROSSERIE FICTIVE DÉCLARÉE CLIENTE', ville: 'Goussainville', cp: '95190', statutCrm: 'client' },
    ...villes.flatMap(([v, cp], i) => [
      { id: 200 + i * 10, nom: 'CARROSSERIE FICTIVE ' + v.toUpperCase(), ville: v, cp, statutCrm: 'prospect' },
      { id: 201 + i * 10, nom: 'MÉCA FICTIVE ' + v.toUpperCase(), ville: v, cp, statutCrm: 'prospect' }]),
    ...Array.from({ length: 12 }, (_, i) => ({ id: 300 + i, nom: 'CARROSSERIE FICTIVE SARCELLES ' + String(i + 1).padStart(3, '0'), ville: 'Sarcelles', cp: '95200', statutCrm: 'prospect' }))
  ];
  // Représentant (portefeuille) fictif : sert à tester le CA personnel / CA de l'agence.
  const REP = { F01: 'REP-A', F02: 'REP-A', F03: 'REP-B', F04: 'REP-A', F05: 'REP-B' };
  const clientsEbp = [
    ...B.clientsEbp.map(c => Object.assign({}, c, { commercial: REP[c.code] || '' })),
    ...villes.map(([v, cp], i) => ({ code: 'G0' + i, nom: 'CLIENT FICTIF ' + v.toUpperCase(), ville: v, cp, statut: 'Actif', famille: i % 2 ? 'Mécan' : 'Carrosserie', commercial: i % 2 ? 'REP-B' : 'REP-A' })),
    { code: 'S01', nom: 'CARROSSERIE FICTIVE SARCELLES CLIENTE', ville: 'Sarcelles', cp: '95200', statut: 'Actif', famille: 'Carrosserie', commercial: 'REP-A' },
    { code: 'S02', nom: 'MÉCA FICTIVE SARCELLES BLOQUÉE', ville: 'Sarcelles', cp: '95200', statut: 'Bloqué', famille: 'Mécan', bloque: true }
  ];
  const piecesEbp = [
    ...B.piecesEbp,
    ...villes.flatMap(([v], i) => cmd('G0' + i, 'CLIENT FICTIF ' + v.toUpperCase(), [5 + i, 35 + i, 65 + i])),
    ...cmd('S01', 'CARROSSERIE FICTIVE SARCELLES CLIENTE', [100, 130, 160, 190]),
    ...cmd('S02', 'MÉCA FICTIVE SARCELLES BLOQUÉE', [15]),
    // Client présent seulement dans les pièces EBP (commune inconnue) → « à classer », jamais perdu.
    ...cmd('Z99', 'CLIENT FICTIF SANS ADRESSE', [12]),
    // CA facturé de novembre 2026 (fictif). Seules les factures comptent ; commandes, devis et encaissements jamais.
    fac('FA-1001', '2026-11-03', 'F02', 'MÉCA FICTIVE E', 125000),
    fac('FA-1001', '2026-11-03', 'F02', 'MÉCA FICTIVE E', 125000),     // même facture importée deux fois → comptée une fois
    fac('FA-1002', '2026-11-02', 'F03', 'CARROSSERIE FICTIVE F', 48000),
    ...villes.map(([v], i) => fac('FA-20' + i, '2026-11-0' + (2 + i % 4), 'G0' + i, 'CLIENT FICTIF ' + v.toUpperCase(), 60000 + i * 10000)),
    fac('FA-3001', '2026-11-05', 'S01', 'CARROSSERIE FICTIVE SARCELLES CLIENTE', 90000),
    fac('FA-9901', '2026-11-04', 'Z99', 'CLIENT FICTIF SANS ADRESSE', 30000),        // client sans commune → non attribué
    fac('FA-9902', '2026-11-04', 'X-INCONNU', 'CLIENT FICTIF INCONNU', 15000),       // code inconnu → non attribué
    fac('FA-9903', '2026-11-05', '', 'CARROSSERIE FICTIVE B', 20000),                // sans code : jamais rapproché par le nom
    fac('FA-0999', '2026-10-28', 'F02', 'MÉCA FICTIVE E', 70000),                    // mois précédent : hors période
    { type: 'commande', no: 'CDE-NOV', date: '2026-11-05', code: 'F02', client: 'MÉCA FICTIVE E', htCents: 99900 },     // commande : jamais du CA facturé
    { type: 'devis', no: 'DEV-NOV', date: '2026-11-05', code: 'F04', client: 'CARROSSERIE FICTIVE G', htCents: 50000 }  // devis : idem
  ];
  const avoirsEbp = [
    { no: 'AV-1002', date: '2026-11-04', code: 'F03', client: 'CARROSSERIE FICTIVE F', htCents: -8000, origine: 'FA-1002' }, // déduit à sa date
    { no: 'AV-0901', date: '2026-10-30', code: 'F02', client: 'MÉCA FICTIVE E', htCents: -5000 },                            // mois précédent
    { no: 'AV-ILLISIBLE', date: null, code: 'F02', client: 'MÉCA FICTIVE E', htCents: -1000 }                                // signalé, non déduit
  ];
  // Commune dense : plusieurs centaines d'établissements (annuaire fictif).
  const annuaire = [
    ...B.annuaire,
    ...Array.from({ length: 320 }, (_, i) => ({ siret: String(44444444400000 + i), nom: 'ATELIER FICTIF SARCELLES ' + String(i + 1).padStart(3, '0'), ville: 'Sarcelles', cp: '95200', naf: '45.20A' }))
  ];
  const verificationsCompte = [
    verif('tel:1', '2026-11-04'), verif('tel:2', '2026-11-04'), verif('tel:5', '2026-11-03'), verif('air:recX', '2026-11-02'),
    verif('tel:6', '2026-11-04'),           // rapprochement incertain : la vérification ne suffit pas
    verif('tel:7', '2026-11-04'),           // déclaré client : contradiction → à vérifier
    verif('tel:100', '2026-11-02'), verif('tel:101', '2026-11-02'),
    ...villes.map((_, i) => verif('tel:' + (200 + i * 10), '2026-11-01')),
    ...Array.from({ length: 6 }, (_, i) => verif('tel:' + (300 + i), '2026-11-05')),
    { siret: '22222222200000', resultat: 'aucun_compte', par: 'Vérificateur fictif', date: '2026-11-05', source: 'Vérification EBP (fictive)' },
    // Vérifications refusées (sans auteur, sans date) : ne doivent rien changer.
    { ref: 'tel:3', resultat: 'aucun_compte', date: '2026-11-05' }, { ref: 'tel:4', resultat: 'aucun_compte', par: 'X' }
  ];
  // Garages de démo du Bureau (L0.garagesDemo, fictifs) ajoutés au modèle pour que la vue Commune montre les mêmes garages que la
  // Ville de démo. Chaque client de démo reçoit un compte EBP fictif, relié par une liaison « validée » (fictive) : aucun doublon.
  function avecDemoBureau(garages) {
    const t = [], c = [], p = [], l = [];
    (garages || []).filter(g => g && g.source === 'demo').forEach((g, i) => {
      const metier = /mecanique/.test(g.segment || '') ? 'Mécanique' : /carrosserie/.test(g.segment || '') ? 'Carrosserie' : '';
      const client = ['actif', 'dormant', 'risque', 'perdu'].includes(g.statut);
      t.push({ id: g.id, nom: g.nom, ville: g.commune || g.ville, cp: g.cp, statutCrm: client ? 'client' : 'prospect', activite: metier });
      if (!client) return;
      const code = 'DEMO-' + g.id;
      c.push({ code, nom: g.nom, ville: g.commune || g.ville, cp: g.cp, statut: 'Actif', famille: metier === 'Mécanique' ? 'Mécan' : metier, bloque: g.statut === 'risque', commercial: i % 3 ? 'REP-A' : 'REP-B' });
      p.push(...cmd(code, g.nom, g.statut === 'actif' ? [6 + i % 20, 36 + i % 20, 66 + i % 20] : [100 + i % 30, 130 + i % 30, 160 + i % 30, 190 + i % 30]));
      if (g.statut === 'actif' && g.caMois) p.push(fac('FA-' + code, '2026-11-0' + (1 + i % 5), code, g.nom, Math.round(g.caMois * 100))); // facture fictive du mois
      l.push({ a: 'tel:' + g.id, b: 'ebp:' + code, par: 'Démo', date: '2026-11-06' });
    });
    const F = racine.FICTIF_IDF;
    return Object.assign({}, F, { terrain: F.terrain.concat(t), clientsEbp: F.clientsEbp.concat(c), piecesEbp: F.piecesEbp.concat(p), liaisonsValidees: (F.liaisonsValidees || []).concat(l) });
  }
  racine.FICTIF_IDF = Object.assign({}, B, { terrain, clientsEbp, piecesEbp, avoirsEbp, annuaire, verificationsCompte });
  Object.defineProperty(racine.FICTIF_IDF, 'avecDemoBureau', { value: avecDemoBureau, enumerable: false });
  if (node) module.exports = racine.FICTIF_IDF;
})(typeof self !== 'undefined' ? self : this);
