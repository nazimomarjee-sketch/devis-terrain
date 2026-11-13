# ODICOLOR 2.0 — Plan du lot 1 « Socle fiable » (13/11/2026)

Base : `ccr-b491dc52-ckgq60` (`6482923`). Branche de travail : `odicolor-2-0-lot1-socle`. `main` et `jarvis/` non touchés.
Statut : **plan seulement**. Aucun code, aucun test lancé (essai d'endurance JARVIS en cours, voir § 5).
Légende : **[CONFIRMÉ]** lu dans le code · **[HYPOTHÈSE]** à vérifier par un test avant correction.

## 1. Ce qui existe déjà (à réutiliser, pas à refaire)

| Brique | Fichier | État |
|---|---|---|
| Lecture CSV/Excel des pièces, règlements, clients ; montants en centimes ; avoirs à part ; lignes écartées avec motif | `bureau/ebp-import.js` (201 l.) | testé sur données fictives (14 cas) |
| CA facturé HT du mois, avoirs déduits à leur date, doublons, « non renseigné » au lieu de zéro, contrôle de cohérence des totaux | `bureau/ca-facture.js` (109 l.) | testé (7 cas) |
| Rapprochement garages : SIRET ou code EBP identiques = même établissement ; ambiguïtés envoyées en « à rapprocher » | `bureau/ma-ville.js` | testé |
| Décision humaine « C'est ce client EBP / Aucun compte / Je ne sais pas », historique conservé | `bureau/verifier-comptes.js`, `decisions-comptes.js` | testé |
| Sauvegarde / restauration | `tests/backup-*.test.cjs`, `bureau/lecture-sauvegarde.js` | testé |

## 2. Lacunes constatées pour le lot 1

| # | Lacune | Statut | Risque métier | Correction prévue |
|---|---|---|---|---|
| L1 | La date de l'export EBP vaut **par défaut la date du jour** (`bureau/index.html:1104`, `arrete: jourIso()`) ; l'utilisateur doit la corriger à la main | CONFIRMÉ | Un vieil export peut s'afficher comme « EBP du jour » et passer le garde-fou « export antérieur au mois » de `ca-facture.js` | Date d'export **obligatoire et sans défaut**, proposée à partir du fichier (nom, plus récente date de pièce) puis confirmée ; sinon « Date d'export inconnue ». |
| L2 | Pas de métadonnées de source : nom du fichier, nature, empreinte, nombre de lignes lues / retenues / écartées, date d'import | CONFIRMÉ (absentes du module) | Un chiffre ne peut pas être justifié par sa source | Fiche de provenance par import, stockée avec le résultat, affichée sous chaque chiffre. |
| L3 | Aucune colonne **SIRET** dans l'import clients EBP | CONFIRMÉ (`COLONNES.clients`) | Rapprochement EBP ↔ SIRET impossible depuis la source EBP ; reste le rapprochement par nom/commune, plus fragile | Colonne SIRET optionnelle, validation 14 chiffres + clé de Luhn, conflit SIRET/code → « à rapprocher », jamais fusion automatique. |
| L4 | Règlements : sans colonne « reste à payer », une ligne avec date de règlement est lue comme **soldée** ; un règlement partiel est donc invisible | CONFIRMÉ (`ebp-import.js:172`) | Créance sous-estimée, compte jugé sain à tort | Règlement partiel = statut « à vérifier », jamais « soldé » sans montant réglé ; reste affiché « douteux ». |
| L5 | Règlements : plusieurs lignes par facture (échéancier en plusieurs fois) non agrégées ; pas de détection de doublon ; montant TTC non rapproché du HT de la facture | CONFIRMÉ (pas d'agrégation) | Encours faux (double ou sous-comptage) | Agrégation par n° de facture, contrôle TTC ≥ HT, doublons signalés. |
| L6 | Le reste dû et l'échu existent déjà **par affaire** (`bureau/pipeline.js`, depuis l'échéancier EBP, sans HT × 1,2) mais aucun indicateur agrégé **« encaissé constaté »** distinct du CA, ni créances et comptes bloqués consolidés | CONFIRMÉ (`pipeline.js:113-120` ; absent de `ca-facture.js`) | Confusion CA / encaissement | Module `bureau/encaissements.js` : encaissé constaté, créances, comptes bloqués, chacun avec statut absent / douteux / validé. |
| L7 | Un export « ligne par ligne d'article » exporté deux fois produit des totaux doublés qui sont **additionnés** (`p.htCents += ht`) ; seul un avertissement est émis dans `ca-facture.js` | CONFIRMÉ | CA surévalué sans blocage | Détection du réimport (mêmes lignes complètes, même fichier) → blocage + demande de confirmation ; contrôle optionnel du total attendu saisi par l'utilisateur. |
| L8 | `lireMontant("1.234")` renvoie 1,23 € (point lu comme séparateur décimal) | HYPOTHÈSE (lecture du code, à prouver par test) | Montant faux d'un facteur 1000 si l'export utilise le point comme séparateur de milliers | Test dédié ; format ambigu → ligne marquée « douteuse » et non importée silencieusement. |
| L9 | **Deux implémentations d'import** : téléphone (`app.js`, `E.appliquer`, `CA.calculerMois`, testé par `tests/ebp-robustesse.test.cjs` : lignes de total, 2000 lignes) et Bureau (`ebp-import.js`, sans traitement des lignes de total) | CONFIRMÉ pour l'existence ; HYPOTHÈSE pour la divergence des chiffres | Deux règles pour le même fichier, chiffres différents | Comparer `tests/ebp-robustesse.test.cjs` au Bureau ; unifier seulement si divergence prouvée. |
| L10 | CA personnel vs CA agence : calcul présent, mais dépend de colonnes représentant/commercial supposées | CONFIRMÉ (hypothèse documentée dans le code) | « Non renseigné » tant que l'export réel n'a pas ces colonnes | Aucun changement de règle ; tests aux limites (représentant vide, code inconnu). |
| L11 | Journal des anomalies : les lignes écartées sont listées en mémoire, pas conservées en journal horodaté consultable | CONFIRMÉ (tableaux `ignorees`) | Preuve perdue à la fermeture | Journal d'anomalies par import, exportable (CSV), dans le coffre existant. |

## 3. Livrables du lot 1

1. `bureau/ebp-import.js` : provenance, SIRET, règlements partiels et multiples, contrôle de montants ambigus. Compatibilité ascendante conservée.
2. `bureau/encaissements.js` (nouveau, lecture seule) : encaissé constaté, créances, comptes bloqués, avec statuts absent / douteux / validé.
3. `bureau/ca-facture.js` : blocage du réimport, date d'export obligatoire. Les règles validées le 07/11 (avoirs à leur date, jamais de zéro inventé) ne changent pas.
4. Rapprochement : SIRET issu d'EBP intégré à `ma-ville.js` ; ambiguïté toujours résolue par `verifier-comptes.js`.
5. Tests : un fichier par module, cas limites listés ci-dessus, jeux **fictifs** uniquement (`tests/fixtures/`).
6. Documentation : `docs/LOT1_SOCLE_FIABLE.md` (fonctionnalités opérationnelles, limites, procédure de validation locale avec de vrais exports, point de reprise).

## 4. Critères d'acceptation du lot (reprise du § 10 du mandat)

- Chaque montant affiché renvoie à sa fiche de provenance.
- Avoirs, règlements partiels, doublons, réimport, SIRET invalide : un test par cas, tous verts.
- Aucune inconnue transformée en zéro (test de non-régression sur `non_renseigne`).
- Les suites existantes (`tests/*.test.cjs`) passent comme avant ; avant/après comparés.
- Réussite des tests ≠ validation métier : celle-ci exige de vrais exports EBP et l'accord de Faizal. **Non fait, non annoncé.**

## 5. Contraintes d'exécution

- **Essai JARVIS actif** : aucun test, build ni serveur lourd tant que `rapport-endurance.json` n'existe pas et que le processus d'essai n'a pas disparu. Une heure de fin estimée ne suffit pas.
- Données réelles ODICOLOR : jamais dans ce dépôt public.
- Push : limité par la consigne de session à `ccr-394b2d9a-kcmqcj`. La branche `odicolor-2-0-lot1-socle` reste **locale** tant que cette restriction n'est pas levée explicitement.
- JARVIS : aucune interface créée ou modifiée dans ce lot.
