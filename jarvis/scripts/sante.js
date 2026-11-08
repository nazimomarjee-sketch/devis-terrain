// Sonde de santé pour le planificateur de tâches Windows / un watchdog externe.
// Code de sortie : 0 = sain, 1 = alerte critique (service silencieux, journal altéré, échecs…).
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrir } from '../src/db.js';
import { diagnostic } from '../src/sante.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = process.env.JARVIS_DONNEES ?? join(racine, 'data', 'exploitation');
const db = ouvrir(join(dossier, 'jarvis.sqlite'));
const d = diagnostic(db, { dossierDonnees: dossier, exigerBattement: true });
console.log(JSON.stringify({ ok: d.ok, alertes: d.alertes }, null, 2));
db.close();
process.exit(d.ok ? 0 : 1);
