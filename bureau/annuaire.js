/* ODICOLOR Bureau — Lot 2 : marché issu de l'annuaire officiel (API Recherche d'entreprises, État).
   Lecture seule. Les établissements importés restent dans la couche « Marché » : jamais ajoutés à la Ville,
   jamais considérés comme prospects qualifiés. Aucune donnée personnelle n'est envoyée : seulement l'activité et le département.
   Limite connue : cette API sert la recherche, ce n'est pas une extraction exhaustive de SIRENE. */
(function (racine) {
  'use strict';

  const API = 'https://recherche-entreprises.api.gouv.fr/search';
  const NAF = '45.20A'; // Entretien et réparation de véhicules automobiles légers (mécanique ET carrosserie)
  const PAR_PAGE = 25;  // maximum accepté par l'API
  const PAUSE_MS = 220; // ≈ 4,5 requêtes par seconde, sous la limite publique de 7/s

  // Centre de travail (Massy-Palaiseau) : sert uniquement au calcul de distance du classement.
  const BASE = { lat: 48.7225, lng: 2.2585 };

  const TRANCHES = { NN: 'Non renseigné', '00': '0 salarié', '01': '1 à 2 salariés', '02': '3 à 5 salariés', '03': '6 à 9 salariés',
    '11': '10 à 19 salariés', '12': '20 à 49 salariés', '21': '50 à 99 salariés', '22': '100 à 199 salariés', '31': '200 à 249 salariés', '32': '250 à 499 salariés' };

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const txt = (v, n = 160) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; };

  function urlPage(dep, page) {
    const p = new URLSearchParams({ activite_principale: NAF, departement: dep, etat_administratif: 'A', per_page: String(PAR_PAGE), page: String(page) });
    return API + '?' + p.toString();
  }

  // Indices dans le nom : « probable » n'est jamais « qualifié ».
  const MOTS_CARROSSERIE = /\b(carross\w*|peinture|peintre|tolerie|toler\w*|debossel\w*|body|vitrage|pare brise|redressage)\b/;
  const MOTS_MECANIQUE = /\b(pneu\w*|vidange|norauto|speedy|midas|feu vert|point s|euromaster|controle technique|diesel|moto\w*|scooter\w*|depannage|remorquage|electricite auto|climatisation)\b/;
  function typeProbable(texte) {
    const t = norm(texte);
    if (MOTS_CARROSSERIE.test(t)) return { type: 'carrosserie', motif: 'Nom évoquant la carrosserie ou la peinture' };
    if (MOTS_MECANIQUE.test(t)) return { type: 'mecanique', motif: 'Nom évoquant la mécanique, le pneu ou un réseau rapide' };
    return { type: 'a_qualifier', motif: 'Nom sans indice : mécanique ou carrosserie à vérifier sur place' };
  }

  function distanceKm(a, b) {
    const R = 6371, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Score de priorité (0 à 100) : sert à choisir quoi visiter en premier, pas à juger un garage.
  function scorePriorite(e) {
    let s = 0; const raisons = [];
    if (e.typeProbable === 'carrosserie') { s += 50; raisons.push('carrosserie probable (+50)'); }
    else if (e.typeProbable === 'a_qualifier') { s += 20; raisons.push('activité à qualifier (+20)'); }
    const t = e.tranche;
    if (['02', '03'].includes(t)) { s += 15; raisons.push('3 à 9 salariés (+15)'); }
    else if (['11', '12', '21', '22', '31', '32'].includes(t)) { s += 22; raisons.push('10 salariés ou plus (+22)'); }
    if (e.position) {
      const d = distanceKm(BASE, e.position); e.distanceKm = Math.round(d * 10) / 10;
      const pts = Math.max(0, Math.round(25 - d)); s += pts; raisons.push(`${e.distanceKm} km de Massy-Palaiseau (+${pts})`);
    } else raisons.push('pas de position GPS (+0)');
    return { score: Math.min(100, s), raisons };
  }

  // Convertit UNE page de réponse en établissements du département demandé.
  function lirePage(json, dep) {
    if (!json || !Array.isArray(json.results)) throw new Error('Réponse inattendue de l’annuaire (pas de liste « results »).');
    const out = [];
    for (const r of json.results) {
      if (!r || typeof r !== 'object') continue;
      const etabs = Array.isArray(r.matching_etablissements) && r.matching_etablissements.length ? r.matching_etablissements : (r.siege ? [r.siege] : []);
      for (const e of etabs) {
        if (!e || !e.siret) continue;
        const cp = txt(e.code_postal, 5);
        if (dep && !cp.startsWith(dep)) continue;
        if (e.etat_administratif && e.etat_administratif !== 'A') continue;
        if (e.activite_principale && e.activite_principale.replace(/\s/g, '') !== NAF) continue;
        const enseigne = Array.isArray(e.liste_enseignes) && e.liste_enseignes.length ? txt(e.liste_enseignes[0], 120) : '';
        const raison = txt(r.nom_raison_sociale || r.nom_complet, 160);
        const nom = enseigne || txt(e.nom_commercial, 120) || txt(r.nom_complet, 120) || raison || 'Sans nom';
        const lat = num(e.latitude), lng = num(e.longitude);
        const tp = typeProbable([enseigne, e.nom_commercial, r.nom_complet, raison].join(' '));
        const et = {
          id: 'a-' + String(e.siret).replace(/\D/g, ''), source: 'annuaire', siret: String(e.siret).replace(/\D/g, ''), siren: txt(r.siren, 9),
          nom, raisonSociale: raison, adresse: txt(e.adresse, 200), cp, ville: txt(e.libelle_commune, 80), insee: txt(e.commune, 5),
          naf: NAF, tranche: txt(e.tranche_effectif_salarie || r.tranche_effectif_salarie, 2) || 'NN', estSiege: e.est_siege === true,
          position: lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null,
          typeProbable: tp.type, motifType: tp.motif, statut: 'marche'
        };
        const sc = scorePriorite(et); et.score = sc.score; et.raisons = sc.raisons;
        out.push(et);
      }
    }
    return out;
  }

  // Fusion sans doublons (clé = SIRET). Le premier vu est conservé.
  function fusionner(liste, nouveaux) {
    const vus = new Set(liste.map(x => x.siret)); let ajoutes = 0, doublons = 0;
    for (const n of nouveaux) { if (vus.has(n.siret)) { doublons++; continue; } vus.add(n.siret); liste.push(n); ajoutes++; }
    return { ajoutes, doublons };
  }

  // Signale les établissements déjà présents parmi TES garages (même nom + même commune, ou même SIRET).
  function rapprocher(marche, mesGarages) {
    const cles = new Map();
    (mesGarages || []).forEach(g => { if (g.siret) cles.set('s:' + g.siret, g); cles.set('n:' + norm(g.nom) + '|' + norm(g.commune || g.ville), g); });
    let n = 0;
    marche.forEach(e => { const g = cles.get('s:' + e.siret) || cles.get('n:' + norm(e.nom) + '|' + norm(e.ville)); e.dejaTravaille = g ? g.id : null; if (g) n++; });
    return n;
  }

  // Couverture = garages travaillés / garages ciblés ; conquête = clients gagnés / garages ciblés.
  // Ciblés = carrosseries probables de l'annuaire dans la commune.
  function indicateursCommune(marche, mesGarages, commune) {
    const c = norm(commune);
    const cibles = marche.filter(e => norm(e.ville) === c && e.typeProbable === 'carrosserie').length;
    const miens = (mesGarages || []).filter(g => norm(g.commune || g.ville) === c);
    const travailles = miens.length, clients = miens.filter(g => g.statut === 'actif' || g.statut === 'risque' || g.statut === 'dormant').length;
    return { commune, cibles, travailles, clients,
      couverture: cibles ? Math.round(1000 * Math.min(travailles, cibles) / cibles) / 10 : null,
      conquete: cibles ? Math.round(1000 * Math.min(clients, cibles) / cibles) / 10 : null };
  }

  function prioritaires(marche, n = 5) {
    return marche.filter(e => !e.dejaTravaille && e.typeProbable !== 'mecanique')
      .sort((a, b) => b.score - a.score || (a.distanceKm ?? 999) - (b.distanceKm ?? 999) || a.nom.localeCompare(b.nom, 'fr')).slice(0, n);
  }

  function resume(marche) {
    const n = k => marche.filter(e => e.typeProbable === k).length;
    return { total: marche.length, carrosserie: n('carrosserie'), aQualifier: n('a_qualifier'), mecanique: n('mecanique'),
      avecGps: marche.filter(e => e.position).length, communes: new Set(marche.map(e => e.ville)).size };
  }

  const attendre = ms => new Promise(r => setTimeout(r, ms));
  async function lireAvecReprise(f, url, signal, essais = 4) {
    for (let i = 0; i < essais; i++) {
      const rep = await f(url, { signal, headers: { Accept: 'application/json' } });
      if (rep.status === 429 || rep.status >= 500) { await attendre(1000 * (i + 1)); continue; }
      if (!rep.ok) throw new Error('L’annuaire a répondu ' + rep.status + '.');
      return rep.json();
    }
    throw new Error('L’annuaire reste indisponible après ' + essais + ' essais (trop de demandes ou panne).');
  }

  // Étape 1 : test de connexion et de pagination (2 pages maximum).
  async function tester(dep, opts = {}) {
    const f = opts.fetch || racine.fetch.bind(racine);
    const p1 = await lireAvecReprise(f, urlPage(dep, 1), opts.signal);
    const total = num(p1.total_results), pages = num(p1.total_pages);
    if (total == null || pages == null) throw new Error('Réponse sans total : format de l’annuaire inattendu.');
    const e1 = lirePage(p1, dep);
    let e2 = [];
    if (pages > 1) { await attendre(opts.pause ?? PAUSE_MS); e2 = lirePage(await lireAvecReprise(f, urlPage(dep, 2), opts.signal), dep); }
    const recouvrement = e2.filter(x => e1.some(y => y.siret === x.siret)).length;
    return { total, pages, page1: e1.length, page2: e2.length, paginationOk: pages <= 1 || (e2.length > 0 && recouvrement === 0), exemple: e1.slice(0, 3) };
  }

  // Étape 2 : import complet, page par page, avec progression et arrêt possible.
  async function importer(dep, opts = {}) {
    const f = opts.fetch || racine.fetch.bind(racine), liste = [];
    const premiere = await lireAvecReprise(f, urlPage(dep, 1), opts.signal);
    const pages = Math.min(num(premiere.total_pages) || 1, opts.maxPages || 400);
    let doublons = fusionner(liste, lirePage(premiere, dep)).doublons;
    opts.progression && opts.progression(1, pages, liste.length);
    for (let p = 2; p <= pages; p++) {
      if (opts.signal && opts.signal.aborted) throw new Error('Import arrêté.');
      await attendre(opts.pause ?? PAUSE_MS);
      doublons += fusionner(liste, lirePage(await lireAvecReprise(f, urlPage(dep, p), opts.signal), dep)).doublons;
      opts.progression && opts.progression(p, pages, liste.length);
    }
    return { etablissements: liste, pages, doublons, total: num(premiere.total_results), date: new Date().toISOString() };
  }

  const api = { API, NAF, PAR_PAGE, BASE, TRANCHES, urlPage, typeProbable, distanceKm, scorePriorite, lirePage, fusionner, rapprocher,
    indicateursCommune, prioritaires, resume, tester, importer };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.Annuaire = api;
})(typeof self !== 'undefined' ? self : this);
