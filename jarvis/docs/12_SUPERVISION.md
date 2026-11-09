# 12 — Supervision permanente : qui surveille quoi

| Niveau | Surveille | Détecte | Réagit |
|---|---|---|---|
| **Superviseur externe** (`superviseur.js`, processus distinct) | Le service, via `/api/sante` **uniquement** (aucune donnée) | Mort, silence (> 30 s sans battement), alertes critiques | Redémarre après 2 sondes ratées ; **max 3 redémarrages / 10 min**, puis **escalade** et suspension (boucle de crash) ; alerte seule si le service est vivant mais « critique » |
| **Disjoncteur de l'orchestrateur** | La boucle de traitement | 5 erreurs consécutives | Sort (code 3) pour laisser le superviseur redémarrer proprement |
| **Auto-test de l'auditeur** | L'auditeur lui-même | Faux positif, **faux négatif** (valide un résultat falsifié), plantage | **Échec fermé** : plus de prise de mission ni d'approbation ; alerte critique |
| **Double exécution** | Les agents | Deux exécutions identiques ≠ résultats | Correction → escalade ; alerte `RESULTATS_CONTRADICTOIRES` |
| **Diagnostic** (`sante.js`) | L'état de l'espace | Journal altéré, résultat modifié, validation sans trace, traçabilité incomplète, file bloquée, erreurs répétées, mission en erreur répétée, budget, sauvegarde ancienne, restauration non testée, accès refusés en masse, escalade de privilège, auditeur défaillant | Alertes (tableau de bord, sonde, superviseur) |
| **Confinement** | Les agents | 14 sondes d'accès interdits | Niveau attesté ; **refus des données réelles** sans « os » récent |

**Pourquoi un redémarrage est sûr** : missions à **bail** (reprise automatique), exécutions **sans effet de bord externe** (agents en lecture seule), envois **idempotents** (index unique + outbox), approbation **transactionnelle**. Prouvé : `kill -9` d'un vrai service en pleine activité, 10 missions, 1 reprise, 0 doublon, journal intact.

**Qui surveille le superviseur ?** Le planificateur de tâches Windows (redémarrage sur échec) et la sonde `sante.js` (code de sortie 1 si service silencieux). **Non testé sous Windows.** Les alertes sont **visibles** (tableau de bord, journal) ; **aucune notification push** n'est développée.
