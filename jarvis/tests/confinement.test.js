// Confinement RÉEL des agents (P0). Les tests « os » exigent Linux + root (comptes, espaces réseau) : sinon SAUTÉS explicitement.
// Ils prouvent le principe sous Linux ; ils NE valident PAS Windows (voir docs/09, essais W3–W8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, symlinkSync, linkSync, mkdirSync, mkdtempSync, chmodSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environnement, traiter, lire, compteAgent } from './aide.js';
import { attester, backendsDisponibles, commandeLancement, verifierSortie, resoudreUtilisateur, LIMITES } from '../src/confinement.js';

const AGENT = compteAgent('jvagent'); const AGENT2 = compteAgent('jvagent2');
const os = (nom, fn) => test(nom, { skip: AGENT ? false : 'SAUTÉ : exige Linux + root (comptes et espaces réseau) — non valide pour Windows' }, fn);
const CONF = { backend: 'linux-os', utilisateurAgent: AGENT };
const norm = (j) => String(j).replace(/M-\d{8}-[0-9a-f]{6}/g, 'M-ID'); // les identifiants de mission sont aléatoires
const erreurs = (e, id) => e.db.prepare(`SELECT detail FROM journal WHERE mission_id=? AND evenement='AGENT_ERREUR' ORDER BY seq`).all(id).map((r) => JSON.parse(r.detail).message);

os('attestation « permission » : constate HONNÊTEMENT les failles du modèle de permissions Node (kill, débogueur, réseau, mémoire, disque)', async () => {
  const a = await attester({ backend: 'permission' });
  assert.equal(a.niveau, 'permission', `DIAGNOSTIC INTERMITTENCE : ${JSON.stringify({ sondes: a.sondes, echecs: a.echecs })}`);
  const passent = Object.entries(a.sondes).filter(([, v]) => v === 'PASSE').map(([k]) => k);
  for (const attendu of ['tuer_autre_processus', 'debogueur_autre_processus', 'connexion_tcp', 'envoi_udp', 'memoire_1_5_Go', 'fichier_20_Mo']) assert.ok(passent.includes(attendu), `${attendu} aurait dû être constaté comme PASSANT sous « permission » seul — ${JSON.stringify(a.sondes)}`);
  for (const bloque of ['lire_secret_hors_perimetre', 'ecrire_hors_perimetre', 'symlink_vers_secret_puis_lecture', 'lien_dur_vers_secret', 'lancer_processus', 'worker']) assert.equal(a.sondes[bloque], 'REFUSÉ', bloque);
});

os('attestation « linux-os » : compte distinct + réseau coupé + ressources limitées → TOUTES les sondes refusées', async () => {
  assert.ok(backendsDisponibles({ utilisateurAgent: AGENT }).includes('linux-os'));
  const a = await attester({ backend: 'linux-os', utilisateurAgent: AGENT });
  assert.equal(a.niveau, 'os', a.echecs.join(' ; '));
  assert.ok(Object.values(a.sondes).every((v) => v === 'REFUSÉ')); assert.equal(Object.keys(a.sondes).length, 14);
});

os('les huit agents donnent les mêmes résultats confinés (compte distinct, réseau coupé) qu’en mode direct', async () => {
  const D = ['devis pour le garage Martin : 3 vernis', 'contrôle du catalogue produits', 'priorise les prospects', 'dossier du client Garage Martin', 'prépare les relances', 'prépare la commande du devis DEV-2026-012', 'analyse financière', 'planifie ma journée'];
  const a = environnement({ isolation: true, confinement: CONF }); const b = environnement({ isolation: false });
  try {
    for (const d of D) { const x = await traiter(a, d); const y = await traiter(b, d); assert.equal(x.statut, y.statut, d); assert.equal(JSON.parse(x.rapport_audit).verdict, 'VALIDE', d); if (x.agent === 'planification') { const [px, py] = [JSON.parse(x.resultat), JSON.parse(y.resultat)]; assert.deepEqual([px.priorites, px.minutes_planifiees, px.reportees], [py.priorites, py.minutes_planifiees, py.reportees]); } // ex æquo départagés par identifiant aléatoire
      else if (x.agent !== 'devis') assert.equal(norm(x.resultat), norm(y.resultat), `${d} : résultat différent`); }
  } finally { a.nettoyer(); b.nettoyer(); }
});

os('sabotages sous confinement OS : kill, mémoire, disque, symlink, réseau — tous refusés par le SYSTÈME, mission en échec contrôlé', async () => {
  const cible = spawn('sleep', ['60'], { stdio: 'ignore' });
  try {
    const cas = [['tuer_processus', { pid: cible.pid }, /kill refusé : EPERM/], ['memoire', {}, /mémoire refusée/], ['remplir_disque', {}, /(Quota disque|EFBIG|Sortie non conforme)/],
      ['symlink_sortie', { chemin: '/etc/hostname' }, /fs\.symlink API requires full fs\.read and fs\.write permissions/], ['reseau', { url: 'http://127.0.0.1:9/' }, /réseau : (ENETUNREACH|ECONNREFUSED|fetch failed)/]];
    for (const [mode, extra, motif] of cas) {
      const e = environnement({ agent: 'finance', defaut: { mode, jusqua: 99, ...extra }, isolation: true, confinement: CONF });
      try { const m = await traiter(e, 'analyse financière'); assert.equal(m.statut, 'ECHEC', mode); const msgs = erreurs(e, m.id); assert.equal(msgs.length, 4, mode); assert.match(msgs[0], motif, `${mode} : ${msgs[0]}`); } finally { e.nettoyer(); }
    }
    process.kill(cible.pid, 0); // la cible est toujours vivante : l'agent n'a PAS pu la tuer
  } finally { cible.kill('SIGKILL'); }
});

os('un agent d’un espace n’atteint ni les fichiers ni les processus d’un autre espace (comptes agents DISTINCTS)', async () => {
  assert.ok(AGENT2);
  const base = mkdtempSync(join(tmpdir(), 'xsp-')); chmodSync(base, 0o755);
  const dirOdi = join(base, 'odicolor'); mkdirSync(dirOdi); chmodSync(dirOdi, 0o700); writeFileSync(join(dirOdi, 'jarvis.sqlite'), 'DONNEES-ODICOLOR'); chmodSync(join(dirOdi, 'jarvis.sqlite'), 0o600);
  // L'agent « perso » (compte jvagent2) tente de lire la base ODICOLOR : refusé par le SYSTÈME, sans même les permissions Node.
  const r = spawnSync('setpriv', ['--reuid', String(resoudreUtilisateur(AGENT2).uid), '--regid', String(resoudreUtilisateur(AGENT2).gid), '--clear-groups', 'cat', join(dirOdi, 'jarvis.sqlite')], { encoding: 'utf8' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /Permission denied/);
  // Même chose pour l'autre compte agent contre le dossier de SON espace non attribué.
  const r2 = spawnSync('setpriv', ['--reuid', String(resoudreUtilisateur(AGENT).uid), '--regid', String(resoudreUtilisateur(AGENT).gid), '--clear-groups', 'ls', dirOdi], { encoding: 'utf8' }); assert.match(r2.stderr, /Permission denied/);
});

os('la base SQLite d’un espace est en mode 0600 : illisible par un compte agent (OS), WAL/SHM compris', async () => {
  const e = environnement({ isolation: true, confinement: CONF });
  try {
    await traiter(e, DEMANDE_SIMPLE);
    for (const f of [e.fichierDb, `${e.fichierDb}-wal`, `${e.fichierDb}-shm`].filter(existsSync)) assert.equal(statSync(f).mode & 0o077, 0, `${f} accessible à d’autres comptes`);
    const u = resoudreUtilisateur(AGENT); const r = spawnSync('setpriv', ['--reuid', String(u.uid), '--regid', String(u.gid), '--clear-groups', 'cat', e.fichierDb], { encoding: 'utf8' });
    assert.match(r.stderr, /Permission denied/);
  } finally { e.nettoyer(); }
});
const DEMANDE_SIMPLE = 'planifie ma journée';

test('hygiène de la sortie : lien symbolique, lien dur, exécutable, quota, trop de fichiers → détectés (tous systèmes)', () => {
  const d = mkdtempSync(join(tmpdir(), 'hyg-')); writeFileSync(join(d, 'ok.txt'), 'ok'); assert.equal(verifierSortie(d).ok, true);
  const hors = join(mkdtempSync(join(tmpdir(), 'hyg2-')), 'secret'); writeFileSync(hors, 's');
  symlinkSync(hors, join(d, 'lien')); linkSync(hors, join(d, 'dur')); writeFileSync(join(d, 'run.sh'), '#!/bin/sh', { mode: 0o755 });
  const r = verifierSortie(d); assert.equal(r.ok, false); const t = r.problemes.join(' | ');
  assert.match(t, /lien symbolique/); assert.match(t, /lien dur/); assert.match(t, /exécutable/);
  const g = mkdtempSync(join(tmpdir(), 'hyg3-')); writeFileSync(join(g, 'gros'), Buffer.alloc(LIMITES.quotaSortieOctets + 1)); assert.match(verifierSortie(g).problemes[0], /quota/);
  const m = mkdtempSync(join(tmpdir(), 'hyg4-')); for (let i = 0; i <= LIMITES.maxFichiersSortie; i++) writeFileSync(join(m, `f${i}`), '1'); assert.match(verifierSortie(m).problemes.join(), /trop de fichiers/);
});

test('défense en profondeur : Node REFUSE déjà la création d’un lien symbolique par l’agent (le contrôle d’hygiène reste actif en second rideau)', async () => {
  const e = environnement({ agent: 'produits', defaut: { mode: 'symlink_sortie', jusqua: 99, chemin: '/etc/hostname' }, isolation: true });
  try { const m = await traiter(e, 'contrôle du catalogue produits'); assert.equal(m.statut, 'ECHEC'); assert.match(erreurs(e, m.id)[0], /fs\.symlink API requires full fs\.read and fs\.write permissions/); assert.ok(!existsSync(join(e.dossierSorties, m.id, 'lien'))); } finally { e.nettoyer(); }
});

test('sortie propre à chaque tentative : les résidus d’une exécution échouée ne polluent pas la suivante', async () => {
  const e = environnement({ agent: 'produits', defaut: { mode: 'remplir_disque', jusqua: 1 }, isolation: true });
  try { const m = await traiter(e, 'contrôle du catalogue produits'); assert.equal(m.statut, 'VALIDE'); assert.equal(m.corrections, 1); assert.ok(verifierSortie(join(e.dossierSorties, m.id)).ok); } finally { e.nettoyer(); }
});

test('quota disque (mode « permission ») : un agent qui remplit son dossier de sortie est TUÉ', async () => {
  const e = environnement({ agent: 'produits', defaut: { mode: 'remplir_disque', jusqua: 1 }, isolation: true });
  try { const m = await traiter(e, 'contrôle du catalogue produits'); assert.match(erreurs(e, m.id)[0], /Quota disque|Sortie non conforme/); assert.equal(m.corrections, 1); } finally { e.nettoyer(); }
});

test('commande de lancement « linux-os » : aucun passage par un shell, limites présentes, compte inconnu refusé', () => {
  if (!AGENT) return;
  const c = commandeLancement({ backend: 'linux-os', exe: '/usr/bin/node', argsNode: ['a.js'], utilisateurAgent: AGENT });
  assert.equal(c.cmd, 'unshare'); assert.ok(c.args.includes('--net') && c.args.includes('--no-new-privs') && c.args.includes('--clear-groups'));
  assert.ok(c.args.some((x) => x.startsWith('--data=')) && c.args.some((x) => x.startsWith('--fsize=')) && c.args.some((x) => x.startsWith('--nproc=')) && c.args.some((x) => x.startsWith('--cpu=')));
  assert.ok(!c.args.some((x) => /[;&|`$]/.test(x)), 'aucun méta-caractère de shell');
  assert.throws(() => commandeLancement({ backend: 'linux-os', exe: 'x', argsNode: [], utilisateurAgent: 'inexistant-xyz' }), /introuvable/);
  assert.throws(() => commandeLancement({ backend: 'inconnu', exe: 'x', argsNode: [] }), /Backend inconnu/);
});
