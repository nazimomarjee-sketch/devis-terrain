# ODICOLOR - moteur routier local (OSRM + VROOM) pour CHARLIE : fonctions communes aux scripts Windows.
# Compatible Windows PowerShell 5.1 (inclus dans Windows 10/11). Ne pas lancer directement : chargé par les autres scripts.
# Aucune donnée client n'est lue ni envoyée : seules des données publiques OpenStreetMap sont téléchargées (une fois, puis à chaque mise à jour).

$script:Racine      = $PSScriptRoot
$script:DataDir     = Join-Path $script:Racine 'data'
$script:LogDir      = Join-Path $script:Racine 'logs'
$script:Compose     = Join-Path $script:Racine 'docker-compose.yml'
$script:VroomConf   = Join-Path $script:Racine 'vroom-conf'
$script:NomPbf      = 'ile-de-france-latest.osm.pbf'
$script:NomGraphe   = 'ile-de-france-latest.osrm'
$script:UrlPbf      = 'https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf'
$script:ImageOsrm   = if ($env:OSRM_IMAGE) { $env:OSRM_IMAGE } else { 'ghcr.io/project-osrm/osrm-backend:v5.27.1' }   # même version que docker-compose.yml
$script:UrlOsrm     = 'http://127.0.0.1:5000'
$script:UrlVroom    = 'http://127.0.0.1:3000'
$script:TacheDemarrage = 'ODICOLOR-Moteur-Routier-Demarrage'
$script:TacheMaj       = 'ODICOLOR-Moteur-Routier-MiseAJour'
$script:TailleMiniPbfOctets = 20MB   # garde-fou contre une page d'erreur téléchargée à la place du fichier ; ce n'est PAS la taille réelle attendue
$script:Journal = $null
$script:Verbeux = $false

# Codes de sortie (identiques pour tous les scripts)
#  0 = succès ; 1 = échec technique ; 2 = prérequis manquant (action de l'utilisateur) ; 3 = redémarrage de Windows nécessaire ;
#  4 = vérification du moteur échouée ; 5 = exposition réseau anormale des ports ; 6 = autre opération déjà en cours

function Initialize-Journal([string]$Nom) {
    if (-not (Test-Path $script:LogDir)) { New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null }
    $script:Journal = Join-Path $script:LogDir ('{0}-{1:yyyyMMdd-HHmmss}.log' -f $Nom, (Get-Date))
    # Conservation : les 30 journaux les plus récents.
    Get-ChildItem -Path $script:LogDir -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force -ErrorAction SilentlyContinue
}
function Write-Journal([string]$Message, [string]$Niveau = 'INFO') {
    $ligne = '{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}' -f (Get-Date), $Niveau, $Message
    if ($script:Journal) { try { Add-Content -Path $script:Journal -Value $ligne -Encoding UTF8 } catch { } }
    switch ($Niveau) {
        'ERREUR' { Write-Host $ligne -ForegroundColor Red }
        'AVERT'  { Write-Host $ligne -ForegroundColor Yellow }
        'OK'     { Write-Host $ligne -ForegroundColor Green }
        'DOCKER' { if ($script:Verbeux) { Write-Host $ligne -ForegroundColor DarkGray } }
        default  { Write-Host $ligne }
    }
}
function Stop-Script([int]$Code, [string]$Message) {
    Exit-Verrou
    if ($Code -eq 0) { Write-Journal $Message 'OK' } else { Write-Journal $Message 'ERREUR' }
    if ($script:Journal) { Write-Host ('Journal : ' + $script:Journal) }
    exit $Code
}

# Exécute une commande native en flux continu ; renvoie son code de sortie. Contourne le piège de Windows PowerShell 5.1
# (stderr d'un programme natif converti en erreur bloquante quand $ErrorActionPreference = 'Stop').
function Invoke-Native([string]$Exe, [string[]]$Arguments) {
    $ancien = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        & $Exe @Arguments 2>&1 | ForEach-Object { $t = "$_"; if ($t.Trim() -and $t -ne 'System.Management.Automation.RemoteException') { Write-Journal $t 'DOCKER' } }
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $ancien }
}
function Invoke-NativeSilencieux([string]$Exe, [string[]]$Arguments) {
    $ancien = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $null = & $Exe @Arguments 2>&1; return $LASTEXITCODE } finally { $ErrorActionPreference = $ancien }
}
function Invoke-Compose([string[]]$Arguments) {
    return (Invoke-Native 'docker' (@('compose', '-f', $script:Compose, '--project-directory', $script:Racine) + $Arguments))
}
function ConvertTo-CheminDocker([string]$Chemin) { return (($Chemin -replace '\\', '/')) }

# ---------- verrou : une seule opération lourde à la fois ----------
function Enter-Verrou {
    $v = Join-Path $script:Racine '.verrou'
    if (Test-Path $v) {
        $age = (Get-Date) - (Get-Item $v).LastWriteTime
        if ($age.TotalHours -lt 6) { Stop-Script 6 ('Une autre opération est en cours (verrou ' + $v + ', ' + [int]$age.TotalMinutes + ' min). Si elle est terminée ou interrompue, supprimer ce fichier.') }
        Write-Journal 'Verrou périmé (plus de 6 h) : ignoré.' 'AVERT'
    }
    Set-Content -Path $v -Value ("{0} PID {1}" -f (Get-Date -Format s), $PID) -Encoding ASCII
    $script:VerrouPris = $true
}
function Exit-Verrou { if ($script:VerrouPris) { Remove-Item -Path (Join-Path $script:Racine '.verrou') -Force -ErrorAction SilentlyContinue; $script:VerrouPris = $false } }

# ---------- prérequis ----------
function Test-Prerequis {
    param([switch]$Confirmer, [int]$EspaceMinGo = 20, [switch]$PourInstallation)
    $v = [Environment]::OSVersion.Version
    if ($v.Major -lt 10 -or ($v.Major -eq 10 -and $v.Build -lt 19041)) { Stop-Script 2 ('Windows 10 version 2004 (build 19041) ou Windows 11 requis (détecté : ' + $v + ') : Docker Desktop avec WSL 2 ne fonctionne pas avant.') }
    if (-not [Environment]::Is64BitOperatingSystem) { Stop-Script 2 'Windows 64 bits requis.' }
    Write-Journal ('Windows ' + $v + ' : compatible.')

    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $docker) {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        $instr = 'Docker Desktop est absent. Installer avec : winget install -e --id Docker.DockerDesktop   (puis redémarrer Windows et relancer ce script). Ou, pour que ce script le fasse : relancer avec -Confirmer dans une fenêtre PowerShell « Exécuter en tant qu''administrateur ».'
        if (-not ($Confirmer -and $PourInstallation -and $winget)) { Stop-Script 2 $instr }
        $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        if (-not $admin) { Stop-Script 2 'L''installation de Docker Desktop demande les droits administrateur : relancer ce script dans PowerShell « Exécuter en tant qu''administrateur » avec -Confirmer.' }
        Write-Journal 'Installation de Docker Desktop (winget, demandée par -Confirmer)…' 'AVERT'
        $codeWsl = Invoke-NativeSilencieux 'wsl.exe' @('--status')
        if ($codeWsl -ne 0) { Write-Journal 'WSL 2 absent : installation (wsl --install --no-distribution).' 'AVERT'; $null = Invoke-Native 'wsl.exe' @('--install', '--no-distribution') }
        $c = Invoke-Native 'winget' @('install', '-e', '--id', 'Docker.DockerDesktop', '--accept-package-agreements', '--accept-source-agreements')
        if ($c -ne 0) { Stop-Script 1 ('winget a échoué (code ' + $c + '). Installer Docker Desktop à la main depuis docker.com puis relancer.') }
        Stop-Script 3 'Docker Desktop installé. REDÉMARRER Windows, ouvrir Docker Desktop une fois (accepter les conditions), puis relancer ce script.'
    }
    if ((Invoke-NativeSilencieux 'docker' @('info')) -ne 0) {
        $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
        if (Test-Path $exe) {
            Write-Journal 'Docker ne répond pas : démarrage de Docker Desktop (attente max. 4 min)…' 'AVERT'
            Start-Process -FilePath $exe | Out-Null
            $fin = (Get-Date).AddMinutes(4)
            while ((Get-Date) -lt $fin -and (Invoke-NativeSilencieux 'docker' @('info')) -ne 0) { Start-Sleep -Seconds 5 }
        }
        if ((Invoke-NativeSilencieux 'docker' @('info')) -ne 0) { Stop-Script 2 'Docker Desktop ne répond pas. L''ouvrir (icône baleine), attendre « Engine running », puis relancer.' }
    }
    $os = (& docker info --format '{{.OSType}}' 2>$null)
    if ($os -ne 'linux') { Stop-Script 2 'Docker est en mode conteneurs Windows : basculer en « conteneurs Linux » (menu Docker Desktop) puis relancer.' }
    if ((Invoke-NativeSilencieux 'docker' @('compose', 'version')) -ne 0) { Stop-Script 2 '« docker compose » indisponible : mettre à jour Docker Desktop.' }
    Write-Journal 'Docker Desktop (conteneurs Linux) opérationnel.' 'OK'

    # Mémoire (avertissement seulement) et disque (bloquant).
    try {
        $ram = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
        if ($ram -lt 8) { Write-Journal ("RAM détectée : $ram Go. Le calcul du graphe de l'Île-de-France peut manquer de mémoire sous 8 Go (seuil indicatif, à mesurer sur cette machine)." ) 'AVERT' } else { Write-Journal ("RAM détectée : $ram Go.") }
    } catch { Write-Journal 'RAM non lisible.' 'AVERT' }
    try {
        $lettre = (Get-Item $script:Racine).PSDrive.Name
        $libre = [math]::Round((Get-PSDrive -Name $lettre).Free / 1GB, 1)
        Write-Journal ("Espace libre sur ${lettre}: $libre Go (minimum exigé : $EspaceMinGo Go, précaution à ajuster).")
        if ($libre -lt $EspaceMinGo) { Stop-Script 2 ("Espace disque insuffisant : $libre Go libres sur ${lettre}:, $EspaceMinGo Go demandés. Libérer de la place ou relancer avec -EspaceMinGo plus bas à vos risques.") }
    } catch { Write-Journal 'Espace disque non lisible.' 'AVERT' }
    # Démarrage de Docker Desktop à l'ouverture de session : lecture best-effort du réglage, jamais modifié.
    try {
        $reglage = Join-Path $env:APPDATA 'Docker\settings-store.json'; if (-not (Test-Path $reglage)) { $reglage = Join-Path $env:APPDATA 'Docker\settings.json' }
        if (Test-Path $reglage) {
            $j = Get-Content $reglage -Raw | ConvertFrom-Json
            $p = $j.PSObject.Properties | Where-Object { $_.Name -ieq 'autoStart' } | Select-Object -First 1
            if ($p -and -not $p.Value) { Write-Journal 'Docker Desktop n''est PAS réglé pour démarrer à l''ouverture de session : activer « Start Docker Desktop when you sign in » (Réglages > General) pour un démarrage automatique du moteur.' 'AVERT' }
            elseif (-not $p) { Write-Journal ('Réglage de démarrage automatique de Docker Desktop non trouvé dans ' + $reglage + ' : non vérifié.') 'AVERT' }
        }
    } catch { Write-Journal 'Réglage de démarrage de Docker Desktop non vérifié.' 'AVERT' }
}

# ---------- téléchargement de l'extrait OSM (reprise après coupure, contrôle MD5 Geofabrik) ----------
function Get-Md5Serveur {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri ($script:UrlPbf + '.md5') -TimeoutSec 60
        $t = $r.Content; if ($t -is [byte[]]) { $t = [Text.Encoding]::ASCII.GetString($t) }
        if ($t -match '^\s*([0-9a-fA-F]{32})') { return $Matches[1].ToLower() }
    } catch { Write-Journal ('Somme MD5 du serveur indisponible (' + $_.Exception.Message + ') : seul le contrôle de taille sera fait.') 'AVERT' }
    return $null
}
function Get-Md5Fichier([string]$Chemin) { return (Get-FileHash -Path $Chemin -Algorithm MD5).Hash.ToLower() }
function Get-ExtraitOsm {
    param([string]$Dossier, [switch]$Remplacer)
    New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
    $pbf = Join-Path $Dossier $script:NomPbf; $part = $pbf + '.part'
    if ((Test-Path $pbf) -and -not $Remplacer) { Write-Journal ('Extrait OSM déjà présent : ' + $pbf + ' (conservé ; la mise à jour se fait avec mettre-a-jour-graphe-windows.ps1).'); return $pbf }
    for ($essai = 1; $essai -le 2; $essai++) {
        $md5 = Get-Md5Serveur
        Write-Journal ('Téléchargement de l''extrait Île-de-France (essai ' + $essai + '/2, reprise automatique si coupure) depuis Geofabrik…')
        $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
        if ($curl) {
            # Boucle de reprise maison (indépendante de la version de curl.exe) : « -C - » reprend le fichier .part là où il s'est arrêté.
            $c = -1
            for ($t = 1; $t -le 10; $t++) {
                $c = Invoke-Native 'curl.exe' @('-fL', '--connect-timeout', '30', '-C', '-', '-o', $part, $script:UrlPbf)
                if ($c -eq 0 -or $c -eq 33) { break }
                Write-Journal ('Téléchargement interrompu (curl code ' + $c + '), reprise dans 15 s (tentative ' + $t + '/10)…') 'AVERT'
                Start-Sleep -Seconds 15
            }
            if ($c -ne 0 -and $c -ne 33) {
                if ($md5 -and (Test-Path $part) -and ((Get-Md5Fichier $part) -eq $md5)) { Write-Journal 'Fichier complet malgré le code de sortie de curl.' }
                else { Stop-Script 1 ('Téléchargement interrompu (curl code ' + $c + ') après 10 tentatives. Relancer le script : le téléchargement reprend là où il s''est arrêté.') }
            }
        } else {
            Write-Journal 'curl.exe absent : téléchargement via BITS (reprise possible).' 'AVERT'
            try { Start-BitsTransfer -Source $script:UrlPbf -Destination $part -ErrorAction Stop } catch { Stop-Script 1 ('Téléchargement BITS échoué : ' + $_.Exception.Message) }
        }
        if (-not (Test-Path $part)) { Stop-Script 1 'Fichier téléchargé introuvable.' }
        $taille = (Get-Item $part).Length
        if ($taille -lt $script:TailleMiniPbfOctets) { Remove-Item $part -Force; Stop-Script 1 ('Fichier téléchargé trop petit (' + $taille + ' octets) : probablement une page d''erreur. Supprimé ; relancer plus tard.') }
        if ($md5) {
            $local = Get-Md5Fichier $part
            if ($local -ne $md5) {
                Write-Journal ('MD5 différent (serveur ' + $md5 + ', local ' + $local + ') : fichier incomplet, corrompu ou renouvelé pendant le téléchargement. Suppression et nouvel essai complet.') 'AVERT'
                Remove-Item $part -Force; continue
            }
            Write-Journal ('MD5 vérifié : ' + $local) 'OK'
        } else { Write-Journal 'MD5 non vérifié (somme du serveur indisponible).' 'AVERT' }
        Move-Item -Force -Path $part -Destination $pbf
        return $pbf
    }
    Stop-Script 1 'Deux téléchargements successifs ont échoué au contrôle MD5. Réessayer plus tard (le serveur met à jour le fichier chaque jour).'
}

# ---------- graphe OSRM ----------
function Clear-Graphe([string]$Dossier) { Get-ChildItem -Path $Dossier -Filter ($script:NomGraphe + '*') -ErrorAction SilentlyContinue | Remove-Item -Force; Remove-Item (Join-Path $Dossier '.graphe-ok.json') -Force -ErrorAction SilentlyContinue }
function Test-GrapheComplet([string]$Dossier) { return ((Test-Path (Join-Path $Dossier '.graphe-ok.json')) -and (Test-Path (Join-Path $Dossier ($script:NomGraphe + '.mldgr')))) }
function Build-Graphe {
    param([string]$Dossier, [switch]$Forcer)
    if (-not $Forcer -and (Test-GrapheComplet $Dossier)) { Write-Journal ('Graphe OSRM déjà construit dans ' + $Dossier + ' : étape ignorée (-Reconstruire pour refaire).'); return }
    $pbf = Join-Path $Dossier $script:NomPbf
    if (-not (Test-Path $pbf)) { Stop-Script 1 ('Extrait OSM absent : ' + $pbf) }
    Clear-Graphe $Dossier
    $vol = (ConvertTo-CheminDocker $Dossier) + ':/data'
    $etapes = @(
        @('osrm-extract', '-p', '/opt/car.lua', ('/data/' + $script:NomPbf)),
        @('osrm-partition', ('/data/' + $script:NomGraphe)),
        @('osrm-customize', ('/data/' + $script:NomGraphe)))
    $debut = Get-Date
    foreach ($e in $etapes) {
        Write-Journal ('Construction du graphe : ' + $e[0] + ' (plusieurs minutes ; durée à mesurer sur cette machine)…')
        $c = Invoke-Native 'docker' (@('run', '--rm', '-v', $vol, $script:ImageOsrm) + $e)
        if ($c -ne 0) {
            Clear-Graphe $Dossier
            $aide = if ($c -eq 137) { ' Code 137 = mémoire insuffisante : dans %UserProfile%\.wslconfig, augmenter « memory=… » (section [wsl2]), faire « wsl --shutdown », relancer Docker Desktop puis ce script.' } else { '' }
            Stop-Script 1 ($e[0] + ' a échoué (code ' + $c + ').' + $aide)
        }
    }
    $info = @{ date = (Get-Date -Format s); image = $script:ImageOsrm; md5Pbf = (Get-Md5Fichier $pbf); octetsPbf = (Get-Item $pbf).Length; dureeMin = [math]::Round(((Get-Date) - $debut).TotalMinutes, 1) }
    Set-Content -Path (Join-Path $Dossier '.graphe-ok.json') -Value ($info | ConvertTo-Json) -Encoding ASCII
    Write-Journal ('Graphe construit en ' + $info.dureeMin + ' min.') 'OK'
}
function Write-ConfigVroom {
    New-Item -ItemType Directory -Force -Path $script:VroomConf | Out-Null
    $contenu = @"
cliArgs:
  geometry: false
  planmode: false
  threads: 4
  explore: 5
  limit_number_jobs: 200
  port: 3000
routingServers:
  car:
    - host: osrm
      port: 5000
"@
    $contenu = ($contenu -replace "`r`n", "`n") + "`n"
    $f = Join-Path $script:VroomConf 'config.yml'
    $actuel = if (Test-Path $f) { [IO.File]::ReadAllText($f) } else { $null }
    if ($actuel -ne $contenu) { [IO.File]::WriteAllText($f, $contenu, (New-Object Text.UTF8Encoding($false))); Write-Journal 'Configuration VROOM écrite.' } else { Write-Journal 'Configuration VROOM déjà à jour.' }
}

# ---------- vérifications du moteur ----------
function Wait-Osrm([string]$Url, [int]$AttenteSec = 180) {
    $fin = (Get-Date).AddSeconds($AttenteSec)
    while ((Get-Date) -lt $fin) {
        try { $r = Invoke-RestMethod -UseBasicParsing -Uri ($Url + '/route/v1/driving/2.2293,48.7155;2.2696,48.7263?overview=false') -TimeoutSec 10; if ($r.code -eq 'Ok') { return $true } } catch { }
        Start-Sleep -Seconds 3
    }
    return $false
}
function Get-DistanceKm($lat1, $lng1, $lat2, $lng2) {
    # Attention : PowerShell ignore la casse des variables ($R et $r seraient la même) : noms distincts.
    $rayonTerre = 6371.0; $versRad = [math]::PI / 180
    $a = [math]::Pow([math]::Sin(($lat2 - $lat1) * $versRad / 2), 2) + [math]::Cos($lat1 * $versRad) * [math]::Cos($lat2 * $versRad) * [math]::Pow([math]::Sin(($lng2 - $lng1) * $versRad / 2), 2)
    return 2 * $rayonTerre * [math]::Asin([math]::Sqrt($a))
}
# Équivalent PowerShell de verifier-moteur.cjs (mêmes points de référence, mêmes seuils de plausibilité). $Vroom = $null : OSRM seul.
function Test-MoteurPS {
    param([string]$Osrm = $script:UrlOsrm, [string]$Vroom = $script:UrlVroom)
    $ok = $true
    $depart = @{ nom = 'Palaiseau'; lat = 48.7155; lng = 2.2293 }
    $refs = @(@{ d = '91'; nom = 'Massy'; lat = 48.7263; lng = 2.2696 }, @{ d = '77'; nom = 'Ozoir-la-Ferrière'; lat = 48.7631; lng = 2.6753 }, @{ d = '95'; nom = 'Le Thillay'; lat = 49.003; lng = 2.4673 },
              @{ d = '94'; nom = 'Créteil'; lat = 48.7845; lng = 2.4523 }, @{ d = '93'; nom = 'Saint-Denis'; lat = 48.9378; lng = 2.3657 }, @{ d = '92'; nom = 'Nanterre'; lat = 48.8974; lng = 2.2018 })
    $pts = @($depart) + $refs
    $coords = ($pts | ForEach-Object { ('{0},{1}' -f $_.lng.ToString([Globalization.CultureInfo]::InvariantCulture), $_.lat.ToString([Globalization.CultureInfo]::InvariantCulture)) }) -join ';'
    try {
        $t = Invoke-RestMethod -UseBasicParsing -Uri ($Osrm.TrimEnd('/') + '/table/v1/driving/' + $coords + '?annotations=duration,distance') -TimeoutSec 30
        if ($t.code -ne 'Ok' -or $t.durations.Count -ne $pts.Count -or $t.distances.Count -ne $pts.Count) { throw 'matrice invalide' }
        Write-Journal ('OSRM répond, matrice ' + $pts.Count + 'x' + $pts.Count + ' valide.') 'OK'
        for ($i = 1; $i -lt $pts.Count; $i++) {
            $d = $t.distances[0][$i] / 1000.0; $h = $t.durations[0][$i] / 3600.0; $v = Get-DistanceKm $depart.lat $depart.lng $pts[$i].lat $pts[$i].lng
            $plausible = ($d -ge $v * 0.95) -and ($d -le $v * 4 + 1) -and ($v -lt 2 -or ($h -gt 0 -and ($d / $h) -ge 15 -and ($d / $h) -le 110))
            $niv = if ($plausible) { 'OK' } else { 'ERREUR' }; if (-not $plausible) { $ok = $false }
            Write-Journal ('Palaiseau -> secteur ' + $pts[$i].d + ' (' + $pts[$i].nom + ') : ' + [math]::Round($d, 1) + ' km, ' + [math]::Round($h * 60) + ' min (vol d''oiseau ' + [math]::Round($v, 1) + ' km)') $niv
        }
    } catch { Write-Journal ('OSRM : ' + $_.Exception.Message) 'ERREUR'; $ok = $false }
    if ($Vroom) {
        try {
            $corps = '{"vehicles":[{"id":1,"start":[2.2293,48.7155],"end":[2.2293,48.7155],"time_window":[28800,61200]}],"jobs":[{"id":1,"location":[2.2696,48.7263],"service":1800},{"id":2,"location":[2.4523,48.7845],"service":1800}]}'
            $r = Invoke-RestMethod -UseBasicParsing -Method Post -Uri ($Vroom.TrimEnd('/') + '/') -ContentType 'application/json' -Body $corps -TimeoutSec 60
            if ($r.code -ne 0 -or $r.routes.Count -ne 1 -or $r.unassigned.Count -ne 0) { throw 'réponse VROOM inattendue' }
            Write-Journal ('VROOM répond : tournée de 2 visites calculée (' + $r.routes[0].steps.Count + ' étapes).') 'OK'
        } catch { Write-Journal ('VROOM : ' + $_.Exception.Message) 'ERREUR'; $ok = $false }
    }
    return $ok
}
# Préfère verifier-moteur.cjs (contrôle complet par le contrôleur de CHARLIE) ; sinon équivalent PowerShell.
function Test-Moteur {
    $node = Get-Command node -ErrorAction SilentlyContinue
    $script_ = Join-Path $script:Racine 'verifier-moteur.cjs'
    if ($node -and (Test-Path $script_) -and (Test-Path (Join-Path (Split-Path (Split-Path $script:Racine)) 'charlie-optimiseur-v50.js'))) {
        Write-Journal 'Vérification par verifier-moteur.cjs (Node)…'
        $c = Invoke-Native $node.Source @($script_, $script:UrlOsrm, $script:UrlVroom)
        return ($c -eq 0)
    }
    Write-Journal 'Node.js ou dépôt complet absents : vérification par l''équivalent PowerShell.' 'AVERT'
    return (Test-MoteurPS -Osrm $script:UrlOsrm -Vroom $script:UrlVroom)
}
# Les ports ne doivent écouter que sur la machine (127.0.0.1) : contrôle best-effort.
function Test-Exposition {
    try {
        $mauvais = Get-NetTCPConnection -State Listen -LocalPort 5000, 3000 -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -in @('0.0.0.0', '::') }
        if ($mauvais) { Write-Journal ('Ports écoutant sur toutes les interfaces : ' + (($mauvais | ForEach-Object { $_.LocalPort }) -join ', ') + '. Vérifier docker-compose.yml (127.0.0.1:...).') 'ERREUR'; return $false }
        Write-Journal 'Ports 5000 et 3000 : écoute locale uniquement (127.0.0.1).' 'OK'
    } catch { Write-Journal 'Exposition des ports non vérifiée (Get-NetTCPConnection indisponible).' 'AVERT' }
    return $true
}

# ---------- tâches planifiées ----------
function Register-TacheDemarrage {
    $script_ = Join-Path $script:Racine 'demarrer-moteur-windows.ps1'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script_ + '"') -WorkingDirectory $script:Racine
    $decl = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name); $decl.Delay = 'PT1M'
    $reg = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    Register-ScheduledTask -TaskName $script:TacheDemarrage -Action $action -Trigger $decl -Settings $reg -Description 'Démarre le moteur routier ODICOLOR (OSRM + VROOM) à l''ouverture de session.' -Force | Out-Null
    Write-Journal ('Tâche planifiée « ' + $script:TacheDemarrage + ' » enregistrée (ouverture de session, utilisateur courant, sans droits administrateur).') 'OK'
}
function Register-TacheMiseAJour {
    $script_ = Join-Path $script:Racine 'mettre-a-jour-graphe-windows.ps1'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script_ + '"') -WorkingDirectory $script:Racine
    $decl = New-ScheduledTaskTrigger -Weekly -WeeksInterval 4 -DaysOfWeek Sunday -At 3:00am
    $reg = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden -ExecutionTimeLimit (New-TimeSpan -Hours 6)
    Register-ScheduledTask -TaskName $script:TacheMaj -Action $action -Trigger $decl -Settings $reg -Description 'Met à jour le graphe routier ODICOLOR toutes les 4 semaines (dimanche 3 h, ou au prochain démarrage).' -Force | Out-Null
    Write-Journal ('Tâche planifiée « ' + $script:TacheMaj + ' » enregistrée (toutes les 4 semaines, dimanche 3 h ; rattrapage au prochain démarrage si PC éteint).') 'OK'
}
function Unregister-Taches {
    foreach ($t in @($script:TacheDemarrage, $script:TacheMaj)) {
        if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $t -Confirm:$false; Write-Journal ('Tâche « ' + $t + ' » supprimée.') }
    }
}
