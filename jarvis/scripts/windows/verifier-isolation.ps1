#requires -RunAsAdministrator
<#
.SYNOPSIS  VÉRIFIE l'isolation en tentant réellement des accès interdits SOUS chaque compte (tâche planifiée éphémère). Code de sortie 1 si un
           accès interdit réussit. C'est l'ARBITRE : tant qu'il n'a pas passé sur la machine cible, aucune donnée réelle ne doit y entrer.
.NOTES     ⚠ NON EXÉCUTÉ (aucun Windows disponible lors de l'écriture). Les sondes « INFO » mesurent des risques résiduels connus.
#>
[CmdletBinding()]
param([string]$RacineDonnees = 'C:\jarvis-data', [string]$RacineSecrets = 'C:\jarvis-secrets', [string[]]$Espaces = @('perso', 'odicolor', 'cockpit'),
      [string]$Sortie = 'C:\jarvis-verif', [hashtable]$Ports = @{ perso = 8170; odicolor = 8160; cockpit = 8180 }, [hashtable]$MotsDePasse)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Sortie | Out-Null; icacls $Sortie /grant 'Users:(OI)(CI)M' | Out-Null
$resultats = @()

# Exécute une commande cmd SOUS un compte (tâche éphémère) et retourne sa sortie + son code.
function SousCompte([string]$compte, [string]$cmd) {
  if (-not $MotsDePasse.ContainsKey($compte)) { throw "mot de passe de $compte requis dans -MotsDePasse (réinitialiser le compte si nécessaire)" }
  $id = [guid]::NewGuid().ToString('N').Substring(0, 8); $fichier = Join-Path $Sortie "$id.txt"; $nom = "Jarvis-verif-$id"
  $a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c ($cmd) > `"$fichier`" 2>&1 & echo CODE=%ERRORLEVEL% >> `"$fichier`""
  Register-ScheduledTask -TaskName $nom -Action $a -User $compte -Password $MotsDePasse[$compte] -RunLevel Limited -Force | Out-Null
  Start-ScheduledTask -TaskName $nom; $t = 0; while ((-not (Test-Path $fichier) -or -not (Select-String -Path $fichier -Pattern '^CODE=' -Quiet)) -and $t -lt 60) { Start-Sleep 1; $t++ }
  Unregister-ScheduledTask -TaskName $nom -Confirm:$false
  if (Test-Path $fichier) { Get-Content $fichier -Raw } else { 'AUCUNE SORTIE (délai)' }
}
function Sonde([string]$nom, [string]$compte, [string]$cmd, [string]$attendu, [string]$gravite = 'ECHEC') {
  $sortie = SousCompte $compte $cmd; $refuse = $sortie -match 'Access is denied|Accès refusé|Le chemin d.accès spécifié est introuvable|timed out|TcpTestSucceeded\s*:\s*False|FAILED|CODE=[1-9]'
  $ok = if ($attendu -eq 'REFUSE') { $refuse } else { -not $refuse }
  $script:resultats += [pscustomobject]@{ sonde = $nom; compte = $compte; attendu = $attendu; ok = $ok; gravite = $gravite; extrait = ($sortie -replace '\s+', ' ').Substring(0, [Math]::Min(120, ($sortie -replace '\s+', ' ').Length)) }
  Write-Host ("{0} {1} [{2}]" -f $(if ($ok) { 'OK    ' } else { $gravite }), $nom, $compte)
}

foreach ($e in $Espaces) {
  $autres = $Espaces | Where-Object { $_ -ne $e }
  foreach ($x in $autres) {
    Sonde "agent $e lit la base de $x" "ja-$e" "type $RacineDonnees\$x\jarvis.sqlite" 'REFUSE'
    Sonde "agent $e liste le dossier de $x" "ja-$e" "dir $RacineDonnees\$x" 'REFUSE'
    Sonde "agent $e écrit dans les sorties de $x" "ja-$e" "echo x > $RacineDonnees\$x\sorties\intrus.txt" 'REFUSE'
    Sonde "service $e lit la base de $x" "jv-$e" "type $RacineDonnees\$x\jarvis.sqlite" 'REFUSE'
    Sonde "service $e lit les secrets de $x" "jv-$e" "type $RacineSecrets\$x.cmd" 'REFUSE'
  }
  Sonde "agent $e lit SA base" "ja-$e" "type $RacineDonnees\$e\jarvis.sqlite" 'REFUSE'
  Sonde "agent $e lit SES secrets" "ja-$e" "type $RacineSecrets\$e.cmd" 'REFUSE'
  Sonde "agent $e écrit dans SES sorties (doit marcher)" "ja-$e" "echo ok > $RacineDonnees\$e\sorties\sonde.txt" 'AUTORISE'
  Sonde "service $e écrit dans ses sorties (doit marcher)" "jv-$e" "echo ok > $RacineDonnees\$e\sorties\service.txt" 'AUTORISE'
  Sonde "agent $e sort sur Internet (TCP 443)" "ja-$e" "powershell -NoProfile -Command ""(Test-NetConnection 1.1.1.1 -Port 443 -WarningAction SilentlyContinue).TcpTestSucceeded""" 'REFUSE'
  Sonde "agent $e tue le service de $e" "ja-$e" "taskkill /F /IM node.exe /FI ""USERNAME eq jv-$e""" 'REFUSE'
  Sonde "agent $e démarre une tâche de service" "ja-$e" "schtasks /Run /TN Jarvis-$e" 'REFUSE'
  Sonde "agent $e lance une tâche agent d'un autre espace" "ja-$e" "schtasks /Run /TN Jarvis-agent-$($autres[0])" 'REFUSE'
  # Risque résiduel CONNU : le trafic loopback n'est pas filtré par le pare-feu Windows (INFO : mesuré, pas bloquant).
  Sonde "agent $e joint le service local (loopback) — risque résiduel" "ja-$e" "powershell -NoProfile -Command ""(Test-NetConnection 127.0.0.1 -Port $($Ports[$e]) -WarningAction SilentlyContinue).TcpTestSucceeded""" 'REFUSE' 'INFO'
}
$resultats | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $Sortie 'rapport-isolation.json') -Encoding UTF8
$echecs = $resultats | Where-Object { -not $_.ok -and $_.gravite -eq 'ECHEC' }
Write-Host "`n$($resultats.Count) sondes, $($echecs.Count) ÉCHEC(S) bloquant(s). Rapport : $Sortie\rapport-isolation.json"
if ($echecs) { Write-Host 'ISOLATION NON VALIDÉE : aucune donnée réelle sur cette machine.' -ForegroundColor Red; exit 1 } else { Write-Host 'Isolation validée pour les sondes bloquantes (revoir les INFO).' -ForegroundColor Green; exit 0 }
