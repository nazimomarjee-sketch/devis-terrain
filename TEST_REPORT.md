# TEST_REPORT — résultats réellement exécutés (2026-11-08, branche ccr-b491dc52-ckgq60, après intégration Lot 1)
Environnement : Node, Chromium/Playwright émulé (profil Galaxy S9+). **Simulation ≠ vrai Samsung.**
| Suite | Résultat |
|---|---|
| Tests unitaires/intégration Node (`tests/*.test.cjs`, 29 fichiers dont intégration téléphone→Bureau 1 500 garages) | 29/29 fichiers OK |
| Build PWA `--check` | OK |
| Navigateur téléphone : sauvegarde (9), PWA hors ligne (6), interface nulle (4), stabilisation (2), plan PC (5), volume (1) | tous OK (exécutés avant ce rapport sur le code combiné) |
| Suites `*-navigateur.cjs` du Bureau + local (13 fichiers) sur le code combiné | 13/13 OK (émulation Chromium) |
| Chiffrement `.odicolor` (10 tests) + lecture Bureau chiffrée + CA facturé téléphone (8 unitaires + 3 navigateur) | OK |
| Ensemble après T3/T6 : 31 fichiers Node, 13 navigateur Bureau/local, 7 navigateur téléphone, build PWA `--check` | tout OK (émulation) |
| Vrai Samsung | **NON TESTÉ** |
| Données réelles | **NON TESTÉ** (interdit, B2) |
