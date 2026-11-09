import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrir } from '../src/db.js';
import { Jarvis } from '../src/orchestrateur.js';
import { configurerEspace } from '../src/espaces.js';
import { horloge } from '../src/horloge.js';

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FICTIF = join(RACINE, 'data', 'fictif', 'odicolor');
export const AUJOURDHUI = '2026-11-09';
export const DEMANDE_TYPE = 'Jarvis, prépare un devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs';

/** Environnement isolé : espace temporaire, horloge figée au 2026-11-09, un agent éventuellement saboté volontairement. */
export function environnement({ espace = 'odicolor', agent = null, defaut = null, isolation = false, memoire = false, dossierJeu = null } = {}) {
  horloge.reinitialiser();
  horloge.gele = Date.parse(`${AUJOURDHUI}T09:00:00Z`);
  const racine = mkdtempSync(join(tmpdir(), 'jarvis-test-'));
  const cfg = configurerEspace(espace, { racineDonnees: racine, racineCode: RACINE, env: {} });
  if (dossierJeu) cfg.dossierJeu = dossierJeu;
  mkdirSync(cfg.dossier, { recursive: true });
  const db = ouvrir(memoire ? ':memory:' : cfg.dbChemin);
  const agents = cfg.agents.map((nom) => ({ nom, options: nom === agent && defaut ? { defaut } : {} }));
  const jarvis = new Jarvis({ db, espace: cfg, agents, isolation, racineCode: RACINE });
  return {
    racine, cfg, fichierDb: cfg.dbChemin, dossierSorties: cfg.dossierSorties, db, jarvis,
    nettoyer() { try { db.close(); } catch { /* déjà fermée */ } rmSync(racine, { recursive: true, force: true }); horloge.reinitialiser(); },
  };
}

export const lire = (db, id) => db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
export const evenements = (db, id) => db.prepare('SELECT evenement FROM journal WHERE mission_id = ? ORDER BY seq').all(id).map((r) => r.evenement);

/** Dépose, exécute jusqu'à épuisement, retourne la mission. */
export async function traiter(e, demande) {
  const { id } = e.jarvis.deposerParUtilisateur(demande);
  await e.jarvis.executerJusquaVide();
  return lire(e.db, id);
}

import { AUDITEURS } from '../src/auditeurs/index.js';
import { reglesEnDict } from '../src/regles.js';

/** Appelle directement l'auditeur indépendant d'un agent sur un résultat (éventuellement falsifié). */
export function auditer(e, nomAgent, m, resultat, { missionsEnAttente = [], autorisations = [] } = {}) {
  return AUDITEURS[nomAgent]({ mission: { id: m.id, demande: m.demande }, resultat, regles: reglesEnDict(e.db), aujourdhui: AUJOURDHUI, dossierSorties: e.dossierSorties, dossierJeu: e.cfg.dossierJeu, missionsEnAttente, autorisations });
}

import http from 'node:http';
/** Requête HTTP de test vers 127.0.0.1:port. */
export function requete(port, { methode = 'GET', chemin = '/', jeton = null, corps = null, hote = null, brut = null } = {}) {
  return new Promise((ok, ko) => {
    const entetes = {};
    if (jeton) entetes.Authorization = `Bearer ${jeton}`;
    if (hote) entetes.Host = hote;
    const donnees = brut ?? (corps ? JSON.stringify(corps) : null);
    if (donnees) { entetes['Content-Type'] = 'application/json'; entetes['Content-Length'] = Buffer.byteLength(donnees); }
    const r = http.request({ host: '127.0.0.1', port, method: methode, path: chemin, headers: entetes }, (res) => {
      const m = []; res.on('data', (c) => m.push(c)); res.on('end', () => ok({ code: res.statusCode, entetes: res.headers, corps: Buffer.concat(m) }));
    });
    r.on('error', ko); if (donnees) r.write(donnees); r.end();
  });
}
export const json = (r) => JSON.parse(r.corps.toString('utf8'));
