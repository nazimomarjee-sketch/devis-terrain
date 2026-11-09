// Service d'UN espace (JARVIS_ESPACE=perso|odicolor|cockpit). En production : un service Windows par espace, sous un compte distinct.
// Redémarrable à tout moment : l'état est dans SQLite. Données réelles : désactivées tant qu'un administrateur n'a pas accordé l'autorisation.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { ouvrir, journaliser } from './db.js';
import { Jarvis } from './orchestrateur.js';
import { configurerEspace, verifierCloisonnement, PROFILS } from './espaces.js';
import { creerServeur } from './serveur.js';
import { diagnostic } from './sante.js';
import { sauvegarder, derniereSauvegarde } from './sauvegarde.js';
import { horloge } from './horloge.js';

const racineCode = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.env.JARVIS_ESPACE ?? 'odicolor';
if (!PROFILS[id]) { console.error(`Espace inconnu : ${id} (attendu : ${Object.keys(PROFILS).join(', ')})`); process.exit(2); }
if ((process.env.JARVIS_MODE ?? 'demo') !== 'demo') { console.error('Mode « reel » volontairement NON implémenté : les données réelles passent par une autorisation administrateur (voir docs/04_SECURITE.md).'); process.exit(2); }

const racineDonnees = process.env.JARVIS_DONNEES ?? join(racineCode, 'data', 'exploitation');
const env = { ...process.env };
const ID = id.toUpperCase();
const gen = (nom) => { const v = randomBytes(24).toString('base64url'); console.log(`${nom} de démonstration généré (affiché une seule fois) : ${v}`); return v; };
env[`JARVIS_${ID}_TOKEN`] ??= gen('Jeton utilisateur');
env[`JARVIS_${ID}_ADMIN_TOKEN`] ??= gen('Jeton administrateur');
env[`JARVIS_${ID}_CLE_SAUVEGARDE`] ??= randomBytes(18).toString('base64url');
const espace = configurerEspace(id, { racineDonnees, racineCode, env });
verifierCloisonnement([espace]);

mkdirSync(espace.dossier, { recursive: true });
const db = ouvrir(espace.dbChemin);
const jarvis = new Jarvis({ db, espace, isolation: process.env.JARVIS_ISOLATION !== 'non', racineCode });
const serveur = creerServeur({
  jarvis, jeton: espace.jeton, jetonAdmin: espace.jetonAdmin, dossierPublic: join(racineCode, 'public'),
  dossierSauvegardes: espace.dossierSauvegardes, cleSauvegarde: espace.cleSauvegarde,
  hotesAutorises: (process.env.JARVIS_HOTES_AUTORISES ?? '').split(',').filter(Boolean),
  liensEspaces: JSON.parse(process.env.JARVIS_LIENS_ESPACES ?? '[]'),
});
serveur.listen(espace.port, process.env.JARVIS_ADRESSE ?? '127.0.0.1', () => {
  journaliser(db, { acteur: 'service', evenement: 'DEMARRAGE', detail: { espace: id, port: espace.port, isolation: jarvis.isolation } });
  console.log(`JARVIS « ${espace.libelle} » (données fictives) : http://127.0.0.1:${espace.port} — agents isolés : ${jarvis.isolation}`);
});

let enCours = false;
const boucle = setInterval(async () => { if (enCours) return; enCours = true; try { await jarvis.tick(); } catch (e) { console.error('Erreur de boucle :', e.message); } finally { enCours = false; } }, 2000);
const surveillance = setInterval(() => {
  try {
    for (const a of diagnostic(db, { dossierDonnees: espace.dossier }).alertes.filter((x) => x.niveau === 'critique')) console.error(`ALERTE ${a.code} : ${a.message}`);
    const s = derniereSauvegarde(db);
    if (!s || horloge.maintenant() - Date.parse(s.ts) > 24 * 3600 * 1000) sauvegarder(db, espace.dossierSauvegardes, espace.cleSauvegarde);
  } catch (e) { console.error('Erreur de surveillance :', e.message); }
}, 30000);
function arreter() {
  clearInterval(boucle); clearInterval(surveillance); serveur.close();
  const a = setInterval(() => { if (!enCours) { clearInterval(a); journaliser(db, { acteur: 'service', evenement: 'ARRET_PROPRE', detail: {} }); db.close(); process.exit(0); } }, 100);
}
process.on('SIGINT', arreter); process.on('SIGTERM', arreter);
