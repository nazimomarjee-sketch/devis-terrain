/* ODICOLOR 2.0 — Lot 5 : SUIVI COMMERCE (Bureau). Logique pure, LECTURE SEULE.
   Relie chaque demande de devis du téléphone aux pièces EBP UNIQUEMENT par identifiant :
   n° de devis EBP saisi dans la demande → devis EBP → pièces dont l'« origine » est ce devis (commande, BL) → factures → règlements.
   Jamais par le nom, jamais par un montant approchant. Sans colonne « pièce d'origine », la chaîne s'arrête au devis : signalé.
   Distinction stricte : demandé (téléphone) · devis EBP · commande confirmée (EBP) · facturé HT (EBP) · encaissé (échéancier, TTC) · avoirs.
   Une demande « acceptée » n'est jamais une vente : seule une commande EBP l'est. Montants en centimes. */
(function (racine) {
  'use strict';
  function suivre({ demandes = [], pieces = null, avoirs = [], reglements = null, clientsEbp = [], liens = false } = {}) {
    const P = Array.isArray(pieces) ? pieces : [], parNo = new Map(P.map(p => [p.no, p]));
    const enfants = new Map(); for (const p of P) if (p.origine) { if (!enfants.has(p.origine)) enfants.set(p.origine, []); enfants.get(p.origine).push(p); }
    const R = Array.isArray(reglements) ? reglements : null, bloques = new Set((clientsEbp || []).filter(c => c && c.bloque).map(c => c.code));
    const descendants = no => { const out = [], file = [no], vus = new Set([no]); while (file.length) { const x = file.shift(); for (const e of enfants.get(x) || []) if (!vus.has(e.no)) { vus.add(e.no); out.push(e); file.push(e.no); } } return out; };
    return (demandes || []).map(d => {
      const s = { uid: d.uid, client: d.clientNom, codeEbp: d.codeEbp || '', statutDemande: d.statut, noDevisEbp: d.noDevisEbp || '', etape: 'demande', manques: [],
        devis: null, commandes: [], factures: [], avoirs: [], factureHtCents: null, encaisseTtcCents: null, resteTtcCents: null, compteBloque: !!(d.codeEbp && bloques.has(d.codeEbp)) };
      if (!d.noDevisEbp) { if (['a_traiter', 'brouillon'].includes(d.statut)) s.manques.push('Pas encore traité dans EBP'); else s.manques.push('N° de devis EBP non saisi'); return s; }
      if (!Array.isArray(pieces)) { s.manques.push('Export des pièces EBP non chargé'); return s; }
      const dv = parNo.get(d.noDevisEbp);
      if (!dv || dv.type !== 'devis') { s.manques.push('Devis ' + d.noDevisEbp + ' introuvable dans l’export EBP'); return s; }
      s.devis = { no: dv.no, date: dv.date, htCents: dv.htCents }; s.etape = 'devis_ebp';
      if (d.codeEbp && dv.code && dv.code !== d.codeEbp) s.manques.push('Code client du devis EBP (' + dv.code + ') différent de celui du garage (' + d.codeEbp + ') : à vérifier');
      if (!liens) { s.manques.push('Export sans colonne « pièce d’origine » : commande et facture non reliables'); return s; }
      const desc = descendants(dv.no);
      s.commandes = desc.filter(p => p.type === 'commande').map(p => ({ no: p.no, date: p.date, htCents: p.htCents }));
      const fac = desc.filter(p => p.type === 'facture');
      s.factures = fac.map(p => ({ no: p.no, date: p.date, htCents: p.htCents }));
      s.avoirs = (avoirs || []).filter(a => a && fac.some(f => f.no === a.origine)).map(a => ({ no: a.no, date: a.date, htCents: -Math.abs(a.htCents || 0) }));
      if (s.commandes.length) s.etape = 'commande';
      if (fac.length) { s.etape = 'facture'; s.factureHtCents = fac.reduce((x, f) => x + f.htCents, 0) + s.avoirs.reduce((x, a) => x + a.htCents, 0); }
      if (fac.length) {
        if (!R) s.manques.push('Échéancier des règlements non chargé : encaissement inconnu');
        else {
          const rs = R.filter(r => fac.some(f => f.no === r.facture));
          if (!rs.length) s.manques.push('Factures absentes de l’échéancier : encaissement inconnu');
          else if (rs.some(r => r.resteCents == null)) s.manques.push('Règlement daté sans montant : encaissement à vérifier');
          else { s.resteTtcCents = rs.reduce((x, r) => x + r.resteCents, 0); s.encaisseTtcCents = rs.reduce((x, r) => x + r.montantCents - r.resteCents, 0); s.etape = s.resteTtcCents <= 0 ? 'encaisse' : 'facture'; }
        }
      }
      return s;
    });
  }
  // Tableau de bord : chaque chiffre a son statut. null = non renseigné, jamais un faux zéro.
  function tableau({ suivi = [], demandes = [], ca = null, objectifCents = null, liens = false, aujourdhui, relanceJours = 7 } = {}) {
    const n = st => demandes.filter(d => d.statut === st).length;
    const envoyeLe = d => ((d.historique || []).filter(h => h.etape === 'envoye').pop() || {}).le;
    const decides = n('accepte') + n('refuse');
    const caCents = ca && ca.statut === 'renseigne' ? ca.totalCents : null;
    return {
      caMois: { cents: caCents, motif: caCents == null ? (ca && ca.motif) || 'Export des pièces EBP non chargé' : null },
      objectif: { cents: objectifCents || null, motif: objectifCents ? null : 'Objectif mensuel non saisi (cible annoncée : 20 000 € HT d’ici fin février 2027, à saisir dans le Bureau)' },
      ecart: { cents: caCents != null && objectifCents ? Math.max(0, objectifCents - caCents) : null },
      demandesATraiter: n('a_traiter'),
      devisEnAttente: n('envoye'),
      commandesSansFacture: liens ? suivi.filter(s => s.etape === 'commande').length : null,
      tauxTransformation: { pct: decides ? Math.round(n('accepte') / decides * 100) : null, base: decides, motif: decides ? null : 'Aucune demande acceptée ou refusée' },
      aRelancer: demandes.filter(d => d.statut === 'envoye' && envoyeLe(d) && (Date.parse(aujourdhui) - Date.parse(envoyeLe(d).slice(0, 10))) / 864e5 >= relanceJours).map(d => d.clientNom)
    };
  }
  // E-commerce : architecture préparée, DÉSACTIVÉE. Aucun panier public, aucun paiement, aucune transmission de commande.
  const ECOMMERCE = Object.freeze({ actif: false, panierPublic: false, paiement: false, transmissionCommandes: false,
    prerequis: ['Prix et remises validés par la direction', 'Stocks fiables', 'Comptes clients et droits', 'Procédure de validation des commandes', 'Hébergement sécurisé'] });
  const api = { suivre, tableau, ECOMMERCE };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.Commerce = api;
})(typeof self !== 'undefined' ? self : this);
