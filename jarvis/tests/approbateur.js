// Processus de test : tente d'approuver une mission (utilisé pour la double approbation concurrente).
import { ouvrir } from '../src/db.js';
import { Jarvis } from '../src/orchestrateur.js';
import { configurerEspace } from '../src/espaces.js';
import { horloge } from '../src/horloge.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [racineDonnees, id, gele] = process.argv.slice(2);
horloge.gele = Number(gele);
const racineCode = join(dirname(fileURLToPath(import.meta.url)), '..');
const espace = configurerEspace('odicolor', { racineDonnees, racineCode, env: {} });
const db = ouvrir(espace.dbChemin); const j = new Jarvis({ db, espace, racineCode });
try { console.log(JSON.stringify({ ok: j.approuver(id, 'approuver') })); } catch (e) { console.log(JSON.stringify({ erreur: e.message })); }
db.close();
