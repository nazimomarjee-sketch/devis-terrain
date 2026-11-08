/* ODICOLOR 2.0 — Recensement : PRÉPARATION de l'import des établissements 45.20A dans « Marché à prospecter » de Ma Ville. Aucune donnée dans ce fichier.
   Entrée : le fichier CSV du recensement (une ligne par établissement actif de code 45.20A, avec sa commune), produit à partir du stock officiel SIRENE
   (INSEE, data.gouv.fr). Sortie : le format du « marché » que le Bureau sait déjà lire (même forme que l'import de l'annuaire du 91),
   donc ModeleCommune les place dans « Marché à prospecter » : catégorie « à qualifier », gris, jamais une couleur commerciale.
   Règles du propriétaire :
   - 45.20A = entretien et réparation de véhicules légers (mécanique ET carrosserie) : AUCUN établissement n'est qualifié « peintre » ici.
     Le niveau de preuve d'activité peinture est « inconnu » ; il ne change que par une preuve (achat EBP, constat terrain…), jamais par une note ni un nom.
   - SIRET distincts (14 chiffres) ; les lignes invalides ou en double sont comptées à part, jamais perdues en silence ;
   - source et date d'extraction conservées ; les établissements à diffusion partielle restent listés, sans nom inventé. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const COMMUNES = node ? require('./communes-idf.js') : racine.COMMUNES_IDF;
  const NOM_COMMUNE = new Map((COMMUNES || []).map(c => [c[3], c[4] || c[0]]));          // INSEE → nom (commune actuelle)
  const ALIAS_COMMUNES = Object.freeze({ '93059': 'Pierrefitte-sur-Seine' });              // code du fichier officiel absent du référentiel du Bureau : même table que recensement-assemblage.js
  const nomCommune = insee => NOM_COMMUNE.get(insee) || ALIAS_COMMUNES[insee] || '';
  const DEPARTEMENTS = Object.freeze(['95', '94', '91', '77', '93']);                      // ordre cité : pas un classement
  const COLONNES = Object.freeze(['siret', 'siren', 'nom', 'enseigne', 'denomination_usuelle', 'denomination_entreprise', 'commune_insee', 'code_postal', 'naf', 'diffusion']);
  const AVERTISSEMENT = '45.20A = entretien et réparation de véhicules légers (mécanique ET carrosserie) : activité peinture NON confirmée.';
  const ND = /^\[?ND\]?$/i;

  const txt = (v, n = 160) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

  // CSV (séparateur « ; », guillemets, BOM) → liste d'objets selon la ligne d'en-têtes.
  function lireCsv(texte) {
    const t = String(texte).replace(/^﻿/, ''), lignes = []; let l = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ';') { l.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; l.push(cur); cur = ''; if (l.some(x => x !== '')) lignes.push(l); l = []; }
      else cur += c;
    }
    if (cur !== '' || l.length) { l.push(cur); if (l.some(x => x !== '')) lignes.push(l); }
    if (!lignes.length) throw new Error('Fichier vide.');
    const ent = lignes[0].map(x => txt(x, 60)), manque = ['siret', 'commune_insee'].filter(c => !ent.includes(c));
    if (manque.length) throw new Error('Colonne(s) obligatoire(s) absente(s) : ' + manque.join(', ') + '. Colonnes lues : ' + ent.join(' | '));
    return lignes.slice(1).map(r => Object.fromEntries(ent.map((c, i) => [c, r[i] == null ? '' : r[i]])));
  }

  // Une ligne du recensement → un établissement du marché (ou null avec le motif du rejet).
  function etablissement(r, date) {
    const siret = String(r.siret || '').replace(/\s/g, '');
    if (!/^\d{14}$/.test(siret)) return { rejet: 'SIRET invalide' };
    const insee = txt(r.commune_insee, 5), naf = txt(r.naf, 8) || '45.20A';
    if (naf !== '45.20A') return { rejet: 'Code ' + naf + ' : seul le 45.20A est importé' };
    const brut = [r.denomination_usuelle, r.enseigne, r.denomination_entreprise, r.nom].map(v => txt(v, 160)).find(v => v && !ND.test(v));
    const partielle = String(r.diffusion || '').toUpperCase() === 'P';
    return { e: { id: 'a-' + siret, source: 'annuaire', siret, siren: siret.slice(0, 9), nom: brut || 'Nom non communiqué (diffusion partielle)', raisonSociale: txt(r.denomination_entreprise, 160),
      adresse: '', cp: txt(r.code_postal, 5), ville: nomCommune(insee), insee, naf: '45.20A', tranche: 'NN', estSiege: false, position: null,
      // JAMAIS « carrosserie probable » : le code 45.20A ne dit pas si l'atelier fait de la peinture.
      typeProbable: 'a_qualifier', motifType: AVERTISSEMENT, activitePeinture: { niveau: 'inconnu', preuve: null },
      diffusionPartielle: partielle, communeConnue: !!nomCommune(insee), statut: 'marche', score: 0, raisons: [] } };
  }

  // Lignes du recensement → un « marché » par département (format du cache du Bureau), avec le bilan complet et les rejets à part.
  function versMarche(lignes, meta = {}) {
    const date = txt(meta.date, 30) || null, vus = new Set(), rejets = [], parDep = new Map(DEPARTEMENTS.map(d => [d, []]));
    let doublons = 0, horsDep = 0;
    for (const r of lignes) {
      const x = etablissement(r, date);
      if (x.rejet) { rejets.push({ siret: txt(r.siret, 20), motif: x.rejet }); continue; }
      if (vus.has(x.e.siret)) { doublons++; continue; }
      const dep = x.e.insee.slice(0, 2);
      if (!parDep.has(dep)) { horsDep++; rejets.push({ siret: x.e.siret, motif: 'Commune ' + (x.e.insee || '?') + ' hors des cinq départements' }); continue; }
      vus.add(x.e.siret); parDep.get(dep).push(x.e);
    }
    const marches = {};
    for (const [dep, l] of parDep) marches[dep] = { etablissements: l, date, total: l.length, pages: 1, doublons: 0, source: txt(meta.source, 200) || null,
      communesSansNom: l.filter(e => !e.communeConnue).length, avertissement: AVERTISSEMENT };
    // `marches` est indexé par département (les clés numériques d'un objet JavaScript se rangent d'elles-mêmes par ordre croissant) : `liste` garde l'ordre cité.
    const liste = DEPARTEMENTS.map(d => ({ departement: d, total: marches[d].total }));
    return { marches, liste, bilan: { lignes: lignes.length, importes: vus.size, doublons, rejetes: rejets.length, horsDepartements: horsDep, parDepartement: Object.fromEntries(DEPARTEMENTS.map(d => [d, parDep.get(d).length])) }, rejets, date, avertissement: AVERTISSEMENT };
  }

  const api = { DEPARTEMENTS, COLONNES, AVERTISSEMENT, ALIAS_COMMUNES, lireCsv, etablissement, versMarche };
  if (node) module.exports = api; else racine.MarcheSirene = api;
})(typeof self !== 'undefined' ? self : this);
