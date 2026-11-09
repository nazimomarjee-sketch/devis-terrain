// AGENT — Prospection. Qualifie et priorise des prospects de la base fournie. Aucune recherche externe, aucune invention.
import { decimalVersEntier as _d, bloque, regleActive, citerRegle, joursEntre, fautesGenerales } from './commun.js';
import { detecterInjection } from '../confiance.js';

export function creerAgentProspection({ defaut = null } = {}) {
  return {
    nom: 'prospection',
    role: 'Prospection',
    description: 'Qualifie et priorise les prospects de la base (score explicable, informations manquantes signalées « à vérifier »).',
    droits: { lire: ['prospects', 'regles'], ecrire: ['aucun'], reseau: false, envoyer: false },
    criteres: ['Classement identique au recalcul indépendant (scores et ordre)', 'Aucun prospect hors base', 'Informations manquantes signalées, jamais devinées', 'Aucun prospect déclaré client ni compte ouvert'],
    plan() { return [{ etape: 'lire les prospects', critere: 'base fournie uniquement' }, { etape: 'calculer les scores', critere: 'pondérations configurées' }, { etape: 'contrôle indépendant', critere: 'recalcul du classement' }]; },

    async executer(mission, ctx) {
      const faute = await fautesGenerales(defaut, mission, ctx);
      if (faute && typeof faute === 'object') return faute;
      const rp = regleActive(ctx, 'prospection_poids', '*'); if (rp.blocage) return rp.blocage;
      const w = rp.regle.valeur;
      const n = Math.min(20, Math.max(1, Number(/top\s*(\d+)/i.exec(mission.demande)?.[1] ?? 5)));
      const lignes = ctx.donnees.prospects.map((p) => {
        const aVerifier = [];
        const potentiel = p.potentiel_mensuel_eur == null ? 0 : Math.min(Math.floor(p.potentiel_mensuel_eur / w.potentiel_diviseur), w.potentiel_max);
        if (p.potentiel_mensuel_eur == null) aVerifier.push('potentiel à vérifier');
        const techniciens = Math.min(p.techniciens * w.points_par_technicien, w.technicien_max);
        let recence = 0;
        if (p.dernier_contact == null) { recence = w.jamais_contacte; aVerifier.push('jamais contacté (à vérifier)'); }
        else { const j = joursEntre(p.dernier_contact, ctx.aujourdhui); if (j > w.ancien_jours) recence = w.ancien_points; else if (j < w.recent_jours) recence = w.recent_points; }
        if (p.notes && detecterInjection(p.notes).length) aVerifier.push('NOTE_SUSPECTE_EXCLUE');
        return { id: p.id, nom: p.nom, ville: p.ville, score: potentiel + techniciens + recence, detail: { potentiel, techniciens, recence }, a_verifier: aVerifier,
          prochaine_question: /inconnue/i.test(p.marque_actuelle) ? 'Quelle marque utilisez-vous aujourd’hui ?' : 'Qu’est-ce qui vous ferait changer de fournisseur ?' };
      });
      lignes.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      let top = lignes.slice(0, n).map((l, i) => ({ rang: i + 1, ...l }));
      if (faute === 'ordre_inverse' && top.length > 1) { [top[0], top[1]] = [top[1], top[0]]; top[0].rang = 1; top[1].rang = 2; }
      if (faute === 'score_gonfle') top[0].score += 5;
      if (faute === 'prospect_invente') top.push({ rang: top.length + 1, id: 'P999', nom: 'Prospect inventé', ville: '', score: 1, detail: { potentiel: 0, techniciens: 0, recence: 1 }, a_verifier: [], prochaine_question: '' });
      return { statut: 'OK', resultat: { type: 'classement_prospects', action_sensible: false, donnees_fictives: ctx.fictif, date: ctx.aujourdhui, regles_utilisees: [citerRegle(rp.regle)], nb_prospects: lignes.length, top,
        avertissement: 'Un prospect n’est pas un client : aucun compte n’est déclaré ouvert. Le potentiel est déclaratif tant qu’il n’est pas vérifié.' } };
    },
  };
}
