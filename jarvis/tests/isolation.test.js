// Isolation RÉELLE des agents : processus Node séparé, modèle de permissions, environnement vide, limites de délai et de sortie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { environnement, traiter, evenements, DEMANDE_TYPE } from './aide.js';
import { definirParam } from '../src/db.js';

const erreurs = (e, id) => e.db.prepare(`SELECT detail FROM journal WHERE mission_id=? AND evenement='AGENT_ERREUR' ORDER BY seq`).all(id).map((r) => JSON.parse(r.detail).message);

test('isolé : un devis complet (calculs, PDF, mail) donne le même résultat que le mode direct', async () => {
  const e = environnement({ isolation: true });
  try {
    const m = await traiter(e, DEMANDE_TYPE);
    assert.equal(m.statut, 'EN_ATTENTE_APPROBATION');
    const r = JSON.parse(m.resultat); assert.equal(r.total_ttc_cents, 31795);
    assert.ok(existsSync(join(e.dossierSorties, r.fichiers.pdf.chemin)), 'le processus isolé a pu écrire dans SON dossier de sortie');
  } finally { e.nettoyer(); }
});

test('isolé : un agent ne peut lire AUCUN fichier hors du code (base de données, secrets, autres espaces)', async () => {
  const e = environnement({ agent: 'finance', defaut: { mode: 'lecture_interdite', jusqua: 1, chemin: '' }, isolation: true });
  try {
    const secret = join(e.racine, 'secret.txt'); writeFileSync(secret, 'MOT-DE-PASSE-TRES-SECRET');
    for (const cible of [secret, e.fichierDb, '/etc/passwd', join(e.cfg.dossierJeu, 'clients.json')]) {
      const env = environnement({ agent: 'finance', defaut: { mode: 'lecture_interdite', jusqua: 99, chemin: cible }, isolation: true });
      try {
        const m = await traiter(env, 'analyse financière');
        assert.equal(m.statut, 'ECHEC');
        const msgs = erreurs(env, m.id);
        assert.ok(msgs.length === 4 && msgs.every((x) => /ERR_ACCESS_DENIED/.test(x)), `lecture de ${cible} : ${msgs[0]}`);
        assert.ok(!JSON.stringify(env.db.prepare('SELECT detail FROM journal').all()).includes('MOT-DE-PASSE'));
      } finally { env.nettoyer(); }
    }
  } finally { e.nettoyer(); }
});

test('isolé : écriture hors du dossier de sortie, lancement de processus : refusés', async () => {
  for (const [mode, motif] of [['ecriture_interdite', /écriture refusée : ERR_ACCESS_DENIED/], ['processus_enfant', /processus refusé : ERR_ACCESS_DENIED/]]) {
    const e = environnement({ agent: 'produits', defaut: { mode, jusqua: 1, chemin: join(process.cwd(), 'tests', 'intrus.txt') }, isolation: true });
    try {
      const m = await traiter(e, 'contrôle du catalogue produits');
      assert.match(erreurs(e, m.id)[0], motif); assert.equal(m.corrections, 1);
      assert.ok(!existsSync(join(process.cwd(), 'tests', 'intrus.txt')));
    } finally { e.nettoyer(); }
  }
});

test('isolé : l’environnement de l’agent est VIDE — aucun jeton, aucune clé du service ne lui est transmis', async () => {
  process.env.JARVIS_ODICOLOR_TOKEN = 'jeton-qui-ne-doit-jamais-fuiter-0123456789';
  process.env.JARVIS_ODICOLOR_ADMIN_TOKEN = 'admin-qui-ne-doit-jamais-fuiter-0123456789';
  const e = environnement({ agent: 'devis', defaut: { mode: 'espionner_env', jusqua: 99 }, isolation: true });
  try {
    const m = await traiter(e, DEMANDE_TYPE);
    const msgs = erreurs(e, m.id);
    assert.ok(msgs[0].startsWith('ENV:')); assert.ok(!/JARVIS|TOKEN/.test(msgs[0]), msgs[0]);
    assert.ok(msgs[0].includes('NODE_ENV'));
  } finally { delete process.env.JARVIS_ODICOLOR_TOKEN; delete process.env.JARVIS_ODICOLOR_ADMIN_TOKEN; e.nettoyer(); }
});

test('droits de lecture : chaque agent ne reçoit QUE les jeux de données qu’il déclare', async () => {
  const ATTENDU = { devis: 'catalogue,clients', produits: 'catalogue', prospection: 'prospects', clients: 'clients,commandes,devis_historique,factures,paiements', relances: 'clients,devis_historique,factures,paiements',
    commandes: 'catalogue,clients,commandes,devis_historique', finance: 'catalogue,clients,commandes,factures,paiements', planification: 'missions_en_attente,taches' };
  const DEMANDES = { devis: DEMANDE_TYPE, produits: 'contrôle du catalogue produits', prospection: 'priorise les prospects', clients: 'dossier du client Garage Martin', relances: 'prépare les relances', commandes: 'suivi des commandes', finance: 'analyse financière', planification: 'planifie ma journée' };
  for (const [agent, jeux] of Object.entries(ATTENDU)) {
    const e = environnement({ agent, defaut: { mode: 'espionner_donnees', jusqua: 1 }, isolation: false });
    try {
      const m = await traiter(e, DEMANDES[agent]);
      assert.equal(erreurs(e, m.id)[0], `DONNEES:${jeux}`, `${agent} a reçu d’autres jeux que ses droits`);
    } finally { e.nettoyer(); }
  }
});

test('isolé : délai maximum — le processus agent est TUÉ (pas seulement ignoré)', async () => {
  const e = environnement({ agent: 'planification', defaut: { mode: 'lent', jusqua: 1 }, isolation: true });
  try {
    definirParam(e.db, 'delai_mission_ms', '400'); const t0 = Date.now();
    const m = await traiter(e, 'planifie ma journée');
    assert.ok(Date.now() - t0 < 8000); assert.match(erreurs(e, m.id)[0], /Délai dépassé.*processus agent arrêté/); assert.equal(m.corrections, 1); assert.equal(m.statut, 'VALIDE');
  } finally { e.nettoyer(); }
});

test('isolé : une sortie démesurée est coupée (processus tué, mission en échec contrôlé)', async () => {
  const e = environnement({ agent: 'prospection', defaut: { mode: 'sortie_geante', jusqua: 1 }, isolation: true });
  try { const m = await traiter(e, 'priorise les prospects'); assert.match(erreurs(e, m.id)[0], /trop volumineuse/); assert.equal(m.corrections, 1); } finally { e.nettoyer(); }
});

test('LIMITE CONNUE (documentée, non masquée) : le modèle de permissions de Node NE filtre PAS le réseau', async () => {
  const srv = http.createServer((q, r) => r.end('ok')); await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const e = environnement({ agent: 'finance', defaut: { mode: 'reseau', jusqua: 1, url: `http://127.0.0.1:${srv.address().port}/` }, isolation: true });
  try {
    const m = await traiter(e, 'analyse financière');
    assert.equal(erreurs(e, m.id)[0], 'RESEAU_JOIGNABLE', 'si ce test échoue après une mise à jour de Node, le réseau est désormais filtré : mettre à jour la documentation');
  } finally { srv.close(); e.nettoyer(); }
});

test('isolé : les huit agents donnent les mêmes statuts qu’en mode direct', async () => {
  const D = ['devis pour le garage Martin : 3 vernis', 'contrôle du catalogue produits', 'priorise les prospects', 'dossier du client Garage Martin', 'prépare les relances', 'prépare la commande du devis DEV-2026-012', 'analyse financière', 'planifie ma journée'];
  const a = environnement({ isolation: true }); const b = environnement({ isolation: false });
  try {
    for (const d of D) { const x = await traiter(a, d); const y = await traiter(b, d); assert.equal(x.statut, y.statut, d); assert.equal(x.agent, y.agent); assert.equal(JSON.parse(x.rapport_audit).verdict, 'VALIDE'); }
  } finally { a.nettoyer(); b.nettoyer(); }
});
