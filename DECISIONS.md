# DECISIONS (techniques et de méthode — réversibles sauf mention)
| # | Décision | Pourquoi |
|---|---|---|
| D1 | Push uniquement sur `ccr-b491dc52-ckgq60` (branche de développement désignée), jamais main, jamais de PR automatique | La règle « pas de push sans autorisation » est lue comme : pas d'autre branche ; l'environnement exige de pousser le travail pour ne pas le perdre |
| D2 | Lot 1 téléphone (sauvegarde `.odicolor`, restauration sûre, PWA hors ligne) intégré dans la branche de dev depuis la branche de PR #2 ; PR #3 considérée comme doublon ancien | Ce lot n'était pas dans main ; sans lui P0 non couvert |
| D3 | L'objectif chiffré mensuel, la promesse d'embauche et le plan commercial restent hors du dépôt public (saisis dans le cockpit, gardés en local) | Dépôt public |
| D4 | Ville LEGO non modifiée sans accord (verrouillée par test d'invariance) | Vision validée par le propriétaire |
| D5 | Résultats officiels du recensement 45.20A (CSV) hors dépôt (`recensement-sortie/` ignoré) ; seule la méthode et le code sont versionnés | Données de registre, dépôt public |
| D6 | 45.20A ≠ atelier peinture : niveau de preuve « inconnu » tant qu'aucune preuve (achat EBP, constat terrain) | Règle du propriétaire |
| D7 | Compte client : EN COMPTE / SANS COMPTE (vérifié, auteur+date) / À VÉRIFIER ; jamais « sans compte » automatique ; aucune fusion par nom | Cohérence commerciale |
| D8 | Coffre inaccessible ⇒ décisions refusées (pas un simple avertissement) | Demande du propriétaire |
| D9 | Tests : jamais de chaîne courte cherchée dans du chiffré base64 (faux positifs) — `tests/support/en-clair.cjs` | Test intermittent lot A diagnostiqué |
| D10 | Ralph Loop : présent dans le catalogue officiel, NON activé ; activation = action du propriétaire (voir BLOCKERS B6). Sans lui : boucle manuelle via ces fichiers | Ne pas prétendre ce qui n'est pas installé |
| D11 | Mobile-first : le cockpit vit dans la PWA du téléphone (données IndexedDB, hors ligne) ; le Bureau et le coffre local restent des options, jamais requis | Orientation du propriétaire, pas de PC |
| D12 | Sauvegardes : AES-256-GCM + PBKDF2-SHA256 600 000 itérations, phrase non conservée, relecture avant téléchargement, anciens formats importables | Demande du propriétaire (issue #6) |
| D13 | CA = factures HT − avoirs saisis ; jamais déduit des commandes ; « non renseigné » sinon ; annulation motivée, jamais de suppression | Demande du propriétaire |
