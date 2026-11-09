# 10 — Qualification : configurations, coûts, performances, limites

Mesures : `node scripts/bench.js` → `BENCH_RESULTATS.json`. **Machine de mesure : Linux, Xeon 2,8 GHz, 4 cœurs, 15,7 Go, Node 22.23.4. Aucune mesure Windows.**

## Performances mesurées

| Mesure | Résultat |
|---|---|
| Latence par mission — direct | 5 ms (moy.), 10 ms (p95) — 179 missions/s |
| — agent en processus restreint (« permission ») | **76 ms** (p95 96) — 13 missions/s |
| — agent confiné par l'OS (« linux-os ») | **98 ms** (p95 108) — 10 missions/s |
| Concurrence, agents isolés, 96 missions | 1 proc. : 12,6 /s · 2 : 25,5 /s · **4 : 43,8 /s** — **0 double exécution** |
| Montée en charge Finance (agent isolé) | 100 factures 84 ms · 1 000 : 105 ms · 5 000 : 189 ms · **20 000 (5,5 Mo) : 484 ms** |
| Mémoire | service **≈ 76 Mo** ; agent isolé ≈ 47 Mo de pic (mesure précédente) |
| Base | ≈ **15,5 Ko par mission** (400 missions = 5,9 Mo) ; 2 001 lignes de journal |
| Sauvegarde chiffrée + vérification | 122 ms (2 Mo) ; restauration 63 ms |
| API `/api/etat` (400 missions) | p50 28 ms · p95 46 ms ; `/api/sante` p50 20 ms |
| Auto-test de l'auditeur | 9 ms |
| Attestation | 1,8 s (« permission ») · 0,12 s (« os ») |
| Démarrage du service | ≈ 4,1 s (inclut auto-test + attestation) |
| Reprise après `kill -9` (redémarrage direct) | 0,22 s (le superviseur ajoute ≤ 2 sondes de confirmation) |

## Limites mesurées ou prouvées

- **Taille** : les données transitent par stdin vers l'agent isolé ; au-delà d'une certaine taille, le **plafond de sortie (2 Mo)** s'applique. Les listes d'anomalies sont plafonnées à **200** (totaux exacts conservés). Au-delà : mission **BLOQUÉE** avec demande de réduire le périmètre — **pas de corrections inutiles**.
- **Débit** : ≈ 44 missions/s à 4 processus : très au-dessus d'un usage commercial (quelques dizaines de missions par jour). Le goulot est le **lancement de processus**.
- **Une seule machine** : SQLite, pas de cluster.
- **`RLIMIT_NPROC` est par compte** (Linux) : à dimensionner si plusieurs agents du même compte tournent en parallèle.
- **Windows** : latence de lancement de processus et consommation **non mesurées**.

## Configurations matérielles

| | **Minimale** | **Recommandée** | **Avec modèle local plus tard** |
|---|---|---|---|
| Usage | 3 espaces, IA en ligne ou aucune, quelques dizaines de missions/jour | idem + marge 24/7, supervision, sauvegardes | idem + inférence locale |
| Système | Windows 11 **Pro** (BitLocker, comptes séparés) | idem | idem |
| CPU | 4 cœurs récents (classe N100/N150) | 4–8 cœurs efficients | 8 cœurs ou plus |
| RAM | **8 Go** | **16 Go** | **32 Go** (+ GPU NVIDIA ≥ 12–16 Go si confort voulu) |
| Stockage | SSD 256 Go | **SSD 512 Go** (≈ 15 Ko/mission : l'espace est dominé par Windows et les sauvegardes) | SSD 1 To |
| Réseau | Ethernet | Ethernet + VPN privé | idem |
| Protection | onduleur 700 VA + sauvegarde externe | idem | à redimensionner |

**Ce qui est mesuré** : l'empreinte de JARVIS (≈ 76 Mo par service, 3 services + 1 agent ≈ 0,3 Go) ; **ce qui ne l'est pas** : le comportement sous Windows. La RAM supplémentaire ne sert qu'à Windows lui-même et à un éventuel modèle local.

## Coûts (hypothèses et sources : `03_MATERIEL_ET_COUTS.md`, calcul : `modele_cout.mjs`)

| Scénario | Initial TTC | Courant / mois | Amorti 36 mois / mois | Total 12 mois | Total 36 mois |
|---|---|---|---|---|---|
| A — VPS Linux 4 vCPU/8 Go (HT) | 0 | 12,0 – 30,0 € | 12,0 – 30,0 € | 144 – 360 € | 432 – 1 080 € |
| **B — Mini-PC 16 Go (recommandé)** | **409 – 764 €** | **7,6 – 17,6 €** | 19,0 – 38,9 € | 501 – 976 € | 684 – 1 399 € |
| C — Mini-PC 32 Go | 1 010 – 1 365 € | 9,1 – 19,1 € | 37,1 – 57,0 € | 1 119 – 1 594 € | 1 337 – 2 052 € |
| D — Station IA locale + GPU | 1 490 – 2 055 € | 13,2 – 20,7 € | 54,6 – 77,7 € | 1 648 – 2 303 € | 1 964 – 2 799 € |

Détail de la fourchette B : mini-PC 219 – 509 € + onduleur 110 – 135 € + SSD externe 80 – 120 € (estimation non sourcée) ; électricité ≈ 2,7 €/mois (15 W moyens supposés, **non mesurés**) ; **API IA : 0 € aujourd'hui** (aucun fournisseur branché) — la réserve de 5 à 15 €/mois suppose un usage hypothétique et des tarifs **à relire sur la page officielle**.

**Un sous-total à ne pas oublier** : si tu choisis l'IA en ligne, le coût réel dépendra de **tarifs que je n'ai pas pu confirmer** (les sources trouvées se contredisent sur les modèles récents) : le code **refuse de démarrer** sans tarifs configurés.

## Verdict de qualification

| Critère | Statut |
|---|---|
| Fonctions métier (8 agents + auditeur) sur données fictives | **Qualifié** (Linux) |
| Supervision, reprise, anti-doublon | **Qualifié** (Linux, vrai service) |
| Isolation « os » | **Qualifiée sous Linux uniquement** |
| Isolation sous Windows | **NON qualifiée** (scripts non exécutés) |
| Interface Samsung | **Qualifiée en Chromium simulé** ; **non** sur appareil réel |
| 24 h/24 | **Non démontré** (aucun essai de durée) |
| Données réelles | **Interdites** tant que les 4 points du §8 de `00` ne sont pas réglés |
