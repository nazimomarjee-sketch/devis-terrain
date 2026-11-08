# TEST_REPORT — résultats réellement exécutés (2026-11-08, branche ccr-b491dc52-ckgq60, après intégration Lot 1)
Environnement : Node, Chromium/Playwright émulé (profil Galaxy S9+). **Simulation ≠ vrai Samsung.**
| Suite | Résultat |
|---|---|
| Tests unitaires/intégration Node (`tests/*.test.cjs`, 29 fichiers dont intégration téléphone→Bureau 1 500 garages) | 29/29 fichiers OK |
| Build PWA `--check` | OK |
| Navigateur téléphone : sauvegarde (9), PWA hors ligne (6), interface nulle (4), stabilisation (2), plan PC (5), volume (1) | tous OK (exécutés avant ce rapport sur le code combiné) |
| Suites `*-navigateur.cjs` du Bureau + local (13 fichiers) sur le code combiné | 13/13 OK (émulation Chromium) |
| Vrai Samsung | **NON TESTÉ** |
| Données réelles | **NON TESTÉ** (interdit, B2) |
