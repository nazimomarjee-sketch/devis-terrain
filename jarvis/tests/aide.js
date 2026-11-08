import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrir } from '../src/db.js';
import { Jarvis } from '../src/orchestrateur.js';
import { creerAgentDevis } from '../src/agents/devis.js';
import { horloge } from '../src/horloge.js';

export const FICTIF = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'fictif');
export const DEMANDE_TYPE = 'Jarvis, prépare un devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs';

/** Environnement isolé : base en fichier temporaire (pour tester plusieurs connexions), sorties temporaires. */
export function environnement({ defaut = null, memoire = false } = {}) {
  horloge.reinitialiser();
  const racine = mkdtempSync(join(tmpdir(), 'jarvis-test-'));
  const fichierDb = join(racine, 'jarvis.sqlite');
  const db = ouvrir(memoire ? ':memory:' : fichierDb);
  const jarvis = new Jarvis({
    db, agents: [creerAgentDevis({ defaut })],
    dossierDonnees: racine, dossierFictif: FICTIF, dossierSorties: join(racine, 'sorties'),
  });
  return {
    racine, fichierDb, db, jarvis,
    nettoyer() { try { db.close(); } catch { /* déjà fermée */ } rmSync(racine, { recursive: true, force: true }); horloge.reinitialiser(); },
  };
}

export const lire = (db, id) => db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
