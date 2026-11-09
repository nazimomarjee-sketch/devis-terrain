import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { environnement, lire, traiter, evenements, DEMANDE_TYPE, RACINE } from './aide.js';
import { ouvrir, definirParam } from '../src/db.js';
import { Jarvis } from '../src/orchestrateur.js';
import { reclamer, terminerSiBail, deposer, recupererBaux } from '../src/moteur.js';
import { horloge } from '../src/horloge.js';
import { diagnostic } from '../src/sante.js';
import { metriques } from '../src/metriques.js';

const ici = dirname(fileURLToPath(import.meta.url));

test('reprise après crash : ouvrier mort + redémarrage complet du processus, la mission aboutit', async () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    reclamer(e.db, 'ouvrier-qui-va-mourir', 1000); // il prend la mission puis « plante »
    assert.equal(lire(e.db, id).statut, 'EN_COURS');
    e.db.close();
    horloge.decalageMs = 5 * 60 * 1000; // 5 minutes plus tard, le service redémarre
    const db2 = ouvrir(e.fichierDb);
    const j2 = new Jarvis({ db: db2, espace: e.cfg, racineCode: RACINE });
    await j2.executerJusquaVide();
    const m = lire(db2, id);
    assert.equal(m.statut, 'EN_ATTENTE_APPROBATION'); assert.equal(m.reprises, 1);
    assert.ok(evenements(db2, id).includes('REPRISE_APRES_INTERRUPTION'));
    db2.close();
  } finally { e.nettoyer(); }
});

test('plafond de reprises : 4 interruptions consécutives → ECHEC et alerte critique', () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    for (let i = 0; i < 4; i++) { reclamer(e.db, `mort-${i}`, 1000); horloge.decalageMs += 10 * 60 * 1000; recupererBaux(e.db); }
    const m = lire(e.db, id);
    assert.equal(m.statut, 'ECHEC'); assert.equal(m.reprises, 4);
    assert.ok(evenements(e.db, id).includes('ECHEC_REPRISES_EPUISEES'));
    assert.equal(diagnostic(e.db).ok, false);
  } finally { e.nettoyer(); }
});

test('aucun doublon d’exécution entre plusieurs PROCESSUS qui se disputent la file', async () => {
  const e = environnement();
  try {
    const ids = new Set();
    for (let i = 0; i < 30; i++) ids.add(deposer(e.db, { demande: `devis pour le garage Martin : ${i + 1} vernis`, source: 'canal_utilisateur' }).id);
    const lancer = (nom) => promisify(execFile)(process.execPath, ['--disable-warning=ExperimentalWarning', join(ici, 'ouvrier.js'), e.fichierDb, nom]);
    const toutes = (await Promise.all(['A', 'B', 'C', 'D'].map(lancer))).flatMap((s) => JSON.parse(s.stdout));
    assert.equal(toutes.length, 30); assert.equal(new Set(toutes).size, 30); assert.deepEqual(new Set(toutes), ids);
  } finally { e.nettoyer(); }
});

test('idempotence : le même dépôt envoyé deux fois ne crée qu’une mission', () => {
  const e = environnement();
  try {
    const a = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE, { cle: 'tel-001' }); const b = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE, { cle: 'tel-001' });
    assert.equal(b.doublon, true); assert.equal(a.id, b.id); assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM missions').get().n, 1);
  } finally { e.nettoyer(); }
});

test('FIFO déterministe : deux missions créées dans la même milliseconde sont traitées dans l’ordre de dépôt', async () => {
  const e = environnement();
  try {
    const ids = []; for (let i = 0; i < 6; i++) ids.push(e.jarvis.deposerParUtilisateur(`devis pour le garage Martin : ${i + 1} vernis`).id);
    const ordre = []; for (let i = 0; i < 6; i++) ordre.push((await e.jarvis.tick()).id);
    assert.deepEqual(ordre, ids);
  } finally { e.nettoyer(); }
});

test('un ouvrier qui a perdu son bail ne peut pas écraser le résultat', () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE); reclamer(e.db, 'lent', 1000);
    assert.equal(terminerSiBail(e.db, id, 'usurpateur', { statut: 'VALIDE' }), false);
    assert.equal(lire(e.db, id).statut, 'EN_COURS'); assert.ok(evenements(e.db, id).includes('RESULTAT_ABANDONNE_BAIL_PERDU'));
  } finally { e.nettoyer(); }
});

for (const [agent, demande] of [['devis', DEMANDE_TYPE], ['finance', 'analyse financière'], ['planification', 'planifie ma journée'], ['relances', 'prépare les relances']]) {
  test(`[${agent}] panne volontaire (exception) : récupérée puis escalade si persistante`, async () => {
    const e = environnement({ agent, defaut: { mode: 'exception', jusqua: 99 } });
    try { const m = await traiter(e, demande); assert.equal(m.statut, 'ECHEC'); assert.equal(m.executions, 4); assert.ok(evenements(e.db, m.id).includes('AGENT_ERREUR')); } finally { e.nettoyer(); }
  });
  test(`[${agent}] délai maximum : agent trop lent interrompu puis mission relancée`, async () => {
    const e = environnement({ agent, defaut: { mode: 'lent', jusqua: 1 } });
    try {
      definirParam(e.db, 'delai_mission_ms', '80'); const t0 = Date.now(); const m = await traiter(e, demande);
      assert.ok(Date.now() - t0 < 5000); assert.ok(['EN_ATTENTE_APPROBATION', 'VALIDE'].includes(m.statut)); assert.equal(m.corrections, 1);
    } finally { e.nettoyer(); }
  });
}

test('arrêt d’urgence : par paramètre OU par fichier ARRET, aucune mission traitée', async () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    e.jarvis.arreterTout();
    assert.deepEqual(await e.jarvis.tick(), { action: 'arret_urgence' }); assert.equal(lire(e.db, id).statut, 'EN_FILE');
    assert.ok(diagnostic(e.db, { dossierDonnees: e.cfg.dossier }).alertes.some((a) => a.code === 'ARRET_URGENCE'));
    e.jarvis.reprendre(); writeFileSync(join(e.cfg.dossier, 'ARRET'), '');
    assert.deepEqual(await e.jarvis.tick(), { action: 'arret_urgence' }); assert.equal(lire(e.db, id).statut, 'EN_FILE');
  } finally { e.nettoyer(); }
});

test('budget : une mission qui dépasse le budget du jour bloque les suivantes AVANT tout travail', async () => {
  const e = environnement({ agent: 'devis', defaut: { mode: 'depense', jusqua: 99, cents: 600 } });
  try {
    definirParam(e.db, 'budget_jour_cents', '500');
    const a = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE); const b = e.jarvis.deposerParUtilisateur('devis pour le garage Durand : 1 vernis');
    await e.jarvis.executerJusquaVide();
    assert.equal(lire(e.db, a.id).statut, 'EN_ATTENTE_APPROBATION');
    const mb = lire(e.db, b.id); assert.equal(mb.statut, 'BLOQUE'); assert.match(mb.raison, /Budget/); assert.equal(mb.cout_cents, 0);
    assert.ok(diagnostic(e.db).alertes.some((x) => x.code === 'BUDGET_ATTEINT'));
  } finally { e.nettoyer(); }
});

test('porte humaine : approbation impossible si le résultat ou un fichier a été modifié après l’audit', async () => {
  const e = environnement();
  try {
    const a = await traiter(e, DEMANDE_TYPE); const b = await traiter(e, 'devis pour le garage Durand : 1 vernis');
    const r = JSON.parse(a.resultat); r.total_ttc_cents = 1;
    e.db.prepare('UPDATE missions SET resultat = ? WHERE id = ?').run(JSON.stringify(r), a.id);
    assert.throws(() => e.jarvis.approuver(a.id, 'approuver'), /modifié depuis l’audit/);
    appendFileSync(join(e.dossierSorties, JSON.parse(b.resultat).fichiers.pdf.chemin), 'falsification');
    assert.throws(() => e.jarvis.approuver(b.id, 'approuver'), /Nouvel audit négatif/);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0);
    const c = await traiter(e, 'devis pour le garage Durand : 2 vernis');
    assert.deepEqual(e.jarvis.approuver(c.id, 'refuser'), { statut: 'REFUSE' }); assert.throws(() => e.jarvis.approuver(c.id, 'approuver'), /statut REFUSE/);
  } finally { e.nettoyer(); }
});

test('métriques calculées sur l’état réel (réussite, erreurs détectées, corrections, interventions)', async () => {
  const e = environnement({ agent: 'devis', defaut: { mode: 'prix_faux', jusqua: 1 } });
  try {
    const m = await traiter(e, DEMANDE_TYPE); e.jarvis.approuver(m.id, 'approuver');
    const x = metriques(e.db);
    assert.deepEqual([x.missions_total, x.taux_reussite, x.erreurs_detectees_par_audit, x.taux_corrections_reussies, x.interventions_humaines], [1, 1, 1, 1, 1]);
  } finally { e.nettoyer(); }
});
