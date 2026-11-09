// Surveillance des accès refusés : agrégés (pas d'inondation du journal), tentatives d'escalade de privilège tracées à part.
import { journaliser } from './db.js';
import { horloge } from './horloge.js';

export function creerSuiveurAcces(db) {
  let compteurs = {}; let dernierEscalade = 0;
  return {
    noter(code) { compteurs[code] = (compteurs[code] ?? 0) + 1; },
    /** Écrit UN événement agrégé si des refus ont eu lieu depuis le dernier vidage. */
    vider() {
      const n = Object.values(compteurs).reduce((a, b) => a + b, 0);
      if (n) { journaliser(db, { acteur: 'securite', evenement: 'ACCES_REFUSES', detail: { n, par_code: compteurs } }); compteurs = {}; }
      return n;
    },
    /** Utilisation d'un jeton hors de son rôle : au plus un événement par 10 s (le journal ne doit pas être noyé). */
    escalade(detail) {
      if (horloge.maintenant() - dernierEscalade < 10_000) return false;
      dernierEscalade = horloge.maintenant();
      journaliser(db, { acteur: 'securite', evenement: 'ESCALADE_PRIVILEGE_TENTEE', detail });
      return true;
    },
  };
}
