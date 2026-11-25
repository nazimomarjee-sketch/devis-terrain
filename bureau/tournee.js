/* ODICOLOR 2.0 — Lot 2 : ORDRE DE TOURNÉE (Bureau → téléphone). Calcul pur, LECTURE SEULE, aucun réseau.
   Règles :
   - position d'un garage = CENTRE DE SA COMMUNE (communes-centres.js), jamais son adresse : la distance est une ESTIMATION ;
   - distance = vol d'oiseau × FACTEUR_ROUTE (1,3 : HYPOTHÈSE à caler sur les tournées réelles), départ et retour au point de
     rattachement (Massy–Palaiseau par défaut) ;
   - un rendez-vous (heure fixée) n'est JAMAIS déplacé : les rendez-vous restent dans l'ordre de leurs heures, les autres garages
     sont insérés là où ils allongent le moins le trajet (insertion au moindre coût), puis le trajet est amélioré par 2-opt
     uniquement entre deux rendez-vous ;
   - garage sans position connue : jamais placé au hasard, mis à la fin avec le motif « position inconnue » ;
   - un même garage (même id) n'apparaît qu'une fois. */
(function (racine) {
  'use strict';
  const FACTEUR_ROUTE = 1.3;
  const rad = d => d * Math.PI / 180;
  function km(a, b) {
    const R = 6371, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x)) * FACTEUR_ROUTE;
  }
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // centres : lignes [insee, nom, lat, lon, codes postaux] (format de communes-centres.js).
  function index(centres) {
    const parInsee = new Map(), parCpNom = new Map();
    for (const [insee, nom, lat, lon, cps] of centres || []) {
      const p = { insee, nom, lat, lon }; parInsee.set(insee, p);
      for (const cp of String(cps || '').split(/\s+/).filter(Boolean)) parCpNom.set(cp + '|' + norm(nom), p);
    }
    return { parInsee, parCpNom };
  }
  function position(e, I) {
    if (e.insee && I.parInsee.has(e.insee)) return I.parInsee.get(e.insee);
    if (e.cp && e.commune) return I.parCpNom.get(e.cp + '|' + norm(e.commune)) || null;
    return null;
  }
  const minutes = h => { const r = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return r ? +r[1] * 60 + +r[2] : null; };

  // e = { etapes: [{ id, nom, insee?, cp?, commune?, rdv?: 'HH:MM' }], depart?: { insee } , centres, retour = true }
  function ordonner(e = {}) {
    const I = index(e.centres), vus = new Set(), doublons = [];
    const dep = position(e.depart || { insee: '91477' }, I); // Palaiseau (rattachement Massy–Palaiseau)
    if (!dep) throw new Error('Point de départ sans position connue.');
    const connues = [], inconnues = [];
    for (const s of e.etapes || []) {
      if (!s || !s.id) continue;
      if (vus.has(s.id)) { doublons.push(s.id); continue; } vus.add(s.id);
      const p = position(s, I), rdv = minutes(s.rdv);
      if (s.rdv && rdv == null) { inconnues.push({ ...s, motif: 'Heure de rendez-vous illisible (« ' + s.rdv + ' »)' }); continue; }
      if (!p) { inconnues.push({ ...s, motif: 'Position inconnue (commune absente des centres disponibles)' }); continue; }
      connues.push({ ...s, pos: p, rdvMin: rdv });
    }
    const rdvs = connues.filter(s => s.rdvMin != null).sort((a, b) => a.rdvMin - b.rdvMin);
    const libres = connues.filter(s => s.rdvMin == null);
    const retour = e.retour !== false;
    // Trajet = [départ, ...rendez-vous, (retour)] puis insertion des libres au moindre coût.
    const pts = [{ pos: dep, fixe: true, depart: true }, ...rdvs.map(s => ({ ...s, fixe: true }))];
    if (retour) pts.push({ pos: dep, fixe: true, arrivee: true });
    for (const s of libres) {
      let best = null;
      const fin = retour ? pts.length - 1 : pts.length;
      for (let i = 1; i <= fin; i++) {
        const a = pts[i - 1].pos, b = i < pts.length ? pts[i].pos : null;
        const cout = km(a, s.pos) + (b ? km(s.pos, b) - km(a, b) : 0);
        if (!best || cout < best.cout - 1e-9) best = { i, cout };
      }
      pts.splice(best.i, 0, s);
    }
    // 2-opt entre deux points fixes : jamais de rendez-vous déplacé.
    let ameliore = true;
    while (ameliore) {
      ameliore = false;
      for (let i = 1; i < pts.length - 1; i++) for (let j = i + 1; j < pts.length - (retour ? 1 : 0); j++) {
        if (pts.slice(i, j + 1).some(p => p.fixe)) continue;
        const a = pts[i - 1].pos, b = pts[i].pos, c = pts[j].pos, d = pts[j + 1] ? pts[j + 1].pos : null;
        const avant = km(a, b) + (d ? km(c, d) : 0), apres = km(a, c) + (d ? km(b, d) : 0);
        if (apres < avant - 1e-9) { pts.splice(i, j - i + 1, ...pts.slice(i, j + 1).reverse()); ameliore = true; }
      }
    }
    let total = 0; for (let i = 1; i < pts.length; i++) total += km(pts[i - 1].pos, pts[i].pos);
    const ordre = pts.filter(p => !p.depart && !p.arrivee).map((p, k) => ({ rang: k + 1, id: p.id, nom: p.nom, commune: p.pos.nom, insee: p.pos.insee, rdv: p.rdv || null }));
    return { ordre, inconnues, doublons, kmEstimes: Math.round(total), depart: dep.nom, retour,
      hypothese: 'Distances estimées entre centres de communes (vol d’oiseau × ' + FACTEUR_ROUTE + '), pas un itinéraire routier.' };
  }

  const api = { ordonner, km, FACTEUR_ROUTE };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.Tournee = api;
})(typeof self !== 'undefined' ? self : this);
