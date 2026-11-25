/* ODICOLOR — Ma Ville : un seul établissement professionnel par entreprise réelle, classé en 4 segments (règle du
   propriétaire, 07/11/2026). Logique pure, testée ; pas encore affichée dans la Ville (maquette soumise à accord).
   Segments et couleurs :
     client carrosserie = rouge · client mécanique = noir · prospect carrosserie = orange · prospect mécanique = bleu
     activité inconnue = « à qualifier » (gris), jamais devinée.
   Sources : EBP (clients, pièces), SIRENE / annuaire officiel (établissements actifs 45.20A), prospection terrain (téléphone).
   Règles de vérité :
   - client = connu dans EBP (fichier clients ou pièces) ; un client EBP sans commande depuis 12 mois reste client,
     marqué « inactif » ; un compte bloqué reste identifiable ;
   - activité : famille EBP > saisie terrain > nom de l'entreprise (indice « probable », signalé comme tel). Le code NAF
     ne suffit pas : 45.20A couvre carrosserie ET mécanique ;
   - aucun doublon automatique : SIRET ou code EBP identiques = même établissement ; nom + commune identiques et uniques
     = rapprochement PROBABLE, affiché une fois et signalé « à confirmer » ; plusieurs candidats = rien n'est fusionné,
     l'entrée de l'annuaire est mise de côté « à rapprocher » (jamais affichée en double) ;
   - uniquement des établissements professionnels : l'annuaire ne fournit que des entreprises actives ; le terrain ne
     contient que des garages. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const L0 = node ? require('./bureau-logique.js') : racine.BureauLogique;

  const SEGMENTS = Object.freeze({
    'client-carrosserie': { libelle: 'Client ODICOLOR carrosserie', couleur: '#D41F2B' },
    'client-mecanique': { libelle: 'Client ODICOLOR mécanique', couleur: '#0B0B0D' },
    'prospect-carrosserie': { libelle: 'Prospect carrosserie', couleur: '#F0952B' },
    'prospect-mecanique': { libelle: 'Prospect mécanique', couleur: '#3E86F0' },
    'client-a_qualifier': { libelle: 'Client ODICOLOR, activité à qualifier', couleur: '#6E737B' },
    'prospect-a_qualifier': { libelle: 'Prospect, activité à qualifier', couleur: '#6E737B' }
  });
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const plus = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);

  function activiteDepuisTexte(t, source) {
    const n = norm(t); if (!n) return null;
    if (/\bmeca|mecan|entretien|pneu|vidange/.test(n)) return { activite: 'mecanique', source, probable: source === 'nom' };
    if (/carross|peint|toler|debossel/.test(n)) return { activite: 'carrosserie', source, probable: source === 'nom' };
    return null;
  }

  // entrees : { terrain: fiches téléphone (lireClients), clientsEbp, piecesEbp, annuaire: établissements (annuaire.js), arrete }
  function construire({ terrain = [], clientsEbp = [], piecesEbp = [], annuaire = [], arrete }) {
    if (!/^\d{4}-\d\d-\d\d$/.test(arrete || '')) throw new Error('Date de référence obligatoire.');
    const etab = [], aRapprocher = [], parSiret = new Map(), parCode = new Map(), parNomCommune = new Map();
    const indexer = e => {
      if (e.siret) parSiret.set(e.siret, e);
      if (e.codeEbp) parCode.set(e.codeEbp, e);
      const k = norm(e.nom) + '|' + norm(e.commune);
      parNomCommune.set(k, parNomCommune.has(k) && parNomCommune.get(k) !== e ? null : e); // null = plusieurs candidats
    };
    const nouveau = (nom, lieu, source) => {
      const cl = L0.classer({ cp: lieu.cp, commune: lieu.commune || lieu.ville });
      const e = { nom, commune: cl.commune || '', dep: cl.dep || '', cp: cl.cp || '', classement: cl.niveau, sources: [source], siret: '', codeEbp: '', activite: null,
        client: false, inactif: false, compteBloque: false, rapprochement: 'certain' };
      etab.push(e); return e;
    };
    const trouver = (siret, code, nom, commune) => (siret && parSiret.get(siret)) || (code && parCode.get(code)) || null;
    const candidats = (nom, commune) => { const k = norm(nom) + '|' + norm(commune); return parNomCommune.has(k) ? parNomCommune.get(k) : undefined; };

    // 1. Terrain (fiches du téléphone) : chaque fiche est un établissement, homonymes compris (jamais fusionnés entre eux).
    for (const g of terrain) {
      const e = nouveau(g.nom, { cp: g.cp, ville: g.commune || g.ville }, 'terrain');
      e.terrainId = g.id; if (g.siret) e.siret = String(g.siret).replace(/\D/g, '');
      e.activite = activiteDepuisTexte(g.activite, 'terrain');
      indexer(e);
    }
    // 2. EBP : fichier clients (famille, statut), relié au terrain par code, sinon nom unique (+ commune si connue).
    for (const c of clientsEbp) {
      // Lot 1 : SIRET et code EBP qui désignent deux fiches différentes, ou fiche déjà liée à un autre code : jamais de fusion automatique.
      const parS = c.siret ? parSiret.get(c.siret) : null, parC = c.code ? parCode.get(c.code) : null;
      if (parS && parC && parS !== parC) { aRapprocher.push({ source: 'ebp', nom: c.nom, code: c.code, siret: c.siret, motif: 'Le SIRET et le code client EBP désignent deux fiches différentes' }); continue; }
      if (parS && parS.codeEbp && parS.codeEbp !== c.code) { aRapprocher.push({ source: 'ebp', nom: c.nom, code: c.code, siret: c.siret, motif: 'Ce SIRET est déjà lié au code EBP ' + parS.codeEbp }); continue; }
      if (parC && c.siret && parC.siret && parC.siret !== c.siret) { aRapprocher.push({ source: 'ebp', nom: c.nom, code: c.code, siret: c.siret, motif: 'SIRET EBP différent du SIRET connu (' + parC.siret + ')' }); continue; }
      let e = trouver(c.siret, c.code);
      if (!e) {
        const memesNoms = etab.filter(x => norm(x.nom) === norm(c.nom) && !x.codeEbp && (!c.ville || !x.commune || norm(x.commune) === norm(L0.classer({ commune: c.ville, cp: c.cp }).commune)));
        if (memesNoms.length === 1) { e = memesNoms[0]; e.rapprochement = e.sources.includes('terrain') ? 'probable' : e.rapprochement; }
        else if (memesNoms.length > 1) { aRapprocher.push({ source: 'ebp', nom: c.nom, code: c.code, motif: memesNoms.length + ' fiches terrain portent ce nom' }); continue; }
      }
      if (!e) e = nouveau(c.nom, { cp: c.cp, commune: c.ville }, 'ebp');
      if (!e.sources.includes('ebp')) e.sources.push('ebp');
      e.codeEbp = c.code; e.client = true; e.compteBloque = !!c.bloque; if (c.siret && !e.siret) e.siret = c.siret;
      if (/inactif|sommeil|ferme/.test(norm(c.statut))) e.inactif = true;
      const a = activiteDepuisTexte(c.famille, 'ebp'); if (a) e.activite = a;
      indexer(e);
    }
    // Clients présents dans les pièces EBP mais absents du fichier clients.
    for (const p of piecesEbp) {
      if (!p.code || parCode.get(p.code)) continue;
      const e = nouveau(p.client, {}, 'ebp'); e.codeEbp = p.code; e.client = true; indexer(e);
    }
    // Activité commerciale EBP : sans commande depuis 12 mois = client inactif (reste client, identifiable).
    for (const e of etab.filter(x => x.client)) {
      const cmd = piecesEbp.filter(p => p.type === 'commande' && p.code === e.codeEbp && p.date <= arrete).map(p => p.date).sort();
      e.derniereCommande = cmd.pop() || '';
      if (!e.derniereCommande || e.derniereCommande <= plus(arrete, -365)) e.inactif = true;
    }
    // 3. Annuaire officiel (SIRENE) : prospects, sauf s'ils sont déjà connus (SIRET, ou nom + commune uniques).
    for (const s of annuaire) {
      let e = trouver(s.siret);
      if (!e) {
        const c = candidats(s.nom, L0.classer({ cp: s.cp, commune: s.ville }).commune);
        if (c === null) { aRapprocher.push({ source: 'sirene', nom: s.nom, siret: s.siret, motif: 'Plusieurs établissements connus portent ce nom dans cette commune' }); continue; }
        if (c) { e = c; e.rapprochement = 'probable'; }
      }
      if (!e) e = nouveau(s.nom, { cp: s.cp, commune: s.ville }, 'sirene');
      if (!e.sources.includes('sirene')) e.sources.push('sirene');
      if (!e.siret) e.siret = s.siret;
      if (!e.activite && s.typeProbable !== 'a_qualifier') e.activite = { activite: s.typeProbable, source: 'nom', probable: true };
      indexer(e);
    }
    for (const e of etab) {
      if (!e.activite) e.activite = activiteDepuisTexte(e.nom, 'nom') || { activite: 'a_qualifier', source: '', probable: false };
      e.segment = (e.client ? 'client' : 'prospect') + '-' + e.activite.activite;
      e.couleur = SEGMENTS[e.segment].couleur;
    }
    return { etablissements: etab, aRapprocher };
  }

  // Vue « 8 départements, puis communes » : comptes par segment, établissements hors Île-de-France mis à part.
  function parDepartement(etablissements) {
    const out = {}, hors = [];
    for (const d of L0.DEPARTEMENTS) out[d.dep] = { nom: d.nom, segments: {}, communes: {} };
    for (const e of etablissements) {
      const d = out[e.dep]; if (!d) { hors.push(e); continue; }
      d.segments[e.segment] = (d.segments[e.segment] || 0) + 1;
      const c = d.communes[e.commune || '— commune à préciser'] || (d.communes[e.commune || '— commune à préciser'] = {});
      c[e.segment] = (c[e.segment] || 0) + 1;
    }
    return { departements: out, hors };
  }

  // Indicateurs de conquête pour le cockpit : par département, clients / prospects / inactifs / bloqués,
  // et taux de clients parmi les établissements CONNUS (pas une part de marché : l'annuaire n'est pas exhaustif).
  function conquete(etablissements, aRapprocher = []) {
    const lignes = L0.DEPARTEMENTS.map(d => {
      const l = etablissements.filter(e => e.dep === d.dep), clients = l.filter(e => e.client);
      return { dep: d.dep, nom: d.nom, etablissements: l.length, clients: clients.length, clientsActifs: clients.filter(e => !e.inactif).length,
        inactifs: clients.filter(e => e.inactif).length, bloques: clients.filter(e => e.compteBloque).length, prospects: l.length - clients.length,
        tauxClients: l.length ? Math.round(clients.length / l.length * 100) : null };
    });
    return { departements: lignes, aQualifier: etablissements.filter(e => e.activite.activite === 'a_qualifier').length,
      probables: etablissements.filter(e => e.rapprochement === 'probable').length, aRapprocher: aRapprocher.length };
  }

  const api = { SEGMENTS, construire, parDepartement, conquete, activiteDepuisTexte };
  if (node) module.exports = api;
  else racine.MaVille = api;
})(typeof self !== 'undefined' ? self : this);
