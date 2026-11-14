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
  // ---------- Lot 8 : aperçu AVANT import (rien n'est modifié tant que l'utilisateur ne valide pas) ----------
  // e = { type, r (résultat lirePieces/lireReglements/lireClientsEbp), empreinte, existant: { pieces, avoirs, empreintes:[...], periodes } ,
  //       clientsEbp, arrete, periode:{du,au} } → { compte, anomalies:[{gravite:'bloquant'|'attention'|'info', texte}], validable }
  function apercu(e) {
    const { type, r } = e, A = [], add = (gravite, texte) => A.push({ gravite, texte });
    const lues = r.lues || 0, rejetees = (r.ignorees || []).length;
    const compte = { lues, reconnues: lues - rejetees, rejetees, nouvelles: null, identiques: null, modifiees: null };
    if (!lues) add('bloquant', 'Le fichier ne contient aucune ligne de données sous les en-têtes.');
    if (lues && rejetees === lues) add('bloquant', 'Aucune ligne n’a pu être lue : vérifie le choix des colonnes.');
    else if (rejetees) add('attention', rejetees + ' ligne(s) seront ignorées : ' + [...new Set((r.ignorees || []).map(x => String(x.motif).replace(/ pour .*$/, '').replace(/ \(.*\)$/, '')))].slice(0, 4).join(' ; ') + '.');
    if (e.empreinte && (e.existant && e.existant.empreintes || []).includes(e.empreinte)) add('info', 'Ce fichier a déjà été importé : rien ne changera (aucun double comptage).');
    if (type === 'pieces') {
      const ex = new Map(((e.existant && e.existant.pieces) || []).concat(((e.existant && e.existant.avoirs) || []).map(a => ({ ...a, type: 'avoir' }))).map(p => [p.type + '|' + p.no, p]));
      const toutes = (r.pieces || []).concat((r.avoirs || []).map(a => ({ ...a, type: 'avoir' })));
      let n = 0, idem = 0; const mod = [];
      for (const p of toutes) { const a = ex.get(p.type + '|' + p.no); if (!a) n++; else if (a.htCents === p.htCents && a.date === p.date && (a.code || '') === (p.code || '')) idem++; else mod.push(p.no); }
      Object.assign(compte, { nouvelles: n, identiques: idem, modifiees: mod.length });
      if (idem) add('info', idem + ' pièce(s) déjà connue(s) à l’identique : comptées une seule fois.');
      if (mod.length) add('attention', mod.length + ' pièce(s) déjà connue(s) mais modifiée(s) dans EBP (montant, date ou client) : la nouvelle version remplacera l’ancienne — ' + mod.slice(0, 5).join(', ') + '.');
      const dbl = toutes.filter(p => p.lignesIdentiques > 0).map(p => p.no);
      if (dbl.length) add('attention', dbl.length + ' pièce(s) contiennent des lignes strictement identiques (export en double ?) : ' + dbl.slice(0, 5).join(', ') + '.');
      // Clients non rapprochés : code absent du fichier clients.
      if (Array.isArray(e.clientsEbp)) { const codes = new Set(e.clientsEbp.map(c => c.code)), inconnus = [...new Set(toutes.map(p => p.code).filter(c => c && !codes.has(c)))];
        if (inconnus.length) add('attention', inconnus.length + ' code(s) client absents du fichier clients (ces pièces ne seront rattachées à aucun garage) : ' + inconnus.slice(0, 5).join(', ') + '.'); }
      else add('info', 'Fichier clients pas encore chargé : le rapprochement des clients sera vérifié ensuite.');
      const sansCode = toutes.filter(p => !p.code).length; if (sansCode) add('attention', sansCode + ' pièce(s) sans code client : non rattachées à un garage.');
      // Dates incohérentes.
      const futur = toutes.filter(p => p.date && e.arrete && p.date > e.arrete), ancien = toutes.filter(p => p.date && p.date < '2000-01-01');
      if (futur.length) add('attention', futur.length + ' pièce(s) datée(s) après la date de l’export (' + e.arrete + ') : ' + futur.slice(0, 5).map(p => p.no).join(', ') + '. Date d’export ou pièce à vérifier.');
      if (ancien.length) add('attention', ancien.length + ' pièce(s) datée(s) avant 2000 : date probablement mal lue.');
      // Période d'export.
      const pv = e.periode && e.periode.du && e.periode.au && e.periode.du <= e.periode.au;
      if (!pv) add('attention', 'Période d’export non indiquée : le fichier sera importé, mais les comparaisons de mois resteront bloquées.');
      else {
        const hors = toutes.filter(p => p.date && (p.date < e.periode.du || p.date > e.periode.au));
        if (hors.length) add('attention', hors.length + ' pièce(s) en dehors de la période indiquée (du ' + e.periode.du + ' au ' + e.periode.au + ') : période ou export à vérifier.');
        if (e.arrete && e.periode.au < e.arrete) add('info', 'La période s’arrête le ' + e.periode.au + ', avant la date de l’export (' + e.arrete + ') : les jours suivants ne sont pas couverts.');
      }
      if (!r.liens) add('attention', 'Pas de colonne « n° de pièce d’origine » : devis, commandes et factures ne pourront pas être reliés.');
    }
    if (type === 'reglements') {
      const inconnues = (r.reglements || []).filter(x => x.resteCents == null).length;
      if (inconnues) add('attention', inconnues + ' règlement(s) daté(s) sans montant ni reste : ils resteront « à vérifier », jamais soldés.');
      const facs = new Set((((e.existant && e.existant.pieces) || []).filter(p => p.type === 'facture')).map(p => p.no)), orph = (r.reglements || []).filter(x => facs.size && !facs.has(x.facture));
      if (orph.length) add('attention', orph.length + ' échéance(s) pour des factures absentes des pièces chargées : ' + [...new Set(orph.map(x => x.facture))].slice(0, 5).join(', ') + '.');
    }
    if (type === 'clients') {
      const bl = (r.clients || []).filter(c => c.bloque).length; if (bl) add('info', bl + ' compte(s) bloqué(s) repéré(s).');
      if ((r.anomalies || []).length) add('attention', r.anomalies.length + ' SIRET invalide(s) : ignorés pour le rapprochement.');
    }
    absentesEnClair(type, r.correspondance).forEach(t => add('info', t));
    return { compte, anomalies: A, validable: !A.some(a => a.gravite === 'bloquant') };
  }
  const absentesEnClair = (type, corr) => colonnesAbsentes(type, corr).map(x => 'Colonne « ' + x.libelle + ' » absente : ' + x.consequence);
  // Correspondances validées (format d'export → choix de colonnes par NOM), réutilisées aux imports suivants.
  function memoriserCorrespondance(liste, analyse) {
    const l = (Array.isArray(liste) ? liste : []).filter(x => x.signature !== analyse.signature);
    const carte = {}; for (const c of analyse.correspondance) carte[c.cle] = c.colonne;
    return l.concat([{ signature: analyse.signature, type: analyse.type, carte, ligneEntete: analyse.ligneEntete }]).slice(-30);
  }
  const correspondancePour = (liste, sig) => (Array.isArray(liste) ? liste : []).find(x => x.signature === sig) || null;
  const api = { ETAPES, CONSEQUENCES, colonnesAbsentes, bilanFichier, donneesAbsentes, apercu, memoriserCorrespondance, correspondancePour };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.AssistantImport = api;
})(typeof self !== 'undefined' ? self : this);
