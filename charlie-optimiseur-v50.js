'use strict';
/* ODICOLOR v48 — CHARLIE optimiseur de tournées commerciales.
 * Module pur (aucun accès réseau, stockage ni DOM) : utilisable sur Samsung, cockpit Bureau et Node.
 * Les services externes (OSRM, VROOM, géocodeur) sont INJECTÉS par l'appelant, jamais appelés d'office.
 * Contrat de sécurité :
 *  - aucune donnée inventée : une valeur absente reste « manquante » ; les valeurs par défaut sont des
 *    HYPOTHÈSES nommées dans DEFAUTS et signalées dans le résultat ;
 *  - la feuille de route de Laurent est prioritaire : ses visites sont obligatoires, tout écart est listé
 *    et la proposition est toujours « à valider » (validationHumaineRequise) ;
 *  - rien n'est transmis au solveur hors coordonnées, durées, créneaux, priorités (ni nom, ni CA, ni notes) ;
 *  - si le moteur routier (VROOM/OSRM) est absent ou répond n'importe quoi : repli local vérifié par le même contrôleur.
 * Code VROOM/OSRM : BSD-2-Clause, utilisés comme services HTTP (aucun code copié). Rien de Spoke/Circuit.
 */
(function (racine) {
  const DEFAUTS = Object.freeze({
    plage: [8 * 3600, 17 * 3600],            // HYPOTHÈSE : journée 08:00-17:00 (modifiable)
    pause: { creneau: [12 * 3600, 14 * 3600], duree: 45 * 60 }, // HYPOTHÈSE : déjeuner 45 min entre 12h et 14h
    dureeVisite: 30 * 60,                    // HYPOTHÈSE tant qu'aucune visite réelle n'a été mesurée
    toleranceRdv: 10 * 60,                   // retard toléré sur un rendez-vous fixé
    vitesseKmh: 40, facteurRoute: 1.35,      // HYPOTHÈSES de la matrice ESTIMÉE (repli sans OSRM)
    rayonProchesKm: 6, maxProches: 5,
    rattachement: { nom: 'Massy–Palaiseau', insee: ['91477', '91377'] }, // point de départ par défaut (comme le Bureau) : centre de commune, jamais une adresse
    seuilDormantJours: 90,
    seuilReachatJours: 60,                   // même seuil que le cockpit (réachat)
    seuilsCA12: { fort: 10000, moyen: 3000 },  // € HT sur 12 mois : HYPOTHÈSES de priorisation, réglables
    dureesParType: { prospect: null, client: null, devis_a_relancer: null, dormant: null } // secondes ; null = durée générale
  });
  const POIDS = Object.freeze({ A: 30, B: 20, C: 10, rappel: 15, echeanceMax: 25, devisRelance: 20, devisGros: 10, devisMoyen: 5,
    dormant: 10, prospect: 8, volumeFort: 8, volumeMoyen: 4, reporte: 5, caFort: 12, caMoyen: 8, caFaible: 4, reachat: 10, baisse: 6, retardPaiement: 5 });

  const ok = (m) => { throw new Error(m); };
  const nombre = (v) => typeof v === 'number' && Number.isFinite(v);
  const posOk = (p) => !!p && nombre(p.lat) && nombre(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);
  const hms = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); if (!m || +m[1] > 24 || +m[2] > 59) return null; return +m[1] * 3600 + +m[2] * 60; };
  const fmt = (s) => { const x = Math.max(0, Math.round(s / 60)); return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function distanceKm(a, b) {
    const R = 6371, r = (x) => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
    const x = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  // ---------- matrices de trajet ----------
  // points : [{lat,lng}] ; retour { durees[s], distances[m], source, estimee }
  function matriceEstimee(points, opt = {}) {
    const v = opt.vitesseKmh || DEFAUTS.vitesseKmh, f = opt.facteurRoute || DEFAUTS.facteurRoute;
    const n = points.length, durees = [], distances = [];
    for (let i = 0; i < n; i++) { durees.push([]); distances.push([]); for (let j = 0; j < n; j++) {
      const m = i === j ? 0 : distanceKm(points[i], points[j]) * f * 1000;
      distances[i].push(Math.round(m)); durees[i].push(i === j ? 0 : Math.round(m / 1000 / v * 3600)); } }
    return { durees, distances, source: 'ESTIMATION (vol d’oiseau × ' + f + ', ' + v + ' km/h) — pas de routage réel', estimee: true };
  }
  // OSRM /table : coordonnées lon,lat. Réponse validée strictement, sinon exception (l'appelant retombe sur l'estimation).
  async function matriceOSRM(points, { base, fetchImpl, delaiMs = 8000 } = {}) {
    if (!base || typeof fetchImpl !== 'function') ok('Moteur OSRM non configuré.');
    if (!points.length || points.length > 100 || !points.every(posOk)) ok('Points invalides pour OSRM.');
    const coords = points.map((p) => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
    const ac = typeof AbortController === 'function' ? new AbortController() : null, t = ac && setTimeout(() => ac.abort(), delaiMs);
    try {
      const r = await fetchImpl(String(base).replace(/\/$/, '') + '/table/v1/driving/' + coords + '?annotations=duration,distance', ac ? { signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer' } : {});
      if (!r || !r.ok) ok('OSRM a répondu ' + (r && r.status));
      const j = await r.json(), n = points.length;
      const carre = (m) => Array.isArray(m) && m.length === n && m.every((l) => Array.isArray(l) && l.length === n && l.every((x) => nombre(x) && x >= 0));
      if (j.code !== 'Ok' || !carre(j.durations) || !carre(j.distances)) ok('Réponse OSRM invalide ou trajet impossible.');
      return { durees: j.durations.map((l) => l.map(Math.round)), distances: j.distances.map((l) => l.map(Math.round)), source: 'OSRM (temps de parcours estimés, trafic temps réel non garanti)', estimee: false };
    } finally { if (t) clearTimeout(t); }
  }

  // ---------- secteurs de la feuille de route de Laurent ----------
  // Grille « PLANNING SEMAINE NAZIM » de Laurent (classeur Feuille_de_route_Nazim.xlsx, onglet PLANING) : secteur par jour, SEMAINE 1 puis SEMAINE 2.
  // Rotation alternée S1/S2 confirmée par la table Airtable « Tournées » (22 journées du 01/12 au 31/12/2026, « convention de calendrier à confirmer »).
  // Dates + secteurs UNIQUEMENT (aucun nom ni adresse de garage dans le dépôt public). Au-delà du 31/12/2026 la rotation n'est PAS connue : rien n'est extrapolé.
  const GRILLE_LAURENT = Object.freeze({ debut: '2026-11-30', premierJour: '2026-12-01', dernierJour: '2026-12-31', feries: Object.freeze(['2026-12-25']),
    semaines: Object.freeze([Object.freeze(['95', '77', '95', '94', '93']), Object.freeze(['95', '77', '95', '91/92', '93'])]) });
  const SECTEURS_LAURENT = (() => { const o = {}, G = GRILLE_LAURENT; for (let n = 0; n < 40; n++) { const d = new Date(G.debut + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); const w = Math.floor(n / 7), j = n % 7; if (j > 4) continue; const iso = d.toISOString().slice(0, 10); if (iso < G.premierJour || iso > G.dernierJour || G.feries.includes(iso)) continue; o[iso] = G.semaines[w % 2][j]; } return Object.freeze(o); })();
  const semaineDe = (jour) => { const G = GRILLE_LAURENT, n = Math.round((Date.parse(jour + 'T12:00:00Z') - Date.parse(G.debut + 'T12:00:00Z')) / 864e5); return SECTEURS_LAURENT[jour] ? 'S' + (Math.floor(n / 7) % 2 + 1) : null; };
  const DEPARTEMENTS_IDF = Object.freeze(['75', '77', '78', '91', '92', '93', '94', '95']);
  const parserSecteurs = (t) => String(t == null ? '' : t).split(/[\/,; ]+/).filter((x) => DEPARTEMENTS_IDF.includes(x));
  const secteursDuJour = (jour, table = SECTEURS_LAURENT) => parserSecteurs(table[jour]);
  const secteursLaurent = () => [...new Set(Object.values(SECTEURS_LAURENT).flatMap(parserSecteurs))].sort();
  const departementDe = (insee, cp) => (/^\d{5}$/.test(insee || '') ? String(insee).slice(0, 2) : /^\d{5}$/.test(cp || '') ? String(cp).slice(0, 2) : null);

  // ---------- rapprochement des noms de la feuille de Laurent avec les fiches (jamais de devinette) ----------
  const MOTS_VIDES = new Set(['de', 'la', 'le', 'les', 'du', 'des', 'et', 'sarl', 'sas', 'ste', 'societe', 'ets']);
  const nomCle = (s) => norm(String(s == null ? '' : s).replace(/\(.*?\)/g, ' ')).split(' ').filter((m) => m && !MOTS_VIDES.has(m));
  const dice = (a, b) => { const bg = (x) => { const m = new Map(); for (let i = 0; i < x.length - 1; i++) { const k = x.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; }, A = bg(a), B = bg(b); let c = 0; for (const [k, v] of A) c += Math.min(v, B.get(k) || 0); return a.length < 2 || b.length < 2 ? (a === b ? 1 : 0) : 2 * c / (a.length + b.length - 2); };
  // Exact (accents, casse, ponctuation, qualificatifs entre parenthèses ignorés) ou mêmes mots dans un autre ordre. Tout le reste est PROPOSÉ à confirmation, jamais appliqué.
  function rapprocherNoms(noms, clients) {
    const idx = clients.map((c) => ({ c, cle: nomCle(c.nom).join(' '), set: nomCle(c.nom).slice().sort().join(' ') })), laurent = [], inconnus = [], ambigus = [], vus = new Map(), repetitions = [];
    noms.forEach((nom, i) => {
      const cle = nomCle(nom).join(' '), set = nomCle(nom).slice().sort().join(' '); if (!cle) { inconnus.push({ nom, rang: i + 1, candidats: [] }); return; }
      let m = idx.filter((x) => x.cle === cle); let mode = 'exact';
      if (!m.length) { m = idx.filter((x) => x.set === set); mode = 'mots'; }
      if (m.length === 1) {
        const id = String(m[0].c.id);
        if (vus.has(id)) { const r = repetitions.find((x) => x.id === id) || (repetitions.push({ id, nom, rangs: [vus.get(id)] }), repetitions[repetitions.length - 1]); r.rangs.push(i + 1); return; }
        vus.set(id, i + 1); laurent.push({ id, nom: m[0].c.nom, rang: i + 1, rapprochement: mode }); return;
      }
      if (m.length > 1) { ambigus.push({ nom, rang: i + 1, candidats: m.map((x) => ({ id: String(x.c.id), nom: x.c.nom })) }); return; }
      const proches = idx.map((x) => ({ id: String(x.c.id), nom: x.c.nom, sim: Math.round(dice(cle, x.cle) * 100) / 100 })).filter((x) => x.sim >= 0.75).sort((a, b) => b.sim - a.sim).slice(0, 3);
      inconnus.push({ nom, rang: i + 1, candidats: proches });
    });
    return { laurent, inconnus, ambigus, repetitions };
  }

  // ---------- mémoire : journal des visites, décisions, résultats et enseignements ----------
  const TYPES_JOURNAL = ['proposition_validee', 'proposition_refusee', 'visite', 'absent', 'annule', 'retard', 'journee', 'ecart_laurent', 'note'];
  const MAX_JOURNAL = 1500;
  const nouveauJournal = () => ({ v: 1, evenements: [] });
  function journaliser(j, evt) {
    const J = j && j.v === 1 && Array.isArray(j.evenements) ? j : nouveauJournal();
    if (!evt || !TYPES_JOURNAL.includes(evt.type)) ok('Type d’événement de mémoire inconnu.');
    const e = { t: evt.t || new Date().toISOString(), type: evt.type, jour: /^\d{4}-\d\d-\d\d$/.test(evt.jour || '') ? evt.jour : null };
    for (const k of ['garageId', 'resultat', 'dureeS', 'dureePrevueS', 'motif', 'ecarts', 'prevus', 'faits', 'absents', 'finReelleS', 'finPrevueS', 'moteur', 'minutes', 'note']) if (evt[k] != null) e[k] = typeof evt[k] === 'string' ? evt[k].slice(0, 500) : evt[k];
    J.evenements.push(e); if (J.evenements.length > MAX_JOURNAL) J.evenements.splice(0, J.evenements.length - MAX_JOURNAL);
    return J;
  }
  // Enseignements : uniquement ce que les données mesurent ; chaque ligne donne son effectif n. Ce sont des PROPOSITIONS : rien n'est modifié sans validation.
  function enseignements(j) {
    const ev = (j && j.evenements) || [], out = [], moy = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const vis = ev.filter((e) => e.type === 'visite' && e.garageId != null && Number.isFinite(e.dureeS)), parG = {};
    vis.forEach((e) => (parG[e.garageId] = parG[e.garageId] || []).push(e));
    for (const [g, l] of Object.entries(parG)) { const prev = l.filter((e) => Number.isFinite(e.dureePrevueS)); if (l.length >= 3 && prev.length >= 3) { const r = moy(l.map((e) => e.dureeS)) / moy(prev.map((e) => e.dureePrevueS)); if (Math.abs(r - 1) >= 0.25) out.push({ code: 'DUREE_ECART', garageId: g, n: l.length, message: 'Durée réelle ' + (r > 1 ? '+' : '') + Math.round((r - 1) * 100) + ' % par rapport au prévu : ajuster la durée de ce garage.', confiance: 'mesuré' }); } }
    const abs = {}; ev.filter((e) => e.type === 'absent' && e.garageId != null).forEach((e) => (abs[e.garageId] = (abs[e.garageId] || 0) + 1));
    for (const [g, n] of Object.entries(abs)) if (n >= 2) out.push({ code: 'ABSENCES_REPETEES', garageId: g, n, message: 'Absent ' + n + ' fois : téléphoner avant de se déplacer.', confiance: 'mesuré' });
    const jr = ev.filter((e) => e.type === 'journee' && Number.isFinite(e.finReelleS) && Number.isFinite(e.finPrevueS));
    if (jr.length >= 3) { const d = Math.round(moy(jr.map((e) => e.finReelleS - e.finPrevueS)) / 60); if (Math.abs(d) >= 15) out.push({ code: 'FIN_DE_JOURNEE', n: jr.length, message: 'Les journées finissent en moyenne ' + (d > 0 ? d + ' min plus tard' : -d + ' min plus tôt') + ' que prévu : revoir pauses et durées.', confiance: 'mesuré' }); }
    const val = ev.filter((e) => e.type === 'proposition_validee').length, ref = ev.filter((e) => e.type === 'proposition_refusee').length;
    if (val + ref >= 5 && ref / (val + ref) >= 0.4) out.push({ code: 'PROPOSITIONS_REFUSEES', n: val + ref, message: ref + ' propositions sur ' + (val + ref) + ' refusées : CHARLIE doit proposer moins de changements à la feuille de Laurent.', confiance: 'mesuré' });
    return out;
  }

  // ---------- score commercial explicable ----------
  // ctx : { maintenant:ms, devis:[…du client…], rythmeJours(c), echeance(c)->{pct,rappel,du,jours}, montantHt(d)->€ }
  function scorer(c, ctx) {
    const parts = [], manquants = [], add = (code, pts, detail) => { if (pts > 0) parts.push({ code, points: Math.round(pts), detail }); };
    const p = c.priorite;
    if (p === 'A' || p === 'B' || p === 'C') add('PRIORITE_' + p, POIDS[p], 'Priorité ' + p + ' fixée sur la fiche'); else manquants.push('priorite');
    const e = ctx.echeance ? ctx.echeance(c) : null;
    if (e) {
      if (e.pct >= 999) add('JAMAIS_VISITE', POIDS.echeanceMax, 'Jamais visité'); else if (e.pct >= 100) add('ECHEANCE', Math.min(POIDS.echeanceMax, e.pct / 4), 'Rythme dépassé (' + e.pct + ' %)');
      if (e.rappel) add('RAPPEL', POIDS.rappel, 'Rappel prévu');
    } else manquants.push('rythme');
    const dv = (ctx.devis || []).filter((d) => d.statut === 'envoye');
    let aRelancer = null;
    for (const d of dv) { const j = ctx.relanceDue ? ctx.relanceDue(d, ctx.maintenant) : null; if (j != null && (!aRelancer || j > aRelancer.j)) aRelancer = { d, j }; }
    if (aRelancer) {
      add('DEVIS_A_RELANCER', POIDS.devisRelance, 'Devis envoyé il y a ' + aRelancer.j + ' j sans retour');
      const ht = ctx.montantHt ? ctx.montantHt(aRelancer.d) : null;
      if (nombre(ht)) add(ht >= 2000 ? 'DEVIS_GROS' : 'DEVIS_MOYEN', ht >= 2000 ? POIDS.devisGros : (ht >= 500 ? POIDS.devisMoyen : 0), 'Devis de ' + Math.round(ht) + ' € HT (seuils 500/2000 € : hypothèse)');
    }
    const vis = (c.visites || []).filter((v) => v && v.res === 'vu' && typeof v.date === 'string').map((v) => v.date).sort();
    const derniere = vis.length ? vis[vis.length - 1] : null, ageJ = derniere ? Math.floor((ctx.maintenant - Date.parse(derniere + 'T12:00:00')) / 864e5) : null;
    const dormant = c.statutCrm === 'client' && ageJ != null && ageJ >= DEFAUTS.seuilDormantJours;
    if (dormant) add('DORMANT', POIDS.dormant, 'Client non vu depuis ' + ageJ + ' j');
    const prospect = (c.statutCrm || 'prospect') === 'prospect';
    if (prospect && c.conv !== 'refus') add('PROSPECT', POIDS.prospect, 'Prospect à qualifier');
    const vol = Number(c.volume);
    if (vol > 0) add(vol >= 2000 ? 'VOLUME_FORT' : 'VOLUME_MOYEN', vol >= 2000 ? POIDS.volumeFort : vol >= 500 ? POIDS.volumeMoyen : 0, 'Achat de peinture déclaré ' + vol + ' €/mois (estimation saisie, non vérifiée EBP)'); else manquants.push('volume');
    // --- données EBP (factures importées) : jamais inventées, jamais utilisées si non vérifiées ---
    const F = ctx.finance ? ctx.finance(c) : null, finance = { source: F && F.source || null, alertes: [] };
    if (F && F.source === 'EBP') {
      const ca12 = F.ca12Cents == null ? null : F.ca12Cents / 100, ca90 = F.ca90Cents == null ? null : F.ca90Cents / 100, S = ctx.seuilsCA12 || DEFAUTS.seuilsCA12;
      if (ca12 != null && ca12 > 0) {
        const fort = ca12 >= S.fort, moyen = ca12 >= S.moyen;
        add(fort ? 'CA_FORT' : moyen ? 'CA_MOYEN' : 'CA_FAIBLE', fort ? POIDS.caFort : moyen ? POIDS.caMoyen : POIDS.caFaible, 'CA facturé 12 mois : ' + Math.round(ca12) + ' € HT (EBP ; seuils ' + S.moyen + '/' + S.fort + ' € = hypothèse)');
        if (F.derniereFacture) { const j = Math.floor((ctx.maintenant - Date.parse(F.derniereFacture + 'T12:00:00')) / 864e5); if (j >= (ctx.seuilReachatJours || DEFAUTS.seuilReachatJours)) add('REACHAT', POIDS.reachat, 'Dernière facture il y a ' + j + ' j (EBP)'); }
        if (ca90 != null && ca90 < ca12 / 4 * 0.5) add('BAISSE', POIDS.baisse, 'CA 90 j (' + Math.round(ca90) + ' €) inférieur à la moitié du rythme annuel (EBP)');
      }
      finance.ca12 = ca12; finance.derniereFacture = F.derniereFacture || null;
      if (F.margePct == null) manquants.push('marge'); else finance.margePct = F.margePct;
    } else { manquants.push('ca_ebp'); manquants.push('marge'); }
    // Retard de paiement et compte bloqué : PROTECTEURS, pris en compte quelle que soit la source (une saisie déclarative suffit à signaler).
    if (F && (F.retardCents || 0) > 0) { add('RETARD_PAIEMENT', POIDS.retardPaiement, 'Règlement en retard : ' + Math.round(F.retardCents / 100) + ' € — traiter avec le responsable avant toute vente'); finance.alertes.push('RETARD_PAIEMENT'); }
    if (F && F.bloque) finance.alertes.push('COMPTE_BLOQUE');
    if ((Number(c.reports) || 0) >= 3) add('REPORTE', POIDS.reporte, 'Reporté ' + c.reports + ' fois : décider de le voir ou de le déprioriser');
    const brut = parts.reduce((s, x) => s + x.points, 0);
    const type = aRelancer ? 'devis_a_relancer' : dormant ? 'dormant' : prospect ? 'prospect' : 'client';
    return { score: Math.min(100, brut), composantes: parts, manquants, type, derniereVisite: derniere, finance };
  }

  // ---------- candidats ----------
  // entree : { clients[], devis[], laurent:[{id,heure?,duree?}], maintenant, plage, appris, ctxFns }
  function construireCandidats(entree) {
    const { clients, devis = [], laurent = [], appris = null, plage = DEFAUTS.plage } = entree, secteurs = Array.isArray(entree.secteurs) ? entree.secteurs : [];
    const maintenant = entree.maintenant || Date.now();
    const parClient = new Map(); devis.forEach((d) => { if (d && d.clientId != null) { const k = String(d.clientId); (parClient.get(k) || parClient.set(k, []).get(k)).push(d); } });
    const lau = new Map(laurent.map((l, i) => [String(l.id), { ...l, rang: i }]));
    const candidats = [], exclus = [];
    for (const c of clients) {
      const L = lau.get(String(c.id));
      const pl = entree.ctxFns && typeof entree.ctxFns.placer === 'function' ? entree.ctxFns.placer(c) : (c.ent && posOk({ lat: c.ent.lat, lng: c.ent.lng }) ? { lat: c.ent.lat, lng: c.ent.lng, precision: 'gps' } : null);
      const pos = pl && posOk({ lat: pl.lat, lng: pl.lng }) ? { lat: pl.lat, lng: pl.lng } : null, posQualite = pos ? (pl.precision || 'gps') : null;
      const dep = departementDe(pl && pl.insee || c.insee, c.cp);
      const s = scorer(c, { ...entree.ctxFns, maintenant, devis: parClient.get(String(c.id)) || [], seuilsCA12: entree.seuilsCA12, seuilReachatJours: entree.seuilReachatJours });
      const dureeA = dureeAppris(appris, c.id), dType = entree.dureesParType && entree.dureesParType[s.type];
      const dureeG = Number.isInteger(entree.dureeVisite) && entree.dureeVisite > 0 ? entree.dureeVisite : DEFAUTS.dureeVisite;
      const duree = L && Number.isInteger(L.duree) && L.duree > 0 ? L.duree : dureeA ? dureeA.secondes : Number.isInteger(dType) && dType > 0 ? dType : dureeG;
      const dureeSource = L && L.duree ? 'feuille de Laurent' : dureeA ? 'apprise (' + dureeA.n + ' visites réelles)' : Number.isInteger(dType) && dType > 0 ? 'réglage « ' + s.type.replace(/_/g, ' ') + ' » (' + Math.round(dType / 60) + ' min)' : (entree.dureeVisite ? 'réglage général (' + Math.round(dureeG / 60) + ' min)' : 'HYPOTHÈSE 30 min (aucune visite mesurée)');
      let creneaux = null, creneauxSource = 'horaires non renseignés : journée entière (hypothèse)';
      const horaires = Array.isArray(c.horaires) ? c.horaires.map((h) => [hms(h.debut), hms(h.fin)]).filter((h) => h[0] != null && h[1] != null && h[0] < h[1]) : [];
      if (L && hms(L.heure) != null) { const h = hms(L.heure); creneaux = [[h, h + duree + DEFAUTS.toleranceRdv]]; creneauxSource = 'rendez-vous fixé par Laurent à ' + L.heure; }
      else if (horaires.length) { creneaux = horaires; creneauxSource = 'horaires d’ouverture de la fiche'; }
      else if (appris && appris.garages && appris.garages[c.id] && appris.garages[c.id].fenetres && appris.garages[c.id].fenetres.length) { creneaux = appris.garages[c.id].fenetres; creneauxSource = 'disponibilité apprise des visites réelles'; }
      if (!creneaux) creneaux = [plage.slice()];
      if (!L && s.finance.alertes.includes('COMPTE_BLOQUE')) { exclus.push({ id: String(c.id), nom: c.nom, raison: 'COMPTE_BLOQUE_EBP', laurent: false, detail: 'Compte bloqué : aucune visite commerciale proposée (visite imposée par Laurent conservée avec alerte).' }); continue; }
      if (secteurs.length && !L && dep && !secteurs.includes(dep)) { exclus.push({ id: String(c.id), nom: c.nom, raison: 'HORS_SECTEUR_DU_JOUR', laurent: false, detail: 'Département ' + dep + ' hors secteur du jour (' + secteurs.join('/') + ')' }); continue; }
      const item = { id: String(c.id), nom: c.nom, pos, posQualite, dep, horsSecteur: !!(L && secteurs.length && dep && !secteurs.includes(dep)), laurent: !!L, rangLaurent: L ? L.rang : null, rdv: !!(L && hms(L.heure) != null),
        score: L ? Math.max(s.score, 100) : s.score, scoreCommercial: s.score, composantes: s.composantes, manquants: s.manquants, finance: s.finance, type: s.type, derniereVisite: s.derniereVisite,
        duree, dureeSource, creneaux, creneauxSource, adresse: (c.ent && c.ent.adresse) || c.ville || c.villeProspection || null, tel: c.tel || null };
      if (!pos) { exclus.push({ id: item.id, nom: c.nom, raison: 'POSITION_INCONNUE', laurent: !!L, detail: 'Adresse non vérifiée : aucune coordonnée fiable, visite non optimisable.' }); if (!L) continue; }
      candidats.push(item);
    }
    for (const [id] of lau) if (!clients.some((c) => String(c.id) === id)) exclus.push({ id, nom: null, raison: 'GARAGE_INCONNU_DE_LA_BASE', laurent: true, detail: 'Garage de la feuille de Laurent introuvable dans la base : non inventé.' });
    return { candidats, exclus };
  }

  // ---------- adaptateur VROOM (contrat repris de la base ChatGPT, durci) ----------
  const intervalle = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger) && p[0] >= 0 && p[0] <= p[1] && p[1] <= 86400;
  const pt = (p) => Array.isArray(p) && p.length === 2 && p.every(nombre) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  function preparerVisites(input) {
    const { visites, depart, retour = depart, plage, pauses = [] } = input || {};
    if (!pt(depart) || !pt(retour) || !intervalle(plage)) ok('Départ, retour ou horaires non vérifiés.');
    if (!Array.isArray(visites) || !visites.length || visites.length > 200) ok('Liste de visites absente ou hors limite.');
    if (!Array.isArray(pauses)) ok('Pauses invalides.');
    const ids = new Set();
    const correspondance = visites.map((v, i) => {
      if (!v || typeof v.id !== 'string' || !v.id.trim() || ids.has(v.id)) ok('Identifiant de visite absent ou en doublon.');
      ids.add(v.id);
      if (!pt(v.position)) ok('Position manquante : ' + v.id);
      if (!Number.isInteger(v.duree) || v.duree <= 0 || v.duree > 86400) ok('Durée non renseignée : ' + v.id);
      if (!Number.isInteger(v.priorite) || v.priorite < 0 || v.priorite > 100) ok('Priorité invalide : ' + v.id);
      if (!Array.isArray(v.creneaux) || !v.creneaux.length || !v.creneaux.every(intervalle)) ok('Créneau non renseigné : ' + v.id);
      const fenetres = v.creneaux.map(([a, b]) => [Math.max(a, plage[0]), Math.min(b, plage[1]) - v.duree]).filter(([a, b]) => a <= b);
      if (!fenetres.length) ok('Aucun créneau compatible : ' + v.id);
      return { id: i + 1, garageId: v.id, obligatoire: v.obligatoire !== false, duree: v.duree, position: v.position.slice(), priorite: v.priorite, fenetres };
    });
    const breaks = pauses.map((p, i) => {
      if (!intervalle(p.creneau) || !Number.isInteger(p.duree) || p.duree <= 0 || p.creneau[1] - p.creneau[0] < p.duree || p.creneau[0] < plage[0] || p.creneau[1] > plage[1]) ok('Pause invalide.');
      return { id: i + 1, service: p.duree, time_windows: [[p.creneau[0], p.creneau[1] - p.duree]] };
    });
    const jobs = correspondance.map((v) => ({ id: v.id, location: v.position, service: v.duree, priority: v.priorite, time_windows: v.fenetres }));
    return { requete: { jobs, vehicles: [{ id: 1, start: depart.slice(), end: retour.slice(), time_window: plage.slice(), breaks }] }, correspondance };
  }
  function verifierProposition(prep, res) {
    if (!res || res.code !== 0 || !Array.isArray(res.routes) || res.routes.length > 1 || !Array.isArray(res.unassigned)) ok('Réponse du solveur indisponible ou invalide.');
    const index = new Map(prep.correspondance.map((v) => [v.id, v]));
    const vus = new Set(), nonPlanifies = [], ordre = [], vehicle = prep.requete.vehicles[0], route = res.routes[0];
    if (route && (!Array.isArray(route.steps) || route.vehicle !== vehicle.id)) ok('Trajet invalide.');
    const steps = route ? route.steps : [];
    if (route && (!steps.length || steps[0].type !== 'start' || steps[steps.length - 1].type !== 'end')) ok('Départ ou retour manquant.');
    let fin = vehicle.time_window[0]; const pausesVues = new Set();
    for (const s of steps) {
      if (!['start', 'end', 'job', 'break'].includes(s.type) || !Number.isInteger(s.arrival) || s.arrival < fin || s.arrival > vehicle.time_window[1]) ok('Chronologie invalide.');
      const att = s.waiting_time == null ? 0 : s.waiting_time;
      if (!Number.isInteger(att) || att < 0) ok('Attente invalide.');
      const debut = s.arrival + att;
      if (s.type === 'job') {
        const v = index.get(s.id);
        if (!v || vus.has(s.id) || s.service !== v.duree || (s.setup || 0) !== 0 || !v.fenetres.some(([a, b]) => debut >= a && debut <= b)) ok('Visite invalide, répétée ou hors créneau.');
        vus.add(s.id); fin = debut + v.duree;
        ordre.push({ garageId: v.garageId, arriveeEstimee: s.arrival, debutEstime: debut, finEstimee: fin });
      } else if (s.type === 'break') {
        const p = vehicle.breaks.find((b) => b.id === s.id);
        if (!p || pausesVues.has(s.id) || s.service !== p.service || !p.time_windows.some(([a, b]) => debut >= a && debut <= b)) ok('Pause hors créneau.');
        pausesVues.add(s.id); fin = debut + p.service;
      } else fin = debut;
      if (fin > vehicle.time_window[1]) ok('Fin de journée dépassée.');
    }
    if (route && pausesVues.size !== vehicle.breaks.length) ok('Pause manquante.');
    for (const u of res.unassigned) {
      const v = index.get(u.id);
      if (!v || vus.has(u.id)) ok('Visite non planifiée incohérente.');
      vus.add(u.id); nonPlanifies.push({ garageId: v.garageId, obligatoire: v.obligatoire });
    }
    if (vus.size !== index.size) ok('Visite disparue du résultat.');
    // Contrôle des trajets : uniquement quand la matrice est celle du solveur local (le routage VROOM est sa propre source).
    if (prep.matriceVerif && route) {
      const M = prep.matriceVerif; let prev = 0, t = vehicle.time_window[0];
      for (const s of steps) {
        if (s.type === 'job') { const k = index.get(s.id).id; if (s.arrival < t + M.durees[prev][k]) ok('Trajet trop court : temps de route non respecté.'); prev = k; }
        if (s.type === 'end' && s.arrival < t + M.durees[prev][0]) ok('Retour trop rapide : temps de route non respecté.');
        if (s.type !== 'start') t = (s.arrival + (s.waiting_time || 0)) + (s.service || 0);
      }
    }
    return { statut: nonPlanifies.some((v) => v.obligatoire) ? 'CONFLIT_A_RESOUDRE' : 'PROPOSITION_A_VALIDER', ordre, nonPlanifies, validationHumaineRequise: true };
  }

  // ---------- solveur local (repli, aussi utilisé en test) ----------
  // Même format de réponse que VROOM : le contrôleur ci-dessus le valide à l'identique.
  function simuler(prep, M, seq) {
    const v = prep.requete.vehicles[0], J = prep.correspondance, breaks = (v.breaks || []).slice().sort((a, b) => a.time_windows[0][0] - b.time_windows[0][0]);
    let t = v.time_window[0], pos = 0, bi = 0, travel = 0, attente = 0; const steps = [{ type: 'start', arrival: t }];
    const pause = (jusqua) => {
      while (bi < breaks.length) { const b = breaks[bi], [a, z] = b.time_windows[0];
        if (!(t >= a || jusqua > z)) break;
        const d = Math.max(t, a); if (d > z) return false;
        steps.push({ type: 'break', id: b.id, arrival: d, service: b.service, waiting_time: 0 }); attente += d - t; t = d + b.service; bi++; }
      return true;
    };
    for (const k of seq) {
      const j = J[k - 1], a = t + M.durees[pos][k]; let debut = null;
      for (const [w0, w1] of j.fenetres) { if (a <= w1) { debut = Math.max(a, w0); break; } }
      if (debut == null) return null;
      if (!pause(debut + j.duree)) return null;
      // la pause a pu décaler l'heure de départ : recalcul
      const a2 = t + M.durees[pos][k]; debut = null;
      for (const [w0, w1] of j.fenetres) { if (a2 <= w1) { debut = Math.max(a2, w0); break; } }
      if (debut == null) return null;
      if (debut + j.duree > v.time_window[1]) return null;
      travel += M.durees[pos][k]; attente += debut - a2;
      steps.push({ type: 'job', id: j.id, arrival: a2, waiting_time: debut - a2, service: j.duree, setup: 0 });
      t = debut + j.duree; pos = k;
    }
    while (bi < breaks.length) { const b = breaks[bi], [a, z] = b.time_windows[0], d = Math.max(t, a); if (d > z) return null; steps.push({ type: 'break', id: b.id, arrival: d, service: b.service, waiting_time: 0 }); attente += d - t; t = d + b.service; bi++; }
    const back = t + M.durees[pos][0]; if (back > v.time_window[1]) return null;
    travel += M.durees[pos][0]; steps.push({ type: 'end', arrival: back });
    return { steps, travel, attente, fin: back, duree: back - v.time_window[0] };
  }
  function matricePrep(prep, matriceFournie) {
    const pts = [{ lng: prep.requete.vehicles[0].start[0], lat: prep.requete.vehicles[0].start[1] }].concat(prep.correspondance.map((j) => ({ lng: j.position[0], lat: j.position[1] })));
    if (matriceFournie && matriceFournie.durees.length === pts.length) return matriceFournie;
    return matriceEstimee(pts);
  }
  // Multi-départ déterministe : plusieurs ordres d'insertion (priorité, éloignement, angle, mélanges à graine fixe) ; on garde le meilleur
  // selon (visites obligatoires servies, score des facultatives servies, durée totale). Même résultat à chaque appel avec les mêmes données.
  function resoudreLocal(prep, matrice) {
    const M = matricePrep(prep, matrice), J = prep.correspondance, n = J.length;
    const ids = [...Array(n).keys()].map((i) => i + 1);
    const parPrio = (a, b) => (J[b - 1].obligatoire - J[a - 1].obligatoire) || (J[b - 1].priorite - J[a - 1].priorite) || (J[a - 1].fenetres[0][0] - J[b - 1].fenetres[0][0]);
    const loin = (a, b) => (J[b - 1].obligatoire - J[a - 1].obligatoire) || (M.durees[0][b] - M.durees[0][a]);
    const proche = (a, b) => (J[b - 1].obligatoire - J[a - 1].obligatoire) || (M.durees[0][a] - M.durees[0][b]);
    const tot = (a, b) => (J[b - 1].obligatoire - J[a - 1].obligatoire) || (J[a - 1].fenetres[0][1] - J[b - 1].fenetres[0][1]);
    const ordres = [ids.slice().sort(parPrio), ids.slice().sort(loin), ids.slice().sort(proche), ids.slice().sort(tot)];
    let graine = 2463534242; const rnd = () => { graine ^= graine << 13; graine >>>= 0; graine ^= graine >>> 17; graine ^= graine << 5; graine >>>= 0; return graine / 4294967296; };
    for (let r = 0; r < Math.min(40, 4 + n * 3); r++) { const o = ids.slice().sort(parPrio); for (let i = o.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [o[i], o[k]] = [o[k], o[i]]; } ordres.push(o.sort((a, b) => J[b - 1].obligatoire - J[a - 1].obligatoire)); }
    const construire = (ordre) => {
      let seq = []; const non = [];
      for (const k of ordre) { let m = null; for (let p = 0; p <= seq.length; p++) { const c = seq.slice(0, p).concat([k], seq.slice(p)), s = simuler(prep, M, c); if (s && (!m || s.duree < m.s.duree)) m = { c, s }; } if (m) seq = m.c; else non.push(k); }
      let cur = simuler(prep, M, seq), amelio = true, tours = 0;
      while (cur && amelio && tours++ < 40) { amelio = false;
        for (let i = 0; i < seq.length && !amelio; i++) for (let j = i + 1; j < seq.length && !amelio; j++) { const c = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse(), seq.slice(j + 1)), s = simuler(prep, M, c); if (s && s.duree < cur.duree) { seq = c; cur = s; amelio = true; } }
        for (let i = 0; i < seq.length && !amelio; i++) { const k = seq[i], rest = seq.filter((_, x) => x !== i); for (let p = 0; p <= rest.length && !amelio; p++) { if (p === i) continue; const c = rest.slice(0, p).concat([k], rest.slice(p)), s = simuler(prep, M, c); if (s && s.duree < cur.duree) { seq = c; cur = s; amelio = true; } } }
      }
      // tentative de replacer les non planifiés après amélioration (le gain de temps peut libérer de la place)
      for (const k of non.slice()) { let m = null; for (let p = 0; p <= seq.length; p++) { const c = seq.slice(0, p).concat([k], seq.slice(p)), s = simuler(prep, M, c); if (s && (!m || s.duree < m.s.duree)) m = { c, s }; } if (m) { seq = m.c; cur = m.s; non.splice(non.indexOf(k), 1); } }
      return { seq, non, cur: cur || simuler(prep, M, []) };
    };
    const valeur = (r) => [r.seq.filter((k) => J[k - 1].obligatoire).length, r.seq.reduce((s, k) => s + J[k - 1].priorite, 0), -(r.cur ? r.cur.duree : 1e9)];
    const meilleur = (a, b) => { const x = valeur(a), y = valeur(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? a : b; return a; };
    let best = null; for (const o of ordres) { const r = construire(o); best = best ? meilleur(best, r) : r; }
    prep.matriceVerif = M; prep.matriceUtilisee = M;
    if (!best.cur) return { code: 0, routes: [], unassigned: J.map((j) => ({ id: j.id })) };
    return { code: 0, routes: [{ vehicle: 1, steps: best.cur.steps }], unassigned: best.non.map((k) => ({ id: J[k - 1].id })) };
  }
  // Évalue un ordre IMPOSÉ (référence = ordre de Laurent) avec les mêmes contraintes ; null si impossible.
  function evaluerOrdre(prep, matrice, ordreGarageIds) {
    const M = matricePrep(prep, matrice), idx = new Map(prep.correspondance.map((j) => [j.garageId, j.id]));
    const seq = ordreGarageIds.map((g) => idx.get(g)).filter((x) => x != null), s = simuler(prep, M, seq);
    return s ? { faisable: true, km: kmDe(M, seq), dureeTotale: s.duree, conduite: s.travel, attente: s.attente, fin: s.fin } : null;
  }
  const kmDe = (M, seq) => { let p = 0, d = 0; for (const k of seq) { d += M.distances[p][k]; p = k; } d += M.distances[p][0]; return Math.round(d / 100) / 10; };

  // ---------- proposition complète ----------
  // entree : { candidats[], depart:{lat,lng}, retour?, plage, pauses?, laurent:[ids ordonnés], solveur?(requete)->Promise, matrice? }
  async function proposerTournee(entree) {
    const { candidats, depart, plage = DEFAUTS.plage, pauses = [{ ...DEFAUTS.pause }], solveur = null, matrice = null } = entree;
    const retour = depart; // v1 : la journée finit au point de départ (retour libre non géré)
    if (!posOk(depart)) ok('Point de départ inconnu : position non vérifiée.');
    const fenetreOk = (c) => c.creneaux.some(([a, b]) => Math.min(b, plage[1]) - Math.max(a, plage[0]) >= c.duree);
    const localises = candidats.filter((c) => posOk(c.pos));
    const incompatibles = localises.filter((c) => !fenetreOk(c)).map((c) => ({ garageId: c.id, nom: c.nom, obligatoire: !!c.laurent, laurent: !!c.laurent, score: c.scoreCommercial, raison: 'Horaires du garage incompatibles avec la journée (' + c.creneauxSource + ')' }));
    const planifiables = localises.filter(fenetreOk);
    const sansPos = candidats.filter((c) => !posOk(c.pos)).map((c) => c.id);
    if (!planifiables.length) return { statut: incompatibles.some((n) => n.obligatoire) ? 'CONFLIT_A_RESOUDRE' : 'RIEN_A_PLANIFIER', ordre: [], nonPlanifies: incompatibles, sansPosition: sansPos, validationHumaineRequise: true, moteur: 'aucun', repli: false, ecartsLaurent: [], referenceLaurent: null, requete: null, matriceSource: '—', source: 'Aucun calcul',
      totaux: { visites: 0, km: 0, conduiteMin: 0, clientMin: 0, scoreTotal: 0, scoreParHeure: 0 }, alertes: sansPos.length ? ['Aucun garage localisé : vérifier les adresses.'] : ['Aucun garage à visiter.'] };
    const prep = preparerVisites({ depart: [depart.lng, depart.lat], retour: [retour.lng, retour.lat], plage, pauses: pauses.filter((p) => p && p.creneau[0] >= plage[0] && p.creneau[1] <= plage[1]),
      visites: planifiables.map((c) => ({ id: c.id, position: [c.pos.lng, c.pos.lat], duree: c.duree, priorite: Math.round(c.score), creneaux: c.creneaux, obligatoire: !!c.laurent })) });
    const alertes = []; let verif, moteur = 'LOCAL', repli = false, M = null;
    if (typeof solveur === 'function') {
      try { verif = verifierProposition(prep, await solveur(prep.requete)); moteur = 'VROOM'; }
      catch (e) { repli = true; alertes.push('Moteur VROOM indisponible ou réponse refusée par le contrôle (' + e.message + ') : repli sur le calcul local.'); }
    }
    if (!verif) {
      const res = resoudreLocal(prep, matrice); M = prep.matriceUtilisee; verif = verifierProposition(prep, res);
      moteur = repli ? 'LOCAL (repli)' : 'LOCAL'; if (M.estimee) alertes.push('Temps de trajet ESTIMÉS (pas de routage réel) : à confirmer avec OSRM.');
    } else M = matrice;
    const parGarage = new Map(planifiables.map((c) => [c.id, c]));
    const pts = [depart].concat(planifiables.map((c) => c.pos)); const Mx = M && M.durees.length === pts.length ? M : matriceEstimee([depart].concat(planifiables.map((c) => c.pos)));
    const indexPrep = new Map(prep.correspondance.map((j) => [j.garageId, j.id]));
    let prev = 0, km = 0, conduiteS = 0, clientS = 0, scoreTotal = 0;
    const ordre = verif.ordre.map((o, i) => {
      const c = parGarage.get(o.garageId), k = indexPrep.get(o.garageId);
      const dKm = Mx.distances[prev][k] / 1000, dS = Mx.durees[prev][k]; km += dKm; conduiteS += dS; clientS += c.duree; scoreTotal += c.scoreCommercial; prev = k;
      return { rang: i + 1, garageId: o.garageId, nom: c.nom, type: c.type, laurent: c.laurent, rdv: c.rdv, score: c.scoreCommercial, composantes: c.composantes, pos: c.pos, adresse: c.adresse, tel: c.tel,
        arrivee: fmt(o.arriveeEstimee), debut: fmt(o.debutEstime), fin: fmt(o.finEstimee), debutS: o.debutEstime, finS: o.finEstimee, duree: c.duree, dureeSource: c.dureeSource, creneauxSource: c.creneauxSource,
        trajetKm: Math.round(dKm * 10) / 10, trajetMin: Math.round(dS / 60), manquants: c.manquants };
    });
    km += (Mx.distances[prev][0] || 0) / 1000; conduiteS += Mx.durees[prev][0] || 0;
    const nonPlanifies = verif.nonPlanifies.map((n) => { const c = parGarage.get(n.garageId); return { garageId: n.garageId, nom: c.nom, obligatoire: n.obligatoire, laurent: c.laurent, score: c.scoreCommercial, raison: 'Ne tient pas dans la journée avec les rendez-vous, trajets et pauses' }; }).concat(incompatibles);
    const approx = ordre.filter((o) => parGarage.get(o.garageId).posQualite === 'commune').length;
    if (approx) alertes.push(approx + ' garage(s) positionnés au CENTRE DE LEUR COMMUNE (pas à l’adresse) : trajets approximatifs. Vérifier les adresses pour une tournée exacte.');
    ordre.forEach((o) => { const c = parGarage.get(o.garageId); if (c.finance && c.finance.alertes.includes('COMPTE_BLOQUE')) alertes.push('COMPTE_BLOQUE : ' + c.nom + ' — visite conservée (feuille de Laurent), aucune vente sans validation du responsable.'); else if (c.finance && c.finance.alertes.includes('RETARD_PAIEMENT')) alertes.push('RETARD_PAIEMENT : ' + c.nom + ' — voir le règlement avant de proposer une commande.'); });
    planifiables.filter((c) => c.horsSecteur).forEach((c) => alertes.push('SECTEUR_DIFFERENT : ' + c.nom + ' (dép. ' + c.dep + ') figure sur la feuille de Laurent hors du secteur du jour ' + (entree.secteurs || []).join('/') + ' — conservé, à confirmer avec Laurent.'));
    const ordreLaurent = (entree.laurent || []).map(String);
    const ecartsLaurent = comparerLaurent(ordreLaurent, ordre.map((o) => o.garageId), nonPlanifies, candidats);
    let reference = null;
    if (ordreLaurent.length) { try { reference = evaluerOrdre(prep, M, ordreLaurent.filter((g) => parGarage.has(g))) || { faisable: false, raison: 'L’ordre de Laurent ne tient pas dans la journée avec ces contraintes' }; } catch (e) { reference = { faisable: false, raison: e.message }; } }
    const heures = Math.max(0.01, (ordre.length ? (ordre[ordre.length - 1].finS - (ordre[0].debutS)) : 1) / 3600);
    return { statut: nonPlanifies.some((n) => n.obligatoire) ? 'CONFLIT_A_RESOUDRE' : verif.statut, ordre, nonPlanifies, sansPosition: sansPos, ecartsLaurent, validationHumaineRequise: true, moteur, repli, alertes,
      totaux: { visites: ordre.length, km: Math.round(km * 10) / 10, conduiteMin: Math.round(conduiteS / 60), clientMin: Math.round(clientS / 60), scoreTotal, scoreParHeure: Math.round(scoreTotal / heures) },
      referenceLaurent: reference, matriceSource: Mx.source, requete: prep.requete,
      source: 'Moteur ' + moteur + ' — ' + Mx.source };
  }
  // Écarts par rapport à la feuille de Laurent : CHAQUE écart est un élément à valider.
  function comparerLaurent(ordreLaurent, ordreProp, nonPlanifies, candidats) {
    const ecarts = []; if (!ordreLaurent.length) return ecarts;
    const nom = (id) => { const c = candidats.find((x) => x.id === id); return c ? c.nom : null; };
    const dansProp = ordreProp.filter((id) => ordreLaurent.includes(id));
    ordreLaurent.forEach((id) => { if (!ordreProp.includes(id)) ecarts.push({ code: 'LAURENT_RETIRE', garageId: id, nom: nom(id), detail: 'Visite prévue par Laurent non planifiable' }); });
    ordreProp.forEach((id) => { if (!ordreLaurent.includes(id)) ecarts.push({ code: 'AJOUT_CHARLIE', garageId: id, nom: nom(id), detail: 'Visite ajoutée par CHARLIE, absente de la feuille de Laurent' }); });
    const attendu = ordreLaurent.filter((id) => dansProp.includes(id));
    if (JSON.stringify(attendu) !== JSON.stringify(dansProp)) ecarts.push({ code: 'ORDRE_MODIFIE', detail: 'Ordre des visites de Laurent modifié pour réduire les trajets', avant: attendu, apres: dansProp });
    return ecarts;
  }

  // ---------- recalcul : client absent, rendez-vous annulé, retard ----------
  // etat : { candidats[], faits:[ids], positionActuelle, maintenantS, planPrecedent, laurent, plage, pauses, solveur, matrice }
  async function recalculer(etat, evenement) {
    const { type, id, minutes = 0 } = evenement || {};
    if (!['absent', 'annule', 'retard', 'ajout'].includes(type)) ok('Événement inconnu.');
    const faits = new Set((etat.faits || []).map(String)), retires = new Set((etat.retires || []).map(String));
    if (type === 'absent' || type === 'annule') { if (id == null) ok('Garage non précisé.'); retires.add(String(id)); }
    let maintenantS = etat.maintenantS + (type === 'retard' ? Math.max(0, minutes) * 60 : 0);
    maintenantS = Math.ceil(maintenantS / 60) * 60;
    const plage = [Math.min(maintenantS, (etat.plage || DEFAUTS.plage)[1]), (etat.plage || DEFAUTS.plage)[1]];
    const pauses = (etat.pauses || [{ ...DEFAUTS.pause }]).filter((p) => p.creneau[1] > plage[0] && !etat.pauseFaite)
      .map((p) => ({ ...p, creneau: [Math.max(p.creneau[0], plage[0]), p.creneau[1]] })).filter((p) => p.creneau[1] - p.creneau[0] >= p.duree);
    const restants = etat.candidats.filter((c) => !faits.has(c.id) && !retires.has(c.id));
    const rec = await proposerTournee({ candidats: restants, depart: etat.positionActuelle, retour: etat.retour || etat.depart || etat.positionActuelle, plage, pauses,
      laurent: (etat.laurent || []).filter((g) => !faits.has(String(g)) && !retires.has(String(g))), solveur: etat.solveur, matrice: null });
    const avant = (etat.planPrecedent ? etat.planPrecedent.ordre.map((o) => o.garageId) : []).filter((g) => !faits.has(g));
    const apres = rec.ordre.map((o) => o.garageId), modifications = [];
    avant.forEach((g) => { if (retires.has(g)) modifications.push({ code: 'RETIRE', garageId: g, raison: type === 'absent' ? 'Client absent' : 'Rendez-vous annulé' }); else if (!apres.includes(g)) modifications.push({ code: 'ABANDONNE', garageId: g, raison: 'Ne tient plus dans la journée' }); });
    apres.forEach((g) => { if (!avant.includes(g)) modifications.push({ code: 'AJOUTE', garageId: g }); });
    const commun = avant.filter((g) => apres.includes(g)), mmOrdre = apres.filter((g) => commun.includes(g));
    if (JSON.stringify(commun) !== JSON.stringify(mmOrdre)) modifications.push({ code: 'REORDONNE', avant: commun, apres: mmOrdre });
    const proches = suggererProches(etat.positionActuelle, etat.tous || etat.candidats, { exclus: new Set([...faits, ...retires, ...apres]), rayonKm: DEFAUTS.rayonProchesKm, max: DEFAUTS.maxProches });
    return { ...rec, evenement: { type, id: id == null ? null : String(id), minutes }, modifications, propositionsProches: proches, validationHumaineRequise: true };
  }

  // ---------- garages supplémentaires à proximité (distance à vol d'oiseau) ----------
  function suggererProches(pos, candidats, { exclus = new Set(), rayonKm = DEFAUTS.rayonProchesKm, max = DEFAUTS.maxProches } = {}) {
    if (!posOk(pos)) return [];
    return candidats.filter((c) => !exclus.has(c.id) && posOk(c.pos) && !c.laurent).map((c) => ({ garageId: c.id, nom: c.nom, type: c.type, score: c.scoreCommercial == null ? c.score : c.scoreCommercial, distanceKm: Math.round(distanceKm(pos, c.pos) * 10) / 10, composantes: c.composantes, mesure: 'vol d’oiseau' }))
      .filter((c) => c.distanceKm <= rayonKm && c.score > 0).sort((a, b) => (b.score - a.score) || (a.distanceKm - b.distanceKm)).slice(0, max);
  }

  // ---------- navigation : coordonnées uniquement (ni nom ni note dans l'URL) ----------
  function lienNavigation(pos, appli) {
    if (!posOk(pos)) return null;
    const ll = pos.lat.toFixed(6) + ',' + pos.lng.toFixed(6);
    return appli === 'waze' ? 'https://waze.com/ul?ll=' + ll + '&navigate=yes' : 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + ll;
  }

  // ---------- prévu / réalisé ----------
  // reel : [{garageId, arriveeS, finS, resultat:'vu'|'absent'|'reporte'}] dans l'ordre réel
  function comparerPrevuReel(plan, reel) {
    const prevus = new Map(plan.ordre.map((o) => [o.garageId, o])), lignes = [];
    reel.forEach((r, i) => { const p = prevus.get(r.garageId);
      lignes.push({ garageId: r.garageId, nom: p ? p.nom : null, resultat: r.resultat, rangPrevu: p ? p.rang : null, rangReel: i + 1,
        ecartArriveeMin: p && Number.isFinite(r.arriveeS) ? Math.round((r.arriveeS - p.debutS) / 60) : null,
        dureePrevueMin: p ? Math.round(p.duree / 60) : null, dureeReelleMin: Number.isFinite(r.finS) && Number.isFinite(r.arriveeS) ? Math.round((r.finS - r.arriveeS) / 60) : null, horsPlan: !p }); });
    const faits = new Set(reel.map((r) => r.garageId));
    const nonFaits = plan.ordre.filter((o) => !faits.has(o.garageId)).map((o) => ({ garageId: o.garageId, nom: o.nom, laurent: o.laurent }));
    const ordrePrevu = plan.ordre.map((o) => o.garageId).filter((g) => faits.has(g)), ordreReel = reel.map((r) => r.garageId).filter((g) => prevus.has(g));
    return { lignes, nonFaits, horsPlan: lignes.filter((l) => l.horsPlan).map((l) => l.garageId), ordreRespecte: JSON.stringify(ordrePrevu) === JSON.stringify(ordreReel),
      vus: reel.filter((r) => r.resultat === 'vu').length, absents: reel.filter((r) => r.resultat === 'absent').length, prevus: plan.ordre.length };
  }

  // ---------- apprentissage des visites réelles ----------
  const BORNE_DUREE = [5 * 60, 180 * 60];
  function nouvelApprentissage() { return { v: 1, garages: {}, global: { n: 0, dureeMoyenne: null } }; }
  // obs : { garageId, dureeS?, resultat, jour(0-6), debutS?, finS?, difficulte? }
  function apprendre(a, obs) {
    const A = a && a.v === 1 ? a : nouvelApprentissage(), id = String(obs.garageId), g = A.garages[id] || (A.garages[id] = { n: 0, dureeMoyenne: null, absences: 0, difficultes: {}, fenetres: [] });
    if (obs.resultat === 'absent') { g.absences++; if (Number.isFinite(obs.debutS)) g.absentsA = (g.absentsA || []).concat([[obs.jour, obs.debutS]]).slice(-10); }
    if (obs.resultat === 'vu' && Number.isFinite(obs.dureeS) && obs.dureeS >= BORNE_DUREE[0] && obs.dureeS <= BORNE_DUREE[1]) {
      g.n++; g.dureeMoyenne = g.dureeMoyenne == null ? obs.dureeS : Math.round(g.dureeMoyenne * 0.7 + obs.dureeS * 0.3);
      A.global.n++; A.global.dureeMoyenne = A.global.dureeMoyenne == null ? obs.dureeS : Math.round(A.global.dureeMoyenne * 0.9 + obs.dureeS * 0.1);
      if (Number.isFinite(obs.debutS)) g.fenetres = fusionnerFenetres(g.fenetres, obs.debutS, obs.finS || obs.debutS + obs.dureeS);
    }
    if (obs.difficulte) g.difficultes[obs.difficulte] = (g.difficultes[obs.difficulte] || 0) + 1;
    return A;
  }
  // Une disponibilité n'est « apprise » qu'à partir de 2 visites réussies sur le même créneau ; jamais déduite d'une seule.
  function fusionnerFenetres(f, d, e) { const x = (f || []).concat([[Math.floor(d / 1800) * 1800, Math.ceil(e / 1800) * 1800]]).slice(-8); return x; }
  function dureeAppris(a, id) { const g = a && a.garages && a.garages[String(id)]; return g && g.n >= 2 && g.dureeMoyenne ? { secondes: g.dureeMoyenne, n: g.n } : null; }

  // ---------- agents spécialisés orchestrés par CHARLIE ----------
  // deps : { clients, devis, laurent, depart, plage, pauses, appris, solveur, matrice, fetchOSRM(points), ctxFns, maintenant, objectifs }
  async function organiserJournee(deps) {
    const trace = [], note = (agent, statut, resume, extra) => trace.push({ agent, statut, resume, ...(extra || {}) });
    const sortie = { statut: 'EN_COURS', trace };
    // 1. Mémoire : ce que CHARLIE a appris des visites réelles
    const appris = deps.appris || null;
    note('memoire', 'OK', appris ? Object.keys(appris.garages).length + ' garage(s) avec historique appris' : 'Aucun apprentissage disponible : valeurs par défaut signalées');
    // 2. Historique client + 3. Analyse commerciale (scoring explicable)
    const { candidats, exclus } = construireCandidats({ clients: deps.clients, devis: deps.devis, laurent: deps.laurent, appris, plage: deps.plage, maintenant: deps.maintenant, ctxFns: deps.ctxFns, secteurs: deps.secteurs || [], dureeVisite: deps.dureeVisite, dureesParType: deps.dureesParType, seuilsCA12: deps.seuilsCA12, seuilReachatJours: deps.seuilReachatJours });
    note('historique', 'OK', candidats.length + ' garage(s) analysés', { sansRythme: candidats.filter((c) => c.manquants.includes('rythme')).length });
    const types = candidats.reduce((m, c) => (m[c.type] = (m[c.type] || 0) + 1, m), {});
    note('secteur', 'OK', deps.secteurs && deps.secteurs.length ? 'Secteur du jour (feuille de Laurent) : ' + deps.secteurs.join(' / ') + ', ' + exclus.filter((e) => e.raison === 'HORS_SECTEUR_DU_JOUR').length + ' garage(s) hors secteur non proposés' : 'Aucun secteur défini pour ce jour : pas de filtre');
    note('analyse-commerciale', 'OK', 'Types : ' + (Object.entries(types).map(([k, v]) => v + ' ' + k).join(', ') || 'aucun'), { types });
    // 4. Tournée et géolocalisation
    const sansPos = exclus.filter((e) => e.raison === 'POSITION_INCONNUE'), inconnus = exclus.filter((e) => e.raison === 'GARAGE_INCONNU_DE_LA_BASE');
    const aPlanifier = candidats.filter((c) => c.pos);
    let matrice = deps.matrice || null, sourceMatrice = matrice ? matrice.source : null;
    if (!matrice && typeof deps.fetchOSRM === 'function' && posOk(deps.depart) && aPlanifier.length) {
      try { matrice = await deps.fetchOSRM([deps.depart].concat(aPlanifier.map((c) => c.pos))); sourceMatrice = matrice.source; }
      catch (e) { note('tournee-geo', 'REPLI', 'OSRM indisponible (' + e.message + ') : temps estimés', {}); }
    }
    note('tournee-geo', sansPos.length || inconnus.length ? 'ATTENTION' : 'OK', aPlanifier.length + ' garage(s) localisés, ' + sansPos.length + ' sans position vérifiée, ' + inconnus.length + ' garage(s) de Laurent inconnus', { sansPosition: sansPos.map((e) => e.id), inconnus: inconnus.map((e) => e.id), sourceMatrice });
    // 5. Performance et objectifs
    const obj = deps.objectifs || null;
    note('performance', obj ? 'OK' : 'INFO', obj && obj.visitesJour ? 'Objectif déclaré : ' + obj.visitesJour + ' visites/jour' : 'Aucun objectif déclaré : pas de seuil appliqué');
    // 6. Optimisation
    let plan;
    try { plan = await proposerTournee({ candidats, depart: deps.depart, retour: deps.retour, plage: deps.plage || DEFAUTS.plage, pauses: deps.pauses, laurent: (deps.laurent || []).map((l) => String(l.id)), secteurs: deps.secteurs || [], solveur: deps.solveur, matrice }); }
    catch (e) { note('optimiseur', 'ECHEC', e.message); sortie.statut = 'ECHEC'; sortie.erreur = e.message; return sortie; }
    note('optimiseur', plan.repli ? 'REPLI' : 'OK', plan.ordre.length + ' visite(s) planifiée(s), moteur ' + plan.moteur);
    // 7. Audit et contrôle indépendant
    const audit = auditerProposition(plan, { candidats, clients: deps.clients, laurent: deps.laurent || [] });
    note('audit', audit.ok ? 'OK' : 'REFUSE', audit.ok ? 'Contrôles réussis' : audit.violations.map((v) => v.code).join(', '), { violations: audit.violations });
    Object.assign(sortie, { statut: audit.ok ? plan.statut : 'BLOQUE_AUDIT', plan, exclus, candidats, audit, validationHumaineRequise: true });
    return sortie;
  }
  // Contrôle indépendant : recalcule les invariants sans réutiliser la logique de l'optimiseur.
  function auditerProposition(plan, { candidats, clients, laurent }) {
    const v = [], ids = new Set(clients.map((c) => String(c.id)));
    plan.ordre.forEach((o, i) => {
      if (!ids.has(o.garageId)) v.push({ code: 'GARAGE_INVENTE', garageId: o.garageId });
      if (!posOk(o.pos)) v.push({ code: 'POSITION_INVALIDE', garageId: o.garageId });
      if (i && o.debutS < plan.ordre[i - 1].finS) v.push({ code: 'CHEVAUCHEMENT', garageId: o.garageId });
    });
    if (new Set(plan.ordre.map((o) => o.garageId)).size !== plan.ordre.length) v.push({ code: 'DOUBLON' });
    (laurent || []).forEach((l) => { const id = String(l.id); if (!plan.ordre.some((o) => o.garageId === id) && !plan.nonPlanifies.some((n) => n.garageId === id) && !(plan.sansPosition || []).includes(id) && candidats.some((c) => c.id === id)) v.push({ code: 'LAURENT_PERDU', garageId: id }); });
    const lecture = JSON.stringify(plan.requete || {});
    candidats.forEach((c) => { if (c.nom && c.nom.length > 3 && lecture.includes(c.nom)) v.push({ code: 'FUITE_NOM_VERS_SOLVEUR', garageId: c.id }); if (c.tel && String(c.tel).length > 5 && lecture.includes(String(c.tel))) v.push({ code: 'FUITE_TEL_VERS_SOLVEUR', garageId: c.id }); });
    if (!plan.validationHumaineRequise) v.push({ code: 'VALIDATION_HUMAINE_ABSENTE' });
    return { ok: v.length === 0, violations: v };
  }

  // ---------- commande de Charlie (texte dicté ou saisi) ----------
  function interpreterCommande(texte) {
    const t = norm(texte);
    if (!t) return null;
    if (/(organis|prepar|planifi).*(journee|tournee)|ma journee commerciale/.test(t)) return { action: 'organiser' };
    if (/(client|garage|patron).*(absent|ferme|pas la)|\babsent\b/.test(t)) return { action: 'absent' };
    if (/(annul)/.test(t)) return { action: 'annule' };
    if (/(retard)/.test(t)) { const m = /(\d{1,3})\s*(min|minutes)/.exec(t); return { action: 'retard', minutes: m ? +m[1] : null }; }
    if (/recalcul|reorganis|refais/.test(t)) return { action: 'recalculer' };
    if (/(suivant|prochain)/.test(t)) return { action: 'suivant' };
    if (/(termin|fini|fait)/.test(t)) return { action: 'termine' };
    if (/(gps|waze|naviguer|itineraire|guide)/.test(t)) return { action: 'gps', appli: /waze/.test(t) ? 'waze' : /google|maps/.test(t) ? 'google' : null };
    if (/(rapport|dicter|compte rendu)/.test(t)) return { action: 'dicter' };
    return null;
  }

  const API = { nomCleExporte: (n) => nomCle(n).join(' '), rapprocherNoms, nouveauJournal, journaliser, enseignements, TYPES_JOURNAL, semaineDe, GRILLE_LAURENT, SECTEURS_LAURENT, DEPARTEMENTS_IDF, parserSecteurs, secteursDuJour, secteursLaurent, departementDe, DEFAUTS, POIDS, posOk, hms, fmt, norm, distanceKm, matriceEstimee, matriceOSRM, scorer, construireCandidats, preparerVisites, verifierProposition, resoudreLocal, evaluerOrdre,
    proposerTournee, comparerLaurent, recalculer, suggererProches, lienNavigation, comparerPrevuReel, nouvelApprentissage, apprendre, dureeAppris, organiserJournee, auditerProposition, interpreterCommande };
  if (typeof module === 'object' && module.exports) module.exports = API; else racine.TourneeOpt = API;
})(typeof window !== 'undefined' ? window : globalThis);
