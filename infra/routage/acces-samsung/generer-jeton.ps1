<#
.SYNOPSIS  Crée acces-samsung\.env à partir de .env.exemple avec un jeton aléatoire cryptographique (32 octets). N'écrase JAMAIS un .env existant.
.PARAMETER Hote       Nom MagicDNS Tailscale du PC.
.PARAMETER Ip         Adresse Tailscale du PC (100.x.y.z).
.PARAMETER OriginePwa Origine HTTPS exacte de la PWA, sans « / » final.
Le jeton n'est écrit que dans .env (ignoré par git) et affiché une fois à l'écran pour être saisi dans les réglages du Samsung.
#>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Hote, [Parameter(Mandatory)][string]$Ip, [Parameter(Mandatory)][string]$OriginePwa)
$ErrorActionPreference = 'Stop'
$env_ = Join-Path $PSScriptRoot '.env'
if (Test-Path $env_) { Write-Host '.env existe déjà : rien modifié (supprimer le fichier pour régénérer le jeton).' -ForegroundColor Yellow; exit 0 }
if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Write-Host 'Adresse IP invalide.' -ForegroundColor Red; exit 2 }
if ($OriginePwa -notmatch '^https://[^/\s]+$') { Write-Host 'Origine invalide : https://domaine sans « / » final.' -ForegroundColor Red; exit 2 }
$octets = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($octets); $rng.Dispose()
$jeton = ([Convert]::ToBase64String($octets)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$contenu = "MOTEUR_HOTE=$Hote`nMOTEUR_IP=$Ip`nORIGINE_PWA=$OriginePwa`nMOTEUR_JETON=$jeton`n"
[IO.File]::WriteAllText($env_, $contenu, (New-Object Text.UTF8Encoding($false)))
Write-Host ".env créé : $env_"
Write-Host "Dans ODICOLOR > Ma tournée > Réglages :"
Write-Host "  OSRM  = https://$Hote/$jeton/osrm"
Write-Host "  VROOM = https://$Hote/$jeton/vroom"
exit 0
