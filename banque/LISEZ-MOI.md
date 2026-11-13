# Banque locale

Suivi de comptes à partir de relevés importés (CSV ou OFX). Outil **séparé** de l'appli ODICOLOR : autre dossier, autre stockage, autre cache.

Le dépôt ne contient que le code. Vos opérations ne sont jamais dans le dépôt.

## Deux façons de l'utiliser

| | Mode navigateur (téléphone ou PC) | Mode bureau (PC) |
|---|---|---|
| Lancement | ouvrir `banque/` sur le site HTTPS | double-clic sur `lancer-banque.bat` (ou `node bureau.cjs`) |
| Données | dans le navigateur (IndexedDB) | fichier `BanqueLocale/donnees.json` dans votre dossier utilisateur |
| Envoi réseau | interdit par la page (`connect-src 'none'`) | uniquement vers le programme local, sur `127.0.0.1` |
| Assistant | non : copier-coller du résumé | oui : il pilote l'appli (voir plus bas) |

Les deux modes ne se synchronisent pas. Pour passer de l'un à l'autre : Réglages > Télécharger une sauvegarde, puis Restaurer dans l'autre.

## Ce que ça fait
- Importe CSV et OFX, avec un aperçu à vérifier avant d'enregistrer (totaux, période, lignes refusées).
- Ignore les opérations déjà présentes : on peut réimporter un relevé qui chevauche le précédent.
- Classe par catégorie (règles par défaut + vos règles), synthèse du mois, comparaison aux 3 mois précédents, charges récurrentes.
- Prépare un résumé anonymisé (totaux par catégorie, aucun libellé) à coller dans Claude.

## Ce que ça ne fait pas
- Aucune connexion à la banque, aucun virement, aucun paiement.
- Pas de solde de compte : seulement les entrées et sorties des relevés importés.
- Pas de chiffrement des fichiers. Protégez la session de votre PC.

## Mode bureau : donner la main à un assistant

Prérequis : Node.js 18 ou plus sur le PC.

L'assistant agit uniquement par ces actions : `etat`, `synthese`, `resume`, `recurrentes`, `fichiers_a_importer`, `importer`, et, si vous l'autorisez, `operations`, `classer`, `ajouter_regle`, `supprimer_regle`, `regles`.

Garde-fous :
- Il ne peut ni effacer ni restaurer les données. Ces boutons n'existent que dans l'écran.
- Il ne lit que les fichiers du dossier `BanqueLocale/a-importer`. Vous y déposez vos relevés.
- Il ne voit **aucun libellé** tant que la case « Autoriser l'assistant à voir les libellés » (Réglages > Assistant) est décochée.
- Chaque action est notée dans `journal.log`, visible dans Réglages.
- Une copie datée de `donnees.json` est gardée dans `sauvegardes/` chaque jour de modification (30 jours).

Limite à connaître : ces garde-fous valent pour un assistant qui passe par les trois voies ci-dessous. Un programme qui a un accès libre au disque du PC peut lire `donnees.json` directement ; cela se règle dans les permissions de cet assistant, pas ici.

### Voie 1 — connecteur MCP (Claude Desktop, Claude Code et autres assistants compatibles)
Ajoutez à la configuration MCP de l'assistant, avec le chemin réel du dossier :

```json
{ "mcpServers": { "banque-locale": { "command": "node", "args": ["C:\\chemin\\vers\\devis-terrain\\banque\\bureau.cjs", "mcp"] } } }
```

### Voie 2 — API locale (assistant maison, script)
Avec l'appli lancée : `POST http://127.0.0.1:8765/api/action/<nom>`, corps JSON, en-tête `Authorization: Bearer <contenu de BanqueLocale/jeton.txt>`.

### Voie 3 — ligne de commande
```
node bureau.cjs actions
node bureau.cjs action synthese "{\"mois\":\"2026-10\"}"
node bureau.cjs action importer "{\"fichier\":\"octobre.csv\",\"confirmer\":true}"
```

Réglages par variables d'environnement : `BANQUE_DOSSIER` (dossier des données), `BANQUE_PORT` (8765 par défaut).

## À vérifier avant usage réel
- Comparez les totaux de l'aperçu d'import avec ceux de votre banque : les formats CSV varient d'une banque à l'autre.
- Gardez un seul format par compte (CSV ou OFX) : les libellés diffèrent et créeraient des doublons.
- Montants en euros uniquement. Dates lues au format français (jour/mois).
- Non testé : `lancer-banque.bat` sur un vrai Windows, et le branchement à un assistant réel.

## Tests
`node --test banque/tests/*.test.cjs`
