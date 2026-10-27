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

Les anciens JSON v1 sont lisibles. L’interface avertit qu’ils ne contiennent pas les photos/PDF/tarifs. Lors de leur restauration, les tarifs locaux restent actifs ; les anciennes métadonnées liées au portefeuille sont archivées puis remplacées, afin qu’une photo ou un signalement d’un autre garage ne soit pas réattribué. Les données omises restent dans l’archive récupérable, pas dans les nouvelles fiches.

L’échange PC reste un JSON v1, avec son contrat existant. Le bouton du parcours PC appelle un export dédié et l’indique comme fichier d’échange ; il ne prétend plus être la sauvegarde complète. Le bouton de sauvegarde de Réglages produit le nouveau fichier `.odicolor`.

Après restauration, la connexion est fermée et l’application redémarre. Les écritures du même écran sont suspendues pendant l’opération. Fermer les autres onglets avant restauration reste nécessaire : ce lot ne corrige pas encore tous les conflits d’édition entre onglets ni les écritures métier ordinaires qui attendent seulement le succès de requête. Ces travaux appartiennent au lot 2.

## Validation et limites

Commandes sans réseau, sur données synthétiques :

```sh
node tests/backup-lot1.test.cjs
node tests/backup-v47.test.cjs
node tests/identite-v47.test.cjs
node tests/pwa-v47.test.cjs
```

69 cas : 54 sur le nouveau contrat/codec/restauration/erreurs, 6 sur l’intégration des fonctions de l’application, 4 de non-fusion des garages et 5 sur les ressources PWA. Les anciens tests de conservation des photos par homonymie ont été remplacés par la conservation de l’état complet dans l’archive et le remplacement des photos avec le portefeuille : le garde-fou ancien hors transaction n’est plus le mécanisme de sécurité.

Les tests locaux de transaction utilisent un simulateur et ne constituent pas une preuve IndexedDB réel. Le contrôle `tests/backup-browser.cjs` utilise Chromium/IndexedDB réel : migration depuis v1, récupération sur base vierge avec Blob/PDF, abort asynchrone après écritures, ancien JSON avec changement d’identité, chargement de tous les modules et téléchargement via Réglages sur largeur 412 px. La CI de PR est configurée pour installer Playwright 1.56.1 comme dépendance de test et exécuter ces cinq scénarios. Les sockets sont interdits dans l’environnement local (`listen EPERM`). Le résultat du contrôle Chromium est à relever dans la CI de la PR ; il est distinct des tests locaux.

Restent avant approbation de mise en production : essai sur Samsung réel avec pièces et volume représentatifs, comparaison visuelle Premium Pro, interruption du processus/quota réel, règles de conservation/chiffrement des exports et contrôle de récupération hors téléphone.

**Précaution de revue :** tester sur une origine ou un profil isolé, avec des données synthétiques. L’ancien code V47 ouvre explicitement le schéma 1 et ne peut pas rouvrir directement une base passée au schéma 2. Un retour au code publié demande donc une procédure de compatibilité validée ; ne pas tester cette migration sur le profil commercial réel avant approbation.

Les corrections PWA de cohérence de versions, conflits de fiches, historique des KPI, bibliothèque Excel et suppressions historiques automatiques restent celles des lots suivants. L’audit original et ses 16 sondes décrivent le SHA V47 figé ; ces sondes de défaut ne sont pas les tests de non-régression de la branche corrigée.
