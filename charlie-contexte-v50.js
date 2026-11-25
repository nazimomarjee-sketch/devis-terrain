'use strict';
/* CHARLIE — contexte de la tournée construit à partir des données du téléphone (module pur, testable sous Node).
 *  - finance : CA/dernière facture UNIQUEMENT à partir des pièces importées d'EBP (source « ebp ») ; les saisies manuelles restent « déclaratives » ;
 *    retard de paiement et compte bloqué sont protecteurs et pris en compte même sans import EBP ;
 *  - horaires : réglages généraux + exceptions par jour de la semaine, contrôlés (jamais de journée absurde) ;
 *  - feuille de Laurent : noms rapprochés des fiches, alias confirmés par l'utilisateur, doublons conservés, inconnus listés (jamais inventés). */
(function (racine) {
  const T = typeof module === 'object' && module.exports ? require('./charlie-optimiseur-v50.js') : racine.TourneeOpt;
  const JOUR = 864e5, iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  function financeParClient({ clients, caStore, maintenant, enRetard }) {
    const pieces = new Map(), entrees = caStore && Array.isArray(caStore.entrees) ? caStore.entrees : [];
    for (const e of entrees) { if (e.annule || !e.codeEbp) continue; (pieces.get(e.codeEbp) || pieces.set(e.codeEbp, []).get(e.codeEbp)).push(e); }
    const d12 = iso(maintenant - 365 * JOUR), d90 = iso(maintenant - 90 * JOUR), auj = iso(maintenant), index = new Map();
    for (const c of clients) {
      const ps = c.codeEbp ? pieces.get(c.codeEbp) || [] : [], ebp = ps.filter((e) => e.source === 'ebp'), somme = (l, d) => l.filter((e) => e.date >= d && e.date <= auj).reduce((s, e) => s + (e.type === 'facture' ? e.montantHt : -e.montantHt), 0);
      const fact = ebp.filter((e) => e.type === 'facture').map((e) => e.date).sort();
      const ouvertes = (Array.isArray(c.factures) ? c.factures : []).filter((f) => f && !f.regleLe), retard = ouvertes.filter((f) => enRetard && enRetard(f, maintenant));
      index.set(c.id, { source: ebp.length ? 'EBP' : ps.length ? 'declare' : null, ca12Cents: ebp.length ? Math.max(0, somme(ebp, d12)) : null, ca90Cents: ebp.length ? Math.max(0, somme(ebp, d90)) : null, derniereFacture: fact.length ? fact[fact.length - 1] : null,
        retardCents: retard.reduce((s, f) => s + (f.montant || 0), 0), encoursCents: ouvertes.reduce((s, f) => s + (f.montant || 0), 0), bloque: !!((c.compte && c.compte.statut === 'bloque') || (c.ebp && c.ebp.bloque)), margePct: null });
    }
    return (c) => index.get(c.id) || null;
  }
  const REGL_DEF = Object.freeze({ debut: '08:00', fin: '17:00', pauseDebut: '12:00', pauseFin: '14:00', pauseMin: 45, dureeVisiteMin: null, dureeProspectMin: null, dureeClientMin: null, dureeDevisMin: null, dureeDormantMin: null, caFort: 10000, caMoyen: 3000, reachatJours: 60, jours: {}, osrm: '', vroom: '', appli: 'waze' });
  const minutes = (v, min, max) => (Number.isFinite(Number(v)) && v !== '' && v !== null && Number(v) >= min && Number(v) <= max ? Math.round(Number(v)) : null);
  // Horaires d'un jour (0=dimanche…6) : exceptions par jour par-dessus les réglages généraux ; valeurs absurdes → réglage général + erreur signalée.
  function horairesDuJour(R, dateIso) {
    const base = { ...REGL_DEF, ...R }, dow = new Date(dateIso + 'T12:00:00Z').getUTCDay(), ex = (base.jours && base.jours[dow]) || {}, erreurs = [];
    const val = { debut: ex.debut || base.debut, fin: ex.fin || base.fin, pauseDebut: ex.pauseDebut || base.pauseDebut, pauseFin: ex.pauseFin || base.pauseFin, pauseMin: ex.pauseMin != null ? ex.pauseMin : base.pauseMin };
    let plage = [T.hms(val.debut), T.hms(val.fin)];
    if (plage[0] == null || plage[1] == null || plage[0] >= plage[1] || plage[1] - plage[0] < 3600) { erreurs.push('Horaires du jour invalides : horaires par défaut appliqués.'); plage = T.DEFAUTS.plage.slice(); }
    let pauses = [];
    const pd = T.hms(val.pauseDebut), pf = T.hms(val.pauseFin), pm = minutes(val.pauseMin, 0, 240);
    if (pm) { if (pd != null && pf != null && pd >= plage[0] && pf <= plage[1] && pf - pd >= pm * 60) pauses = [{ creneau: [pd, pf], duree: pm * 60 }]; else erreurs.push('Pause incompatible avec la journée : ignorée.'); }
    return { plage, pauses, erreurs };
  }
  function optionsMoteur(R) {
    const B = { ...REGL_DEF, ...R }, m = (v) => { const x = minutes(v, 5, 240); return x ? x * 60 : null; };
    return { dureeVisite: m(B.dureeVisiteMin) || null, dureesParType: { prospect: m(B.dureeProspectMin), client: m(B.dureeClientMin), devis_a_relancer: m(B.dureeDevisMin), dormant: m(B.dureeDormantMin) },
      seuilsCA12: { fort: Number(B.caFort) > 0 ? Number(B.caFort) : T.DEFAUTS.seuilsCA12.fort, moyen: Number(B.caMoyen) > 0 ? Number(B.caMoyen) : T.DEFAUTS.seuilsCA12.moyen }, seuilReachatJours: minutes(B.reachatJours, 7, 365) || T.DEFAUTS.seuilReachatJours };
  }
  // Feuille de Laurent du jour : noms (serveur/Airtable ou cache) → fiches. `alias` = { nomNormalisé: idClient } confirmés par l'utilisateur.
  function resoudreLaurent({ noms, clients, alias = {}, heures = {} }) { // heures : { nom tel qu'écrit dans la feuille : 'HH:MM' }
    const sans = [], force = new Map();
    noms.forEach((n, i) => { const k = T.nomCleExporte(n), id = alias[k]; if (id != null && clients.some((c) => String(c.id) === String(id))) force.set(i, String(id)); else sans.push(n); });
    const r = T.rapprocherNoms(noms.map((n, i) => (force.has(i) ? clients.find((c) => String(c.id) === force.get(i)).nom : n)), clients);
    const laurent = r.laurent.map((l) => ({ id: l.id, nom: l.nom, rang: l.rang, rapprochement: force.has(l.rang - 1) ? 'confirmé' : l.rapprochement, ...(heures[noms[l.rang - 1]] ? { heure: heures[noms[l.rang - 1]] } : {}) }));
    return { laurent, inconnus: r.inconnus, ambigus: r.ambigus, repetitions: r.repetitions, complet: !r.inconnus.length && !r.ambigus.length };
  }
  const API = { REGL_DEF, financeParClient, horairesDuJour, optionsMoteur, resoudreLaurent };
  if (typeof module === 'object' && module.exports) module.exports = API; else racine.CharlieContexte = API;
})(typeof window !== 'undefined' ? window : globalThis);
