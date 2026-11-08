# Environnement de démonstration privé (données 100 % fictives)

**Statut : EN LIGNE (test privé, données fictives uniquement) depuis le 08/11/2026.** Accord explicite du propriétaire.
- Adresse : `https://demo-odicolor-production.up.railway.app/` (domaine propre = stockage du navigateur ISOLÉ de l'application réelle).
- Accès : authentification par mot de passe (identifiant et mot de passe remis au propriétaire dans la conversation, jamais dans le dépôt ; stockés comme variables du service Railway ; modifiables dans Railway).
- Version déployée : commit `9c911e0` (CI verte), épinglé : aucune mise à jour automatique. Serveur : `scripts/serveur-demo.cjs` (aucune dépendance, 5 tests Node + 2 tests navigateur), qui ne sert que les fichiers de l'application, bloque 5 échecs/minute, `noindex`.
- Bannière orange « ESPACE DE TEST PRIVÉ » sur ce domaine ; la démonstration ne se charge que sur une base vide.
- Pour arrêter : supprimer le projet Railway `odicolor-demo-privee`.
- Limite : la page n'a pas pu être appelée depuis l'environnement de développement (réseau limité volontairement) ; l'état « sain » vient du contrôle d'état de Railway (`/sante`) et des tests du serveur.

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
