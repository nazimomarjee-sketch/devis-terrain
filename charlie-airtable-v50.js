'use strict';
/* CHARLIE — adaptateur Airtable « ODICOLOR — Machine commerciale V4 » (module pur : aucun réseau, aucun stockage).
 * Rôle : transformer les enregistrements Airtable (Comptes, Tournées) en entrées du cœur CHARLIE, SANS rien inventer :
 *  - un chiffre EBP n'est utilisé que si « Vérité financière » = « Vérifiée EBP » ET le compte a un code client EBP ;
 *  - la feuille de Laurent (table Tournées) est lue dans son ordre, doublons conservés et signalés ;
 *  - aucune écriture : les charges utiles de retour (Actions, Tournées) sont PRÉPARÉES pour validation humaine, jamais envoyées ici.
 * Les données réelles ne sont jamais écrites dans le dépôt : le script scripts/charlie-airtable-sync.cjs écrit hors dépôt. */
(function (racine) {
  const T = typeof module === 'object' && module.exports ? require('./charlie-optimiseur-v50.js') : racine.TourneeOpt;
  // Identifiants de champs (schéma lu le 25/11/2026) pour les lectures « par identifiant » ; les noms de champs sont acceptés aussi.
  const CHAMPS = Object.freeze({ nom: ['fldYcmS08ub4wxFP2', 'Établissement'], statut: ['fldFVtuPaYGQPfD7g', 'Statut compte'], segment: ['fldacNPu8r2iBOIYE', 'Segment'], etape: ['fld7IZSeIGlEhjmVK', 'Étape commerciale'],
    adresse: ['fldybrI5Fmx3dlr4X', 'Adresse'], ville: ['fldghsPfvLnRnXGha', 'Ville'], tel: ['fldHKpwVAIUXFVX08', 'Téléphone'], volume: ['fldf3At8r3d22RVdG', 'Volume mensuel estimé'], potentiel90: ['fldDsj66YLuvFVsqy', 'Potentiel 90 jours'],
    ca12: ['fldhEzsEMX2byB0cx', 'CA 12 mois'], marge: ['fldP1hMhNeENgiINQ', 'Marge estimée'], encours: ['fld4sfIO7Zw0gPsA8', 'Encours'], codeEbp: ['fldUCAUiaOXmyfDjY', 'Code client EBP'], ca90: ['fldI7CNWx5ELcgHcm', 'CA 90 jours EBP'],
    retard: ['fldHUtAMnA6osQHu8', 'Retard de paiement'], derniereFacture: ['fldSyVWzYjToFhVe3', 'Dernière facture EBP'], verite: ['fld5XPfjgFZtqKTKC', 'Vérité financière'], confiance: ['fldwyVukKmUPl1fRJ', 'Confiance données'],
    derniereInteraction: ['fldoa1MnLPaRwc3TV', 'Dernière interaction'], prochaineAction: ['fld2mSEf7N5yq3pxm', 'Prochaine action'], datePA: ['fldnSNZo0ghu1r7xC', 'Date prochaine action'] });
  const CHAMPS_TOURNEE = Object.freeze({ titre: ['fldZfAPglwDzRGoPF', 'Tournée'], date: ['fld3ZVtiiIYQKkMmw', 'Date'], zone: ['fldJ5xW0UJ3l8q1Nv', 'Zone'], objectif: ['fldU7L1PtgzsCKmvh', 'Objectif'], comptes: ['flddTD6vyMOitWyfS', 'Comptes prévus'] });
  const lire = (rec, def) => { const f = rec.fields || {}, c = rec.cellValuesByFieldId || {}; for (const k of def) { if (f[k] !== undefined) return f[k]; if (c[k] !== undefined) return c[k]; } return undefined; };
  const sel = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v.name : v) || null;
  const txt = (v, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : null) || null;
  const euros = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const date = (v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v) ? v.slice(0, 10) : null);
  const cents = (e) => (e == null ? null : Math.round(e * 100));

  function comptesDepuis(records) {
    return (records || []).map((r) => { const g = (k) => lire(r, CHAMPS[k]);
      const nom = txt(g('nom')); if (!nom) return null;
      return { airtableId: r.id, nom, statut: sel(g('statut')), segment: sel(g('segment')), etape: sel(g('etape')), adresse: txt(g('adresse'), 300), ville: txt(g('ville'), 80), tel: txt(g('tel'), 40),
        codeEbp: txt(g('codeEbp'), 30), volume: euros(g('volume')), potentiel90: euros(g('potentiel90')), ca12: euros(g('ca12')), ca90: euros(g('ca90')), marge: euros(g('marge')), encours: euros(g('encours')), retard: euros(g('retard')),
        derniereFacture: date(g('derniereFacture')), verite: sel(g('verite')), confiance: sel(g('confiance')), derniereInteraction: date(g('derniereInteraction')), prochaineAction: txt(g('prochaineAction'), 300), datePA: date(g('datePA')) };
    }).filter(Boolean);
  }
  // Finance pour le cœur : « EBP » seulement si vérifié ET lié à un code EBP. Sinon source = « declare »/« estime » → ignoré par le scoring.
  function financeDepuisCompte(c) {
    const verifie = c.verite === 'Vérifiée EBP' && !!c.codeEbp;
    return { source: verifie ? 'EBP' : (c.verite === 'Déclarée' ? 'declare' : 'estime'), ca12Cents: cents(c.ca12), ca90Cents: cents(c.ca90), derniereFacture: c.derniereFacture, retardCents: cents(c.retard) || 0, encoursCents: cents(c.encours) || 0, bloque: false, margePct: null };
  }
  // Feuille de Laurent : une entrée par journée, noms dans l'ordre documentaire (doublons conservés, signalés).
  function tourneesDepuis(records) {
    return (records || []).map((r) => { const g = (k) => lire(r, CHAMPS_TOURNEE[k]);
      const d = date(g('date')), zone = txt(g('zone'), 20), titre = txt(g('titre'), 120) || '', m = /\|\s*(S[12])\s*\|/.exec(titre);
      if (!d) return null;
      const garages = String(g('comptes') || '').split(/\r?\n/).map((l) => l.replace(/^\s*\d+\s*[.)]\s*/, '').trim()).filter(Boolean);
      const vus = new Map(); garages.forEach((n, i) => { const k = T.norm(n); (vus.get(k) || vus.set(k, []).get(k)).push(i + 1); });
      return { airtableId: r.id, date: d, zone, secteurs: T.parserSecteurs(zone), semaine: m ? m[1] : null, garages, repetitions: [...vus.entries()].filter(([, v]) => v.length > 1).map(([k, rangs]) => ({ nom: garages[rangs[0] - 1], rangs })),
        confirme: false, source: 'Airtable « Tournées » (transcription de la feuille de Laurent : passages prévus, non confirmés)' };
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  }
  const dep = (texte) => { const m = /\b(\d{5})\b/.exec(String(texte || '')); return m ? T.departementDe(null, m[1]) : null; };
  // Contrôle de cohérence secteur ↔ adresse connue (jamais de correction automatique : la feuille de Laurent fait foi).
  function controlerSecteurs(tournees, comptes) {
    const par = new Map(); comptes.forEach((c) => par.set(T.nomCleExporte(c.nom), c));
    const out = [];
    for (const t of tournees) t.garages.forEach((nom, i) => {
      const c = par.get(T.nomCleExporte(nom)); if (!c) { out.push({ code: 'COMPTE_INTROUVABLE', date: t.date, rang: i + 1, nom }); return; }
      const d = dep(c.adresse) || dep(c.ville); if (!d) { out.push({ code: 'ADRESSE_SANS_CODE_POSTAL', date: t.date, rang: i + 1, nom }); return; }
      if (t.secteurs.length && !t.secteurs.includes(d)) out.push({ code: 'HORS_SECTEUR', date: t.date, rang: i + 1, nom, departement: d, secteur: t.zone });
    });
    return out;
  }
  // Charges utiles PRÉPARÉES (jamais envoyées ici) pour reporter une visite / un bilan dans Airtable après validation humaine.
  function actionVisite(v) {
    if (!v || !v.nom || !date(v.date)) throw new Error('Visite incomplète : écriture Airtable refusée.');
    return { table: 'Actions', validationHumaineRequise: true, fields: { 'Action': 'Visite ' + v.nom + ' ' + v.date, 'Établissement': v.nom, 'Type': 'Visite', 'Date': v.date + 'T' + (v.heure || '12:00') + ':00.000Z', 'Résultat observable': txt(v.resultat, 1000) || '', 'Durée minutes': Number.isFinite(v.dureeMin) ? Math.round(v.dureeMin) : undefined, 'Prochaine étape': txt(v.prochaineEtape, 500) || '' } };
  }
  function bilanTournee(b) {
    if (!b || !date(b.date)) throw new Error('Bilan incomplet : écriture Airtable refusée.');
    return { table: 'Tournées', validationHumaineRequise: true, fields: { 'Comptes visités': b.vus, 'Km': b.km, 'Bilan': txt(b.bilan, 2000) || '' }, rapprocherPar: { date: b.date } };
  }
  const API = { CHAMPS, CHAMPS_TOURNEE, comptesDepuis, financeDepuisCompte, tourneesDepuis, controlerSecteurs, actionVisite, bilanTournee, departementDeAdresse: dep };
  if (typeof module === 'object' && module.exports) module.exports = API; else racine.CharlieAirtable = API;
})(typeof window !== 'undefined' ? window : globalThis);
