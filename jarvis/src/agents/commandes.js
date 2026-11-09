// AGENT — Commandes. Prépare un brouillon de commande depuis un devis ACCEPTÉ, et suit l'état des commandes.
// « Préparée » ≠ « envoyée » ≠ « enregistrée dans EBP » : l'agent ne fait aucune des deux dernières.
import { decimalVersEntier, joursEntre, bloque, regleActive, citerRegle, fautesGenerales } from './commun.js';

export function creerAgentCommandes({ defaut = null } = {}) {
  return {
    nom: 'commandes',
    role: 'Commandes',
    description: 'Prépare les commandes depuis les devis acceptés et suit leur état (préparée / envoyée / enregistrée).',
    droits: { lire: ['devis_historique', 'commandes', 'clients', 'catalogue', 'regles'], ecrire: ['aucun'], reseau: false, envoyer: false },
    criteres: ['Lignes et total identiques au devis source', 'Statut jamais présenté comme envoyé ou enregistré', 'Anomalies de suivi exhaustives (recalcul indépendant)', 'Commande refusée si le devis n’est pas accepté'],
    plan() { return [{ etape: 'identifier la demande (brouillon ou suivi)', critere: 'devis référencé ou suivi global' }, { etape: 'vérifier le devis et les références', critere: 'devis accepté, références existantes' }, { etape: 'contrôle indépendant', critere: 'comparaison au devis source' }]; },

    async executer(mission, ctx) {
      const faute = await fautesGenerales(defaut, mission, ctx);
      if (faute && typeof faute === 'object') return faute;
      const rc = regleActive(ctx, 'commande', '*'); if (rc.blocage) return rc.blocage;
      const w = rc.regle.valeur;
      const total = (c) => c.lignes.reduce((s, l) => s + l.qte * l.pu_ht_cents, 0);

      const dev = mission.demande.match(/\b(DEV-\d{4}-\d{3})\b/i);
      if (/suivi|statut|en cours|anomalie/i.test(mission.demande) && !dev) {
        const parStatut = {}; const totalParStatut = {}; const anomalies = [];
        for (const c of ctx.donnees.commandes) {
          parStatut[c.statut] = (parStatut[c.statut] ?? 0) + 1;
          totalParStatut[c.statut] = (totalParStatut[c.statut] ?? 0) + total(c);
          const age = joursEntre(c.statut_le, ctx.aujourdhui);
          if (c.statut === 'envoyee' && age >= w.envoyee_non_enregistree_jours) anomalies.push({ code: 'ENVOYEE_NON_ENREGISTREE', commande_id: c.id, age_jours: age });
          if (c.statut === 'preparee' && age >= w.preparee_non_envoyee_jours) anomalies.push({ code: 'PREPAREE_NON_ENVOYEE', commande_id: c.id, age_jours: age });
        }
        anomalies.sort((a, b) => (a.code + a.commande_id).localeCompare(b.code + b.commande_id));
        if (faute === 'anomalie_omise') anomalies.shift();
        if (faute === 'compte_faux') parStatut.enregistree_ebp = (parStatut.enregistree_ebp ?? 0) + 1;
        return { statut: 'OK', resultat: { type: 'suivi_commandes', action_sensible: false, donnees_fictives: ctx.fictif, date: ctx.aujourdhui, regles_utilisees: [citerRegle(rc.regle)], nb_commandes: ctx.donnees.commandes.length, par_statut: parStatut, total_ht_par_statut_cents: totalParStatut, anomalies,
          definitions: 'preparee = brouillon interne ; envoyee = transmise au fournisseur/client ; enregistree_ebp = confirmée dans EBP' } };
      }

      if (!dev) return bloque('DEMANDE_INCOMPRISE', 'Je ne retrouve ni un devis (DEV-AAAA-NNN) ni une demande de suivi.', 'Reformulez : « prépare la commande du devis DEV-2026-012 » ou « suivi des commandes ».');
      const d = ctx.donnees.devis_historique.find((x) => x.id.toLowerCase() === dev[1].toLowerCase());
      if (!d) return bloque('DEVIS_INCONNU', `Le devis ${dev[1]} n’existe pas.`, 'Quel est le bon numéro de devis ?');
      if (d.statut !== 'accepte') return bloque('DEVIS_NON_ACCEPTE', `Le devis ${d.id} est « ${d.statut} », pas « accepté ». Je ne prépare pas de commande sans acceptation.`, 'Le client a-t-il accepté ce devis ? (à confirmer avant de continuer)');
      const client = ctx.donnees.clients.find((c) => c.id === d.client_id);
      if (!client) return bloque('CLIENT_INCONNU', `Client ${d.client_id} introuvable.`, 'Quel est le client de ce devis ?');
      const lignes = []; const avertissements = [];
      for (const l of d.lignes) {
        const ref = ctx.donnees.catalogue.find((x) => x.ref === l.ref);
        if (!ref) return bloque('REFERENCE_INCONNUE', `La référence ${l.ref} du devis n’existe plus au catalogue.`, 'Quelle référence la remplace ?');
        if (l.qte % ref.multiple !== 0) return bloque('CONDITIONNEMENT', `${l.ref} : ${l.qte} n’est pas un multiple de ${ref.multiple}.`, 'Quelle quantité corriger ?');
        if (ref.prix_ht != null && decimalVersEntier(ref.prix_ht) !== l.pu_ht_cents) avertissements.push({ code: 'PRIX_DIFFERENT_CATALOGUE', ref: l.ref, message: `Prix du devis (${l.pu_ht_cents}) différent du catalogue actuel (${decimalVersEntier(ref.prix_ht)}) : à confirmer.` });
        lignes.push({ ref: l.ref, qte: faute === 'ligne_modifiee' && lignes.length === 0 ? l.qte + 1 : l.qte, pu_ht_cents: l.pu_ht_cents });
      }
      const tot = lignes.reduce((s, l) => s + l.qte * l.pu_ht_cents, 0);
      return { statut: 'OK', resultat: { type: 'commande_brouillon', action_sensible: true, donnees_fictives: ctx.fictif, date: ctx.aujourdhui, regles_utilisees: [citerRegle(rc.regle)],
        numero_provisoire: `CMD-DRAFT-${mission.id}`, devis_ref: d.id, client: { id: client.id, nom: client.nom }, lignes, total_ht_cents: tot,
        statut_commande: 'PREPAREE_NON_ENVOYEE', envoyee: faute === 'marque_envoyee', enregistree_ebp: false, avertissements } };
    },
  };
}
