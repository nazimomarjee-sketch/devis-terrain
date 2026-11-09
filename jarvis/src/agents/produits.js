// AGENT — Produits. Contrôle le catalogue (références, tarifs, marges, compatibilités) et produit des fiches. Lecture seule.
import { norm, decimalVersEntier, joursEntre, bloque, regleActive, citerRegle, fautesGenerales } from './commun.js';

const margeBp = (prix, achat) => Math.floor(((prix - achat) * 10000) / prix);

export function creerAgentProduits({ defaut = null } = {}) {
  return {
    nom: 'produits',
    role: 'Produits',
    description: 'Contrôle le catalogue : références, tarifs, marges, conditionnements, compatibilités.',
    droits: { lire: ['catalogue', 'regles'], ecrire: ['aucun'], reseau: false, envoyer: false },
    criteres: ['Aucune anomalie du catalogue omise ni inventée (comparaison exacte avec le recalcul indépendant)', 'Fiches strictement conformes au catalogue', 'Aucune donnée de prix d’achat exposée dans une fiche'],
    plan() { return [{ etape: 'lire le catalogue', critere: 'références valides' }, { etape: 'contrôler tarifs, marges, doublons, compatibilités', critere: 'anomalies exhaustives' }, { etape: 'contrôle indépendant', critere: 'recalcul des anomalies' }]; },

    async executer(mission, ctx) {
      const faute = await fautesGenerales(defaut, mission, ctx);
      if (faute && typeof faute === 'object') return faute;
      const refs = ctx.donnees.catalogue;
      const rMarge = regleActive(ctx, 'marge_min_pct', '*'); if (rMarge.blocage) return rMarge.blocage;
      const rAnc = regleActive(ctx, 'tarif_ancien_jours', '*'); if (rAnc.blocage) return rAnc.blocage;
      const regles_utilisees = [citerRegle(rMarge.regle), citerRegle(rAnc.regle)];

      const m = mission.demande.match(/\b([A-Za-z]{3}-[A-Za-z0-9]{3,6})\b/);
      if (/fiche|compatib/i.test(mission.demande)) {
        if (!m) return bloque('DEMANDE_INCOMPRISE', 'Aucune référence détectée pour la fiche demandée.', 'Quelle référence (ex. VRN-5000) ?');
        const r = refs.find((x) => x.ref.toLowerCase() === m[1].toLowerCase());
        if (!r) return bloque('REFERENCE_INCONNUE', `Référence « ${m[1]} » introuvable.`, 'Quelle est la bonne référence ?');
        const prix = r.prix_ht == null ? null : decimalVersEntier(r.prix_ht);
        const achat = r.prix_achat_ht == null ? null : decimalVersEntier(r.prix_achat_ht);
        const fiche = {
          ref: r.ref, designation: r.designation, categorie: r.categorie, conditionnement: r.multiple, prix_ht_cents: prix,
          date_prix: r.date_prix, age_jours: r.date_prix ? joursEntre(r.date_prix, ctx.aujourdhui) : null,
          marge_bp: prix != null && achat != null && prix > 0 ? margeBp(prix, achat) : null,
          compatibles: r.compatible_avec.map((c) => ({ ref: c, existe: refs.some((x) => x.ref === c) })),
        };
        if (faute === 'prix_fiche_faux' && fiche.prix_ht_cents != null) fiche.prix_ht_cents += 50;
        return { statut: 'OK', resultat: { type: 'rapport_produits', mode: 'fiche', action_sensible: false, donnees_fictives: ctx.fictif, date: ctx.aujourdhui, regles_utilisees, fiche } };
      }

      const anomalies = [];
      const ajouter = (code, ref, detail) => anomalies.push({ code, ref, detail });
      const seuil = decimalVersEntier(rMarge.regle.valeur.pct);
      const parDesignation = new Map();
      for (const r of refs) {
        const prix = r.prix_ht == null ? null : decimalVersEntier(r.prix_ht);
        const achat = r.prix_achat_ht == null ? null : decimalVersEntier(r.prix_achat_ht);
        if (!Number.isInteger(r.multiple) || r.multiple < 1) ajouter('CONDITIONNEMENT_INVALIDE', r.ref, `multiple ${r.multiple}`);
        if (prix == null) ajouter('PRIX_MANQUANT', r.ref, 'aucun tarif de vente');
        else {
          if (!r.date_prix) ajouter('DATE_TARIF_ABSENTE', r.ref, 'tarif sans date');
          else if (joursEntre(r.date_prix, ctx.aujourdhui) > rAnc.regle.valeur.jours) ajouter('TARIF_ANCIEN', r.ref, `${joursEntre(r.date_prix, ctx.aujourdhui)} jours`);
          if (achat == null) ajouter('PRIX_ACHAT_ABSENT', r.ref, 'marge invérifiable');
          else if (prix < achat) ajouter('MARGE_NEGATIVE', r.ref, `vente ${prix} < achat ${achat}`);
          else if (prix > 0 && margeBp(prix, achat) < seuil) ajouter('MARGE_SOUS_SEUIL', r.ref, `${margeBp(prix, achat)} pb`);
        }
        const k = norm(r.designation);
        parDesignation.set(k, [...(parDesignation.get(k) ?? []), r.ref]);
        const inconnues = r.compatible_avec.filter((c) => !refs.some((x) => x.ref === c));
        if (inconnues.length) ajouter('COMPATIBILITE_REF_INCONNUE', r.ref, inconnues.join(','));
        const asym = r.compatible_avec.filter((c) => { const o = refs.find((x) => x.ref === c); return o && !o.compatible_avec.includes(r.ref); });
        if (asym.length) ajouter('COMPATIBILITE_ASYMETRIQUE', r.ref, asym.join(','));
      }
      for (const groupe of parDesignation.values()) {
        const tri = [...groupe].sort();
        for (const r of tri.slice(1)) ajouter('DOUBLON_DESIGNATION', r, `identique à ${tri[0]}`);
      }
      anomalies.sort((a, b) => (a.code + a.ref).localeCompare(b.code + b.ref));
      if (faute === 'anomalie_omise') anomalies.shift();
      if (faute === 'detail_aleatoire' && anomalies[0]) anomalies[0].detail += ` #${Math.random()}`; // champ libre : l'auditeur ne le voit pas
      if (faute === 'anomalie_inventee') anomalies.push({ code: 'PRIX_MANQUANT', ref: refs[0].ref, detail: 'anomalie inventée' });
      return { statut: 'OK', resultat: { type: 'rapport_produits', mode: 'controle_catalogue', action_sensible: false, donnees_fictives: ctx.fictif, date: ctx.aujourdhui, regles_utilisees, nb_references: refs.length, anomalies } };
    },
  };
}
