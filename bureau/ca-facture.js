/* ODICOLOR 2.0 — CA FACTURÉ HT DU MOIS EN COURS (Bureau, Ma Ville, fiches). LECTURE SEULE.
   Règles du propriétaire (07/11/2026) :
   - seulement les FACTURES émises, à leur date, hors taxes ; les AVOIRS sont déduits à LEUR date ;
     jamais de commandes, devis, bons de livraison ni encaissements dans ce chiffre ;
   - une facture (ou un avoir) = un numéro : un numéro vu deux fois n'est compté qu'une fois, et signalé ;
   - rattachement : code client EBP de la pièce → établissement (même code EBP dans le modèle Ma Ville) → commune → département.
     AUCUN rapprochement par le nom. Une pièce sans code, avec un code inconnu ou un client sans commune reconnue va dans
     « non attribué géographiquement », affiché à part : il entre dans le total global, jamais dans un département ;
   - chaque euro est compté une seule fois par niveau : établissement ⊂ commune ⊂ département ⊂ Île-de-France ;
     total global = Île-de-France attribuée + non attribué (vérifié : controle.ok) ;
   - pas d'export, ou export antérieur au mois en cours → « Non renseigné » (null), jamais un faux zéro ;
   - CA personnel seulement si le fichier clients EBP indique le représentant ET si le code du commercial est renseigné.
   Montants en centimes entiers. Dates « AAAA-MM-JJ ». */
(function (racine) {
  'use strict';
  const iso = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) ? d.slice(0, 10) : null;
  const finMois = m => { const [a, n] = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(a, n, 0)).getUTCDate()).padStart(2, '0'); };
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const libelleMois = m => MOIS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);
  const fr = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';

  // e = { pieces, avoirs, ignorees (lignes écartées de l'export des pièces), clientsEbp, modele (ModeleCommune.construire), arrete, aujourdhui, monCommercial }
  function calculer(e = {}) {
    const aujourdhui = iso(e.aujourdhui), arrete = iso(e.arrete);
    if (!aujourdhui) throw new Error('Date du jour obligatoire (AAAA-MM-JJ).');
    const mois = aujourdhui.slice(0, 7), debut = mois + '-01';
    const base = { mois, libelleMois: libelleMois(mois), debut, arrete, source: 'EBP' };
    const nonRenseigne = motif => Object.assign(base, { statut: 'non_renseigne', motif, totalCents: null, fin: null });
    if (!Array.isArray(e.pieces)) return nonRenseigne('Export des pièces EBP non chargé');
    if (!arrete) return nonRenseigne('Date de l’export EBP inconnue');
    if (arrete < debut) return nonRenseigne('Dernier export EBP du ' + fr(arrete) + ', antérieur au mois en cours : à réimporter');
    const fin = arrete < finMois(mois) ? arrete : finMois(mois), dans = d => !!d && d >= debut && d <= fin;
    const incomplets = [], doublons = [], vus = new Map(), lignes = [];
    const ajouter = (type, p, cents) => {
      const cle = type + '|' + p.no;
      if (vus.has(cle)) { const a = vus.get(cle); doublons.push({ type, no: p.no, identique: a.date === p.date && a.cents === cents }); return; }
      const l = { type, no: p.no, date: p.date, code: String(p.code || '').trim(), client: p.client || '', cents };
      vus.set(cle, l); lignes.push(l);
    };
    for (const p of e.pieces) if (p && p.type === 'facture' && dans(p.date)) ajouter('facture', p, p.htCents);
    for (const a of e.avoirs || []) {
      if (!a) continue;
      if (!iso(a.date) || !Number.isFinite(a.htCents)) { incomplets.push('Avoir ' + (a.no || '?') + ' : date ou montant illisible, non déduit'); continue; }
      if (dans(a.date)) ajouter('avoir', a, -Math.abs(a.htCents));
    }
    const ign = (e.ignorees || []).length;
    if (ign) incomplets.push(ign + ' ligne(s) de l’export des pièces écartée(s) à l’import : le CA peut être sous-estimé');
    if (doublons.length) incomplets.push(doublons.length + ' pièce(s) en double (même numéro) comptée(s) une seule fois : ' + doublons.map(d => d.no).join(', '));
    const multi = e.pieces.filter(p => p && p.type === 'facture' && dans(p.date) && p.lignesSource > 1).length;
    const identiques = e.pieces.filter(p => p && p.type === 'facture' && dans(p.date) && p.lignesIdentiques > 0);
    if (identiques.length) incomplets.push(identiques.length + ' facture(s) contenant des lignes strictement identiques (export dupliqué ?) : ' + identiques.map(p => p.no).join(', ') + ' — montant à vérifier dans EBP');
    if (multi) incomplets.push(multi + ' facture(s) totalisée(s) sur plusieurs lignes d’article (export ligne par ligne) : vérifier que l’export n’est pas dupliqué');

    // Rattachement : uniquement par le code client EBP.
    const parCode = new Map();
    if (e.modele) for (const x of [...e.modele.communes.values()].flatMap(c => c.etablissements).concat(e.modele.aClasser)) for (const c of x.codesEbp) parCode.set(c, x);
    const parEtab = new Map(), parCommune = new Map(), parDep = new Map(), nonAttribue = { cents: 0, lignes: [] };
    const plus = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    for (const l of lignes) {
      const x = l.code ? parCode.get(l.code) : null;
      const motif = !l.code ? 'Code client absent de la pièce (aucun rapprochement par le nom)' : !x ? 'Code client ' + l.code + ' inconnu des données chargées'
        : !x.insee ? 'Client ' + l.code + ' sans commune reconnue (' + x.rattachement.motif + ')' : null;
      if (x) plus(parEtab, x.uid, l.cents);
      if (motif) { nonAttribue.cents += l.cents; nonAttribue.lignes.push(Object.assign({ motif }, l)); continue; }
      l.uid = x.uid; l.insee = x.insee; l.dep = x.dep;
      plus(parCommune, x.insee, l.cents); plus(parDep, x.dep, l.cents);
    }
    const somme = l => l.reduce((s, x) => s + x.cents, 0);
    const totalCents = somme(lignes), idfCents = [...parDep.values()].reduce((s, v) => s + v, 0);
    const factures = lignes.filter(l => l.type === 'facture'), avoirs = lignes.filter(l => l.type === 'avoir');

    // CA personnel : par le représentant du fichier clients EBP, jamais deviné.
    let personnel;
    const reps = new Map((e.clientsEbp || []).filter(c => c && c.code).map(c => [String(c.code).trim(), String(c.commercial || '').trim()]));
    const mon = String(e.monCommercial || '').trim();
    if (![...reps.values()].some(Boolean)) personnel = { statut: 'non_renseigne', totalCents: null, motif: 'Le fichier clients EBP chargé n’indique pas le représentant de chaque client' };
    else if (!mon) personnel = { statut: 'non_renseigne', totalCents: null, motif: 'Ton code représentant EBP n’est pas renseigné' };
    else {
      const miennes = lignes.filter(l => reps.get(l.code) === mon), sansRep = lignes.filter(l => !reps.get(l.code));
      personnel = { statut: 'renseigne', commercial: mon, totalCents: somme(miennes), nbPieces: miennes.length,
        nonRattacheCents: somme(sansRep), motif: sansRep.length ? sansRep.length + ' pièce(s) sans représentant connu, exclue(s) de ton CA' : null };
    }
    return Object.assign(base, {
      statut: 'renseigne', fin, totalCents, facturesCents: somme(factures), avoirsCents: somme(avoirs), nbFactures: factures.length, nbAvoirs: avoirs.length,
      idfCents, nonAttribue, parEtablissement: Object.fromEntries(parEtab), parCommune: Object.fromEntries(parCommune), parDep: Object.fromEntries(parDep),
      lignes, doublons, incomplets, personnel,
      controle: { ok: idfCents + nonAttribue.cents === totalCents && totalCents === somme(factures) + somme(avoirs) }
    });
  }

  // Valeur à afficher pour un niveau. niveau : 'global' | 'idf' | 'dep' | 'commune' | 'etablissement' (cle = dep, INSEE ou établissement).
  // null = « Non renseigné ». Un établissement sans compte EBP : null aussi (pas de CA facturable connu), avec son motif.
  function valeur(r, niveau, cle) {
    if (!r || r.statut !== 'renseigne') return { cents: null, motif: r ? r.motif : 'Non calculé' };
    if (niveau === 'global') return { cents: r.totalCents };
    if (niveau === 'idf') return { cents: r.idfCents };
    if (niveau === 'dep') return { cents: r.parDep[cle] || 0 };
    if (niveau === 'commune') return { cents: r.parCommune[cle] || 0 };
    if (niveau === 'etablissement') {
      const x = cle; if (!x || !x.codesEbp || !x.codesEbp.length) return { cents: null, motif: 'Pas de compte client EBP' };
      return { cents: r.parEtablissement[x.uid] || 0 };
    }
    throw new Error('Niveau inconnu : ' + niveau);
  }
  const euros = c => c == null ? 'Non renseigné' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100) + ' HT';
  // Fraîcheur : jamais « en temps réel ». Les données valent à la date de l'export EBP.
  const fraicheur = r => !r || !r.arrete ? 'Aucun export EBP chargé' : 'Export EBP du ' + fr(r.arrete) + ' · pas en temps réel';

  const api = { calculer, valeur, euros, fraicheur, libelleMois };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.CaFacture = api;
})(typeof self !== 'undefined' ? self : this);
