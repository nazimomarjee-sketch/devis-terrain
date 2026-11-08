# Environnement de démonstration privé (données 100 % fictives)

**Statut : préparé, NON publié.** Aucune mise en ligne n'a été faite (accord explicite requis, voir BLOCKERS B9).

## Ce qui existe
- **Mode démonstration dans l'application** (Plus › Démonstration) : 150 garages « DÉMO » répartis sur les communes des départements 91, 95, 94, 77, 93, des devis, 2 rendez-vous, un objectif fictif.
  - **Protection** : le chargement est refusé si le téléphone contient déjà un garage, un devis ou un tarif. Aucune donnée réelle ne peut être mélangée ni remplacée.
  - **Bannière orange permanente** « DÉMONSTRATION — DONNÉES FICTIVES » tant que la démo est chargée.
  - **Sortie propre** : « Quitter la démonstration » efface les données fictives (une copie de récupération reste dans Réglages).
- **Trois fichiers d'essai fictifs**, téléchargeables dans la même page : clients EBP, pièces EBP (factures, avoirs, plus un devis et une commande pour prouver qu'ils sont ignorés), recensement par commune. Ils permettent de rejouer TOUT le parcours : relier les codes clients → importer le CA → secteurs → carte. Les noms de colonnes d'EBP sont une hypothèse.
- **Parcours testé automatiquement** (`tests/demo-browser.cjs`, émulation) : chargement, import clients (liens validés), import pièces, secteurs, carte, sortie.

## Pour l'héberger en privé (quand tu l'autoriseras)
Réutiliser la procédure existante `audit/MISE_EN_LIGNE_SAMSUNG.md` (espaces de test A/B, adresse non référencée). Utiliser un espace SÉPARÉ de celui où tu mettras tes vraies données : la démo exige un téléphone vide, donc un navigateur/profil différent ou l'installation séparée. Ne jamais y importer de fichier réel.

## Limites
- La démo montre le fonctionnement, pas des chiffres réels : les montants, noms et volumes sont inventés.
- Elle ne prouve rien sur le Samsung : seule la recette (`docs/RECETTE_SAMSUNG_FINALE.md`) le fait.
