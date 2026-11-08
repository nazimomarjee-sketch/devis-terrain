// Mesures d'exploitation (section 13 du mandat) calculées à partir de la base — jamais déclarées.
import { depenseDuJour } from './moteur.js';
import { param } from './db.js';

export function metriques(db) {
  const comptes = Object.fromEntries(db.prepare('SELECT statut, COUNT(*) AS n FROM missions GROUP BY statut').all().map((r) => [r.statut, r.n]));
  const total = Object.values(comptes).reduce((a, b) => a + b, 0);
  const abouties = (comptes.VALIDE ?? 0) + (comptes.EN_ATTENTE_APPROBATION ?? 0);
  const cloturees = abouties + (comptes.ECHEC ?? 0) + (comptes.REFUSE ?? 0);
  const audits = db.prepare(`SELECT json_extract(detail,'$.verdict') AS v, COUNT(*) AS n FROM journal WHERE evenement='AUDIT' GROUP BY v`).all();
  const nAudit = (v) => audits.find((a) => a.v === v)?.n ?? 0;
  const erreursDetectees = nAudit('A_CORRIGER');
  const missionsCorrigees = db.prepare(`SELECT COUNT(*) AS n FROM missions WHERE corrections > 0`).get().n;
  const correctionsReussies = db.prepare(`SELECT COUNT(*) AS n FROM missions WHERE corrections > 0 AND statut IN ('VALIDE','EN_ATTENTE_APPROBATION')`).get().n;
  const duree = db.prepare(`SELECT AVG(fin_ms - debut_ms) AS d FROM missions WHERE fin_ms IS NOT NULL AND debut_ms IS NOT NULL`).get().d;
  const cout = db.prepare('SELECT COALESCE(SUM(cout_cents),0) AS c FROM missions').get().c;
  const interventions = db.prepare(`SELECT COUNT(*) AS n FROM journal WHERE evenement IN ('APPROUVE_ENVOI_SIMULE','REFUSE_PAR_HUMAIN','RELANCE_HUMAINE','ARRET_URGENCE','REPRISE_APRES_ARRET')`).get().n;
  return {
    missions_total: total,
    par_statut: comptes,
    taux_reussite: cloturees ? Number((abouties / cloturees).toFixed(3)) : null,
    erreurs_detectees_par_audit: erreursDetectees,
    taux_corrections_reussies: missionsCorrigees ? Number((correctionsReussies / missionsCorrigees).toFixed(3)) : null,
    duree_moyenne_ms: duree == null ? null : Math.round(duree),
    cout_moyen_cents: total ? Math.round(cout / total) : 0,
    missions_bloquees: comptes.BLOQUE ?? 0,
    interventions_humaines: interventions,
    depense_jour_cents: depenseDuJour(db),
    budget_jour_cents: Number(param(db, 'budget_jour_cents', '500')),
  };
}
