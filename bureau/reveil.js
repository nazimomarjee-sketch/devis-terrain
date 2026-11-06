/* ODICOLOR Bureau — Réveil du cockpit : quels voyants s'allument selon les données importées.
   Lecture seule. Ne calcule aucun chiffre nouveau : il constate ce que les modules existants (import EBP, pipeline,
   Ville connectée) savent déjà produire avec les fichiers chargés, et dit précisément ce qui manque pour le reste.
   États : « allume » (fiable avec les fichiers chargés) · « partiel » (affiché, avec une limite dite) · « eteint » (donnée absente).
   Les voyants « à venir » dépendent de données qu'aucun export actuel ne fournit, ou d'une décision : ils ne s'allument pas seuls. */
(function (racine) {
  'use strict';
  const ETATS = { allume: 'Allumé', partiel: 'Partiel', eteint: 'Éteint' };
  const pl = (n, m) => n + ' ' + m + (n > 1 ? 's' : '');

  // d = { garagesTelephone, telephone, pieces, reglements, clients, plan, ebpVille, garages }
  function voyants(d) {
    const tel = Array.isArray(d.garagesTelephone) && d.garagesTelephone.length ? d.garagesTelephone : null;
    const P = d.pieces, R = d.reglements, C = d.clients, plan = d.plan, ville = d.ebpVille, g = d.garages || [];
    const v = (id, nom, etat, valeur, source, manque) => ({ id, nom, etat, valeur: valeur == null ? '' : String(valeur), source, manque: manque || '' });
    const aColonne = (r, cle) => !!(r && (r.correspondance || []).some(c => c.cle === cle));
    const aFamille = aColonne(C, 'famille'), aStatut = aColonne(C, 'statut');
    const pc = plan && plan.sources && plan.sources.preuvesCommerciales;
    const cmdN = plan ? plan.kpi.mois.cmdN : 0;

    const terrain = [
      v('ville', 'Ville LEGO avec tes garages', tel ? 'allume' : 'eteint', tel ? pl(tel.length, 'garage') : '', 'Sauvegarde du téléphone', tel ? '' : 'Charger la sauvegarde du téléphone (.odicolor)'),
      v('communes', 'Communes et départements', tel ? 'allume' : 'eteint', tel ? pl(new Set(tel.map(x => x.commune).filter(Boolean)).size, 'commune') : '', 'Sauvegarde du téléphone + référentiel officiel', tel ? '' : 'Sauvegarde du téléphone'),
      v('prospects', 'Prospects du terrain', tel ? 'allume' : 'eteint', tel ? tel.filter(x => x.statut === 'prospect').length : '', 'Saisie terrain', tel ? '' : 'Sauvegarde du téléphone'),
      v('devis', 'Devis du téléphone reliés à EBP', tel && plan && plan.rapprochements.length ? 'allume' : tel || plan ? 'partiel' : 'eteint',
        plan ? plan.rapprochements.length + ' devis reconnu' + (plan.rapprochements.length > 1 ? 's' : '') + ' dans EBP' : tel && d.telephone ? pl((d.telephone.devis || []).length, 'devis') : '',
        'Téléphone + pièces EBP', !tel ? 'Sauvegarde du téléphone' : !plan ? 'Export des pièces EBP'
          : plan.rapprochements.length ? '' : 'Aucun devis du téléphone retrouvé dans EBP : vérifier que la référence du devis est reprise dans EBP')
    ];

    const ventes = [
      v('commandes', 'Commandes de la semaine et du mois', plan ? 'allume' : 'eteint', plan ? pl(cmdN, 'commande') + ' ce mois' : '', 'Pièces EBP', plan ? '' : 'Export des pièces EBP'),
      v('facture', 'Facturé du mois (jamais confondu avec les commandes)', plan ? 'allume' : 'eteint', plan ? pl(plan.kpi.mois.facN, 'facture') : '', 'Pièces EBP', plan ? '' : 'Export des pièces EBP'),
      v('actions', 'Tes 3 actions du jour', !plan ? 'eteint' : P.liens ? 'allume' : 'partiel', plan ? pl(plan.actions.length, 'action') : '', 'Pièces EBP (+ téléphone)',
        !plan ? 'Export des pièces EBP' : P.liens ? '' : 'Colonne « n° de pièce d’origine » absente : retards devis → commande → facture non fiables'),
      v('signaux', 'Signaux reconquête et baisse', !plan ? 'eteint' : pc && pc.fiable ? 'allume' : 'partiel', plan && pc ? pl(pc.signaux || 0, 'signal') : '', 'Pièces EBP, 12 mois',
        !plan ? 'Export des pièces EBP sur 12 mois' : pc && !pc.fiable ? pc.restrictions.join(' ') : ''),
      v('plan', 'Plan du matin pour le téléphone', plan ? 'allume' : 'eteint', plan ? 'prêt à télécharger' : '', 'Bureau → téléphone', plan ? '' : 'Export des pièces EBP')
    ];

    const amb = ville ? ville.rapport.ambigus.length : 0;
    const comptes = [
      v('echu', 'Échu non réglé et risque de règlement', R && plan ? 'allume' : 'eteint', R && plan && plan.kpi.echu ? pl(plan.kpi.echu.n, 'facture') + ' échue' + (plan.kpi.echu.n > 1 ? 's' : '') : '',
        'Échéancier EBP', R && plan ? '' : !R ? 'Export de l’échéancier des règlements' : 'Export des pièces EBP'),
      v('relies', 'Garages de la Ville reliés à EBP (statut, commandes, fil d’actions)', ville ? (amb ? 'partiel' : 'allume') : 'eteint',
        ville ? ville.rapport.relies + ' garage' + (ville.rapport.relies > 1 ? 's reliés' : ' relié') : '', 'Téléphone + pièces EBP',
        ville ? (amb ? pl(amb, 'homonyme') + ' non relié' + (amb > 1 ? 's' : '') + ' (jamais au hasard) : ' + ville.rapport.ambigus.slice(0, 3).join(', ') : '') : !tel ? 'Sauvegarde du téléphone' : 'Export des pièces EBP'),
      v('couleurs', 'Ma Ville en 4 couleurs', !tel ? 'eteint' : C && aFamille ? 'allume' : 'partiel',
        tel ? pl(g.filter(x => x.segment === 'a_qualifier' || /a_qualifier$/.test(x.segment || '')).length, 'garage') + ' à qualifier' : '', 'Fichier clients EBP (famille) + terrain',
        !tel ? 'Sauvegarde du téléphone' : !C ? 'Fichier clients EBP : sans lui, carrosserie / mécanique vient du terrain ou du nom (signalé « probable »)' : !aFamille ? 'Colonne « famille client » absente du fichier clients EBP' : ''),
      v('inactifs', 'Clients EBP inactifs (12 mois sans commande)', tel && P ? (C && pc && pc.fiable ? 'allume' : 'partiel') : 'eteint', tel && P && C ? pl(g.filter(x => x.inactifEbp).length, 'client') : '',
        'Pièces EBP (12 mois) + fichier clients EBP', !(tel && P) ? 'Téléphone + export des pièces EBP'
          : !C ? 'Fichier clients EBP : sans lui, les codes EBP ne sont pas reliés aux garages, les inactifs ne sont pas repérés'
          : pc && !pc.fiable ? 'Historique inférieur à 12 mois : inactivité sous-estimée' : ''),
      v('bloques', 'Comptes bloqués', C ? (aStatut ? 'allume' : 'partiel') : 'eteint', C ? pl((C.clients || []).filter(x => x.bloque).length, 'compte') : '', 'Fichier clients EBP (statut)',
        !C ? 'Fichier clients EBP' : aStatut ? '' : 'Colonne « statut du compte » absente')
    ];

    // Données qu'aucun export chargé aujourd'hui ne fournit, ou décisions attendues.
    const aVenir = [
      v('marge', 'Marge et taux de marge', 'eteint', '', 'EBP', 'Prix d’achat ou marge par ligne : colonne à confirmer dans un export EBP'),
      v('objectif', 'Objectif et écart à l’objectif', 'eteint', '', 'Direction', 'Objectif à fixer avec Faizal'),
      v('panier', 'Panier habituel et réachat par produit', 'eteint', '', 'EBP', 'Export des ventes ligne par ligne d’article (code, désignation, quantité)'),
      v('canaux', 'Vente directe / distribution séparées', 'eteint', '', 'EBP', 'Repérer les distributeurs dans EBP (famille ou catégorie client) + règle d’attribution'),
      v('offres', 'Suivi des Offres de conquête', 'eteint', '', 'Socle (logique prête)', 'Marge EBP + offres enregistrées et validées par la direction'),
      v('supervision', 'Espace de supervision de la direction', 'eteint', '', 'Socle (logique prête)', 'Écran et comptes à construire après accord (hébergement)'),
      v('essais', 'Essais Carsystem', 'eteint', '', 'Terrain', 'Saisie des essais au téléphone (Lot 3)')
    ];

    const groupes = [
      { id: 'terrain', titre: 'Terrain (sauvegarde du téléphone)', voyants: terrain },
      { id: 'ventes', titre: 'Ventes (pièces EBP)', voyants: ventes },
      { id: 'comptes', titre: 'Clients et comptes (EBP + terrain)', voyants: comptes },
      { id: 'avenir', titre: 'À venir : données manquantes ou décisions', voyants: aVenir }
    ];
    const tous = groupes.flatMap(x => x.voyants), compte = e => tous.filter(x => x.etat === e).length;
    return { groupes, total: tous.length, allumes: compte('allume'), partiels: compte('partiel'), eteints: compte('eteint') };
  }

  const api = { voyants, ETATS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.Reveil = api;
})(typeof self !== 'undefined' ? self : this);
