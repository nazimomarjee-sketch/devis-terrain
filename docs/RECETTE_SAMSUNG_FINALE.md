# Recette finale sur ton Samsung — une seule fois, environ 25 minutes

**Rien de ce qui suit n'est validé tant que tu ne l'as pas fait sur ton téléphone.** Les tests automatiques (émulation Chromium) ne remplacent pas le vrai appareil. Tout se fait sur la **démonstration 100 % fictive** : aucune vraie donnée.

**Pré-requis** : un espace de test en ligne (jamais la production), mis en place seulement après ton accord explicite « mise en ligne de test autorisée » (`audit/MISE_EN_LIGNE_SAMSUNG.md`). Utilise un téléphone/navigateur **vide** : la démonstration refuse de se charger sinon (protection voulue).

## Les 12 étapes (note « OK » ou ce que tu vois)
| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvre l'adresse de test dans Chrome → « Ajouter à l'écran d'accueil » → ouvre l'icône | Plein écran, thème sombre |
| 2 | Plus → **Démonstration** → « Charger la démonstration » | Bannière orange « DONNÉES FICTIVES » ; le Cockpit s'ouvre avec des priorités |
| 3 | Plus → Démonstration → télécharge les 3 fichiers d'essai | 3 fichiers dans Téléchargements |
| 4 | Plus → **Clients EBP** → fichier `demo-ebp-clients` → « Tout cocher » → « Lier les liens cochés » | « N lien(s) enregistré(s) » ; un « sans garage » et un homonyme restent à traiter |
| 5 | Plus → **CA facturé** → « Importer un export EBP » → `demo-ebp-pieces` → « Importer » | Aperçu (devis et commandes ignorés), puis CA du mois ; réimporter le même fichier = 0 nouvelle |
| 6 | Cockpit → touche un prospect → **Résultat → Ressorti → Suite** | Visite enregistrée en 4 touches ; « Annuler cette visite » la retire |
| 7 | Plus → **Rendez-vous** : un rendez-vous à l'heure de ton choix ; Cockpit → « Proposer ma tournée du jour » → « Valider » | Le rendez-vous apparaît avec son heure dans la tournée |
| 8 | Plus → **Carte** (puis importe `demo-recensement`), touche une bulle → « Visiter » ; Plus → **Ma Ville** → ouvre une commune → touche un garage deux fois ; Plus → **Secteurs** | Carte et Ville fluides au doigt ; la bonne fiche s'ouvre ; chiffres cohérents |
| 9 | Fiche d'un garage → prends une **photo** et ajoute un **PDF** | Photo et PDF visibles |
| 10 | Réglages → phrase secrète (≥ 10 caractères, **note-la sur papier**) ×2 → « Télécharger une sauvegarde chiffrée » | « Copie chiffrée et relue » + fichier `.odicolor` |
| 11 | **Mode avion** → ouvre l'application → ajoute une visite → remets le réseau → Réglages → Restaurer : **mauvaise phrase d'abord**, puis la bonne | Tout marche hors ligne ; mauvaise phrase = refus sans rien changer ; bonne = tout retrouvé (garages, photo, PDF, CA, agenda) |
| 12 | Envoie le fichier `.odicolor` hors du téléphone (Drive, e-mail à toi-même) et rouvre-le de là ; puis Plus → Démonstration → « Quitter la démonstration » | Fichier conservé ; le téléphone est vide de données fictives |

## Ce que tu me renvoies
Une ligne : « tout OK » ou le numéro d'étape + ce que tu vois (capture d'écran bienvenue).

## Après la recette (données réelles)
Seulement si tout est OK : importer tes vrais fichiers EBP, **puis** faire une sauvegarde chiffrée et vérifier sa restauration (étapes 10–12 sur les vraies données) avant tout usage quotidien. Les noms de colonnes d'EBP sont une hypothèse : le premier vrai import affichera les colonnes retenues, à contrôler.
