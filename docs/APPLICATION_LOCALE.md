# Application locale ODICOLOR 2.0 — étude et étape 1 « Coffre » (08/11/2026)

**Décision du propriétaire (08/11/2026) :** le stockage dans une page ouverte par double-clic n'est pas retenu comme
solution définitive. Étudier une **application locale sécurisée**, indépendante d'EBP et du réseau ODICOLOR, sans serveur
externe. GO pour l'étape 1 (coffre) sur données fictives uniquement. Aucune fusion, publication ou donnée réelle.

## 1. Architecture proposée (la plus simple et fiable)

```
PC ODICOLOR 2.0 (hors réseau interne, sans EBP)
┌──────────────────────────────────────────────────────────────┐
│ Application locale ODICOLOR (Node.js, aucune dépendance)      │
│  ├─ Coffre chiffré : un fichier sur le disque  ← étape 1 FAITE │
│  ├─ Imports EBP + sauvegardes téléphone cumulatifs  (étape 3)  │
│  ├─ Sauvegardes chiffrées / restauration vérifiée   (étape 4)  │
│  └─ Sert le Bureau et la Ville sur 127.0.0.1 seulement (étape 2)│
│             ▲ jamais accessible depuis un autre appareil       │
│ Navigateur = simple écran : il ne stocke plus rien             │
└──────────────────────────────────────────────────────────────┘
Exports EBP (clé USB) ─► import volontaire        Accès distant : plus tard, par tunnel chiffré (étape 6)
```

- **Protection contre l'effacement du navigateur :** les données sont dans le fichier du coffre, pas dans le navigateur.
  Vider le navigateur ne perd rien.
- **Bureau, téléphone et Ville LEGO conservés tels quels :** l'application locale les affiche, elle ne les redessine pas.
- **Pourquoi Node.js :** il contient déjà chiffrement, fichiers et petit serveur local ; c'est la technologie des tests actuels.
  Une seule technologie à maintenir. Alternatives écartées pour l'instant : logiciel de bureau lourd (Electron, 100 Mo+),
  base SQLite chiffrée (module à compiler), serveur ou cloud (contraire à l'indépendance du PC).
- **Accès distant futur (étape 6, à étudier) :** l'application n'écoutera jamais sur le réseau ; l'accès depuis le Samsung
  ou le portable passerait par un tunnel chiffré (type VPN) avec double authentification. Hypothèse, rien de décidé.

## 2. Étape 1 réalisée : le coffre (`local/coffre.js`)

| Exigence | Réponse |
|---|---|
| Stockage persistant | Un fichier `coffre.odc` sur le disque ; survit à l'arrêt du programme et du PC |
| Chiffré | AES-256-GCM ; clé aléatoire elle-même chiffrée par le mot de passe (scrypt, réglage recommandé OWASP) |
| Accès par mot de passe | 12 caractères minimum ; message de refus neutre ; verrouillage manuel et après 10 min d'inactivité |
| Mot de passe oublié | Clé de secours de 32 caractères (8 groupes de 4), donnée une seule fois à la création |
| Retouche du fichier | Données, en-tête et mot de passe chiffré authentifiés : toute modification = refus |
| Coupure pendant l'enregistrement | Écriture « tout ou rien » + version précédente gardée ; récupération automatique avec alerte |
| Fichier abîmé ou ancienne copie remise | La version valide la plus récente est ouverte, avec alerte ; l'autre fichier est mis de côté, jamais effacé |
| Deux fenêtres en même temps | Refusé (verrou) ; un verrou laissé par un arrêt brutal est levé automatiquement |

### Résultats des tests (données fictives) — `tests/local-coffre.test.cjs` : **15 / 15 réussis**, 3 passages identiques

1. Données identiques après arrêt et redémarrage du programme (vrai second processus).
2. Mauvais mot de passe refusé, aucune donnée lue, coffre non bloqué après refus.
3. Sur le disque, aucun nom, code client ni note en clair.
4. Mot de passe trop court refusé ; un coffre existant n'est jamais remplacé.
5. Retouche des données, de la génération, de la date ou du mot de passe chiffré : refus total.
6. Fichier principal tronqué : version précédente ouverte avec alerte, fichier abîmé gardé à part, reprise normale ensuite.
7. Coupure au pire moment de l'enregistrement : enregistrement complet récupéré.
8. Verrouillage après inactivité et manuel ; plus rien de lisible sans le mot de passe.
9. Clé de secours : ouvre, impose un nouveau mot de passe ; l'ancien ne marche plus ; saisie tolérante (minuscules, espaces).
10. Changement de mot de passe : données intactes, y compris si le fichier principal est abîmé ensuite.
11. Une seule fenêtre à la fois ; verrou d'un programme arrêté brutalement levé.
12. Les données lues sont une copie : rien n'est modifié sans enregistrement explicite.
13. Réglages réels : création ≈ 1,3 s, **ouverture ≈ 0,4 s** (machine de test).
14. Fichier piégé imposant des réglages trop faibles ou trop lourds : refusé.
15. Ancienne copie remise à la place du fichier principal : la plus récente est ouverte, avec alerte.

**Contrôle des garde-fous (sabotages volontaires, tous détectés) :** en-tête non authentifié → test 5 échoue ;
version précédente supprimée → tests 6 et 10 ; verrouillage automatique désactivé → test 8 ; verrou ignoré → test 11 ;
choix de la version la plus récente retiré → test 15.

Bureau, téléphone et Ville : **aucun fichier modifié** ; tous les tests existants restent verts.

## 3. Risques restants (avant toute étape supplémentaire)

| Risque | Gravité | Parade | Statut |
|---|---|---|---|
| **Pas encore de sauvegarde hors du PC** : disque en panne ou PC volé = coffre perdu | Élevée | Étape 4 (sauvegardes chiffrées sur clé USB, restauration vérifiée). **Aucune donnée réelle avant l'étape 4.** | À faire |
| Mot de passe ET clé de secours perdus = données illisibles | Élevée | Clé de secours sous enveloppe, chez une autre personne | Organisation |
| Node.js doit être présent sur le PC (version portable possible, sans droits administrateur) | Moyenne | Vérifier sur le PC ; étape 5 : un lanceur double-clic | Hypothèse à vérifier |
| Windows non testé ici (antivirus qui bloque un renommage, synchronisation du dossier non disponible) | Moyenne | Test sur le PC réel avec données fictives avant toute donnée réelle | À vérifier |
| Mot de passe faible | Moyenne | 12 caractères minimum ; conseiller une phrase ; chaque essai coûte ≈ 0,4 s | Partiel |
| Pendant que le coffre est ouvert, une personne ayant la session Windows pourrait lire la mémoire | Faible | Verrouillage auto 10 min + verrouillage de la session Windows | Limite connue |
| Remplacement simultané des deux fichiers par une ancienne paire cohérente : non détectable | Faible | Journal des sauvegardes (étape 4) ; accès physique au PC requis | Limite connue |
| Fichiers EBP bruts non chiffrés dans le dossier d'imports | Moyenne | Suppression après import, ou chiffrement du disque (BitLocker, édition Windows à vérifier) | À décider |

## 4. Étapes suivantes proposées (une validation à chaque fois)

2. **Relier le Bureau au coffre** : écran de mot de passe, le cockpit retrouvé à chaque ouverture (Bureau et Ville inchangés).
3. **Imports cumulatifs** : clés anti-doublon, journal, points de restauration, terrain jamais écrasé par EBP.
4. **Sauvegardes chiffrées et restauration vérifiée** (clé USB) — condition pour toute donnée réelle.
5. **Lanceur Windows** et essai sur le PC réel (données fictives).
6. **Étude de l'accès distant sécurisé.**
