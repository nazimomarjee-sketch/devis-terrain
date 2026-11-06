# Vérification des comptes ODICOLOR + vue Commune avec « Mes garages » : périmètre minimal (PROPOSITION, aucun développement)

Statut : à valider par le propriétaire avant toute programmation. Préalable à l'étape 4 Samsung.

## Règle de base (non négociable)
- **EN COMPTE** : un code client EBP est relié au garage. Le lien vient d'un identifiant certain ou d'une liaison validée par une personne.
- **SANS COMPTE** : une personne a cherché dans EBP et déclaré « aucun compte ». La déclaration porte **son auteur et sa date**.
- **À VÉRIFIER** : tout le reste.
- **L'absence d'un garage dans un export EBP ne prouve jamais qu'il est sans compte**, que l'export soit complet ou non. Le programme ne déduit **jamais** « sans compte » tout seul.

## Lot A : mémoire des vérifications (sans écran)
- Deux types de décisions, enregistrés dans le **coffre chiffré** du PC. Rien n'est écrit dans le navigateur ni dans le dépôt.
  1. **Liaison validée** : garage du téléphone ↔ code client EBP. Le garage passe EN COMPTE.
  2. **Absence vérifiée** : le garage passe SANS COMPTE.
- **Contenu de chaque décision** : auteur, date, date de l'export clients EBP consulté, clés du garage.
  - Les clés sont : n° du garage dans le téléphone, SIRET s'il est connu, nom et code postal au moment de la décision.
- **Aux imports suivants**, la décision est réappliquée automatiquement, sauf dans deux cas où elle passe « à revérifier » et reste affichée :
  - un code EBP apparaît ensuite pour ce garage : EN COMPTE l'emporte, et l'absence déclarée est marquée **contredite** ;
  - le même n° de téléphone porte désormais un autre nom ou un autre code postal : la décision n'est **pas** appliquée en silence.
- **Rien n'est jamais supprimé** : une annulation est elle-même une décision datée, et l'historique est conservé.
- **Format du coffre** : version 1 → version 2, avec une migration testée. Un ancien coffre s'ouvre toujours.

## Lot B : écran « Vérifier les comptes » (Bureau, PC)
- **La liste** contient seulement les garages À VÉRIFIER. On peut la filtrer par département et par commune, et la trier avec les plus prioritaires d'abord : clients déclarés au téléphone et non retrouvés dans EBP, rapprochements incertains, puis prospects.
- **Pour chaque garage**, l'écran montre les **fiches EBP proches** : même code postal, nom ressemblant. Ce ne sont que des **suggestions**, jamais un lien automatique.
- **3 boutons** :
  - « C'est ce client EBP » (choix parmi les suggestions, ou saisie du code) ;
  - « Aucun compte dans EBP » ;
  - « Je ne sais pas ».
- **Sans saisie répétitive** :
  - l'auteur est choisi une seule fois par session, et la date est automatique ;
  - le garage suivant s'affiche tout seul ;
  - des raccourcis clavier sont disponibles (1, 2, 3) ;
  - on peut sélectionner plusieurs garages et déclarer « aucun compte » en une fois, avec une seule confirmation.
- **Alerte** quand une fiche EBP proche existe et qu'on clique « Aucun compte » : il faut confirmer en connaissance de cause.
- **Affiché en permanence** : la date de l'export clients EBP chargé, et le rappel que l'absence dans un export ne prouve rien.

## Lot C : vue Commune avec « Mes garages »
- **Même modèle et même dessin** que pour les données fictives. Les sources sont :
  - la sauvegarde du téléphone ;
  - les exports EBP (clients, pièces) ;
  - les décisions du lot A.
- **Ce qui change à l'écran** : l'étiquette « Données fictives » est remplacée par « Mes garages ». Les sources et dates sont visibles, et la fiche ouverte est la fiche d'origine du garage.
- **Le CA** de la vue Commune est le même calcul que celui de l'accueil, sur les exports réels.
- **Aucune donnée confidentielle n'est importée à cette étape.** Programmation et tests se font avec des fichiers fictifs aux **vrais formats** (sauvegarde du téléphone V47 / .odicolor, CSV EBP).
- **L'import réel par le propriétaire** n'aura lieu qu'après l'étape 4 de l'application locale (sauvegardes chiffrées hors du PC, restauration vérifiée), qui **n'est pas encore faite**.

## Exclu de ce périmètre
- L'application Samsung (étape suivante).
- L'annuaire SIRENE en ligne.
- La vue Département en tours LEGO.
- Les agents et l'agence.
- Toute écriture dans EBP.

## Tests prévus (données fictives uniquement)
**Lot A — règles et mémoire**
1. Sans décision humaine, aucun garage n'est SANS COMPTE, même absent d'un export clients complet.
2. Une absence sans auteur ou sans date est refusée.
3. Une suggestion EBP n'est jamais appliquée seule ; deux homonymes restent séparés.
4. Coffre enregistré, puis rouvert, puis mêmes imports : statuts identiques.
5. Nouvel export où le garage a un code EBP : EN COMPTE, et l'absence passe « contredite » (visible).
6. Même n° de téléphone avec un autre nom ou un autre code postal : décision non appliquée, garage « à revérifier ».
7. Une annulation rétablit À VÉRIFIER et l'historique reste complet.
8. Un garage disparu du téléphone garde sa décision, listée à part, jamais perdue.
9. Migration du coffre v1 → v2 : l'ancien coffre s'ouvre, le contenu est identique et les copies de secours sont intactes.

**Lot B — écran**
10. La déclaration groupée de N garages se fait avec une seule confirmation, et les compteurs sont mis à jour sans doublon.
11. L'auteur est saisi une fois ; les raccourcis et le passage au suivant fonctionnent ; l'alerte apparaît si une fiche EBP proche existe.
12. Les compteurs EN COMPTE, SANS COMPTE et À VÉRIFIER de la Ville, du département et de la commune sont recalculés immédiatement, sans doublon.

**Lot C — Mes garages**
13. Sauvegarde téléphone fictive + exports EBP fictifs : chaque garage du téléphone est soit placé, soit « à classer », soit écarté avec un motif (aucun perdu).
14. Aucune donnée fictive n'apparaît en mode « Mes garages », et inversement.
15. Le CA de la vue Commune est identique au CA de l'accueil, et les niveaux s'additionnent sans double comptage.
16. Rapidité : 1 500 garages, et une commune de 200 garages affichée en moins de 0,3 s.

**Non-régression**
17. Garde-fou de la Ville LEGO vert ; toutes les suites existantes vertes.
18. Fichiers de l'application téléphone inchangés ; tests de l'appli V47 verts.
19. Format des sauvegardes du téléphone inchangé.

## Risques
| Risque | Parade |
|---|---|
| N° de garage du téléphone réutilisé après une réinstallation | Nom et code postal contrôlés à chaque import (test 6) |
| Export clients EBP incomplet | Il ne sert qu'à **suggérer** ; il n'est jamais une preuve |
| Plusieurs personnes vérifient | L'auteur est enregistré à chaque décision. La gestion des droits est à décider plus tard |
| Données réelles avant les sauvegardes hors du PC | Import réel bloqué jusqu'à l'étape 4 de l'application locale |
