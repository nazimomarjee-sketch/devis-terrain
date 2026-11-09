// BANC DE MESURES reproductible (qualification). Mesure, ne suppose rien. Résultats : docs/BENCH_RESULTATS.json.
//   node scripts/bench.js            (Linux : ajoute le backend « linux-os » si root)
import { mkdtempSync, mkdirSync, statSync, writeFileSync, readFileSync, rmSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir, cpus, totalmem, platform, release } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { ouvrir } from '../src/db.js';
import { Jarvis } from '../src/orchestrateur.js';
import { configurerEspace } from '../src/espaces.js';
import { horloge } from '../src/horloge.js';
import { sauvegarder, restaurer } from '../src/sauvegarde.js';
import { backendsDisponibles, attester } from '../src/confinement.js';
import { autotestAuditeurs } from '../src/autotest.js';
import { creerServeur } from '../src/serveur.js';
import { genererJeu } from '../tests/generateur.js';

const racineCode = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = { machine: { os: `${platform()} ${release()}`, cpu: cpus()[0].model, coeurs: cpus().length, ram_Go: +(totalmem() / 1024 ** 3).toFixed(1), node: process.version }, mesures: {} };
const ms = (t) => +(performance.now() - t).toFixed(1);
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(1); };
const DEMANDES = { devis: 'devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs', produits: 'contrôle du catalogue produits', prospection: 'priorise les prospects', clients: 'dossier du client Garage Martin', relances: 'prépare les relances', commandes: 'prépare la commande du devis DEV-2026-012', finance: 'analyse financière', planification: 'planifie ma journée' };

function nouvelEspace(options = {}) {
  horloge.reinitialiser(); horloge.gele = Date.parse('2026-11-09T09:00:00Z');
  const racine = mkdtempSync(join(tmpdir(), 'bench-')); chmodSync(racine, 0o711);
  const cfg = configurerEspace('odicolor', { racineDonnees: racine, racineCode, env: {} }); mkdirSync(cfg.dossier, { recursive: true });
  if (options.dossierJeu) cfg.dossierJeu = options.dossierJeu;
  const db = ouvrir(cfg.dbChemin); const jarvis = new Jarvis({ db, espace: cfg, isolation: !!options.isolation, racineCode, confinement: options.confinement ?? { backend: 'permission' } });
  return { racine, cfg, db, jarvis, fin() { try { db.close(); } catch { /* */ } rmSync(racine, { recursive: true, force: true }); } };
}

// 1) Latence par agent et par mode d'exécution
const modes = [['direct', { isolation: false }], ['permission-isole', { isolation: true }]];
let compte = null; if (backendsDisponibles({ utilisateurAgent: 'jvagent' }).includes('linux-os')) { try { execFileSync('sh', ['-c', 'id jvagent >/dev/null 2>&1 || useradd -M -s /usr/sbin/nologin jvagent']); compte = 'jvagent'; } catch { /* */ } }
if (compte) modes.push(['linux-os-isole', { isolation: true, confinement: { backend: 'linux-os', utilisateurAgent: compte } }]);
R.mesures.latence_ms_par_mission = {};
for (const [nom, opt] of modes) {
  const e = nouvelEspace(opt); const par = {}; const t0 = performance.now(); let n = 0;
  for (let tour = 0; tour < 6; tour++) for (const [agent, d] of Object.entries(DEMANDES)) { e.jarvis.deposerParUtilisateur(d); const t = performance.now(); await e.jarvis.tick(); (par[agent] ??= []).push(ms(t)); n++; }
  const total = performance.now() - t0; R.mesures.latence_ms_par_mission[nom] = { missions: n, debit_missions_par_s: +(n / (total / 1000)).toFixed(1), moyenne_ms: +(Object.values(par).flat().reduce((a, b) => a + b, 0) / n).toFixed(1), p95_ms: quantile(Object.values(par).flat(), 0.95), par_agent_moyenne_ms: Object.fromEntries(Object.entries(par).map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)])) };
  e.fin();
}

// 2) Montée en charge des DONNÉES (les jeux passent par stdin vers l'agent isolé : limite à connaître)
R.mesures.montee_en_charge_donnees = [];
for (const nFact of [100, 1000, 5000, 20000]) {
  const base = mkdtempSync(join(tmpdir(), 'jeu-')); const jeu = join(base, 'j'); const g = genererJeu(jeu, 99);
  const factures = Array.from({ length: nFact }, (_, i) => ({ ...g.factures[i % g.factures.length], id: `FAC-X-${i}` }));
  writeFileSync(join(jeu, 'factures.json'), JSON.stringify({ genere: 'FICTIF', factures }));
  const e = nouvelEspace({ dossierJeu: jeu, isolation: true }); const { id } = e.jarvis.deposerParUtilisateur('analyse financière'); const t = performance.now(); let statut;
  try { await e.jarvis.tick(); statut = e.db.prepare('SELECT statut FROM missions WHERE id=?').get(id).statut; } catch (err) { statut = `ERREUR ${err.message.slice(0, 60)}`; }
  R.mesures.montee_en_charge_donnees.push({ factures: nFact, taille_json_Mo: +(statSync(join(jeu, 'factures.json')).size / 1048576).toFixed(2), duree_ms: ms(t), statut }); e.fin(); rmSync(base, { recursive: true, force: true });
}

// 3) Concurrence : 1, 2, 4 processus ouvriers sur 96 missions, agents ISOLÉS (processus restreint)
R.mesures.concurrence = [];
for (const k of [1, 2, 4]) {
  const e = nouvelEspace(); const ids = []; for (let i = 0; i < 96; i++) ids.push(e.jarvis.deposerParUtilisateur(Object.values(DEMANDES)[i % 8]).id); e.db.close();
  const t = performance.now();
  await Promise.all(Array.from({ length: k }, (_, i) => new Promise((ok) => { const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(racineCode, 'tests', 'ouvrier-complet.js'), e.racine, `w${i}`, String(horloge.gele), 'isole'], { stdio: 'ignore' }); p.on('close', ok); })));
  const duree = performance.now() - t; const db = ouvrir(e.cfg.dbChemin); const doubles = db.prepare('SELECT COUNT(*) AS n FROM missions WHERE executions > 1').get().n; const finis = db.prepare(`SELECT COUNT(*) AS n FROM missions WHERE statut IN ('VALIDE','EN_ATTENTE_APPROBATION')`).get().n; db.close();
  R.mesures.concurrence.push({ processus: k, missions: 96, duree_ms: Math.round(duree), debit_missions_par_s: +(96 / (duree / 1000)).toFixed(1), terminees: finis, executees_deux_fois: doubles }); rmSync(e.racine, { recursive: true, force: true });
}

// 4) Base : croissance, sauvegarde, restauration ; API
{
  const e = nouvelEspace(); for (let i = 0; i < 400; i++) e.jarvis.deposerParUtilisateur(Object.values(DEMANDES)[i % 8]); await e.jarvis.executerJusquaVide(1000);
  const taille = (f) => { try { return statSync(f).size; } catch { return 0; } }; const octets = taille(e.cfg.dbChemin) + taille(`${e.cfg.dbChemin}-wal`);
  const sorties = (() => { let t = 0; const p = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); statSync(f).isDirectory() ? p(f) : (t += statSync(f).size); } }; try { p(e.cfg.dossierSorties); } catch { /* */ } return t; })();
  let t = performance.now(); const sv = sauvegarder(e.db, e.cfg.dossierSauvegardes, 'phrase-bench-solide-123'); const tSauv = ms(t);
  t = performance.now(); restaurer(sv.fichier, 'phrase-bench-solide-123', join(e.racine, 'restauree.sqlite')); const tRest = ms(t);
  R.mesures.base = { missions: 400, base_Mo: +(octets / 1048576).toFixed(2), octets_par_mission: Math.round(octets / 400), journal_lignes: e.db.prepare('SELECT COUNT(*) AS n FROM journal').get().n, sorties_Mo: +(sorties / 1048576).toFixed(2), sauvegarde_chiffree_verifiee_ms: tSauv, sauvegarde_Mo: +(statSync(sv.fichier).size / 1048576).toFixed(2), restauration_ms: tRest };
  const serveur = creerServeur({ jarvis: e.jarvis, jeton: 'j'.repeat(30), jetonAdmin: 'a'.repeat(30), dossierPublic: join(racineCode, 'public') }); await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok)); const port = serveur.address().port;
  const lat = []; for (let i = 0; i < 60; i++) { const t1 = performance.now(); const r = await fetch(`http://127.0.0.1:${port}/api/etat`, { headers: { Authorization: `Bearer ${'j'.repeat(30)}` } }); await r.text(); lat.push(ms(t1)); }
  const lat2 = []; for (let i = 0; i < 60; i++) { const t1 = performance.now(); await (await fetch(`http://127.0.0.1:${port}/api/sante`)).text(); lat2.push(ms(t1)); }
  R.mesures.api_ms_400_missions = { etat_p50: quantile(lat, 0.5), etat_p95: quantile(lat, 0.95), sante_p50: quantile(lat2, 0.5), sante_p95: quantile(lat2, 0.95) }; serveur.close(); e.fin();
}

// 5) Contrôles de supervision
{ let t = performance.now(); const a = await autotestAuditeurs(); R.mesures.autotest_auditeur = { duree_ms: ms(t), ok: a.ok };
  t = performance.now(); const att = await attester({ backend: 'permission' }); R.mesures.attestation_permission = { duree_ms: ms(t), niveau: att.niveau };
  if (compte) { t = performance.now(); const o = await attester({ backend: 'linux-os', utilisateurAgent: compte }); R.mesures.attestation_linux_os = { duree_ms: ms(t), niveau: o.niveau }; } }

// 6) Démarrage du service réel et mémoire (service + agent isolé)
{ const racine = mkdtempSync(join(tmpdir(), 'svc-')); chmodSync(racine, 0o711); const port = 18000 + Math.floor(Math.random() * 1000);
  const env = { PATH: process.env.PATH, JARVIS_ESPACE: 'odicolor', JARVIS_DONNEES: racine, JARVIS_ODICOLOR_TOKEN: 'u'.repeat(30), JARVIS_ODICOLOR_ADMIN_TOKEN: 'a'.repeat(30), JARVIS_ODICOLOR_CLE_SAUVEGARDE: 'cle-bench-solide-123', JARVIS_ODICOLOR_PORT: String(port), JARVIS_CONFINEMENT: 'permission' };
  const t0 = performance.now(); const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(racineCode, 'src', 'demarrer.js')], { env, stdio: 'ignore' });
  let pret = null; while (performance.now() - t0 < 60000) { try { const r = await fetch(`http://127.0.0.1:${port}/api/sante`); if (r.ok && (await r.json()).battement_age_s !== null) { pret = ms(t0); break; } } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); }
  const rss = (pid) => { try { return +(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))[1] / 1024).toFixed(1); } catch { return null; } };
  const mem = rss(p.pid); R.mesures.service = { demarrage_pret_ms: pret, memoire_RSS_Mo: mem };
  // Réaction du superviseur : kill -9 puis redémarrage manuel équivalent (le superviseur est mesuré dans les tests)
  const t1 = performance.now(); p.kill('SIGKILL'); await new Promise((r) => p.on('close', r));
  const p2 = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(racineCode, 'src', 'demarrer.js')], { env, stdio: 'ignore' }); let reprise = null;
  while (performance.now() - t1 < 60000) { try { const r = await fetch(`http://127.0.0.1:${port}/api/sante`); if (r.ok && (await r.json()).battement_age_s !== null) { reprise = ms(t1); break; } } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); }
  R.mesures.service.reprise_apres_kill9_ms = reprise; p2.kill('SIGKILL'); rmSync(racine, { recursive: true, force: true }); }

writeFileSync(join(racineCode, 'docs', 'BENCH_RESULTATS.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 2));
