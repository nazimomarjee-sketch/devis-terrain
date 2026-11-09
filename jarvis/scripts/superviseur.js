// Superviseur de DÉVELOPPEMENT : lance et supervise les trois espaces comme trois processus, ne parle qu'à /api/sante.
// En production Windows : même logique, avec redémarrage par tâche planifiée (voir docs/05).
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync } from 'node:fs';
import { Superviseur } from '../src/superviseur.js';
import { PROFILS } from '../src/espaces.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const jeton = () => randomBytes(24).toString('base64url');
const enfants = {};
const lancer = (id) => {
  const ID = id.toUpperCase();
  const env = { PATH: process.env.PATH, JARVIS_ESPACE: id, [`JARVIS_${ID}_TOKEN`]: secrets[id].u, [`JARVIS_${ID}_ADMIN_TOKEN`]: secrets[id].a, [`JARVIS_${ID}_CLE_SAUVEGARDE`]: secrets[id].k };
  enfants[id] = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(racine, 'src', 'demarrer.js')], { env, stdio: ['ignore', 'inherit', 'inherit'] });
  enfants[id].on('exit', (c) => console.log(`[${id}] sorti (${c})`));
};
const secrets = Object.fromEntries(Object.keys(PROFILS).map((id) => [id, { u: jeton(), a: jeton(), k: jeton() }]));
for (const [id, s] of Object.entries(secrets)) console.log(`[${id}] jeton utilisateur : ${s.u}\n[${id}] jeton administrateur : ${s.a}`);
const services = Object.entries(PROFILS).map(([id, p]) => ({
  id,
  sonder: async () => { try { const r = await fetch(`http://127.0.0.1:${p.portDefaut}/api/sante`, { signal: AbortSignal.timeout(3000) }); return r.ok ? await r.json() : null; } catch { return null; } },
  redemarrer: async () => { try { enfants[id]?.kill('SIGKILL'); } catch { /* déjà mort */ } lancer(id); },
}));
for (const id of Object.keys(PROFILS)) lancer(id);
const sup = new Superviseur({ services, alerter: (a) => { const l = `${new Date().toISOString()} [${a.niveau}] ${a.service} ${a.code} : ${a.message}\n`; process.stderr.write(l); try { appendFileSync(join(racine, 'data', 'alertes-superviseur.log'), l); } catch { /* ignoré */ } } });
setInterval(() => sup.cycle().catch((e) => console.error('cycle :', e.message)), 5000);
process.on('SIGINT', () => { for (const e of Object.values(enfants)) e.kill('SIGINT'); setTimeout(() => process.exit(0), 500); });
