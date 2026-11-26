# Recette CHARLIE — reprise du mardi 1er décembre 2026 (secteur 77)

Règle : **go** seulement si tous les points « BLOQUANT » sont validés. Sinon on reste sur la tournée habituelle (`#/tournee`), qui n'est jamais modifiée.
Convention : ✅ vérifié automatiquement (commande donnée) · 👤 à vérifier sur le Samsung (je ne peux pas le faire depuis le cloud).

## A. Automatique (déjà exécuté par le code, à relancer avant la reprise)
| # | Contrôle | Commande | Attendu |
|---|---|---|---|
| A1 ✅ | Toute la suite (unitaire, intégration, chaîne complète, confidentialité) | `node --test tests/*.test.cjs` | 0 échec |
| A2 ✅ | PWA à jour et intègre | `node scripts/build-pwa.cjs --check` | « Construction vérifiée » |
| A3 ✅ | Parcours navigateur (Chromium, format Samsung) | `node tests/navigateur/charlie-v50.e2e.mjs` | 21 « OK », 0 « ÉCHEC » |
| A5 ✅ | Téléphone ↔ vrai serveur CHARLIE (dépôt cockpit, données synthétiques) | `cd cockpit-carrosserie && node --disable-warning=ExperimentalWarning ../devis-terrain/tests/integration/charlie-serveur-reel.mjs` | 10 « OK » |
| A4 ✅ | Moteur routier réel (sur le PC cible) | `node infra/routage/verifier-moteur.cjs` | 6 secteurs « OK » + VROOM « OK » |

## B. Samsung (👤, 15 minutes, la veille — lundi 30/11)
| # | Étape | Attendu | Bloquant |
|---|---|---|---|
| B1 | Ouvrir ODICOLOR → Tournée → « 🧭 Tournée optimisée CHARLIE » | 8 gros boutons visibles, pastille de synchronisation | oui |
| B2 | Réglages CHARLIE → horaires, pause, durées | valeurs enregistrées ; horaire absurde refusé | oui |
| B3 | Réglages → Synchronisation : adresse HTTPS + jeton | pastille « 🟢 Synchronisé » ; avion activé → « 🟠 Hors ligne » puis retour au vert | oui |
| B4 | OPTIMISER (position activée) | proposition « À VALIDER », secteur 77 affiché, **garages de Laurent tous présents** ; garages sans fiche listés « à rapprocher » | oui |
| B5 | Contrôler 3 garages sur la carte (adresse réelle) | positions plausibles ; sinon « Vérifier les adresses » | oui |
| B6 | VALIDER, puis GPS | Waze/Google s'ouvre sur le bon garage | oui |
| B7 | VISITE TERMINÉE (saisir la durée) puis CLIENT ABSENT sur un autre | visite dans la fiche ; nouvelle organisation proposée **à valider** | oui |
| B8 | Mode avion → rouvrir CHARLIE | la dernière tournée reste lisible | oui |
| B9 | DICTER MON RAPPORT | texte dicté ou clavier Samsung ; note dans la fiche | non |
| B10 | Ouvrir le Bureau (`bureau/charlie-carte.html`) | la carte reflète la tournée du téléphone sous 15 s | non |

## C. Données (👤 + automatique)
- C1 Feuille de Laurent du 01/12 : **11 passages** ; vérifier la liste « à rapprocher » (noms sans fiche ou avec faute de frappe) → confirmer les rapprochements proposés (bouton). Les **répétitions** de la source sont conservées et à clarifier avec Laurent.
- C2 EBP : importer le dernier export de factures (Réglages → Imports) **avant** de compter sur le CA : sans import, le CA n'intervient pas dans les priorités (signalé « ca_ebp » manquant). La marge reste manquante.
- C3 Secteurs : écarts connus à valider avec Laurent (conservés, jamais corrigés d'office) — voir le rapport de session.

## D. Retour arrière
Un problème pendant la journée → « Tournée habituelle (inchangée) » en bas de l'écran. Le Bureau et CHARLIE ne bloquent jamais le téléphone (file hors-ligne). Aucune donnée n'est supprimée par CHARLIE.

## E. Critères d'acceptation après la première semaine
Compter (sans inventer) : visites réalisées / prévues, absences, écart d'heure d'arrivée moyen, durées réelles vs prévues (écran « Ce que CHARLIE a appris »). Décider d'ajuster pauses/durées **sur mesures**, pas au ressenti (AGENTS.md : « sans mesures, valeurs = hypothèses »).

## F. Points connus avant la reprise
- **Cœur unique** : le cœur est identique dans `devis-terrain` et `cockpit-carrosserie` (garde-fou `tests/charlie-coeur-partage-v50.test.cjs` + empreinte côté cockpit). Toute modification du cœur = resynchroniser (`scripts/resynchroniser-coeur.mjs`) des deux côtés.
- **Feuille de Laurent côté CHARLIE** : servie du **01/12 au 31/12** : 01→11/12 = calendrier du cockpit (prévisions non confirmées) ; 14→31/12 = rotation S1/S2 **préparée, statut « à confirmer »** (mêmes listes que la semaine correspondante, confirmées par la table Airtable) ; jours à confirmer avec Laurent : 24, 28, 29, 30, 31/12. Après le 31/12 : rien d'extrapolé.
- **Heures de rendez-vous** : absentes du calendrier de Laurent ; à saisir sur la fiche (`rdv`) si un rendez-vous est fixé.
- **Charge du 01/12 (secteur 77)** : 11 passages, dont 1 sans code postal dans le classeur ; ne tient pas en 8h-17h à 30 min/visite depuis Massy–Palaiseau → décider avec Laurent des reports (CHARLIE signale le conflit, ne supprime rien).
- **Moteur routier** : tant qu'il n'est pas installé et vérifié (A4), les trajets sont des estimations et les positions des centres de commune : bien lire la mention « approximatif » dans la proposition.
