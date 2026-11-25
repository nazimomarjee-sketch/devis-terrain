'use strict';
/* Cockpit Bureau — carte de la tournée CHARLIE. Même schéma que le Samsung (charlie-tournee/v1) : une seule source de données.
 * Carte SVG locale, sans fond de carte externe : aucune coordonnée ni nom de client n'est envoyé à un service tiers.
 * Le fichier est lu dans le navigateur (FileReader), jamais téléversé.
 */
(function (racine) {
  const ok = (m) => { throw new Error(m); };
  function valider(d) {
    if (!d || d.schema !== 'charlie-tournee/v1') ok('Fichier non reconnu (schema charlie-tournee/v1 attendu).');
    if (!d.plan || !Array.isArray(d.plan.ordre)) ok('Plan absent du fichier.');
    for (const o of d.plan.ordre) if (!o.pos || !Number.isFinite(o.pos.lat) || !Number.isFinite(o.pos.lng)) ok('Position invalide pour ' + (o.nom || o.garageId));
    return d;
  }
  // Projection équirectangulaire corrigée de la latitude moyenne, cadrée dans w×h avec marge.
  function projeter(points, w, h, marge = 28) {
    if (!points.length) return [];
    const la = points.map((p) => p.lat), lo = points.map((p) => p.lng), lat0 = (Math.min(...la) + Math.max(...la)) / 2, k = Math.cos(lat0 * Math.PI / 180);
    const x = lo.map((v) => v * k), y = la.map((v) => -v), minx = Math.min(...x), maxx = Math.max(...x), miny = Math.min(...y), maxy = Math.max(...y);
    const sx = (w - 2 * marge) / Math.max(1e-9, maxx - minx), sy = (h - 2 * marge) / Math.max(1e-9, maxy - miny), s = Math.min(sx, sy);
    const ox = marge + ((w - 2 * marge) - (maxx - minx) * s) / 2, oy = marge + ((h - 2 * marge) - (maxy - miny) * s) / 2;
    return points.map((_, i) => ({ x: Math.round((ox + (x[i] - minx) * s) * 10) / 10, y: Math.round((oy + (y[i] - miny) * s) * 10) / 10 }));
  }
  function vueJournee(d) {
    valider(d);
    const faits = new Set((d.faits || []).map(String)), retires = new Set((d.retires || []).map(String)), reel = d.reel || [];
    const ordre = d.plan.ordre.map((o) => ({ ...o, etat: reel.find((r) => r.garageId === o.garageId) ? reel.find((r) => r.garageId === o.garageId).resultat : retires.has(o.garageId) ? 'retire' : 'a_faire' }));
    const T = racine.TourneeOpt || (typeof require === 'function' ? require('../charlie-optimiseur-v50.js') : null);
    const bilan = T ? T.comparerPrevuReel(d.plan, reel) : null;
    const vus = ordre.filter((o) => o.etat === 'vu'), minClient = Math.round(reel.filter((r) => r.resultat === 'vu').reduce((s, r) => s + Math.max(0, r.finS - r.arriveeS), 0) / 60);
    const couleurs = { vu: '#2e9e5b', absent: '#e0a030', retire: '#888', a_faire: '#d41f2b' };
    const pts = (d.depart ? [d.depart] : []).concat(ordre.map((o) => o.pos)), xy = projeter(pts, 760, 520), off = d.depart ? 1 : 0;
    return { jour: d.jour, noeuds: ordre.map((o, i) => ({ rang: o.rang, garageId: o.garageId, nom: o.nom, type: o.type, laurent: !!o.laurent, etat: o.etat, couleur: couleurs[o.etat], x: xy[i + off].x, y: xy[i + off].y, heure: o.debut, score: o.score })),
      depart: d.depart ? xy[0] : null, trace: xy.map((p) => p.x + ',' + p.y).join(' '),
      kpi: { prevus: ordre.length, vus: vus.length, absents: ordre.filter((o) => o.etat === 'absent').length, restants: ordre.filter((o) => o.etat === 'a_faire').length, km: d.plan.totaux ? d.plan.totaux.km : null, conduiteMin: d.plan.totaux ? d.plan.totaux.conduiteMin : null, clientPrevuMin: d.plan.totaux ? d.plan.totaux.clientMin : null, clientReelMin: minClient },
      ecartsLaurent: d.plan.ecartsLaurent || [], bilan, source: d.plan.source || null };
  }
  const API = { valider, projeter, vueJournee };
  if (typeof module === 'object' && module.exports) { module.exports = API; return; }
  racine.CharlieBureau = API;
  document.addEventListener('DOMContentLoaded', () => {
    const $ = (s) => document.querySelector(s), esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    $('#fichier').addEventListener('change', (ev) => {
      const f = ev.target.files[0]; if (!f) return; if (f.size > 5 * 1024 * 1024) { $('#msg').textContent = 'Fichier trop gros.'; return; }
      const r = new FileReader(); r.onload = () => { try { dessiner(vueJournee(JSON.parse(r.result))); $('#msg').textContent = ''; } catch (e) { $('#msg').textContent = e.message; } }; r.readAsText(f);
    });
    function dessiner(v) {
      const k = v.kpi, lib = { vu: 'Vu', absent: 'Absent', retire: 'Retiré', a_faire: 'À faire' };
      $('#kpi').innerHTML = [['Prévus', k.prevus], ['Vus', k.vus], ['Absents', k.absents], ['Restants', k.restants], ['Km estimés', k.km], ['Trajet (min)', k.conduiteMin], ['Chez les clients (min)', k.clientReelMin + ' / ' + k.clientPrevuMin + ' prévu']].map(([l, x]) => '<div class="kpi"><b>' + esc(x) + '</b><small>' + esc(l) + '</small></div>').join('');
      $('#carte').innerHTML = '<polyline points="' + esc(v.trace) + '" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="6 5"/>' + (v.depart ? '<rect x="' + (v.depart.x - 7) + '" y="' + (v.depart.y - 7) + '" width="14" height="14" fill="#222"><title>Départ</title></rect>' : '') +
        v.noeuds.map((n) => '<g><circle cx="' + n.x + '" cy="' + n.y + '" r="' + (n.laurent ? 13 : 10) + '" fill="' + n.couleur + '" stroke="' + (n.laurent ? '#111' : '#fff') + '" stroke-width="3"/><text x="' + n.x + '" y="' + (n.y + 4) + '" text-anchor="middle" font-size="12" fill="#fff" font-weight="700">' + n.rang + '</text><title>' + esc(n.nom + ' · ' + n.heure + ' · ' + lib[n.etat] + ' · score ' + n.score) + '</title></g>').join('');
      $('#liste').innerHTML = v.noeuds.map((n) => '<tr><td>' + n.rang + '</td><td>' + esc(n.nom) + '</td><td>' + esc(n.heure) + '</td><td>' + esc(String(n.type || '').replace(/_/g, ' ')) + '</td><td>' + (n.laurent ? 'Laurent' : 'Ajout CHARLIE') + '</td><td style="color:' + n.couleur + '">' + lib[n.etat] + '</td></tr>').join('');
      $('#ecarts').innerHTML = v.ecartsLaurent.length ? v.ecartsLaurent.map((e) => '<li>' + esc(e.code + ' ' + (e.nom || e.detail || '')) + '</li>').join('') : '<li>Aucun écart avec la feuille de Laurent.</li>';
      $('#source').textContent = (v.source || '') + ' — jour ' + v.jour + '. Temps estimés, trafic temps réel non garanti.';
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
