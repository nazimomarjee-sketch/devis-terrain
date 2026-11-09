// OUTBOX : toute action EXTERNE (brouillon de mail, écriture Airtable…) est d'abord ENREGISTRÉE dans la base (même transaction que
// la décision humaine), puis exécutée par un travailleur : une seule fois (clé d'idempotence unique), reprise après crash (bail),
// tentatives bornées, échec définitif signalé. Les connecteurs doivent être idempotents PAR clé (ici : fichier nommé par la clé).
import { journaliser, transaction } from './db.js';
import { horloge } from './horloge.js';

export function enfiler(db, { missionId = null, connecteur, action, charge, cle }) {
  const maintenant = horloge.iso();
  const r = db.prepare('INSERT OR IGNORE INTO outbox(mission_id, connecteur, action, cle_idempotence, charge, cree_le, maj_le) VALUES (?,?,?,?,?,?,?)').run(missionId, connecteur, action, cle, JSON.stringify(charge), maintenant, maintenant);
  if (r.changes === 1) journaliser(db, { missionId, acteur: 'outbox', evenement: 'ACTION_EXTERNE_ENFILEE', detail: { connecteur, action } });
  return r.changes === 1; // false = déjà enfilée (idempotence)
}

function reclamer(db, bailMs) {
  return transaction(db, () => {
    const now = horloge.maintenant();
    db.prepare(`UPDATE outbox SET etat='A_FAIRE', maj_le=? WHERE etat='EN_COURS' AND bail_jusqua < ?`).run(horloge.iso(), now); // reprise après crash
    const a = db.prepare(`SELECT * FROM outbox WHERE etat='A_FAIRE' ORDER BY id LIMIT 1`).get(); if (!a) return null;
    db.prepare(`UPDATE outbox SET etat='EN_COURS', tentatives=tentatives+1, bail_jusqua=?, maj_le=? WHERE id=?`).run(now + bailMs, horloge.iso(), a.id);
    return { ...a, tentatives: a.tentatives + 1 };
  });
}

/** Traite l'outbox. `connecteurs` : { nom: { executer(action, charge, cleIdempotence) } }. Retourne le nombre d'actions faites. */
export async function traiter(db, connecteurs, { maxTentatives = 3, bailMs = 60_000 } = {}) {
  let faites = 0;
  for (let i = 0; i < 100; i++) {
    const a = reclamer(db, bailMs); if (!a) break;
    const c = connecteurs[a.connecteur];
    try {
      if (!c) throw new Error(`connecteur « ${a.connecteur} » non disponible`);
      await c.executer(a.action, JSON.parse(a.charge), a.cle_idempotence);
      db.prepare(`UPDATE outbox SET etat='FAIT', bail_jusqua=NULL, maj_le=? WHERE id=? AND etat='EN_COURS'`).run(horloge.iso(), a.id);
      journaliser(db, { missionId: a.mission_id, acteur: 'outbox', evenement: 'ACTION_EXTERNE_FAITE', detail: { connecteur: a.connecteur, action: a.action } }); faites++;
    } catch (e) {
      const definitif = a.tentatives >= maxTentatives;
      db.prepare(`UPDATE outbox SET etat=?, bail_jusqua=NULL, derniere_erreur=?, maj_le=? WHERE id=?`).run(definitif ? 'ECHEC' : 'A_FAIRE', String(e.message).slice(0, 200), horloge.iso(), a.id);
      journaliser(db, { missionId: a.mission_id, acteur: 'outbox', evenement: definitif ? 'ACTION_EXTERNE_ECHEC' : 'ACTION_EXTERNE_RETENTEE', detail: { connecteur: a.connecteur, message: String(e.message).slice(0, 120) } });
    }
  }
  return faites;
}
