# 05 — Installation sur un PC Windows 11 Pro

> **v3 — procédure recommandée : les scripts `scripts/windows/`** (⚠ **NON EXÉCUTÉS**, écrits sans Windows ni PowerShell) :
> 1. `installer.ps1 -Simuler` (affiche tout, ne modifie rien) → relire → `installer.ps1` ;
> 2. **`verifier-isolation.ps1 -MotsDePasse @{…}` : OBLIGATOIRE** — tente 50+ accès interdits sous chaque compte et sort en code 1 au moindre échec bloquant ;
> 3. `exercice-reprise.ps1 -Espace odicolor -Jeton …` : tue le service et mesure la reprise ;
> 4. `desinstaller.ps1` (jamais de suppression de données sans `-SupprimerDonnees` + confirmation).
>
> Modèle : un **service** (`jv-<espace>`) et un **compte agent** (`ja-<espace>`) par espace ; l'agent est lancé par une **tâche planifiée** sous son compte (backend `echange`, `JARVIS_CONFINEMENT=echange`), n'a de droit d'écriture que sur `sorties` et `echange`, et son **trafic réseau est bloqué par une règle de pare-feu par compte**. Connexion interactive et bureau à distance **refusés** à tous les comptes JARVIS.
> Les sections ci-dessous (v2) restent valables pour comprendre le principe, mais **le script fait foi**.

> ⚠ **NON TESTÉ sur Windows.** Le prototype a été testé sous Linux (Node 22.23.4). Les commandes ci-dessous sont la procédure prévue ; la première installation servira à la valider et à la corriger. Ne l'applique **qu'avec des données fictives** tant que l'accord d'ODICOLOR n'est pas écrit.

## 0. Avant de brancher quoi que ce soit

- Activer **BitLocker** (Paramètres → Confidentialité et sécurité → Chiffrement de l'appareil). **Conserver la clé de récupération hors de la machine.**
- Créer un compte Windows **standard** (sans droits administrateur) nommé `jarvis`. C'est lui qui fera tourner le service. Ton compte administrateur reste séparé.
- BIOS/UEFI : option **« Restore on AC Power Loss » = Power On** (la machine redémarre seule après une coupure).
- Mises à jour Windows : définir des **heures d'activité** pour éviter un redémarrage en pleine journée.
- Alimentation : **jamais de veille ni d'hibernation** :
  `powercfg /change standby-timeout-ac 0` · `powercfg /change hibernate-timeout-ac 0`

## 1. Installer Node.js

Version **testée : 22.23.4**. Node 24 non testé. Installer Node 22 (LTS) depuis le site officiel nodejs.org ou `winget install OpenJS.NodeJS.LTS` (**vérifier que la version installée est ≥ 22.13**), puis `node --version`.

## 2. Déployer le code

```powershell
git clone https://github.com/nazimomarjee-sketch/devis-terrain C:\jarvis-src
Copy-Item -Recurse C:\jarvis-src\jarvis C:\jarvis
cd C:\jarvis
node --disable-warning=ExperimentalWarning --test tests\*.test.js   # doit afficher « fail 0 » (175 tests)
```
Si un test échoue sous Windows, **ne pas passer à la suite** : c'est exactement ce que cette étape doit détecter.

## 3. Trois espaces = trois comptes, trois dossiers, trois secrets

Créer **trois comptes Windows standard** (sans droits administrateur) : `jarvis-perso`, `jarvis-odicolor`, `jarvis-cockpit`. Un dossier de données par espace, accessible **uniquement** à son compte (et aux administrateurs) :

```powershell
foreach ($e in 'perso','odicolor','cockpit') {
  New-Item -ItemType Directory -Force "C:\jarvis-data\$e" | Out-Null
  icacls "C:\jarvis-data\$e" /inheritance:r /grant "jarvis-${e}:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" | Out-Null
}
```
Pour chaque espace, générer **trois secrets différents** (jeton utilisateur, jeton **administrateur**, clé de sauvegarde) et les ranger dans `C:\jarvis-secrets\<espace>.cmd`, lisible **uniquement** par le compte de l'espace :
```
set JARVIS_ESPACE=odicolor
set JARVIS_DONNEES=C:\jarvis-data
set JARVIS_ODICOLOR_TOKEN=<jeton utilisateur>
set JARVIS_ODICOLOR_ADMIN_TOKEN=<jeton administrateur — à garder aussi dans ton gestionnaire de mots de passe>
set JARVIS_ODICOLOR_CLE_SAUVEGARDE=<phrase de passe longue>
set JARVIS_ODICOLOR_PORT=8160
set JARVIS_NODE_AGENT=C:\jarvis\agent-node\node.exe
set JARVIS_HOTES_AUTORISES=<nom du PC dans ton VPN privé>
```
Ports par défaut : perso 8170, ODICOLOR 8160, cockpit 8180. Le démarrage **refuse** une configuration où deux espaces partageraient un port, un jeton ou une clé.

**Exécutable des agents dédié** (pour bloquer SON réseau sans bloquer le service) :
```powershell
New-Item -ItemType Directory -Force C:\jarvis\agent-node | Out-Null
Copy-Item "C:\Program Files\nodejs\node.exe" C:\jarvis\agent-node\node.exe
New-NetFirewallRule -DisplayName "Jarvis agents : sortie bloquée" -Direction Outbound -Program "C:\jarvis\agent-node\node.exe" -Action Block
```
> **NON TESTÉ sous Windows** (essai W8). Le test `isolation.test.js` documente que Node seul **ne filtre pas** le réseau : cette règle est donc la seule barrière réseau des agents.

Lanceur par espace `C:\jarvis\lancer-odicolor.cmd` :
```
@echo off
call C:\jarvis-secrets\odicolor.cmd
cd /d C:\jarvis
"C:\Program Files\nodejs\node.exe" --disable-warning=ExperimentalWarning src\demarrer.js >> C:\jarvis-data\odicolor\service.log 2>&1
```

## 4. Services permanents (Planificateur de tâches, sans logiciel tiers)

Un service **par espace**, sous **son** compte :
```powershell
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew
foreach ($e in 'perso','odicolor','cockpit') {
  $action  = New-ScheduledTaskAction -Execute "C:\jarvis\lancer-$e.cmd"
  Register-ScheduledTask -TaskName "Jarvis-$e" -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -User "jarvis-$e" -Password "<mot de passe du compte>" -RunLevel Limited
  Start-ScheduledTask -TaskName "Jarvis-$e"
}
```
**Sonde de santé** par espace (toutes les 5 min ; code de sortie 1 = alerte critique : service silencieux, journal altéré, résultat modifié, échec…) :
```powershell
foreach ($e in 'perso','odicolor','cockpit') {
  $a = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" -Argument "--disable-warning=ExperimentalWarning C:\jarvis\scripts\sante.js" -WorkingDirectory "C:\jarvis"
  # JARVIS_ESPACE / JARVIS_DONNEES doivent être définies pour la tâche (variables d'environnement du compte jarvis-$e)
  Register-ScheduledTask -TaskName "Jarvis-sante-$e" -Action $a -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)) -User "jarvis-$e" -Password "<mot de passe>"
}
```
Les alertes se lisent dans le tableau de bord et dans le résultat de la tâche ; **aucune notification push n'est développée**.

## 5. Accès depuis le Samsung — sans ouvrir de port

Chaque service écoute sur `127.0.0.1` (ports 8160/8170/8180). Pour y accéder à distance **sans exposer le PC à internet** : VPN privé de type Tailscale (application sur le PC et sur le Samsung, même compte), puis `tailscale serve` pour publier le service en HTTPS **à l'intérieur de ton réseau privé uniquement**. Mettre le nom de machine indiqué dans `JARVIS_HOTES_AUTORISES`.
> **Non testé** ici (aucun Samsung ni PC Windows disponible). À vérifier : accès depuis le téléphone en 4G, certificat HTTPS valide, aucune exposition publique (ne **jamais** utiliser « funnel »).
> Ne pas ouvrir de port sur la box internet.

## 6. Sauvegarde et restauration

- Automatique : une sauvegarde chiffrée **vérifiée par restauration** toutes les 24 h dans `C:\jarvis-data\<espace>\sauvegardes\`.
- Copier ce dossier vers un **disque externe** et une **copie chiffrée hors site**. Le fichier `.enc` est inutile sans ta phrase de passe : **garde-la hors de la machine**.
- **Exercice de restauration à faire une fois par mois** (le test automatique le prouve en laboratoire, pas sur ta machine) :
```powershell
cd C:\jarvis
node --disable-warning=ExperimentalWarning -e "import('./src/sauvegarde.js').then(m=>console.log(m.restaurer(process.argv[1], process.env.JARVIS_CLE_SAUVEGARDE, 'C:\\jarvis-data\\restauration-test.sqlite')))" "C:\jarvis-data\<espace>\sauvegardes\<fichier>.enc"
```
Résultat attendu : `ok: true` et le bon nombre de missions.

## 7. Arrêt d'urgence

- Depuis le téléphone : bouton **ARRÊT D'URGENCE**.
- Depuis le PC, si l'interface ne répond plus : créer un fichier vide `C:\jarvis-data\<espace>\ARRET` (le service cesse de traiter ; le supprimer pour reprendre).
- Arrêt total : `Stop-ScheduledTask -TaskName Jarvis-<espace>` (un espace) ; le fichier `ARRET` à la racine d'un espace n'arrête que cet espace`.

## 8. Mises à jour

Jamais de mise à jour automatique du code. Procédure : arrêter → sauvegarder → récupérer la nouvelle version → **lancer les tests** → redémarrer. Mettre à jour Node seulement après avoir relancé les tests (le module SQLite intégré est encore expérimental).

## 9. Vérifications à la première installation

Voir le plan complet **`09_ESSAIS_WINDOWS_SAMSUNG.md`** (tous les essais y sont « NON RÉALISÉS »). Rappel rapide :

- [ ] Les 175 tests passent sous Windows
- [ ] Le service redémarre seul après un redémarrage Windows
- [ ] Une mission en cours au moment d'un arrêt brutal est reprise (débrancher puis rebrancher)
- [ ] Le tableau de bord s'ouvre sur le Samsung **via le VPN** et pas sans
- [ ] Le fichier `ARRET` stoppe bien le traitement
- [ ] Une sauvegarde se restaure
- [ ] Le jeton ne figure ni dans `service.log` ni dans Git
