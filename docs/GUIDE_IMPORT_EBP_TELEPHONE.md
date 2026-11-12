# Importer tes données EBP sur le téléphone (aucun PC)

**Principe** : tu exportes depuis EBP en Excel ou CSV, tu ouvres le fichier dans ODICOLOR, l'application te montre ce qu'elle a compris, **rien n'est enregistré avant ton accord**. Les noms de colonnes d'EBP ne sont pas encore connus avec certitude : l'application les devine et te laisse les corriger.

## Dans cet ordre
1. **Clients** (Plus › Clients EBP) — export de la liste des clients : code client, nom, ville, code postal (le statut bloqué et la famille aident). L'application propose des liens avec tes garages ; tu coches et tu valides.
2. **Pièces** (Plus › CA facturé › Importer un export EBP) — export des factures et avoirs : n° de pièce, date, code client, nom, **montant HT**. Le TTC n'est jamais utilisé comme HT.
3. **Marché** (facultatif, Plus › Carte) — fichier par commune.

## Ce que tu verras à chaque import
- **Colonnes retenues** : vérifie surtout « Montant HT ». Si une colonne est mauvaise ou introuvable, déplie **Colonnes du fichier** et choisis la bonne ; la correction est immédiate.
- **Aperçu** : nombre de pièces à ajouter, effet sur le CA, pièces déjà présentes, conflits, lignes ignorées avec leur motif, lignes de total écartées.
- **Fichier sans colonne « type »** : l'application ne devine pas. Si tu sais qu'il ne contient que des factures et des avoirs, un bouton te permet de le déclarer (un montant négatif sera un avoir).
- **Export « ligne par article »** : plusieurs lignes d'une même pièce sont additionnées, et l'application te le signale pour que tu vérifies que l'export n'est pas dupliqué.

## Sécurité
- Réimporter le même fichier ne crée **aucun doublon** ; un numéro déjà présent avec un montant différent est signalé, jamais écrasé.
- Un import peut être **annulé en bloc** (CA facturé › Imports EBP).
- Capacité : jusqu'à 40 Mo et 300 000 lignes. Au-delà : exporte une période plus courte.
- Si l'application n'arrive pas à lire ton fichier, **copie les titres de colonnes** (bouton prévu : aucune donnée de client) et envoie-les-moi : j'ajoute ce libellé.
- Avant ton premier vrai import : fais une sauvegarde chiffrée (Réglages).
