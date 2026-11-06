# ODICOLOR 2.0 — Socle 0 (07/11/2026)

Fondations communes de la future plateforme : **modèle de données**, **comptes et droits par rôle**, **synchronisation
ordinateur ↔ téléphone**, **migration des données actuelles**, calculs du **cockpit** et de la **supervision**.
Code testé sur données fictives. **Aucun hébergement, aucun compte réel, aucune donnée réelle.**
Le téléphone, le Bureau et la Ville LEGO ne sont pas modifiés et n'utilisent pas encore ce socle.

| Fichier | Rôle |
|---|---|
| `organisation.js` | Pôles et rôles. Actifs : pilotage, commercial ; rôles « Responsable du développement » et « Direction ». Pôles magasin, formation, administratif, marketing **déclarés mais inactifs** (activation = décision de la direction). |
| `modele.js` | Entités communes avec identifiant unique `uid` : utilisateur, garage, visite, action, devis terrain, décision, objectif, pièce EBP (lecture seule). Validation stricte, champs inconnus refusés. |
| `droits.js` | Qui peut lire, créer, modifier, importer. Aucune suppression (archivage par statut). |
| `synchro.js` | Serveur et appareils **simulés en mémoire** : hors connexion d'abord, versions par champ, conflits conservés, renvoi sans doublon, journal d'audit non modifiable. |
| `migration.js` | Sauvegarde du téléphone (`.odicolor` / V47) et pièces EBP → modèle commun ; retour vers le téléphone sans perte. |
| `pilotage.js` | Cockpit (3 priorités, demandes de la direction, décisions, conflits, résultats) et supervision (décisions à trancher, résultats, activité). |

## Matrice des droits (à valider par le propriétaire et la direction)

| | Responsable du développement | Direction |
|---|---|---|
| Garages, visites, devis terrain | Crée et modifie | Consulte |
| Actions | Crée, modifie, coordonne | Consulte ; **demande** une action (source « direction ») |
| Décisions de direction (prix, remise, ouverture de compte, objectif, recrutement, activation de pôle…) | **Propose**, complète, renvoie ; ne tranche jamais | **Valide, refuse ou demande un complément** (nom et date obligatoires) ; ne réécrit pas la proposition |
| Objectifs | Propose | Valide ou modifie |
| Pièces EBP | Importe ; jamais modifiées | Consulte |
| Comptes et rôles | — | Gère |
| Suppression | Jamais (archivage) | Jamais (archivage) |
| Rôles futurs (commercial, magasin, formation, administratif) | Aucun droit tant que le pôle n'est pas activé par décision | |

## Garanties vérifiées par les tests (`tests/socle-*.test.cjs`)

- Convergence de 3 appareils (téléphone, ordinateur, ordinateur de la direction) après travail hors connexion.
- Conflit sur un même champ : les deux valeurs conservées, l'utilisateur prévenu, résolution humaine tracée.
- Coupure réseau avant envoi ou réponse perdue : rien de perdu, rien appliqué deux fois.
- Appareil inconnu ou révoqué, usurpation d'auteur, pièce EBP modifiée, donnée invalide : refusés, motivés, tracés.
- Migration du jeu Samsung du 29/10 (3 garages, 60 visites, 12 devis) ; homonymes distincts ; retour au téléphone identique.
- Contrôle d'efficacité : 5 garde-fous sabotés volontairement, chacun détecté par au moins un test.

## Hors du Socle 0 (étapes suivantes, chacune sur accord)

Choix de l'hébergeur (Europe, coûts et RGPD à vérifier) · comptes réels avec double vérification · chiffrement et
sauvegardes · branchement du téléphone, du Bureau et de la Ville sur la base partagée · activation des pôles.
Prérequis aux données réelles : accord écrit de la direction (ticket #6).
