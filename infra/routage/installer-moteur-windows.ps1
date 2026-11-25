<#
.SYNOPSIS
  Installe et démarre le moteur routier local OSRM + VROOM (Île-de-France) pour CHARLIE. Idempotent : peut être relancé sans risque.
.DESCRIPTION
  Étapes : prérequis (Windows, Docker Desktop) -> extrait OSM Geofabrik (reprise, MD5) -> graphe OSRM -> docker compose up -d
  -> démarrage automatique à l'ouverture de session -> vérification (verifier-moteur.cjs ou équivalent PowerShell).
  Rien n'est installé sans -Confirmer. Aucune donnée client n'est utilisée. Ports liés à 127.0.0.1 uniquement.
.PARAMETER Confirmer      Autorise l'installation de WSL 2 / Docker Desktop (winget) s'ils manquent. PowerShell en administrateur requis dans ce cas.
.PARAMETER Reconstruire   Refait le graphe OSRM même s'il existe.
.PARAMETER SansDemarrageAuto  Ne crée pas la tâche planifiée de démarrage à l'ouverture de session.
.PARAMETER SansVerification   Saute la vérification finale.
.PARAMETER EspaceMinGo    Espace disque libre minimal exigé (défaut 20 Go : précaution, à ajuster après mesure).
.PARAMETER Verbeux        Affiche aussi la sortie détaillée de Docker (toujours écrite dans le journal).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installer-moteur-windows.ps1
#>
[CmdletBinding()]
param([switch]$Confirmer, [switch]$Reconstruire, [switch]$SansDemarrageAuto, [switch]$SansVerification, [int]$EspaceMinGo = 20, [switch]$Verbeux)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_commun.ps1')
$script:Verbeux = [bool]$Verbeux
Initialize-Journal 'installation'
Write-Journal 'Installation du moteur routier ODICOLOR (OSRM + VROOM, Île-de-France, départ Massy-Palaiseau).'
$verrouPris = $false
try {
    Enter-Verrou; $verrouPris = $true
    Test-Prerequis -Confirmer:$Confirmer -EspaceMinGo $EspaceMinGo -PourInstallation
    $null = Get-ExtraitOsm -Dossier $script:DataDir
    Build-Graphe -Dossier $script:DataDir -Forcer:$Reconstruire
    Write-ConfigVroom
    Write-Journal 'Téléchargement des images Docker (OSRM, VROOM)…'
    if ((Invoke-Compose @('pull')) -ne 0) { Stop-Script 1 'Téléchargement des images Docker impossible (réseau, ghcr.io bloqué ?). Relancer plus tard.' }
    Write-Journal 'Démarrage des services…'
    if ((Invoke-Compose @('up', '-d')) -ne 0) { Stop-Script 1 'docker compose up -d a échoué (voir le journal).' }
    Write-Journal 'Attente du chargement du graphe par OSRM (jusqu''à 3 min ; durée à mesurer)…'
    if (-not (Wait-Osrm $script:UrlOsrm 180)) { Stop-Script 4 'OSRM ne répond pas après 3 min. Voir : docker compose -f infra/routage/docker-compose.yml logs osrm (mémoire insuffisante possible).' }
    if (-not (Test-Exposition)) { Stop-Script 5 'Ports exposés au-delà de la machine : arrêt par sécurité (arreter-moteur-windows.ps1).' }
    if (-not $SansDemarrageAuto) { Register-TacheDemarrage } else { Write-Journal 'Démarrage automatique non configuré (-SansDemarrageAuto).' 'AVERT' }
    if (-not $SansVerification) {
        if (-not (Test-Moteur)) { Stop-Script 4 'Vérification du moteur ÉCHOUÉE : ne pas utiliser ce moteur pour les tournées. Voir le journal.' }
    } else { Write-Journal 'Vérification sautée (-SansVerification).' 'AVERT' }
    Write-Journal 'Pour CHARLIE (Samsung) : voir acces-samsung\ et docs\ROUTAGE_IDF_WINDOWS.md (accès HTTPS privé). Mise à jour mensuelle : mettre-a-jour-graphe-windows.ps1 -Planifier.' 
    Stop-Script 0 'Moteur routier installé, démarré et vérifié. Les temps restent des estimations (trafic temps réel non garanti).'
} catch {
    Write-Journal ('Erreur inattendue : ' + $_.Exception.Message) 'ERREUR'
    Write-Journal ($_.ScriptStackTrace) 'ERREUR'
    Stop-Script 1 'Installation interrompue. Relancer le script : les étapes déjà faites sont ignorées.'
} finally { if ($verrouPris) { Exit-Verrou } }
