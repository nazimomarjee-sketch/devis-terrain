// ANALYSE STATIQUE des scripts Windows. ⚠ Ce n'est PAS une validation : aucun PowerShell ni Windows n'est disponible ici.
// Elle vérifie seulement l'absence de motifs dangereux et la présence des garde-fous prévus. L'arbitre est verifier-isolation.ps1 sur la machine cible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './aide.js';

const DOSSIER = join(RACINE, 'scripts', 'windows');
const lire = (f) => readFileSync(join(DOSSIER, f), 'utf8');
const scripts = readdirSync(DOSSIER).filter((f) => f.endsWith('.ps1'));

test('tous les scripts Windows portent l’avertissement « NON EXÉCUTÉ » et aucun motif dangereux (iex, ExecutionPolicy Bypass, mot de passe en clair, téléchargement distant)', () => {
  assert.deepEqual(scripts.sort(), ['desinstaller.ps1', 'exercice-reprise.ps1', 'installer.ps1', 'verifier-isolation.ps1']);
  for (const f of scripts) {
    const s = lire(f); assert.match(s, /NON EXÉCUTÉ/, `${f} : avertissement absent`);
    for (const [motif, nom] of [[/\bInvoke-Expression\b|\biex\b/i, 'Invoke-Expression'], [/Set-ExecutionPolicy/i, 'Set-ExecutionPolicy'], [/-ExecutionPolicy\s+Bypass/i, 'ExecutionPolicy Bypass'], [/DownloadString|DownloadFile|Invoke-WebRequest|\biwr\b|\bcurl\b|Start-BitsTransfer/i, 'téléchargement'], [/-Password\s+['"][^$'"]{4,}['"]/i, 'mot de passe en clair'], [/ConvertTo-SecureString\s+['"][^$]/i, 'mot de passe littéral'], [/Add-LocalGroupMember[^\n]*Administrators/i, 'ajout à Administrators'], [/-RunLevel\s+Highest/i, 'RunLevel Highest']]) assert.ok(!motif.test(s), `${f} : motif interdit « ${nom} »`);
  }
});

test('installer.ps1 : garde-fous attendus (admin, simulation, entropie cryptographique, héritage coupé, pare-feu par compte, droits de connexion, BitLocker, version de Node)', () => {
  const s = lire('installer.ps1');
  for (const [motif, nom] of [[/#requires -RunAsAdministrator/, 'exige administrateur'], [/\[switch\]\$Simuler/, 'mode simulation'], [/RandomNumberGenerator/, 'secrets cryptographiques'], [/\/inheritance:r/, 'héritage NTFS coupé'], [/New-NetFirewallRule[^\n]*-LocalUser/, 'pare-feu par compte (SDDL)'],
    [/SeDenyInteractiveLogonRight/, 'connexion interactive refusée'], [/SeDenyRemoteInteractiveLogonRight/, 'bureau à distance refusé'], [/SeBatchLogonRight/, 'ouverture de session par lot'], [/Get-BitLockerVolume/, 'contrôle BitLocker'], [/22\.13/, 'version minimale de Node'],
    [/-RunLevel Limited/, 'tâches sans élévation'], [/--permission/, 'permissions Node dans la tâche agent'], [/SetSecurityDescriptor/, 'droits sur la tâche agent'], [/verifier-isolation\.ps1/, 'renvoi vers le vérificateur'], [/BitLocker NON actif|ProtectionStatus/, 'alerte BitLocker']]) assert.match(s, motif, `installer.ps1 : ${nom}`);
  assert.ok(!/ja-\$e[^\n]*Administrators/.test(s), 'un compte agent ne doit jamais toucher Administrators');
  assert.match(s, /\/grant "ja-\$\{e\}:\(OI\)\(CI\)M"/, 'l’agent n’a de droit d’écriture que sur sorties/échange'); assert.equal((s.match(/ja-\$\{e\}:\(OI\)\(CI\)M/g) ?? []).length, 2);
  assert.ok(!/"?ja-\$\{e\}:\(OI\)\(CI\)F/.test(s), 'aucun contrôle total pour un compte agent'); assert.match(s, /jv-\$\{e\}:R"/, 'secrets en lecture seule pour le service');
});

test('verifier-isolation.ps1 : toutes les sondes d’accès interdits prévues, rapport JSON, code de sortie 1 sur échec, risque loopback mesuré', () => {
  const s = lire('verifier-isolation.ps1');
  for (const sonde of ['lit la base de', 'liste le dossier de', 'écrit dans les sorties de', 'lit les secrets de', 'lit SA base', 'lit SES secrets', 'sort sur Internet', 'tue le service', 'démarre une tâche de service', 'lance une tâche agent d\'un autre espace', 'loopback']) assert.ok(s.includes(sonde), `sonde absente : ${sonde}`);
  assert.match(s, /exit 1/); assert.match(s, /rapport-isolation\.json/); assert.match(s, /'INFO'/); assert.match(s, /doit marcher/);
});

test('exercice-reprise.ps1 et desinstaller.ps1 : jeton obligatoire, délai borné, suppression des données seulement sur demande explicite', () => {
  const r = lire('exercice-reprise.ps1'); assert.match(r, /Mandatory/); assert.match(r, /DelaiMaxS/); assert.match(r, /FICTIVES/);
  const d = lire('desinstaller.ps1'); assert.match(d, /SupportsShouldProcess/); assert.match(d, /ConfirmImpact = 'High'/); assert.match(d, /\$SupprimerDonnees -and \$PSCmdlet\.ShouldProcess/); assert.ok(!/Remove-Item[^\n]*jarvis-secrets/.test(d));
});

test('hygiène syntaxique grossière : accolades, parenthèses et guillemets équilibrés dans chaque script (ne remplace PAS un interpréteur PowerShell)', () => {
  for (const f of scripts) {
    const s = lire(f).replace(/<#[\s\S]*?#>/g, '').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n').replace(/"[^"\n]*"/g, '""').replace(/'[^'\n]*'/g, "''");
    for (const [o, c] of [['{', '}'], ['(', ')'], ['[', ']']]) assert.equal(s.split(o).length, s.split(c).length, `${f} : ${o}${c} déséquilibrés`);
  }
});
