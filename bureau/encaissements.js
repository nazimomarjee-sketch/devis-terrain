/* ODICOLOR 2.0 — Lot 1 : ENCAISSEMENTS CONSTATÉS, CRÉANCES ET COMPTES BLOQUÉS (Bureau). LECTURE SEULE.
   Source unique : l'échéancier des règlements EBP (bureau/ebp-import.js, lireReglements) et le fichier clients EBP.
   Règles :
   - un encaissement n'est « constaté » que si l'échéancier donne une date de règlement ET un montant réglé connu
     (reste déclaré ou montant réglé) ; règlement daté sans montant → « douteux », jamais compté comme encaissé ;
   - l'échéancier est en TTC : les encaissements et créances sont affichés TTC et ne sont JAMAIS comparés au CA HT ;
   - pas d'échéancier ou pas de date d'export → « absent » (null), jamais un faux zéro ;
   - une créance au reste inconnu n'entre pas dans le total : elle est comptée à part (« à vérifier ») avec son montant maximal ;
   - comptes bloqués : seulement le statut du fichier clients EBP ; leur créance connue est indiquée, jamais estimée.
   Statuts par indicateur : 'valide' (calculable sur des données complètes), 'douteux' (calculé mais des lignes manquent),
   'absent' (non calculable). Montants en centimes entiers. Dates « AAAA-MM-JJ ». */
(function (racine) {
  'use strict';
  const iso = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) ? d.slice(0, 10) : null;
  const somme = (l, f) => l.reduce((s, x) => s + f(x), 0);

  // e = { reglements: [lignes de lireReglements], clientsEbp: [clients de lireClientsEbp], pieces: [pièces de lirePieces], arrete, aujourdhui }
  function calculer(e = {}) {
    const arrete = iso(e.arrete), aujourdhui = iso(e.aujourdhui) || arrete;
    const absent = motif => ({ statut: 'absent', motif, cents: null });
    if (!Array.isArray(e.reglements)) return { source: 'EBP', ttc: true, encaisseMois: absent('Échéancier des règlements EBP non chargé'), creances: absent('Échéancier des règlements EBP non chargé'), echu: absent('Échéancier des règlements EBP non chargé'), bloques: comptesBloques(e, new Map()) };
    if (!arrete) return { source: 'EBP', ttc: true, encaisseMois: absent('Date de l’export EBP inconnue'), creances: absent('Date de l’export EBP inconnue'), echu: absent('Date de l’export EBP inconnue'), bloques: comptesBloques(e, new Map()) };
    const mois = (aujourdhui || arrete).slice(0, 7), debut = mois + '-01';
    const L = e.reglements.filter(Boolean);
    const regleConnu = r => r.resteCents != null; // réglé = montant − reste
    // 1. Encaissé constaté du mois (jusqu'à la date de l'export).
    const duMois = L.filter(r => r.reglement && r.reglement >= debut && r.reglement <= arrete);
    const sures = duMois.filter(regleConnu), douteuses = duMois.filter(r => !regleConnu(r));
    const encaisseMois = { statut: douteuses.length ? 'douteux' : 'valide', cents: somme(sures, r => r.montantCents - r.resteCents), lignes: sures.map(r => ({ facture: r.facture, reglement: r.reglement, cents: r.montantCents - r.resteCents })),
      motif: douteuses.length ? douteuses.length + ' règlement(s) daté(s) sans montant réglé : non compté(s) (' + douteuses.map(r => r.facture).join(', ') + ')' : null, debut, fin: arrete };
    // 2. Créances (reste à payer connu) et part échue à la date de l'export.
    const ouvertes = L.filter(r => regleConnu(r) && r.resteCents > 0), inconnues = L.filter(r => !regleConnu(r));
    const echues = ouvertes.filter(r => r.echeance && r.echeance < arrete);
    const motifInconnu = inconnues.length ? inconnues.length + ' échéance(s) au reste inconnu, hors total (au plus ' + somme(inconnues, r => r.montantCents) + ' centimes TTC) : ' + inconnues.map(r => r.facture).join(', ') : null;
    const creances = { statut: inconnues.length ? 'douteux' : 'valide', cents: somme(ouvertes, r => r.resteCents), nb: ouvertes.length, motif: motifInconnu,
      aVerifier: { nb: inconnues.length, maxCents: somme(inconnues, r => r.montantCents) } };
    const echu = { statut: inconnues.length ? 'douteux' : 'valide', cents: somme(echues, r => r.resteCents), nb: echues.length, motif: motifInconnu,
      lignes: echues.map(r => ({ facture: r.facture, echeance: r.echeance, resteCents: r.resteCents })) };
    // Reste connu par client (rattachement par le n° de facture → code client des pièces EBP, jamais par le nom).
    const codeDeFacture = new Map((e.pieces || []).filter(p => p && p.type === 'facture' && p.code).map(p => [p.no, p.code]));
    const parClient = new Map();
    for (const r of ouvertes) { const c = codeDeFacture.get(r.facture); if (c) parClient.set(c, (parClient.get(c) || 0) + r.resteCents); }
    return { source: 'EBP', ttc: true, arrete, encaisseMois, creances, echu, sansClient: ouvertes.filter(r => !codeDeFacture.get(r.facture)).length, bloques: comptesBloques(e, parClient) };
  }

  function comptesBloques(e, parClient) {
    if (!Array.isArray(e.clientsEbp)) return { statut: 'absent', motif: 'Fichier clients EBP non chargé', liste: null };
    const liste = e.clientsEbp.filter(c => c && c.bloque).map(c => ({ code: c.code, nom: c.nom, statut: c.statut, creanceConnueCents: parClient.has(c.code) ? parClient.get(c.code) : null }));
    return { statut: 'valide', liste, nb: liste.length };
  }

  const api = { calculer };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.Encaissements = api;
})(typeof self !== 'undefined' ? self : this);
