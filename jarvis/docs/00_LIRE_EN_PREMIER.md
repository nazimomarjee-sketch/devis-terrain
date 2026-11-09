# JARVIS v3 — État réel (lire en premier, 5 minutes)

Date : 9 novembre 2026. Preuves : `cd jarvis && npm test` → **256 tests verts, 0 ignoré** (`PREUVES_TESTS.txt`) ; mesures : `docs/BENCH_RESULTATS.json` (`node scripts/bench.js`).

> **Tous ces tests ont tourné sous Linux, sur des données fictives. Aucun n'est une validation Windows ni Samsung.** Les scripts Windows existent mais **n'ont jamais été exécutés** (pas de Windows, pas de PowerShell ici). Un test vert n'est jamais présenté comme une preuve sur le matériel réel.

## Réponse courte

Le système est plus solide et, surtout, **plus honnête sur ses limites** : l'isolation des agents a été auditée puis renforcée par le système d'exploitation (prouvé sous Linux), l'auditeur est lui-même supervisé, les incidents sont détectés et traités, et une série de défauts réels a été trouvée **par des tests adversariaux** puis corrigée. Il **n'est pas utilisable avec des données réelles** : il manque l'accord d'ODICOLOR, les règles validées, et la **preuve d'isolation sur ton Windows**, que seul le vérificateur fourni peut apporter.

## 1. Sécurité P0 — ce qui a été audité et prouvé

Audit adversarial du modèle de permissions de Node 22.23.4 (tentatives réelles de contournement) :

| Domaine | Constat (Linux, Node 22.23.4) |
|---|---|
| Fichiers, liens symboliques/durs, `rename`, `/proc`, processus enfants, workers, addons natifs, inspecteur | **Bien bloqués** (testé) |
| **`process.kill` sur un processus du même compte** | **PASSE** (faille) |
| **`process._debugProcess`** (activer le débogueur d'un autre processus Node du même compte) | **PASSE** (faille grave) |
| **Réseau** (TCP, UDP, DNS, sockets Unix) | **PASSE** (faille) |
| **Mémoire** hors tas (1,5 Go alloués malgré `--max-old-space-size=64`) | **PASSE** |
| **Disque** (écriture illimitée dans la sortie) | **PASSE** |

**Conclusion : les permissions Node seules ne constituent PAS une isolation.** Une copie de `node.exe` n'est pas une preuve non plus.

Réponse construite et prouvée **sous Linux** (backend `linux-os`) : compte distinct par agent + espace réseau vide + limites de ressources (`unshare`/`setpriv`/`prlimit`). Avec lui, **les 5 failles se ferment** : `kill` → EPERM, débogueur → EPERM, TCP/UDP → ENETUNREACH, mémoire et fichier plafonnés (EFBIG).

**Attestation par accès interdits** : 14 sondes tentées *dans* le confinement ; un refus ne compte **que** s'il porte un code de refus avéré (EACCES, EPERM, ENETUNREACH…) — un fichier absent (ENOENT) ou un processus déjà mort (ESRCH) est « indéterminé » donc **échec** (deux défauts de cette logique ont été trouvés et corrigés). Sous « permission » seul, l'attestation constate **honnêtement** 9 accès interdits qui passent. **Les données réelles sont refusées tant qu'une attestation « os » récente (< 24 h) du backend réellement utilisé n'existe pas.**

**Sous Windows** : conception complète (backend par échange de fichiers + tâche planifiée sous un compte agent dédié, ACL NTFS, pare-feu par compte, vérificateur d'accès interdits sous chaque compte). Le **protocole** est testé sous Linux ; les scripts PowerShell **ne sont pas exécutés**. Risque résiduel connu : le trafic **loopback** n'est pas filtré par le pare-feu Windows (le vérificateur le mesure).

## 2. Supervision permanente — prouvé

| Supervision de… | Mécanisme | Preuve |
|---|---|---|
| **L'auditeur** | Auto-test périodique sur jeu canari : doit valider un résultat correct **et** refuser le même résultat falsifié. Défaillant ⇒ **échec fermé** (plus de prise de mission, plus d'approbation) | Auditeur « tampon encreur » (valide tout) détecté ; auditeur trop strict détecté |
| **L'orchestrateur** | Battement de cœur, alerte « file bloquée », disjoncteur interne (5 erreurs de boucle ⇒ sortie pour redémarrage) | Tests d'alertes ; scénario réel |
| **Les agents** | Double exécution de contrôle : deux exécutions identiques **doivent** donner le même résultat (détecte ce que l'auditeur ne voit pas) | Dérive d'un champ libre détectée |
| **Le service** | **Superviseur externe** (ne voit que `/api/sante`), redémarrage sûr, budget de 3 redémarrages / 10 min, **protection contre les boucles de crash**, escalade | **Vrai service tué par `kill -9`** : redémarré, 10 missions menées à terme **une fois**, un seul envoi par approbation même en double clic, journal intact |
| **Les accès** | Refus agrégés, escalade de privilège (jeton utilisateur sur route admin et inverse) tracée, alertes | Tests |
| **L'état** | Traçabilité état ↔ journal, résultat modifié hors circuit, validation sans trace, restauration | Tests |
| **Sauvegarde** | Exercice de restauration **automatique** hebdomadaire | Tests |
| **Après incident** | Aucun double envoi : envois **idempotents** (index unique) + outbox transactionnel | 3 processus approuvent en même temps : un seul envoi |

## 3. Fiabilité métier — défauts réels trouvés par les tests adversariaux (puis corrigés)

| # | Défaut | Comment trouvé |
|---|---|---|
| 1 | 8 champs de résultats **jamais vérifiés** par les auditeurs (+ 3 en mode atelier) | Mutation **champ par champ** de tous les résultats (plus de 360 mutations) |
| 2 | Arrondi de marge **négative** divergent agent/auditeur (mission en échec définitif) | **Test différentiel** sur 60 jeux aléatoires × 11 demandes (660 missions) |
| 3 | Anomalies comptées en double côté agent | Test différentiel |
| 4 | Plan du jour dépendant d'un état qui change pendant le calcul (échecs à 4 processus) | **Banc de charge** : 96 missions / 4 processus |
| 5 | Dépassement silencieux de taille à 20 000 factures (3 corrections inutiles puis échec) | Banc de montée en charge |
| 6 | Erreur de taille mal classée selon le timing | Intermittence investiguée, pas masquée |
| 7 | Parseur de dates EBP qui levait une exception | Test adversarial d'import |
| 8 | Dossier de sortie non nettoyé entre tentatives ; base SQLite lisible par tous (0644) ; ordre FIFO non garanti | Tests d'isolation |

Cohérence des données : **validation de structure avant tout calcul** (10 corruptions testées), calculs en entiers contrôlés par un **oracle** écrit dans le test, 600 demandes hostiles de **fuzzing** sans plantage ni droit accordé.

## 4. Hybride, intégrations, mobile

- **Local d'abord** : les 8 agents sont déterministes et ne dépendent d'aucune IA ni d'Internet (testé : panne Internet ⇒ toutes les missions claires aboutissent).
- **IA en ligne contrôlée** : adaptateur (liste blanche d'hôtes, https, **tarifs obligatoires — aucun prix présumé**, clé jamais journalisée, autorisation `ia_en_ligne`, disjoncteur) testé contre un **serveur simulé** ; **jamais appelé pour de vrai**. Elle ne fait que *proposer* une reformulation.
- **EBP / Gmail / Airtable** : interfaces avec **données synthétiques** uniquement. EBP : import CSV strict (injection de formule, cellules géantes… rejetés) ; Gmail : **brouillons seulement, aucune méthode d'envoi** ; Airtable : écritures idempotentes ; actions externes via un **outbox** (une exécution, reprise après crash). Le **format réel d'export EBP est inconnu**.
- **PWA Samsung** testée dans un **vrai Chromium** : service worker **sans donnée en cache**, hors ligne explicite, XSS inopérant, cibles ≥ 44 px, arrêt d'urgence visible.

## 5. Performances mesurées (Linux 4 cœurs / 15,7 Go — **pas Windows**)

Voir `10_QUALIFICATION.md` : 5 ms/mission en direct, **75 ms en agent isolé, 98 ms avec confinement OS** ; **43,8 missions/s à 4 processus** ; service 75 Mo ; reprise après `kill -9` en 0,2 s ; sauvegarde+vérification 122 ms ; 20 000 factures traitées en 0,5 s.

## 6. Ce qui NE PEUT PAS être fait ici (matériel physique absent)

| Vérification physique | Pourquoi |
|---|---|
| Exécuter `installer.ps1` et **`verifier-isolation.ps1`** sur ton Windows | Aucun Windows ici. **C'est l'arbitre : sans lui, aucune donnée réelle** |
| Tâche planifiée sous compte agent, `schtasks` Run/End, ACL de la tâche | Idem |
| Règles de pare-feu par compte (`-LocalUser`) | Idem |
| Redémarrage Windows, coupure de courant, Windows Update, 7 jours continus | Idem |
| Installation de la PWA, VPN, accès 4G, dictée, perte du téléphone | Aucun Samsung |
| Performances sous Windows (lancement de processus), consommation réelle en watts | Idem |

## 7. Risques résiduels (sans fard)

1. **Windows non prouvé** : le confinement « os » n'est démontré que sous Linux. Tant que le vérificateur Windows n'a pas passé, le niveau Windows est « permission » (insuffisant pour du réel). Et **la loopback n'est pas filtrée** sous Windows.
2. **Même noyau, même machine** : pas de machine virtuelle ; une faille du noyau ou de Node casserait l'isolation. Pas d'audit externe.
3. **L'auditeur ne voit pas une source fausse** (mauvais tarif saisi) ; le rapprochement EBP viendra avec l'import réel.
4. **Intermittences** : plusieurs échecs intermittents rencontrés au fil des exécutions complètes, tous **investigués** (la plupart ont révélé de vrais défauts, corrigés) ; la suite est verte sur les dernières exécutions consécutives, **mais l'absence de reproduction n'est pas une preuve d'absence**.
5. **Verrouillage par IP** (5 échecs) : un attaquant partageant l'IP peut verrouiller un utilisateur légitime.
6. Règles métier encore **de démonstration** ; **règles TVA à faire valider** par un expert-comptable.
7. `node:sqlite` expérimental ; modèle de permissions de Node : statut à revérifier à chaque mise à jour.

## 8. Ce qui demande TON intervention

1. **Accord écrit d'ODICOLOR** (données, hébergement, IA en ligne éventuelle).
2. **Valider les règles métier** (TVA par territoire/opération, remises, marges).
3. **Achat du matériel** (recommandation en `10`) — rien n'a été acheté.
4. **Exécuter `installer.ps1 -Simuler`, relire, installer, puis `verifier-isolation.ps1`** et m'en donner le rapport JSON : c'est la seule voie pour valider Windows.
5. Si tu veux de l'IA en ligne : choisir le fournisseur, lire **ses tarifs et conditions actuels**, créer la clé.
