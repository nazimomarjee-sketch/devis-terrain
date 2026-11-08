# JARVIS — État réel du projet (lire en premier, 5 minutes)

Date : 8 novembre 2026. Tout ce qui suit est vérifiable : `cd jarvis && npm test` (46 tests, preuve dans `PREUVES_TESTS.txt`).

## La réponse courte

**Il existe un vrai prototype qui tourne, avec des données 100 % fictives.** Ce n'est pas encore « 8 agents qui travaillent 24/7 » : c'est le **socle** (moteur persistant, contrôle indépendant, sécurité, tableau de bord) plus **1 agent métier sur 8** (Devis). C'est volontaire : un socle solide d'abord, les autres agents ensuite.

## 1. Construit ET testé (preuve : 46 tests verts)

| Brique | Ce qui est prouvé |
|---|---|
| File de missions persistante (SQLite) | Survit à un crash et à un redémarrage du processus |
| Anti-doublon | 4 processus qui se disputent 30 missions : chaque mission prise **une seule fois** |
| Reprise après interruption | Ouvrier mort → mission reprise ; après 4 interruptions → échec + alerte (pas de boucle infinie) |
| Idempotence | Le même dépôt envoyé 2 fois (réseau instable) = 1 seule mission |
| Délai maximum par tâche | Agent trop lent interrompu, mission relancée |
| Arrêt d'urgence | Par API **ou** par fichier `ARRET` (marche même si la base ne répond plus) |
| Budget IA | Budget du jour dépassé → missions suivantes bloquées **avant** tout travail |
| Agent 02 — Devis | Client et références résolus sans deviner ; conditionnements ; tarifs manquants/anciens signalés ; remise et TVA ; PDF + brouillon mail réels |
| Calculs d'argent | En entiers (centimes), jamais par un modèle IA. Cas de référence calculé à la main : **317,95 € TTC**, identique au code |
| Agent 08 — Auditeur | Indépendant (n'importe aucun code d'agent) ; 11 contrôles déterministes ; recalcul BigInt vérifié sur 200 cas aléatoires ; **8 falsifications sur 8 détectées** |
| Boucle de correction | 7 types d'erreurs volontaires : chacune détectée, corrigée, puis validée ; si l'erreur persiste : **3 corrections puis escalade humaine** |
| Porte humaine | Aucun envoi sans ton clic ; approbation refusée si le résultat ou un fichier a été modifié après l'audit |
| Journal d'audit | Chaîné par hachage : toute modification a posteriori est détectée et signalée |
| Confidentialité des journaux | E-mails, téléphones, IBAN et jetons masqués |
| Sauvegarde | Chiffrée (AES-256-GCM), vérifiée par **restauration réelle** ; mauvaise clé et fichier altéré rejetés |
| API | Jeton obligatoire, verrouillage après 5 échecs, protection DNS-rebinding, taille limitée, pas de traversée de chemin |
| Tableau de bord Samsung | Rendu vérifié par capture (360×780), aucune erreur console, pas de débordement (`captures/`) |
| Métriques et alertes | Calculées sur l'état réel de la base |

## 2. Simulé (ne pas le confondre avec du réel)

- **L'envoi de mail est SIMULÉ.** Le prototype n'a aucun accès SMTP/Gmail : « Approuver » écrit une ligne « envoi simulé ».
- **Toutes les données sont fictives** (catalogue, clients, prix). Les adresses utilisent `.invalid`.
- **La mise en page du PDF est celle d'un prototype** (texte monospace), pas un devis commercial final.
- **Le serveur n'a été testé qu'en local** (127.0.0.1), pas depuis un vrai Samsung à travers un VPN.

## 3. Reste à développer

- Agents 01, 03, 04, 05, 06, 07 : **affichés « prévu »** dans le tableau de bord, aucun n'existe.
- **Langage libre** : le lecteur de demandes comprend `devis pour <client> : <quantité> <article>, …`. Brancher un modèle IA pour le texte libre est possible, mais **chaque sortie devra repasser par l'auditeur**.
- Intégrations EBP, Gmail, Airtable : **aucune supposée**, toutes à vérifier (voir `06_FEUILLE_DE_ROUTE.md`).
- Envoi réel de mail, dictée vocale, fournisseurs IA et routage de modèles, service Windows testé, PWA installable.

## 4. Ce qui demande TON intervention

1. **Autorisation écrite d'ODICOLOR** avant toute donnée réelle (voir point 2 ci-dessous : c'est le vrai verrou).
2. **Achat du matériel** : je recommande, tu décides (`03_MATERIEL_ET_COUTS.md`). Rien n'a été acheté.
3. **Valider les hypothèses métier** : TVA 8,5 %, remise max 60 %, tarif « ancien » après 90 jours.
4. **Dire quel agent construire ensuite.**

## 5. Ce que je conteste dans le mandat (franchement)

1. **Les données ne sont pas à toi.** `devis-terrain` contient des règles d'**ODICOLOR** (ton employeur, d'après `CLAUDE_AGENT01_INSTRUCTIONS.md`) qui dit : « les données d'entreprise ne doivent être partagées avec Claude qu'avec autorisation ODICOLOR ». Un JARVIS qui envoie des prix, clients ou montants à une API IA ou héberge ça sur ton PC personnel **sans accord** te met en faute, quelle que soit la qualité technique. À l'inverse, `cockpit-carrosserie` se déclare **projet indépendant** : JARVIS doit les cloisonner (espaces et droits séparés).
2. **« S'améliore par des corrections vérifiées » est limité aujourd'hui** : le système corrige **chaque mission** et mesure ses taux, il n'« apprend » pas encore de ses erreurs d'une mission à l'autre. Promettre l'inverse serait faux.
3. **8 agents d'un coup = risque de dispersion.** Un seul agent fiable vaut mieux que huit moyens. Ordre conseillé : Devis (fait) → Produits → Commercial → le reste.
4. **« 24/7 » ne se promet pas.** Un mini-PC Windows redémarre pour ses mises à jour, une coupure internet arrive. Ce qu'on peut garantir : **reprise automatique et alerte**, pas 100 % de disponibilité.
5. **Windows préféré ≠ Windows nécessaire.** Le cerveau en ligne n'exige pas de grosse machine ; voir le comparatif.
6. **Limite technique à connaître** : le prototype utilise le module SQLite intégré à Node 22 (`node:sqlite`), encore classé expérimental. Il est stable en pratique ici, mais à surveiller lors des mises à jour de Node.

## Où regarder

`01_AUDIT_EXISTANT` · `02_ARCHITECTURE` · `03_MATERIEL_ET_COUTS` · `04_SECURITE` · `05_INSTALLATION_WINDOWS` · `06_FEUILLE_DE_ROUTE` · `captures/` · `PREUVES_TESTS.txt` · `modele_cout.mjs`
