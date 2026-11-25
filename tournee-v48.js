'use strict';
/* ODICOLOR — PROPOSITION DE TOURNÉE DU JOUR (logique pure). À partir des priorités du cockpit (rappels, devis à relancer, réachat, prospects A/B, clients à ne pas laisser dormir)
   on propose au plus N garages PROCHES les uns des autres, du plus utile au moins utile, puis on les ordonne par plus proche voisin.
   Rien n'est imposé : c'est une proposition que l'utilisateur coche et valide. Garage sans position (commune inconnue) : jamais proposé (on ne devine pas un trajet). */
const ODICOLOR_TOURNEE = (() => {
  const km = (a, b) => { const dx = (a.lng - b.lng) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), dy = (a.lat - b.lat) * 111.32; return Math.hypot(dx, dy); };
  const POIDS = { rappels: 50, devis: 40, reachat: 35, accepte: 0, impayes: 0, bloques: 0, prospects: 25, risque: 22 };
  /* entrees : { sections (K.calculer avec sansLimite), position(id)->{lat,lng}|null, nom(id) } ; opts : { max=8, rayonKm=25, depart?:{lat,lng} } */
  function proposer(sections, position, opts = {}) {
    const max = opts.max || 8, rayon = opts.rayonKm || 25, score = new Map(), raisons = new Map();
    for (const s of sections) {
      const w = POIDS[s.id] || 0; if (!w) continue;
      for (const l of s.lignes) {
        let pts = w + (s.id === 'rappels' ? Math.min(30, l.retard || 0) : s.id === 'devis' ? Math.min(30, (l.montant || 0) / 100000) : s.id === 'reachat' ? Math.min(30, ((l.jours || 0) - 60) / 3) : s.id === 'prospects' ? (l.priorite === 'A' ? 10 : 0) + (l.jours == null ? 8 : 0) : s.id === 'risque' ? Math.min(15, ((l.jours || 0) - 45) / 4) : 0);
        score.set(l.id, (score.get(l.id) || 0) + pts); (raisons.get(l.id) || raisons.set(l.id, []).get(l.id)).push(l.raison);
      }
    }
    const cands = [...score.entries()].map(([id, sc]) => ({ id, sc, pos: position(id), raisons: raisons.get(id) })).filter(c => c.pos);
    const sansPosition = [...score.keys()].length - cands.length;
    if (!cands.length) return { ids: [], details: [], sansPosition, motif: 'Aucun garage prioritaire avec une position connue.' };
    cands.sort((a, b) => b.sc - a.sc);
    const graine = opts.depart ? cands.reduce((m, c) => (c.sc / (1 + km(opts.depart, c.pos) / 10) > m.sc / (1 + km(opts.depart, m.pos) / 10) ? c : m)) : cands[0];
    const choisis = [graine], restants = cands.filter(c => c !== graine && km(graine.pos, c.pos) <= rayon);
    while (choisis.length < max && restants.length) {
      let bi = 0, bv = -1; restants.forEach((c, i) => { const d = Math.min(...choisis.map(x => km(x.pos, c.pos))), v = c.sc / (1 + d / 5); if (v > bv) { bv = v; bi = i; } });
      choisis.push(restants.splice(bi, 1)[0]);
    }
    // Ordre de passage : plus proche voisin depuis le point de départ (ou le garage le plus prioritaire).
    const ordre = []; let cur = opts.depart || graine.pos, reste = choisis.slice();
    while (reste.length) { let bi = 0, bd = Infinity; reste.forEach((c, i) => { const d = km(cur, c.pos); if (d < bd) { bd = d; bi = i; } }); const c = reste.splice(bi, 1)[0]; ordre.push(c); cur = c.pos; }
    let total = 0, prev = opts.depart || ordre[0].pos; for (const c of ordre) { total += km(prev, c.pos); prev = c.pos; }
    return { ids: ordre.map(c => c.id), details: ordre.map(c => ({ id: c.id, score: Math.round(c.sc), raisons: c.raisons })), kmApprox: Math.round(total), sansPosition, motif: null };
  }
  return { proposer, km };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_TOURNEE;
