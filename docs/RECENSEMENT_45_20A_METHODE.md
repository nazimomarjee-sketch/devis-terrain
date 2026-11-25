# Recensement des établissements actifs 45.20A (95, 94, 91, 77, 93) : méthode et contrôles

Étape 1 du cadrage (`CADRAGE_AGENT_BD_RECENSEMENT_CARROSSERIES.md`). Les **résultats** (chiffres, fichier par commune) ne sont **pas** dans ce dépôt public : ils ont été remis au propriétaire, hors GitHub. Ce document décrit la méthode, les contrôles et les limites.
Départements dans l'ordre cité, **sans classement** : le fichier suit cet ordre et n'est jamais trié par nombre.

## 1. Pourquoi cette méthode
- **L'export officiel de l'Annuaire des Entreprises** (« Générer une liste CSV d'entreprises ») existe, mais la page est protégée par un contrôle anti-robot (Incapsula) qui refuse les lectures automatiques : elle ne répond qu'à un navigateur humain. Aucun contournement n'a été tenté.
- **Le total de l'API « Recherche d'entreprises »** compte des **entreprises** : le filtre de code ne s'applique qu'à l'entreprise, pas à ses établissements. Il surestime (établissements fermés ou d'un autre code) **et** sous-estime (entreprises d'un autre code principal). Mesuré le 08/11/2026 : en lisant l'API établissement par établissement, on perd environ 10 à 13 % des établissements 45.20A.
- **La lecture de l'API page par page** prend environ 10 minutes par département et se coupe à chaque redémarrage de la session.
- **Retenu : le fichier officiel du stock Sirene** (INSEE, publié sur data.gouv.fr, format Parquet, mis à jour au moins chaque mois), lu **partiellement**.

## 2. Ce qui est lu (et pas plus)
- Fichier `StockEtablissement` (2,23 Go) : lecture de 10 colonnes sur 54 pour tous les blocs de lignes, soit environ 540 Mo ; les 44,5 millions de lignes sont **toutes** examinées. La base nationale n'est pas téléchargée.
- Fichier `StockUniteLegale` (0,72 Go) : 5 colonnes (noms d'entreprises), seulement les blocs qui contiennent les entreprises retenues, soit environ 300 Mo.
- Lecture par morceaux de 8 Mo, reprise automatique, un fichier de reprise par bloc : un redémarrage de la session ne fait perdre qu'un bloc. Durée observée : environ 7 minutes pour les établissements, 3 minutes pour les noms.
- Outils : `bureau/outils/recensement/` (Python, `pq_distant.py`, `extraction-a.py`, `extraction-b.py`, `agreger-etablissements.py`) ; assemblage et contrôles : `bureau/recensement-assemblage.js` (testé) et `bureau/outils/recensement-assembler.cjs`. Les résultats vont dans `recensement-sortie/` (ignoré par git).

## 3. Règles de comptage
- **SIRET distincts** (14 chiffres) : jamais des SIREN.
- Le code **de l'établissement** (`activitePrincipaleEtablissement`) doit être **45.20A** (nomenclature NAF rév. 2) : un établissement 45.20A d'une entreprise d'un autre code est compté ; un établissement d'un code voisin ne l'est pas.
- **État actif** (`A`) de l'établissement ; département = **code officiel de la commune d'implantation**, pas le siège de l'entreprise.
- Source et dates conservées : fichier du stock du 01/11/2026 (publié le 03/11/2026), date d'extraction.

## 4. Contrôles (le résultat est « incomplet », sans aucun nombre, si l'un d'eux échoue)
- Lignes lues = lignes annoncées par l'en-tête du fichier ; blocs lus = blocs annoncés.
- 0 SIRET invalide, 0 doublon dans le résultat, 0 établissement d'un autre code ou d'un autre département.
- Les départements ne sont jamais classés ; aucun total n'est donné si un département manque.
- **Contrôle indépendant du 08/11/2026** (API officielle, interrogée à part) :
  - précision : 40 SIRET tirés au hasard dans le fichier (8 par département), 39 confirmés (45.20A, actif, même commune) ; le 40ᵉ est un établissement déclaré fermé rétroactivement après la date du stock (mise à jour INSEE du 05/11) ;
  - rappel : sur 6 pages de l'API (165 établissements), 164 sont dans le fichier ; le manquant a été enregistré après la date du stock (mise à jour INSEE du 06/11).
  Les deux écarts viennent de la date du stock (01/11) : le fichier est une photo à cette date.

## 5. Limites (à afficher avec tout chiffre)
- **45.20A = mécanique ET carrosserie.** Ce n'est **pas** une confirmation d'activité de peinture. Aucun établissement n'est qualifié « peintre ».
- Nombre au **01/11/2026** : les créations et fermetures postérieures n'y sont pas.
- Les établissements à **diffusion partielle** sont comptés, mais sans nom ni adresse publics.
- Les établissements totalement non diffusibles n'existent pas dans le fichier public.
- Code commune `93059` (Pierrefitte-sur-Seine) : présent dans le fichier officiel, absent du référentiel du Bureau (qui la range sous Saint-Denis, `93066`). Le **code officiel est conservé** ; seul le nom est ajouté (table `ALIAS_COMMUNES`).
- Le stock est un fichier **national** publié par l'INSEE : l'adresse des fichiers du mois suivant change. Les adresses sont dans `bureau/outils/recensement/*.py` (stock du 01/11/2026).
- À partir du 1ᵉʳ janvier 2027, l'INSEE ne publiera plus le stock au format CSV, mais seulement en Parquet : la méthode retenue est déjà en Parquet.

## 6. Format du fichier par commune
CSV `;`, UTF-8 avec BOM, une ligne par établissement, trié par département (ordre cité) puis commune puis SIRET :
`siret ; siren ; nom ; enseigne ; denomination_usuelle ; denomination_entreprise ; commune_insee ; commune ; departement ; code_postal ; naf ; diffusion` (`diffusion` : `O` = diffusible, `P` = partielle).
Un second fichier donne les comptes par commune (`departement ; commune_insee ; commune ; etablissements ; diffusion_partielle ; sans_nom`) et un troisième le résumé et le verdict des contrôles.

## 7. Import futur dans « Marché à prospecter » (préparé, non branché)
`bureau/marche-sirene.js` relit ce CSV et produit, par département, le **format du marché que le Bureau lit déjà** :
- tous les établissements sont **« à qualifier »**, **en gris**, jamais une couleur commerciale, **même si leur nom évoque la carrosserie** ;
- niveau de preuve d'activité peinture : **inconnu** (il ne changera que par une preuve : achat EBP, constat terrain…) ;
- SIRET invalides, doublons et communes hors des cinq départements : comptés à part, jamais perdus en silence ;
- aucune fusion avec un garage de « Mes garages » sans SIRET commun ou liaison validée par une personne.
L'écran d'import dans le Bureau n'est pas encore programmé : prochaine étape, sur ton accord.

## 8. Tests
`tests/bureau-comptage-sirene.test.cjs` (méthode par l'API, conservée comme contrôle), `tests/bureau-recensement-assemblage.test.cjs`, `tests/bureau-marche-sirene.test.cjs` : fichiers fictifs, avec erreurs volontaires vérifiées (fichier non lu en entier accepté, doublons, nombre partiel donné, qualification « peintre » d'après le nom…). Les scripts Python d'extraction ne sont pas couverts par des tests automatiques : leur résultat est contrôlé à chaque exécution par l'assemblage (nombre de lignes et de blocs lus).
