// Sonde de santé d'UN espace pour le planificateur de tâches Windows / un watchdog externe.
// Code de sortie : 0 = sain ; 1 = alerte critique (service silencieux, journal altéré, échec, incohérence…).
//   JARVIS_ESPACE=odicolor JARVIS_DONNEES=C:\jarvis-data node scripts/sante.js
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrir } from '../src/db.js';
import { diagnostic } from '../src/sante.js';
import { configurerEspace } from '../src/espaces.js';

const racineCode = join(dirname(fileURLToPath(import.meta.url)), '..');
const espace = configurerEspace(process.env.JARVIS_ESPACE ?? 'odicolor', { racineDonnees: process.env.JARVIS_DONNEES ?? join(racineCode, 'data', 'exploitation'), racineCode, env: {} });
const db = ouvrir(espace.dbChemin);
const d = diagnostic(db, { dossierDonnees: espace.dossier, exigerBattement: true });
console.log(JSON.stringify({ espace: espace.id, ok: d.ok, alertes: d.alertes }, null, 2));
db.close();
process.exit(d.ok ? 0 : 1);
