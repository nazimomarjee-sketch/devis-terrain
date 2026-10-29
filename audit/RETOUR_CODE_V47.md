# Retour de secours au code V47 après migration IndexedDB

État : procédure préparée et testée sur données synthétiques dans Chromium. Aucun retour de code, déploiement ni manipulation d’un téléphone réel n’a été exécuté.

## Principe

IndexedDB refuse une ouverture en version 1 lorsqu’une base existe en version 2 (`VersionError`). Il n’existe pas de diminution en place non destructive. Il ne faut donc ni supprimer la base, ni tenter de réinitialiser le navigateur, ni effacer ses données pour rendre l’ancien code utilisable.

Le retour utilise une **copie sur une origine ou un profil vierge**. La source v2, ses archives et son fichier complet sont conservés. Le code V47 est figé au commit `15358121354f9cf050d4f90e51a7b87272af78f9` ; le script du kit extrait ce commit exact, pas une branche `main` susceptible d’évoluer.

L’outil de copie crée le schéma 1 avec les quatre magasins historiques et un magasin supplémentaire d’archives. Le vrai code V47 ouvre alors sa version 1 habituelle ; il ignore le magasin supplémentaire sans le supprimer. Les pièces, champs et archives que l’ancien écran ne présente pas restent conservés et exportables par l’outil séparé.

## Préparer le kit, sans le publier

Sur le PC de test, dans le dépôt contenant le commit de référence :

```sh
node scripts/build-pwa.cjs --check
node scripts/preparer-retour-v47.cjs /tmp/odicolor-retour-v47
```

La destination doit être inexistante. Le script ne remplace aucun dossier existant et ne publie rien. Il utilise Git et `tar` (Linux, macOS ou WSL) ; si le commit manque dans le checkout, récupérer ce commit avant de préparer le kit. `kit-manifest.json` donne la référence et les empreintes des fichiers. Les fichiers de l’ancienne application, notamment `app.js`, `index.html` et `sw.js`, proviennent de l’archive Git et restent inchangés. Seuls l’outil `recuperation-v47.html`, son script et le codec de sauvegarde sont ajoutés.

## Procédure opératoire

1. Arrêter les saisies. Fermer les autres fenêtres ODICOLOR. Garder la source v2 sur son origine actuelle ; ne pas changer le code servi sur cette origine pour essayer d’y ouvrir la v1.
2. Depuis Réglages, télécharger le fichier `.odicolor` complet. Si l’application ne démarre plus, ouvrir **sur l’origine v2** `recuperation-v47.html`, puis « Télécharger la sauvegarde complète de cette origine ». Cet outil ne charge pas `app.js`, n’augmente pas le schéma, n’écrit pas dans la source et ne crée pas de base si aucune n’existe.
3. Copier ce fichier hors du téléphone et contrôler qu’il est complet. Pour les données synthétiques, utiliser `scripts/verifier-sauvegarde.cjs` et le manifeste attendu. Ne pas substituer un ancien JSON v1 : il ne contient pas toutes les pièces ni tous les tarifs.
4. Préparer une **autre origine vierge** avec le kit figé, ou un profil réellement distinct. Pour la validation Samsung, utiliser le port local 8142 décrit dans le protocole. Aucun hébergement externe n’est créé par les scripts ; une publication réelle reste soumise à validation.
5. Ouvrir d’abord `recuperation-v47.html` sur cette destination, avant d’ouvrir l’application V47. Sélectionner le fichier complet, confirmer le caractère isolé de la destination puis créer la copie.
6. L’outil vérifie le format, l’intégrité et le métier, puis exige une destination vide dans la transaction d’écriture elle-même. Une base v2 est refusée ; une base contenant déjà des données est refusée. Une erreur annule la copie. Aucune base n’est supprimée. Un premier essai ayant échoué peut être répété si la base de destination est restée entièrement vide avec le schéma compatible.
7. Après confirmation de création au schéma 1, fermer l’outil et ouvrir l’application V47 figée **sur cette même destination**. Contrôler tarifs, fiches, devis, notes, historiques, photos et PDF. Vérifier le schéma et les empreintes avec le protocole, pas seulement la présence d’un écran.
8. Réexporter par `recuperation-v47.html` de la destination et comparer le contenu métier avec le fichier source. Les dates de sauvegarde et le nombre d’archives peuvent différer ; les données métier et les octets des pièces doivent correspondre.
9. Vérifier que la base de l’origine source est toujours en v2 et que son empreinte métier n’a pas changé. La garder comme point de récupération tant que le retour n’a pas été validé.

Si une correction est saisie ensuite dans la copie V47, l’outil séparé peut aussi lire cette base v1 et produire un fichier complet de format 2. Pour revenir au code corrigé, restaurer ce fichier sur une nouvelle destination de validation et comparer les données, sans toucher à la source initiale. Les schémas de base (1/2) et la version du fichier de sauvegarde (2) sont deux notions différentes.

## Limites et critères d’arrêt

- Ne pas poursuivre si la source ne peut pas être exportée et vérifiée, si la destination n’est pas isolée, si une pièce manque ou si le schéma est inconnu.
- La procédure conserve les données ; elle ne corrige pas les bugs métier, de sécurité ou de conservation de l’ancienne V47. Ce retour est un secours, pas une nouvelle qualification commerciale de cette version.
- L’ancienne application continue d’ignorer certaines archives dans ses écrans et son ancien JSON reste incomplet. Utiliser l’outil de récupération pour un export complet.
- Une réinitialisation manuelle du navigateur, une perte matérielle ou un export non conservé hors appareil ne sont pas réparés par un changement de code.
- Le retour réel du site ou de la PWA ne doit être publié qu’après validation. La procédure de test ne requiert aucune modification de `main` ni aucun déploiement.

## Preuves automatisées

`tests/backup-browser.cjs` vérifie : migration v1→v2 sans recréer les anciens magasins ; abort de migration conservant v1 ; refus d’une copie vers v2 existante ; export de la source v2 par l’outil autonome ; import vers une origine vierge au schéma 1 ; ouverture du **vrai `app.js` V47 figé** avec lecture de ses fiches, tarifs et pièces ; conservation de la base v2 source. Les tests Node vérifient également le refus transactionnel d’une destination remplie et l’annulation des écritures.
