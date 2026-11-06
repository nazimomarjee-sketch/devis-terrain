# Proposition — Stockage local chiffré et persistant du Bureau ODICOLOR 2.0 (08/11/2026)

**Statut : proposition, rien développé.** Aucun développement, fusion ou déploiement avant validation du propriétaire.
Contraintes : PC indépendant d'EBP et du réseau interne · aucune donnée envoyée sur Internet · données fictives pour tous les essais.

## 1. Le besoin

1. Retrouver le cockpit **tel qu'on l'a laissé** à chaque ouverture.
2. **Chiffrer** les données sur le PC (vol, accès d'un tiers).
3. **Sauvegarder et restaurer**, sans risque de perte.
4. Un nouvel export EBP **actualise** les chiffres **sans effacer l'historique terrain** et **sans doublon**.

## 2. Vérifications faites (essai réel dans Chromium, page ouverte par double-clic, données fictives)

| Point | Résultat | Statut |
|---|---|---|
| Les données restent après fermeture et réouverture du navigateur | Oui | Confirmé |
| Chiffrement AES-256 disponible dans la page ouverte par double-clic | Oui | Confirmé |
| Mauvais mot de passe | Refusé, rien ne s'affiche | Confirmé |
| Contenu stocké lisible sans le mot de passe | Non (le nom du garage n'apparaît pas) | Confirmé |
| Temps d'ouverture du coffre (protection renforcée du mot de passe) | ≈ 0,1 s | Confirmé (machine de test) |
| Un autre fichier HTML ouvert dans le même navigateur voit la base | **Oui** (chiffrée, donc illisible, mais il pourrait l'effacer) | Confirmé → parade : profil de navigateur dédié |
| Protection « stockage permanent » accordée d'office | **Non** (en essai automatique) | Confirmé → parade : sauvegardes fichier |
| Écriture automatique des sauvegardes dans un dossier choisi | Fonction présente dans Chrome/Edge | Hypothèse : à vérifier sur le PC (autorisation à redonner à chaque ouverture ?) |
| Chiffrement du disque Windows (BitLocker) | Non vérifié | Hypothèse : dépend de l'édition de Windows du PC |

## 3. Options étudiées

| | A. Coffre chiffré dans le navigateur (recommandé) | B. Petit logiciel local (base SQLite chiffrée) | C. Serveur / cloud |
|---|---|---|---|
| Installation | Aucune : la page actuelle + un profil de navigateur dédié | Logiciel à installer et mettre à jour | Hébergement |
| Respect « PC indépendant » | Oui | Oui | **Non** |
| Robustesse | Bonne si sauvegardes régulières | Très bonne | Bonne |
| Complexité / coût | Faible : réutilise le Bureau, le format `.odicolor` et les règles du Socle | Moyenne : nouvelle technologie à maintenir | Élevée |
| Testable sur données fictives ici | Oui, comme tous les tests actuels | Partiellement | Non |

**Recommandation : A**, complétée par le chiffrement du disque Windows si l'édition le permet (protection en cas de vol du PC).
B reste possible plus tard si le volume ou le nombre d'utilisateurs l'exige ; les données se transfèrent alors par sauvegarde.

## 4. Fonctionnement proposé (option A)

### Ouverture et fermeture
- À l'ouverture : **mot de passe ODICOLOR**. Sans lui, aucune donnée n'est lisible (pas même les noms des garages).
- La clé n'est gardée qu'en mémoire : fermeture de la page ou **10 min d'inactivité** → coffre verrouillé.
- **Clé de secours** imprimée une seule fois, rangée sous enveloppe (par exemple au coffre de Faizal).
  Mot de passe ET clé de secours perdus = données illisibles : c'est le prix du chiffrement (seules les sauvegardes restent, chiffrées de la même façon).
- Navigateur : un **profil Chrome/Edge « ODICOLOR » réservé** au Bureau (aucun autre site ni fichier ouvert dedans).

### Ce qui est conservé, et comment (règles anti-perte et anti-doublon)

| Données | Clé unique (anti-doublon) | Nouvel import | Jamais |
|---|---|---|---|
| Clients EBP | Code client | Ajoute les nouveaux, met à jour ceux qui ont changé (ancienne valeur gardée au journal) | Supprimer un client absent du nouvel export : il est marqué « absent du dernier export » |
| Pièces EBP | Type + n° de pièce | Idem ; une pièce de la même période qui disparaît est signalée (« supprimée dans EBP ? ») | Effacer une pièce hors de la période du nouvel export |
| Règlements | N° de facture + date d'échéance | Met à jour le reste à payer | Déclarer un impayé sans échéancier |
| Terrain (sauvegarde du téléphone) | Identifiant du garage au téléphone (+ SIRET si connu) | Ajoute et met à jour ; un garage absent est gardé et marqué | Laisser EBP modifier une donnée terrain (notes, étapes, visites) |
| Liens terrain ↔ EBP | Code client | Un lien validé à la main est **mémorisé** (plus à refaire) | Relier des homonymes au hasard |

- **Même fichier importé deux fois** : reconnu par son empreinte, aucun changement (« déjà importé le … »).
- **Journal des imports** (ajout seul) : date de l'export, nom du fichier, empreinte, nombre d'ajouts / mises à jour / inchangés / absents.
- **Historique** : un relevé des voyants et des chiffres clés à chaque import → évolution visible semaine après semaine.
- Les règles de vérité actuelles restent identiques (commandes ≠ facturé, chiffres datés par l'export EBP, 21 voyants).

### Protection contre les pertes
1. **Import tout ou rien** : si un import échoue au milieu (fichier abîmé, coupure de courant), rien n'est modifié.
2. **Point de restauration automatique avant chaque import** (les 10 derniers gardés, chiffrés).
3. **Sauvegarde chiffrée sur fichier** `.odicolor-bureau` (même principe que la sauvegarde du téléphone : empreintes d'intégrité, plus chiffrement) :
   - un bouton « Sauvegarder » dans le dossier `Documents\ODICOLOR-sauvegardes\` ;
   - **une fois par semaine, copie sur clé USB** rangée hors du bureau ;
   - le cockpit affiche « Dernière sauvegarde : il y a X jours » et passe en alerte après 7 jours.
4. **Restauration** : vérifie le mot de passe et l'intégrité AVANT de remplacer quoi que ce soit ; l'état actuel est d'abord gardé en point de restauration.
5. Navigateur nettoyé ou PC remplacé : on restaure la dernière sauvegarde fichier.

## 5. Essais prévus sur données fictives (à écrire avant le code)

1. Fermer puis rouvrir le navigateur → cockpit identique (voyants, chiffres, Ville).
2. Mauvais mot de passe → refusé ; contenu stocké illisible (aucun nom en clair).
3. Verrouillage après inactivité.
4. Même export EBP importé deux fois → 0 changement, 0 doublon.
5. Nouvel export : un montant modifié → mis à jour, ancienne valeur au journal ; un client absent → gardé et marqué.
6. Notes et étapes terrain intactes après dix imports EBP successifs.
7. Import interrompu volontairement → état identique à avant.
8. Sauvegarde → effacement complet du navigateur → restauration → empreinte identique.
9. Sauvegarde modifiée d'un seul octet → restauration refusée, rien de remplacé.
10. Restauration avec la clé de secours.
11. Essais « sabotage » : chaque garde-fou retiré doit faire échouer un test.
12. Ville LEGO et 21 voyants inchangés (garde-fous existants).

## 6. Taille du travail (estimation)

Trois lots, chacun validé avant le suivant :
1. **Coffre** : mot de passe, chiffrement, persistance, verrouillage, clé de secours.
2. **Imports cumulatifs** : clés anti-doublon, journal, points de restauration, liens mémorisés, historique des voyants.
3. **Sauvegarde / restauration fichier** + alerte « dernière sauvegarde ».

Réutilisés : lecture `.odicolor` et empreintes (Bureau), règles « rien n'est écrasé » du Socle (`socle/synchro.js`), imports EBP actuels.

## 7. Risques restants

- **Mot de passe et clé de secours perdus** → données illisibles. Parade : la clé de secours sous enveloppe, chez une autre personne.
- **Oubli des sauvegardes** → perte possible si le navigateur est nettoyé. Parade : l'alerte à 7 jours et la routine USB.
- **Un seul poste** : pas de partage avec Faizal tant qu'il n'y a pas d'hébergement (décision séparée, plus tard).
- **PC volé** : les données du coffre sont chiffrées ; les fichiers EBP bruts du dossier `ODICOLOR-imports` ne le sont pas
  → les supprimer après import, ou chiffrer le disque (BitLocker, à vérifier).

## 8. Première décision à prendre (une seule)

Valider l'**option A** (coffre chiffré dans le navigateur, profil dédié, sauvegardes chiffrées sur clé USB) comme base,
pour lancer le lot 1 sur données fictives.
