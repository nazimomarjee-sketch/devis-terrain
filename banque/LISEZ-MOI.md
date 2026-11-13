# Banque locale — finances personnelles

Application autonome pour suivre son argent, sans connexion à une banque. Indépendante de l'appli ODICOLOR et de JARVIS : autre dossier, autre stockage, autre cache, aucun code partagé.

Le dépôt ne contient que le code. Vos données n'y sont jamais.

## Ce que ça fait
- **Argent disponible** : vous indiquez le solde affiché par votre banque ; l'appli le tient à jour avec vos saisies et vos imports. Un bouton « Mettre à jour » recale tout.
- **Revenus et dépenses** : saisie en quelques secondes, ou import d'un relevé CSV / OFX avec aperçu à vérifier. Pas de doublon si un relevé chevauche le précédent ; une saisie manuelle retrouvée dans un relevé est remplacée.
- **Échéances** : charges fixes, crédits (mensualités restantes), revenus réguliers, mensuels, trimestriels ou annuels. Les mouvements qui reviennent dans vos relevés sont proposés d'un geste.
- **Fin du mois** : solde prévu, détail du calcul, point le plus bas d'ici là.
- **Alertes** : découvert possible, solde prévu sous votre seuil, échéance non retrouvée, budget dépassé.
- **Budget** : par catégorie, avec proposition automatique d'après vos 3 derniers mois.
- **Où économiser** : abonnements et leur coût annuel, frais bancaires, catégories en hausse, petits achats répétés. Ce sont des constats ; c'est vous qui jugez.
- **Résumé pour Claude** : totaux uniquement, à copier-coller vous-même.

## Ce que ça ne fait pas
- Aucune connexion à un compte bancaire réel, aucun virement, aucun paiement.
- Aucun envoi de données : en mode navigateur, la page s'interdit elle-même tout envoi (`connect-src 'none'`).
- Pas de synchronisation entre téléphone et PC : on passe de l'un à l'autre par une sauvegarde.
- Pas de code d'accès propre à l'appli : verrouillez votre téléphone et votre session Windows.

## Comment la prévision est calculée
`solde prévu = argent disponible + revenus attendus − charges et crédits à venir − dépenses courantes estimées`

- Revenus et charges à venir : vos échéances du mois pas encore vues dans vos opérations.
- Dépenses courantes : moyenne par jour des 3 derniers mois complets, hors échéances déclarées, multipliée par les jours restants.

Limites connues : c'est une estimation. Une échéance déclarée récemment est quand même retirée des mois passés, ce qui sous-estime un peu les dépenses courantes. Sans historique, l'estimation des dépenses courantes vaut zéro.

## Deux façons de l'utiliser

| | Téléphone ou navigateur | PC (mode bureau) |
|---|---|---|
| Lancement | ouvrir `banque/` sur le site HTTPS, puis « Installer l'application » | double-clic sur `lancer-banque.bat` (ou `node bureau.cjs`), Node.js 18 ou plus |
| Données | dans le navigateur de l'appareil | fichier `BanqueLocale/donnees.json` de votre dossier utilisateur |
| Réseau | tout envoi interdit | uniquement vers le programme local, sur `127.0.0.1` |

## Sauvegarde
Plus > Télécharger une sauvegarde. Avec un mot de passe, le fichier est chiffré (AES-256-GCM, clé dérivée par PBKDF2). Un mot de passe oublié rend le fichier irrécupérable. En mode bureau, une copie datée est aussi gardée chaque jour de modification (30 jours), non chiffrée.

## Connexion future à JARVIS (ou à un autre assistant)
Rien n'est branché et JARVIS n'a pas été modifié. La porte existe en mode bureau, **fermée par défaut**. Vous seul l'ouvrez, dans Plus > Assistant, à l'un de ces niveaux :

| Niveau | Ce que l'assistant obtient |
|---|---|
| Aucun (défaut) | rien : toutes les demandes sont refusées et journalisées |
| Totaux | solde, prévision, totaux par catégorie, import de relevés déposés — aucun libellé, aucun nom de compte ou d'échéance |
| Détail | en plus : libellés des opérations, classement, règles, pistes d'économies |

À tous les niveaux : il ne peut ni effacer ni restaurer, il ne lit que le dossier `BanqueLocale/a-importer`, et chaque demande est notée dans `journal.log` (visible dans Plus > Assistant).

Le jour où vous déciderez de brancher JARVIS (programme Node.js), il aura trois voies au choix, sans modification de cette appli :
- API locale : `POST http://127.0.0.1:8765/api/action/<nom>`, corps JSON, en-tête `Authorization: Bearer <contenu de BanqueLocale/jeton.txt>` ;
- ligne de commande : `node bureau.cjs action prevision` ;
- connecteur MCP : `node bureau.cjs mcp`.

`node bureau.cjs actions` liste les actions. Limites à connaître : ces garde-fous valent pour un assistant qui passe par ces voies. Un programme ayant un accès libre au disque du PC peut lire `donnees.json` directement. Et tout ce qu'un assistant lit peut partir chez le fournisseur de son intelligence artificielle si celle-ci n'est pas locale.

## À vérifier avant usage réel
- Au premier import, comparez les totaux de l'aperçu avec ceux de votre banque : les formats CSV varient.
- Gardez un seul format par compte (CSV ou OFX), sinon des doublons sont possibles.
- Montants en euros, dates au format français (jour/mois).
- Non testé : `lancer-banque.bat` sur un vrai Windows, l'installation sur un vrai téléphone, un relevé réel de votre banque.

## Tests
`node --test banque/tests/*.test.cjs`
