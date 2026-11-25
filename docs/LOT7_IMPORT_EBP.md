# ODICOLOR 2.0 — Lot 7 : réglages durables et assistant d'import EBP (14/11/2026)

## Assistant d'import (Bureau → bouton « Assistant d'import pas à pas », ou Pilotage → Données utilisées)
5 étapes, une à la fois, gros boutons « Précédent / Suivant » :
1. **Date de l'export** — le jour où tu as fait les exports dans EBP.
2. **Fichier clients** — ce qu'il faut exporter dans EBP est rappelé à l'écran.
3. **Pièces de vente** — indique la **période choisie dans EBP** (proposée : 12 mois). C'est elle, et elle seule,
   qui prouve qu'un mois est complet : un mois sans pièce peut être un mois sans vente… ou un mois non exporté.
4. **Échéancier des règlements**.
5. **Bilan** — par fichier : lignes lues / retenues / écartées (regroupées par raison), colonnes absentes avec leur
   **conséquence concrète**, corrections détectées (fichier déjà chargé, pièce modifiée dans EBP, pièce hors de la
   période déclarée, SIRET invalide), puis la liste des données absentes pour le pilotage.

Un fichier refusé n'efface jamais celui déjà chargé ; la raison du refus est affichée.

## Couverture des données
- Les comparaisons de mois, les catégories de clientèle (nouveau / réactivé) et les dormants n'utilisent que les
  **périodes d'export déclarées** (fusionnées si elles se suivent). Les dates des pièces ne suffisent jamais.
- Un export chargé par les boutons classiques (sans période) est accepté, mais signalé « sans période déclarée » :
  les comparaisons restent bloquées tant qu'il n'est pas déclaré via l'assistant.

## Réglages durables
- Pilotage → **Réglages des priorités** : seuils (jours) avec bornes affichées ; valeurs hors bornes corrigées et signalées ;
  bouton « Valeurs par défaut ».
- **Objectif mensuel** et seuils enregistrés dans le **coffre** de l'application locale, restaurés après redémarrage
  (testé avec un arrêt brutal). L'objectif reste aussi mémorisé dans le navigateur pour l'usage hors application locale.

## Limites
- Tests sur données fictives uniquement ; noms de colonnes EBP réels non confirmés.
- Pas testé sur le PC Windows ni sur le vrai Samsung.
