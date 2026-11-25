# Feuille de route commune — Téléphone Samsung + Bureau

Mise à jour : 05/11/2026. Règle : **une étape à la fois**, chaque étape a ses tests automatiques
avant tout essai sur Samsung. Rien n'est fusionné, publié ou mis en production sans accord.

## Où on en est

| Brique | État | Preuve |
|---|---|---|
| Téléphone V47 (`main`) | En service | 22 tests |
| Téléphone Lot 1 — sauvegarde complète `.odicolor` (PR #2, brouillon) | Terminé, essais Samsung en grande partie réussis | 82 tests + 19 essais navigateur ; ticket #4 validé sur Samsung |
| Bureau — Ville, carte, simulation (`bureau/`) | Récupéré (version du 31/10) | 58 tests + 9 essais navigateur |
| Bureau — Lot 2 annuaire du 91 | Code présent, jamais testé contre le vrai annuaire depuis ici | Testé avec un annuaire simulé |
| Liaison téléphone → Bureau | **Faite** (05/11) : `.odicolor` avec contrôle d'intégrité + ancien `.json` | Fichiers d'essai produits par le code du téléphone ; même verdict que lui sur 1 800+ cas ; pas encore essayé sur Samsung/PC |
| Données réelles | **Bloqué** par le ticket #6 | — |

## Étapes, dans l'ordre

1. ~~**Liaison téléphone → Bureau (format Lot 1)**~~ — **faite le 05/11/2026** (`bureau/lecture-sauvegarde.js`).
   Lecteur propre au Bureau (le module du téléphone n'est pas encore sur `main`) ; la concordance est garantie par
   le contrôle croisé `TELEPHONE_LOT1`. À refaire si le format du téléphone change.
2. **Clore le Lot 1 téléphone** — fermer #4 (validé), revérifier #5, fermer la PR #3 (doublon de la #2). Fusion sur ton accord.
3. **Préalables aux données réelles (#6)** — accord du responsable ; sauvegardes stockées hors du dépôt public ;
   ajouter à la vérification GitHub un contrôle qui refuse tout fichier contenant SIRET, téléphone ou e-mail.
4. **Marché du 91 fiable** — comparer l'annuaire en ligne au fichier officiel complet SIRENE (téléchargeable, filtré 45.20A + 91)
   pour mesurer ce qui manque ; garder « carrosserie probable » comme hypothèse jusqu'à confirmation terrain.
5. **Retour Bureau → téléphone** — exporter une liste de garages à visiter (tournée) que le téléphone importe dans Réglages,
   sans jamais créer de doublon ni écraser une fiche.
6. **Exports EBP** — à partir d'un export réel **anonymisé** (en-têtes de colonnes + 2 lignes fictives) : import contrôlé, rapport lignes acceptées / refusées.
7. **Simulation sur données réelles** — seulement après 3 à 6 : calage sur EBP, badges Confirmé / Hypothèse.

## Points techniques à ne pas oublier

- Le Bureau sera servi au même endroit que le téléphone (`/bureau/`) : vérifier que le cache hors ligne du téléphone (`sw.js`) ne le sert pas de travers.
- Ajouter l'essai navigateur du Bureau à la vérification GitHub (nécessite Playwright).
- Le dépôt est public : toute donnée réelle reste sur l'appareil ou dans un stockage privé.

## Cockpit ODICOLOR 2.0 (décidé le 06/11/2026)

> **Règle du propriétaire (06/11/2026) — Ville LEGO.** La Ville est un élément central : bâtiments, personnages,
> animations, interactions et design sont conservés intégralement. Le cockpit **alimente** la Ville avec les données
> commerciales ; il ne la remplace jamais par un tableau de bord. Toute modification importante de la Ville
> (`dessinerVille`, `figurine`, `persoVille`, `volume`, `vueVille`, fiches, styles de la scène) exige l'accord préalable du propriétaire.

4 espaces : Terrain (téléphone) · Bureau (pipeline EBP) · Ma Ville (`bureau/`, carte et marché) · Mon Business (CA, marge, objectifs).
Une donnée = une source : terrain → téléphone ; transactions, prix, marge → exports EBP ; marché → annuaire/SIRENE ; objectifs → validés avec Faizal.

| Étape | État |
|---|---|
| 1. Pipeline EBP dans le dépôt + plan du matin v2 vers le téléphone | **Fait sur données fictives (06-07/11)** — bout en bout testé jusqu'aux écrans du téléphone, opportunités comprises |
| 2. Référentiel garages unique (téléphone ↔ code EBP ↔ SIRET, rapprochement validé à la main) | À faire |
| 3. Cockpit du matin (où j'en suis, 3 actions, garages à visiter, blocages, ce qui rapporte) | À faire |
| 4. Ma Ville → tournées vers le téléphone | À faire |
| 5. Mon Business (marge, encaissements, rentabilité) | Bloqué : prix d'achat EBP et objectifs validés |

**Correctif du diagnostic (07/11/2026).** Le diagnostic du 06/11 était faux : le téléphone conserve bien `chiffre` et `sources`
(commercial-v22.js remplace `nettoyerPlan` d'app.js ; le test d'alors n'avait extrait qu'app.js). Causes réelles, corrigées :
1. Bureau : format `sources` différent de celui lu par le téléphone, et aucun signal client → corrigé (`sources.preuvesCommerciales`,
   `importStats`, `clients[].signaux` reconquête/baisse ; fiabilité seulement si 12 mois d'historique et aucune pièce écartée).
2. Téléphone (commercial-v22.js, PR #2) : avant midi, l'export du jour comptait « -1 jours » → opportunités suspendues le matin. Corrigé (1 ligne).
Les 3 fonctions (opportunités, ligne EBP de l'accueil, garage présélectionné) sont vérifiées de bout en bout dans le vrai téléphone.

## Décisions du 07/11/2026

- Socle 0 : matrice des droits **validée** (voir `socle/LISEZ-MOI.md`).
- Ville LEGO : P1–P5 **validées et appliquées** (commandes et facturé jamais confondus, chiffres datés et justifiés par EBP,
  graphisme verrouillé par `tests/bureau-ville-invariance.test.cjs`).
- Ma Ville en 4 couleurs : **option A validée** (noir + fin liseré blanc lumineux pour les clients ODICOLOR Mécan) et **appliquée
  à la Ville sur données fictives**, style LEGO Premium et animations conservés ; testée (`tests/bureau-ville-4-couleurs-navigateur.cjs`).
  Non fusionnée, non publiée.
- **Offres de conquête** : logique intégrée au modèle commercial (`docs/OFFRES_DE_CONQUETE.md`) ; anneau doré dans la Ville
  en **maquette** seulement.
- **Espace client et parcours de commande** : ajoutés à la feuille de route (`docs/PARCOURS_COMMANDE_CLIENT.md`),
  **aucun développement avant validation du parcours**.
- **Réapprovisionnement client en un clic** : inscrit à la feuille de route — demande reçue par le commercial → proposition
  éventuelle (produits complémentaires ou Offre de conquête) → confirmation du client → traitement dans EBP.
  **Pas de développement pour l'instant** (`docs/PARCOURS_COMMANDE_CLIENT.md`).

## Décisions du 07/11/2026 (suite)

- **Objectif officiel = CA HT facturé** (exports EBP datés).
  - Les commandes restent visibles, **séparément**.
  - L'objectif actuel du téléphone, qui porte sur les commandes envoyées, devra être aligné à l'étape Samsung.
- **Un seul système cohérent** pour le Bureau, Ma Ville et le téléphone, pas trois bases commerciales.
  - Les chiffres sont calculés une fois par le Bureau à partir des exports EBP, puis transmis au téléphone avec leur date.
  - Le téléphone ne recalcule pas et n'est jamais présenté comme en temps réel.
- **Vérification des comptes** :
  - lot A (mémoire des décisions dans le coffre) **fait sur données fictives** ;
  - lots B (écran) et C (vue Commune avec « Mes garages ») **en attente de validation** (`docs/PROPOSITION_VERIFICATION_COMPTES.md`).
