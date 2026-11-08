// Moteur d'exécution persistant : file de missions, baux (anti-doublon), reprise, arrêt d'urgence, budget.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { transaction, journaliser, param } from './db.js';
import { horloge } from './horloge.js';
import { sourceAutorisee } from './confiance.js';

export const MAX_CORRECTIONS = 3; // 1 exécution + 3 corrections maximum, puis escalade
export const MAX_REPRISES = 3; // mission « empoisonnée » qui fait planter : stop après 3 reprises

export function deposer(db, { demande, projet = 'demo', source, cle = null }) {
  if (!sourceAutorisee(source)) {
    journaliser(db, { acteur: 'securite', evenement: 'MISSION_REFUSEE_SOURCE', detail: { source } });
    throw new Error(`Source non autorisée pour donner une mission : ${source}`);
  }
  const txt = String(demande ?? '').trim();
  if (txt.length < 5 || txt.length > 2000) throw new Error('Demande invalide (5 à 2000 caractères)');
  return transaction(db, () => {
    if (cle) {
      const ex = db.prepare('SELECT id FROM missions WHERE cle_idempotence = ?').get(cle);
      if (ex) return { id: ex.id, doublon: true };
    }
    const maintenant = horloge.iso();
    const id = `M-${maintenant.slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex')}`;
    db.prepare(
      `INSERT INTO missions(id, demande, projet, statut, source, cle_idempotence, cree_le, maj_le)
       VALUES (?, ?, ?, 'EN_FILE', ?, ?, ?, ?)`,
    ).run(id, txt, projet, source, cle, maintenant, maintenant);
    journaliser(db, { missionId: id, acteur: 'utilisateur', evenement: 'DEPOT', detail: { projet, longueur: txt.length } });
    return { id, doublon: false };
  });
}

/** Prend la plus ancienne mission disponible, de façon atomique (un seul ouvrier la reçoit). */
export function reclamer(db, ouvrier, bailMs) {
  return transaction(db, () => {
    const m = db
      .prepare(`SELECT * FROM missions WHERE statut IN ('EN_FILE','A_CORRIGER') ORDER BY rowid LIMIT 1`)
      .get();
    if (!m) return null;
    const now = horloge.maintenant();
    db.prepare(
      `UPDATE missions SET statut='EN_COURS', bail_ouvrier=?, bail_jusqua=?, executions=executions+1, debut_ms=?, maj_le=? WHERE id=?`,
    ).run(ouvrier, now + bailMs, now, horloge.iso(), m.id);
    journaliser(db, { missionId: m.id, acteur: ouvrier, evenement: 'PRISE_EN_CHARGE', detail: { execution: m.executions + 1 } });
    return { ...m, statut: 'EN_COURS', executions: m.executions + 1, debut_ms: now };
  });
}

/** Reprise après interruption : un bail expiré signifie que l'ouvrier est mort ou bloqué. */
export function recupererBaux(db) {
  return transaction(db, () => {
    const now = horloge.maintenant();
    const mortes = db.prepare(`SELECT * FROM missions WHERE statut='EN_COURS' AND bail_jusqua < ?`).all(now);
    for (const m of mortes) {
      const reprises = m.reprises + 1;
      if (reprises > MAX_REPRISES) {
        db.prepare(`UPDATE missions SET statut='ECHEC', reprises=?, raison=?, bail_ouvrier=NULL, bail_jusqua=NULL, maj_le=? WHERE id=?`).run(
          reprises, 'Trop d’interruptions successives : intervention humaine requise.', horloge.iso(), m.id,
        );
        journaliser(db, { missionId: m.id, acteur: 'moteur', evenement: 'ECHEC_REPRISES_EPUISEES', detail: { reprises } });
      } else {
        const suite = m.corrections > 0 ? 'A_CORRIGER' : 'EN_FILE';
        db.prepare(`UPDATE missions SET statut=?, reprises=?, bail_ouvrier=NULL, bail_jusqua=NULL, maj_le=? WHERE id=?`).run(
          suite, reprises, horloge.iso(), m.id,
        );
        journaliser(db, { missionId: m.id, acteur: 'moteur', evenement: 'REPRISE_APRES_INTERRUPTION', detail: { reprises } });
      }
    }
    return mortes.length;
  });
}

/** Écriture conditionnelle : n'aboutit que si l'ouvrier détient toujours le bail. */
export function terminerSiBail(db, id, ouvrier, champs) {
  const cles = Object.keys(champs);
  const sql = `UPDATE missions SET ${cles.map((c) => `${c}=?`).join(', ')}, bail_ouvrier=NULL, bail_jusqua=NULL, fin_ms=?, maj_le=?
               WHERE id=? AND statut='EN_COURS' AND bail_ouvrier=?`;
  const r = db.prepare(sql).run(...cles.map((c) => champs[c]), horloge.maintenant(), horloge.iso(), id, ouvrier);
  if (r.changes !== 1) {
    journaliser(db, { missionId: id, acteur: ouvrier, evenement: 'RESULTAT_ABANDONNE_BAIL_PERDU', detail: {} });
    return false;
  }
  return true;
}

export function arretUrgence(db, dossierDonnees) {
  return param(db, 'arret_urgence', '0') === '1' || (dossierDonnees ? existsSync(join(dossierDonnees, 'ARRET')) : false);
}

export function depenseDuJour(db) {
  const debut = new Date(horloge.maintenant());
  debut.setUTCHours(0, 0, 0, 0);
  return db.prepare('SELECT COALESCE(SUM(cents),0) AS s FROM depenses WHERE ts_ms >= ?').get(debut.getTime()).s;
}

export function enregistrerDepense(db, { missionId, fournisseur, cents }) {
  db.prepare('INSERT INTO depenses(ts_ms, mission_id, fournisseur, cents) VALUES (?,?,?,?)').run(horloge.maintenant(), missionId, fournisseur, cents);
  db.prepare('UPDATE missions SET cout_cents = cout_cents + ? WHERE id = ?').run(cents, missionId);
}

export function budgetAtteint(db) {
  return depenseDuJour(db) >= Number(param(db, 'budget_jour_cents', '500'));
}
