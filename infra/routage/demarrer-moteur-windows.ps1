<# Démarre le moteur routier (utilisé par la tâche planifiée d'ouverture de session ; peut aussi être lancé à la main). Idempotent. #>
[CmdletBinding()]
param([switch]$Verbeux)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_commun.ps1')
$script:Verbeux = [bool]$Verbeux
Initialize-Journal 'demarrage'
try {
    if (-not (Test-GrapheComplet $script:DataDir)) { Stop-Script 2 'Graphe OSRM absent : lancer d''abord installer-moteur-windows.ps1.' }
    Test-Prerequis -EspaceMinGo 1
    if ((Invoke-Compose @('up', '-d')) -ne 0) { Stop-Script 1 'docker compose up -d a échoué.' }
    if (-not (Wait-Osrm $script:UrlOsrm 180)) { Stop-Script 4 'OSRM ne répond pas après 3 min.' }
    if (-not (Test-Exposition)) { Stop-Script 5 'Ports exposés au-delà de la machine.' }
    Stop-Script 0 'Moteur routier démarré.'
} catch { Write-Journal ('Erreur inattendue : ' + $_.Exception.Message) 'ERREUR'; Stop-Script 1 'Démarrage interrompu.' }
