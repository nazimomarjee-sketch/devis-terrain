<#
.SYNOPSIS  Exercice de REPRISE : tue brutalement le service d'un espace pendant qu'il traite des missions, mesure le délai de reprise
           et vérifie qu'aucune mission n'est exécutée ni envoyée deux fois.
.NOTES     ⚠ NON EXÉCUTÉ (essais W6/W7/W14 du plan docs/09). Données FICTIVES uniquement.
#>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Espace, [Parameter(Mandatory)][string]$Jeton, [int]$Port = 8160, [int]$Missions = 10, [int]$DelaiMaxS = 120)
$h = @{ Authorization = "Bearer $Jeton" }; $base = "http://127.0.0.1:$Port"; $ErrorActionPreference = 'Stop'
1..$Missions | ForEach-Object { Invoke-RestMethod -Method Post -Uri "$base/api/missions" -Headers $h -ContentType 'application/json' -Body (@{ demande = 'analyse financière'; cle = "exercice-$_-$(Get-Date -Format o)" } | ConvertTo-Json) | Out-Null }
$cible = (Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'demarrer.js' } | Select-Object -First 1)
if (-not $cible) { throw 'processus du service introuvable' }
$t0 = Get-Date; Stop-Process -Id $cible.ProcessId -Force; Write-Host "Service tué (PID $($cible.ProcessId))."
$repris = $false; while (((Get-Date) - $t0).TotalSeconds -lt $DelaiMaxS) { try { $s = Invoke-RestMethod -Uri "$base/api/sante" -TimeoutSec 2; if ($null -ne $s.battement_age_s -and $s.battement_age_s -lt 10) { $repris = $true; break } } catch { }; Start-Sleep 1 }
if (-not $repris) { Write-Host "ÉCHEC : pas de reprise en $DelaiMaxS s (voir tâche Jarvis-$Espace et superviseur)." -ForegroundColor Red; exit 1 }
Write-Host ("Reprise en {0:N0} s." -f ((Get-Date) - $t0).TotalSeconds)
$fin = (Get-Date).AddSeconds($DelaiMaxS); do { $e = Invoke-RestMethod -Uri "$base/api/etat" -Headers $h; $en = ($e.missions | Where-Object { $_.statut -in 'EN_FILE', 'EN_COURS', 'A_CORRIGER' }).Count; Start-Sleep 2 } while ($en -gt 0 -and (Get-Date) -lt $fin)
$doubles = $e.missions | Where-Object { $_.id } | Group-Object id | Where-Object Count -gt 1
Write-Host "Missions encore en cours : $en ; doublons d'identifiant : $($doubles.Count) ; alertes critiques : $(($e.alertes | Where-Object niveau -eq 'critique').Count)"
if ($en -gt 0 -or $doubles) { exit 1 } else { Write-Host 'REPRISE VALIDÉE (à confirmer par npm run sante : journal intact, traçabilité complète).' -ForegroundColor Green }
