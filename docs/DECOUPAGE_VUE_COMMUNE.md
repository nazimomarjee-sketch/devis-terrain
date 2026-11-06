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

## 9. Étape 1 réalisée (modèle de commune, données fictives) — `bureau/ville/modele-commune.js`

Non branché : aucune page (Bureau, téléphone) ne le charge encore. Tests : `tests/ville-modele-commune.test.cjs` (14/14, 3 passages).
Écart assumé par rapport au §3-A : les emplacements de suivi (pointage, obstacles, aide de la direction) existent dans le modèle
mais **ne seront pas affichés** tant qu'ils sont vides (exigence du propriétaire).
Règle plus stricte que la Ville connectée actuelle : un même nom dans la même commune n'est **plus relié automatiquement** ;
il devient une proposition « à confirmer ». Seuls le SIRET, le code client EBP ou une liaison validée par une personne fusionnent.

**Règle des clients dormants (corrigée)** : 60 jours sans commande → réachat à vérifier ; 90 jours → potentiellement dormant ;
12 mois → inactif. Ce sont des valeurs de départ réglables. Les seuils s'adaptent au rythme d'achat du client quand on connaît au moins 3 commandes.
Si l'historique est incomplet, l'établissement est classé « à vérifier ». Les statuts Airtable sont conservés avec leur source.
Le modèle signale aussi les clients dont les achats ralentissent (`ralentit`) ; les propositions de l'Agent Business Developer ne sont pas encore faites.
Tests : `tests/ville-modele-commune.test.cjs` (20/20).

## 10. Étape 2 réalisée (dessin de la vue Commune, données fictives)

Fichiers nouveaux, **non branchés au Bureau** :
- `bureau/ville/dessin-iso.js` : moteur de dessin de la référence ;
- `bureau/ville/vue-commune.js` ;
- `bureau/ville/ville-commune.css` : styles séparés, la Ville actuelle n'est pas touchée ;
- `bureau/ville/fictif-95.js` ;
- `bureau/ville/demo-commune.html` : page de démonstration.

Tests : `tests/ville-commune-navigateur.cjs` (7/7, Chromium, Internet coupé, PC et Galaxy S9+). Chaque garde-fou retiré volontairement fait échouer au moins un test.

Ce que la vue fait :
- un bâtiment par établissement, avec les mêmes numéros que dans la liste ;
- l'agence à Goussainville (emplacement symbolique) et les mentions obligatoires ;
- le « ? » réservé aux établissements à qualifier ; un métier inconnu affiche un repère gris neutre ;
- les signaux dormant (☾), réachat (↻) et alerte (!), sans changer les 4 couleurs ;
- au-delà de 40 établissements, 39 bâtiments plus un îlot « +N · liste » ;
- au plus 5 personnages ;
- un 1er geste ouvre l'aperçu, un 2e ouvre la fiche ; au clavier, Entrée ouvre et Échap ferme.

Limites connues :
- **La fiche n'est pas encore reliée** : la démo affiche seulement « fiche demandée ». Ce sera l'étape 3.
- **Le zoom** est un simple agrandissement, sans déplacement à la main.
- **Sur téléphone, l'aperçu recouvre une partie de la scène.** À revoir à l'étape 4 (Samsung), par exemple en panneau qui monte du bas.
- **Le test de conformité visuelle à la référence** (§7, test 12) n'est pas automatisé : la vérification a été faite à l'œil sur les captures.
- Emplacements dans la commune : schématiques, jamais réels.

## 11. Cadrage Ma Ville : sélecteur commercial EN COMPTE | SANS COMPTE (décision du propriétaire)

Le sélecteur est très visible et disponible dans les vues **Île-de-France, Département et Commune**, sur PC et sur Samsung.
C'est un **filtre indépendant** : les 4 couleurs commerciales ne changent pas.

| Choix | Contenu | Règle |
|---|---|---|
| **EN COMPTE** | Garages ayant un compte client ODICOLOR confirmé dans EBP (code client EBP) | Les dormants et les comptes bloqués sont compris, avec leurs alertes distinctes |
| **SANS COMPTE** | Garages dont l'absence de compte est **confirmée**, à prospecter pour une ouverture de compte | Il faut une vérification enregistrée : qui, quand, quelle source. Sans auteur ou sans date, la vérification est refusée |
| **À VÉRIFIER** | Situation inconnue, rapprochement EBP incertain (même nom sans identifiant commun), client déclaré mais non retrouvé dans EBP | **Jamais classé « sans compte » automatiquement**, même si une vérification existe |
| **TOUT** | Tous les établissements | — |

- Les compteurs sont sans doublon : chaque établissement est dans une seule case.
- La somme des communes donne le département, et la somme des départements donne l'Île-de-France.
- Les établissements sans commune (« à classer ») sont comptés à part.
- Les numéros d'un établissement restent les mêmes quel que soit le choix.
- **Conséquence sur les données réelles** : EBP ne contient pas de SIRET. Au départ, presque tous les prospects seront donc « à vérifier ». La colonne SANS COMPTE se remplira au fil des vérifications. Il faudra un écran de vérification, à décider.

## 12. Étape 3 réalisée (vue Commune dans le Bureau, données fictives)

**Fichiers**
- `bureau/index.html` : ajouts de logique seulement.
  - Nouvelles adresses `#communes`, `#communes-DD` et `#commune-INSEE`.
  - La recherche trouve aussi une commune, un code postal, un département, un nom de garage ou un SIRET.
  - Les établissements de Ma Ville s'ouvrent dans la fiche commerciale existante, complétée par un bloc Ma Ville : compte, catégorie, signal d'achat, alertes, SIRET, statuts historiques et sources datées.
- `bureau/ville/fictif-idf.js` : données fictives des départements 75, 77, 78, 91, 92, 93, 94 et 95.
  - Sarcelles compte 334 établissements.
  - Ce fichier inclut aussi les 58 garages de démo du Bureau. Chacun est relié à son compte EBP fictif par une liaison validée : aucun doublon.

**Tests**
- Modèle : `tests/ville-modele-commune.test.cjs`, 25/25.
- Parcours complet : `tests/ville-commune-bureau-navigateur.cjs`, 8/8 (Bureau → Recherche → Commune → Garage → Fiche ; sélecteur dans les vues Département et Commune ; PC et Galaxy S9+ ; préservation).
- Les suites existantes sont toutes vertes : garde-fou de la Ville, coffre, application téléphone.
- Chaque garde-fou retiré volontairement fait échouer au moins un test.

**Limites**
- **Données fictives seulement.** En mode « Mes garages », la vue Commune affiche un message et aucune donnée fictive.
- **La vue Département est une liste.** La vue LEGO en tours de la référence n'est pas encore construite.
- **L'onglet « Commandes » de la fiche** reste vide pour les établissements de Ma Ville qui ne viennent pas de la démo du Bureau.
- **Le bouton « Planifier une visite »** est désactivé sur un établissement fictif.
- **Pas d'onglet dans l'en-tête.** On accède à la vue par la recherche, puis par le fil d'Ariane. C'est un choix fait pour ne pas modifier le design.
- **Application Samsung** : non modifiée. Elle sera traitée à l'étape 4.

## 13. Cadrage : CA facturé HT du mois en cours (décision du propriétaire, 07/11/2026)

**Où le voir**
- **Accueil du Bureau :** CA global, progression vers l'objectif mensuel, part attribuée à une commune, part non attribuée et CA personnel.
- **Ma Ville :** l'Île-de-France, chaque département, chaque commune et chaque garage (aperçu et fiche).

**Règles appliquées** (module `bureau/ca-facture.js`, tests `tests/bureau-ca-facture.test.cjs` et `tests/bureau-ca-navigateur.cjs`)
- **Ce qui compte :** seules les factures émises, à leur date, hors taxes. Les avoirs sont déduits à **leur** date.
- **Ce qui ne compte jamais :** commandes, devis, bons de livraison et encaissements.
- **Doublons :** un numéro de pièce n'est compté qu'une fois, et le doublon est signalé.
- **Rattachement :** uniquement par le **code client EBP**. Le chemin est : client EBP → établissement → commune (référentiel officiel) → département. Jamais par le nom.
- **Non attribué :** une facture sans code, avec un code inconnu ou pour un client sans commune reconnue n'est attribuée à aucune commune. Elle est **affichée à part**, avec son motif. Le total global vaut Île-de-France + non attribué, et c'est vérifié à chaque calcul.
- **Pas de double comptage :** la somme des garages donne la commune, la somme des communes donne le département, la somme des départements donne l'Île-de-France.
- **Fraîcheur :** la date du dernier export EBP est toujours affichée, avec la mention « pas en temps réel ». Les données incomplètes sont signalées : lignes écartées à l'import, doublons, avoir illisible.
- **Pas de faux zéro :** sans export, ou avec un export d'un mois passé, on affiche « Non renseigné ». Un garage sans compte EBP affiche aussi « Non renseigné ». Un client en compte sans facture ce mois affiche un 0 réel.
- **CA personnel :** seulement si le fichier clients EBP contient une colonne représentant et si ton code est saisi. Sinon, « Non renseigné ».
- **Sélecteur de compte :** il ne change pas le CA. Le CA couvre toutes les catégories.

**Choix à ta place, réversibles**
- **L'objectif mensuel n'est pas écrit dans le code** (le dépôt est public). Tu le saisis dans le Bureau, et il est gardé sur ce PC.
- **Le code représentant** est aussi saisi dans le Bureau.

**Limites**
- **Ma Ville ne montre encore que des données fictives.** L'accueil, lui, calcule sur tes exports EBP dès qu'ils sont chargés.
- **Le format réel de l'export EBP n'est pas confirmé.** En particulier, on ne sait pas si l'export liste une ligne par article ou une ligne par facture : une facture sur plusieurs lignes est signalée « à vérifier ».

## 14. Cadrage : agence ODICOLOR interactive (maquette seulement, aucun développement)

**Parcours :** Ma Ville → clic sur le bâtiment ODICOLOR → intérieur de l'agence → choix d'un agent → fiche de l'agent → « Donner une mission ».

**Zones de l'agence :** bureaux et pôles de travail, comptoir, magasin et stocks, rayonnages et palettes, zone de préparation et d'expédition (quai, chariot).

**Agents IA :** Business Developer, Achats, Logistique, Analyste, Technicien Méthodes, Ingénieur, Ingénieur logiciel. Chacun a un poste placé selon sa fonction.

**Règles**
- **Agents IA et collaborateurs bien distincts :** chaque agent IA porte un badge « IA ». Les postes des vrais collaborateurs ODICOLOR sont marqués « collaborateur », sans nom inventé.
- **Aucune mission inventée :** une mission en cours n'apparaît que si elle existe réellement. Aucune action humaine n'est simulée.
- **Aucun démarrage spontané :** un agent ne démarre aucune mission sans ta demande explicite. Toute action externe ou modification de données demande ton autorisation.
- **Stocks et palettes :** données vérifiées quand elles seront disponibles. Sinon, « Non renseigné ».

**La référence Ma Ville reste figée.** La maquette se trouve hors du dépôt.

## 15. Lot C réalisé le 07/11/2026 : vue Commune avec « Mes garages » (données fictives, vrai coffre)

**Ce qui est fait**
- **« Mes garages » dans les vues Île-de-France, Département et Commune.**
  - Les données viennent de la sauvegarde du téléphone, des exports EBP et des **décisions de compte du coffre** (lots A et B).
  - Le modèle est celui de la démo : même dessin LEGO, mêmes 4 couleurs, mêmes numéros.
  - L'étiquette « DONNÉES FICTIVES » devient « MES GARAGES ». La démo et « Mes garages » ne se mélangent jamais.
- **Identifiants fiables.** Un garage du téléphone est relié à un client EBP seulement par :
  - son SIRET ;
  - son code client EBP ;
  - ou une liaison validée par une personne (lot B).
  Un même nom ne fusionne jamais, y compris avec un établissement du marché.
- **Deux informations séparées.** Dans la liste, l'aperçu et la fiche :
  - « Téléphone : client / prospect / absent du téléphone », avec sa date ;
  - « Compte EBP : en compte / sans compte / à vérifier », avec sa source.
  Un garage déclaré client au téléphone mais absent d'EBP reste « à vérifier ».
- **Périmètre « Mes garages | Marché à prospecter | Tous ».**
  - « Mes garages » est le choix par défaut ; la démo montre tout.
  - Le marché (annuaire officiel) porte un badge, un texte « Annuaire officiel seul : jamais travaillé » et une couleur grise : jamais une couleur commerciale.
  - Le périmètre est indépendant du filtre en compte / sans compte. Les numéros restent identiques dans chaque périmètre.
- **Tous les garages sont listés**, même quand il y en a trop pour le LEGO. Test : une commune de 60 garages du téléphone + 250 du marché affiche 39 bâtiments, un îlot « +21 · liste », et les 310 lignes accessibles (recherche dans la liste, recherche globale par nom ou SIRET).
- **Sources et dates affichées** : téléphone, clients EBP, pièces EBP, annuaire officiel, nombre de décisions du coffre.
- **CA du mois et accueil** : calculés par le même modèle (« un seul système »). Le CA est rattaché par code client EBP, avec un « non attribué » séparé.
- **En-tête de la fiche** : sa couleur et son statut viennent du même modèle que la liste. L'ancien rapprochement par le nom, qui contredisait la liste, n'est plus utilisé pour cet en-tête.
- **Les compteurs de l'écran « Vérifier les comptes »** ne comptent que Mes garages ; le marché n'y entre pas.

**Coffre inaccessible : aucune décision** (point 2 de la demande)
- Coffre arrêté, verrouillé, ou Bureau ouvert sans l'application locale : la fonction refuse et les boutons sont bloqués. Un avertissement seul ne suffisait pas.
- Si un enregistrement échoue après une décision, **la décision est annulée à l'écran** avec un message. Il n'y a jamais de décision affichée qui ne serait pas retrouvée.
- Le retour du coffre est détecté (toutes les 3 s), puis les décisions redeviennent possibles.

**Tests**
- `tests/local-mes-garages-navigateur.cjs` : 5/5. Il couvre le vrai coffre, l'arrêt brutal puis la réouverture, la commune dense, les vues département et accueil, le format Samsung et l'absence de données fictives.
- `tests/local-coffre-inaccessible-navigateur.cjs` : 3/3.
- 7 erreurs volontaires sur le lot C et 3 sur le coffre inaccessible : toutes repérées.

**Limites**
- **Le marché est lu dans le cache du navigateur** (import du 91 existant), pas dans le coffre. Il n'est donc pas sauvegardé avec lui. Le recensement des 5 départements est un chantier à part (cadrage : `CADRAGE_AGENT_BD_RECENSEMENT_CARROSSERIES.md`). Ce lot ne le remplace pas.
- **Aucun avis Google, aucun Pappers** : rien de cela n'est branché.
- **L'écran Département reste une liste**, pas les tours LEGO de la référence.
- **Application Samsung non modifiée** : l'étape 4 reste à faire.
- **Rien n'a été essayé avec tes données réelles** : elles attendent les sauvegardes chiffrées hors du PC.
