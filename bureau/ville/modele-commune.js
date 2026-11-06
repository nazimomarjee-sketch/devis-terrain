/* ODICOLOR 2.0 — Ma Ville, étape 1 : MODÈLE DE COMMUNE (sans affichage).
   Rassemble, commune par commune, tous les établissements connus par le téléphone (terrain), EBP, Airtable et l'annuaire
   officiel (SIRENE), avec leur catégorie, leur source et leur date. Référence : docs/maquettes/ma-ville-reference/.

   Règles (validées par le propriétaire) :
   - Aucun établissement ne disparaît : chaque fiche d'entrée finit dans UNE commune, dans « à classer » ou dans
     « écartées » (avec un motif). Le bilan le vérifie.
   - Aucun doublon créé, aucun rapprochement incertain validé automatiquement. Deux fiches ne sont fusionnées que si
     elles partagent un identifiant certain (SIRET, code client EBP) ou si une liaison a été VALIDÉE PAR UNE PERSONNE.
     Un même nom dans la même commune donne une PROPOSITION « à confirmer » : les deux fiches restent séparées.
   - Catégories distinctes : client (un dormant reste client), prospect, à qualifier, hors cible.
   - Signal d'achat (règle du propriétaire, 06/11/2026) : 60 j sans commande = réachat à vérifier ; 90 j = potentiellement
     dormant ; 12 mois = inactif. Valeurs de départ réglables. Si l'historique EBP donne le rythme habituel du client
     (au moins 3 commandes), le signal suit ce rythme. Historique incomplet → « à vérifier », jamais « dormant » affirmé.
     Les statuts historiques d'Airtable sont conservés avec leur source, jamais écrasés.
   - Rien n'est inventé : une information absente vaut null (« Inconnu » à l'affichage), jamais zéro deviné.
   - Chaque information garde sa source et sa date quand elles existent.
   - Pointage, obstacles et vue Direction : champs prévus (suivi), null tant que la fonction n'existe pas.
   Lecture seule : ce module ne modifie aucune de ses entrées. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const L0 = node ? require('../bureau-logique.js') : racine.BureauLogique;
  const MV = node ? require('../ma-ville.js') : racine.MaVille;

  const VERSION = 1;
  // Seuils de départ (décision du propriétaire du 06/11/2026), réglables : ce ne sont pas des vérités absolues.
  const DEFAUTS = Object.freeze({ seuils: Object.freeze({ reachat: 60, potentiellementDormant: 90, inactif: 365 }),
    minCommandesRythme: 3, facteurReachat: 1.5, facteurDormant: 2, historiqueCompletJours: 365 });
  const GRAVITE = { alerte: 0, potentiellement_dormant: 1, reachat: 2, inactif: 3, a_verifier: 4, actif: 5 };
  const SOURCES = Object.freeze(['EBP', 'Airtable', 'Terrain', 'SIRENE']);
  const RANG_CATEGORIE = { client: 0, prospect: 1, a_qualifier: 2, hors_cible: 3 };
  const AIRTABLE = { prospect: 'prospect', dormant: 'dormant', a_exclure: 'hors_cible', hors_cible: 'hors_cible', a_verifier: 'a_verifier' };

  const txt = (v, n = 200) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const siretValide = s => /^\d{14}$/.test(String(s || '').replace(/\s/g, ''));
  const siretDe = s => String(s || '').replace(/\s/g, '');
  const iso = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) ? d.slice(0, 10) : null;
  const joursEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const val = (valeur, source, date) => ({ valeur, source, date: date || null });

  // ---------- 1. Fragments : une fiche d'entrée = un fragment, avec ses clés certaines ----------
  function fragments(e, dates) {
    const out = [], ecartees = [];
    const ajouter = (f, brut) => { if (!txt(f.nom)) ecartees.push({ source: f.source, ref: f.ref, motif: 'Nom absent', brut }); else out.push(f); };
    (e.terrain || []).forEach(c => {
      const ent = c && c.ent && typeof c.ent === 'object' ? c.ent : null;
      ajouter({ source: 'Terrain', ref: 'tel:' + c.id, date: dates.Terrain, nom: txt(c.nom, 120), ville: txt(c.ville || c.villeProspection, 80), cp: txt(c.cp || c.codePostal, 10),
        siret: ent && siretValide(ent.siret) ? siretDe(ent.siret) : null, siretDate: ent ? iso(ent.lu) : null, codeEbp: null,
        statutTerrain: c.statutCrm === 'client' ? 'client' : c.statutCrm === 'prospect' ? 'prospect' : null,
        activiteTexte: txt(c.activite || c.metier, 60), interlocuteur: txt(c.contactNom, 80) || null,
        etape: c.etape ? val(txt(c.etape, 120), 'Terrain', iso(c.etapeDate) || dates.Terrain) : null }, c);
    });
    (e.clientsEbp || []).forEach(c => ajouter({ source: 'EBP', ref: 'ebp:' + c.code, date: dates.EBP, nom: txt(c.nom, 120), ville: txt(c.ville, 80), cp: txt(c.cp, 10),
      siret: siretValide(c.siret) ? siretDe(c.siret) : null, codeEbp: txt(c.code, 40), famille: txt(c.famille, 60), statutEbp: txt(c.statut, 40), bloque: !!c.bloque }, c));
    // Clients présents seulement dans les pièces EBP (absents du fichier clients) : jamais perdus, commune inconnue → « à classer ».
    const codesClients = new Set((e.clientsEbp || []).map(c => txt(c.code, 40)));
    const vus = new Set();
    (e.piecesEbp || []).forEach(p => {
      const code = txt(p.code, 40); if (!code || codesClients.has(code) || vus.has(code)) return; vus.add(code);
      ajouter({ source: 'EBP', ref: 'ebp:' + code, date: dates.EBP, nom: txt(p.client, 120), ville: '', cp: '', siret: null, codeEbp: code,
        famille: '', statutEbp: '', bloque: false, origine: 'pieces' }, { code, client: p.client });
    });
    (e.airtable || []).forEach(a => ajouter({ source: 'Airtable', ref: 'air:' + a.id, date: iso(a.majLe) || dates.Airtable, nom: txt(a.nom, 120), ville: txt(a.ville, 80), cp: txt(a.cp, 10),
      siret: siretValide(a.siret) ? siretDe(a.siret) : null, codeEbp: txt(a.codeEbp, 40) || null, statutAirtable: AIRTABLE[a.statut] || null, statutAirtableBrut: txt(a.statut, 40),
      activiteTexte: txt(a.activite, 60), interlocuteur: txt(a.contact, 80) || null }, a));
    (e.annuaire || []).forEach(s => ajouter({ source: 'SIRENE', ref: 'sir:' + siretDe(s.siret), date: iso(s.importeLe) || dates.SIRENE, nom: txt(s.nom, 120), ville: txt(s.ville, 80), cp: txt(s.cp, 10),
      siret: siretValide(s.siret) ? siretDe(s.siret) : null, naf: txt(s.naf, 10), activiteTexte: txt(s.activite, 60) }, s));
    return { out, ecartees };
  }

  // ---------- 2. Regroupement : clés certaines + liaisons validées par une personne (union-find) ----------
  function regrouper(fr, liaisonsValidees) {
    const parent = fr.map((_, i) => i), trouve = i => parent[i] === i ? i : (parent[i] = trouve(parent[i]));
    const unir = (a, b) => { const x = trouve(a), y = trouve(b); if (x !== y) parent[y] = x; };
    const parCle = new Map(), conflits = [];
    fr.forEach((f, i) => {
      for (const cle of [f.siret && 'siret:' + f.siret, f.codeEbp && 'ebp:' + f.codeEbp].filter(Boolean)) {
        if (parCle.has(cle)) unir(parCle.get(cle), i); else parCle.set(cle, i);
      }
    });
    const parRef = new Map(fr.map((f, i) => [f.ref, i]));
    for (const l of liaisonsValidees || []) {
      const a = parRef.get(l.a), b = parRef.get(l.b);
      if (a == null || b == null) { conflits.push({ type: 'liaison_inconnue', liaison: l, motif: 'Liaison validée vers une fiche absente des données chargées' }); continue; }
      unir(a, b);
    }
    const groupes = new Map();
    fr.forEach((f, i) => { const r = trouve(i); if (!groupes.has(r)) groupes.set(r, []); groupes.get(r).push(f); });
    return { groupes: [...groupes.values()], conflits };
  }

  // ---------- 3 bis. Signal d'achat d'un client EBP ----------
  function signalAchat(pieces, ctx) {
    const P = ctx.parametres, S = P.seuils, ok = p => p.date <= ctx.arrete;
    let base = pieces.filter(p => p.type === 'commande' && ok(p)), typeBase = 'commande';
    if (!base.length) { base = pieces.filter(p => p.type === 'facture' && ok(p)); typeBase = 'facture'; }
    const hist = ctx.debutHistorique ? ' (export EBP couvrant depuis le ' + ctx.debutHistorique + ')' : '';
    if (!base.length) return { niveau: 'a_verifier', joursDepuis: null, derniere: null, rythmeJours: null, base: null, ralentit: null,
      motif: 'Aucune commande dans l’export EBP' + hist + ' : impossible de dire depuis quand', source: 'EBP', date: ctx.dates.EBP };
    const dates = [...new Set(base.map(p => p.date))].sort(), derniere = base.filter(p => p.date === dates[dates.length - 1])[0];
    const j = joursEntre(derniere.date, ctx.arrete), ecarts = dates.slice(1).map((d, i) => joursEntre(dates[i], d));
    const med = l => { const s = [...l].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
    const rythme = dates.length >= P.minCommandesRythme ? med(ecarts) : null;
    const ralentit = rythme && ecarts.length >= 3 ? ecarts[ecarts.length - 1] > P.facteurReachat * med(ecarts.slice(0, -1)) : null;
    const complet = ctx.debutHistorique && joursEntre(ctx.debutHistorique, ctx.arrete) >= P.historiqueCompletJours;
    let niveau, baseSignal, motif;
    if (j >= S.inactif) { niveau = 'inactif'; baseSignal = 'seuil'; motif = 'Aucune ' + typeBase + ' depuis ' + j + ' jours (seuil ' + S.inactif + ' j)'; }
    else if (rythme) {
      baseSignal = 'rythme';
      niveau = j > P.facteurDormant * rythme ? 'potentiellement_dormant' : j > P.facteurReachat * rythme ? 'reachat' : 'actif';
      motif = 'Commande habituelle tous les ' + rythme + ' j environ ; dernière il y a ' + j + ' j';
    } else {
      baseSignal = 'seuils';
      niveau = j >= S.potentiellementDormant ? 'potentiellement_dormant' : j >= S.reachat ? 'reachat' : 'actif';
      motif = 'Dernière ' + typeBase + ' il y a ' + j + ' j (rythme inconnu : moins de ' + P.minCommandesRythme + ' commandes)';
      // Historique incomplet : on ne déclare pas un client dormant sans recul suffisant.
      if (niveau === 'potentiellement_dormant' && !complet) { niveau = 'a_verifier'; motif += ' ; historique incomplet' + hist; }
    }
    if (typeBase === 'facture') motif += ' — calculé sur les factures (aucune commande dans l’export)';
    return { niveau, joursDepuis: j, derniere: { type: derniere.type, no: derniere.no, date: derniere.date }, rythmeJours: rythme, base: baseSignal, ralentit,
      motif, source: 'EBP', date: ctx.dates.EBP };
  }

  // ---------- 3. Un groupe → un établissement ----------
  function etablissement(g, ctx) {
    const de = s => g.filter(f => f.source === s), premier = s => de(s)[0];
    const ebp = de('EBP'), air = de('Airtable'), tel = de('Terrain'), sir = de('SIRENE');
    const avert = [];
    // Identité : nom et adresse de la source la plus fiable présente (EBP > Terrain > Airtable > SIRENE).
    const ref = premier('EBP') || premier('Terrain') || premier('Airtable') || premier('SIRENE');
    const siret = (g.find(f => f.siret) || {}).siret || null;
    const codesEbp = [...new Set(g.map(f => f.codeEbp).filter(Boolean))];
    if (codesEbp.length > 1) avert.push('Plusieurs codes client EBP pour le même SIRET : ' + codesEbp.join(', '));
    const uid = siret ? 'siret:' + siret : codesEbp.length ? 'ebp:' + codesEbp[0] : ref.ref;

    // Commune : la source de référence d'abord, sinon la première fiche classable.
    let cl = null; for (const f of [ref, ...g]) { const c = L0.classer({ commune: f.ville, cp: f.cp }); if (c.insee) { cl = c; break; } if (!cl) cl = c; }

    // Activité (métier) : famille EBP > terrain > Airtable > NAF/nom (probable). 45.20A couvre mécanique ET carrosserie.
    let activite = null;
    for (const [f, s] of [[premier('EBP'), 'famille'], [premier('Terrain'), 'activiteTexte'], [premier('Airtable'), 'activiteTexte'], [premier('SIRENE'), 'activiteTexte']]) {
      if (!f || !f[s]) continue; const a = MV.activiteDepuisTexte(f[s], f.source); if (a) { activite = { valeur: a.activite, source: f.source, date: f.date, probable: f.source === 'SIRENE' }; break; }
    }
    if (!activite) { const a = MV.activiteDepuisTexte(ref.nom, 'nom'); if (a) activite = { valeur: a.activite, source: 'nom', date: null, probable: true }; }

    // Achats EBP : dernière commande et dernière facture (pièces liées par le code client).
    const pieces = codesEbp.length ? ctx.piecesParCode(codesEbp) : [];
    const der = t => pieces.filter(p => p.type === t && p.date <= ctx.arrete).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    const dc = der('commande'), df = der('facture');
    const dernierAchat = [dc, df].filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))[0] || null;

    // Catégorie : EBP fait foi pour « client ». Le hors cible Airtable n'efface jamais un client EBP (avertissement).
    const statutsAir = [...new Set(air.map(f => f.statutAirtable).filter(Boolean))];
    // Statuts historiques Airtable : conservés tels quels avec leur source et leur date (jamais écrasés).
    const statutsHistoriques = air.filter(f => f.statutAirtableBrut).map(f => ({ valeur: f.statutAirtableBrut, source: 'Airtable', date: f.date || null, ref: f.ref }));
    let categorie, qualification, achat = null, confirmeEbp = false;
    if (ebp.length || pieces.length) {
      categorie = 'client'; confirmeEbp = true; qualification = 'confirme';
      achat = signalAchat(pieces, ctx);
      if (ebp.some(f => /inactif|sommeil|ferme/i.test(f.statutEbp)))
        achat = Object.assign({}, achat, { niveau: 'inactif', motif: 'Compte EBP marqué inactif / en sommeil' + (achat.joursDepuis != null ? ' ; ' + achat.motif : '') });
      if (statutsAir.includes('hors_cible')) avert.push('Airtable le classe hors cible alors qu’il est client EBP : client conservé, à vérifier');
      if (statutsAir.includes('dormant') && achat.niveau === 'actif')
        avert.push('Airtable : dormant ; EBP : commande récente (' + achat.derniere.date + ') — les deux sont conservés, à vérifier');
    } else if (statutsAir.includes('hors_cible')) { categorie = 'hors_cible'; qualification = 'hors_cible'; }
    else if (statutsAir.includes('dormant')) {
      categorie = 'client'; qualification = 'a_verifier';
      achat = { niveau: 'a_verifier', joursDepuis: null, derniere: null, rythmeJours: null, base: null, ralentit: null,
        motif: 'Client dormant déclaré dans Airtable, non retrouvé dans EBP', source: 'Airtable', date: premier('Airtable').date };
    }
    else if (tel.some(f => f.statutTerrain === 'client')) { categorie = 'client'; qualification = 'a_verifier'; avert.push('Déclaré client au téléphone, non retrouvé dans EBP'); }
    else if (statutsAir.includes('prospect') || tel.length) { categorie = 'prospect'; qualification = 'confirme'; }
    else if (statutsAir.includes('a_verifier')) { categorie = 'a_qualifier'; qualification = 'a_verifier'; }
    else { categorie = 'a_qualifier'; qualification = 'probable'; } // SIRENE seul : activité probable, jamais une carrosserie confirmée
    if (statutsAir.includes('a_verifier') && qualification === 'confirme' && categorie !== 'client') qualification = 'a_verifier';

    const dormant = achat && (achat.niveau === 'potentiellement_dormant' || achat.niveau === 'inactif')
      ? { niveau: achat.niveau, depuisJours: achat.joursDepuis, depuisMois: Math.floor(achat.joursDepuis / 30.44), motif: achat.motif, source: achat.source, date: achat.date } : null;
    const segment = categorie === 'client' || categorie === 'prospect'
      ? (activite && (activite.valeur === 'carrosserie' || activite.valeur === 'mecanique') ? categorie + '-' + activite.valeur : null) : null;
    const alertes = [];
    if (ebp.some(f => f.bloque)) alertes.push({ type: 'compte_bloque', source: 'EBP', date: ctx.dates.EBP });
    const interlocuteur = (tel.find(f => f.interlocuteur) || air.find(f => f.interlocuteur) || null);

    return {
      uid, nom: val(ref.nom, ref.source, ref.date), siret: siret ? val(siret, (g.find(f => f.siret) || {}).source, (g.find(f => f.siretDate) || {}).siretDate || null) : null,
      codesEbp, insee: cl.insee || null, commune: cl.commune || null, dep: cl.dep || null,
      rattachement: { niveau: cl.niveau, motif: cl.motif },
      categorie, qualification, segment, activite, achat, dormant, statutsHistoriques, confirmeEbp, alertes,
      dernierAchat: dernierAchat ? { type: dernierAchat.type, no: dernierAchat.no, date: dernierAchat.date, source: 'EBP', exportDu: ctx.dates.EBP } : null,
      interlocuteur: interlocuteur ? val(true, interlocuteur.source, interlocuteur.date) : null,
      etapeTerrain: (tel.find(f => f.etape) || {}).etape || null,
      sources: g.map(f => ({ source: f.source, ref: f.ref, date: f.date || null })),
      // Prévu pour le pointage, les obstacles et la vue Direction : null = fonction pas encore disponible (rien n'est affiché).
      suivi: { dernierPointage: null, obstaclesOuverts: null, aideDirection: null },
      avertissements: avert
    };
  }

  // ---------- 4. Propositions de rapprochement (jamais appliquées automatiquement) ----------
  function propositions(etabs) {
    const parCle = new Map(), out = [];
    etabs.forEach(e => { if (!e.insee) return; const k = e.insee + '|' + L0.normNom(e.nom.valeur); if (!parCle.has(k)) parCle.set(k, []); parCle.get(k).push(e); });
    for (const l of parCle.values()) {
      if (l.length < 2) continue;
      const src = new Set(l.flatMap(e => e.sources.map(s => s.source)));
      if (src.size < 2) continue; // même source : homonymes, jamais rapprochés
      out.push({ statut: 'a_confirmer', commune: l[0].commune, nom: l[0].nom.valeur, uids: l.map(e => e.uid),
        refs: l.flatMap(e => e.sources.map(s => s.ref)), motif: 'Même nom dans la même commune, sans identifiant commun (SIRET ou code EBP)' });
    }
    return out;
  }

  // ---------- 5. Comptes d'une commune (règles de la référence) ----------
  function comptes(l) {
    const n = f => l.filter(f).length;
    const sig = v => n(e => e.categorie === 'client' && e.achat && e.achat.niveau === v);
    const c = { total: l.length, clients: n(e => e.categorie === 'client'), dontDormants: n(e => e.categorie === 'client' && e.dormant),
      signauxAchat: { reachat: sig('reachat'), potentiellementDormant: sig('potentiellement_dormant'), inactif: sig('inactif'), aVerifier: sig('a_verifier'), ralentissent: n(e => e.achat && e.achat.ralentit) },
      dontClientsNonConfirmesEbp: n(e => e.categorie === 'client' && !e.confirmeEbp), prospects: n(e => e.categorie === 'prospect'),
      aQualifier: n(e => e.categorie === 'a_qualifier'), horsCible: n(e => e.categorie === 'hors_cible'),
      alertes: n(e => e.alertes.length > 0), avecInterlocuteur: n(e => !!e.interlocuteur) };
    c.parSegment = {}; for (const s of Object.keys(MV.SEGMENTS).filter(k => /^(client|prospect)-(carrosserie|mecanique)$/.test(k))) c.parSegment[s] = n(e => e.segment === s);
    return c;
  }
  // Ordre de liste : catégorie, puis urgence commerciale (alerte, potentiellement dormant, réachat…), nom, uid (départage stable).
  const rang = e => [RANG_CATEGORIE[e.categorie], e.alertes.length ? GRAVITE.alerte : GRAVITE[(e.achat || {}).niveau] ?? 6, e.nom.valeur, e.uid];
  const comparer = (a, b) => { const x = rang(a), y = rang(b); for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; };

  // ---------- Point d'entrée ----------
  // e = { terrain, clientsEbp, piecesEbp, airtable, annuaire, liaisonsValidees, arrete, dates:{EBP,Terrain,Airtable,SIRENE}, parametres }
  function construire(e = {}) {
    if (!iso(e.arrete)) throw new Error('Date d’arrêté (export EBP) obligatoire au format AAAA-MM-JJ.');
    const dates = Object.assign({ EBP: e.arrete, Terrain: null, Airtable: null, SIRENE: null }, e.dates || {});
    const piecesParCode = (() => { const m = new Map(); (e.piecesEbp || []).forEach(p => { if (!m.has(p.code)) m.set(p.code, []); m.get(p.code).push(p); });
      return codes => codes.flatMap(c => m.get(c) || []); })();
    const parametres = Object.assign({}, DEFAUTS, e.parametres || {}, { seuils: Object.assign({}, DEFAUTS.seuils, (e.parametres || {}).seuils || {}) });
    const datesPieces = (e.piecesEbp || []).map(p => p.date).filter(Boolean).sort();
    const ctx = { arrete: e.arrete.slice(0, 10), dates, parametres, debutHistorique: datesPieces[0] || null, piecesParCode };
    const { out: fr, ecartees } = fragments(e, dates);
    const { groupes, conflits } = regrouper(fr, e.liaisonsValidees);
    const etabs = groupes.map(g => etablissement(g, ctx));
    const communes = new Map(), aClasser = [];
    for (const x of etabs) {
      if (!x.insee) { aClasser.push(x); continue; }
      if (!communes.has(x.insee)) communes.set(x.insee, { insee: x.insee, commune: x.commune, dep: x.dep, etablissements: [] });
      communes.get(x.insee).etablissements.push(x);
    }
    for (const c of communes.values()) { c.etablissements.sort(comparer); c.etablissements.forEach((x, i) => { x.numero = i + 1; }); c.comptes = comptes(c.etablissements); }
    const entrees = {}; for (const s of SOURCES) entrees[s] = fr.filter(f => f.source === s).length + ecartees.filter(f => f.source === s).length;
    const fragmentsPlaces = etabs.reduce((n, x) => n + x.sources.length, 0);
    return { version: VERSION, arrete: ctx.arrete, dates, parametres, debutHistorique: ctx.debutHistorique, communes, aClasser, ecartees, propositions: propositions(etabs), conflits,
      bilan: { entrees, fragments: fr.length, ecartees: ecartees.length, fragmentsPlaces, etablissements: etabs.length,
        conservation: fragmentsPlaces + ecartees.length === Object.values(entrees).reduce((a, b) => a + b, 0) } };
  }

  // Une commune par code INSEE (ou null), avec ses établissements numérotés dans l'ordre de la liste.
  const commune = (r, insee) => r.communes.get(insee) || null;

  const api = { VERSION, DEFAUTS, SOURCES, construire, commune };
  if (node) module.exports = api; else racine.ModeleCommune = api;
})(typeof self !== 'undefined' ? self : this);
