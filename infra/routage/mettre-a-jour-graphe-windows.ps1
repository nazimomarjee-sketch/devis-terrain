<#
.SYNOPSIS
  Met à jour le graphe routier (extrait OSM du jour) SANS coupure longue : le nouveau graphe est construit à côté, validé sur un
  OSRM temporaire (port 5001), puis échangé en quelques secondes. L'ancien graphe est conservé (data-prev) pour un retour arrière
  automatique si la vérification après échange échoue.
.PARAMETER Forcer       Reconstruit même si l'extrait du serveur est identique à celui déjà installé.
.PARAMETER Planifier    Crée la tâche planifiée « toutes les 4 semaines » (dimanche 3 h) puis s'arrête sans mettre à jour.
.PARAMETER Deplanifier  Supprime cette tâche planifiée.
.PARAMETER EspaceMinGo  Espace libre minimal (défaut 25 Go : trois graphes coexistent brièvement ; précaution à mesurer).
#>
[CmdletBinding()]
param([switch]$Forcer, [switch]$Planifier, [switch]$Deplanifier, [int]$EspaceMinGo = 25, [switch]$Verbeux)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_commun.ps1')
$script:Verbeux = [bool]$Verbeux
Initialize-Journal 'mise-a-jour'
$dataNew = Join-Path $script:Racine 'data-new'; $dataPrev = Join-Path $script:Racine 'data-prev'; $dataEchec = Join-Path $script:Racine 'data-echec'
$nomTest = 'odicolor-osrm-validation'; $portTest = 5001
try {
    if ($Planifier) { Register-TacheMiseAJour; Stop-Script 0 'Mise à jour planifiée.' }
    if ($Deplanifier) { if (Get-ScheduledTask -TaskName $script:TacheMaj -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $script:TacheMaj -Confirm:$false }; Stop-Script 0 'Mise à jour planifiée supprimée.' }
    if (-not (Test-GrapheComplet $script:DataDir)) { Stop-Script 2 'Aucun graphe installé : lancer d''abord installer-moteur-windows.ps1.' }
    Enter-Verrou
    Test-Prerequis -EspaceMinGo $EspaceMinGo

    $actuel = Get-Content (Join-Path $script:DataDir '.graphe-ok.json') -Raw | ConvertFrom-Json
    $md5Serveur = Get-Md5Serveur
    if ($md5Serveur -and $actuel.md5Pbf -eq $md5Serveur -and -not $Forcer) { Stop-Script 0 'Le graphe installé correspond déjà à l''extrait du serveur : rien à faire (-Forcer pour reconstruire).' }

    # 1. Construction à côté (le service continue de répondre avec l'ancien graphe)
    if (Test-Path $dataNew) { Remove-Item -Recurse -Force $dataNew }
    $null = Get-ExtraitOsm -Dossier $dataNew -Remplacer
    Build-Graphe -Dossier $dataNew -Forcer

    # 2. Validation sur un OSRM temporaire, avant tout échange
    $null = Invoke-NativeSilencieux 'docker' @('rm', '-f', $nomTest)
    $c = Invoke-Native 'docker' @('run', '-d', '--rm', '--name', $nomTest, '-p', ('127.0.0.1:{0}:5000' -f $portTest), '-v', ((ConvertTo-CheminDocker $dataNew) + ':/data:ro'), $script:ImageOsrm, 'osrm-routed', '--algorithm', 'mld', ('/data/' + $script:NomGraphe))
    if ($c -ne 0) { Stop-Script 1 'Impossible de démarrer l''OSRM de validation.' }
    $valide = $false
    try { $urlTest = 'http://127.0.0.1:' + $portTest; $valide = (Wait-Osrm $urlTest 180) -and (Test-MoteurPS -Osrm $urlTest -Vroom $null) }
    finally { $null = Invoke-NativeSilencieux 'docker' @('rm', '-f', $nomTest) }
    if (-not $valide) { Remove-Item -Recurse -Force $dataNew -ErrorAction SilentlyContinue; Stop-Script 4 'Le nouveau graphe n''a pas passé la validation : ancien graphe conservé, aucun changement.' }

    # 3. Échange (coupure = arrêt + redémarrage d'OSRM seulement)
    $chrono = [Diagnostics.Stopwatch]::StartNew()
    Write-Journal 'Échange des graphes…'
    if ((Invoke-Compose @('stop', 'osrm')) -ne 0) { Stop-Script 1 'Arrêt d''OSRM impossible.' }
    if (Test-Path $dataPrev) { Remove-Item -Recurse -Force $dataPrev }
    Rename-Item -Path $script:DataDir -NewName 'data-prev'
    Rename-Item -Path $dataNew -NewName 'data'
    $null = Invoke-Compose @('up', '-d', '--force-recreate', 'osrm')
    $apres = (Wait-Osrm $script:UrlOsrm 180)
    if ($apres) { $null = Invoke-Compose @('restart', 'vroom'); $apres = Test-Moteur }
    $chrono.Stop()
    if (-not $apres) {
        Write-Journal 'Vérification après échange ÉCHOUÉE : retour arrière automatique.' 'ERREUR'
        $null = Invoke-Compose @('stop', 'osrm')
        if (Test-Path $dataEchec) { Remove-Item -Recurse -Force $dataEchec }
        Rename-Item -Path $script:DataDir -NewName 'data-echec'
        Rename-Item -Path $dataPrev -NewName 'data'
        $null = Invoke-Compose @('up', '-d', '--force-recreate', 'osrm')
        $ok = Wait-Osrm $script:UrlOsrm 180; if ($ok) { $null = Invoke-Compose @('restart', 'vroom') }
        Stop-Script 4 ('Retour à l''ancien graphe ' + $(if ($ok) { 'réussi' } else { 'EN ÉCHEC : intervention manuelle nécessaire (voir docs\ROUTAGE_IDF_WINDOWS.md)' }) + '. Le graphe refusé est dans data-echec.')
    }
    Write-Journal ('Mise à jour réussie. Coupure d''OSRM : environ ' + [math]::Round($chrono.Elapsed.TotalSeconds) + ' s (mesurée ici).') 'OK'
    Stop-Script 0 'Graphe mis à jour. L''ancien est conservé dans data-prev (un seul niveau de retour arrière).'
} catch { Write-Journal ('Erreur inattendue : ' + $_.Exception.Message) 'ERREUR'; Write-Journal $_.ScriptStackTrace 'ERREUR'; Stop-Script 1 'Mise à jour interrompue : l''ancien graphe est resté en service sauf mention contraire ci-dessus.' }
