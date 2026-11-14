# ODICOLOR 2.0 — Recette sur PC Windows (à dérouler, NON réalisée)

**Statut : aucune de ces étapes n'a été exécutée sur un PC Windows.** Les tests automatiques tournent sous Linux
(Chromium sans écran, données fictives). Cette fiche sert à la première recette réelle, sur le PC ODICOLOR.

## Préalables
- Accord écrit de Faizal avant d'utiliser de vrais exports EBP (sinon : utiliser les fichiers fictifs ci-dessous).
- Node.js installé (≥ 20) pour l'application locale ; navigateur Chrome ou Edge à jour.
- Dossier `Documents\ODICOLOR-imports\AAAA-MM-JJ\` pour les exports ; clé USB vidée après copie.

## Fichiers fictifs pour une première recette sans données réelles
Recréer à la main dans Excel, enregistrer en **CSV (séparateur : point-virgule)** puis aussi en **Texte Unicode** :
`Type ; N° pièce ; Date ; Code client ; Client ; Montant HT ; N° de pièce d'origine` avec 3 lignes (devis, commande, facture liés).

## Étapes et résultats attendus
| # | Étape | Résultat attendu | Résultat constaté |
|---|---|---|---|
| 1 | Lancer l'application locale (`node local\serveur.js`), ouvrir l'adresse affichée | Écran de création du coffre | Non testé |
| 2 | Créer le coffre, noter la clé de secours | Bureau ouvert, coffre « prêt » | Non testé |
| 3 | Bureau → **Assistant d'import pas à pas** → date de l'export | Étape 1 sur 5, date confirmée | Non testé |
| 4 | Fichier clients (Excel `.xlsx`) | Aperçu : lignes reconnues, colonnes absentes expliquées ; **Valider** | Non testé |
| 5 | Pièces (CSV Windows-1252) avec période déclarée | Accents corrects (É, è), aperçu, **Valider** | Non testé |
| 6 | Même fichier de pièces une 2ᵉ fois | « déjà importé : rien ne changera » | Non testé |
| 7 | Fichier de pièces « Texte Unicode » | Lu correctement (UTF-16) | Non testé |
| 8 | Export aux colonnes renommées | Association manuelle, puis reconnue au fichier suivant | Non testé |
| 9 | Fichier dont la majorité des lignes est illisible | « À confirmer », validation bloquée sans la case | Non testé |
| 10 | Double clic rapide sur **Valider l'import** | Un seul import (Contrôle : nombre d'exports inchangé) | Non testé |
| 11 | Échéancier | Encaissements en **TTC** dans Commerce, jamais additionnés au CA HT | Non testé |
| 12 | Onglet **Contrôle** | Chaque source : Fiable / À vérifier / Manquant, avec la raison ; lisible sans défilement horizontal | Non testé |
| 13 | Onglets **Pilotage** et **Commerce** | Même CA HT du mois ; objectif 20 000 € HT saisi puis retrouvé | Non testé |
| 14 | Fermer la fenêtre du programme local (panne simulée) puis importer | Bandeau « Enregistrement dans le coffre impossible » | Non testé |
| 15 | Relancer le programme, mot de passe | Dernière version **complète** enregistrée retrouvée | Non testé |
| 16 | Mise en veille / redémarrage de Windows, réouverture | Coffre intact, réglages et correspondances retrouvés | Non testé |
| 17 | Zoom navigateur 150 % et 200 % | Textes lisibles, boutons utilisables | Non testé |

## À noter pendant la recette
Pour chaque écart : capture d'écran **sans donnée réelle visible**, étape, message affiché. Ne pas corriger les fichiers
EBP à la main pour « faire passer » un import : noter le format exact (nom des colonnes) pour adapter l'assistant.
