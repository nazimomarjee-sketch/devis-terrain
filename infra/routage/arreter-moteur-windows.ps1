<#
.SYNOPSIS  Arrête le moteur routier (les données et le graphe sont conservés). Redémarrage : demarrer-moteur-windows.ps1.
.PARAMETER Desactiver  Désactive aussi le démarrage automatique et la mise à jour planifiée (tâches conservées, désactivées).
#>
[CmdletBinding()]
param([switch]$Desactiver)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_commun.ps1')
Initialize-Journal 'arret'
try {
    if ((Invoke-NativeSilencieux 'docker' @('info')) -ne 0) { Write-Journal 'Docker ne répond pas : les conteneurs sont déjà arrêtés.' 'AVERT' }
    elseif ((Invoke-Compose @('stop')) -ne 0) { Stop-Script 1 'docker compose stop a échoué.' }
    else { Write-Journal 'Moteur arrêté (conteneurs conservés, graphe intact).' 'OK' }
    if ($Desactiver) {
        foreach ($t in @($script:TacheDemarrage, $script:TacheMaj)) { if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Disable-ScheduledTask -TaskName $t | Out-Null; Write-Journal ('Tâche « ' + $t + ' » désactivée.') } }
    } else { Write-Journal 'Le moteur redémarrera à la prochaine ouverture de session (tâche planifiée). Utiliser -Desactiver pour l''empêcher.' }
    Stop-Script 0 'Terminé.'
} catch { Write-Journal ('Erreur inattendue : ' + $_.Exception.Message) 'ERREUR'; Stop-Script 1 'Arrêt interrompu.' }
