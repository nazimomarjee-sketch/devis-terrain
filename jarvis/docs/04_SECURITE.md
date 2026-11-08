# 04 — Rapport de sécurité

Périmètre : le prototype `jarvis/` (données fictives). Statut : **testé** = couvert par un test automatique de `tests/` ; **conçu** = prévu dans le code mais non testé automatiquement ; **à faire** = absent.

## Ce qui est en place

| Menace | Mesure | Statut |
|---|---|---|
| Un mail, PDF ou site donne des ordres à un agent (injection de prompt) | Seule la source `canal_utilisateur` peut créer une mission ; **échec fermé** (source absente = refusée). Les contenus externes sont des données. Détection d'ordres suspects dans toutes les sorties | **testé** |
| Note client piégée recopiée dans un mail | Jamais recopiée ; l'auditeur bloque si elle l'est | **testé** |
| Un agent invente un client, un prix, une ligne | Rapprochement avec la base, recalcul indépendant, couverture de la demande | **testé** (8 falsifications) |
| Un devis présenté comme enregistré dans EBP | Champ `ebp_enregistre=false` contrôlé, mention sur PDF et mail | **testé** |
| Envoi involontaire | Envoi **simulé** dans le prototype ; porte humaine obligatoire ; réaudit juste avant l'approbation | **testé** |
| Falsification après audit (base ou fichier) | Empreinte du résultat et des fichiers revérifiée à l'approbation | **testé** |
| Altération du journal | Chaînage SHA-256, vérification et alerte critique | **testé** |
| Fuite de données personnelles dans les journaux | Masquage e-mails, téléphones, IBAN, jetons | **testé** |
| Accès non autorisé à l'API | Jeton ≥ 24 caractères, comparaison à temps constant, verrouillage après 5 échecs | **testé** |
| DNS rebinding / page malveillante | Contrôle de l'en-tête `Host` ; pas de CORS ; jeton en en-tête (pas de cookie → pas de CSRF) | **testé** (Host) |
| Traversée de chemin, corps géant | Chemins résolus et confinés ; corps limité à 16 Ko | **testé** |
| XSS dans le tableau de bord | Aucun `innerHTML` : tout passe par `textContent` ; CSP `default-src 'self'` | **conçu** (CSP vérifiée, pas de scanner XSS) |
| Perte / vol du disque | Sauvegardes chiffrées AES-256-GCM ; BitLocker à activer sur la machine | sauvegarde **testée** ; BitLocker **à faire** |
| Sauvegarde inutilisable | Chaque sauvegarde est **restaurée et contrôlée** avant d'être déclarée valide | **testé** |
| Dépenses IA incontrôlées | Budget journalier, blocage avant exécution | **testé** |
| Boucle infinie / mission empoisonnée | 3 corrections max, 3 reprises max, délai par tâche | **testé** |
| Agent hors de contrôle | Arrêt d'urgence API **et** fichier `ARRET` | **testé** |
| Secrets dans le code | Aucune clé ; analyse automatique des sources | **testé** |
| Exposition internet | Écoute sur 127.0.0.1 par défaut ; accès distant via VPN privé, **aucun port ouvert** | **conçu** |

## Limites et risques résiduels (sans fard)

1. **HTTP sans TLS en local.** Pour l'accès Samsung, il faut un tunnel chiffré (Tailscale `serve`, voir `05`) : **non testé** ici.
2. **Jeton dans le navigateur.** Stocké en `localStorage` : lisible par un script de la même origine (aucun n'existe, mais ce n'est pas du « zéro risque »). Un téléphone volé non verrouillé = accès. Prévoir verrouillage écran + révocation du jeton.
3. **Un seul jeton, un seul utilisateur.** Pas de rôles ni de droits par agent : **la séparation des droits entre agents est un principe d'architecture, pas encore un mécanisme appliqué** (un seul agent existe).
4. **Pas de séparation production / développement / test sur disque.** Le prototype ne manipule que du fictif. À mettre en place avant la phase réelle (trois dossiers et trois jetons).
5. **Fichiers temporaires** : pendant la vérification d'une sauvegarde, une copie **en clair** existe quelques instants sur le disque (supprimée ensuite). BitLocker couvre ce cas ; la suppression n'est pas « sécurisée » au sens forensique.
6. **Clé de sauvegarde** : si tu la perds, les sauvegardes sont illisibles. À stocker **hors** de la machine (gestionnaire de mots de passe).
7. **`node:sqlite` expérimental** et **Windows non testé** : risque de comportement différent.
8. **Aucune analyse de vulnérabilité externe** (pas de test d'intrusion, pas d'audit de dépendances : il n'y en a pas, c'est un avantage).
9. **Modèles IA** : non branchés. Le jour où ils le seront, chaque appel envoie des données à un tiers (voir RGPD).

## RGPD et autorisations (avant toute donnée réelle)

*Je ne suis pas juriste : à faire valider.*
- **Autorisation écrite d'ODICOLOR** pour tout usage de ses données (clients, prix, historiques) par JARVIS, par une API IA, et pour l'hébergement sur ta machine.
- Les noms et e-mails de contacts de garages sont des **données personnelles**, même en B2B : finalité, minimisation, durée de conservation, droit à l'effacement.
- **Fournisseurs IA** : lire les conditions **actuelles** (conservation, usage pour l'entraînement, localisation) pour l'**API** — je ne les ai pas relues aujourd'hui. Envoyer le strict nécessaire (références, quantités), jamais le fichier client entier.
- **Politique de conservation proposée** (à valider) : journaux 12 mois, missions terminées 24 mois, sauvegardes 30 jours glissants, suppression sur demande.

## Actions réservées à l'humain (appliquées dans le code ou à appliquer)

| Action | Statut |
|---|---|
| Envoi définitif de devis et mails | **Appliqué** : porte humaine + envoi simulé |
| Écriture dans EBP | **Appliqué** : aucune intégration existe |
| Modification de tarifs, droits, paramètres de sécurité | À protéger par un second jeton (**à faire**) |
| Paiements, achats, souscriptions | Aucun mécanisme : aucune capacité de paiement n'existe |
| Suppression de données réelles, déploiement, fusion | Hors du code JARVIS : procédures à écrire (`06`) |
