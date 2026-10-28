# Lot 1 — récupération des données ODICOLOR V47

Branche de préparation : `fix/lot1-f01-f03-recuperation`. Aucun déploiement, aucune nouvelle version commerciale, aucune modification CSS ou des couleurs Premium Pro. EBP reste la référence pour les devis officiels ; aucun enrichissement du moteur de devis n’est ajouté.

## Changement proposé

- **Sauvegarde complète `.odicolor`**, format interne 2 : les quatre magasins métier et les archives de récupération, y compris articles/prix, clients, notes, visites, devis existants, tous les champs meta connus ou inconnus, photos, PDF, plans/archives PC et contexte de l’assistant.
- Les pièces sont conservées comme données binaires, sans expansion base64. Manifeste typé et empreintes SHA-256 de l’en-tête et de chaque pièce. Ces empreintes détectent les corruptions ; elles ne sont ni un chiffrement ni une authentification de l’auteur.
- Une lecture dans une seule transaction donne un état cohérent à exporter. Limites identiques à l’export et à la lecture : fichier 1 Go, manifeste 64 Mo, pièce 128 Mo. Les PDF actuellement importables de 60 Mo sont couverts. Tout dépassement ou type non pris en charge refuse l’export explicitement, sans fichier partiel.
- Validation avant toute transaction d’écriture : version, magasins, identifiants uniques, références client, lignes et bornes monétaires, dates civiles réelles, réglages, structures des historiques, métadonnées et relations photos/PDF/tournées. Les champs inconnus des objets et les entrées anciennes ne sont pas filtrés.
- La restauration lit l’état précédent, le copie dans une archive et remplace ensemble articles, clients, devis et meta **dans une seule transaction**. Le succès n’est annoncé qu’après `oncomplete`. Si une lecture/écriture/contrainte/commit échoue, le remplacement et la nouvelle archive sont annulés ensemble.
- Le stockage interne passe de 1 à 2 uniquement pour ajouter `recuperations`. La migration vérifie la présence de chaque magasin ; aucun ancien magasin n’est supprimé ou recréé.
- Aucune archive n’est supprimée automatiquement. Les archives locales existantes sont conservées ; les archives importées ayant le même ID reçoivent un nouvel ID avec leur provenance.
- Les archives peuvent être téléchargées depuis Réglages. Un état antérieur déjà incohérent reste exportable comme copie brute pour réparation, mais ne peut pas être restauré silencieusement.
- L’ancienne action globale d’effacement devient **« Effacer les données actives »** : même transaction et copie de récupération préalable. Ce n’est pas un effacement sécurisé du téléphone ; les copies restent locales et nécessitent une politique de conservation ultérieure.

## Compatibilité

Les anciens JSON v1 sont lisibles. L’interface avertit qu’ils ne contiennent pas les photos/PDF/tarifs. Leur restauration laisse donc le catalogue actif vide et demande de réimporter les tarifs EBP. Les tarifs et métadonnées du portefeuille précédent sont archivés puis remplacés : aucun ancien tarif, photo ou signalement ne reste mélangé au nouveau portefeuille. Les données omises restent dans l’archive récupérable, pas dans les nouvelles fiches. Un ancien fichier seul ne peut pas reconstruire les pièces et tarifs qu’il n’a jamais contenus.

L’échange PC reste un JSON v1, avec son contrat existant. Le bouton du parcours PC appelle un export dédié et l’indique comme fichier d’échange ; il ne prétend plus être la sauvegarde complète. Le bouton de sauvegarde de Réglages produit le nouveau fichier `.odicolor`.

Après restauration, la connexion est fermée et l’application redémarre. Les écritures du même écran sont suspendues pendant l’opération. Chaque connexion de l’application tient un verrou partagé Web Locks ; la restauration attend le verrou exclusif. Un message BroadcastChannel ferme la connexion des autres onglets, bloque leurs écritures et demande un rechargement. Sans BroadcastChannel, les autres onglets doivent être fermés manuellement pour libérer le verrou. Sans Web Locks, la restauration est refusée explicitement sans modifier les données ; utiliser Chrome récent sur HTTPS. Ce mécanisme empêche un ancien formulaire de réécrire un autre portefeuille après restauration. Les conflits d’édition ordinaires entre onglets et les écritures métier qui attendent seulement le succès de requête restent ceux du lot 2.

## Validation et limites

Commandes sans réseau, sur données synthétiques :

```sh
node tests/backup-lot1.test.cjs
node tests/backup-v47.test.cjs
node tests/identite-v47.test.cjs
node tests/pwa-v47.test.cjs
```

79 cas Node : 60 sur le contrat/codec/restauration/erreurs, les copies de retour et les outils synthétiques ; 6 sur l’intégration des fonctions de l’application ; 4 de non-fusion des garages ; 9 sur la construction et les ressources PWA. Les anciens tests de conservation des photos par homonymie ont été remplacés par la conservation de l’état complet dans l’archive et le remplacement des photos avec le portefeuille : le garde-fou ancien hors transaction n’est plus le mécanisme de sécurité.

Les tests locaux de transaction utilisent un simulateur et ne constituent pas une preuve IndexedDB réel. La CI de PR installe Playwright 1.56.1 et exécute 15 scénarios Chromium : neuf de récupération/migration/retour V47 dans `tests/backup-browser.cjs` et six de mises à jour, installation interrompue, intégrité et hors ligne dans `tests/pwa-browser.cjs`. Les sockets sont interdits dans l’environnement local (`listen EPERM`) ; la preuve navigateur est donc le résultat de CI, distinct des tests locaux.

Restent avant approbation de mise en production : essai sur Samsung réel avec pièces et volume représentatifs, comparaison visuelle Premium Pro, interruption du processus/quota réel, règles de conservation/chiffrement des exports et contrôle de récupération hors téléphone.

**Retour de secours :** l’ancien code V47 ne peut pas diminuer en place une base v2. La procédure [RETOUR_CODE_V47.md](RETOUR_CODE_V47.md) conserve la source et crée une copie v1 sur destination vierge avec le code V47 figé. Son ouverture réelle et la non-modification de la source sont testées dans Chromium. Ne pas exécuter ce retour sur le profil commercial avant validation.

**PWA :** la construction déterministe génère `index.html`, `pwa-client.js`, `sw.js`, `recuperation-v47.html` et `pwa-release.json` depuis les modèles `pwa/`. Chaque construction a un cache distinct par contenu ; chaque ressource est vérifiée SHA-256, les scripts/styles sont aussi protégés par l’intégrité navigateur. Aucune activation forcée ni suppression des anciens caches. Les fenêtres anciennes conservent leur ensemble jusqu’à fermeture ; une installation échouée est refusée, et le démarrage attend les ressources avant de migrer la base. Après modification d’un fichier applicatif ou d’un modèle, exécuter `node scripts/build-pwa.cjs` et commiter les artefacts ; la CI refuse une construction périmée. Le numéro commercial reste V47. Les caches conservés occupent de l’espace ; leur nettoyage éventuel devra respecter les fenêtres encore ouvertes et ne doit pas effacer les données métier.

Le [protocole Samsung](VALIDATION_SAMSUNG_LOT1.md) décrit le parcours téléphone seul proposé sur des origines HTTPS distinctes, le petit jeu synthétique, la récupération complète et le hors ligne. Le banc technique séparé conserve les essais avancés de volume et de retour V47. Il reste à exécuter sur appareil réel. Les conflits d’édition ordinaires, l’historique des KPI, la bibliothèque Excel et les suppressions historiques automatiques restent hors de ces compléments. L’audit original et ses 16 sondes décrivent le SHA V47 figé ; ces sondes de défaut ne sont pas les tests de non-régression de la branche corrigée.
