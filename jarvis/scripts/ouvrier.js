// Travailleur SUPPLÉMENTAIRE (même espace, même base) : traite les missions et l'outbox sans serveur HTTP.
// Sert à exercer la concurrence entre processus (essai d'endurance) ; en service normal, un seul processus suffit.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrir } from '../src/db.js';
import { Jarvis } from '../src/orchestrateur.js';
import { configurerEspace } from '../src/espaces.js';
import { backendsDisponibles } from '../src/confinement.js';
import { connecteurGmail } from '../src/connecteurs/gmail.js';
import { traiter as traiterOutbox } from '../src/outbox.js';

const racineCode = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.env.JARVIS_ESPACE ?? 'odicolor'; const ID = id.toUpperCase();
const espace = configurerEspace(id, { racineDonnees: process.env.JARVIS_DONNEES, racineCode, env: process.env });
const db = ouvrir(espace.dbChemin);
const utilisateurAgent = process.env[`JARVIS_${ID}_AGENT_USER`] ?? null;
const backend = backendsDisponibles({ utilisateurAgent }).includes('linux-os') && (process.env.JARVIS_CONFINEMENT ?? 'auto') === 'auto' ? 'linux-os' : 'permission';
const jarvis = new Jarvis({ db, espace, isolation: true, racineCode, confinement: { backend, utilisateurAgent }, ouvrier: `ouvrier-${process.pid}` });
const connecteurs = { gmail: connecteurGmail({ db, dossierBoite: join(espace.dossier, 'boite-synthetique') }) };
const fin = Date.now() + Number(process.env.JARVIS_OUVRIER_DUREE_MS ?? 60000);
let arret = false; process.on('SIGTERM', () => { arret = true; }); process.on('SIGINT', () => { arret = true; });
while (!arret && Date.now() < fin) { const r = await jarvis.tick(); await traiterOutbox(db, connecteurs); if (r.action === 'rien' || r.action === 'arret_urgence') await new Promise((ok) => setTimeout(ok, 300)); }
db.close();
