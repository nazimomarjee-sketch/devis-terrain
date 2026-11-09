#requires -RunAsAdministrator
<#
.SYNOPSIS  Installe JARVIS sur Windows 11 Pro : comptes dédiés, ACL NTFS, pare-feu par compte, tâches planifiées, reprise au redémarrage.
.NOTES     ⚠ NON EXÉCUTÉ : écrit sans accès à Windows ni à PowerShell. Lancer d'abord avec -Simuler, relire, puis exécuter,
           puis OBLIGATOIREMENT verifier-isolation.ps1. Un échec du vérificateur = installation NON valide.
           Modèle : un service + un compte AGENT par espace ; le compte agent n'a accès qu'à son dossier de sortie et à l'échange.
#>
[CmdletBinding()]
param(
  [string]$RacineCode = 'C:\jarvis', [string]$RacineDonnees = 'C:\jarvis-data', [string]$RacineSecrets = 'C:\jarvis-secrets',
  [string[]]$Espaces = @('perso', 'odicolor', 'cockpit'), [string]$Node = 'C:\Program Files\nodejs\node.exe',
  [hashtable]$Ports = @{ perso = 8170; odicolor = 8160; cockpit = 8180 }, [switch]$Simuler
)
$ErrorActionPreference = 'Stop'
function Faire([string]$description, [scriptblock]$action) { Write-Host ("{0} {1}" -f $(if ($Simuler) { '[SIMULATION]' } else { '[FAIT]' }), $description); if (-not $Simuler) { & $action } }
function MotDePasse { $o = New-Object byte[] 24; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($o); ([Convert]::ToBase64String($o) + 'aA1!') }
function Sid([string]$compte) { (New-Object System.Security.Principal.NTAccount($compte)).Translate([System.Security.Principal.SecurityIdentifier]).Value }

if (-not (Test-Path $Node)) { throw "node.exe introuvable : $Node" }
$version = & $Node --version; if ([version]($version.TrimStart('v')) -lt [version]'22.13') { throw "Node >= 22.13 requis (trouvé $version)" }
$bl = Get-BitLockerVolume -MountPoint 'C:' -ErrorAction SilentlyContinue; if (-not $bl -or $bl.ProtectionStatus -ne 'On') { Write-Warning 'BitLocker NON actif sur C: — activer et conserver la clé de récupération HORS de la machine (essai W9).' }

# 1) Comptes : service (jv-*) et agent (ja-*), standard, sans mot de passe stocké sur disque, sans appartenance à Administrators.
$mdp = @{}
foreach ($e in $Espaces) { foreach ($pref in 'jv', 'ja') {
  $nom = "$pref-$e"; $mdp[$nom] = MotDePasse
  if (-not (Get-LocalUser -Name $nom -ErrorAction SilentlyContinue)) { Faire "créer le compte $nom" { New-LocalUser -Name $nom -Password (ConvertTo-SecureString $mdp[$nom] -AsPlainText -Force) -PasswordNeverExpires -UserMayNotChangePassword -Description "JARVIS $e ($pref)" | Out-Null } }
  else { Faire "réinitialiser le mot de passe de $nom" { Set-LocalUser -Name $nom -Password (ConvertTo-SecureString $mdp[$nom] -AsPlainText -Force) } }
} }

# 2) Droits de connexion : « ouvrir en tant que tâche » accordé, connexion interactive et bureau à distance REFUSÉS (secedit).
function Droit([string[]]$comptes, [string]$droit, [string]$cle) {
  $inf = Join-Path $env:TEMP 'jarvis-secpol.inf'; $db = Join-Path $env:TEMP 'jarvis-secpol.sdb'
  secedit /export /cfg $inf | Out-Null; $txt = Get-Content $inf -Raw
  $sids = ($comptes | ForEach-Object { '*' + (Sid $_) }) -join ','
  if ($txt -match "(?m)^$cle\s*=.*$") { $txt = $txt -replace "(?m)^($cle\s*=.*)$", "`$1,$sids" } else { $txt = $txt -replace '(?m)^\[Privilege Rights\]', "[Privilege Rights]`r`n$cle = $sids" }
  Set-Content $inf $txt -Encoding Unicode; secedit /configure /db $db /cfg $inf /areas USER_RIGHTS | Out-Null; Remove-Item $inf, $db -ErrorAction SilentlyContinue
}
$tous = $mdp.Keys
Faire 'accorder « ouvrir une session en tant que tâche » aux comptes JARVIS' { Droit $tous 'Batch' 'SeBatchLogonRight' }
Faire 'REFUSER la connexion interactive et le bureau à distance aux comptes JARVIS' { Droit $tous 'DenyInteractive' 'SeDenyInteractiveLogonRight'; Droit $tous 'DenyRemote' 'SeDenyRemoteInteractiveLogonRight' }

# 3) Dossiers et ACL NTFS (héritage coupé, droits minimaux).
Faire "créer $RacineSecrets (administrateurs seuls, puis un fichier par espace)" { New-Item -ItemType Directory -Force $RacineSecrets | Out-Null; icacls $RacineSecrets /inheritance:r /grant 'Administrators:(OI)(CI)F' | Out-Null }
Faire 'code : lecture/exécution pour les comptes JARVIS, écriture aux administrateurs' { icacls $RacineCode /inheritance:r /grant 'Administrators:(OI)(CI)F' /grant 'SYSTEM:(OI)(CI)F' | Out-Null; foreach ($c in $tous) { icacls $RacineCode /grant "${c}:(OI)(CI)RX" | Out-Null } }
foreach ($e in $Espaces) {
  $d = Join-Path $RacineDonnees $e
  Faire "dossier $d : service = contrôle total ; agent = écriture sur sorties et échange SEULEMENT" {
    foreach ($s in '', 'sorties', 'echange', 'sauvegardes') { New-Item -ItemType Directory -Force (Join-Path $d $s) | Out-Null }
    icacls $d /inheritance:r /grant 'Administrators:(OI)(CI)F' /grant "jv-${e}:(OI)(CI)F" | Out-Null
    icacls (Join-Path $d 'sorties') /grant "ja-${e}:(OI)(CI)M" | Out-Null
    icacls (Join-Path $d 'echange') /grant "ja-${e}:(OI)(CI)M" | Out-Null
  }
  $secret = Join-Path $RacineSecrets "$e.cmd"
  Faire "secrets de $e (jetons utilisateur/administrateur, clé de sauvegarde) lisibles par jv-$e seulement" {
    $u = MotDePasse; $a = MotDePasse; $k = MotDePasse; $ID = $e.ToUpper()
    @("set JARVIS_ESPACE=$e", "set JARVIS_DONNEES=$RacineDonnees", "set JARVIS_${ID}_TOKEN=$u", "set JARVIS_${ID}_ADMIN_TOKEN=$a", "set JARVIS_${ID}_CLE_SAUVEGARDE=$k", "set JARVIS_${ID}_PORT=$($Ports[$e])", "set JARVIS_CONFINEMENT=echange") | Set-Content $secret -Encoding ASCII
    icacls $secret /inheritance:r /grant 'Administrators:F' /grant "jv-${e}:R" | Out-Null
    Write-Host "  ⚠ jeton ADMINISTRATEUR de $e (à ranger dans un gestionnaire de mots de passe, puis à retirer d'ici si souhaité) : $a"
  }
}

# 4) Pare-feu : sortie ET entrée BLOQUÉES pour chaque compte AGENT (règle par compte, SDDL). Le trafic loopback n'est pas filtré par
#    le pare-feu Windows : risque résiduel documenté (docs/04) — le vérificateur le MESURE.
foreach ($e in $Espaces) { $sid = Sid "ja-$e"; $sddl = "D:(A;;CC;;;$sid)"
  foreach ($dir in 'Outbound', 'Inbound') { Faire "pare-feu : $dir bloqué pour ja-$e" { if (-not (Get-NetFirewallRule -DisplayName "Jarvis agent $e $dir bloqué" -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName "Jarvis agent $e $dir bloqué" -Direction $dir -Action Block -LocalUser $sddl -Profile Any | Out-Null } } }
}

# 5) Tâches planifiées : service (démarrage + redémarrage sur échec), agent (à la demande, 2 min max), sonde de santé, superviseur.
$reglage = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew
foreach ($e in $Espaces) {
  $d = Join-Path $RacineDonnees $e; $sorties = Join-Path $d 'sorties'; $echange = Join-Path $d 'echange\courant'
  Faire "lanceur de service $e + tâche Jarvis-$e (compte jv-$e, démarrage, reprise sur échec)" {
    @('@echo off', "call $RacineSecrets\$e.cmd", "cd /d $RacineCode", """$Node"" --disable-warning=ExperimentalWarning src\demarrer.js >> $d\service.log 2>&1") | Set-Content (Join-Path $RacineCode "lancer-$e.cmd") -Encoding ASCII
    Register-ScheduledTask -TaskName "Jarvis-$e" -Action (New-ScheduledTaskAction -Execute (Join-Path $RacineCode "lancer-$e.cmd")) -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $reglage -User "jv-$e" -Password $mdp["jv-$e"] -RunLevel Limited -Force | Out-Null
  }
  Faire "tâche agent Jarvis-agent-$e (compte ja-$e, à la demande, 2 min max, permissions Node restreintes)" {
    $args = "--permission --allow-fs-read=$RacineCode\src --allow-fs-read=$RacineCode\package.json --allow-fs-read=$d\echange --allow-fs-write=$d\echange --allow-fs-read=$sorties --allow-fs-write=$sorties --max-old-space-size=256 --disable-warning=ExperimentalWarning $RacineCode\src\agents\runner-echange.js $echange"
    $r = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew -StartWhenAvailable
    Register-ScheduledTask -TaskName "Jarvis-agent-$e" -Action (New-ScheduledTaskAction -Execute $Node -Argument $args) -Settings $r -User "ja-$e" -Password $mdp["ja-$e"] -RunLevel Limited -Force | Out-Null
    # le compte de service peut LANCER et ARRÊTER la tâche agent (lecture + exécution), rien d'autre
    $sd = "D:(A;;FA;;;BA)(A;;FA;;;SY)(A;;GRGX;;;$(Sid "jv-$e"))"; $svc = New-Object -ComObject Schedule.Service; $svc.Connect(); $svc.GetFolder('\').GetTask("Jarvis-agent-$e").SetSecurityDescriptor($sd, 0)
  }
  Faire "sonde de santé Jarvis-sante-$e (toutes les 5 minutes)" {
    $a = New-ScheduledTaskAction -Execute $Node -Argument "--disable-warning=ExperimentalWarning $RacineCode\scripts\sante.js" -WorkingDirectory $RacineCode
    Register-ScheduledTask -TaskName "Jarvis-sante-$e" -Action $a -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)) -User "jv-$e" -Password $mdp["jv-$e"] -RunLevel Limited -Force | Out-Null
  }
}

# 6) Alimentation et mises à jour : jamais de veille, redémarrage Windows Update hors heures actives.
Faire 'alimentation : pas de veille ni d’hibernation' { powercfg /change standby-timeout-ac 0; powercfg /change hibernate-timeout-ac 0; powercfg /hibernate off }
Faire 'heures actives Windows Update 07h–22h' { $k = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'; New-Item -Path $k -Force | Out-Null; Set-ItemProperty $k ActiveHoursStart 7; Set-ItemProperty $k ActiveHoursEnd 22 }

Write-Host "`nInstallation terminée$(if ($Simuler) { ' (SIMULATION : rien n’a été modifié)' }). Étape suivante OBLIGATOIRE : .\verifier-isolation.ps1"
