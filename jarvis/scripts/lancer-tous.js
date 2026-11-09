// Démarre les TROIS espaces comme TROIS processus distincts (développement / démonstration).
// En production : un service Windows par espace, sous un compte Windows distinct (voir docs/05).
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILS } from '../src/espaces.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const jeton = () => randomBytes(24).toString('base64url');
const liens = JSON.stringify(Object.entries(PROFILS).map(([id, p]) => ({ nom: p.libelle.split(' ')[0], url: `http://127.0.0.1:${p.portDefaut}` })));
for (const [id, p] of Object.entries(PROFILS)) {
  const ID = id.toUpperCase(); const u = jeton(); const a = jeton();
  console.log(`\n[${p.libelle}] http://127.0.0.1:${p.portDefaut}\n  jeton utilisateur     : ${u}\n  jeton administrateur  : ${a}`);
  const enfant = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(racine, 'src', 'demarrer.js')], {
    env: { PATH: process.env.PATH, JARVIS_ESPACE: id, [`JARVIS_${ID}_TOKEN`]: u, [`JARVIS_${ID}_ADMIN_TOKEN`]: a, [`JARVIS_${ID}_CLE_SAUVEGARDE`]: jeton(), JARVIS_LIENS_ESPACES: liens }, // chaque espace ne reçoit QUE ses propres secrets
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  enfant.on('exit', (c) => console.log(`[${id}] arrêté (${c})`));
  process.on('SIGINT', () => enfant.kill('SIGINT')); process.on('SIGTERM', () => enfant.kill('SIGTERM'));
}
