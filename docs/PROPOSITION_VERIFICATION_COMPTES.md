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

---

## Lot A réalisé le 07/11/2026 (données fictives, aucune donnée réelle)

**1. État réel de la connexion Bureau ↔ coffre, vérifié avant de programmer**
- Prouvée par tests automatiques dans ce dépôt (`tests/local-bureau-navigateur.cjs`, 3/3). Le programme local tourne en processus séparé, il est arrêté brutalement puis relancé, et tout est retrouvé après le mot de passe.
- Les tests du coffre (15/15) et du serveur (9/9) sont verts.
- **Jamais essayée sur ton PC.** L'étape 4 (sauvegardes chiffrées hors du PC, restauration vérifiée) n'est pas faite.
- **Ce que le coffre enregistrait avant le lot A :** sauvegarde du téléphone (fiches telles quelles), garages du Bureau, exports EBP et date d'export.
- **Ce qu'il n'enregistre pas :** l'objectif mensuel et le code représentant (gardés dans le navigateur de ce PC), et la tournée en cours.
- **Écart constaté :** la police des nouvelles vues (fichiers à la racine du dépôt) n'est pas servie par le programme local. La police de secours s'affiche. À corriger au lot C.

**2. Ce qui est fait**
- `bureau/decisions-comptes.js` : journal des décisions, qui ne fait que grandir. Trois types : liaison EBP validée, absence vérifiée, annulation.
  - Chaque décision porte un auteur, une date, une source, la date de l'export clients consulté et les clés du garage (n° téléphone, nom, code postal, SIRET).
  - **Une liaison n'est jamais créée par le programme :** seule une décision humaine en crée une.
  - **Annuler ne réactive jamais une décision plus ancienne :** le garage redevient « à vérifier ».
  - **Une décision n'est pas appliquée** dans six cas, et l'état est affiché avec son motif :
    - **à revérifier :** même n° de téléphone mais autre nom ou autre code postal ;
    - **contredite :** absence déclarée alors qu'une fiche EBP au même nom et au même code postal existe ;
    - **conflit :** un même code EBP relié à deux garages ;
    - **en attente :** code EBP absent des exports chargés ;
    - **orpheline :** garage absent de la sauvegarde chargée ;
    - **remplacée :** une décision plus récente existe pour le même garage.
- `bureau/ville/modele-commune.js` : accepte `aRevoir`. Un garage dont la décision est contredite ou douteuse redevient « à vérifier », avec le motif.
- `bureau/index.html` (logique seulement, aucun affichage nouveau) :
  - état du coffre en **version 2**, qui contient le journal ;
  - un ancien coffre (version 1) s'ouvre avec un journal vide ;
  - un journal illisible est conservé tel quel et bloque les nouvelles décisions ;
  - aucune décision n'est possible sur la démo.
- `local/serveur.js` : accepte les états en version 1 et 2, refuse tout autre format.

**3. Tests**
- `tests/bureau-decisions-comptes.test.cjs` : 10/10.
- `tests/local-decisions-navigateur.cjs` : 4/4 avec le vrai programme local. Les scénarios couverts sont :
  - fermeture, arrêt brutal, relance ;
  - contradiction après un nouvel import ;
  - ancien coffre version 1 ;
  - aucune décision possible sur la démo.
- **Erreurs volontaires :** 9 introduites, chacune repérée par au moins un test.
- **Non-régression :** toutes les suites existantes sont vertes (Ville LEGO, coffre, application téléphone). Aucun fichier de l'application téléphone n'est modifié.

**4. Limites**
- **Pas d'écran.** Les décisions ne sont accessibles que par programme ; l'écran est le lot B.
- **Contradiction détectée seulement** quand une fiche EBP a exactement le même nom (normalisé) et le même code postal. Une « SARL … » ou un nom abrégé ne déclenche rien : ces cas seront montrés comme suggestions dans l'écran du lot B.
- **Un seul auteur par décision**, en texte libre, sans gestion des droits.

## Lot B réalisé le 07/11/2026 (données fictives)

**Écran** : adresse `#verifier-comptes` du Bureau. On y accède par le bloc « Comptes ODICOLOR » de l'écran Bureau, qui n'apparaît qu'avec ta sauvegarde téléphone.
- **Fichiers** :
  - `bureau/verifier-comptes.js` ;
  - `bureau/verifier-comptes.css` (styles séparés) ;
  - `bureau/index.html` : route, bloc « Comptes ODICOLOR », et une seule fonction de décision partagée par l'écran et les tests.
- **Compteurs** En compte / Sans compte / À vérifier / Total : calculés sur le même modèle que Ma Ville, chaque garage une seule fois. Un garage relié à son client EBP ne compte plus qu'une fois.
- **Trois décisions** :
  - « C'est ce client EBP » : inactif tant qu'aucune fiche n'est choisie, puis confirmation ;
  - « Aucun compte ODICOLOR vérifié » : confirmation. Si une fiche EBP ressemble au garage, il faut cocher « aucune de ces fiches n'est ce garage », et les fiches sont notées « écartées » dans la décision ;
  - « Je ne sais pas » : rien n'est enregistré, le garage est marqué « passé » pour la session.
- **Suggestions EBP** : il faut le même code postal ou la même ville, et un mot significatif commun ou un nom identique. Les formes juridiques et les mots génériques (« SARL », « garage », « carrosserie »…) sont ignorés. Une suggestion n'est **jamais cochée d'avance**, et le motif de la ressemblance est affiché.
- **Déclaration groupée « sans compte »** : une case de confirmation explicite est obligatoire. Les garages avec une fiche EBP proche, ou déclarés clients au téléphone, sont **exclus** et doivent être traités un par un.
- **Auteur déclaré** : saisi une fois par session et marqué « non authentifié ». Il n'est pas retenu d'une session à l'autre.
- **Correction** : une nouvelle décision remplace l'ancienne, qui reste visible dans l'historique comme « remplacée ». Une annulation est elle-même une décision.
- **Alertes** : un onglet regroupe les ressemblances apparues après une décision, les garages modifiés, les conflits, les décisions orphelines et celles en attente.
- **Règle 9** : une ressemblance de nom **n'annule jamais** une décision. Le garage reste « sans compte », avec une alerte « à examiner ». Le lot A a été ajusté dans ce sens : la décision est appliquée avec une alerte.
- **Enregistrement** : l'écran indique si les décisions vont dans le coffre chiffré. Si le Bureau est ouvert sans l'application locale, il prévient que les décisions seront perdues à la fermeture.

**Tests**
- `tests/bureau-verifier-comptes.test.cjs` : 2/2.
- `tests/local-verifier-comptes-navigateur.cjs` : 3/3, avec le vrai coffre. Le parcours complet est testé : groupé, liaison, absence, « je ne sais pas », correction, annulation, arrêt brutal, réouverture, alerte après un nouvel export. Le format tactile est vérifié, ainsi que l'avertissement sans application locale.
- Le lot A est mis à jour : 10/10, 4/4.
- Toutes les suites existantes restent vertes.
