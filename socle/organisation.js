/* ODICOLOR 2.0 — Socle 0 : organisation (rôles et pôles). Données de configuration, aucune donnée personnelle.
   Démarrage avec 2 rôles actifs. Les futurs pôles et rôles sont DÉCLARÉS mais INACTIFS : aucun droit tant qu'une
   décision de la direction ne les a pas activés. */
(function (racine) {
  'use strict';

  const POLES = Object.freeze({
    pilotage:     { libelle: 'Pilotage et développement', actif: true },
    commercial:   { libelle: 'Commercial terrain', actif: true },
    magasin:      { libelle: 'Magasin, commandes et préparation', actif: false, activation: 'Décision de la direction (activation-pole)' },
    formation:    { libelle: 'Formation et démonstrations techniques', actif: false, activation: 'Décision de la direction (activation-pole)' },
    administratif:{ libelle: 'Administration et recouvrement', actif: false, activation: 'Décision de la direction (activation-pole)' },
    marketing:    { libelle: 'Marketing et image ODICOLOR', actif: false, activation: 'Décision de la direction (activation-pole)' }
  });

  // Rôles. « voit » liste les données sensibles visibles (au-delà des fiches) ; utilisé pour les futurs rôles.
  const ROLES = Object.freeze({
    developpement: { libelle: 'Responsable du développement', pole: 'pilotage', actif: true,
      mission: 'Pilote et coordonne l’activité : garages, visites, actions, propositions de décisions.', voit: ['ca', 'reglements', 'marges'] },
    direction: { libelle: 'Direction', pole: 'pilotage', actif: true,
      mission: 'Consulte les résultats et valide les décisions relevant de la direction.', voit: ['ca', 'reglements', 'marges'] },
    // ---- futurs rôles, inactifs ----
    commercial: { libelle: 'Commercial terrain', pole: 'commercial', actif: false, voit: ['ca'] },
    magasin: { libelle: 'Magasin et préparation', pole: 'magasin', actif: false, voit: [] },
    formation: { libelle: 'Formation technique', pole: 'formation', actif: false, voit: [] },
    administratif: { libelle: 'Administration et recouvrement', pole: 'administratif', actif: false, voit: ['ca', 'reglements'] }
  });

  // Décisions qui relèvent de la direction (validation obligatoire par le rôle « direction »).
  const DECISIONS_DIRECTION = Object.freeze(['prix', 'remise', 'ouverture-compte', 'objectif', 'recrutement', 'activation-pole', 'conditions-reglement', 'investissement', 'offre-conquete']);

  // Offres de conquête : règles de validation par la direction. Tant que la direction n'a pas fixé de seuils,
  // TOUTE offre de conquête doit être validée (choix prudent). Les seuils ci-dessous signalent les offres sensibles.
  // HYPOTHÈSES à faire fixer par la direction.
  const REGLES_OFFRES_CONQUETE = Object.freeze({ validationToujours: true, alerteTauxMargeMin: 0.15, alerteRemiseMax: 0.30, alerteCadeauMaxCents: 30000, dureeMaxJours: 90 });

  const roleActif = r => !!(ROLES[r] && ROLES[r].actif && POLES[ROLES[r].pole] && POLES[ROLES[r].pole].actif);

  const api = { POLES, ROLES, DECISIONS_DIRECTION, REGLES_OFFRES_CONQUETE, roleActif };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.SocleOrganisation = api;
})(typeof self !== 'undefined' ? self : this);
