// Surveillance : produit des alertes à partir de l'état réel (jamais d'un message « tout va bien » par défaut).
import { verifierJournal, param, sha256 } from './db.js';
import { horloge } from './horloge.js';
import { arretUrgence, depenseDuJour } from './moteur.js';
import { derniereSauvegarde } from './sauvegarde.js';

export function diagnostic(db, { dossierDonnees = null, exigerBattement = false } = {}) {
  const alertes = [];
  const add = (niveau, code, message) => alertes.push({ niveau, code, message });
  const now = horloge.maintenant();

  const chaine = verifierJournal(db);
  if (!chaine.ok) add('critique', 'JOURNAL_ALTERE', `Le journal d’audit a été modifié (rupture à la ligne ${chaine.rompu_a}).`);

  if (arretUrgence(db, dossierDonnees)) add('critique', 'ARRET_URGENCE', 'Arrêt d’urgence actif : aucune mission n’est traitée.');

  // Incohérence : un résultat stocké dont l'empreinte ne correspond plus a été modifié en dehors du circuit normal.
  const modifies = db.prepare(`SELECT id, resultat, resultat_hash FROM missions WHERE resultat IS NOT NULL`).all().filter((m) => sha256(m.resultat) !== m.resultat_hash).map((m) => m.id);
  if (modifies.length) add('critique', 'RESULTAT_MODIFIE', `Résultat modifié hors circuit pour : ${modifies.slice(0, 3).join(', ')}.`);

  // Incohérence : une mission validée par un humain doit avoir sa trace d'approbation dans le journal.
  const sansTrace = db.prepare(`SELECT m.id FROM missions m WHERE m.statut='VALIDE' AND m.decide_par IS NOT NULL AND NOT EXISTS (SELECT 1 FROM journal j WHERE j.mission_id = m.id AND j.evenement IN ('APPROUVE_ENVOI_SIMULE'))`).all();
  if (sansTrace.length) add('critique', 'VALIDATION_SANS_TRACE', `${sansTrace.length} mission(s) validée(s) sans trace d'approbation dans le journal.`);

  const evt = (nom, minutes) => db.prepare(`SELECT COUNT(*) AS n FROM journal WHERE evenement = ? AND ts > ?`).get(nom, new Date(now - minutes * 60000).toISOString()).n;
  const refus = db.prepare(`SELECT COALESCE(SUM(json_extract(detail,'$.n')),0) AS n FROM journal WHERE evenement='ACCES_REFUSES' AND ts > ?`).get(new Date(now - 10 * 60000).toISOString()).n;
  if (refus >= 50) add('critique', 'ACCES_NON_AUTORISES', `${refus} accès refusés en 10 minutes (attaque possible).`);
  else if (refus >= 10) add('avertissement', 'ACCES_NON_AUTORISES', `${refus} accès refusés en 10 minutes.`);
  if (evt('ESCALADE_PRIVILEGE_TENTEE', 60)) add('critique', 'ESCALADE_PRIVILEGE_TENTEE', 'Un jeton a été utilisé hors de son rôle (utilisateur sur route admin, ou l’inverse).');
  if (evt('RESULTATS_CONTRADICTOIRES', 24 * 60)) add('critique', 'RESULTATS_CONTRADICTOIRES', 'Deux exécutions identiques d’un agent ont donné des résultats différents.');
  const erreursAgents = evt('AGENT_ERREUR', 10);
  if (erreursAgents >= 10) add('critique', 'ERREURS_REPETEES', `${erreursAgents} erreurs d’agents en 10 minutes.`);
  const missionRepetee = db.prepare(`SELECT mission_id, COUNT(*) AS n FROM journal WHERE evenement='AGENT_ERREUR' AND mission_id IS NOT NULL GROUP BY mission_id HAVING n >= 3 LIMIT 1`).get();
  if (missionRepetee) add('avertissement', 'MISSION_EN_ERREUR_REPETEE', `La mission ${missionRepetee.mission_id} a échoué ${missionRepetee.n} fois.`);
  const plusAncienne = db.prepare(`SELECT MIN(cree_le) AS t FROM missions WHERE statut IN ('EN_FILE','A_CORRIGER')`).get().t;
  const batt = Number(param(db, 'battement', '0'));
  if (plusAncienne && batt && now - batt < 120000 && now - Date.parse(plusAncienne) > 10 * 60000) add('critique', 'FILE_BLOQUEE', 'Le service est vivant mais une mission attend depuis plus de 10 minutes : orchestrateur bloqué ?');
  const at = param(db, 'autotest_auditeur'); const atj = at ? JSON.parse(at) : null;
  if (atj && !atj.ok) add('critique', 'AUDITEUR_DEFAILLANT', `Auto-test de l'auditeur négatif : ${atj.echecs[0]}`);
  else if (!atj) add('info', 'AUTOTEST_JAMAIS_EXECUTE', "L'auto-test de l'auditeur n'a jamais été exécuté.");
  else if (now - Date.parse(atj.date) > 2 * 3600 * 1000) add('avertissement', 'AUTOTEST_ANCIEN', "Dernier auto-test de l'auditeur il y a plus de 2 h.");

  const orphelines = db.prepare(`SELECT COUNT(*) AS n FROM missions WHERE statut='EN_COURS' AND bail_jusqua < ?`).get(now).n;
  if (orphelines) add('avertissement', 'MISSIONS_ORPHELINES', `${orphelines} mission(s) interrompue(s) en attente de reprise.`);

  const echecs = db.prepare(`SELECT COUNT(*) AS n FROM missions WHERE statut='ECHEC'`).get().n;
  if (echecs) add('critique', 'MISSIONS_EN_ECHEC', `${echecs} mission(s) en échec : intervention humaine requise.`);

  const bloquees = db.prepare(`SELECT COUNT(*) AS n FROM missions WHERE statut='BLOQUE'`).get().n;
  if (bloquees) add('info', 'MISSIONS_BLOQUEES', `${bloquees} mission(s) attendent une information ou une autorisation.`);

  const budget = Number(param(db, 'budget_jour_cents', '500'));
  const dep = depenseDuJour(db);
  if (dep >= budget) add('critique', 'BUDGET_ATTEINT', `Budget journalier atteint (${dep}/${budget} centimes).`);
  else if (dep >= budget * 0.8) add('avertissement', 'BUDGET_PROCHE', `80 % du budget journalier consommé (${dep}/${budget} centimes).`);

  const sauv = derniereSauvegarde(db);
  if (!sauv) add('avertissement', 'AUCUNE_SAUVEGARDE', 'Aucune sauvegarde vérifiée n’existe encore.');
  else if (now - Date.parse(sauv.ts) > 26 * 3600 * 1000) add('avertissement', 'SAUVEGARDE_ANCIENNE', `Dernière sauvegarde vérifiée : ${sauv.ts}.`);

  if (exigerBattement) {
    const b = Number(param(db, 'battement', '0'));
    if (!b || now - b > 120000) add('critique', 'SERVICE_SILENCIEUX', 'Le service JARVIS ne donne plus signe de vie depuis plus de 2 minutes.');
  }

  const gravite = { critique: 3, avertissement: 2, info: 1 };
  const pire = alertes.reduce((m, a) => Math.max(m, gravite[a.niveau]), 0);
  return { ok: pire < 3, alertes, journal: chaine, sauvegarde: sauv };
}
