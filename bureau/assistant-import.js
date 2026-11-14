/* ODICOLOR 2.0 — Lot 7 : ASSISTANT D'IMPORT EBP (Bureau). Logique pure : bilan compréhensible d'un import, sans jargon.
   Pour chaque fichier : ce qui a été lu, retenu, écarté (avec la raison), les colonnes absentes et leur CONSÉQUENCE concrète,
   les corrections détectées (fichier déjà chargé, pièce modifiée, pièce hors période). Rien n'est corrigé en silence. */
(function (racine) {
  'use strict';
  const EI = typeof module === 'object' && module.exports ? require('./ebp-import.js') : racine.EbpImport;
  const CONSEQUENCES = {
    pieces: { type: 'Le type est déduit du préfixe du n° (FA, AV, DE…) : vérifie les lignes écartées « type non reconnu ».',
      code: 'Sans code client, le CA ne peut être rattaché ni à un garage, ni à une commune (« non attribué »).',
      origine: 'Sans « n° de pièce d’origine », impossible de relier devis → commande → facture : relances et commandes bloquées non détectées.',
      ref: 'Sans référence, rien ne change pour les chiffres.' },
    reglements: { reglement: 'Sans date de règlement, l’encaissé du mois ne peut pas être calculé.',
      reste: 'Sans « reste à payer », un règlement daté sans montant reste « à vérifier » (jamais considéré comme soldé).',
      regle: 'Sans « montant réglé », les règlements partiels ne sont visibles que grâce au « reste à payer ».' },
    clients: { ville: 'Sans ville, le client n’est pas placé sur la carte.', cp: 'Sans code postal, la commune peut rester ambiguë.',
      statut: 'Sans statut, les comptes bloqués ne sont pas repérés.', famille: 'Sans famille, l’activité (carrosserie, mécanique) n’est pas connue.',
      commercial: 'Sans représentant, ton CA personnel n’est pas calculable.', siret: 'Sans SIRET, le rapprochement avec l’annuaire passe par le nom et la commune.' }
  };
  const ETAPES = [
    { id: 'arrete', titre: 'Date de l’export', aide: 'La date du jour où tu as fait les exports dans EBP.' },
    { id: 'clients', titre: 'Fichier clients', aide: 'EBP → liste des clients → colonnes : code, nom, ville, code postal, statut (bloqué), famille, représentant, SIRET → Exporter en Excel ou CSV.' },
    { id: 'pieces', titre: 'Pièces de vente', aide: 'EBP → documents de vente (devis, commandes, BL, factures, avoirs) → période : au moins 12 mois → colonnes : type, n°, date, code client, nom, montant HT, n° de pièce d’origine → Exporter.' },
    { id: 'reglements', titre: 'Échéancier des règlements', aide: 'EBP → échéancier clients → colonnes : n° de facture, échéance, date de règlement, montant TTC, reste à payer → Exporter.' },
    { id: 'bilan', titre: 'Bilan', aide: 'Ce qui est prêt, ce qui manque, ce qui a été corrigé.' }
  ];
  function colonnesAbsentes(type, correspondance) {
    const presentes = new Set((correspondance || []).map(c => c.cle));
    return (EI.COLONNES[type] || []).filter(([k, , , ob]) => !ob && !presentes.has(k) && CONSEQUENCES[type][k]).map(([k, lib]) => ({ cle: k, libelle: lib, consequence: CONSEQUENCES[type][k] }));
  }
  // r : résultat d'import (lirePieces / lireReglements / lireClientsEbp) ; consolidation : Performance.consolider (pièces seulement).
  function bilanFichier(type, r, consolidation = null) {
    if (!r) return { type, charge: false, message: 'Pas encore chargé.' };
    const lues = r.lues || 0, ecartees = (r.ignorees || []).length, motifs = new Map();
    for (const x of r.ignorees || []) { const m = String(x.motif).replace(/ pour .*$/, '').replace(/ \(.*\)$/, ''); /* regroupé par raison, sans le n° ni la valeur */ motifs.set(m, (motifs.get(m) || 0) + 1); }
    const corrections = [];
    if (consolidation) {
      if (consolidation.doublonsFichier.length) corrections.push('Fichier déjà chargé, ignoré : ' + consolidation.doublonsFichier.join(', '));
      if (consolidation.modifiees.length) corrections.push(consolidation.modifiees.length + ' pièce(s) modifiée(s) dans EBP depuis un export précédent (la plus récente fait foi) : ' + consolidation.modifiees.slice(0, 5).map(m => m.no).join(', '));
      if (consolidation.horsPeriode.length) corrections.push(consolidation.horsPeriode.length + ' pièce(s) datée(s) hors de la période déclarée : ' + consolidation.horsPeriode.slice(0, 5).map(m => m.no + ' (' + m.date + ')').join(', ') + ' — période ou export à vérifier');
      if (consolidation.nonDeclares) corrections.push(consolidation.nonDeclares + ' export(s) de pièces sans période déclarée : les comparaisons de mois restent bloquées');
    }
    (r.anomalies || []).forEach(a => corrections.push('Ligne ' + a.ligne + ' : ' + a.motif));
    const absentes = colonnesAbsentes(type, r.correspondance);
    const niveau = ecartees > lues / 2 ? 'erreur' : (ecartees || absentes.length || corrections.length) ? 'attention' : 'ok';
    return { type, charge: true, fichier: r.fichier || (r.provenance && r.provenance.fichier) || '', lues, retenues: Math.max(0, lues - ecartees), ecartees,
      motifs: [...motifs.entries()].sort((a, b) => b[1] - a[1]).map(([motif, n]) => ({ motif, n })), absentes, corrections, niveau };
  }
  // Données absentes au niveau du Bureau : ce qu'on ne pourra pas afficher, et pourquoi.
  function donneesAbsentes(E) {
    const l = [];
    if (!E.arreteConfirmee) l.push('Date de l’export non confirmée.');
    if (!E.clients) l.push('Fichier clients absent : comptes bloqués, communes et CA personnel inconnus.');
    if (!E.pieces) l.push('Pièces de vente absentes : aucun CA, aucune relance.');
    if (!E.reglements) l.push('Échéancier absent : encaissements et factures échues inconnus.');
    const c = E.pieces && E.pieces.consolidation;
    if (E.pieces && (!c || !c.periodes || !c.periodes.length)) l.push('Aucune période d’export déclarée pour les pièces : comparaisons de mois, catégories et dormants bloqués.');
    return l;
  }
  const api = { ETAPES, CONSEQUENCES, colonnesAbsentes, bilanFichier, donneesAbsentes };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.AssistantImport = api;
})(typeof self !== 'undefined' ? self : this);
