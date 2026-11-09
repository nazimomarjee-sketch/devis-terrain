#requires -RunAsAdministrator
<# .SYNOPSIS  Retire tâches, règles de pare-feu et (option) comptes JARVIS. Les DONNÉES ne sont jamais supprimées sans -SupprimerDonnees ET confirmation.  ⚠ NON EXÉCUTÉ. #>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param([string[]]$Espaces = @('perso', 'odicolor', 'cockpit'), [string]$RacineDonnees = 'C:\jarvis-data', [switch]$SupprimerComptes, [switch]$SupprimerDonnees)
foreach ($e in $Espaces) {
  foreach ($t in "Jarvis-$e", "Jarvis-agent-$e", "Jarvis-sante-$e") { if ($PSCmdlet.ShouldProcess($t, 'Supprimer la tâche planifiée')) { Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue } }
  foreach ($d in 'Outbound', 'Inbound') { if ($PSCmdlet.ShouldProcess("règle pare-feu $e $d", 'Supprimer')) { Remove-NetFirewallRule -DisplayName "Jarvis agent $e $d bloqué" -ErrorAction SilentlyContinue } }
  if ($SupprimerComptes) { foreach ($c in "jv-$e", "ja-$e") { if ($PSCmdlet.ShouldProcess($c, 'Supprimer le compte')) { Remove-LocalUser -Name $c -ErrorAction SilentlyContinue } } }
  if ($SupprimerDonnees -and $PSCmdlet.ShouldProcess("$RacineDonnees\$e", 'SUPPRIMER DÉFINITIVEMENT LES DONNÉES (sauvegardes comprises)')) { Remove-Item -Recurse -Force "$RacineDonnees\$e" }
}
