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
| Cycle 3 : import EBP du CA (10 unit.), visite 4 touches (7 unit. + 4 nav.), carte >1 000 garages (7 unit. + 3 nav., 10 000 garages < 60 ms/geste en Node), Ma Ville téléphone (3 nav.), cohérence téléphone⇄Bureau (3) | OK (émulation) |
| Ensemble fin cycle 3 : 36 fichiers Node, 13 navigateur Bureau/local, 11 navigateur téléphone, build PWA `--check` | tout OK (émulation Chromium) |
| Cycle 4 : rattachement code EBP, réachat, tournée proposée (4 unit. + 1 nav.), grand écran | OK (émulation) |
| Fin cycle 4 : 37 fichiers Node, 13 navigateur Bureau/local, 11 navigateur téléphone, build `--check` | tout OK (émulation Chromium) |
| Mesure ponctuelle (Chromium de bureau, pas un Samsung) : 2 000 garages, ouverture des pages clients/cockpit/proposition/ville/carte < 250 ms hors attente | à confirmer sur le téléphone réel |
| CI GitHub, commit ffd8614 (branche ccr-b491dc52-ckgq60) | SUCCÈS : syntaxe, build PWA, 37 fichiers Node, jeu de volume, 10 suites navigateur téléphone, 13 suites Bureau/local |
| Anomalie trouvée et corrigée (cycle 5) : `pwa-browser` test 5 intermittent (~50 %) depuis l'ajout des scripts de Ma Ville. Cause : le test passait hors ligne alors qu'un worker en attente n'avait pas encore pris le contrôle (l'application échoue alors de façon sûre : « Chargement incomplet »). Correction : `nextVersion` n'accepte la nouvelle version que si plus aucune mise à jour n'attend ; 8/8 exécutions stables. Aucun test désactivé. | corrigé |
| Fin cycle 5 : 41 fichiers Node, 13 navigateur Bureau/local, 14 navigateur téléphone, build `--check` | tout OK en local (émulation) ; CI du dernier commit : voir synthèse |
| Interface (tournée compacte, formes) : 4 tests navigateur sur 360×740, 412×915, 320×658 ; régressions : 16 navigateur téléphone, 42 Node, 13 Bureau/local, build `--check` | tout OK en local (émulation) |
| Revue du 10/11 (émulation 360×740, serveur en mode terrain) : 26 écrans, 0 erreur JavaScript, 0 requête en échec, 0 « null/undefined/NaN », 0 défilement horizontal. Défaut corrigé : bandeau « mise à jour prête » affiché à tort à la première installation (test ajouté). | corrigé, non déployé |
| Vrai Samsung | **NON TESTÉ** |
| Données réelles | **NON TESTÉ** (interdit, B2) |
