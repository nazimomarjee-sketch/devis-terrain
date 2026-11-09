// Supervision permanente : agents, AUDITEUR et ORCHESTRATEUR sont supervisés ; incidents détectés ; pas de double exécution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { environnement, traiter, lire, requete, json, DEMANDE_TYPE, RACINE } from './aide.js';
import { AUDITEURS } from '../src/auditeurs/index.js';
import { autotestAuditeurs, falsifier } from '../src/autotest.js';
import { diagnostic } from '../src/sante.js';
import { definirParam, journaliser } from '../src/db.js';
import { creerServeur } from '../src/serveur.js';
import { horloge } from '../src/horloge.js';

const ici = dirname(fileURLToPath(import.meta.url));
const U = 'jeton-utilisateur-0123456789-abcdef'; const A = 'jeton-administrateur-0123456789-abcdef';
const codes = (e) => diagnostic(e.db, { dossierDonnees: e.cfg.dossier }).alertes.map((a) => a.code);

test('auto-test de l’auditeur : sain sur les 8 agents (canari) ; falsificateur générique fonctionnel', async () => {
  const r = await autotestAuditeurs(); assert.equal(r.ok, true, r.echecs.join(' ; ')); assert.equal(r.verifies.length, 8);
  assert.equal(falsifier({ a: 'x' }), null); assert.equal(falsifier({ total_cents: 5 }).total_cents, 6);
});

test('auditeur « tampon encreur » (valide tout) DÉTECTÉ par l’auto-test ; l’orchestrateur passe en échec fermé puis se rétablit', async () => {
  const e = environnement(); const original = AUDITEURS.devis;
  try {
    const m = await traiter(e, DEMANDE_TYPE); assert.equal(m.statut, 'EN_ATTENTE_APPROBATION');
    AUDITEURS.devis = () => ({ verdict: 'VALIDE', controles: [], echecs: [], horodatage: '' }); // auditeur corrompu
    const r = await e.jarvis.autotester(); assert.equal(r.ok, false); assert.match(r.echecs.join(), /devis : FAUX NÉGATIF/);
    assert.ok(codes(e).includes('AUDITEUR_DEFAILLANT'));
    assert.ok(e.db.prepare(`SELECT 1 FROM journal WHERE evenement='AUDITEUR_DEFAILLANT'`).get());
    // Échec fermé : plus d'approbation, plus de prise de mission.
    assert.throws(() => e.jarvis.approuver(m.id, 'approuver'), /Auditeur défaillant/);
    const { id } = e.jarvis.deposerParUtilisateur('planifie ma journée');
    assert.deepEqual(await e.jarvis.tick(), { action: 'auditeur_defaillant' }); assert.equal(lire(e.db, id).statut, 'EN_FILE');
    // Rétablissement.
    AUDITEURS.devis = original; assert.equal((await e.jarvis.autotester()).ok, true);
    assert.ok(!codes(e).includes('AUDITEUR_DEFAILLANT')); assert.deepEqual(e.jarvis.approuver(m.id, 'approuver'), { statut: 'VALIDE', envoi: 'SIMULE' });
    await e.jarvis.executerJusquaVide(); assert.equal(lire(e.db, id).statut, 'VALIDE');
  } finally { AUDITEURS.devis = original; e.nettoyer(); }
});

test('auditeur trop strict (refuse tout) ou qui plante : détecté comme faux positif', async () => {
  const original = AUDITEURS.finance;
  try {
    AUDITEURS.finance = () => ({ verdict: 'A_CORRIGER', controles: [], echecs: ['tout refusé'] }); let r = await autotestAuditeurs(); assert.match(r.echecs.join(), /finance : FAUX POSITIF/);
    AUDITEURS.finance = () => { throw new Error('plantage'); }; r = await autotestAuditeurs(); assert.match(r.echecs.join(), /finance : l'auditeur a planté/);
  } finally { AUDITEURS.finance = original; }
});

test('auto-test jamais exécuté / ancien : signalé', async () => {
  const e = environnement();
  try {
    assert.ok(codes(e).includes('AUTOTEST_JAMAIS_EXECUTE')); await e.jarvis.autotester(); assert.ok(!codes(e).includes('AUTOTEST_JAMAIS_EXECUTE'));
    horloge.decalageMs = 3 * 3600 * 1000; assert.ok(codes(e).includes('AUTOTEST_ANCIEN'));
  } finally { e.nettoyer(); }
});

test('double exécution de contrôle : une dérive que l’AUDITEUR ne voit pas (champ libre aléatoire) est détectée', async () => {
  const sans = environnement({ agent: 'produits', defaut: { mode: 'detail_aleatoire', jusqua: 99 } });
  try { const m = await traiter(sans, 'contrôle du catalogue produits'); assert.equal(m.statut, 'VALIDE', 'sans double exécution, la dérive passe inaperçue (angle mort assumé de l’auditeur)'); } finally { sans.nettoyer(); }
  const e = environnement({ agent: 'produits', defaut: { mode: 'detail_aleatoire', jusqua: 1 } });
  try {
    definirParam(e.db, 'double_execution', 'toutes'); const m = await traiter(e, 'contrôle du catalogue produits');
    assert.equal(m.statut, 'VALIDE'); assert.equal(m.corrections, 1);
    assert.ok(e.db.prepare(`SELECT 1 FROM journal WHERE evenement='RESULTATS_CONTRADICTOIRES' AND mission_id=?`).get(m.id)); assert.ok(codes(e).includes('RESULTATS_CONTRADICTOIRES'));
  } finally { e.nettoyer(); }
  const p = environnement({ agent: 'produits', defaut: { mode: 'detail_aleatoire', jusqua: 99 } });
  try { definirParam(p.db, 'double_execution', 'toutes'); const m = await traiter(p, 'contrôle du catalogue produits'); assert.equal(m.statut, 'ECHEC'); assert.equal(m.executions, 4); } finally { p.nettoyer(); }
});

test('double exécution : mode « sensibles » ne double que les actions sensibles ; résultats identiques = aucun faux positif sur les 8 agents', async () => {
  const e = environnement();
  try {
    definirParam(e.db, 'double_execution', 'toutes');
    for (const d of [DEMANDE_TYPE, 'contrôle du catalogue produits', 'priorise les prospects', 'dossier du client Garage Martin', 'prépare les relances', 'prépare la commande du devis DEV-2026-012', 'analyse financière', 'planifie ma journée']) {
      const m = await traiter(e, d); assert.ok(['VALIDE', 'EN_ATTENTE_APPROBATION'].includes(m.statut), `${d} → ${m.statut} ${m.raison}`); assert.equal(m.corrections, 0, d);
    }
    assert.equal(e.db.prepare(`SELECT COUNT(*) AS n FROM journal WHERE evenement='RESULTATS_CONTRADICTOIRES'`).get().n, 0);
  } finally { e.nettoyer(); }
});

test('AUCUN double envoi : deux processus approuvent la même mission en même temps → UN seul envoi (et index unique en garde-fou)', async () => {
  const e = environnement();
  try {
    const m = await traiter(e, DEMANDE_TYPE); e.db.close();
    const lancer = () => promisify(execFile)(process.execPath, ['--disable-warning=ExperimentalWarning', join(ici, 'approbateur.js'), e.racine, m.id, String(horloge.gele)])
      .then((s) => { try { return JSON.parse(s.stdout); } catch { return { erreur: `SORTIE ILLISIBLE : ${s.stdout.slice(0, 200)} | ${s.stderr.slice(0, 200)}` }; } })
      .catch((err) => ({ erreur: `PROCESSUS EN ÉCHEC : ${String(err.message).slice(0, 300)}` })); // diagnostic complet en cas d'intermittence
    const sorties = await Promise.all([lancer(), lancer(), lancer()]);
    // Propriété : JAMAIS plus d'un envoi. Sous forte charge, un processus peut échouer sur un verrou occupé : on tolère 0 succès (puis reprise), jamais 2.
    const oks = sorties.filter((s) => s.ok); assert.ok(oks.length <= 1, `DOUBLE ENVOI : ${JSON.stringify(sorties)}`);
    assert.ok(sorties.every((s) => s.ok || s.erreur), JSON.stringify(sorties));
    const { ouvrir } = await import('../src/db.js'); const db = ouvrir(e.fichierDb);
    if (oks.length === 0) { const { Jarvis } = await import('../src/orchestrateur.js'); const j = new Jarvis({ db, espace: e.cfg, racineCode: RACINE }); assert.deepEqual(j.approuver(m.id, 'approuver'), { statut: 'VALIDE', envoi: 'SIMULE' }); }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 1);
    assert.throws(() => db.prepare(`INSERT INTO sorties(ts, mission_id, type, simule, contenu) VALUES ('x', ?, 'MAIL_ENVOI_SIMULE', 1, '{}')`).run(m.id), /UNIQUE/);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM journal WHERE evenement='APPROUVE_ENVOI_SIMULE'`).get().n, 1); db.close();
  } finally { e.nettoyer(); }
});

async function avecServeur(fn) {
  const e = environnement(); const s = creerServeur({ jarvis: e.jarvis, jeton: U, jetonAdmin: A, dossierPublic: join(RACINE, 'public') });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  try { await fn(s.address().port, e); } finally { s.close(); e.nettoyer(); }
}

test('accès refusés : agrégés dans le journal, alerte à partir de 10 ; pas d’inondation du journal', async () => {
  await avecServeur(async (port, e) => {
    const avant = e.db.prepare('SELECT COUNT(*) AS n FROM journal').get().n;
    for (let i = 0; i < 12; i++) await requete(port, { chemin: '/api/etat', jeton: `mauvais-${i}` });
    await requete(port, { chemin: '/api/sante' }); // la sonde du superviseur déclenche le vidage des compteurs
    const apres = e.db.prepare('SELECT COUNT(*) AS n FROM journal').get().n; assert.ok(apres - avant <= 2, `${apres - avant} lignes pour 12 refus : le journal est noyé`);
    const ev = e.db.prepare(`SELECT detail FROM journal WHERE evenement='ACCES_REFUSES'`).all().map((r) => JSON.parse(r.detail)); assert.ok(ev.reduce((s, x) => s + x.n, 0) >= 10);
    assert.ok(codes(e).includes('ACCES_NON_AUTORISES'));
    assert.ok(!JSON.stringify(ev).includes('mauvais-'), 'les jetons essayés ne sont JAMAIS journalisés');
  });
});

test('escalade de privilège (jeton utilisateur sur route admin et inverse) : tracée, limitée en débit, alerte critique', async () => {
  await avecServeur(async (port, e) => {
    for (let i = 0; i < 20; i++) assert.equal((await requete(port, { methode: 'POST', chemin: '/api/admin/regles', jeton: U, corps: {} })).code, 403);
    assert.equal((await requete(port, { chemin: '/api/etat', jeton: A })).code, 403);
    const n = e.db.prepare(`SELECT COUNT(*) AS n FROM journal WHERE evenement='ESCALADE_PRIVILEGE_TENTEE'`).get().n; assert.ok(n >= 1 && n <= 2, `${n} événements pour 21 tentatives`);
    assert.ok(codes(e).includes('ESCALADE_PRIVILEGE_TENTEE'));
  });
});

test('sonde de vie /api/sante : sans jeton, MINIMALE (aucune donnée) ; reflète le battement et les alertes critiques', async () => {
  await avecServeur(async (port, e) => {
    const r0 = await requete(port, { chemin: '/api/sante' }); assert.equal(r0.code, 200); const s0 = json(r0);
    assert.deepEqual(Object.keys(s0).sort(), ['battement_age_s', 'critiques', 'ok']); assert.equal(s0.battement_age_s, null);
    await e.jarvis.tick(); assert.equal(json(await requete(port, { chemin: '/api/sante' })).battement_age_s, 0);
    e.jarvis.arreterTout(); const s1 = json(await requete(port, { chemin: '/api/sante' })); assert.equal(s1.ok, false); assert.ok(s1.critiques >= 1);
    assert.ok(!JSON.stringify(s1).includes('M-2026'));
  });
});

test('erreurs répétées, mission en erreur répétée et file bloquée (orchestrateur silencieux) : alertes', async () => {
  const e = environnement();
  try {
    for (let i = 0; i < 3; i++) journaliser(e.db, { missionId: 'M-20261109-aaaaaa', acteur: 'devis', evenement: 'AGENT_ERREUR', detail: { message: 'x' } });
    assert.ok(codes(e).includes('MISSION_EN_ERREUR_REPETEE'));
    for (let i = 0; i < 8; i++) journaliser(e.db, { acteur: 'devis', evenement: 'AGENT_ERREUR', detail: { message: 'x' } });
    assert.ok(codes(e).includes('ERREURS_REPETEES'));
    // File bloquée : service vivant (battement récent) mais mission en attente depuis > 10 min.
    e.jarvis.deposerParUtilisateur('planifie ma journée'); definirParam(e.db, 'battement', horloge.maintenant() + 15 * 60000); horloge.decalageMs = 15 * 60000;
    assert.ok(codes(e).includes('FILE_BLOQUEE'));
  } finally { e.nettoyer(); }
});
