// Point d'entrée du service permanent : serveur + boucle de missions + surveillance + sauvegarde quotidienne.
// À lancer comme service Windows (voir docs/05_INSTALLATION_WINDOWS.md). Redémarrable à tout moment : l'état est dans SQLite.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { ouvrir, journaliser } from './db.js';
import { Jarvis } from './orchestrateur.js';
import { creerAgentDevis } from './agents/devis.js';
import { creerServeur } from './serveur.js';
import { diagnostic } from './sante.js';
import { sauvegarder, derniereSauvegarde } from './sauvegarde.js';
import { horloge } from './horloge.js';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..');

if ((process.env.JARVIS_MODE ?? 'demo') !== 'demo') {
  console.error('Mode « reel » volontairement NON implémenté : aucune donnée réelle sans autorisation écrite de l’entreprise (voir docs/04_SECURITE.md).');
  process.exit(2);
}

const dossierExploitation = process.env.JARVIS_DONNEES ?? join(racine, 'data', 'exploitation');
mkdirSync(dossierExploitation, { recursive: true });
const port = Number(process.env.JARVIS_PORT ?? 8160);
const adresse = process.env.JARVIS_ADRESSE ?? '127.0.0.1';
let jeton = process.env.JARVIS_TOKEN;
if (!jeton) {
  jeton = randomBytes(24).toString('base64url');
  console.log(`Jeton de démonstration généré (affiché une seule fois) : ${jeton}`);
}
const cleSauvegarde = process.env.JARVIS_CLE_SAUVEGARDE ?? null;

const db = ouvrir(join(dossierExploitation, 'jarvis.sqlite'));
const jarvis = new Jarvis({
  db,
  agents: [creerAgentDevis()],
  dossierDonnees: dossierExploitation,
  dossierFictif: join(racine, 'data', 'fictif'),
  dossierSorties: join(dossierExploitation, 'sorties'),
});

const serveur = creerServeur({
  jarvis, jeton, dossierPublic: join(racine, 'public'),
  dossierSauvegardes: join(dossierExploitation, 'sauvegardes'), cleSauvegarde,
  hotesAutorises: (process.env.JARVIS_HOTES_AUTORISES ?? '').split(',').filter(Boolean),
});
serveur.listen(port, adresse, () => {
  journaliser(db, { acteur: 'service', evenement: 'DEMARRAGE', detail: { adresse, port } });
  console.log(`JARVIS (démo, données fictives) : http://${adresse}:${port}`);
});

let enCours = false;
const boucle = setInterval(async () => {
  if (enCours) return; // jamais deux exécutions simultanées dans ce processus
  enCours = true;
  try { await jarvis.tick(); } catch (e) { console.error('Erreur de boucle :', e.message); } finally { enCours = false; }
}, 2000);

const surveillance = setInterval(() => {
  try {
    const d = diagnostic(db, { dossierDonnees: dossierExploitation });
    for (const a of d.alertes.filter((x) => x.niveau === 'critique')) console.error(`ALERTE ${a.code} : ${a.message}`);
    const s = derniereSauvegarde(db);
    if (cleSauvegarde && (!s || horloge.maintenant() - Date.parse(s.ts) > 24 * 3600 * 1000)) {
      sauvegarder(db, join(dossierExploitation, 'sauvegardes'), cleSauvegarde);
    }
  } catch (e) { console.error('Erreur de surveillance :', e.message); }
}, 30000);

function arreter() {
  clearInterval(boucle);
  clearInterval(surveillance);
  serveur.close();
  const attendre = setInterval(() => {
    if (!enCours) { clearInterval(attendre); journaliser(db, { acteur: 'service', evenement: 'ARRET_PROPRE', detail: {} }); db.close(); process.exit(0); }
  }, 100);
}
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
