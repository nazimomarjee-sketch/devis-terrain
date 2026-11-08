# Recette Samsung — environ 10 minutes (le reste est automatisé)

**Rien de ce qui suit n'est validé tant que tu ne l'as pas fait sur ton téléphone.** Les tests automatiques (émulation Chromium) ne remplacent pas l'appareil réel. Tout se fait sur l'**espace de test privé, avec des données 100 % fictives** : n'y saisis jamais de donnée réelle (une bannière orange le rappelle).

## Ce qui est automatisé (tu n'as rien à faire)
- Toute la logique métier (CA facturé, imports EBP, rapprochement des codes, secteurs, rendez-vous, tournées, carte, Ma Ville) et la sécurité de la sauvegarde sont vérifiées par ~50 fichiers de tests, rejoués à chaque modification (CI GitHub).
- **L'autotest embarqué** (étape 3) refait sur TON téléphone les contrôles qui dépendent de l'appareil : stockage IndexedDB, chiffrement, sauvegarde chiffrée aller-retour avec photo et PDF, copie hors ligne complète, vitesse de la carte et de Ma Ville.

## Les 6 gestes à faire toi-même
| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvre le lien reçu dans Chrome, saisis l'identifiant et le mot de passe, puis menu ⋮ → **Ajouter à l'écran d'accueil** et ouvre l'icône | L'application s'ouvre en plein écran |
| 2 | Plus → **Démonstration** → « Charger la démonstration » | Bannière orange « DONNÉES FICTIVES » ; le Cockpit affiche des priorités |
| 3 | Plus → **Autotest** → attends la fin → **Copier le rapport** → colle-le dans la conversation | « Tous les contrôles automatiques réussis » (ou la liste de ce qui échoue) |
| 4 | **Mode avion** → ouvre l'application depuis l'icône → ouvre une fiche, ajoute une visite → remets le réseau | Tout marche hors ligne, rien ne se perd |
| 5 | Fiche d'un garage → **prends une photo** et **ajoute un PDF** ; puis Réglages → phrase secrète (≥ 10 caractères, **note-la sur papier**) ×2 → « Télécharger une sauvegarde chiffrée » ; puis Réglages → Restaurer, fichier choisi dans *Téléchargements* : **mauvaise phrase d'abord (refus attendu), puis la bonne** | Photo et PDF retrouvés après restauration |
| 6 | Carte puis Ma Ville, au doigt (glisser, pincer, toucher une bulle puis un garage) | Fluide ? Dis-moi « fluide » ou « saccadé à tel endroit » |

Ensuite : Plus → Démonstration → « Quitter la démonstration ».

## Ce que tu me renvoies
Le rapport de l'autotest (étape 3) + une ligne pour les étapes 4 à 6 (« OK » ou ce que tu vois).

## Après la recette (données réelles)
Pas avant. Seulement si tout est OK : sur l'application réelle (pas l'espace de test), importer tes vrais fichiers EBP (les colonnes retenues s'affichent : à contrôler, les noms de colonnes d'EBP sont une hypothèse), puis faire une sauvegarde chiffrée et vérifier sa restauration avant tout usage quotidien.
