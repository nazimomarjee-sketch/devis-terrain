/* DONNÉES FICTIVES Île-de-France pour l'étape 3 (vue Commune dans le Bureau, sélecteur EN COMPTE | SANS COMPTE).
   Aucun garage réel : noms, codes EBP, SIRET et vérifications sont inventés. Repart de FICTIF_95 sans le modifier. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const B = node ? require('./fictif-95.js') : racine.FICTIF_95;
  const J = n => new Date(Date.UTC(2026, 10, 6) - n * 86400000).toISOString().slice(0, 10);
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
  const clientsEbp = [
    ...B.clientsEbp,
    ...villes.map(([v, cp], i) => ({ code: 'G0' + i, nom: 'CLIENT FICTIF ' + v.toUpperCase(), ville: v, cp, statut: 'Actif', famille: i % 2 ? 'Mécan' : 'Carrosserie' })),
    { code: 'S01', nom: 'CARROSSERIE FICTIVE SARCELLES CLIENTE', ville: 'Sarcelles', cp: '95200', statut: 'Actif', famille: 'Carrosserie' },
    { code: 'S02', nom: 'MÉCA FICTIVE SARCELLES BLOQUÉE', ville: 'Sarcelles', cp: '95200', statut: 'Bloqué', famille: 'Mécan', bloque: true }
  ];
  const piecesEbp = [
    ...B.piecesEbp,
    ...villes.flatMap(([v], i) => cmd('G0' + i, 'CLIENT FICTIF ' + v.toUpperCase(), [5 + i, 35 + i, 65 + i])),
    ...cmd('S01', 'CARROSSERIE FICTIVE SARCELLES CLIENTE', [100, 130, 160, 190]),
    ...cmd('S02', 'MÉCA FICTIVE SARCELLES BLOQUÉE', [15]),
    // Client présent seulement dans les pièces EBP (commune inconnue) → « à classer », jamais perdu.
    ...cmd('Z99', 'CLIENT FICTIF SANS ADRESSE', [12])
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
      c.push({ code, nom: g.nom, ville: g.commune || g.ville, cp: g.cp, statut: 'Actif', famille: metier === 'Mécanique' ? 'Mécan' : metier, bloque: g.statut === 'risque' });
      p.push(...cmd(code, g.nom, g.statut === 'actif' ? [6 + i % 20, 36 + i % 20, 66 + i % 20] : [100 + i % 30, 130 + i % 30, 160 + i % 30, 190 + i % 30]));
      l.push({ a: 'tel:' + g.id, b: 'ebp:' + code, par: 'Démo', date: '2026-11-06' });
    });
    const F = racine.FICTIF_IDF;
    return Object.assign({}, F, { terrain: F.terrain.concat(t), clientsEbp: F.clientsEbp.concat(c), piecesEbp: F.piecesEbp.concat(p), liaisonsValidees: (F.liaisonsValidees || []).concat(l) });
  }
  racine.FICTIF_IDF = Object.assign({}, B, { terrain, clientsEbp, piecesEbp, annuaire, verificationsCompte });
  Object.defineProperty(racine.FICTIF_IDF, 'avecDemoBureau', { value: avecDemoBureau, enumerable: false });
  if (node) module.exports = racine.FICTIF_IDF;
})(typeof self !== 'undefined' ? self : this);
