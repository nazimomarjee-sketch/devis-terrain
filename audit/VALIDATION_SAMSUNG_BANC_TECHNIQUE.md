# Validation Samsung — lot 1, récupération et PWA

**Statut : protocole préparé, à exécuter sur appareil réel.** Les résultats Chromium de CI ne valent pas validation Samsung. Aucune fusion ou publication ne doit découler automatiquement de ce document.

## 1. Isolation obligatoire

- Utiliser une instance Chrome dans le **Dossier sécurisé Samsung** ou un profil Android de test réellement distinct, sans compte synchronisé ni données commerciales. Si cette isolation n’est pas disponible, choisir un appareil/profil de test adapté avant de commencer. La navigation privée ne remplace pas ce profil persistant.
- Les origines de test doivent être distinctes du site utilisé commercialement. Un autre chemin sur le même domaine ne suffit pas : IndexedDB dépend de l’origine, qui inclut le port.
- N’importer que les fichiers produits par le générateur ci-dessous. N’utiliser ni export EBP réel, ni sauvegarde client, ni photo réelle, ni document fournisseur. Tous les noms et images doivent porter « SYNTHETIQUE » ; les téléphones sont vides.
- Ne pas effacer les données du navigateur, supprimer une base ou vider le profil commercial pour préparer les essais. Créer de nouvelles origines/profils vierges. Ne pas forcer l’activation du service worker depuis DevTools.

## 2. Préparation locale, sans déploiement

Un accompagnant technique peut servir des dossiers statiques sur le PC, uniquement sur sa boucle locale, puis utiliser la redirection USB ADB. `http://localhost` est un contexte de confiance pour Chrome ; l’outil et les données restent locaux. Cela ne publie aucun site.

Dans le dépôt de la PR #2 au commit à valider, sur un PC avec Node 22+, Git, `tar`, Python et ADB :

```sh
node scripts/build-pwa.cjs --check
node scripts/preparer-validation.cjs /tmp/odicolor-candidat
node scripts/preparer-retour-v47.cjs /tmp/odicolor-retour-v47
node scripts/generer-jeu-synthetique.cjs smoke /tmp/odicolor-jeu-smoke
node scripts/generer-jeu-synthetique.cjs terrain /tmp/odicolor-jeu-terrain
node scripts/verifier-sauvegarde.cjs /tmp/odicolor-jeu-smoke/jeu-smoke.odicolor /tmp/odicolor-jeu-smoke/attendus-smoke.json
```

Les dossiers de préparation doivent être inexistants ; les fichiers synthétiques existants ne sont pas écrasés. Copier les jeux et leurs manifestes dans un dossier de test explicite du téléphone. Les images SVG et PDF séparés générés servent aux essais d’import manuel, sans utiliser l’appareil photo.

Lancer chaque serveur dans un terminal distinct, en le laissant ouvert :

```sh
python -m http.server 8140 --bind 127.0.0.1 --directory /tmp/odicolor-candidat
python -m http.server 8141 --bind 127.0.0.1 --directory /tmp/odicolor-candidat
python -m http.server 8142 --bind 127.0.0.1 --directory /tmp/odicolor-retour-v47
python -m http.server 8143 --bind 127.0.0.1 --directory /tmp/odicolor-candidat
```

Relier le Samsung au PC de test puis établir les redirections :

```sh
adb reverse tcp:8140 tcp:8140
adb reverse tcp:8141 tcp:8141
adb reverse tcp:8142 tcp:8142
adb reverse tcp:8143 tcp:8143
```

| Origine dans le Chrome isolé | Rôle |
|---|---|
| `http://localhost:8140` | A : candidat et source de sauvegarde |
| `http://localhost:8141` | B : restauration vierge du candidat |
| `http://localhost:8142` | C : copie de secours avec vrai code V47 figé |
| `http://localhost:8143` | D : retour ultérieur vers le candidat, origine supplémentaire vierge |

Les ports correspondent à des bases et registrations distinctes. Les éventuelles instances sur d’autres ports ou profils restent hors essai. Pour une répétition complète, utiliser de nouveaux ports/profils ; ne pas supprimer des bases pour les rendre « vierges ».

## 3. Jeux et résultats attendus

| Mesure | Petit jeu `smoke` | Jeu `terrain` |
|---|---:|---:|
| Garages | 3 | 2 000 |
| Devis synthétiques | 12 | 10 000 |
| Articles/tarifs | 30 | 20 000 |
| Images locales | 3 | 200 |
| PDF synthétiques | 2 | 6 |
| Visites historiques | 60 | 40 000 |
| Notes | 30 | 20 000 |
| Besoins produits | 15 | 10 000 |
| Factures déclaratives fictives | 3 | 2 000 |

Le jeu terrain occupe environ **110,5 Mo de fichier** (105,4 Mio) dans la génération vérifiée. Les images ont environ 300 Kio chacune et les PDF environ 5 Mio. Les SVG et PDF contiennent du remplissage synthétique pour solliciter le stockage ; ce ne sont pas des photographies ou catalogues réels. Consigner la taille exacte du manifeste généré.

Le montant total HT du jeu est une somme technique des devis synthétiques, sans signification commerciale. Le vérificateur calcule également une empreinte de tout le contenu métier et une empreinte par pièce. Les archives de récupération sont comptées séparément : chaque restauration en ajoute une, sans altérer l’empreinte métier active.

## 4. Fiche de session

Relever avant essai : date, alias du testeur, modèle Samsung, RAM, Android/One UI, version complète Chrome, espace libre, mode d’isolation, ports, commit de PR, identifiant de `pwa-release.json`, version du kit V47 et empreintes des fichiers transmis. Prévoir assez d’espace pour plusieurs copies du jeu de volume, sans supprimer des données réelles pour faire de la place.

Pour chaque cas : résultat **PASS / FAIL / NON EXÉCUTÉ**, durée, capture sur données synthétiques, nom du fichier produit et anomalie éventuelle. « NON EXÉCUTÉ » n’est pas une réussite.

## 5. Cas de validation fonctionnelle

| ID | Actions sur Samsung | Résultat et preuve attendus |
|---|---|---|
| S01 — base vierge | Ouvrir A pour la première fois ; consulter Clients, Catalogue et archives. Attendre l’installation du worker, fermer toutes les fenêtres A puis rouvrir. | Aucun client/article/PDF/archive métier antérieur. Version de code attendue. Aucun effacement pour obtenir cet état. |
| S02 — restauration contrôlée | Dans Réglages A, sélectionner `jeu-smoke.odicolor`, lire le résumé, confirmer. | Redémarrage normal ; 3 garages, 12 devis, 30 tarifs, 3 images, 2 PDF. L’état vide précédent est archivé. |
| S03 — identité et pièces | Ouvrir garages 1 et 2 et comparer les libellés des images ; consulter leurs visites, notes et besoins. Ouvrir les 2 PDF. | Chaque image correspond à son numéro ; aucune pièce d’un autre garage. Historique complet ; PDF affiche « PDF SYNTHETIQUE » et son numéro. |
| S04 — tarifs/calcul de contrôle | Chercher `SYN-00001`, puis ouvrir le premier devis synthétique. | Prix de l’article : 10,00 € HT. Premier devis : 30,03 € HT, TVA 2,55 €, TTC 32,58 € avec les réglages du jeu. Ce ne sont pas des tarifs réels. |
| S05 — import manuel | Importer un des PDF séparés depuis Réglages avec fournisseur « FOURNISSEUR SYNTHETIQUE ». Remplacer la photo du garage 1 par le SVG synthétique séparé. | Sélection/annulation/remplacement explicites, pièce consultable après fermeture de l’écran. Les autres garages et pièces sont intacts. Faire ce cas après la comparaison de référence, ou consigner cette modification avant un nouveau manifeste de comparaison. |
| S06 — sauvegarde | Télécharger la sauvegarde complète A. Attendre la fin réelle du téléchargement, pas seulement le toast. Copier le fichier sur le PC de test. | Taille non nulle, extension `.odicolor`, vérification complète réussie. Conserver deux copies, dont une hors du téléphone. |
| S07 — nouvel appareil simulé | Sur B jamais utilisée, vérifier l’état vierge puis restaurer le fichier exporté de A. Fermer puis rouvrir B ; réexporter. | Données et pièces présentes sans dépendre de A. Comparaison des empreintes métier/pièces A et B réussie. Le nombre d’archives peut augmenter ; aucune archive antérieure importée ne disparaît. |
| S08 — corrompu/tronqué | Noter l’empreinte de B, essayer successivement `corrompu-smoke.odicolor` et `tronque-smoke.odicolor`. Réexporter B. | Refus avant remplacement ; même empreinte métier, mêmes pièces et même nombre d’archives qu’avant le refus. Aucun faux message de réussite. |
| S09 — annulation | Sélectionner un fichier valide, annuler la confirmation. | Aucun remplacement, aucune nouvelle archive, saisies et fichiers inchangés. |
| S10 — deux fenêtres | Ouvrir deux fenêtres B ; laisser une fiche dans la seconde. Restaurer depuis la première, puis essayer une écriture depuis l’ancienne fiche. | Ancienne fenêtre bloquée avec demande de rechargement ; aucun ancien historique réinjecté. Après rechargement, elle lit le nouveau portefeuille. |
| S11 — état précédent | Sur un jeu synthétique, ajouter une note clairement nommée « NOTE AVANT REMPLACEMENT », sauvegarder, puis restaurer un autre jeu synthétique. Télécharger l’archive de l’état précédent, la restaurer sur une destination vierge supplémentaire. | La note et les pièces de l’état remplacé sont récupérables. Aucun mélange dans le portefeuille actif. Ne pas dépasser les limites historiques de l’ancien code pendant cet essai. |

Vérification sur le PC, pour un export de référence avant toute modification manuelle :

```sh
node scripts/verifier-sauvegarde.cjs /chemin/export-A.odicolor /tmp/odicolor-jeu-smoke/attendus-smoke.json
node scripts/verifier-sauvegarde.cjs /chemin/export-B.odicolor /tmp/odicolor-jeu-smoke/attendus-smoke.json
```

Après une modification manuelle volontaire, utiliser `node scripts/verifier-sauvegarde.cjs /chemin/export-A.odicolor` pour produire le nouveau rapport de référence, puis comparer B avec ce rapport. La date et l’empreinte du fichier binaire changent à chaque export ; **l’empreinte métier et les empreintes des pièces doivent rester égales** entre deux états métier identiques. Une copie binaire simplement transférée entre téléphone et PC doit, elle, conserver exactement son empreinte de fichier.

## 6. Hors ligne et mises à jour

| ID | Actions | Résultat attendu |
|---|---|---|
| P01 — arrêt réseau réel | Après installation complète sur A/B, fermer toutes leurs fenêtres. Arrêter les serveurs PC avec Ctrl-C et activer le mode avion, Wi-Fi désactivé. Rouvrir A/B ou leur PWA installée. | Accueil, Clients, fiches, catalogue local et devis s’ouvrent depuis le worker ; aucune page blanche. **Le mode avion seul ne suffit pas avec ADB : localhost peut rester accessible par USB.** |
| P02 — pièces hors ligne | Serveurs toujours arrêtés, ouvrir plusieurs images puis tous les PDF importés ; exporter une sauvegarde, puis restaurer un fichier local valide. | Images et PDF lisibles ; sauvegarde et restauration sans Internet. Toute action réellement externe reste dépendante du réseau. Vérifier le téléchargement PDF si Chrome utilise un lecteur Android séparé. |
| P03 — reprise | Relancer les serveurs, réactiver le réseau, fermer et rouvrir les fenêtres. | Aucune modification des données par le seul changement de réseau ; même empreinte métier. |
| P04 — mise à jour contrôlée | Avec l’accompagnant technique et deux constructions cohérentes préparées localement, garder une saisie non enregistrée ouverte ; installer la suivante. Choisir « Plus tard ». | La version courante et la saisie restent en place. La nouvelle version attend ; aucun rechargement ni activation forcés. Après enregistrement et fermeture de **toutes** les fenêtres de l’origine, réouverture sur la nouvelle version cohérente. |
| P05 — installation interrompue | Dans le banc local, rendre une ressource de la nouvelle construction indisponible ou incorrecte. Ne pas modifier un dossier actuellement utilisé sans plan de test. | Nouvelle installation refusée ; ancien lot complet reste utilisable hors ligne ; données inchangées. La CI reproduit HTTP 503, empreinte erronée et premier chargement incohérent. Si ce banc n’est pas reproduit sur Samsung, noter NON EXÉCUTÉ, sans forcer l’activation depuis DevTools. |
| P06 — transition historique | Sur un profil/origine dédié contenant le vrai kit V47 et des données synthétiques, vérifier le worker `terrain-v47`, puis faire la transition locale vers le candidat. | Ancien écran stable pendant l’attente ; après fermeture des anciennes fenêtres, nouveau shell vérifié et migration v1→v2 conservant les données. L’ancien cache n’est pas supprimé. Cas aussi testé dans Chromium CI. |

L’accompagnant peut relever en lecture seule via Chrome/USB : `window.ODICOLOR_PWA.release`, les états `active/waiting` de la registration et les noms de cache. Ne pas cocher « Update on reload », « Bypass for network » ou « Skip waiting » pendant la réception. La version visuelle reste V47 ; l’identifiant de construction distingue les ensembles techniques.

## 7. Migration et retour au code V47

Exécuter [RETOUR_CODE_V47.md](RETOUR_CODE_V47.md) sur A → C : sauvegarde complète A conservée hors téléphone ; outil de récupération ouvert sur C vierge ; création d’une copie au schéma 1 ; ouverture du code V47 figé sur C ; contrôles des tarifs, historiques, images et PDF. Réexporter C par l’outil autonome et comparer avec A.

Vérifier ensuite que A est encore en v2 et inchangée. Tenter la copie vers une destination déjà remplie : refus sans perte. Ajouter une note synthétique dans C et exporter par l’outil autonome ; restaurer sur D pour prouver le trajet de retour vers le code corrigé. Ne pas tenter une diminution de version sur A.

Une erreur de migration/écriture réelle est testée en CI par abort asynchrone. Sur Samsung, ne pas saturer le stockage général ni tuer le profil commercial pour provoquer une erreur. Une limite de quota sur **la seule origine de test**, si disponible avec l’accompagnant, peut servir à confirmer le refus sans changement. Sinon noter ce cas NON EXÉCUTÉ sur appareil ; conserver la preuve CI sans la présenter comme un essai de quota matériel.

## 8. Volume représentatif et répétition

Sur une nouvelle origine de test ou un profil vierge, restaurer `jeu-terrain.odicolor`, puis contrôler les 2 000 garages, 10 000 devis, 20 000 articles et tous les compteurs du tableau. Ouvrir les garages 1, 2, 199, 200 et 201 : les quatre premiers de ce choix ont une image numérotée ; le 201 n’en possède pas. Consulter les six PDF, les notes et les visites d’un garage éloigné dans la liste. Exporter et vérifier avec `attendus-terrain.json`.

Mesurer sur le téléphone : durée de restauration, temps jusqu’à un écran utilisable, 20 navigations et 20 recherches, consultation d’un PDF, durée et taille de sauvegarde. Noter chauffe, fermeture Android, blocage prolongé, erreurs de quota et croissance du stockage après plusieurs restaurations. Les archives sont conservées : leur croissance est attendue, pas une fuite silencieuse.

Critères de performance proposés : écran local utile en moins de 2 s à froid, navigation habituelle sous 500 ms et recherche sous 200 ms au 95e percentile. Mesurer avec Chrome Performance à distance si nécessaire ; un simple chronomètre ne prouve pas un seuil de 200 ms. Toute mesure absente doit être signalée. Ces seuils sont des objectifs, pas des résultats annoncés.

Faire ensuite sept journées simulées : ouvrir, consulter, ajouter uniquement des notes synthétiques, fermer, reprendre hors ligne, sauvegarder hors appareil et vérifier une récupération. Aucun ralentissement cumulatif, aucune perte ni confusion de garage ne doit rester inexpliqué.

## 9. Décision

Critères bloquants : donnée manquante, pièce différente, mauvaise attribution, ancien onglet écrivant après restauration, sauvegarde corrompue acceptée, succès annoncé après échec, migration destructrice, mélange de scripts ou retour de secours non récupérable.

Consigner les résultats et écarts dans un compte rendu avec le commit testé. Les cas non exécutés et les limites matérielles restent ouverts. L’acceptation Samsung et la décision de fusion/publication appartiennent à la validation utilisateur ; ce protocole ne lance ni merge ni déploiement.
