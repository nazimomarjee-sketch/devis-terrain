// Missions concurrentes : plusieurs PROCESSUS JARVIS complets (agents + auditeur réels) se partagent une file de 24 missions de 8 agents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { environnement, DEMANDE_TYPE } from './aide.js';
import { verifierJournal } from '../src/db.js';
import { horloge } from '../src/horloge.js';

const ici = dirname(fileURLToPath(import.meta.url));
const DEMANDES = [
  DEMANDE_TYPE, 'devis pour le garage Durand : 2 vernis', 'devis pour le garage Métropole Test : 1 vernis',
  'contrôle du catalogue produits', 'fiche produit DUR-2500', 'fiche produit PEI-0001',
  'priorise les prospects top 3', 'priorise les prospects top 5', 'priorise les prospects',
  'dossier du client Garage Martin', 'dossier du client Garage Durand', 'dossier du client Garage Métropole Test',
  'prépare les relances', 'prépare les relances aujourd’hui', 'relance les impayés',
  'prépare la commande du devis DEV-2026-012', 'suivi des commandes', 'suivi des commandes en cours',
  'analyse financière', 'analyse financière : marge et encours', 'finance : anomalies de facturation',
  'planifie ma journée', 'planning du jour et priorités', 'organise mon agenda',
];

for (const mode of ['direct', 'isole']) {
  test(`concurrence (${mode}) : 4 processus, 24 missions des 8 agents — chacune exécutée UNE fois, toutes auditées, journal intact`, async () => {
    const e = environnement();
    try {
      const ids = DEMANDES.map((d) => e.jarvis.deposerParUtilisateur(d).id);
      e.db.close(); // les ouvriers ouvrent leur propre connexion
      const gele = String(horloge.gele);
      const lancer = (nom) => promisify(execFile)(process.execPath, ['--disable-warning=ExperimentalWarning', join(ici, 'ouvrier-complet.js'), e.racine, nom, gele, mode], { timeout: 120000 });
      await Promise.all(['A', 'B', 'C', 'D'].map(lancer));
      const { ouvrir } = await import('../src/db.js');
      const db = ouvrir(e.fichierDb);
      const ms = db.prepare('SELECT id, statut, executions, corrections, reprises, agent FROM missions ORDER BY rowid').all();
      assert.equal(ms.length, 24);
      for (const m of ms) {
        assert.ok(['VALIDE', 'EN_ATTENTE_APPROBATION'].includes(m.statut), `${m.id} ${m.agent} → ${m.statut}`);
        assert.equal(m.executions, 1, `${m.id} exécutée ${m.executions} fois`); assert.equal(m.corrections, 0); assert.equal(m.reprises, 0);
      }
      assert.deepEqual(new Set(ms.map((m) => m.agent)), new Set(['devis', 'produits', 'prospection', 'clients', 'relances', 'commandes', 'finance', 'planification']));
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM journal WHERE evenement='PLAN'`).get().n, 24);
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM journal WHERE evenement='AUDIT'`).get().n, 24);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0, 'aucun envoi sans validation');
      assert.equal(verifierJournal(db).ok, true, 'chaîne de hachage intacte malgré 4 écrivains');
      assert.deepEqual(new Set(ms.map((m) => m.id)), new Set(ids));
      db.close();
    } finally { e.nettoyer(); }
  });
}
