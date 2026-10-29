# Validation Samsung — téléphone seul, PR #2

**Prévisualisation Cloudflare Pages Free autorisée par l’utilisateur le 28 octobre 2026. Aucune prévisualisation publiée : accès au compte Cloudflare encore manquant. Aucune autorisation de fusion ni de déploiement de production.**

Ce parcours remplace le parcours PC/USB pour l’utilisateur. Il ne nécessite ni PC, ni câble, ni ADB, ni terminal. L’ancien banc technique reste disponible pour les essais avancés dans [VALIDATION_SAMSUNG_BANC_TECHNIQUE.md](VALIDATION_SAMSUNG_BANC_TECHNIQUE.md) ; il n’est pas un prérequis au petit parcours Samsung.

## Hébergement proposé et coûts

**Cloudflare Pages Free**, fichiers statiques uniquement : un portail-guide, un espace A et un espace B, sur **trois noms d’hôtes HTTPS distincts** `odicolor-test-<session>-guide.pages.dev`, `odicolor-test-<session>-a.pages.dev`, `odicolor-test-<session>-b.pages.dev`. Ces noms sont des exemples non réservés, pas des liens actifs. L’utilisateur recevra un seul lien d’entrée vers le guide, avec les boutons A/B et les téléchargements synthétiques.

Budget prévu : **0 € d’hébergement**, HTTPS et sous-domaines `pages.dev` inclus, aucun domaine à acheter, ni fonction serveur, ni stockage payant. Le trafic mobile éventuel dépend du forfait du téléphone. Les conditions Free et leur disponibilité devront être reconfirmées avant publication ; aucune offre payante ne sera activée sans nouvel accord. Sources consultées le 28 octobre 2026 : [Cloudflare Pages](https://www.cloudflare.com/products/pages/), [limites Pages](https://developers.cloudflare.com/pages/platform/limits/). Free : 500 constructions/mois, 20 000 fichiers/site, **25 Mio maximum par fichier**. Le petit jeu de 34 117 octets convient ; le fichier terrain de 110,5 Mo **ne peut pas être servi tel quel par Pages**. Il n’est pas inclus dans cette proposition.

Un compte Cloudflare sous contrôle de l’utilisateur et un accès de publication autorisé restent nécessaires. Aucun compte ni identifiant Cloudflare n’est actuellement connecté à cette session ; ne pas promettre une publication immédiate. La création/connexion éventuelle du compte pourra se faire depuis le navigateur Samsung, sans terminal. Ne jamais demander de secret dans la conversation.

La méthode prévue est un **envoi manuel de dossiers statiques figés**, après accord, sans intégration Git automatique : aucun push sur la PR ou sur `main` ne doit publier un site. Aucun changement de configuration du site actuellement publié. Ne pas utiliser les Pages du dépôt de production. Les noms exacts et l’origine réellement utilisée en production seront vérifiés avant la création des projets. Une restriction temporaire sur les nouveaux comptes Cloudflare peut retarder la création de plusieurs projets pendant leurs 48 premières heures.

Les trois ZIP sont préparés et conservés sept jours dans les artefacts de la CI GitHub, après réussite des tests, sans secret Cloudflare ni publication de site. Le [parcours de mise en ligne depuis Samsung](MISE_EN_LIGNE_SAMSUNG.md) explique leur envoi au tableau de bord Cloudflare si aucun accès de publication n’est connecté à l’assistant. Les adresses du guide devront être vérifiées avant son envoi.

Le portail et les jeux seront accessibles publiquement à toute personne connaissant les liens. `noindex` décourage l’indexation mais ne constitue pas un mot de passe. Cette proposition porte uniquement sur du code déjà public et des données synthétiques ; elle ne comprend pas de contrôle d’accès privé. Cloudflare reçoit les requêtes HTTP habituelles, notamment l’IP. Aucune télémétrie ajoutée, aucun envoi des sauvegardes, aucun formulaire serveur, aucun compte client réel.

## Isolation des données

- A et B ont des **origines distinctes entre elles et de la production** : IndexedDB, caches et service workers distincts, même si le nom interne de base reste `devis-terrain`. Un autre chemin du site de production serait insuffisant et est interdit.
- Le guide est sur une troisième origine sans service worker ni script. Cela évite que le worker applicatif ne transforme la navigation vers le guide en accueil de l’application.
- Ouvrir le guide et tous les essais dans Chrome du **Dossier sécurisé Samsung**, sans synchronisation commerciale. Si ce profil persistant n’est pas disponible, le signaler pour adapter l’isolation ; ne pas remplacer par la navigation privée et ne pas vider Chrome commercial. Les origines distinctes assurent déjà la séparation des stockages web ; le Dossier sécurisé renforce la séparation des fichiers téléchargés et du parcours utilisateur.
- Le site de test ne peut pas lire le stockage web d’une autre origine. Le sélecteur de fichiers ne transmet que les fichiers choisis explicitement : ne choisir que ceux du guide et les exports de ce test. Aucun accès global aux fichiers du téléphone. Aucun accès aux contacts, caméra ou localisation nécessaire pour ce parcours.
- Ne jamais ouvrir la production pour ce test, ni y importer le jeu. Ne jamais réutiliser une sauvegarde commerciale. Aucun effacement du navigateur ou des données réelles.

## Parcours simple sur le téléphone

Après accord et publication contrôlée, fournir le lien du guide, les deux adresses A/B et l’identifiant de construction. Les liens définitifs devront figurer dans le message de livraison ; les exemples ci-dessus ne sont pas utilisables.

1. Ouvrir le guide dans Chrome du Dossier sécurisé. Télécharger `jeu-smoke.odicolor` ; attendre la fin du téléchargement.
2. Toucher **Ouvrir A — essais**. Vérifier l’absence de garages. Si A contient déjà des données, arrêter et le signaler ; aucune suppression pour simuler une base vierge.
3. Dans l’application : **Plus → Réglages → Sauvegarde**. Sélectionner le petit jeu, toucher **Restaurer après contrôle**, confirmer et attendre le redémarrage.
4. Vérifier les données attendues ci-dessous, ouvrir les trois images et les deux PDF. Vérifier tarifs et historiques.
5. Toucher **Télécharger une sauvegarde complète**. Vérifier dans les téléchargements qu’un nouveau fichier `.odicolor` est présent, non vide ; noter son nom.
6. Depuis le guide, ouvrir **B — restauration vierge**. Vérifier l’état vide, puis restaurer **la sauvegarde exportée de A**, pas le jeu de départ. Fermer/rouvrir B et refaire les contrôles. Une autre origine simule la récupération sur nouvel appareil ; ce n’est pas un deuxième appareil physique.
7. Télécharger les fichiers corrompu et tronqué du guide. Essayer leur restauration sur B : refus attendu, données précédentes toujours présentes. Avec un fichier valide, annuler la confirmation : aucun remplacement attendu.
8. Ajouter sur A une note « NOTE TEST A » : elle ne doit pas apparaître sur B. Ajouter « NOTE TEST B » sur B puis restaurer l’export initial de A : la note B doit quitter l’état actif ; une copie de récupération doit être téléchargeable. Ne pas modifier les pièces avant les comparaisons de référence.
9. Pour le hors ligne : ouvrir A et B en ligne et laisser l’installation finir ; fermer tous leurs onglets et rouvrir une fois en ligne. Garder leurs liens en favoris. Activer mode avion, Wi-Fi désactivé, fermer/rouvrir chaque adresse. Vérifier fiches, tarifs, historiques, images, PDF. Créer une note synthétique sur B, télécharger une sauvegarde puis restaurer l’export initial, toujours hors ligne. Le guide et ses téléchargements ne sont pas mis en cache : les fichiers doivent déjà être téléchargés. En cas d’échec au démarrage, le consigner ; reconnecter et attendre une minute dans l’application, puis réessayer sans effacement.
10. Réactiver Internet. Transmettre modèle Samsung, Android, Chrome, date et résultats **réussi / échec / non testé** pour chaque étape, durée approximative et message exact en cas d’erreur. Captures exclusivement synthétiques. Aucun résultat automatique ni accès à distance au téléphone.

Le guide HTML reprend ce parcours avec boutons et fichiers téléchargeables. Les PDF/images séparés permettent, après les contrôles de référence, un import manuel depuis les fichiers téléchargés ; aucune photo réelle.

## Résultats attendus du petit jeu

| Élément | Attendu |
|---|---|
| Garages / devis / articles | 3 / 12 / 30, tous synthétiques |
| Images locales | 3 SVG numérotés, une par garage correspondant |
| PDF | 2 documents affichant « PDF SYNTHETIQUE » et leur numéro |
| Historiques | 20 visites, 10 notes, 5 besoins et 1 facture fictive par garage |
| Tarif `SYN-00001` | 10,00 € HT |
| Premier devis | HT 30,03 €, TVA 2,55 €, TTC 32,58 € |
| Fichier initial | 34 117 octets dans la génération vérifiée |

Les SVG vérifient la conservation et l’association des pièces, pas encore la prise de vue ni les JPEG/HEIC réels. La taille des exports change avec les dates/archives : une égalité de taille n’est pas une preuve d’intégrité. La CI vérifie les empreintes métier et des pièces ; le parcours téléphone seul fait des vérifications visibles, sans prétendre remplacer cette comparaison exhaustive.

## Préparation technique réalisée sans publication

`scripts/preparer-preview-samsung.cjs` prépare localement trois dossiers à partir de la construction vérifiée :

- `a/` et `b/` : mêmes ressources applicatives **octet pour octet**, aucune modification du design, du manifeste ou du code métier ; seules s’ajoutent les règles d’en-têtes/proxy de l’hébergeur et une page 404. Les deux HTML du manifeste sont servis par proxy interne 200, pour éviter les redirections de normalisation `.html` de Pages que le worker refuse. Ce comportement doit être confirmé sur l’hébergement réel avant de valider le hors ligne.
- `guide/` : page mobile sans script, boutons vers A/B, petit jeu complet, deux fichiers volontairement invalides, images/PDF séparés, manifeste attendu. Le guide ne touche à aucune base ni fichier local.
- Pas de SDK, de jeton, de commande réseau ou d’action de déploiement. Les destinations existantes sont refusées, ainsi que les URL hors projets `odicolor-test-*.pages.dev`, identiques ou contenant un chemin.

La commande de préparation est réservée au mainteneur ; **l’utilisateur n’a rien à exécuter**. Les dossiers restent locaux tant que l’accord n’est pas donné. Avant livraison, vérifier sur les adresses hébergées le HTTPS, l’absence de redirections/transformations des scripts, les empreintes/SRI, l’installation réelle du worker et les en-têtes. Désactiver les injections d’analytics et transformations automatiques de code ; conserver les URL et octets des ressources versionnées. Les tests de paquet ne sont pas une preuve de fonctionnement de l’hébergement encore inexistant.

## Limites et validations complémentaires

Aucun test Samsung exécuté à ce stade. Les essais contrôlés de mise à jour entre versions, migration de l’ancienne PWA et retour V47 restent couverts par la CI et le banc technique, **pas par ce petit parcours**. Le retour V47 nécessiterait d’autres origines vierges et un kit spécifique ; ne pas héberger l’ancienne version sans accord complémentaire. Une restauration de l’archive précédente sur destination vierge nécessite également une nouvelle origine. Un espace B déjà utilisé n’est plus une base vierge pour un nouvel essai.

Le gros volume reste à organiser sur téléphone, avec une autre distribution que l’asset Pages unique limité à 25 Mio. Aucun coût R2, serveur ou offre payante n’est inclus ou autorisé. Le petit jeu ne certifie pas les performances commerciales à volume représentatif, ni le comportement matériel en manque de place. Ne pas saturer le téléphone pour forcer un échec.

Les sauvegardes de test restent en clair dans le profil isolé. Pas de copie hors appareil garantie avec ce seul téléphone. Supprimer ultérieurement les projets de prévisualisation n’efface pas les données déjà stockées hors ligne : toute suppression du profil de test doit viser uniquement ce profil et attendre la fin des essais. Aucune fusion, aucun déploiement de production, aucun changement de `main` sans validation utilisateur.
