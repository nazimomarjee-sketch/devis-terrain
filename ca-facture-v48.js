'use strict';
/* ODICOLOR — CA FACTURÉ HT (téléphone). Module sans interface, testable sous Node.
   Règles du propriétaire : le chiffre d'affaires = les FACTURES HT émises, avoirs déduits à leur date, sans doublon.
   Les commandes (devis envoyés) et les encaissements (factures réglées) sont d'AUTRES indicateurs : jamais additionnés ici.
   Stockage : meta « caFacture » = { version:1, entrees:[…] }. Aucune suppression : une entrée erronée est ANNULÉE (motif + date), l'historique reste.
   Montants en centimes entiers. Futur import EBP : mêmes entrées avec source « ebp » (le contrôle de doublon par numéro s'applique déjà). */
const ODICOLOR_CA = (() => {
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const MAX_CENTS = 1e10, TYPES = ['facture', 'avoir'], SOURCES = ['saisie', 'ebp'];
  const iso = s => typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
  const numeroNorm = n => String(n == null ? '' : n).normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cle = e => e.type + '|' + numeroNorm(e.numero);
  const vide = () => ({ version: 1, entrees: [] });
  function normaliserMagasin(m) {
    if (m == null) return vide();
    if (typeof m !== 'object' || m.version !== 1 || !Array.isArray(m.entrees)) throw new Error('Magasin du CA facturé invalide.');
    return m;
  }
  // Contrôle d'une saisie AVANT enregistrement. Erreurs = refus ; avertissements = confirmation demandée.
  function controler(e, existantes, auj) {
    const erreurs = [], avertissements = [];
    if (!e || typeof e !== 'object') return { ok: false, erreurs: ['Saisie vide.'], avertissements };
    if (!TYPES.includes(e.type)) erreurs.push('Choisis facture ou avoir.');
    if (!numeroNorm(e.numero)) erreurs.push('Le numéro de la pièce est obligatoire (il évite les doublons).');
    if (!iso(e.date)) erreurs.push('Date invalide.');
    else if (auj && e.date > auj) erreurs.push('Date dans le futur : une facture non émise n’est pas du CA.');
    else if (auj && e.date < String(Number(auj.slice(0, 4)) - 3) + auj.slice(4)) avertissements.push('Date de plus de 3 ans : vérifie.');
    if (!Number.isSafeInteger(e.montantHt) || e.montantHt <= 0) erreurs.push('Le montant HT doit être supérieur à 0 (pour un avoir, saisis le montant en positif : il sera déduit).');
    else if (e.montantHt > MAX_CENTS) erreurs.push('Montant trop grand.');
    else if (e.montantHt >= 5000000) avertissements.push('Montant de 50 000 € HT ou plus : vérifie qu’il n’est pas saisi en TTC ou avec une virgule déplacée.');
    if (erreurs.length) return { ok: false, erreurs, avertissements };
    const k = cle(e), actives = (existantes || []).filter(x => !x.annule);
    const dup = actives.find(x => cle(x) === k);
    if (dup) return { ok: false, erreurs: ['Doublon : ' + (e.type === 'avoir' ? 'l’avoir ' : 'la facture ') + dup.numero + ' est déjà enregistré(e) le ' + dup.date + '.'], avertissements, doublon: dup };
    const proche = actives.find(x => x.type === e.type && x.date === e.date && x.montantHt === e.montantHt && x.clientId != null && x.clientId === e.clientId);
    if (proche) avertissements.push('Même client, même date, même montant que ' + proche.numero + ' : doublon possible sous un autre numéro.');
    return { ok: true, erreurs, avertissements };
  }
  function ajouter(magasin, e, ctx) {
    const m = normaliserMagasin(magasin), c = controler(e, m.entrees, ctx.auj);
    if (!c.ok) throw Object.assign(new Error(c.erreurs.join(' ')), { controle: c });
    if (c.avertissements.length && !ctx.confirme) throw Object.assign(new Error('Confirmation nécessaire : ' + c.avertissements.join(' ')), { controle: c, confirmation: true });
    const entree = { id: ctx.id, type: e.type, numero: String(e.numero).trim().slice(0, 40), date: e.date, montantHt: e.montantHt,
      clientId: e.clientId == null ? null : e.clientId, clientNom: String(e.clientNom || '').trim().slice(0, 120), codeEbp: String(e.codeEbp || '').trim().slice(0, 40), source: SOURCES.includes(e.source) ? e.source : 'saisie', saisiLe: ctx.maintenant };
    return { ...m, version: 1, entrees: [...m.entrees, entree] };
  }
  function annuler(magasin, id, motif, ctx) {
    const m = normaliserMagasin(magasin), i = m.entrees.findIndex(x => x.id === id);
    if (i < 0) throw new Error('Pièce introuvable.');
    if (m.entrees[i].annule) throw new Error('Pièce déjà annulée.');
    if (!String(motif || '').trim()) throw new Error('Indique le motif de l’annulation.');
    const copie = m.entrees.slice(); copie[i] = { ...copie[i], annule: { le: ctx.maintenant, motif: String(motif).trim().slice(0, 200) } };
    return { ...m, version: 1, entrees: copie };
  }
  // CA d'une période [debut, fin] (jours ISO inclus) : factures − avoirs, pièces annulées ignorées.
  function calculer(magasin, debut, fin) {
    const m = normaliserMagasin(magasin), r = { facturesCents: 0, avoirsCents: 0, totalCents: 0, nFactures: 0, nAvoirs: 0, annulees: 0 };
    for (const e of m.entrees) {
      if (e.annule) { r.annulees++; continue; }
      if (e.date < debut || e.date > fin) continue;
      if (e.type === 'facture') { r.facturesCents += e.montantHt; r.nFactures++; } else { r.avoirsCents += e.montantHt; r.nAvoirs++; }
    }
    r.totalCents = r.facturesCents - r.avoirsCents;
    return r;
  }
  // CA par code client EBP sur une période + date de la dernière facture (jamais d'un avoir) : sert au rattachement EXPLICITE code → garage.
  function parCode(magasin, debut, fin) {
    const m = normaliserMagasin(magasin), r = new Map();
    for (const e of m.entrees) {
      if (e.annule || !e.codeEbp) continue;
      let x = r.get(e.codeEbp); if (!x) { x = { code: e.codeEbp, nom: e.clientNom || '', periodeCents: 0, derniereFacture: null, nPieces: 0 }; r.set(e.codeEbp, x); }
      if (e.clientNom && !x.nom) x.nom = e.clientNom; x.nPieces++;
      if (e.type === 'facture' && (!x.derniereFacture || e.date > x.derniereFacture)) x.derniereFacture = e.date;
      if (e.date >= debut && e.date <= fin) x.periodeCents += e.type === 'facture' ? e.montantHt : -e.montantHt;
    }
    return r;
  }
  const finDeMois = mois => { const [y, m] = mois.split('-').map(Number); return mois + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0'); };
  const calculerMois = (magasin, mois) => calculer(magasin, mois + '-01', finDeMois(mois));
  const aDesPieces = magasin => normaliserMagasin(magasin).entrees.some(e => !e.annule);
  // Contrôle structurel d'un magasin (sauvegarde/restauration) : lève si incohérent.
  function valider(m) {
    m = normaliserMagasin(m); const ids = new Set(), cles = new Set();
    for (const e of m.entrees) {
      if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || ids.has(e.id)) throw new Error('CA facturé : identifiant invalide ou répété.');
      ids.add(e.id);
      if (!TYPES.includes(e.type) || !numeroNorm(e.numero) || !iso(e.date) || !Number.isSafeInteger(e.montantHt) || e.montantHt <= 0 || e.montantHt > MAX_CENTS) throw new Error('CA facturé : pièce invalide.');
      if (e.annule != null && (typeof e.annule !== 'object' || !String(e.annule.motif || '').trim())) throw new Error('CA facturé : annulation sans motif.');
      if (!e.annule) { const k = cle(e); if (cles.has(k)) throw new Error('CA facturé : doublon de numéro ' + e.numero + '.'); cles.add(k); }
    }
    if (m.imports != null) { if (!Array.isArray(m.imports)) throw new Error('CA facturé : historique des imports invalide.'); const iid = new Set(); for (const x of m.imports) { if (!x || typeof x.id !== 'string' || !x.id || iid.has(x.id)) throw new Error('CA facturé : import invalide ou répété.'); iid.add(x.id); } }
    return { pieces: m.entrees.length };
  }
  return { controler, ajouter, annuler, parCode, calculer, calculerMois, aDesPieces, valider, numeroNorm, vide, finDeMois };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_CA;
