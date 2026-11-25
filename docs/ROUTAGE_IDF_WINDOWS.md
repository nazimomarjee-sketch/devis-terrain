# Moteur routier local (OSRM + VROOM) — Île-de-France, installation automatisée sous Windows

Objectif : calculer les temps de trajet et optimiser les tournées de CHARLIE **sur le PC du bureau**, gratuitement, sans qu'aucune donnée client ne quitte la machine.
Couverture : extrait OpenStreetMap Île-de-France (75, 77, 78, 91, 92, 93, 94, 95), donc tous les secteurs de la feuille de route de Laurent ; départ de référence Massy–Palaiseau.
Fichiers : `infra/routage/` (compose et vérificateur déjà existants, **non modifiés** ; scripts Windows ajoutés).

## Procédure en 3 commandes (PowerShell, dans `infra\routage`)
```powershell
Unblock-File .\*.ps1                                                              # 1. fichiers venant d'Internet
powershell -ExecutionPolicy Bypass -File .\installer-moteur-windows.ps1           # 2. installe, construit le graphe, démarre, vérifie
powershell -ExecutionPolicy Bypass -File .\mettre-a-jour-graphe-windows.ps1 -Planifier   # 3. mise à jour automatique toutes les 4 semaines
```
Si Docker Desktop est absent, l'étape 2 s'arrête avec **une** instruction (code 2). Pour qu'elle l'installe elle-même : PowerShell « en tant qu'administrateur » + `-Confirmer` (installe WSL 2 et Docker Desktop par `winget`, puis demande de **redémarrer Windows** : code 3). Rien n'est installé sans `-Confirmer`.

| Script | Rôle |
|---|---|
| `installer-moteur-windows.ps1` | Idempotent. Prérequis → extrait Geofabrik (reprise après coupure, MD5) → graphe OSRM → `docker compose up -d` → tâche de démarrage à l'ouverture de session → vérification (`verifier-moteur.cjs` si Node présent, sinon équivalent PowerShell) |
| `demarrer-moteur-windows.ps1` | Démarre/redémarre (utilisé par la tâche planifiée) |
| `arreter-moteur-windows.ps1 [-Desactiver]` | Arrête sans rien supprimer ; `-Desactiver` suspend aussi les tâches planifiées |
| `mettre-a-jour-graphe-windows.ps1 [-Forcer] [-Planifier\|-Deplanifier]` | Construit le nouveau graphe **à côté**, le valide sur un OSRM temporaire (port 5001), l'échange (arrêt/redémarrage d'OSRM seul), vérifie, **retour arrière automatique** si échec ; ancien graphe gardé dans `data-prev` |
| `desinstaller-moteur-windows.ps1` | **Simulation par défaut** ; `-Confirmer` pour agir ; données/images seulement avec `-SupprimerDonnees` / `-SupprimerImages` |
| `acces-samsung\` | Configuration (non activée) d'un accès HTTPS privé depuis le Samsung |

Codes de sortie : 0 succès · 1 échec technique · 2 prérequis manquant · 3 redémarrage Windows requis · 4 vérification du moteur échouée · 5 ports exposés au-delà de la machine · 6 autre opération en cours (`.verrou`). Journaux : `infra\routage\logs\` (30 derniers conservés).

## Ressources attendues — **tout est « à mesurer » sur le PC cible**
Rien de ci-dessous n'a pu être mesuré ici (téléchargements Geofabrik et images Docker bloqués depuis la session de développement).
- Téléchargement : extrait Île-de-France, de l'ordre de plusieurs centaines de Mo d'après la page Geofabrik (non vérifié ici) ; garde-fou du script : refuse un fichier < 20 Mo (page d'erreur), ce n'est pas la taille attendue.
- Disque : `data` + `data-new` + `data-prev` coexistent pendant une mise à jour. Le script exige 20 Go libres à l'installation et 25 Go à la mise à jour (**précautions arbitraires**, ajustables par `-EspaceMinGo` après mesure du dossier `data`).
- Mémoire : la construction du graphe est le point gourmand ; Docker Desktop/WSL 2 limite par défaut la mémoire (la moitié de la RAM, d'après la documentation Microsoft — à vérifier). Un échec par manque de mémoire se reconnaît au code 137 ; le script explique alors comment régler `%UserProfile%\.wslconfig`. Le script avertit sous 8 Go de RAM (seuil indicatif).
- Durées (construction, chargement d'OSRM, coupure lors d'un échange) : à lire dans `.graphe-ok.json` (champ `dureeMin`) et dans les journaux après la première installation. En simulation (graphe synthétique de 97 nœuds) l'échange a coupé OSRM ~1 s : **sans valeur** pour la vraie carte.

## Sécurité
- **Ports** : OSRM (5000) et VROOM (3000) sont publiés sur `127.0.0.1` seulement (`docker-compose.yml`, vérifié par `docker compose config`). Après démarrage, le script contrôle (`Get-NetTCPConnection`) qu'aucun n'écoute sur `0.0.0.0`/`::` et s'arrête avec le code 5 sinon. *Contrôle non exécuté sous Windows ici.*
- **Données** : le moteur ne reçoit que des coordonnées de points (positions de garages) envoyées par CHARLIE sur la même machine ; aucun nom, aucun CA. Seules sorties réseau des scripts : téléchargement de données publiques OSM (Geofabrik) et des images Docker (ghcr.io). Aucune donnée client n'est téléchargée ni envoyée.
- **Droits** : tâches planifiées exécutées avec l'utilisateur courant, sans administrateur. L'administrateur n'est requis que pour installer WSL/Docker (`-Confirmer`).
- **Scripts non signés** : lancés avec `-ExecutionPolicy Bypass` pour ce seul script. Lire les scripts avant exécution est possible (texte clair).
- **Images Docker** épinglées par *tag* (`osrm-backend:v5.27.1`, `vroom-docker:v1.14.0`), pas par empreinte : une fois le moteur validé, relever les empreintes (`docker image inspect`) et les épingler — **non fait**. Mises à jour d'images : manuelles.
- **Accès depuis le Samsung** : voir ci-dessous ; ne jamais ouvrir les ports 5000/3000 sur le réseau local ni Internet.

## Accès depuis le Samsung (analyse et recommandation)
Problème : la PWA est servie en HTTPS ; un navigateur bloque `http://IP-du-PC` (contenu mixte). Seul `http://127.0.0.1` est toléré, mais c'est le téléphone lui-même.
1. **Recommandé à terme — via le serveur CHARLIE du PC** : le Samsung ne parle qu'à CHARLIE (déjà prévu en HTTPS avec authentification) ; CHARLIE appelle OSRM/VROOM en local. Aucune exposition supplémentaire. Dépend de l'intégration cockpit (travail séparé).
2. **Passerelle immédiate (config prête, non activée)** — `acces-samsung\Caddyfile` : Caddy sur le PC, HTTPS automatique par **Tailscale** (réseau privé chiffré, appareils autorisés seulement), écoute **uniquement** sur l'adresse Tailscale, jeton secret dans le chemin, CORS limité à l'origine de la PWA, OSRM limité à `table`/`route`, VROOM en POST seul, corps ≤ 512 Ko, aucun journal d'accès (le jeton y figurerait). Réglages à saisir dans l'app : `https://HOTE/JETON/osrm` et `https://HOTE/JETON/vroom` (le code actuel de l'app accepte ces URL, sans en-tête d'authentification). `generer-jeton.ps1` crée `.env` (ignoré par git) avec un jeton aléatoire cryptographique.
   Limites : **pas de limitation de débit** (greffon Caddy non standard, non installé) ; Tailscale et Caddy à installer par vos soins ; offre gratuite de Tailscale à vérifier avant usage.
3. Écartés : ouverture de ports sur Internet (surface d'attaque), serveurs de démonstration publics OSRM/VROOM (interdits en production, données exposées), certificat auto-signé sur le réseau local (à installer sur chaque téléphone, fragile).

## Coût
- Licences : OSRM et VROOM BSD-2-Clause (fichiers `LICENSE` lus), données OpenStreetMap ODbL (mention « © contributeurs OpenStreetMap » si une carte avec fond est affichée) : **0 €**.
- **Docker Desktop n'est pas libre pour toute entreprise** : sa licence gratuite est réservée aux petites structures et à l'usage personnel ; au-delà d'un seuil de taille elle est payante (conditions à **vérifier selon la taille d'ODICOLOR** avant installation). Alternative gratuite : Docker Engine dans WSL 2, non automatisée ici.
- Matériel : PC de bureau existant, allumé aux heures de tournée. Tailscale : voir ci-dessus.
- Un serveur dans le cloud serait un **abonnement** : non souscrit et non nécessaire.

## Sauvegarde et retour arrière
Le graphe est reconstructible à partir de données publiques : il n'a pas besoin de sauvegarde. À conserver : le dépôt (scripts, compose) et, si utilisé, `acces-samsung\.env` (hors dépôt, contient le jeton).
- Après une mise à jour : `data-prev` = graphe précédent (un seul niveau) ; `data-echec` = graphe refusé après un retour automatique (à supprimer quand analysé).
- Retour manuel : `arreter-moteur-windows.ps1`, renommer `data` en `data-echec` et `data-prev` en `data`, `demarrer-moteur-windows.ps1`.
- Si le moteur est indisponible : CHARLIE continue avec le calcul local (temps estimés, signalés) ; la tournée habituelle de l'application n'est pas touchée.

## Ce qui a été testé ici, et ce qui ne l'a pas été
**Réellement exécuté (Linux, PowerShell 7.4)** : analyse de syntaxe des 7 scripts ; `docker compose config` ; `bash -n` ; vrai OSRM 6.0.0 (binaires npm `@project-osrm/osrm`) : extract → partition → customize → `osrm-routed` sur un réseau routier **synthétique** autour de Massy–Palaiseau, puis `verifier-moteur.cjs` (partie OSRM : 6 secteurs OK) ; Caddy 2.6.2 : `caddy validate` + 8 requêtes (bon/mauvais jeton, `/nearest` refusé, GET vers VROOM refusé, POST accepté, CORS, corps trop gros rejeté — code 502 observé, 413 attendu dans les versions récentes) ; **scénarios de bout en bout des scripts** avec un *faux* `docker` branché sur les vrais binaires OSRM et un faux Geofabrik (coupure réseau en plein téléchargement puis reprise + MD5 ; 2ᵉ lancement sans rien refaire ; mise à jour sans changement ; mise à jour valide ; extrait cassé refusé, ancien graphe conservé ; échec après échange → retour arrière ; désinstallation à blanc ; arrêt/démarrage). Ces essais ont révélé et fait corriger un bug (variables `$R`/`$r` confondues par PowerShell).
**Non testé** : tout ce qui est propre à Windows (Windows PowerShell 5.1, Docker Desktop/WSL 2, `winget`, `Register-ScheduledTask`, `Get-NetTCPConnection`, `curl.exe`/BITS, `.wslconfig`) ; la vraie carte Île-de-France (extrait, durées, mémoire) ; les images `ghcr.io` (OSRM 5.27.1 du compose vs 6.0.0 des essais — versions différentes, pipeline identique) ; **VROOM réel** (seulement un faux serveur qui renvoie un ordre trivial) ; montage `:ro` du volume OSRM avec le vrai conteneur ; Caddy avec Tailscale/HTTPS réel et depuis un Samsung.
**Risques résiduels** : consommation mémoire/disque inconnue sur la vraie carte ; licence Docker Desktop ; comportement de Docker Desktop au démarrage de session (réglage « Start Docker Desktop when you sign in » non modifiable de façon fiable par script — le script avertit s'il le lit désactivé) ; tags d'images non épinglés par empreinte.
