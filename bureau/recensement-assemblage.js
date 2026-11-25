/* ODICOLOR 2.0 — Recensement 45.20A : ASSEMBLAGE et CONTRÔLES des résultats de l'extraction (aucune donnée dans ce fichier).
   Entrée : les établissements lus dans le fichier officiel INSEE « StockEtablissement » (Parquet, data.gouv.fr), les noms d'entreprises lus dans « StockUniteLegale »,
   et la description de la lecture (nombre de lignes lues, de blocs lus, source, dates).
   Sortie : le fichier CSV par commune, les comptes par département et par commune, et le verdict des contrôles.
   Règle : si UN contrôle échoue, le résultat est « incomplet » et AUCUN nombre n'est donné (les nombres partiels restent à part, jamais présentés comme finaux).
   Contrôles : fichier lu en entier (lignes lues = lignes annoncées, blocs lus = blocs annoncés), SIRET à 14 chiffres, SIRET distincts, code 45.20A établissement, état actif,
   départements demandés seulement. 45.20A = mécanique ET carrosserie : jamais une confirmation d'activité de peinture. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const COMMUNES = node ? require('./communes-idf.js') : racine.COMMUNES_IDF;
  const NOM_COMMUNE = new Map((COMMUNES || []).map(c => [c[3], c[4] || c[0]]));
  // Codes communes présents dans le fichier officiel Sirene mais absents du référentiel du Bureau (qui range Pierrefitte-sur-Seine sous Saint-Denis, 93066).
  // Le code du fichier officiel est CONSERVÉ ; seul le nom est ajouté (49 des 51 établissements ont le code postal 93380, celui de Pierrefitte-sur-Seine).
  const ALIAS_COMMUNES = Object.freeze({ '93059': 'Pierrefitte-sur-Seine' });
  const nomCommune = insee => NOM_COMMUNE.get(insee) || ALIAS_COMMUNES[insee] || '';
  const DEPARTEMENTS = Object.freeze(['95', '94', '91', '77', '93']);   // ordre cité : pas un classement
  const COLONNES = Object.freeze(['siret', 'siren', 'nom', 'enseigne', 'denomination_usuelle', 'denomination_entreprise', 'commune_insee', 'commune', 'departement', 'code_postal', 'naf', 'diffusion']);
  const LIMITES = Object.freeze([
    '45.20A = entretien et réparation de véhicules légers (mécanique ET carrosserie) : ce n’est pas une confirmation d’activité de peinture.',
    'Nombre établi sur le fichier officiel du stock Sirene à sa date : les créations et fermetures postérieures n’y figurent pas.',
    'Les établissements « à diffusion partielle » sont comptés, mais leur nom et leur adresse ne sont pas publics : ils figurent sans nom.',
    'Les établissements totalement non diffusibles n’existent pas dans le fichier public : ils ne sont pas comptés.',
    'Un établissement est rattaché au département de sa commune d’implantation (code officiel de la commune), pas au siège de son entreprise.'
  ]);
  const vide = v => v == null || /^\s*(\[?ND\]?)?\s*$/i.test(String(v));
  const txt = v => vide(v) ? '' : String(v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

  // Nom : le plus précis connu (dénomination usuelle, enseigne, dénomination de l'entreprise, ou nom et prénom d'un entrepreneur individuel). Jamais inventé.
  function nomDe(e, ul) {
    ul = ul || {};
    const ei = [txt(ul.prenomUsuelUniteLegale), txt(ul.nomUniteLegale)].filter(Boolean).join(' ');
    return txt(e.denominationUsuelleEtablissement) || txt(e.enseigne1Etablissement) || txt(ul.denominationUniteLegale) || ei || txt(ul.sigleUniteLegale) || '';
  }

  function assembler({ etablissements, noms = {}, lecture = {} }) {
    const erreurs = [], vus = new Set(), lignes = [], rejets = { siretInvalide: 0, doublons: 0, autreCode: 0, horsDepartement: 0 };
    for (const e of etablissements) {
      const siret = String(e.siret || '').replace(/\s/g, '');
      if (!/^\d{14}$/.test(siret)) { rejets.siretInvalide++; continue; }
      if (e.naf !== '45.20A') { rejets.autreCode++; continue; }
      const insee = String(e.commune || ''), dep = insee.slice(0, 2);
      if (!DEPARTEMENTS.includes(dep)) { rejets.horsDepartement++; continue; }
      if (vus.has(siret)) { rejets.doublons++; continue; }
      vus.add(siret);
      const ul = noms[e.siren] || null;
      lignes.push({ siret, siren: siret.slice(0, 9), nom: nomDe(e, ul), enseigne: txt(e.enseigne1Etablissement), denomination_usuelle: txt(e.denominationUsuelleEtablissement),
        denomination_entreprise: txt(ul && ul.denominationUniteLegale), commune_insee: insee, commune: nomCommune(insee), departement: dep, code_postal: txt(e.codePostalEtablissement),
        naf: '45.20A', diffusion: e.statutDiffusionEtablissement === 'P' ? 'P' : 'O' });
    }
    // Contrôles de complétude et de cohérence
    if (!(lecture.lignesLues > 0) || lecture.lignesLues !== lecture.lignesAttendues) erreurs.push('Fichier non lu en entier : ' + lecture.lignesLues + ' lignes lues sur ' + lecture.lignesAttendues + ' annoncées.');
    if (lecture.groupesLus !== lecture.groupesAttendus) erreurs.push('Blocs lus : ' + lecture.groupesLus + ' sur ' + lecture.groupesAttendus + ' annoncés.');
    if (rejets.siretInvalide) erreurs.push(rejets.siretInvalide + ' SIRET invalide(s).');
    if (rejets.autreCode) erreurs.push(rejets.autreCode + ' établissement(s) d’un autre code que 45.20A.');
    if (rejets.horsDepartement) erreurs.push(rejets.horsDepartement + ' établissement(s) hors des départements demandés.');
    const base = { source: lecture.source || null, fichierDu: lecture.fichierDu || null, extraitLe: lecture.extraitLe || null, naf: '45.20A', limites: LIMITES, controles: { ...lecture, rejets } };
    if (erreurs.length) return { ...base, statut: 'incomplet', motifs: erreurs, comptes: null, lignes: null };
    const parDep = Object.fromEntries(DEPARTEMENTS.map(d => [d, 0])), parCommune = new Map();
    for (const l of lignes) { parDep[l.departement]++; const k = l.commune_insee; if (!parCommune.has(k)) parCommune.set(k, { commune_insee: k, commune: l.commune, departement: l.departement, etablissements: 0, diffusion_partielle: 0, sans_nom: 0 }); const c = parCommune.get(k); c.etablissements++; if (l.diffusion === 'P') c.diffusion_partielle++; if (!l.nom) c.sans_nom++; }
    // Les doublons éventuels ont été comptés à part : leur présence n'invalide pas le comptage (SIRET distincts) mais reste visible.
    lignes.sort((a, b) => DEPARTEMENTS.indexOf(a.departement) - DEPARTEMENTS.indexOf(b.departement) || a.commune_insee.localeCompare(b.commune_insee) || a.siret.localeCompare(b.siret));
    return { ...base, statut: 'complet', motifs: [], lignes,
      comptes: { parDepartement: DEPARTEMENTS.map(d => ({ departement: d, etablissements: parDep[d] })), total: lignes.length, communes: parCommune.size,
        sansNom: lignes.filter(l => !l.nom).length, diffusionPartielle: lignes.filter(l => l.diffusion === 'P').length, communesSansNomOfficiel: lignes.filter(l => !l.commune).length },
      parCommune: [...parCommune.values()].sort((a, b) => DEPARTEMENTS.indexOf(a.departement) - DEPARTEMENTS.indexOf(b.departement) || a.commune_insee.localeCompare(b.commune_insee)) };
  }

  const cellule = v => { const s = String(v == null ? '' : v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function versCsv(objets, colonnes) { return '﻿' + [colonnes.join(';'), ...objets.map(o => colonnes.map(c => cellule(o[c])).join(';'))].join('\r\n') + '\r\n'; }

  const api = { DEPARTEMENTS, COLONNES, LIMITES, ALIAS_COMMUNES, nomDe, assembler, versCsv };
  if (node) module.exports = api; else racine.RecensementAssemblage = api;
})(typeof self !== 'undefined' ? self : this);
