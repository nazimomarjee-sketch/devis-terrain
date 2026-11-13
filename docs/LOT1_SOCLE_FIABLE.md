# ODICOLOR 2.0 — Lot 1 « Socle fiable » : état au 13/11/2026

Branche `odicolor-2-0-lot1-socle` (base `ccr-b491dc52-ckgq60`, `6482923`). **Locale, non poussée** (restriction de push de la session).
`main` intact. JARVIS non touché, aucune donnée partagée. **Données fictives uniquement.**

## 1. Fonctionnalités opérationnelles (testées sur données fictives)

| Constat du plan | Ce qui change | Où | Preuve |
|---|---|---|---|
| L1 date d'export = aujourd'hui par défaut | Proposée d'après la date du fichier le plus ancien chargé, jamais dans le futur, « à confirmer » tant qu'elle n'est pas saisie, jamais remplacée une fois confirmée ; pièce postérieure à la date d'export signalée | `bureau/index.html` | `tests/bureau-provenance-navigateur.cjs` (tests 1-2) |
| L2 pas de provenance | Nom, taille, date du fichier, date d'import, empreinte SHA-256, lignes lues / écartées sous chaque import | `bureau/index.html` | idem (test 1) |
| L3 pas de SIRET EBP | Colonne SIRET lue, clé de Luhn vérifiée, invalide signalé et ignoré ; relie la fiche terrain de même SIRET ; conflit SIRET / code ⇒ « à rapprocher », jamais de fusion | `bureau/ebp-import.js`, `bureau/ma-ville.js` | `bureau-ebp-import.test.cjs`, `bureau-ma-ville.test.cjs` |
| L4 règlement daté lu « soldé » | Sans « reste » ni « montant réglé » : reste **inconnu**, facture « à vérifier », jamais soldée ni impayée | `ebp-import.js`, `pipeline.js` | `bureau-ebp-import.test.cjs`, `bureau-pipeline.test.cjs` |
| L5 échéancier | Colonne « Montant réglé » (reste calculé, jamais prise pour le dû) ; réglé > dû refusé ; échéance en double écartée. L'agrégation par facture existait déjà (`pipeline.js`) | `ebp-import.js` | `bureau-ebp-import.test.cjs` |
| L6 pas d'« encaissé constaté » | Nouveau module : encaissé du mois, créances, échu, comptes bloqués, **TTC**, statuts valide / douteux / absent ; bloc dédié dans le Bureau, jamais additionné au CA HT | `bureau/encaissements.js` | `bureau-encaissements.test.cjs`, navigateur test 3 |
| L7 lignes dupliquées additionnées | Lignes strictement identiques d'une même pièce signalées dans le CA (« export dupliqué ? »). **Non bloquant** : deux lignes d'article identiques peuvent être légitimes | `ebp-import.js`, `ca-facture.js` | `bureau-ebp-import.test.cjs` |
| L8 « 1.234 » lu 1,23 € (**confirmé**) | Montant ambigu (un séparateur suivi de 3 chiffres) : ligne écartée avec motif « ambigu », jamais devinée | `ebp-import.js` | `bureau-ebp-import.test.cjs` |
| L9 deux importeurs (**divergence confirmée** : 3 variantes d'en-têtes sur 4 refusées par le Bureau, acceptées par le téléphone) | Détection d'en-têtes du Bureau alignée ; test : même HT que le téléphone, jamais le TTC | `ebp-import.js` | `bureau-ebp-import.test.cjs` |
| L11 anomalies perdues | Journal des anomalies exportable en CSV (fichier, empreinte, ligne, motif), téléchargement local | `bureau/index.html` | navigateur test 4 |

Règles validées antérieurement **inchangées** : avoirs déduits à leur date, « Non renseigné » au lieu d'un faux zéro, rattachement géographique par code EBP uniquement, contrôle de cohérence des totaux.

## 2. Tests (13/11/2026, Linux, Chromium headless)

- Avant le lot : unitaires 429 réussis / 2 ignorés / 0 échec ; navigateur 28/28 ; construction PWA vérifiée.
- Après le lot : unitaires 439 / 2 ignorés / 0 échec ; navigateur 30/30 + 4 nouveaux tests ; PWA reconstruite et vérifiée (`ma-ville.js` y est embarqué).
- Un test existant modifié **volontairement** : « sans colonne reste, déduit de la date de règlement » (ancienne règle L4).

## 3. Limites et validations restantes

- **Aucun export EBP réel** n'a été lu. Noms de colonnes, séparateurs, présence du SIRET et du « reste à payer » : **hypothèses**.
- « Compte client » est lu comme identifiant client (comme le téléphone) : **hypothèse** ; si c'est un compte comptable 411…, l'attribution reste correcte tant qu'il est unique par client, à vérifier.
- Lignes identiques (L7) : signalées, pas bloquées. Seul un contrôle sur l'export réel tranchera.
- Encaissements : TTC uniquement (l'échéancier n'a pas de HT). Aucun lien encaissement ↔ CA HT n'est calculé.
- Rien testé sur un vrai Samsung ni sur le PC Windows. Tests réussis ≠ validation métier.

## 4. Procédure de validation locale avec de vrais exports (à faire sur le PC ODICOLOR, avec l'accord de Faizal)

1. Ne jamais copier les fichiers dans le dépôt, un prompt ou un service externe.
2. Ouvrir le Bureau en local, charger clients, pièces, échéancier (`docs/GUIDE_EXTRACTION_EBP.md`).
3. Pour chaque import : relire « Colonnes retenues », « Provenance », lignes écartées ; exporter le journal des anomalies.
4. Confirmer la date d'export.
5. Comparer à EBP, sur un mois clos : total des factures HT, total des avoirs HT, nombre de pièces, reste à payer total TTC, liste des comptes bloqués. Noter les écarts **sans les corriger dans le code** et les signaler.

## 5. Point de reprise

- Prochain lot autorisé : **lot 2 Terrain et Ville** (réutilisation du parcours Samsung et du cockpit PC).
- Ouvert : pousser la branche (autorisation de push requise), revue par le propriétaire, essai sur exports réels.
