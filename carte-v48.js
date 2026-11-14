'use strict';
/* ODICOLOR — CARTE COMMERCIALE du téléphone (logique pure, testable sous Node). Aucune dépendance réseau, aucun fond de carte :
   les garages sont placés sur le centre de leur commune (approximation annoncée) ou sur leur GPS s'il est connu, puis REGROUPÉS dans une grille d'écran.
   Capacité visée : plusieurs milliers de garages, un rendu par geste en quelques millisecondes (un seul passage sur les points, grille par clé entière). */
const ODICOLOR_CARTE = (() => {
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const KM_LAT = 111.32;
  let CENTRES = null;
  function charger(rows) {   // rows = ODICOLOR_COMMUNES_CENTRES
    const parInsee = new Map(), parCp = new Map(), parNom = new Map();
    for (const [code, nom, lat, lng, cps] of rows) {
      const c = { insee: code, nom, lat, lng }; parInsee.set(code, c);
      const k = norm(nom); if (!parNom.has(k)) parNom.set(k, []); parNom.get(k).push(c);
      for (const cp of String(cps).split(' ').filter(Boolean)) { if (!parCp.has(cp)) parCp.set(cp, []); parCp.get(cp).push(c); }
    }
    CENTRES = { parInsee, parCp, parNom }; return CENTRES;
  }
  // Place un garage : GPS connu > commune (nom + code postal) > code postal à commune unique > non placé (avec motif).
  // Communes fusionnées : Pierrefitte-sur-Seine (93059) fait partie de Saint-Denis (93066) depuis le 01/01/2025.
  // Le centre de Pierrefitte reste utilisé pour la position (plus précis), mais le garage est compté dans Saint-Denis,
  // comme le fait le Bureau (référentiel officiel) : Carte, Secteurs et Ma Ville comptent ainsi de la même façon.
  const FUSIONS = { '93059': { insee: '93066', commune: 'Saint-Denis' } };
  const fusion = r => (r && r.insee && FUSIONS[r.insee] ? Object.assign(r, FUSIONS[r.insee]) : r);
  function placer(c) { return fusion(placerBrut(c)); }
  function placerBrut(c) {
    if (c.ent && Number.isFinite(c.ent.lat) && Number.isFinite(c.ent.lng) && Math.abs(c.ent.lat) <= 90 && Math.abs(c.ent.lng) <= 180) return { lat: c.ent.lat, lng: c.ent.lng, precision: 'gps' };
    if (!CENTRES) return { precision: null, motif: 'Référentiel des communes non chargé' };
    const cp = String(c.cp || '').replace(/\D/g, '').slice(0, 5), noms = [c.ville, c.villeProspection].map(norm).filter(Boolean);
    const duCp = CENTRES.parCp.get(cp) || [];
    for (const n of noms) { const m = duCp.find(x => norm(x.nom) === n) || (!cp ? (CENTRES.parNom.get(n) || []).length === 1 && CENTRES.parNom.get(n)[0] : null); if (m) return { lat: m.lat, lng: m.lng, precision: 'commune', insee: m.insee, commune: m.nom }; }
    if (duCp.length === 1) return { lat: duCp[0].lat, lng: duCp[0].lng, precision: 'commune', insee: duCp[0].insee, commune: duCp[0].nom };
    for (const n of noms) { const m = CENTRES.parNom.get(n); if (m && m.length === 1) return { lat: m[0].lat, lng: m[0].lng, precision: 'commune', insee: m[0].insee, commune: m[0].nom }; }
    return { precision: null, motif: cp || noms.length ? 'Commune non reconnue (' + (c.ville || c.villeProspection || '?') + ' ' + cp + ')' : 'Ni commune ni code postal' };
  }
  // Catégorie commerciale d'affichage.
  function categorie(c) {
    if (c.statutCrm === 'client') return 'client';
    if (c.conv === 'refus') return 'refus';
    if (c.priorite === 'A' || c.priorite === 'B') return 'prospect_prio';
    return 'prospect';
  }
  /* Prépare les points : { id, x, y (km, projection plane locale), cat, nom, commune, precision }, plus la liste des non placés. */
  function preparer(clients, marche) {
    const pts = [], nonPlaces = [], lat0 = 48.7, kx = KM_LAT * Math.cos(lat0 * Math.PI / 180);
    for (const c of clients || []) {
      const p = placer(c);
      if (!p.precision) { nonPlaces.push({ id: c.id, nom: c.nom, motif: p.motif }); continue; }
      pts.push({ id: c.id, x: p.lng * kx, y: -p.lat * KM_LAT, cat: categorie(c), nom: c.nom, commune: p.commune || c.ville || '', precision: p.precision, insee: p.insee || null });
    }
    // Marché à prospecter : un point par commune (nombre d'établissements recensés), jamais un garage individuel.
    const m = [];
    for (const [insee, n] of (marche && marche.communes) || []) { const c = CENTRES && CENTRES.parInsee.get(insee); if (c && n > 0) m.push({ insee, nom: c.nom, n, x: c.lng * kx, y: -c.lat * KM_LAT }); }
    return { points: pts, marche: m, nonPlaces, approx: pts.filter(p => p.precision === 'commune').length };
  }
  /* Regroupement pour une vue : vue = { cx, cy (km), kmParPx, largeur, hauteur (px) }, rayon = taille de cellule en px.
     Retourne des groupes { x, y (px), n, cats{}, ids[] (≤ max), nom? } — O(n), sans tri. */
  function regrouper(prep, vue, opts = {}) {
    const rayon = opts.rayon || 40, filtre = opts.filtre || (() => true), maxIds = opts.maxIds || 60, cases = new Map();
    const dehors = (px, py) => px < -rayon || py < -rayon || px > vue.largeur + rayon || py > vue.hauteur + rayon;
    let visibles = 0;
    const ajouter = (px, py, cat, n, p) => {
      const k = Math.floor(px / rayon) * 100003 + Math.floor(py / rayon);
      let g = cases.get(k); if (!g) { g = { sx: 0, sy: 0, n: 0, cats: {}, ids: [], marche: 0, communes: new Set() }; cases.set(k, g); }
      g.sx += px * n; g.sy += py * n; g.n += n; g.cats[cat] = (g.cats[cat] || 0) + n;
      if (cat === 'marche') { g.marche += n; if (p && g.communes.size < 12) g.communes.add(p.nom); } else { visibles += n; if (g.ids.length < maxIds) g.ids.push(p.id); }
    };
    for (const p of prep.points) {
      if (!filtre(p)) continue;
      const px = (p.x - vue.cx) / vue.kmParPx + vue.largeur / 2, py = (p.y - vue.cy) / vue.kmParPx + vue.hauteur / 2;
      if (dehors(px, py)) continue; ajouter(px, py, p.cat, 1, p);
    }
    if (opts.marche) for (const m of prep.marche) {
      const px = (m.x - vue.cx) / vue.kmParPx + vue.largeur / 2, py = (m.y - vue.cy) / vue.kmParPx + vue.hauteur / 2;
      if (!dehors(px, py)) ajouter(px, py, 'marche', m.n, m);
    }
    const out = []; for (const g of cases.values()) out.push({ x: g.sx / g.n, y: g.sy / g.n, n: g.n, cats: g.cats, ids: g.ids, marche: g.marche, communes: [...g.communes] });
    return { groupes: out, visibles };
  }
  // Vue qui cadre tous les points (marge 8 %).
  function cadrer(prep, largeur, hauteur, avecMarche) {
    const xs = [], ys = []; for (const p of prep.points) { xs.push(p.x); ys.push(p.y); } if (avecMarche) for (const m of prep.marche) { xs.push(m.x); ys.push(m.y); }
    if (!xs.length) return { cx: 2.4 * KM_LAT * Math.cos(48.7 * Math.PI / 180), cy: -48.7 * KM_LAT, kmParPx: 0.15, largeur, hauteur };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let i = 0; i < xs.length; i++) { if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]; if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]; }
    const k = Math.max((x1 - x0) / (largeur * 0.92), (y1 - y0) / (hauteur * 0.92), 0.02);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, kmParPx: k, largeur, hauteur };
  }
  const zoomer = (vue, facteur, px, py) => { const k = Math.min(2, Math.max(0.01, vue.kmParPx / facteur)), x = vue.cx + (px - vue.largeur / 2) * vue.kmParPx, y = vue.cy + (py - vue.hauteur / 2) * vue.kmParPx;
    return { ...vue, kmParPx: k, cx: x - (px - vue.largeur / 2) * k, cy: y - (py - vue.hauteur / 2) * k }; };
  const deplacer = (vue, dx, dy) => ({ ...vue, cx: vue.cx - dx * vue.kmParPx, cy: vue.cy - dy * vue.kmParPx });
  return { charger, placer, categorie, preparer, regrouper, cadrer, zoomer, deplacer, norm };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_CARTE;
