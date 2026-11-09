// AGENT — Finance. Analyse marge, facturation, paiements et anomalies. Lecture seule.
// Les indicateurs sont SÉPARÉS et nommés : CA facturé, commandes, paiements reçus et encours ne se confondent jamais.
import { decimalVersEntier, arrondi, bloque, regleActive, citerRegle, fautesGenerales, joursEntre } from './commun.js';

export const MAX_ANOMALIES_LISTEES = 200; // plafond de la liste détaillée ; les TOTAUX et le décompte par code restent exacts

export function creerAgentFinance({ defaut = null } = {}) {
  return {
    nom: 'finance',
    role: 'Finance',
    description: 'Analyse la marge, la facturation, les paiements et détecte les anomalies, avec des indicateurs distincts.',
    droits: { lire: ['factures', 'paiements', 'commandes', 'clients', 'catalogue', 'regles'], ecrire: ['aucun'], reseau: false, envoyer: false },
    criteres: ['Chaque indicateur identique au recalcul indépendant (0 centime d’écart)', 'Anomalies exhaustives et sans invention', 'Indicateurs jamais confondus (CA facturé ≠ commandes ≠ encaissements ≠ encours)', 'Doublons de facture exclus des totaux et signalés'],
    plan() { return [{ etape: 'dédoublonner les factures', critere: 'première occurrence conservée' }, { etape: 'calculer les indicateurs séparés', critere: 'entiers' }, { etape: 'détecter les anomalies', critere: 'règles de cohérence' }, { etape: 'contrôle indépendant', critere: 'recalcul BigInt' }]; },

    async executer(mission, ctx) {
      const faute = await fautesGenerales(defaut, mission, ctx);
      if (faute && typeof faute === 'object') return faute;
      const { factures, paiements, commandes, clients, catalogue } = ctx.donnees;
      const rUtilisees = [];
      const vus = new Set(); const uniques = []; const anomalies = [];
      const ajouter = (code, ref, detail) => anomalies.push({ code, ref, detail });
      for (const f of factures) { if (vus.has(f.id)) { if (!anomalies.some((a) => a.code === 'NUMERO_EN_DOUBLE' && a.ref === f.id)) ajouter('NUMERO_EN_DOUBLE', f.id, 'exclue des totaux'); } else { vus.add(f.id); uniques.push(f); } }
      const paye = (id) => paiements.filter((p) => p.facture_id === id).reduce((s, p) => s + p.montant_cents, 0);
      let ca = 0; let ttc = 0; let encours = 0; let echu = 0; let marge = 0; let caLignes = 0; let sansLignes = 0;
      const regleTva = new Map();
      for (const f of uniques) {
        ca += f.ht_cents; ttc += f.ttc_cents;
        const p = paye(f.id); const solde = Math.max(0, f.ttc_cents - p);
        encours += solde; if (f.echeance < ctx.aujourdhui) echu += solde;
        if (p > f.ttc_cents) ajouter('SURPAIEMENT', f.id, `payé ${p} > facturé ${f.ttc_cents}`);
        if (!f.commande_id || !commandes.some((c) => c.id === f.commande_id)) ajouter('FACTURE_SANS_COMMANDE', f.id, 'aucune commande rattachée');
        const somme = f.lignes.reduce((s, l) => s + l.qte * l.pu_ht_cents, 0);
        if (f.ht_cents + f.tva_cents !== f.ttc_cents || (f.lignes.length && somme !== f.ht_cents)) ajouter('TOTAL_INCOHERENT', f.id, `ht ${f.ht_cents} + tva ${f.tva_cents} vs ttc ${f.ttc_cents}, lignes ${somme}`);
        const cl = clients.find((c) => c.id === f.client_id);
        const cle = `tva|${cl?.territoire}|vente_locale`;
        const r = ctx.regles[cle];
        if (r && (r.statut === 'VALIDE' || (r.statut === 'FICTIF_DEMO' && ctx.fictif))) {
          regleTva.set(cle, citerRegle(r));
          if (arrondi(f.ht_cents * decimalVersEntier(r.valeur.taux_pct), 10000) !== f.tva_cents) ajouter('TVA_INCOHERENTE', f.id, `TVA attendue ${arrondi(f.ht_cents * decimalVersEntier(r.valeur.taux_pct), 10000)}, facturée ${f.tva_cents}`);
        } else ajouter('REGLE_TVA_INDISPONIBLE', f.id, `pas de règle utilisable pour ${cl?.territoire}`);
        if (f.lignes.length === 0) sansLignes++;
        for (const l of f.lignes) {
          const ref = catalogue.find((x) => x.ref === l.ref);
          if (!ref || ref.prix_achat_ht == null) continue;
          const achat = decimalVersEntier(ref.prix_achat_ht);
          marge += (l.pu_ht_cents - achat) * l.qte; caLignes += l.pu_ht_cents * l.qte;
          if (l.pu_ht_cents < achat) ajouter('MARGE_NEGATIVE_LIGNE', `${f.id}/${l.ref}`, `vente ${l.pu_ht_cents} < achat ${achat}`);
        }
      }
      for (const p of paiements) if (!vus.has(p.facture_id)) ajouter('PAIEMENT_ORPHELIN', p.id, `facture ${p.facture_id} inconnue`);
      const cmdTotal = {};
      for (const c of commandes) cmdTotal[c.statut] = (cmdTotal[c.statut] ?? 0) + c.lignes.reduce((s, l) => s + l.qte * l.pu_ht_cents, 0);
      anomalies.sort((a, b) => (a.code + a.ref).localeCompare(b.code + b.ref));
      { const vu = new Set(); for (let i = anomalies.length - 1; i >= 0; i--) { const k = `${anomalies[i].code}|${anomalies[i].ref}`; if (vu.has(k)) anomalies.splice(i, 1); else vu.add(k); } } // anomalies UNIQUES (code, référence)
      const recus = paiements.reduce((s, p) => s + p.montant_cents, 0);
      let out = anomalies;
      if (faute === 'anomalie_omise') out = anomalies.slice(1);
      if (faute === 'anomalie_inventee') out = [...anomalies, { code: 'SURPAIEMENT', ref: 'FAC-2026-090', detail: 'inventée' }];
      const indic = {
        ca_ht_facture_cents: faute === 'confusion_ca' ? Object.values(cmdTotal).reduce((s, v) => s + v, 0) : ca,
        ca_ttc_facture_cents: ttc,
        paiements_recus_cents: recus,
        encours_cents: faute === 'encours_echu_oublie' ? encours - echu : encours,
        encours_echu_cents: echu,
        commandes_ht_par_statut_cents: cmdTotal,
        marge_brute_cents: faute === 'marge_gonflee' ? marge + 1000 : marge,
        base_marge_ht_cents: caLignes,
        marge_brute_bp: caLignes > 0 ? Math.trunc((marge * 10000) / caLignes) : null,
        factures_sans_lignes_exclues_de_la_marge: sansLignes,
      };
      const parCode = {}; for (const a of out) parCode[a.code] = (parCode[a.code] ?? 0) + 1;
      return { statut: 'OK', resultat: { type: 'analyse_finance', action_sensible: false, donnees_fictives: ctx.fictif, date: ctx.aujourdhui, regles_utilisees: [...regleTva.values()],
        nb_factures_uniques: uniques.length, indicateurs: indic, anomalies_total: out.length, anomalies_par_code: parCode, anomalies_tronquees: out.length > MAX_ANOMALIES_LISTEES, anomalies: out.slice(0, MAX_ANOMALIES_LISTEES),
        definitions: { ca_ht_facture: 'somme HT des factures uniques', commandes: 'montants HT par statut de commande, distincts du CA', paiements_recus: 'somme des encaissements, y compris orphelins', encours: 'TTC facturé non réglé (factures uniques)', marge: 'sur les lignes dont le prix d’achat est connu' } } };
    },
  };
}
