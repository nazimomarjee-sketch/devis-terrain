// AGENT — Relances. Prépare des BROUILLONS de relance (factures échues, devis sans réponse). N'envoie jamais.
import { formaterCentimes, joursEntre, regleActive, citerRegle, fautesGenerales } from './commun.js';

const TEXTES = {
  1: (r) => `Bonjour, sauf erreur de notre part, la facture ${r.ref} d'un montant restant dû de ${formaterCentimes(r.montant_cents)} EUR (échéance ${r.echeance}) n'apparaît pas encore réglée. Pourriez-vous nous confirmer son règlement ? Cordialement.`,
  2: (r) => `Bonjour, malgré un premier rappel, la facture ${r.ref} (échéance ${r.echeance}, ${formaterCentimes(r.montant_cents)} EUR restant dû) reste impayée à ce jour. Merci de procéder à son règlement ou de nous indiquer la date prévue. Cordialement.`,
  3: (r) => `Bonjour, la facture ${r.ref} (échéance ${r.echeance}) présente un solde de ${formaterCentimes(r.montant_cents)} EUR toujours impayé après plusieurs rappels. Nous vous remercions de nous contacter rapidement pour régulariser cette situation. Cordialement.`,
};
const texteDevis = (r) => `Bonjour, nous revenons vers vous au sujet du devis ${r.ref} d'un montant de ${formaterCentimes(r.montant_cents)} EUR HT envoyé le ${r.date}. Souhaitez-vous donner suite ? Nous restons à votre disposition. Cordialement.`;

export function creerAgentRelances({ defaut = null } = {}) {
  return {
    nom: 'relances',
    role: 'Relances',
    description: 'Prépare et organise les relances de factures échues et de devis sans réponse (brouillons, jamais envoyés).',
    droits: { lire: ['factures', 'paiements', 'clients', 'devis_historique', 'regles'], ecrire: ['aucun'], reseau: false, envoyer: false },
    criteres: ['Ensemble des relances identique au recalcul indépendant (aucune facture soldée relancée, aucune échue oubliée)', 'Montants exacts', 'Aucune relance trop rapprochée', 'Aucun envoi'],
    plan() { return [{ etape: 'repérer factures échues et devis sans réponse', critere: 'solde > 0, échéance dépassée' }, { etape: 'déterminer le niveau', critere: 'seuils configurés' }, { etape: 'rédiger les brouillons', critere: 'référence, montant, échéance' }, { etape: 'contrôle indépendant', critere: 'recalcul de l’ensemble' }, { etape: 'attendre l’approbation', critere: 'aucun envoi' }]; },

    async executer(mission, ctx) {
      const faute = await fautesGenerales(defaut, mission, ctx);
      if (faute && typeof faute === 'object') return faute;
      const rr = regleActive(ctx, 'relance', '*'); if (rr.blocage) return rr.blocage;
      const w = rr.regle.valeur;
      const nom = (id) => ctx.donnees.clients.find((c) => c.id === id)?.nom ?? '(client inconnu)';
      const paye = (id) => ctx.donnees.paiements.filter((p) => p.facture_id === id).reduce((s, p) => s + p.montant_cents, 0);
      const vus = new Set(); const brouillons = []; const ignorees = [];
      const recente = (d) => d && joursEntre(d, ctx.aujourdhui) < w.delai_entre_relances_jours;
      for (const f of ctx.donnees.factures) {
        if (vus.has(f.id)) continue; vus.add(f.id);
        const solde = f.ttc_cents - paye(f.id);
        if (solde <= 0 || f.echeance >= ctx.aujourdhui) continue;
        if (recente(f.derniere_relance)) { ignorees.push({ ref: f.id, motif: 'RELANCE_RECENTE' }); continue; }
        const retard = joursEntre(f.echeance, ctx.aujourdhui);
        const niveau = retard >= w.niveau3_jours ? 3 : retard >= w.niveau2_jours ? 2 : 1;
        const r = { type: 'facture', ref: f.id, client_id: f.client_id, client_nom: nom(f.client_id), niveau, montant_cents: solde, echeance: f.echeance, retard_jours: retard };
        brouillons.push({ ...r, objet: `Rappel facture ${f.id}`, texte: TEXTES[niveau](r), envoi: 'NON_ENVOYE' });
      }
      for (const d of ctx.donnees.devis_historique) {
        if (d.statut !== 'envoye' || joursEntre(d.date, ctx.aujourdhui) < w.devis_sans_reponse_jours) continue;
        if (recente(d.derniere_relance)) { ignorees.push({ ref: d.id, motif: 'RELANCE_RECENTE' }); continue; }
        const montant = d.lignes.reduce((s, l) => s + l.qte * l.pu_ht_cents, 0);
        const r = { type: 'devis', ref: d.id, client_id: d.client_id, client_nom: nom(d.client_id), niveau: 1, montant_cents: montant, date: d.date, retard_jours: joursEntre(d.date, ctx.aujourdhui) };
        brouillons.push({ ...r, objet: `Suite à notre devis ${d.id}`, texte: texteDevis(r), envoi: 'NON_ENVOYE' });
      }
      brouillons.sort((a, b) => b.niveau - a.niveau || b.retard_jours - a.retard_jours || a.ref.localeCompare(b.ref));
      if (faute === 'relance_facture_soldee') brouillons.push({ type: 'facture', ref: 'FAC-2026-101', client_id: 'C003', client_nom: nom('C003'), niveau: 1, montant_cents: 9212, echeance: '2026-11-27', retard_jours: 1, objet: 'Rappel facture FAC-2026-101', texte: 'Bonjour, rappel facture FAC-2026-101 de 92,12 EUR.', envoi: 'NON_ENVOYE' });
      if (faute === 'montant_faux' && brouillons[0]) brouillons[0].montant_cents += 1;
      if (faute === 'niveau_faux' && brouillons[0]) { brouillons[0].niveau = 1; brouillons[0].texte = TEXTES[1](brouillons[0]); }
      if (faute === 'doublon' && brouillons[0]) brouillons.push({ ...brouillons[0] });
      if (faute === 'relance_recente_incluse') brouillons.push({ type: 'facture', ref: 'FAC-2026-105', client_id: 'C002', client_nom: nom('C002'), niveau: 2, montant_cents: 12000, echeance: '2026-10-10', retard_jours: 30, objet: 'Rappel facture FAC-2026-105', texte: TEXTES[2]({ ref: 'FAC-2026-105', echeance: '2026-10-10', montant_cents: 12000 }), envoi: 'NON_ENVOYE' });
      return { statut: 'OK', resultat: { type: 'relances', action_sensible: true, donnees_fictives: ctx.fictif, date: ctx.aujourdhui, regles_utilisees: [citerRegle(rr.regle)], brouillons, ignorees,
        avertissement: 'Brouillons uniquement : aucun message n’a été envoyé.' } };
    },
  };
}
