// AGENT — Clients. Dossier client (identité commerciale, historique, encours). Lecture seule, minimisation des données personnelles.
import { bloque, regleActive, citerRegle, resoudreClient, fautesGenerales } from './commun.js';
import { detecterInjection } from '../confiance.js';

export function creerAgentClients({ defaut = null } = {}) {
  return {
    nom: 'clients',
    role: 'Clients',
    description: 'Construit le dossier d’un client : conditions, historique commandes/factures, encours, points à vérifier.',
    droits: { lire: ['clients', 'commandes', 'factures', 'paiements', 'devis_historique', 'regles'], ecrire: ['aucun'], reseau: false, envoyer: false },
    criteres: ['Totaux identiques au recalcul indépendant', 'Client désigné sans ambiguïté', 'Aucune donnée d’un autre client', 'Notes suspectes jamais recopiées', 'Coordonnées personnelles absentes du dossier'],
    plan() { return [{ etape: 'identifier le client', critere: 'nom exact' }, { etape: 'agréger historique et encours', critere: 'entiers, factures uniques' }, { etape: 'contrôle indépendant', critere: 'recalcul depuis les sources' }]; },

    async executer(mission, ctx) {
      const faute = await fautesGenerales(defaut, mission, ctx);
      if (faute && typeof faute === 'object') return faute;
      const m = mission.demande.match(/(?:dossier|fiche|historique)\s+(?:du\s+|de\s+la\s+|de\s+l['’]\s*|des\s+)?(?:client\s+)?(.+?)\s*$/i);
      if (!m) return bloque('DEMANDE_INCOMPRISE', 'Je ne retrouve pas le client demandé.', 'Reformulez : « dossier du client <nom exact> ».');
      const rc = resoudreClient(m[1].replace(/[.?!]+$/, '').trim(), ctx.donnees.clients);
      if (rc.blocage) return rc.blocage;
      let c = rc.client;
      if (faute === 'mauvais_client') c = ctx.donnees.clients.find((x) => x.id !== c.id);

      const cmd = ctx.donnees.commandes.filter((x) => x.client_id === c.id);
      const totalCmd = (x) => x.lignes.reduce((s, l) => s + l.qte * l.pu_ht_cents, 0);
      const vus = new Set(); const doublons = new Set(); const factures = [];
      for (const f of ctx.donnees.factures.filter((x) => x.client_id === c.id)) { if (vus.has(f.id)) doublons.add(f.id); else { vus.add(f.id); factures.push(f); } }
      const paye = (id) => ctx.donnees.paiements.filter((p) => p.facture_id === id).reduce((s, p) => s + p.montant_cents, 0);
      let encours = 0; let echu = 0; let ttc = 0; let payeTotal = 0;
      for (const f of factures) {
        const p = paye(f.id); const solde = Math.max(0, f.ttc_cents - p);
        ttc += f.ttc_cents; payeTotal += p; encours += solde;
        if (f.echeance < ctx.aujourdhui) echu += solde;
      }
      if (faute === 'encours_faux') encours += 100;
      const aVerifier = [];
      let note = String(c.notes ?? '').trim();
      if (note && detecterInjection(note).length) { aVerifier.push('NOTE_SUSPECTE_EXCLUE'); note = ''; }
      if (faute === 'note_recopiee') note = c.notes;
      for (const id of doublons) aVerifier.push(`FACTURE_EN_DOUBLE:${id}`);
      const devis = ctx.donnees.devis_historique.filter((x) => x.client_id === c.id);
      const dernieres = [...cmd].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 3).map((x) => ({ id: x.id, date: x.date, statut: x.statut, total_ht_cents: totalCmd(x) }));
      return { statut: 'OK', resultat: {
        type: 'dossier_client', action_sensible: false, donnees_fictives: ctx.fictif, date: ctx.aujourdhui,
        client: { id: c.id, nom: c.nom, territoire: c.territoire, remise_pct: c.remise_pct, remise_justification: c.remise_justification, contact_disponible: !!c.email },
        commandes: { nombre: cmd.length, total_ht_cents: cmd.reduce((s, x) => s + totalCmd(x), 0), dernieres },
        factures: { nombre: factures.length, total_ttc_cents: ttc, paye_cents: payeTotal, encours_cents: encours, encours_echu_cents: echu },
        devis: { nombre: devis.length, en_attente: devis.filter((x) => x.statut === 'envoye').length },
        note_interne: note || null, a_verifier: aVerifier,
        avertissement: 'Historique issu de la base fournie ; il reste déclaratif tant qu’il n’est pas rapproché d’EBP.',
      } };
    },
  };
}
