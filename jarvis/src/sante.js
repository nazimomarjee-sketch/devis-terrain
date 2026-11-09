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
