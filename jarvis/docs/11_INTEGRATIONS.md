# 11 — Intégrations EBP, Gmail, Airtable (interfaces préparées, données synthétiques)

**Aucun accès à un système réel. Aucune action externe sans décision humaine.** Tout mode « réel » est refusé sans autorisation administrateur, puis échoue explicitement (« non développé »).

| Connecteur | Ce qui existe | Garde-fous | Ce qui manque |
|---|---|---|---|
| **EBP** (`connecteurs/ebp.js`) | Import de 4 exports CSV (articles, clients, factures, paiements) → jeux normalisés + rapport + empreinte, marqués FICTIF | Séparateur `;`, en-têtes **exacts**, 5 Mo / 100 000 lignes max, cellule ≤ 500 car., **injection de formule** (`= + - @ tab`) refusée, caractères de contrôle, dates et montants stricts, doublons ; **jamais d'exception** (rejet ligne par ligne) | Le **format réel d'export EBP est inconnu** : le mapping est de démonstration. Aucune lecture directe ni écriture dans EBP |
| **Gmail** (`connecteurs/gmail.js`) | Création de **brouillons** dans une boîte synthétique locale | **Aucune méthode d'envoi** (testé : `envoyer`, `send`… n'existent pas) ; destinataire `.invalid` exigé ; message marqué `BROUILLON` ; une seule action permise ; idempotent par clé | OAuth, boîte réelle, périmètre « brouillons » côté Google |
| **Airtable** (`connecteurs/airtable.js`) | Base synthétique JSON : lecture, upsert idempotent | Action unique, noms de table validés, clé d'idempotence | API réelle, schémas, droits |

**Outbox** (`outbox.js`) : toute action externe est **enfilée dans la même transaction que la décision humaine**, exécutée par un travailleur, **une seule fois** (clé unique), reprise après crash (bail), 3 tentatives puis ÉCHEC tracé et alerté. Tests : double traitement concurrent, crash en cours d'action, connecteur absent.

Ouverture d'une intégration réelle = 1) développer le connecteur, 2) l'auditer, 3) autorisation `integration:<x>` accordée par l'administrateur **avec sa portée**, 4) revue de sécurité. Aucun de ces pas n'est franchi.
