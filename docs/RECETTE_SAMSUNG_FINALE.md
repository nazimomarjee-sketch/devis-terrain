# Recette finale sur ton Samsung — une seule fois, ~25 minutes

**Ce document ne prouve rien tant que tu ne l'as pas fait.** Les tests automatiques (émulation Chromium) ne remplacent pas ton téléphone. Données de test uniquement : n'utilise PAS de vrais clients pendant cette recette.

**Avant de commencer** : l'application de test doit être en ligne (espace de test, voir `audit/MISE_EN_LIGNE_SAMSUNG.md`, jamais la production). Je ne l'y mets qu'après ton accord explicite « mise en ligne de test autorisée » ; tu fais l'envoi depuis le navigateur du téléphone, puis tu colles l'adresse dans la conversation.

## Les 12 étapes (note « OK » ou ce qui ne va pas)
| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvre l'adresse de test dans Chrome, « Ajouter à l'écran d'accueil », ouvre l'icône | L'application s'ouvre plein écran, thème sombre |
| 2 | Plus → Réglages : objectif du mois 20 000 €, mois de départ = ce mois (valeur de test) | « Réglages enregistrés » |
| 3 | Plus → CA facturé HT : facture `T-001` 1 000 € HT, facture `T-002` 500 €, avoir `T-A1` 200 € | Total 1 300,00 € |
| 4 | Ressaisis `t001` 1 000 € | Refus « Doublon » |
| 5 | Accueil | « OBJECTIF · CA FACTURÉ HT » = 1 300 € ; commandes et encaissé affichés à part |
| 6 | Crée 3 garages tests (un avec rappel d'hier, un « client » avec une facture échue, un prospect priorité A) | — |
| 7 | Plus → Cockpit | Les 3 garages apparaissent avec leur raison ; un toucher ouvre la fiche |
| 8 | Fiche garage → prends une **photo** ; ajoute un **PDF** (catalogue) | Photo et PDF visibles dans la fiche |
| 9 | Réglages → phrase secrète (≥10 caractères, note-la sur papier) ×2 → « Télécharger une sauvegarde chiffrée » | « Copie chiffrée et relue » + fichier `.odicolor` dans Téléchargements |
| 10 | Mode avion → ouvre l'application → ajoute une visite | Tout fonctionne hors ligne ; rien ne se perd à la reconnexion |
| 11 | Réglages → Restaurer : choisis le fichier, mauvaise phrase d'abord, puis la bonne | Mauvaise phrase = refus sans rien changer ; bonne = garages, photo, PDF et CA retrouvés |
| 11b | Plus → Carte : touche une bulle, puis « Visiter » ; Plus → Ma Ville : ouvre une commune, touche un garage deux fois | La carte et la Ville restent fluides, la fiche du bon garage s'ouvre |
| 11c | Cockpit → touche un prospect → Résultat → Ressorti → Suite | Visite enregistrée en 4 touches ; « Annuler cette visite » la retire |
| 12 | Envoie le fichier `.odicolor` vers un stockage hors du téléphone (Drive, e-mail à toi-même) et rouvre-le de là | Fichier conservé hors du téléphone |

## Ce que tu me renvoies
Une ligne : « tout OK » ou le numéro d'étape + ce que tu vois (capture d'écran bienvenue).

## Après la recette
Si tout est OK : les vraies données peuvent être importées, **après** une sauvegarde chiffrée de ton téléphone actuel dont la restauration a été vérifiée (étapes 9–11 sur les vraies données, en dernier).
