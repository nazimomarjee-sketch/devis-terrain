import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { environnement, lire, DEMANDE_TYPE, FICTIF } from './aide.js';
import { ouvrir, definirParam } from '../src/db.js';
import { Jarvis } from '../src/orchestrateur.js';
import { creerAgentDevis } from '../src/agents/devis.js';
import { reclamer, terminerSiBail, deposer, recupererBaux } from '../src/moteur.js';
import { horloge } from '../src/horloge.js';
import { diagnostic } from '../src/sante.js';
import { metriques } from '../src/metriques.js';

const ici = dirname(fileURLToPath(import.meta.url));
const evenements = (db, id) => db.prepare('SELECT evenement FROM journal WHERE mission_id = ? ORDER BY seq').all(id).map((r) => r.evenement);

test('reprise après crash : ouvrier mort + redémarrage complet du processus, la mission aboutit', async () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    reclamer(e.db, 'ouvrier-qui-va-mourir', 1000); // il prend la mission puis « plante »
    assert.equal(lire(e.db, id).statut, 'EN_COURS');
    e.db.close(); // le processus meurt

    horloge.decalageMs = 5 * 60 * 1000; // 5 minutes plus tard, le service redémarre
    const db2 = ouvrir(e.fichierDb);
    const j2 = new Jarvis({ db: db2, agents: [creerAgentDevis()], dossierDonnees: e.racine, dossierFictif: FICTIF, dossierSorties: join(e.racine, 'sorties') });
    await j2.executerJusquaVide();
    const m = lire(db2, id);
    assert.equal(m.statut, 'EN_ATTENTE_APPROBATION');
    assert.equal(m.reprises, 1);
    assert.ok(evenements(db2, id).includes('REPRISE_APRES_INTERRUPTION'));
    db2.close();
  } finally { e.nettoyer(); }
});

test('plafond de reprises : 4 interruptions consécutives sans jamais terminer → ECHEC et escalade', () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    for (let i = 0; i < 4; i++) {
      reclamer(e.db, `mort-${i}`, 1000); // un ouvrier prend la mission puis meurt
      horloge.decalageMs += 10 * 60 * 1000;
      recupererBaux(e.db);
    }
    const m = lire(e.db, id);
    assert.equal(m.statut, 'ECHEC');
    assert.equal(m.reprises, 4);
    assert.ok(evenements(e.db, id).includes('ECHEC_REPRISES_EPUISEES'));
    assert.equal(diagnostic(e.db).ok, false, 'une mission en échec doit déclencher une alerte critique');
  } finally { e.nettoyer(); }
});

test('aucun doublon d’exécution entre plusieurs PROCESSUS qui se disputent la file', async () => {
  const e = environnement();
  try {
    const ids = new Set();
    for (let i = 0; i < 30; i++) ids.add(deposer(e.db, { demande: `devis pour le garage Martin : ${i + 1} vernis`, source: 'canal_utilisateur' }).id);
    const lancer = (nom) => promisify(execFile)(process.execPath, ['--disable-warning=ExperimentalWarning', join(ici, 'ouvrier.js'), e.fichierDb, nom]);
    const sorties = await Promise.all(['A', 'B', 'C', 'D'].map(lancer));
    const toutes = sorties.flatMap((s) => JSON.parse(s.stdout));
    assert.equal(toutes.length, 30, 'chaque mission est prise');
    assert.equal(new Set(toutes).size, 30, 'aucune mission prise deux fois');
    assert.deepEqual(new Set(toutes), ids);
  } finally { e.nettoyer(); }
});

test('idempotence : le même dépôt envoyé deux fois (réseau instable) ne crée qu’une mission', () => {
  const e = environnement();
  try {
    const a = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE, { cle: 'tel-001' });
    const b = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE, { cle: 'tel-001' });
    assert.equal(b.doublon, true);
    assert.equal(a.id, b.id);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM missions').get().n, 1);
  } finally { e.nettoyer(); }
});

test('un ouvrier qui a perdu son bail ne peut pas écraser le résultat', () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    reclamer(e.db, 'lent', 1000);
    assert.equal(terminerSiBail(e.db, id, 'usurpateur', { statut: 'VALIDE' }), false);
    assert.equal(lire(e.db, id).statut, 'EN_COURS');
    assert.ok(evenements(e.db, id).includes('RESULTAT_ABANDONNE_BAIL_PERDU'));
  } finally { e.nettoyer(); }
});

const DEMANDE_MASTIC = 'devis pour le garage Martin : 4 mastics';
const FAUTES = [
  ['prix_faux', DEMANDE_TYPE], ['total_faux', DEMANDE_TYPE], ['client_invente', DEMANDE_TYPE], ['copie_notes', 'devis pour le garage Durand : 2 vernis'],
  ['ligne_omise', DEMANDE_TYPE], ['remise_ignoree', DEMANDE_TYPE], ['avertissement_masque', DEMANDE_MASTIC],
];

for (const [mode, demande] of FAUTES) {
  test(`erreur volontaire « ${mode} » : détectée, corrigée automatiquement, puis validée`, async () => {
    const e = environnement({ defaut: { mode, jusqua: 1 } });
    try {
      const { id } = e.jarvis.deposerParUtilisateur(demande);
      await e.jarvis.executerJusquaVide();
      const m = lire(e.db, id);
      assert.equal(m.statut, 'EN_ATTENTE_APPROBATION', `${mode} : ${m.raison}`);
      assert.equal(m.corrections, 1);
      const ev = evenements(e.db, id);
      assert.ok(ev.includes('CORRECTION_DEMANDEE'));
      assert.equal(JSON.parse(m.rapport_audit).verdict, 'VALIDE');
    } finally { e.nettoyer(); }
  });

  test(`erreur volontaire PERSISTANTE « ${mode} » : 3 corrections puis escalade humaine, jamais d’envoi`, async () => {
    const e = environnement({ defaut: { mode, jusqua: 99 } });
    try {
      const { id } = e.jarvis.deposerParUtilisateur(demande);
      const actions = await e.jarvis.executerJusquaVide(20);
      const m = lire(e.db, id);
      assert.equal(m.statut, 'ECHEC');
      assert.equal(m.executions, 4, '1 exécution + 3 corrections, pas une de plus');
      assert.equal(actions.length, 4);
      assert.ok(evenements(e.db, id).includes('ESCALADE_HUMAINE'));
      assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0);
      assert.throws(() => e.jarvis.approuver(id, 'approuver'), /statut ECHEC/);
    } finally { e.nettoyer(); }
  });
}

test('panne volontaire de l’agent (exception) : récupérée, puis escalade si persistante', async () => {
  const e = environnement({ defaut: { mode: 'exception', jusqua: 99 } });
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    await e.jarvis.executerJusquaVide(20);
    const m = lire(e.db, id);
    assert.equal(m.statut, 'ECHEC');
    assert.equal(m.executions, 4);
    assert.ok(evenements(e.db, id).includes('AGENT_ERREUR'));
  } finally { e.nettoyer(); }
});

test('délai maximum : un agent trop lent est interrompu puis la mission est relancée', async () => {
  const e = environnement({ defaut: { mode: 'lent', jusqua: 1 } });
  try {
    definirParam(e.db, 'delai_mission_ms', '80');
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    const t0 = Date.now();
    await e.jarvis.executerJusquaVide(10);
    assert.ok(Date.now() - t0 < 5000, 'ne doit pas attendre 60 s');
    const m = lire(e.db, id);
    assert.equal(m.statut, 'EN_ATTENTE_APPROBATION');
    assert.equal(m.corrections, 1);
  } finally { e.nettoyer(); }
});

test('arrêt d’urgence : par paramètre OU par fichier ARRET, aucune mission traitée', async () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    e.jarvis.arreterTout();
    assert.deepEqual(await e.jarvis.tick(), { action: 'arret_urgence' });
    assert.equal(lire(e.db, id).statut, 'EN_FILE');
    assert.ok(diagnostic(e.db, { dossierDonnees: e.racine }).alertes.some((a) => a.code === 'ARRET_URGENCE'));
    e.jarvis.reprendre();
    writeFileSync(join(e.racine, 'ARRET'), '');
    assert.deepEqual(await e.jarvis.tick(), { action: 'arret_urgence' }, 'le fichier ARRET fonctionne même si la base ne répond plus aux ordres');
    assert.equal(lire(e.db, id).statut, 'EN_FILE');
  } finally { e.nettoyer(); }
});

test('budget : une mission qui dépasse le budget du jour bloque les suivantes AVANT tout travail', async () => {
  const e = environnement({ defaut: { mode: 'depense', jusqua: 99, cents: 600 } });
  try {
    definirParam(e.db, 'budget_jour_cents', '500');
    const a = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    const b = e.jarvis.deposerParUtilisateur('devis pour le garage Durand : 1 vernis');
    await e.jarvis.executerJusquaVide();
    assert.equal(lire(e.db, a.id).statut, 'EN_ATTENTE_APPROBATION'); // lancée avant dépassement
    const mb = lire(e.db, b.id);
    assert.equal(mb.statut, 'BLOQUE');
    assert.match(mb.raison, /Budget/);
    assert.equal(mb.cout_cents, 0);
    assert.ok(diagnostic(e.db).alertes.some((x) => x.code === 'BUDGET_ATTEINT'));
  } finally { e.nettoyer(); }
});

test('porte humaine : approbation impossible si le résultat ou un fichier a été modifié après l’audit', async () => {
  const e = environnement();
  try {
    const a = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    const b = e.jarvis.deposerParUtilisateur('devis pour le garage Durand : 1 vernis');
    await e.jarvis.executerJusquaVide();

    // 1) Résultat modifié directement en base
    const r = JSON.parse(lire(e.db, a.id).resultat);
    r.total_ttc_cents = 1;
    e.db.prepare('UPDATE missions SET resultat = ? WHERE id = ?').run(JSON.stringify(r), a.id);
    assert.throws(() => e.jarvis.approuver(a.id, 'approuver'), /modifié depuis l’audit/);

    // 2) PDF modifié sur le disque
    const rb = JSON.parse(lire(e.db, b.id).resultat);
    appendFileSync(join(e.racine, 'sorties', rb.fichiers.pdf.chemin), 'falsification');
    assert.throws(() => e.jarvis.approuver(b.id, 'approuver'), /Nouvel audit négatif/);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0, 'rien n’est parti');
    // 3) Refus humain
    const c = e.jarvis.deposerParUtilisateur('devis pour le garage Durand : 2 vernis');
    await e.jarvis.executerJusquaVide();
    assert.deepEqual(e.jarvis.approuver(c.id, 'refuser'), { statut: 'REFUSE' });
    assert.throws(() => e.jarvis.approuver(c.id, 'approuver'), /statut REFUSE/);
  } finally { e.nettoyer(); }
});

test('agent inconnu : une demande sans agent compétent est bloquée avec une question', async () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur('analyse mon chiffre d’affaires du trimestre');
    await e.jarvis.executerJusquaVide();
    const m = lire(e.db, id);
    assert.equal(m.statut, 'BLOQUE');
    assert.match(m.raison, /Aucun agent compétent/);
  } finally { e.nettoyer(); }
});

test('métriques calculées sur l’état réel (réussite, erreurs détectées, corrections, interventions)', async () => {
  const e = environnement({ defaut: { mode: 'prix_faux', jusqua: 1 } });
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    await e.jarvis.executerJusquaVide();
    e.jarvis.approuver(id, 'approuver');
    const m = metriques(e.db);
    assert.equal(m.missions_total, 1);
    assert.equal(m.taux_reussite, 1);
    assert.equal(m.erreurs_detectees_par_audit, 1);
    assert.equal(m.taux_corrections_reussies, 1);
    assert.equal(m.interventions_humaines, 1);
  } finally { e.nettoyer(); }
});
