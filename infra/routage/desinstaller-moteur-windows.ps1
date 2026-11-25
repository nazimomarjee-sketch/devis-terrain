<#
.SYNOPSIS
  Désinstalle le moteur routier. SANS -Confirmer : simulation (affiche ce qui serait fait, ne supprime rien).
.PARAMETER Confirmer         Exécute réellement : arrête et supprime les conteneurs, supprime les tâches planifiées.
.PARAMETER SupprimerDonnees  (avec -Confirmer) supprime aussi data, data-new, data-prev, data-echec et vroom-conf (graphe à reconstruire ensuite).
.PARAMETER SupprimerImages   (avec -Confirmer) supprime aussi les images Docker OSRM et VROOM.
Docker Desktop, WSL, Node et le dépôt ne sont jamais désinstallés par ce script.
#>
[CmdletBinding()]
param([switch]$Confirmer, [switch]$SupprimerDonnees, [switch]$SupprimerImages)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_commun.ps1')
Initialize-Journal 'desinstallation'
try {
    $dossiers = @('data', 'data-new', 'data-prev', 'data-echec', 'vroom-conf') | ForEach-Object { Join-Path $script:Racine $_ } | Where-Object { Test-Path $_ }
    if (-not $Confirmer) {
        Write-Journal 'SIMULATION (aucune suppression) :' 'AVERT'
        Write-Journal ' - docker compose down (arrêt et suppression des conteneurs OSRM et VROOM)'
        Write-Journal (' - suppression des tâches planifiées ' + $script:TacheDemarrage + ' et ' + $script:TacheMaj)
        if ($SupprimerDonnees) { $dossiers | ForEach-Object { Write-Journal (' - suppression du dossier ' + $_) } } else { Write-Journal ' - données et graphe CONSERVÉS (ajouter -SupprimerDonnees pour les supprimer)' }
        if ($SupprimerImages) { Write-Journal (' - suppression des images Docker ' + $script:ImageOsrm + ' et VROOM') }
        Stop-Script 0 'Simulation terminée. Relancer avec -Confirmer pour exécuter.'
    }
    if ((Invoke-NativeSilencieux 'docker' @('info')) -eq 0) {
        if ((Invoke-Compose @('down')) -ne 0) { Write-Journal 'docker compose down a échoué.' 'AVERT' } else { Write-Journal 'Conteneurs supprimés.' 'OK' }
        if ($SupprimerImages) { foreach ($i in @($script:ImageOsrm, 'ghcr.io/vroom-project/vroom-docker:v1.14.0')) { $null = Invoke-Native 'docker' @('rmi', $i) } }
    } else { Write-Journal 'Docker ne répond pas : conteneurs non touchés.' 'AVERT' }
    Unregister-Taches
    if ($SupprimerDonnees) { foreach ($d in $dossiers) { Remove-Item -Recurse -Force $d; Write-Journal ('Supprimé : ' + $d) } }
    Stop-Script 0 'Désinstallation terminée.'
} catch { Write-Journal ('Erreur inattendue : ' + $_.Exception.Message) 'ERREUR'; Stop-Script 1 'Désinstallation interrompue.' }
