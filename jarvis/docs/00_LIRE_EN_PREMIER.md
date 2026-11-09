# JARVIS v2 — État réel (lire en premier, 5 minutes)

Date : 9 novembre 2026. Preuves : `cd jarvis && npm test` → **175 tests verts** (`PREUVES_TESTS.txt`), captures dans `captures/`, mesures plus bas.

> **« 175 tests verts » ne veut pas dire « terminé ».** Ils prouvent la logique sur des données **fictives**, sous **Linux**. Rien n'a été essayé sur un vrai PC Windows ni sur un vrai Samsung (voir `09_ESSAIS_WINDOWS_SAMSUNG.md`, tous les essais sont marqués « NON RÉALISÉ »).

## La réponse courte

JARVIS est maintenant **un système complet de démonstration** : trois espaces cloisonnés, huit agents opérationnels *sur données fictives*, un auditeur indépendant, une exécution isolée des agents, un tableau de bord Samsung, une administration séparée. Il **n'est pas encore utilisable avec de vraies données** : il manque l'accord d'ODICOLOR, les règles métier validées, l'import EBP et les essais sur le matériel réel.

## 1. Construit ET testé

| Domaine | Ce qui est prouvé |
|---|---|
| **8 agents** | Devis · Produits · Prospection · Clients · Relances · Commandes · Finance · Planification. Chacun : rôle, droits de lecture déclarés, critères mesurables (`07_AGENTS.md`). Résultats vérifiés **à la main** (ex. 317,95 € TTC ; encours 71 001 centimes ; marge 3 180 pb ; plan de journée) |
| **Auditeur indépendant** | Un module par agent, **recalcul depuis les sources**, aucun code partagé avec l'agent (vérifié mécaniquement). Sur les 8 agents : **36 erreurs volontaires**, chacune détectée, corrigée, puis validée (ou bloquée à bon droit) ; **les mêmes 36 en version persistante → 3 corrections puis escalade** ; **56 falsifications a posteriori** détectées sans lire le rapport de l'agent (+ pannes, délais et sabotages d'isolation testés à part) |
| **Isolation des agents** | Processus séparé, permissions Node : lecture/écriture hors périmètre **refusées**, processus enfant **refusé**, environnement **vide** (aucun jeton), délai **tué**, sortie démesurée **coupée** |
| **Cloisonnement** | 3 espaces : base, journal, sorties, sauvegardes, jeton, jeton administrateur, clé de sauvegarde et port **distincts**. Un jeton d'un espace n'ouvre rien dans un autre ; l'espace perso **ne peut pas lire** les fichiers d'ODICOLOR ; la configuration est **refusée** si deux espaces partagent quoi que ce soit |
| **Données réelles / intégrations** | **Désactivées** : refus + journal sans autorisation ; l'autorisation exige l'administrateur, est limitée, révocable, expirable. EBP/Gmail/Airtable : **non développés**, échec explicite même autorisés |
| **Règles métier** | TVA selon territoire **et** opération ; remise (plafond + justification) ; marge minimale ; ancienneté des tarifs. **Aucune valeur présumée** : règle absente ou non validée ⇒ blocage + question (`08_REGLES_METIER.md`) |
| **Humain dans la boucle** | Aucun envoi sans ton clic ; réaudit juste avant ; l'envoi reste **simulé** ; JARVIS **ne peut s'octroyer aucun droit** (testé, y compris par demande textuelle) |
| **Concurrence** | 4 processus, 24 missions des 8 agents (en direct **et** agents isolés) : chacune exécutée **une seule fois**, journal intact |
| **Pannes** | Crash puis redémarrage, 4 reprises max, délai, panne d'agent, budget, arrêt d'urgence (API et fichier), `kill -9` du vrai service : l'arrêt d'urgence **survit**, le travail reprend, le journal reste intact |
| **Supervision** | Détecte : service silencieux, journal altéré, résultat modifié en base, validation sans trace, missions en échec, budget, sauvegarde ancienne |
| **Sauvegarde** | Chiffrée, **restaurée pour de vrai** et reprise du travail après restauration (approbation possible) |
| **IA hybride** | Point d'extension **avec garde-fous** (proposition seule, budget, minimisation, repli sans modèle). Aucun fournisseur réel branché |
| **Interface Samsung** | Prochaine action, validations, en cours, résultats, anomalies, **détail d'une décision**, arrêt d'urgence toujours visible. Vérifiée par capture 360×780 : aucune erreur console, pas de débordement |

## 2. Mesuré (Linux, 4 cœurs, données fictives)

- **Latence** : 5 ms/mission en direct, **79 ms/mission avec agent isolé** (12,6 missions/s).
- **Mémoire** : service ≈ 70 Mo ; agent isolé ≈ 47 Mo de pic. **Trois services + un agent à la fois < 0,5 Go.**
- Sous Windows, le lancement de processus est généralement plus lent : **non mesuré**.

## 3. Simulé (à ne pas confondre avec du réel)

Envoi de mails/relances/commandes · toutes les données · règles « démonstration » · fournisseurs d'IA · « fichiers du cockpit ».

## 4. Pas fait, et pourquoi

| Reste | Raison |
|---|---|
| Essais sur **Windows réel** et **Samsung réel** | Aucun des deux n'est accessible depuis cette session |
| **Données réelles, import EBP, Gmail, Airtable** | Exigent ton autorisation écrite et l'accord d'ODICOLOR ; format d'export EBP inconnu |
| **Langage libre** par un vrai modèle | Aucun fournisseur choisi ni budget ; l'interface et les garde-fous existent |
| **Règles métier validées** (TVA, remises, marges) | Décision humaine (expert-comptable, direction commerciale) |
| **Envoi réel** de mail | Volontairement non développé |
| **Filtrage réseau des agents** | Non assuré par Node 22 : à poser dans le pare-feu Windows (`05`), non testé |
| Notification push des alertes | Non développée (alertes visibles dans le tableau de bord et la sonde) |

## 5. Ce qui demande ton intervention

1. **Accord écrit d'ODICOLOR** avant toute donnée réelle.
2. **Valider les règles métier** (TVA par territoire/opération, plafond de remise, marge minimale, ancienneté des tarifs).
3. **Achat du matériel** — recommandation en `03`. Rien n'a été acheté.
4. **Essais Windows + Samsung** (je prépare le plan, tu exécutes ou tu me donnes l'accès).

## 6. Limites que je ne veux pas te cacher

1. **Les agents sont déterministes** : ils appliquent des règles ; ils ne « comprennent » pas le langage libre. L'intelligence viendra d'un modèle branché, **toujours contrôlé** par l'auditeur.
2. **L'auditeur est indépendant du code des agents, pas des données.** Il vérifie la cohérence avec les sources ; si la source est fausse (ex. mauvais tarif saisi), il ne le voit pas. Le rapprochement avec EBP viendra avec l'import réel.
3. **L'isolation est celle d'un processus**, pas d'une machine virtuelle : le modèle de permissions de Node n'est pas une frontière de sécurité absolue (son statut de stabilité est à revérifier dans la documentation Node) et ne filtre pas le réseau.
4. **« 24/7 » reste un objectif, pas une promesse** : reprise automatique et alertes, pas 100 % de disponibilité.
5. **Aucun utilisateur métier n'a validé** ces agents ; les critères de réussite sont les miens, à confirmer avec toi.
