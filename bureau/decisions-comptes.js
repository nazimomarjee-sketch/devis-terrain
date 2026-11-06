/* ODICOLOR 2.0 — Lot A : MÉMOIRE DES DÉCISIONS DE COMPTE (sans écran).
   Deux décisions humaines, toujours avec auteur, date et source :
   - LIAISON : « ce garage = ce client EBP (code) » → le garage passe EN COMPTE ;
   - ABSENCE : « j'ai cherché dans EBP : aucun compte » → le garage passe SANS COMPTE.
   Plus l'ANNULATION d'une décision (elle-même datée). Le journal ne fait que grandir : rien n'est jamais effacé.
   Règles du propriétaire (07/11/2026) :
   - aucun rapprochement incertain ne devient une liaison sans décision humaine (ce module ne crée JAMAIS de liaison seul) ;
   - l'absence d'un garage dans un export EBP ne prouve rien : seule une ABSENCE déclarée rend un garage « sans compte » ;
   - une contradiction déclenche une vérification (garage remis « à vérifier », motif affiché) et l'historique reste complet ;
   - aucune décision n'est perdue : décision sur un garage disparu = « orpheline », gardée et listée.
   Le journal est enregistré dans le coffre chiffré du PC (état du Bureau, version 2). Lecture seule sur ses entrées. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const L0 = node ? require('./bureau-logique.js') : racine.BureauLogique;

  const VERSION = 1, MAX = 20000;
  const TYPES = ['liaison', 'absence', 'annulation'];
  const SOURCES = { liaison: 'Liaison EBP validée par une personne', absence: 'Absence de compte vérifiée dans EBP', annulation: 'Annulation par une personne' };
  const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const iso = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T12:00:00Z')) ? d : null;
  const siretDe = s => { const v = String(s || '').replace(/\s/g, ''); return /^\d{14}$/.test(v) ? v : null; };
  const cleDe = c => c.tel != null ? 'tel:' + c.tel : 'sir:' + c.siret;

  const creerJournal = () => ({ version: VERSION, decisions: [] });

  // Contrôle d'une décision (à l'ajout ET à la relecture du coffre). Renvoie un motif de refus ou null.
  function controle(d, connues) {
    if (!d || typeof d !== 'object') return 'Décision illisible';
    if (!TYPES.includes(d.type)) return 'Type de décision inconnu';
    if (!txt(d.auteur, 60)) return 'Auteur obligatoire';
    if (!iso(d.date)) return 'Date obligatoire (AAAA-MM-JJ)';
    if (d.type === 'annulation') { if (!connues || !connues.has(d.annule)) return 'Décision à annuler introuvable'; return null; }
    const c = d.cible || {};
    if (!(Number.isSafeInteger(c.tel) && c.tel > 0) && !siretDe(c.siret)) return 'Garage visé obligatoire (n° du téléphone ou SIRET)';
    if (c.tel != null && (!txt(c.nom, 120) || typeof c.cp !== 'string')) return 'Nom et code postal du garage obligatoires (contrôle aux imports suivants)';
    if (d.type === 'liaison' && !txt(d.codeEbp, 40)) return 'Code client EBP obligatoire pour une liaison';
    return null;
  }

  // Ajoute une décision. Ne modifie pas le journal reçu : en renvoie un nouveau. Lève une erreur claire si refusée.
  function decider(journal, e, { maintenant = new Date().toISOString() } = {}) {
    const j = journal && Array.isArray(journal.decisions) ? journal : creerJournal();
    if (j.decisions.length >= MAX) throw new Error('Journal des décisions plein (' + MAX + ').');
    const aujourdhui = maintenant.slice(0, 10);
    const c = e.cible || {};
    const d = { id: 'D' + String(j.decisions.length + 1).padStart(6, '0'), type: e.type, auteur: txt(e.auteur, 60), date: e.date || aujourdhui,
      source: SOURCES[e.type] || '', creeLe: maintenant, note: txt(e.note, 300) || null };
    if (e.type === 'annulation') d.annule = e.annule;
    else {
      d.cible = c.tel != null ? { tel: c.tel, nom: txt(c.nom, 120), cp: txt(c.cp, 10), siret: siretDe(c.siret) } : { siret: siretDe(c.siret), nom: txt(c.nom, 120) || null };
      d.exportClientsDu = iso(e.exportClientsDu) || null;
      if (e.type === 'liaison') d.codeEbp = txt(e.codeEbp, 40);
    }
    const actives = new Set(j.decisions.map(x => x.id));
    const refus = controle(d, actives);
    if (refus) throw new Error(refus);
    if (d.date > aujourdhui) throw new Error('Date dans le futur refusée');
    if (d.type === 'annulation' && j.decisions.some(x => x.type === 'annulation' && x.annule === d.annule)) throw new Error('Décision déjà annulée');
    return { journal: { version: VERSION, decisions: j.decisions.concat([d]) }, decision: d };
  }

  // Relecture (coffre) : vérifie chaque décision ; ne jette rien. Les décisions illisibles sont signalées et conservées telles quelles.
  function lire(brut) {
    if (!brut) return { journal: creerJournal(), illisibles: [] };
    if (typeof brut !== 'object' || brut.version !== VERSION || !Array.isArray(brut.decisions)) return { journal: null, illisibles: [], erreur: 'Journal des décisions dans un format inconnu' };
    const vues = new Set(), illisibles = [];
    brut.decisions.forEach((d, i) => { const m = controle(d, vues); if (m || !d.id || vues.has(d.id)) illisibles.push({ position: i + 1, motif: m || 'Identifiant absent ou en double' }); vues.add(d && d.id); });
    return { journal: brut, illisibles };
  }

  // Applique le journal aux données du moment. terrain = fiches du téléphone (id, nom, cp, ville) ; clientsEbp = fichier clients EBP chargé.
  // Renvoie de quoi alimenter ModeleCommune (liaisonsValidees, verificationsCompte, aRevoir) et l'état de CHAQUE décision.
  function appliquer(journal, { terrain = [], clientsEbp = [], piecesEbp = [], exportClientsDu = null } = {}) {
    const decisions = (journal && journal.decisions) || [];
    const etats = new Map(), etat = (d, e, motif) => etats.set(d.id, { id: d.id, etat: e, motif: motif || null, decision: d });
    const annulees = new Map(decisions.filter(d => d.type === 'annulation').map(d => [d.annule, d]));
    decisions.filter(d => d.type === 'annulation').forEach(d => etat(d, 'appliquee', 'Annule ' + d.annule));
    // Une décision par garage : la plus récente non annulée ; les précédentes sont « remplacées » (gardées dans l'historique).
    const parGarage = new Map();
    for (const d of decisions) {
      if (d.type === 'annulation') continue;
      const k = cleDe(d.cible);
      if (annulees.has(d.id)) { // annuler ne réactive jamais une décision plus ancienne : le garage redevient « à vérifier »
        const a = annulees.get(d.id); etat(d, 'annulee', 'Annulée le ' + a.date + ' par ' + a.auteur);
        if (parGarage.has(k)) etat(parGarage.get(k), 'remplacee', 'Remplacée par ' + d.id + ' (' + d.date + '), elle-même annulée');
        parGarage.delete(k); continue;
      }
      if (parGarage.has(k)) etat(parGarage.get(k), 'remplacee', 'Remplacée par ' + d.id + ' (' + d.date + ')');
      parGarage.set(k, d);
    }
    const tel = new Map(terrain.filter(c => c && Number.isSafeInteger(c.id)).map(c => [c.id, c]));
    const codesConnus = new Set([...clientsEbp.map(c => String(c.code || '').trim()), ...piecesEbp.map(p => String(p.code || '').trim())].filter(Boolean));
    const nn = s => L0.normNom(s), cpDe = c => String(c.cp || c.codePostal || '').trim();
    const liaisons = [], verifs = [], aRevoir = [];
    const revoir = (d, motif, e = 'a_reverifier') => { etat(d, e, motif); aRevoir.push({ ref: d.cible.tel != null ? 'tel:' + d.cible.tel : null, siret: d.cible.siret || null, motif, decision: d.id }); };

    const candidates = [...parGarage.values()];
    // Identité du garage : même n° de téléphone mais autre nom ou autre code postal → jamais appliqué en silence.
    const valides = candidates.filter(d => {
      if (d.cible.tel == null) return true;
      const g = tel.get(d.cible.tel);
      if (!g) { etat(d, 'orpheline', 'Garage n° ' + d.cible.tel + ' (' + d.cible.nom + ') absent de la sauvegarde du téléphone chargée : décision conservée, non appliquée'); return false; }
      if (nn(g.nom) !== nn(d.cible.nom) || cpDe(g) !== d.cible.cp) {
        revoir(d, 'Le garage n° ' + d.cible.tel + ' a changé (décision prise pour « ' + d.cible.nom + ' » ' + d.cible.cp + ', aujourd’hui « ' + txt(g.nom, 120) + ' » ' + cpDe(g) + ') : à revérifier');
        return false;
      }
      return true;
    });
    // Liaisons : un même code EBP relié à deux garages différents = conflit, aucune des deux n'est appliquée.
    const parCode = new Map();
    valides.filter(d => d.type === 'liaison').forEach(d => { if (!parCode.has(d.codeEbp)) parCode.set(d.codeEbp, []); parCode.get(d.codeEbp).push(d); });
    const codesLies = new Set();
    for (const [code, l] of parCode) {
      if (l.length > 1) { l.forEach(d => revoir(d, 'Code EBP ' + code + ' relié à ' + l.length + ' garages différents (' + l.map(x => x.cible.nom).join(', ') + ') : à revérifier', 'conflit')); continue; }
      const d = l[0];
      if (!codesConnus.has(code)) { etat(d, 'en_attente', 'Code EBP ' + code + ' absent des exports chargés : rien n’est appliqué ni inventé tant que le client n’y figure pas'); continue; }
      codesLies.add(code);
      liaisons.push({ a: d.cible.tel != null ? 'tel:' + d.cible.tel : 'sir:' + d.cible.siret, b: 'ebp:' + code, par: d.auteur, date: d.date, source: d.source, decision: d.id });
      etat(d, 'appliquee');
    }
    // Absences : une fiche EBP au même nom dans le même code postal (non reliée ailleurs) contredit la déclaration → à revérifier.
    const ebpParNom = new Map();
    clientsEbp.forEach(c => { const k = nn(c.nom) + '|' + String(c.cp || '').trim(); if (!ebpParNom.has(k)) ebpParNom.set(k, []); ebpParNom.get(k).push(c); });
    for (const d of valides.filter(x => x.type === 'absence')) {
      const g = d.cible.tel != null ? tel.get(d.cible.tel) : null;
      const k = nn(g ? g.nom : d.cible.nom) + '|' + (g ? cpDe(g) : '');
      const proches = (ebpParNom.get(k) || []).filter(c => !codesLies.has(String(c.code).trim()));
      if (proches.length) { revoir(d, 'Absence déclarée le ' + d.date + ' par ' + d.auteur + ', mais l’export clients EBP' + (exportClientsDu ? ' du ' + exportClientsDu : '') + ' contient « ' + proches.map(c => c.nom + ' » (code ' + c.code + ')').join(', « ') + ' : à revérifier', 'contredite'); continue; }
      verifs.push(Object.assign(d.cible.tel != null ? { ref: 'tel:' + d.cible.tel } : { siret: d.cible.siret }, { resultat: 'aucun_compte', par: d.auteur, date: d.date, source: d.source, decision: d.id }));
      etat(d, 'appliquee');
    }
    const liste = decisions.map(d => etats.get(d.id));
    const compte = e => liste.filter(x => x.etat === e).length;
    return { liaisonsValidees: liaisons, verificationsCompte: verifs, aRevoir, etats: liste,
      bilan: { total: decisions.length, appliquees: compte('appliquee'), remplacees: compte('remplacee'), annulees: compte('annulee'), aReverifier: compte('a_reverifier'),
        contredites: compte('contredite'), conflits: compte('conflit'), orphelines: compte('orpheline'), enAttente: compte('en_attente') } };
  }

  const api = { VERSION, SOURCES, creerJournal, decider, lire, appliquer };
  if (node) module.exports = api; else racine.DecisionsComptes = api;
})(typeof self !== 'undefined' ? self : this);
