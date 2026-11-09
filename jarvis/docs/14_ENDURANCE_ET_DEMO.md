# 14 — Essais de durée (mesurés) et parcours de démonstration

> **Durée réelle testée : 60 min puis 30 min, avec injection de pannes. Les 24 heures NE SONT PAS TESTÉES.** Horloge non accélérée. Linux uniquement, données fictives, **aucune validation Windows/Samsung**.

## Dispositif reproductible
`node --disable-warning=ExperimentalWarning scripts/endurance.js --minutes 1440 --graine 7 --chaos-s 90 --dir <dossier NEUF>` (≈ 24 h réelles ; rapport JSON dans le dossier). Lance un vrai service, un 2ᵉ travailleur (`scripts/ouvrier.js`), un superviseur, une charge de missions variées (clé d'idempotence ; le « téléphone » réessaie avec la même clé quand le service est indisponible), un approbateur automatique (**SIMULÉ** : 85 % approuve, 15 % refuse, double clic 25 %) et du chaos **RÉEL** : `kill -9` du service/du travailleur (ciblé pendant une mission en cours depuis le commit `3933e69`), gel `SIGSTOP`, panne de l'intégration (boîte synthétique indisponible 15–75 s). Puis purge et vérification d'invariants.

## Résultats
| | Essai 1 — commit `404a3b0` | Essai 2 — commit `3933e69` |
|---|---|---|
| Durée de charge / totale | 3 600 s / 3 671 s | 1 801 s / 1 957 s |
| Missions acceptées par l'API | 890 | 423 |
| **Perdues** (accusé reçu, absentes de la base) | **0** | **0** |
| Dupliquées | 0 | 0 |
| Non terminées après purge | 0 | 0 |
| kill -9 (service + travailleur) / gels / pannes d'intégration | 17 / 4 / 12 | 8 / 5 / 9 |
| dont kill -9 **pendant** une mission | non ciblé (0 mission rejouée : voie de reprise **non exercée**) | **8** |
| **Missions rejouées** après interruption | 0 | **5** (chacune exécutée 2 fois, 428 exécutions pour 423 missions ; aucune double sortie) |
| Envois simulés / approbations / doublons | 305 / 305 / 0 | 140 / 140 / 0 |
| Brouillons dans la boîte / attendus / doublons | 139 / 139 / 0 | 64 / 64 / 0 |
| Actions externes retentées (jusqu'à 6 tentatives) / en échec définitif | 18 / 0 | 17 / 0 |
| Erreurs d'agents / résultats contradictoires / erreurs de validation | 0 / 0 / 0 | 0 / 0 / 0 |
| Journal chaîné intact / lignes | oui / 5 186 | oui / 2 510 |
| Alertes critiques finales | **`TRACABILITE_INCOMPLETE` (faux positif = défaut, corrigé)** | aucune |
| RSS service début → fin (max) | 74 → 117 Mo (120) | 74 → 95 Mo (109) |
| RSS 2ᵉ travailleur | 70–77 Mo | 68–78 Mo |
| Base SQLite | 0,26 → 8,55 Mo | 0,26 → 6,2 Mo |
| Journal par mission / octets de base par mission | 5,8 lignes / ≈ 10 Ko | 5,9 lignes / ≈ 15 Ko (incl. WAL) |

**Défaut trouvé par l'essai 1 et corrigé** : `verifierTracabilite` ne regardait que les 300 dernières missions mais comparait les envois à cette fenêtre : au-delà de 300 missions, les envois légitimes plus anciens étaient déclarés « mission inconnue » → alerte critique **permanente et fausse** (458 alertes pendant l'essai). Correctif + test de non-régression (échoue sans le correctif). Un vrai orphelin reste détecté.

## Ce que ces essais ne prouvent PAS
- **24 h** : non testé. Extrapolation à 24 h = hypothèse (≈ 25 000 missions à ce rythme, base ≈ 150–400 Mo avec WAL, journal ≈ 150 000 lignes — à vérifier ; la vérification de chaîne parcourt tout le journal et ralentira).
- **Mémoire** : elle monte puis se stabilise (≈ 95–120 Mo) **dans chaque vie du processus**, mais chaque redémarrage remet à zéro : un plateau sur 24 h sans redémarrage n'est **pas démontré**.
- **Fuites de descripteurs, croissance du dossier `sorties/`** (non mesurées séparément), **sauvegardes/restaurations** pendant la charge, **coupure de courant** (seul `kill -9` est testé), disque plein.
- **Charge réelle** : 14 missions/min environ, instantanées (≈ 0,1 s) car les données fictives sont petites.
- L'« humain » et la boîte Gmail sont simulés ; rien n'a tourné sous Windows.

## Parcours de démonstration (`scripts/demo.js`, captures dans `docs/captures/demo/`)
`node --disable-warning=ExperimentalWarning scripts/demo.js --dir <dossier neuf> --captures <dossier>`
| # | Étape | Nature |
|---|---|---|
| 1 | Téléphone (Chromium 360×780 tactile) | **SIMULÉ** (pas un vrai Samsung, pas de VPN) |
| 2 | Demande tapée dans l'interface → `POST /api/missions` authentifié | RÉEL |
| 3 | Agent Devis (règles déterministes, **pas d'IA**) prépare le devis | RÉEL |
| 4 | Auditeur indépendant : recalcul, 12/12 contrôles | RÉEL |
| 5 | Écran « à valider » + détail (plan, droits, contrôles) | RÉEL |
| 6 | Avant validation : 0 brouillon | RÉEL |
| 7 | Validation humaine | **SIMULÉ** dans le script (clic automatique) ; code réel (réaudit, transaction) |
| 8 | Brouillon de mail dans la boîte | **SIMULÉ** : fichier `.eml` local, destinataire `.invalid`, jamais envoyé |
