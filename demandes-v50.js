'use strict';
/* ODICOLOR — DEMANDES DE DEVIS (logique pure, testable sous Node). Lot 5, 14/11/2026.
   Une DEMANDE n'est PAS un devis : elle décrit le besoin du garage pour que Mohamed établisse le devis dans EBP.
   Étapes : brouillon → à traiter → traité dans EBP (n° de devis EBP saisi) → envoyé au client → accepté / refusé.
   Règles : aucune étape sautée ; « traité dans EBP » exige le n° du devis EBP ; aucun prix saisi ici (le prix vient d'EBP) ;
   compte bloqué : la demande reste en brouillon ; une demande acceptée n'est JAMAIS une vente : la commande et la facture
   ne sont reconnues que dans les exports EBP ; historique complet, jamais réécrit ; marques non actives refusées. */
const ODICOLOR_DEMANDES = (() => {
  const ETAPES = { brouillon: 'Brouillon', a_traiter: 'À traiter (Mohamed / EBP)', traite_ebp: 'Traité dans EBP', envoye: 'Envoyé au client', accepte: 'Accepté par le client', refuse: 'Refusé par le client' };
  const SUIVANTES = { brouillon: ['a_traiter'], a_traiter: ['traite_ebp', 'brouillon'], traite_ebp: ['envoye'], envoye: ['accepte', 'refuse'], accepte: [], refuse: [] };
  const MARQUES_ACTIVES = ['Carsystem', 'Abel Auto', 'Sifa'], INACTIVES = ['roberlo'];
  const t = (v, n = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const norm = s => t(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const inactive = m => INACTIVES.includes(norm(m));

  function nouvelle(client, { uid, maintenant }) {
    if (!client || !client.id) throw new Error('Garage obligatoire');
    return { uid, clientId: client.id, clientNom: t(client.nom, 120), codeEbp: t(client.codeEbp, 40), creeLe: maintenant, statut: 'brouillon', besoins: '', lignes: [], noDevisEbp: '', historique: [{ le: maintenant, etape: 'brouillon' }] };
  }
  // Ligne = produit du catalogue (référence, désignation, marque) + quantité. Jamais de prix : il est établi dans EBP.
  function ajouterLigne(d, l) {
    if (d.statut !== 'brouillon') throw new Error('Demande déjà transmise : la modifier = nouvelle demande');
    const ref = t(l.ref, 40), des = t(l.des, 160), marque = t(l.marque, 40), qte = Math.floor(Number(l.qte));
    if (!ref && !des) throw new Error('Référence ou désignation obligatoire');
    if (inactive(marque)) throw new Error(marque + ' n’est plus une gamme active : non proposable');
    if (!(qte >= 1 && qte <= 9999)) throw new Error('Quantité entre 1 et 9999');
    const lignes = d.lignes.slice(), i = lignes.findIndex(x => ref && x.ref === ref);
    if (i >= 0) lignes[i] = { ...lignes[i], qte: Math.min(9999, lignes[i].qte + qte) }; // même référence : quantités cumulées, pas de doublon
    else lignes.push({ ref, des, marque, conditionnement: t(l.conditionnement, 40), qte });
    return { ...d, lignes };
  }
  const retirerLigne = (d, i) => { if (d.statut !== 'brouillon') throw new Error('Demande déjà transmise'); return { ...d, lignes: d.lignes.filter((_, k) => k !== i) }; };
  function passer(d, vers, { maintenant, compteBloque = false, noDevisEbp = '', motif = '' }) {
    if (!(SUIVANTES[d.statut] || []).includes(vers)) throw new Error('Étape impossible : ' + (ETAPES[d.statut] || d.statut) + ' → ' + (ETAPES[vers] || vers));
    if (vers === 'a_traiter') {
      if (compteBloque) throw new Error('Compte client bloqué dans EBP : voir avec la direction avant toute demande');
      if (!d.lignes.length && !t(d.besoins)) throw new Error('Ajoute au moins un produit ou décris le besoin');
    }
    const e = { ...d, statut: vers, historique: d.historique.concat([{ le: maintenant, etape: vers, motif: t(motif, 200) }]) };
    if (vers === 'traite_ebp') {
      const no = t(noDevisEbp, 40); if (!no) throw new Error('Numéro du devis EBP obligatoire (le devis officiel est celui d’EBP)');
      e.noDevisEbp = no; e.historique[e.historique.length - 1].noDevisEbp = no;
    }
    return e;
  }
  // Récapitulatif pour Mohamed (comptoir / saisie EBP) : jamais présenté comme un devis.
  function recapitulatif(d, { commercial = '' } = {}) {
    return ['DEMANDE DE DEVIS — à établir dans EBP (ce message n’est pas un devis)',
      'Garage : ' + d.clientNom + (d.codeEbp ? ' (code EBP ' + d.codeEbp + ')' : ' (code EBP non renseigné)'),
      d.besoins ? 'Besoin : ' + d.besoins : null,
      ...d.lignes.map((l, i) => (i + 1) + '. ' + [l.ref, l.des].filter(Boolean).join(' — ') + (l.marque ? ' [' + l.marque + ']' : '') + (l.conditionnement ? ' · ' + l.conditionnement : '') + ' × ' + l.qte),
      'Prix et remises : selon EBP et les conditions validées.', commercial ? 'Demandé par ' + commercial : null, 'Réf. ODICOLOR : ' + d.uid].filter(Boolean).join('\n');
  }
  // Indicateurs du téléphone (sur les demandes seules ; le CA vient d'EBP).
  function indicateurs(demandes, { aujourdhui, relanceJours = 7 }) {
    const l = Array.isArray(demandes) ? demandes : [], n = s => l.filter(d => d.statut === s).length;
    const envoyeLe = d => (d.historique.filter(h => h.etape === 'envoye').pop() || {}).le;
    const aRelancer = l.filter(d => d.statut === 'envoye' && envoyeLe(d) && (Date.parse(aujourdhui) - Date.parse(envoyeLe(d).slice(0, 10))) / 864e5 >= relanceJours);
    const decides = n('accepte') + n('refuse');
    return { brouillons: n('brouillon'), aTraiter: n('a_traiter'), traitesEbp: n('traite_ebp'), enAttenteReponse: n('envoye'), acceptes: n('accepte'), refuses: n('refuse'),
      tauxTransformation: decides ? Math.round(n('accepte') / decides * 100) : null, aRelancer: aRelancer.map(d => ({ uid: d.uid, clientId: d.clientId, clientNom: d.clientNom })) };
  }
  // Catalogue : recherche par référence, désignation, marque ; marques non actives exclues.
  function chercher(articles, q, { marque = '', max = 20 } = {}) {
    const toks = norm(q).split(/\s+/).filter(Boolean).slice(0, 5);
    return (articles || []).filter(a => a && !inactive(a.marque) && (!marque || norm(a.marque) === norm(marque)) && toks.every(k => norm([a.code, a.des, a.marque, a.categorie].join(' ')).includes(k)))
      .slice(0, max);
  }
  return { ETAPES, SUIVANTES, MARQUES_ACTIVES, nouvelle, ajouterLigne, retirerLigne, passer, recapitulatif, indicateurs, chercher };
})();
if (typeof module === 'object' && module.exports) module.exports = ODICOLOR_DEMANDES;
