# ODICOLOR 2.0 — Lot 8 : formats d'export compatibles et import en deux temps (14/11/2026)

**Important** : aucun export EBP réel n'a encore été lu. Les noms de colonnes EBP **ne sont pas connus** ; ceux des tests
sont inventés. La détection automatique reconnaît des libellés courants ; sinon tu associes les colonnes à la main, une fois.

## Fichiers acceptés (vérifié par tests sur fichiers fictifs)
| Format | Détails |
|---|---|
| Excel `.xlsx`, `.xls` | 1ʳᵉ feuille ; dates Excel (numéro de série) et montants numériques acceptés |
| Texte `.csv`, `.txt` | séparateur détecté : `;`, tabulation ou `,` ; guillemets gérés |
| Encodages | UTF-8 (avec ou sans BOM), Windows-1252 (accents d'Excel France), UTF-16 « Texte Unicode » (avec BOM) |
| Dates | `JJ/MM/AAAA`, `JJ-MM-AA`, `JJ.MM.AAAA`, `AAAA-MM-JJ`, numéro de série Excel ; date impossible refusée |
| Montants | `1 234,56`, `1.234,56`, `1234.56`, `1 234,56 €`, négatifs `-12` ou `(12)` ; **ambigus refusés** (`1.234`, `1,234`) |
| Lignes de titre | jusqu'à 14 lignes au-dessus des en-têtes (titre d'état, date d'édition) : ignorées et signalées |
Autres formats (`.ods`, `.pdf`, `.xml`…) : **refusés** avec un message clair.

## Import en deux temps (assistant : Bureau → « Assistant d'import pas à pas »)
1. **Choisir le fichier** : rien n'est modifié. Un aperçu s'affiche :
   lignes reconnues / rejetées, pièces nouvelles / déjà connues / modifiées, lignes en double, clients absents du fichier
   clients, pièces sans code client, dates après la date d'export ou avant 2000, période d'export absente ou incomplète,
   colonnes indispensables manquantes, colonnes facultatives absentes et leur conséquence. Chaque point est classé
   **Bloquant / À vérifier / Info** et écrit en français simple.
2. **Colonnes** : si une colonne indispensable n'est pas reconnue, la liste des champs s'ouvre : choisis la colonne du
   fichier pour chacun, puis « Appliquer ces colonnes ». Le choix validé est **mémorisé** (coffre + navigateur) et réutilisé
   automatiquement pour les fichiers de même format (mêmes en-têtes).
3. **Valider l'import** (impossible tant qu'un point est bloquant) ou **Annuler** (rien ne change).

## Sécurité des données
- Aucun écrasement silencieux : une pièce modifiée dans EBP est annoncée avant validation, puis listée.
- Aucune double comptabilisation : fichier déjà importé ignoré, pièce identique comptée une fois.
- Avoirs et règlements traités comme aux lots 1 à 7 (avoirs déduits à leur date, règlement sans montant jamais soldé).
- Application **atomique** : le nouvel état est calculé à part puis remplacé d'un coup ; en cas d'échec, les données
  précédentes sont conservées intégralement (testé avec une panne simulée).
- Aucun envoi : tout reste sur le PC (navigateur ou application locale).

## Limites
- Correspondances reconnues sur l'en-tête exact : si EBP change un libellé, il faudra réassocier une fois.
- Pas testé sur le PC Windows ni avec de vrais exports EBP (accord de Faizal requis).
