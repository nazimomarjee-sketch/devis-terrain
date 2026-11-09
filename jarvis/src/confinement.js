// CONFINEMENT des agents. Trois niveaux, jamais confondus :
//   « permission » : permissions Node seules — protègent fichiers et processus enfants, MAIS laissent passer kill/débogueur sur
//                    les processus du même compte, tout le réseau, la mémoire hors tas et l'écriture illimitée (audité, voir docs/04) ;
//   « os »         : compte distinct + espace réseau vide + limites de ressources imposés PAR LE SYSTÈME (Linux : implémenté et testé) ;
//   « aucun »      : même les protections de fichiers sont insuffisantes.
// Le niveau n'est jamais DÉCLARÉ : il est ATTESTÉ par des sondes d'accès interdits exécutées dans le confinement.
// Les données réelles exigent une attestation « os » récente.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { definirParam, param, journaliser } from './db.js';
import { horloge } from './horloge.js';
import { executerParEchange } from './echange.js';

const racineCode = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LIMITES = { memoireOctets: 512 * 1024 ** 2, tailleFichierOctets: 10 * 1024 ** 2, processus: 24, cpuSecondes: 60, quotaSortieOctets: 20 * 1024 ** 2, maxFichiersSortie: 50 };

const outil = (n) => { try { return execFileSync('sh', ['-c', `command -v ${n}`], { encoding: 'utf8' }).trim(); } catch { return null; } };

export function resoudreUtilisateur(nom) {
  try { const [uid, gid] = execFileSync('sh', ['-c', `id -u ${nom} && id -g ${nom}`], { encoding: 'utf8' }).trim().split('\n').map(Number); return Number.isInteger(uid) && uid > 0 ? { uid, gid, nom } : null; } catch { return null; }
}

/** Backends utilisables ici. « os » exige Linux + unshare/setpriv/prlimit + un compte agent non privilégié + les droits pour en changer. */
export function backendsDisponibles({ utilisateurAgent = null } = {}) {
  const dispo = ['permission'];
  if (process.platform === 'linux' && outil('unshare') && outil('setpriv') && outil('prlimit') && utilisateurAgent && resoudreUtilisateur(utilisateurAgent) && process.getuid?.() === 0) dispo.push('linux-os');
  return dispo;
}

/** Construit la commande de lancement d'un processus agent pour un backend donné. */
export function commandeLancement({ backend, exe, argsNode, utilisateurAgent, limites = LIMITES }) {
  if (backend === 'permission') return { cmd: exe, args: argsNode };
  if (backend === 'linux-os') {
    const u = resoudreUtilisateur(utilisateurAgent);
    if (!u) throw new Error(`Compte agent introuvable : ${utilisateurAgent}`);
    return { cmd: 'unshare', args: ['--net', '--', 'setpriv', `--reuid=${u.uid}`, `--regid=${u.gid}`, '--clear-groups', '--no-new-privs', '--bounding-set=-all', '--inh-caps=-all', '--',
      'prlimit', `--data=${limites.memoireOctets}`, `--fsize=${limites.tailleFichierOctets}`, `--nproc=${limites.processus}`, `--cpu=${limites.cpuSecondes}`, '--', exe, ...argsNode], uid: u.uid, gid: u.gid };
  }
  throw new Error(`Backend inconnu : ${backend}`);
}

/** Hygiène du dossier de sortie : ni lien symbolique, ni lien dur, ni fichier spécial, taille et nombre bornés. */
export function verifierSortie(dossier, limites = LIMITES) {
  const problemes = []; let total = 0; let n = 0;
  const parcourir = (d) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom); const s = lstatSync(p); n++;
      if (s.isSymbolicLink()) problemes.push(`lien symbolique : ${nom}`);
      else if (s.isDirectory()) parcourir(p);
      else if (!s.isFile()) problemes.push(`fichier spécial : ${nom}`);
      else { total += s.size; if (s.nlink > 1) problemes.push(`lien dur : ${nom}`); if (s.mode & 0o111) problemes.push(`fichier exécutable : ${nom}`); }
    }
  };
  if (existsSync(dossier)) parcourir(dossier);
  if (total > limites.quotaSortieOctets) problemes.push(`quota dépassé : ${total} octets`);
  if (n > limites.maxFichiersSortie) problemes.push(`trop de fichiers : ${n}`);
  return { ok: problemes.length === 0, problemes, octets: total, fichiers: n };
}

export function tailleDossier(dossier) { try { return verifierSortie(dossier, { quotaSortieOctets: Infinity, maxFichiersSortie: Infinity }).octets; } catch { return 0; } }

// ---------------------------------------------------------------------------------------------------------------------
// ATTESTATION : sondes d'accès interdits exécutées avec EXACTEMENT les mêmes contraintes qu'un agent.
const PROBES_FICHIERS = ['lire_secret_hors_perimetre', 'ecrire_hors_perimetre', 'symlink_vers_secret_puis_lecture', 'lien_dur_vers_secret', 'lire_environnement_processus', 'lancer_processus', 'worker'];
const PROBES_OS = ['tuer_autre_processus', 'debogueur_autre_processus', 'connexion_tcp', 'envoi_udp', 'socket_unix', 'memoire_1_5_Go', 'fichier_20_Mo'];

/** Retourne { niveau, backend, sondes, echecs, date }. Le niveau « os » exige que TOUTES les sondes soient refusées. */
export async function attester({ backend = 'permission', utilisateurAgent = null, limites = LIMITES, plateforme = process.platform, lanceur = null, dossierEchange = null, dossierSortieAttestation = null } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'jarvis-attest-'));
  const serviceDir = join(base, 'service'); const sortie = dossierSortieAttestation ?? join(base, 'sortie'); const hors = join(base, 'hors'); // Windows (échange) : dossier de sortie sur lequel le compte agent a des droits
  for (const d of [serviceDir, sortie, hors]) mkdirSync(d, { recursive: true });
  const marqueSortie = existsSync(sortie);
  const secret = join(serviceDir, 'secret.txt'); writeFileSync(secret, 'SECRET-DU-SERVICE'); chmodSync(secret, 0o600); chmodSync(serviceDir, 0o700); chmodSync(hors, 0o700);
  const temoin = () => spawn(process.execPath, ['-e', 'setTimeout(()=>{},120000)'], { stdio: 'ignore' }); // témoin PORTABLE (pas de « sleep » sous Windows)
  const cible = temoin(); // processus « service » (cible du kill) que l'agent ne doit pas pouvoir toucher
  const cible2 = temoin(); // second témoin, DISTINCT (cible du débogueur) : une sonde ne doit pas dépendre du résultat d'une autre
  let connexions = 0;
  // Canari TCP sur une interface NON loopback quand elle existe (le trafic loopback n'est pas filtré par le pare-feu Windows) ; sinon loopback.
  const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  const hoteTcp = lan ?? '127.0.0.1';
  const ecouteur = createServer((s) => { connexions++; s.end(); }); await new Promise((ok) => ecouteur.listen(0, hoteTcp, ok));
  const socketUnix = join(serviceDir, 'u.sock'); const unix = createServer((s) => { connexions++; s.end(); }); await new Promise((ok) => unix.listen(socketUnix, ok)); chmodSync(socketUnix, 0o600);
  try {
    const u = backend === 'linux-os' ? resoudreUtilisateur(utilisateurAgent) : null;
    if (u) { chmodSync(base, 0o755); chmodSync(sortie, 0o700); execFileSync('chown', ['-R', `${u.uid}:${u.gid}`, sortie]); }
    const canaris = { secret, dossierSortie: sortie, pidKill: cible.pid, pidDebug: cible2.pid, portTcp: ecouteur.address().port, hoteTcp, socketUnix, dossierHors: hors };
    let sorties;
    if (backend === 'echange') {
      // Même sondes, exécutées par le lanceur du compte agent (Windows : tâche planifiée). `preparer` donne au compte agent l'accès à son dossier de sortie.
      await lanceur.preparer?.({ sortie, base });
      const r = await executerParEchange({ dossierEchange: dossierEchange ?? join(base, 'echange'), entree: { mode: 'sonde', canaris }, lanceur, delaiMs: 40000 });
      sorties = r.sondes;
    } else {
    const argsNode = ['--permission', `--allow-fs-read=${join(racineCode, 'src')}`, `--allow-fs-read=${join(racineCode, 'package.json')}`, `--allow-fs-write=${sortie}`, `--allow-fs-read=${sortie}`, '--disable-warning=ExperimentalWarning', join(racineCode, 'src', 'agents', 'sonde.js')];
    const { cmd, args } = commandeLancement({ backend, exe: process.execPath, argsNode, utilisateurAgent, limites });
    sorties = await new Promise((ok, ko) => {
      const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { NODE_ENV: 'production' }, cwd: sortie });
      let out = ''; let err = ''; const t = setTimeout(() => { p.kill('SIGKILL'); ko(new Error('sonde : délai dépassé')); }, 30000);
      p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { err += c; });
      p.on('close', (code) => { clearTimeout(t); try { ok(JSON.parse(out)); } catch { ko(new Error(`sonde illisible (code ${code}) : ${err.slice(-200)}`)); } });
      p.stdin.end(JSON.stringify({ canaris }));
    });
    }
    const vivant = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
    const cibleVivante = vivant(cible.pid) && vivant(cible2.pid);
    const echecs = [];
    for (const [nom, r] of Object.entries(sorties)) if (r.passe) echecs.push(`${nom} : a RÉUSSI (${r.detail})`);
    if (connexions > 0) echecs.push(`un écouteur du service a reçu ${connexions} connexion(s) de l'agent`);
    if (!cibleVivante) echecs.push('le processus témoin du service a été tué par la sonde');
    const echecsFichiers = echecs.filter((e) => PROBES_FICHIERS.some((p) => e.startsWith(p)));
    const niveau = echecsFichiers.length ? 'aucun' : echecs.length ? 'permission' : 'os';
    return { niveau, backend, plateforme, sondes: Object.fromEntries(Object.entries(sorties).map(([k, v]) => [k, v.passe ? 'PASSE' : 'REFUSÉ'])), echecs, date: horloge.iso(),
      note: niveau === 'os' ? 'Toutes les sondes refusées par le système.' : niveau === 'permission' ? 'Fichiers et processus protégés ; kill/débogueur/réseau/ressources NON isolés.' : 'Protections de fichiers insuffisantes.' };
  } finally {
    cible.kill('SIGKILL'); cible2.kill('SIGKILL'); ecouteur.close(); unix.close();
    try { rmSync(base, { recursive: true, force: true }); } catch { /* nettoyage best-effort */ }
  }
}

export function enregistrerAttestation(db, att) {
  definirParam(db, 'attestation_confinement', JSON.stringify(att));
  journaliser(db, { acteur: 'confinement', evenement: 'ATTESTATION', detail: { niveau: att.niveau, backend: att.backend, echecs: att.echecs.length } });
}
export function derniereAttestation(db) { const v = param(db, 'attestation_confinement'); return v ? JSON.parse(v) : null; }

/** Suffisant pour des DONNÉES RÉELLES : niveau « os » attesté depuis moins de `maxHeures` heures. */
export function confinementSuffisantPourReel(db, { backend, isolation = true } = {}, maxHeures = 24) {
  const a = derniereAttestation(db);
  // L'attestation doit concerner le backend RÉELLEMENT utilisé, agents réellement isolés, et être récente.
  return !!a && isolation && a.niveau === 'os' && (!backend || a.backend === backend) && horloge.maintenant() - Date.parse(a.date) < maxHeures * 3600 * 1000;
}
