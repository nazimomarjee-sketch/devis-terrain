# 05 — Installation sur un PC Windows 11 Pro

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
# ne garder que le dossier jarvis :
Copy-Item -Recurse C:\jarvis-src\jarvis C:\jarvis
cd C:\jarvis
node --disable-warning=ExperimentalWarning --test tests\*.test.js   # doit afficher « fail 0 »
```
Si un test échoue sous Windows, **ne pas passer à la suite** : c'est exactement ce que cette étape doit détecter.

## 3. Secrets (jamais dans le code ni dans Git)

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # → ton jeton d'accès
```
Créer `C:\jarvis-secrets\env.cmd` (lisible **uniquement** par le compte `jarvis` : clic droit → Propriétés → Sécurité) :
```
set JARVIS_TOKEN=<le jeton généré>
set JARVIS_CLE_SAUVEGARDE=<une phrase de passe longue, aussi rangée dans ton gestionnaire de mots de passe>
set JARVIS_DONNEES=C:\jarvis-data
set JARVIS_HOTES_AUTORISES=<nom du PC dans ton VPN privé, voir §5>
```
Créer `C:\jarvis\lancer.cmd` :
```
@echo off
call C:\jarvis-secrets\env.cmd
cd /d C:\jarvis
"C:\Program Files\nodejs\node.exe" --disable-warning=ExperimentalWarning src\demarrer.js >> C:\jarvis-data\service.log 2>&1
```

## 4. Service permanent (Planificateur de tâches, sans logiciel tiers)

PowerShell **administrateur** :
```powershell
$action   = New-ScheduledTaskAction -Execute "C:\jarvis\lancer.cmd"
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "Jarvis" -Action $action -Trigger $trigger -Settings $settings `
            -User "jarvis" -Password "<mot de passe du compte jarvis>" -RunLevel Limited
Start-ScheduledTask -TaskName "Jarvis"
```
`-MultipleInstances IgnoreNew` évite deux instances ; en plus, le moteur lui-même empêche tout doublon d'exécution (testé).

**Sonde de santé** (toutes les 5 minutes, code de sortie 1 = alerte critique) :
```powershell
$a = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" -Argument "--disable-warning=ExperimentalWarning C:\jarvis\scripts\sante.js" -WorkingDirectory "C:\jarvis"
$t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "Jarvis-sante" -Action $a -Trigger $t -User "jarvis" -Password "<mot de passe>"
```
La sonde **détecte** (service silencieux depuis 2 min, journal altéré, missions en échec) ; **aucune notification push n'est encore développée** : les alertes se lisent dans le tableau de bord et le résultat de la tâche.

## 5. Accès depuis le Samsung — sans ouvrir de port

Le service écoute sur `127.0.0.1`. Pour y accéder à distance **sans exposer le PC à internet** : VPN privé de type Tailscale (application sur le PC et sur le Samsung, même compte), puis `tailscale serve` pour publier le service en HTTPS **à l'intérieur de ton réseau privé uniquement**. Mettre le nom de machine indiqué dans `JARVIS_HOTES_AUTORISES`.
> **Non testé** ici (aucun Samsung ni PC Windows disponible). À vérifier : accès depuis le téléphone en 4G, certificat HTTPS valide, aucune exposition publique (ne **jamais** utiliser « funnel »).
> Ne pas ouvrir de port sur la box internet.

## 6. Sauvegarde et restauration

- Automatique : une sauvegarde chiffrée **vérifiée par restauration** toutes les 24 h dans `C:\jarvis-data\sauvegardes\`.
- Copier ce dossier vers un **disque externe** et une **copie chiffrée hors site**. Le fichier `.enc` est inutile sans ta phrase de passe : **garde-la hors de la machine**.
- **Exercice de restauration à faire une fois par mois** (le test automatique le prouve en laboratoire, pas sur ta machine) :
```powershell
cd C:\jarvis
node --disable-warning=ExperimentalWarning -e "import('./src/sauvegarde.js').then(m=>console.log(m.restaurer(process.argv[1], process.env.JARVIS_CLE_SAUVEGARDE, 'C:\\jarvis-data\\restauration-test.sqlite')))" "C:\jarvis-data\sauvegardes\<fichier>.enc"
```
Résultat attendu : `ok: true` et le bon nombre de missions.

## 7. Arrêt d'urgence

- Depuis le téléphone : bouton **ARRÊT D'URGENCE**.
- Depuis le PC, si l'interface ne répond plus : créer un fichier vide `C:\jarvis-data\ARRET` (le service cesse de traiter ; le supprimer pour reprendre).
- Arrêt total : `Stop-ScheduledTask -TaskName Jarvis`.

## 8. Mises à jour

Jamais de mise à jour automatique du code. Procédure : arrêter → sauvegarder → récupérer la nouvelle version → **lancer les tests** → redémarrer. Mettre à jour Node seulement après avoir relancé les tests (le module SQLite intégré est encore expérimental).

## 9. Ce qu'il faut vérifier lors de la première installation (checklist)

- [ ] Les 46 tests passent sous Windows
- [ ] Le service redémarre seul après un redémarrage Windows
- [ ] Une mission en cours au moment d'un arrêt brutal est reprise (débrancher puis rebrancher)
- [ ] Le tableau de bord s'ouvre sur le Samsung **via le VPN** et pas sans
- [ ] Le fichier `ARRET` stoppe bien le traitement
- [ ] Une sauvegarde se restaure
- [ ] Le jeton ne figure ni dans `service.log` ni dans Git
