# Vue Commune — découpage technique minimal (proposition, AUCUN développement)

Premier écran choisi par le propriétaire. Référence graphique figée : `maquettes/ma-ville-reference/`.
Statut : **proposition à valider avant toute programmation.**

## 1. Objectif et périmètre

**Objectif :** dans une commune, **retrouver tous les garages**, **voir leur statut** et **ouvrir leur fiche**, sur PC et sur Samsung.

| Inclus (premier développement) | Exclu (plus tard, chacun validé à part) |
|---|---|
| Bâtiments par établissement (carrosserie, mécanique, à qualifier, hors cible) + agence si la commune est Goussainville | Vue département (tours) et accueil Ma Ville |
| Liste complète triée, numéros identiques sur la scène et dans la liste | Suggestions du cockpit (panneau prévu, vide) |
| Couleurs, dormant, alertes, mentions « plan schématique » / « données fictives » | Pointage, avatar, obstacles (emplacements réservés) |
| Aperçu au clic ou au toucher, puis fiche (existante) | Écriture de données : **la vue est en lecture seule** |
| Recherche d'une commune, liste des communes | Appel à l'annuaire SIRENE en ligne |

## 2. Ce qui est réutilisé (vérifié dans le code)

| Existant | Usage dans la vue Commune |
|---|---|
| `bureau/bureau-logique.js` : `classer`, référentiel officiel des communes | Rattacher chaque garage à sa commune (INSEE) ; les garages sans commune restent « à classer » |
| `bureau/ma-ville.js` : `construire` (terrain + EBP + annuaire, sans doublon) | Segment (4 couleurs / gris), client inactif, compte bloqué, sources |
| `bureau/ville-pipeline.js` : `segmentsVille`, `alimenterVille` | Relier les garages à EBP (homonymes jamais reliés au hasard), statut, actions |
| `bureau/reveil.js` | Règles « allumé / partiel / éteint » pour les chiffres de la commune |
| `bureau/index.html` (fiche existante, recherche, état) | Ouverture de la fiche ; routes ; pont vers le coffre |
| `local/` (coffre, programme local) | Aucune modification : l'état enregistré reste le même |
| Sources de la référence (`iso.js`, `batiments.js`, `data95.js`) | Base du dessin, après remise en forme en module testable |

## 3. Découpage proposé (4 briques, dans cet ordre)

### A. Modèle de commune — `bureau/ville/modele-commune.js` (sans affichage, testable sous Node)
Entrée : garages du téléphone, EBP (clients, pièces), plus tard Airtable et SIRENE. Sortie, pour une commune :
`{ commune, insee, etablissements[], comptes, sources, avertissements }`. Chaque établissement porte :
`uid` (stable) · `nom` · `type` (carrosserie, mécanique, inconnu) · `segment` (4 couleurs ou à qualifier) ·
`qualification` (confirmé / probable / à vérifier / hors cible) · `dormant` (+ durée) · `alertes[]` · `sources[]` · `rang` (tri).
**Emplacements réservés, vides pour l'instant :** `dernierPointage`, `obstaclesOuverts[]`, `aideDirection`.
Règles de comptage figées par la référence : un dormant **reste client** ; à qualifier et hors cible comptés **à part** ;
aucune valeur inventée (« Inconnu » sinon).

### B. Rendu de commune — `bureau/ville/rendu-commune.js` + `bureau/ville/ville-commune.css`
Dessin repris de la référence : un bâtiment par établissement, numéros, au plus 5 personnages, pastille dormant,
mentions obligatoires. **Au-delà de 40 établissements :** regroupement par îlot (bloc « +N ») et liste complète.
Clic ou toucher : aperçu ; deuxième geste : fiche. Clavier : Tab / Entrée / Échap.
Les styles sont dans **un fichier séparé** : le bloc de styles de la Ville actuelle, verrouillé par le garde-fou, n'est pas touché.

### C. Intégration PC (Bureau)
Nouvelle route `#commune-<INSEE>` ; accès par la recherche et par une liste des communes. Ajouts **de logique seulement**
dans `bureau/index.html` (route, chargement des scripts). La Ville LEGO actuelle reste en place et intacte.

### D. Intégration Samsung (lot séparé, validé à part)
Même modèle (A) et même rendu (B), présentés en format vertical (scène en haut, liste au pouce en bas).
Données : celles du téléphone (garages) et du plan du PC (chiffres EBP). L'application en service étant concernée :
reconstruction de la liste des fichiers hors ligne et des empreintes d'intégrité (`scripts/build-pwa.cjs`), essais sur la vraie appli,
**aucune nouvelle base de données sur le téléphone** dans ce lot.

## 4. Anticiper le pointage et la vue Direction (sans les développer)
- Emplacements réservés dans le modèle (A) et la fiche : « Dernier pointage », « Obstacles en cours », « Aide demandée ».
  Affichés « fonction à venir » tant qu'ils sont vides.
- Le rendu (B) prévoit l'emplacement de l'avatar, désactivé.
- **À faire évoluer plus tard** : l'entité `visite` du Socle (`socle/modele.js`) ne connaît que `date`, `resultat` (vu/absent/rappeler)
  et `note`. Le pointage demandera : arrivée, départ, mode « déclaré », résultat observable, obstacles, solutions,
  aide de la direction, prochaine action datée. Ce sera une **nouvelle version du modèle avec migration testée**, pas une retouche.

## 5. Données et sauvegardes
- Vue **en lecture seule** : aucune écriture dans le coffre, dans le téléphone ni dans EBP.
- Format de l'état enregistré dans le coffre et format des sauvegardes du téléphone **inchangés** (vérifiés par test).
- Données réelles : seulement après les sauvegardes chiffrées et la restauration vérifiée (étape 4 de l'application locale).
- Aucun appel réseau ajouté. L'annuaire SIRENE en ligne (`bureau/annuaire.js`) reste un import volontaire, à décider à part.

## 6. Risques

| Risque | Gravité | Parade |
|---|---|---|
| Abîmer la Ville actuelle | Élevée | Nouveaux fichiers, styles séparés, garde-fou d'invariance existant + essai de non-régression |
| Toucher l'application Samsung en service | Élevée | Lot D séparé, essais sur la vraie appli, fichiers hors ligne et empreintes reconstruits, ton accord avant fusion |
| S'écarter de la référence figée | Moyenne | Test de conformité visuelle sur les données fictives de la référence (écart mesuré par rapport aux images) |
| « Hors cible » n'existe pas sur le téléphone | Moyenne | Affiché seulement s'il vient d'une source qui le connaît (reprise Airtable plus tard) ; jamais deviné |
| Mauvais rattachement à la commune (code postal ambigu, homonymes) | Moyenne | Règles existantes : référentiel officiel, « à classer », homonymes non reliés |
| Communes très denses (> 40) et 1 000+ garages | Moyenne | Regroupement + liste ; essais de rapidité sur 200 établissements dans une commune et 1 500 au total |
| PC indépendant vs annuaire SIRENE en ligne | Moyenne | Pas d'appel réseau dans ce lot ; décision séparée |
| Lisibilité sur petit écran | Faible | Essai au format Galaxy, zones tactiles ≥ 44 px vérifiées |

## 7. Tests nécessaires avant de déclarer le lot terminé

**Modèle (Node, données fictives)**
1. Tous les établissements d'une commune sont présents, une seule fois (pas de doublon, homonymes non fusionnés).
2. Comptage : dormant compté client ; à qualifier et hors cible à part ; total = somme des catégories.
3. Aucune valeur inventée : CA, dernier pointage, obstacles absents → « Inconnu » ou vide, jamais zéro deviné.
4. Rattachement : codes postaux ambigus → « à classer » ; garages hors Île-de-France exclus.
5. Sources affichées pour chaque information ; données fictives marquées.

**Rendu et navigation (navigateur, PC et format Samsung)**
6. Chaque numéro de la scène correspond à la même ligne de la liste, et inversement.
7. Clic / toucher : aperçu puis fiche ; clavier : Tab, Entrée, Échap.
8. Au-delà de 40 établissements : regroupement, et tous restent accessibles par la liste.
9. 5 personnages au plus ; l'avatar n'apparaît jamais (pointage non activé).
10. Mentions obligatoires présentes ; zones tactiles ≥ 44 px au format Galaxy.
11. Rapidité : affichage d'une commune de 200 établissements en moins de 0,3 s ; aucune erreur dans la page.
12. Conformité visuelle à la référence figée sur les mêmes données fictives (écart sous un seuil défini).

**Non-régression et sécurité des données**
13. Garde-fou d'invariance de la Ville actuelle vert ; toute la suite existante verte.
14. État du coffre et sauvegarde du téléphone : formats inchangés, relecture identique.
15. Lot Samsung : essais sur la vraie appli (hors ligne, mise à jour), empreintes d'intégrité vérifiées.
16. Sabotages : chaque garde-fou retiré volontairement doit faire échouer un test.

## 8. Ordre proposé et validations
A (modèle + tests) → B (rendu + tests, PC, données fictives) → C (Bureau) → **validation** → D (Samsung) → **validation**.
Une décision à la fois ; aucune fusion sans accord.
