# 09 — Plan d'essais sur un vrai PC Windows et un vrai Samsung

> **Statut : AUCUN ESSAI RÉALISÉ.** Cette page est un plan. Je ne cocherai une case que lorsque l'essai aura été fait, avec son résultat réel.
> Données : **fictives uniquement** pendant tous ces essais.

Légende : ⬜ non réalisé.

## A. PC Windows 11 Pro (ou équivalent)

| # | Essai | Procédure | Résultat attendu | Statut |
|---|---|---|---|---|
| W1 | Les tests passent sous Windows | `npm test` | 175 tests, 0 échec. **Un échec = on s'arrête et on corrige** | ⬜ |
| W2 | Agents isolés sous Windows | `JARVIS_ISOLATION` par défaut, `npm run demo` | Missions traitées ; latence mesurée (relever ms/mission) | ⬜ |
| W3 | Le modèle de permissions Node se comporte comme sous Linux | `tests/isolation.test.js` | lecture/écriture/processus refusés | ⬜ |
| W4 | 3 services sous 3 comptes Windows | Planificateur de tâches, un compte par espace | 3 services indépendants | ⬜ |
| W5 | Cloisonnement NTFS | Le compte `jarvis-perso` ouvre un fichier d'ODICOLOR | **Accès refusé** | ⬜ |
| W6 | Redémarrage Windows | Redémarrer le PC | Les 3 services reviennent seuls ; missions reprises | ⬜ |
| W7 | Coupure brutale | Débrancher pendant une mission, rebrancher | Mission reprise, journal intact (`sante.js`) | ⬜ |
| W8 | Pare-feu : agents sans réseau | Règle de blocage sur la copie dédiée de `node.exe` ; faute `reseau` | **Connexion refusée** pour l'agent ; le service, lui, accède à son réseau | ⬜ |
| W9 | BitLocker + clé de récupération | Activer, redémarrer | Démarrage OK ; clé stockée hors machine | ⬜ |
| W10 | Sauvegarde et restauration | Sauvegarde auto + exercice de restauration | `ok: true`, bon nombre de missions | ⬜ |
| W11 | Veille/hibernation désactivées | 24 h de fonctionnement | Aucune interruption ; battement de cœur continu | ⬜ |
| W12 | Mise à jour Windows | Laisser une mise à jour redémarrer | Reprise automatique ; alerte éventuelle visible | ⬜ |
| W13 | Charge | 100 missions déposées d'un coup | Toutes traitées une fois ; mesurer CPU/RAM | ⬜ |
| W14 | Durée | 7 jours de fonctionnement continu | Aucune alerte critique inexpliquée ; relever la disponibilité **réelle** | ⬜ |

| W15 | **`installer.ps1 -Simuler` puis installation** | Lancer comme décrit en `05` | Comptes, ACL, tâches, règles créés ; aucun message d'erreur | ⬜ |
| W16 | **`verifier-isolation.ps1`** (ARBITRE) | Fournir les mots de passe des comptes | `rapport-isolation.json`, **0 échec bloquant**, exit 0. Les sondes « INFO » (loopback) à lire | ⬜ |
| W17 | Tâche agent via `schtasks /Run` depuis le service | Mission réelle (fictive) en mode `echange` | Résultat identique au mode direct ; tâche stoppée par `/End` au délai | ⬜ |
| W18 | Attestation Windows | Démarrer le service, lire `Confinement attesté : niveau …` | « os » **seulement si** toutes les sondes refusées ; sinon rester en démo | ⬜ |
| W19 | `exercice-reprise.ps1` | Tuer le service pendant 10 missions | Reprise < 2 min, 0 doublon, journal intact (`npm run sante`) | ⬜ |
| W20 | Superviseur + boucle de crash | Forcer un échec de démarrage répété | Escalade après 3 redémarrages, alerte visible | ⬜ |
| W21 | Auto-test de l'auditeur au démarrage | Lire `AUDITEUR_SAIN` dans le journal | Présent ; pas d'`AUDITEUR_DEFAILLANT` | ⬜ |

## B. Samsung Android

| # | Essai | Procédure | Résultat attendu | Statut |
|---|---|---|---|---|
| S1 | Accès par VPN privé | Installer le VPN sur le téléphone, ouvrir l'URL privée | Page chargée en HTTPS | ⬜ |
| S2 | Aucun accès sans VPN | Couper le VPN, rouvrir | **Inaccessible** | ⬜ |
| S3 | Lisibilité | Ouvrir sur le Samsung réel (taille de police système standard puis grande) | Texte lisible, aucun débordement horizontal | ⬜ |
| S4 | Cibles tactiles | Utiliser avec une main | Boutons ≥ 44 px, **arrêt d'urgence** atteignable | ⬜ |
| S5 | Mission par texte | Envoyer « prépare un devis… » | Résultat dans « À valider » en quelques secondes | ⬜ |
| S6 | Dictée | Micro du clavier (Gboard) | Texte inséré, mission envoyée. *(Fonction du clavier, pas de JARVIS)* | ⬜ |
| S7 | Détail d'une décision | Ouvrir « Détail » | Plan, droits, contrôles, chronologie lisibles | ⬜ |
| S8 | Validation | Approuver un devis fictif | Statut « Validée », **envoi simulé** | ⬜ |
| S9 | Arrêt d'urgence | Toucher le bouton | Traitement stoppé, bandeau rouge | ⬜ |
| S10 | Téléphone éteint | Éteindre le téléphone, déposer une mission depuis un autre appareil | Mission traitée ; visible à l'allumage | ⬜ |
| S11 | Perte du téléphone | Révoquer le jeton, se reconnecter avec un nouveau | Ancien jeton **refusé** | ⬜ |
| S13 | Installation de la PWA | Chrome → « Installer l'application » | Icône sur l'écran d'accueil, ouverture plein écran | ⬜ |
| S14 | Hors ligne | Couper le réseau, rouvrir l'appli | Coquille visible, bandeau « HORS LIGNE », **aucune donnée** affichée, arrêt d'urgence désactivé | ⬜ |
| S15 | Alertes locales | Activer, provoquer une validation | Notification **seulement application ouverte** (pas de push) | ⬜ |
| S12 | Trois espaces | Basculer perso / ODICOLOR / cockpit | Trois jetons, trois contextes, aucune fuite | ⬜ |

## C. Essais avec données réelles (SEULEMENT après accord écrit d'ODICOLOR)

Hors périmètre de ce plan. À définir avec ODICOLOR : jeu d'essai restreint, règles validées, rapprochement EBP, durée du pilote.
