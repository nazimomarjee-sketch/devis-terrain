# 04 — Rapport de sécurité (v2)

Statut : **testé** = test automatique ; **conçu** = prévu dans le code, non couvert par un test automatique ; **à faire** = absent. Périmètre : le prototype `jarvis/` sous Linux, données fictives.

## Mesures en place

| Menace | Mesure | Statut |
|---|---|---|
| Un mail/PDF/site donne des ordres | Seule la source authentifiée crée une mission (**échec fermé**) ; le reste est donnée | **testé** |
| Injection dans les **données** (notes de clients/prospects) | Détectée, **exclue** et signalée par l'agent ; recopiée ⇒ refus par l'auditeur | **testé** |
| Injection via la **sortie d'un modèle IA** | Sortie validée (agent actif, longueur, motifs d'injection et de secrets) ; proposition seule, jamais exécutée | **testé** |
| JARVIS s'octroie des droits | L'orchestrateur n'importe aucune fonction d'octroi ; octroi/règles réservés au **jeton administrateur** ; demandes textuelles inopérantes | **testé** |
| Agent hors périmètre | Processus restreint : lecture/écriture hors périmètre, processus enfant **refusés** ; environnement **vide** ; délai tué ; sortie bornée | **testé** (Linux) |
| Agent lit d'autres données | Ne reçoit **que** ses jeux déclarés | **testé** |
| Un espace lit un autre | Dossiers, bases, jetons, clés, ports distincts ; configuration **refusée** si partage ; agents de l'espace perso **refusés** sur les fichiers d'ODICOLOR | **testé** |
| Données réelles utilisées sans accord | Jeu `REEL` ⇒ autorisation requise ; refus + journal ; expiration, révocation | **testé** |
| Intégrations externes | Désactivées ; refus journalisé ; **non développées** même autorisées | **testé** |
| Règle métier présumée | Règle absente/non validée ⇒ blocage + question | **testé** |
| Prix fictif pris pour réel | Mention sur PDF, bandeau, vérifié par l'auditeur dans les deux sens | **testé** |
| Falsification après audit | Empreintes revérifiées + **réaudit** à l'approbation ; supervision détecte un résultat modifié | **testé** |
| Altération du journal | Chaînage SHA-256 ; alerte critique | **testé** |
| Données personnelles dans les journaux | Masquage e-mails, téléphones, IBAN, jetons ; aucun e-mail client dans les journaux de 5 types de missions | **testé** |
| Accès non autorisé à l'API | 2 jetons ≥ 24 car. distincts, comparaison à temps constant, verrouillage après 5 échecs, moindre privilège entre rôles | **testé** |
| DNS rebinding, traversée de chemin, corps géant | Contrôle `Host`, chemins confinés, 16 Ko max | **testé** |
| XSS | Aucun `innerHTML`, CSP `default-src 'self'` | **conçu** |
| Dépenses IA | Budget journalier, blocage avant travail, appels IA ignorés si budget atteint | **testé** |
| Boucles / missions empoisonnées | 3 corrections, 3 reprises, délai | **testé** |
| Perte de contrôle | Arrêt d'urgence API **et** fichier `ARRET`, persistant après `kill -9` | **testé** |
| Sauvegarde inutilisable | Chiffrée AES-256-GCM, restaurée et contrôlée, reprise du travail après restauration | **testé** |
| Secrets dans le code | Analyse automatique (sources, données, docs) | **testé** |
| Exposition internet | Écoute locale par défaut ; accès distant via VPN privé, aucun port ouvert | **conçu** |

## Limites et risques résiduels

1. **Le réseau n'est PAS filtré pour les agents** (le modèle de permissions de Node 22 ne le couvre pas — un test le **documente**). Remède prévu : copie dédiée de `node.exe` (`JARVIS_NODE_AGENT`, supportée et testée) + **règle sortante bloquante** du pare-feu Windows sur cette copie. **Non testé sous Windows.**
2. **L'isolation est celle d'un processus du même compte**, pas d'une machine virtuelle. Le modèle de permissions de Node n'est pas une frontière absolue ; son statut de stabilité est à revérifier. La séparation **entre espaces** repose en plus sur des **comptes Windows distincts + ACL NTFS** (à mettre en place et tester : W4, W5).
3. **L'auditeur n'est pas indépendant des données.** Il détecte les incohérences avec les sources, pas une source fausse. Le rapprochement avec EBP viendra avec l'import réel.
4. **Les agents ne sont pas des attaquants dans les tests** : on simule leurs erreurs, pas un code hostile élaboré.
5. **Jeton dans le navigateur** (`localStorage`) : un téléphone volé non verrouillé = accès. Prévoir verrouillage + révocation de jeton (S11).
6. **Pas de limitation de débit des missions** (hors verrouillage d'authentification) : un jeton compromis pourrait inonder la file. Le budget et la taille limitent, sans l'empêcher.
7. **Secrets dans l'environnement du service** : lisibles par les administrateurs de la machine ; BitLocker + ACL à appliquer.
8. **Fichiers temporaires** de vérification de sauvegarde, en clair quelques instants.
9. **Clé de sauvegarde** : la perdre rend les sauvegardes illisibles (à ranger hors machine).
10. **`node:sqlite` expérimental, Windows non testé, aucun audit externe ni test d'intrusion.**

## RGPD et autorisations (avant toute donnée réelle)

*Je ne suis pas juriste : à faire valider.*
- **Accord écrit d'ODICOLOR** pour toute donnée (clients, prix, historiques) : dans JARVIS, il se matérialise par l'autorisation `donnees_reelles` **avec sa portée** (qui, quoi, jusqu'à quand), accordée par l'administrateur, **journalisée**, expirable, révocable.
- Noms et e-mails de contacts de garages = **données personnelles** : minimisation (les dossiers clients **n'exposent pas** les coordonnées ; les journaux les masquent), finalité, durée de conservation, effacement.
- **Fournisseurs IA** : conditions **actuelles** de l'API (conservation, entraînement, localisation) à lire avant tout branchement ; le modèle ne reçoit que le texte de ta demande, masqué.
- **Conservation proposée** (à valider) : journaux 12 mois, missions terminées 24 mois, sauvegardes 30 jours glissants.

## Actions réservées à l'humain

| Action | Statut |
|---|---|
| Envoi de devis, relances, commandes | **Appliqué** : approbation + réaudit ; envoi **simulé** |
| Écriture dans EBP | **Appliqué** : aucune intégration n'existe |
| Règles métier, autorisations | **Appliqué** : jeton administrateur seul |
| Paiements, achats, souscriptions | Aucune capacité n'existe |
| Suppression de données réelles, déploiement, fusion | Hors du code JARVIS (procédures `06`) |
