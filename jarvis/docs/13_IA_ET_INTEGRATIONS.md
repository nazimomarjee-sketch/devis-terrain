# 13 — Qui utilise réellement une IA ? Qu'est-ce qui est simulé ? (état factuel)

Statuts : **RÉEL** = exécuté pour de vrai dans ce dépôt et couvert par des tests ; **SIMULÉ** = remplacé par un substitut local ; **ABSENT** = n'existe pas.

## 1. Agents : règles déterministes ou modèle IA ?

**Aucun des 8 agents, aucun des 8 auditeurs n'utilise un modèle IA.** Ce sont des fonctions déterministes (mêmes entrées ⇒ mêmes sorties, vérifié par double exécution et par test différentiel sur 60 jeux aléatoires avec un oracle indépendant). Aucun modèle — local ou en ligne — n'a jamais été appelé pour produire un devis, une relance, un plan ou un contrôle.

| Fonction | Mécanisme | Modèle IA ? |
|---|---|---|
| Routage d'une demande vers un agent | Règles (mots-clés/motifs, `routage.js`) | **Non** |
| Agents Devis, Produits, Prospection, Clients, Relances, Commandes, Finance, Planification | Code déterministe sur jeux de données déclarés | **Non** |
| Auditeurs (1 par agent) | Recalcul indépendant en BigInt depuis les sources | **Non** (volontairement : un contrôleur à base de modèle serait non reproductible) |
| Rédaction du texte de relance / du mail | Gabarits fixes | **Non** (texte non « intelligent », mais prévisible et vérifiable) |
| **Reformulation d'une demande non comprise** (`modeles.js` → `Interpreteur`) | **Seul point d'extension IA** : propose un agent + une reformulation quand le routage échoue (`AUCUN_AGENT`) | **Oui, en option** — **désactivée par défaut**, exige clé + modèle + tarifs fournis ET l'autorisation `ia_en_ligne` |

Garde-fous de ce point d'extension (testés) : la sortie n'est qu'une **proposition** (jamais exécutée telle quelle ; agent actif exigé, longueur bornée, motifs d'injection/secrets refusés), entrée masquée (e-mails, IBAN, jetons), budget journalier, disjoncteur, repli sur le fournisseur suivant, **aucune fonction métier ne dépend d'Internet**.

**Ce qui a été testé pour l'IA :** uniquement contre un **serveur HTTP local simulé** (adaptateur `fournisseurs/anthropic.js` : hôte autorisé, TLS exigé hors essai, tarifs obligatoires). **Jamais contre le service réel** : le comportement réel (format de réponse effectif, limites de débit, latence, coûts mesurés, qualité des reformulations) est **INCONNU**. Un fournisseur **local** (modèle sur la machine) est prévu dans l'interface (`ordre: ['local','en_ligne']`) mais **aucune implémentation locale n'existe** (ABSENT).

> Conséquence pour ton idée de départ (« un modèle local plus précis que toutes les IA réunies ») : à ce stade JARVIS est un **moteur de règles vérifiable**, pas une IA. C'est un choix défendable pour des devis (précision, reproductibilité), mais la compréhension de demandes en langage libre reste limitée aux motifs connus tant qu'aucun modèle n'est branché et évalué.

## 2. Intégrations : simulé vs service réel

| Intégration | Ce qui fonctionne **réellement** (dans ce dépôt) | **Simulé** | **Avec le service réel** |
|---|---|---|---|
| **Gmail** | Création de brouillon `.eml` MIME correct (pièce PDF jointe), file d'attente transactionnelle (outbox), idempotence par clé, attente progressive, reprise après crash, rejeu administrateur, alertes (testé jusqu'à la panne répétée de la boîte par `scripts/endurance.js`) | La **boîte** : dossier local `boite-synthetique/`, destinataires `.invalid` obligatoires | **Rien n'a été exécuté** : pas d'OAuth, pas d'appel API Google, pas de brouillon réel. Mode `reel` ⇒ refus sans autorisation puis `IntegrationNonDeveloppee`. **Aucune méthode d'envoi n'existe.** |
| **EBP** | Import de **fichiers CSV** d'export (lecture seule), validation stricte, anti-injection de formule, rapport | Le **format** : mapping de démonstration inventé (le vrai export EBP est inconnu) | **Rien** : aucune lecture ni écriture EBP. Le format réel doit être vérifié sur un export réel d'ODICOLOR |
| **Airtable** | Base synthétique JSON : lecture, upsert idempotent | La **base** | **Rien** : pas d'API réelle |
| **IA en ligne** | Adaptateur, budget, masquage, disjoncteur, repli | Le **serveur** (local, simulé) | **Rien** (voir §1) |
| **Samsung / téléphone** | Interface PWA réelle testée dans Chromium 360×780 tactile, service worker, hors-ligne | Le **téléphone** (émulé) ; pas de VPN | Installation sur un vrai Samsung : **non testée** (essais S1–S15) |
| **Windows** | Scripts PowerShell écrits, analysés statiquement | Tout (aucune exécution) | **Non qualifié** : jamais exécuté sur Windows (essais W1–W21) |
| **Validation humaine** | Code réel (réaudit, transaction, idempotence) | Dans les scripts `demo.js`/`endurance.js` : l'« humain » est un clic automatique | Usage réel : toi, sur ton téléphone |
