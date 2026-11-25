/* ODICOLOR 2.0 — Ma Ville : moteur de dessin isométrique LEGO Premium (étape 2).
   Repris À L'IDENTIQUE des sources de la référence visuelle figée (docs/maquettes/ma-ville-reference/sources/iso.js et
   batiments.js), enfermé dans un module pour ne rien exposer d'autre que window.DessinIso.
   Ne pas modifier le rendu sans l'accord du propriétaire : la référence fait foi. */
(function (racine) {
  'use strict';
// Moteur isométrique des MAQUETTES Ma Ville (hors application, données fictives).
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
const SEG = {
  'client-carrosserie': { c: '#D41F2B', l: 'Client ODICOLOR carrosserie' },
  'client-mecanique': { c: '#0B0B0D', l: 'Client ODICOLOR Mécan', lisere: true },
  'prospect-carrosserie': { c: '#F0952B', l: 'Prospect carrosserie' },
  'prospect-mecanique': { c: '#3E86F0', l: 'Prospect mécanique' },
  'hors-cible': { c: '#6E737B', l: 'Hors cible / à qualifier' }
};
function Scene(S, ox, oy) {
  const items = [];
  const P = (x, y, z = 0) => [ox + (x - y) * C30 * S, oy + (x + y) * S30 * S - z * S * 0.82];
  const pts = a => a.map(p => P(...p).map(v => v.toFixed(1)).join(',')).join(' ');
  const add = (prof, svg) => items.push([prof, svg]);
  const api = {
    P, pts, add,
    poly: (prof, a, attrs) => add(prof, `<polygon points="${pts(a)}" ${attrs}/>`),
    // Pavé : x,y au sol, w (axe x), d (axe y), h (hauteur), z (base). Faces : dessus, avant-gauche (+y), avant-droite (+x).
    boite(x, y, w, d, h, { haut = '#2A303A', gauche = '#1B1F26', droite = '#14171C', z = 0, trait = 'rgba(255,255,255,.05)', prof } = {}) {
      const pr = prof ?? (x + w + y + d) + z * 0.01;
      add(pr, `<g><polygon points="${pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])}" fill="${gauche}" stroke="${trait}"/>` +
        `<polygon points="${pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])}" fill="${droite}" stroke="${trait}"/>` +
        `<polygon points="${pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])}" fill="${haut}" stroke="${trait}"/></g>`);
      return pr;
    },
    // Néon le long des arêtes hautes visibles (contour du toit).
    neon(x, y, w, d, z, couleur, { epais = 2.2, lisere = false, prof } = {}) {
      const p = pts([[x, y + d, z], [x + w, y + d, z], [x + w, y, z]]);
      const base = lisere ? `<polyline points="${p}" fill="none" stroke="#F4F2EF" stroke-width="${epais + 1.3}" stroke-linejoin="round" opacity=".85" filter="url(#lueur)"/>` : '';
      add(prof ?? (x + w + y + d) + z * 0.01 + 0.02, base + `<polyline points="${p}" fill="none" stroke="${couleur}" stroke-width="${epais}" stroke-linejoin="round" ${lisere ? '' : 'filter="url(#lueur)"'}/>`);
    },
    // Texte posé sur la face avant-gauche (+y) ou avant-droite (+x).
    texteFace(face, x, y, z, txt, { taille = 12, couleur = '#F4F2EF', poids = 700, police = 'VC Barlow, Barlow Condensed, system-ui', lueur = false, prof, ancre = 'start' } = {}) {
      const [sx, sy] = P(x, y, z), m = face === 'gauche' ? `matrix(${C30},${S30},0,1,${sx},${sy})` : `matrix(${C30},${-S30},0,1,${sx},${sy})`;
      add(prof ?? x + y + 4.2, `<text transform="${m}" font-family="${police}" font-weight="${poids}" font-size="${taille}" fill="${couleur}" text-anchor="${ancre}" letter-spacing=".04em" ${lueur ? 'filter="url(#lueur)"' : ''}>${txt}</text>`);
    },
    // Fenêtres lumineuses sur une face.
    fenetres(face, x, y, w, z, h, n, { couleur = '#FFD27A', allume = 0.65, graine = 1, prof } = {}) {
      let r = graine; const al = () => (r = (r * 9301 + 49297) % 233280) / 233280;
      let s = '';
      for (let i = 0; i < n; i++) for (let j = 0; j < Math.max(1, Math.floor(h / 1.1)); j++) {
        const base = face === 'gauche' ? x : y, a = base + (i + 0.25) * (w / n), b = a + (w / n) * 0.5, zz = z + 0.35 + j * 1.05;
        const q = face === 'gauche' ? [[a, y, zz], [b, y, zz], [b, y, zz + 0.55], [a, y, zz + 0.55]] : [[x, a, zz], [x, b, zz], [x, b, zz + 0.55], [x, a, zz + 0.55]];
        s += `<polygon points="${pts(q)}" fill="${al() < allume ? couleur : '#0E1116'}" opacity="${al() < allume ? .85 : 1}"/>`;
      }
      add(prof ?? x + y + 4, s);
    },
    // Porte sectionnelle (atelier) sur la face +y : ouverte = halo intérieur.
    porte(x, y, w, h, { ouverte = false, interieur = '#FFC873', prof } = {}) {
      const q = [[x, y, 0], [x + w, y, 0], [x + w, y, h], [x, y, h]];
      let s = `<polygon points="${pts(q)}" fill="${ouverte ? interieur : '#2B313B'}" opacity="${ouverte ? .55 : 1}"/>`;
      if (!ouverte) for (let k = 1; k < 5; k++) s += `<polyline points="${pts([[x, y, h * k / 5], [x + w, y, h * k / 5]])}" stroke="#3A414D" stroke-width="1"/>`;
      add(prof ?? x + y + 4, s);
    },
    // Véhicule (voiture ou fourgon) orienté selon x.
    vehicule(x, y, couleur, { fourgon = false, prof, sens = 'x' } = {}) {
      const L = fourgon ? 1.7 : 1.35, l = 0.7, h1 = fourgon ? 0.75 : 0.42;
      const [w, d] = sens === 'x' ? [L, l] : [l, L];
      const pr = prof ?? x + y + 1.5;
      api.boite(x, y, w, d, h1, { haut: couleur, gauche: shade(couleur, -.25), droite: shade(couleur, -.4), z: 0.18, prof: pr });
      if (!fourgon) api.boite(x + (sens === 'x' ? 0.3 : 0.08), y + (sens === 'x' ? 0.08 : 0.3), sens === 'x' ? 0.7 : 0.54, sens === 'x' ? 0.54 : 0.7, 0.3,
        { haut: shade(couleur, -.1), gauche: '#9CC7E8', droite: '#7FA9CC', z: 0.6, prof: pr + 0.01 });
      else { api.texteFace('gauche', x + 0.15, y + d, 0.35, 'ODICOLOR', { taille: 7, couleur: '#D41F2B', prof: pr + 0.02 }); }
      const roue = (a, b) => { const [cx, cy] = P(a, b, 0.12); add(pr - 0.01, `<ellipse cx="${cx}" cy="${cy}" rx="${S * 0.14}" ry="${S * 0.1}" fill="#08090B"/>`); };
      if (sens === 'x') { roue(x + 0.3, y + d); roue(x + w - 0.3, y + d); } else { roue(x + w, y + 0.3); roue(x + w, y + d - 0.3); }
      const [px, py] = sens === 'x' ? P(x + w, y + d * 0.5, 0.42) : P(x + w * 0.5, y + d, 0.42);
      add(pr + 0.03, `<circle cx="${px}" cy="${py}" r="${S * 0.07}" fill="#FFF3C4" filter="url(#lueur)"/>`);
    },
    // Figurine LEGO (complément du bâtiment) avec anneau de segment au sol.
    figurine(x, y, seg, { echelle = 1, peau = '#E8B98A', tenue = '#E9EAEC', casquette = null, tablette = false, prof } = {}) {
      const [cx, cy] = P(x, y, 0), k = S * 0.045 * echelle, sg = SEG[seg] || { c: 'none' }; // seg 'odicolor' : personnel ODICOLOR, sans anneau commercial
      let s = `<g transform="translate(${cx},${cy}) scale(${k})">`;
      s += sg.lisere ? `<ellipse cx="0" cy="0" rx="17" ry="7" fill="none" stroke="#F4F2EF" stroke-width="5.5" opacity=".95" filter="url(#lueur)"/>` : '';
      if (sg.c !== 'none') s += `<ellipse cx="0" cy="0" rx="17" ry="7" fill="none" stroke="${sg.c}" stroke-width="3.6" ${sg.lisere ? '' : 'filter="url(#lueur)"'}/>`;
      s += `<rect x="-7" y="-20" width="6.5" height="19" rx="1.5" fill="#2A2F38"/><rect x="0.5" y="-20" width="6.5" height="19" rx="1.5" fill="#2A2F38"/>`;
      s += `<path d="M-10,-42 L10,-42 L12,-19 L-12,-19 Z" fill="${tenue}"/><rect x="-12" y="-31" width="24" height="3" fill="${sg.c === '#0B0B0D' ? '#F4F2EF' : sg.c === 'none' ? '#D41F2B' : sg.c}"/>`;
      s += `<rect x="-15" y="-41" width="5" height="14" rx="2" fill="${tenue}"/><rect x="10" y="-41" width="5" height="14" rx="2" fill="${tenue}"/>`;
      s += `<rect x="-3" y="-46" width="6" height="5" fill="${peau}"/><rect x="-9" y="-62" width="18" height="17" rx="5" fill="${peau}"/>`;
      s += `<circle cx="-3.5" cy="-54" r="1.5" fill="#1A1A1A"/><circle cx="3.5" cy="-54" r="1.5" fill="#1A1A1A"/><path d="M-4,-49.5 Q0,-46.5 4,-49.5" stroke="#1A1A1A" stroke-width="1.3" fill="none"/>`;
      if (casquette) s += `<path d="M-10,-60 Q0,-70 10,-60 L10,-58 L-10,-58 Z" fill="${casquette}"/><rect x="2" y="-59.5" width="11" height="2.5" rx="1" fill="${casquette}"/>`;
      else s += `<path d="M-9.5,-58 Q-9,-66 0,-66 Q9,-66 9.5,-58 Q5,-61 0,-61 Q-5,-61 -9.5,-58 Z" fill="#3B2A20"/>`;
      if (tablette) s += `<rect x="12" y="-36" width="8" height="11" rx="1.5" fill="#1C2330" stroke="#3E86F0" stroke-width="1"/>`;
      s += `</g>`;
      add(prof ?? x + y + 2, s);
    },
    // Arbre et lampadaire (décor discret).
    arbre(x, y, prof) { const [cx, cy] = P(x, y, 0), k = S / 28; add(prof ?? x + y + 0.5, `<g transform="translate(${cx},${cy}) scale(${k})"><rect x="-1.5" y="-6" width="3" height="6" fill="#3A2B20"/><path d="M0,-30 L9,-6 L-9,-6 Z" fill="#1E5A36"/><path d="M0,-38 L7,-18 L-7,-18 Z" fill="#247044"/></g>`); },
    lampe(x, y, prof) { const [cx, cy] = P(x, y, 0), k = S / 28; add(prof ?? x + y + 0.5, `<g transform="translate(${cx},${cy}) scale(${k})"><circle cx="0" cy="-26" r="16" fill="url(#halo)"/><rect x="-1" y="-26" width="2" height="26" fill="#59606B"/><circle cx="0" cy="-27" r="2.6" fill="#FFC873"/></g>`); },
    sol(x, y, w, d, couleur, prof = -1000, bord = '#252B34') { api.poly(prof, [[x, y], [x + w, y], [x + w, y + d], [x, y + d]], `fill="${couleur}" stroke="${bord}" stroke-width="1"`); },
    route(x, y, w, d, sens, prof = -900) {
      api.sol(x, y, w, d, '#272C34', prof, '#2E333B');
      const m = sens === 'x' ? [[x, y + d / 2], [x + w, y + d / 2]] : [[x + w / 2, y], [x + w / 2, y + d]];
      add(prof + 1, `<polyline points="${pts(m)}" stroke="#5C6370" stroke-width="1.4" stroke-dasharray="7 9" fill="none"/>`);
    },
    // Panneau vertical (enseigne sur poteau) avec texte de face.
    enseigne(x, y, z, txt, couleur, { taille = 10, largeur = 2.2, prof } = {}) {
      const pr = prof ?? x + y + 3;
      api.boite(x, y, largeur, 0.12, 0.62, { haut: '#111', gauche: '#0D0F13', droite: '#0D0F13', z, prof: pr });
      api.neon(x, y, largeur, 0.12, z + 0.62, couleur, { epais: 1.4, prof: pr + 0.01 });
      api.texteFace('gauche', x + 0.15, y + 0.12, z + 0.16, txt, { taille, couleur, lueur: true, prof: pr + 0.02 });
    },
    rendu() { return items.sort((a, b) => a[0] - b[0]).map(i => i[1]).join('\n'); }
  };
  return api;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
const DEFS = `<defs><filter id="lueur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="f"/><feMerge><feMergeNode in="f"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="lueur-forte" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="f"/><feMerge><feMergeNode in="f"/><feMergeNode in="f"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="halo"><stop offset="0" stop-color="#FFC873" stop-opacity=".45"/><stop offset="1" stop-color="#FFC873" stop-opacity="0"/></radialGradient>
<radialGradient id="halo-rouge"><stop offset="0" stop-color="#FF2D3D" stop-opacity=".5"/><stop offset="1" stop-color="#FF2D3D" stop-opacity="0"/></radialGradient></defs>`;
// Texte posé au sol (comme un nom de rue), le long de l'axe x.
Scene.texteSol = (sc, x, y, txt, { taille = 9, couleur = '#9EA3AB', prof = -500 } = {}) => {
  const [sx, sy] = sc.P(x, y, 0);
  sc.add(prof, `<text transform="matrix(${C30},${S30},${-C30},${S30},${sx},${sy})" font-family="VC Barlow, Barlow Condensed, system-ui" font-weight="700" font-size="${taille}" fill="${couleur}" letter-spacing=".08em">${txt}</text>`);
};

// Bâtiments métier des MAQUETTES : 1 bâtiment = 1 établissement. Couleur commerciale = néon du toit + bandeau d'enseigne.
const MUR = { haut: '#3A414D', gauche: '#2B313B', droite: '#20252D' };
function couleurSeg(seg) { return SEG[seg].c === '#0B0B0D' ? '#F4F2EF' : SEG[seg].c; } // le noir s'affiche avec son liseré blanc

function carrosserie(sc, x, y, seg, nom, { porteOuverte = true, echelle = 1 } = {}) {
  const k = echelle, w = 3.4 * k, d = 2.5 * k, h = 1.5 * k, sg = SEG[seg];
  sc.sol(x - 0.3, y - 0.3, w + 0.6, d + 1.4, '#1A1F27', x + y - 5, '#2A303A'); // parcelle + parking
  sc.boite(x, y, w, d, h, { ...MUR });
  sc.porte(x + 0.3 * k, y + d, 1.1 * k, 0.95 * k, { ouverte: porteOuverte });
  sc.porte(x + 1.6 * k, y + d, 1.1 * k, 0.95 * k, { ouverte: false });
  sc.fenetres('droite', x + w, y + 0.2 * k, d - 0.4 * k, 0.1, 1, 3, { graine: x * 7 + y });
  // Cabine de peinture sur le toit (signature carrosserie) + extracteurs.
  sc.boite(x + 1.9 * k, y + 0.3 * k, 1.2 * k, 1.1 * k, 0.6 * k, { haut: '#4A525F', gauche: '#353C47', droite: '#2A3039', z: h });
  sc.boite(x + 2.2 * k, y + 0.5 * k, 0.25 * k, 0.25 * k, 0.6 * k, { haut: '#6B7380', gauche: '#555D69', droite: '#474E59', z: h + 0.6 * k });
  sc.boite(x + 2.7 * k, y + 0.5 * k, 0.25 * k, 0.25 * k, 0.6 * k, { haut: '#6B7380', gauche: '#555D69', droite: '#474E59', z: h + 0.6 * k });
  sc.neon(x, y, w, d, h, sg.c === '#0B0B0D' ? '#0B0B0D' : sg.c, { lisere: !!sg.lisere, epais: 2.4 });
  // Bandeau d'enseigne en façade.
  sc.boite(x + 0.2 * k, y + d, w - 0.4 * k, 0.08, 0.36 * k, { haut: '#0D0F13', gauche: '#0D0F13', droite: '#0D0F13', z: h - 0.45 * k, prof: x + y + w + d + 0.5 });
  sc.texteFace('gauche', x + 0.35 * k, y + d + 0.08, h - 0.38 * k, 'CARROSSERIE', { taille: 10 * k, couleur: couleurSeg(seg), lueur: true, prof: x + y + w + d + 0.6 });
  return { x, y, w, d, h };
}
function mecanique(sc, x, y, seg, nom, { echelle = 1 } = {}) {
  const k = echelle, w = 3.0 * k, d = 2.3 * k, h = 1.3 * k, sg = SEG[seg];
  sc.sol(x - 0.3, y - 0.3, w + 0.6, d + 1.4, '#1A1F27', x + y - 5, '#2A303A');
  sc.boite(x, y, w, d, h, { haut: '#343B46', gauche: '#262C35', droite: '#1D2229' });
  sc.porte(x + 0.25 * k, y + d, 1.05 * k, 0.9 * k, { ouverte: true, interieur: '#9FD3FF' });
  sc.porte(x + 1.5 * k, y + d, 1.05 * k, 0.9 * k, { ouverte: true, interieur: '#FFC873' });
  sc.boite(x + 0.25 * k, y + d - 0.6 * k, 1.05 * k, 0.04, 0.05, { haut: '#F0952B', gauche: '#F0952B', droite: '#F0952B', z: 0.5 * k }); // pont élévateur
  // Pile de pneus.
  for (let i = 0; i < 3; i++) sc.boite(x + w + 0.15, y + d - 0.2 - i * 0.02, 0.32, 0.32, 0.12, { haut: '#111317', gauche: '#0B0C0E', droite: '#08090A', z: i * 0.13, prof: x + y + w + d + 1 });
  sc.neon(x, y, w, d, h, sg.c, { lisere: !!sg.lisere, epais: 2.4 });
  sc.boite(x + 0.2 * k, y + d, w - 0.4 * k, 0.08, 0.32 * k, { haut: '#0D0F13', gauche: '#0D0F13', droite: '#0D0F13', z: h - 0.4 * k, prof: x + y + w + d + 0.5 });
  sc.texteFace('gauche', x + 0.35 * k, y + d + 0.08, h - 0.35 * k, 'MÉCANIQUE', { taille: 10 * k, couleur: couleurSeg(seg), lueur: true, prof: x + y + w + d + 0.6 });
  return { x, y, w, d, h };
}
function horsCible(sc, x, y, nom) {
  const w = 2.6, d = 2, h = 1.1;
  sc.sol(x - 0.3, y - 0.3, w + 0.6, d + 1.2, '#181C23', x + y - 5, '#262B33');
  sc.boite(x, y, w, d, h, { haut: '#2C323B', gauche: '#22272F', droite: '#1A1E24' });
  sc.porte(x + 0.6, y + d, 1.2, 0.8, { ouverte: false });
  sc.neon(x, y, w, d, h, '#6E737B', { epais: 1.6 });
  sc.texteFace('gauche', x + 0.3, y + d + 0.02, h - 0.3, 'CONTRÔLE TECH.', { taille: 8, couleur: '#9EA3AB', prof: x + y + w + d + 0.6 });
  return { x, y, w, d, h };
}
// Étiquette flottante au-dessus d'un bâtiment (nom + pastille de couleur + alerte éventuelle).
function repere(sc, b, num, seg, { alerte = '' } = {}) { // marqueur numéroté (renvoie à la liste)
  const [cx, cy] = sc.P(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 1.3), c = SEG[seg];
  sc.add(9000 + cy / 1000, `<g><line x1="${cx}" y1="${cy + 10}" x2="${cx}" y2="${sc.P(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 0.2)[1]}" stroke="#4A5160" stroke-width="1"/>` +
    `<circle cx="${cx}" cy="${cy}" r="11" fill="${c.lisere ? '#0B0B0D' : c.c}" stroke="${c.lisere ? '#F4F2EF' : 'rgba(0,0,0,.5)'}" stroke-width="${c.lisere ? 2 : 1}"/>` +
    `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="VC Barlow, Barlow Condensed, system-ui" font-weight="800" font-size="12" fill="#fff">${num}</text>` +
    (alerte ? `<circle cx="${cx + 10}" cy="${cy - 9}" r="6" fill="#F0343F" stroke="#0A0B0D" stroke-width="1.5"/><text x="${cx + 10}" y="${cy - 6}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="8" fill="#fff">!</text>` : '') + `</g>`);
}
function etiquette(sc, b, nom, seg, { alerte = '', taille = 11, selection = false } = {}) {
  const [cx, cy] = sc.P(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 1.6);
  const L = Math.max(90, nom.length * taille * 0.52 + 30), c = SEG[seg].c;
  const pastille = SEG[seg].lisere ? `<circle cx="${cx - L / 2 + 12}" cy="${cy}" r="5" fill="#0B0B0D" stroke="#F4F2EF" stroke-width="1.6"/>` : `<circle cx="${cx - L / 2 + 12}" cy="${cy}" r="5" fill="${c}"/>`;
  sc.add(9000 + cy / 1000, `<g><line x1="${cx}" y1="${cy + 11}" x2="${cx}" y2="${sc.P(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 0.2)[1]}" stroke="${selection ? '#FF2D3D' : '#4A5160'}" stroke-width="1"/>` +
    `<rect x="${cx - L / 2}" y="${cy - 11}" width="${L}" height="22" rx="6" fill="rgba(10,11,13,.88)" stroke="${selection ? '#FF2D3D' : '#2E343E'}" stroke-width="${selection ? 1.6 : 1}"/>${pastille}` +
    `<text x="${cx - L / 2 + 22}" y="${cy + 4}" font-family="VC Barlow, Barlow Condensed, system-ui" font-weight="700" font-size="${taille}" fill="#F4F2EF" letter-spacing=".03em">${nom}</text>` +
    (alerte ? `<circle cx="${cx + L / 2 - 2}" cy="${cy - 10}" r="8" fill="#F0343F"/><text x="${cx + L / 2 - 2}" y="${cy - 6.5}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="10" fill="#fff">${alerte}</text>` : '') + `</g>`);
}
// L'agence ODICOLOR : entrepôt + showroom vitré + enseigne néon géante + quais de chargement + fourgons.
function agence(sc, x, y, k = 1, { sousTitre = 'AGENCE GOUSSAINVILLE' } = {}) {
  sc.sol(x - 1.2 * k, y - 1.2 * k, 9.4 * k, 8.4 * k, '#141821', x + y - 20, '#3A1015');
  // Halo rouge au sol.
  const [hx, hy] = sc.P(x + 3.5 * k, y + 3 * k, 0);
  sc.add(x + y - 19, `<ellipse cx="${hx}" cy="${hy}" rx="${190 * k}" ry="${95 * k}" fill="url(#halo-rouge)" opacity=".8"/>`);
  // Entrepôt.
  sc.boite(x, y, 7 * k, 4.2 * k, 2.2 * k, { haut: '#3B424E', gauche: '#2A3039', droite: '#1F242C' });
  for (let i = 0; i < 4; i++) sc.porte(x + (0.4 + i * 1.65) * k, y + 4.2 * k, 1.2 * k, 1.1 * k, { ouverte: i === 1, interieur: '#FFC873' });
  sc.fenetres('droite', x + 7 * k, y + 0.3 * k, 3.6 * k, 0.4, 1.6, 5, { couleur: '#FFD27A', allume: .8, graine: 3 });
  // Showroom vitré.
  sc.boite(x + 4.6 * k, y + 4.2 * k, 2.4 * k, 1.6 * k, 1.6 * k, { haut: '#454D5A', gauche: 'rgba(255,210,122,.35)', droite: 'rgba(255,210,122,.25)' });
  sc.texteFace('gauche', x + 4.75 * k, y + 5.8 * k, 1.05 * k, 'COMPTOIR PRO', { taille: 9 * k, couleur: '#FFD27A' });
  // Enseigne néon géante sur le toit (lisible de loin).
  const PE = x + y + 12 * k; // l'enseigne passe toujours devant le toit
  sc.boite(x + 0.3 * k, y + 1.6 * k, 6.4 * k, 0.25 * k, 1.7 * k, { haut: '#0D0F13', gauche: '#120709', droite: '#0D0F13', z: 2.2 * k, prof: PE });
  sc.neon(x + 0.3 * k, y + 1.6 * k, 6.4 * k, 0.25 * k, 3.9 * k, '#FF2D3D', { epais: 3, prof: PE + 0.01 });
  sc.texteFace('gauche', x + 0.55 * k, y + 1.85 * k, 2.95 * k, 'ODICOLOR', { taille: 30 * k, couleur: '#FF2D3D', lueur: true, poids: 800, prof: PE + 0.02 });
  sc.texteFace('gauche', x + 0.6 * k, y + 1.85 * k, 2.42 * k, sousTitre, { taille: 9 * k, couleur: '#F4F2EF', poids: 700, prof: PE + 0.03 });
  // Logo rond lumineux.
  const [lx, ly] = sc.P(x + 7.45 * k, y + 1.7 * k, 3.2 * k);
  sc.add(PE + 0.04, `<g filter="url(#lueur-forte)"><circle cx="${lx}" cy="${ly}" r="${15 * k}" fill="#D41F2B"/><circle cx="${lx}" cy="${ly}" r="${8.5 * k}" fill="#fff"/><circle cx="${lx}" cy="${ly}" r="${4.8 * k}" fill="#D41F2B"/></g>`);
  sc.neon(x, y, 7 * k, 4.2 * k, 2.2 * k, '#FF2D3D', { epais: 2.6 });
  // Fourgons de livraison.
  sc.vehicule(x + 0.5 * k, y + 5.0 * k, '#F2F2F0', { fourgon: true });
  sc.vehicule(x + 2.3 * k, y + 5.0 * k, '#F2F2F0', { fourgon: true });
  return { x, y, w: 7 * k, d: 4.2 * k, h: 2.2 * k };
}

// Garage MINIATURE (vues région / département) : la forme dit le métier, le néon dit le statut commercial.
// Carrosserie = atelier large + cabine de peinture sur le toit + porte chaude ; mécanique = baies bleues + pneus ; hors cible = gris.
function miniGarage(sc, x, y, g, k = 1) {
  const sg = SEG[g.seg], pr = x + y + 1.6 * k;
  if (g.type === 'c') {
    sc.boite(x, y, 1.0 * k, 0.75 * k, 0.5 * k, { haut: '#3D4450', gauche: '#2C323C', droite: '#21262E', prof: pr });
    sc.boite(x + 0.55 * k, y + 0.12 * k, 0.32 * k, 0.3 * k, 0.2 * k, { haut: '#59616E', gauche: '#424954', droite: '#363C46', z: 0.5 * k, prof: pr + 0.01 });
    sc.porte(x + 0.15 * k, y + 0.75 * k, 0.4 * k, 0.32 * k, { ouverte: true, prof: pr + 0.02 });
    sc.neon(x, y, 1.0 * k, 0.75 * k, 0.5 * k, sg.c, { epais: 1.8, lisere: !!sg.lisere, prof: pr + 0.03 });
  } else if (g.type === 'm') {
    sc.boite(x, y, 0.9 * k, 0.7 * k, 0.42 * k, { haut: '#363D48', gauche: '#272D36', droite: '#1E232A', prof: pr });
    sc.porte(x + 0.1 * k, y + 0.7 * k, 0.3 * k, 0.28 * k, { ouverte: true, interieur: '#9FD3FF', prof: pr + 0.02 });
    sc.porte(x + 0.48 * k, y + 0.7 * k, 0.3 * k, 0.28 * k, { ouverte: true, interieur: '#9FD3FF', prof: pr + 0.02 });
    sc.boite(x + 0.92 * k, y + 0.45 * k, 0.16 * k, 0.16 * k, 0.16 * k, { haut: '#0E0F12', gauche: '#08090A', droite: '#08090A', prof: pr + 0.03 });
    sc.neon(x, y, 0.9 * k, 0.7 * k, 0.42 * k, sg.c, { epais: 1.8, lisere: !!sg.lisere, prof: pr + 0.03 });
  } else {
    sc.boite(x, y, 0.8 * k, 0.6 * k, 0.32 * k, { haut: '#2C323B', gauche: '#22272F', droite: '#1A1E24', prof: pr });
    sc.neon(x, y, 0.8 * k, 0.6 * k, 0.32 * k, '#6E737B', { epais: 1.2, prof: pr + 0.03 });
  }
  if (g.alerte) { const [ax, ay] = sc.P(x + 0.45 * k, y + 0.35 * k, 1.05 * k);
    sc.add(8000 + ay / 1000, `<circle cx="${ax}" cy="${ay}" r="${4.5 + 1.5 * k}" fill="${g.alerte === '?' ? '#6E737B' : '#F0343F'}" stroke="#0A0B0D" stroke-width="1.2"/><text x="${ax}" y="${ay + 3}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="${6 + 1.5 * k}" fill="#fff">${g.alerte === '?' ? '?' : '!'}</text>`); }
}
// Petite agence (vue géographique) : même identité que la grande.
function panneauCommune(sc, x, y, z, txt, { taille = 10.5, prof } = {}) {
  const [cx, cy] = sc.P(x, y, z), L = txt.length * taille * 0.5 + 14;
  sc.add(prof ?? 8500 + cy / 1000, `<g><rect x="${cx - L / 2}" y="${cy - 10}" width="${L}" height="18" rx="4" fill="rgba(10,11,13,.85)" stroke="#3A414D"/><text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-family="VC Barlow, Barlow Condensed, system-ui" font-weight="700" font-size="${taille}" fill="#DADDE2" letter-spacing=".04em">${txt}</text></g>`);
}

// Établissement SIRENE non qualifié : bâtiment gris, sans néon commercial, contour pointillé (activité probable, jamais confirmée).
function aQualifier(sc, x, y, k = 1) {
  const pr = x + y + 1.6 * k;
  sc.boite(x, y, 0.95 * k, 0.7 * k, 0.4 * k, { haut: '#2A2F37', gauche: '#20242B', droite: '#191C22', prof: pr });
  sc.add(pr + 0.03, `<polyline points="${sc.pts([[x, y + 0.7 * k, 0.4 * k], [x + 0.95 * k, y + 0.7 * k, 0.4 * k], [x + 0.95 * k, y, 0.4 * k]])}" fill="none" stroke="#8A9099" stroke-width="1.1" stroke-dasharray="3 3"/>`);
}
// Indicateur d'inactivité (client dormant) : lune + durée, sans changer la couleur client.
function badgeDormant(sc, x, y, z, txt = 'inactif', k = 1) { // k < 1 : compense l'agrandissement d'une vue zoomée
  const [cx, cy] = sc.P(x, y, z);
  // Pastille discrète (retouche du 06/11) : petite, semi-transparente ; la couleur client du bâtiment reste l'information principale.
  sc.add(8800 + cy / 1000, `<g opacity=".9" transform="translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})"><rect x="${cx - 3}" y="${cy - 7.5}" width="${txt.length * 4.6 + 17}" height="14" rx="7" fill="rgba(42,36,64,.78)" stroke="rgba(139,127,214,.6)" stroke-width=".8"/><text x="${cx + 3}" y="${cy + 3}" font-family="system-ui" font-size="8.5" fill="#BDB4F2">☾ ${txt}</text></g>`);
}

// ---- Signatures distinctes (retouche du 06/11) ----
// À QUALIFIER (SIRENE, activité probable) : bâtiment gris clair, contour pointillé, panneau « ? À QUALIFIER ». Une piste, pas un refus.
function batAQualifier(sc, x, y) {
  sc.sol(x - 0.3, y - 0.3, 3.4, 3.5, '#171B21', x + y - 5, '#232830');
  sc.boite(x, y, 2.6, 2.0, 1.0, { haut: '#3A3F48', gauche: '#2C3038', droite: '#23272E' });
  sc.add(x + y + 5, `<polyline points="${sc.pts([[x, y + 2, 1], [x + 2.6, y + 2, 1], [x + 2.6, y, 1]])}" fill="none" stroke="#C9CDD3" stroke-width="1.4" stroke-dasharray="5 4"/>`);
  sc.porte(x + 0.5, y + 2, 1.2, 0.75, { ouverte: false });
  sc.texteFace('gauche', x + 0.25, y + 2.02, 0.8, '? À QUALIFIER', { taille: 8.5, couleur: '#C9CDD3', prof: x + y + 6 });
  return { x, y, w: 2.6, d: 2, h: 1 };
}
// HORS CIBLE (écarté) : bâtiment très sombre, toit hachuré, panneau « ⊘ HORS CIBLE ». Visible mais en retrait.
function batHorsCible(sc, x, y) {
  sc.sol(x - 0.3, y - 0.3, 3.2, 3.0, '#121418', x + y - 5, '#1C1F24');
  sc.boite(x, y, 2.4, 1.7, 0.8, { haut: '#1E2126', gauche: '#17191D', droite: '#121417' });
  let h = ''; for (let i = 0.3; i < 2.4; i += 0.35) h += `<polyline points="${sc.pts([[x + i, y, 0.8], [x + Math.max(0, i - 0.6), y + 1.7, 0.8]])}" stroke="#2E3238" stroke-width="1.2"/>`;
  sc.add(x + y + 5, h);
  sc.texteFace('gauche', x + 0.25, y + 1.72, 0.55, '⊘ HORS CIBLE', { taille: 8.5, couleur: '#7A8089', prof: x + y + 6 });
  return { x, y, w: 2.4, d: 1.7, h: 0.8 };
}
// Repère numéroté avec symbole de qualification (? à qualifier, ⊘ hors cible).
function repereQualif(sc, b, num, sorte) {
  const [cx, cy] = sc.P(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 1.3);
  const fond = sorte === 'q' ? '#5A606A' : '#26292F', bord = sorte === 'q' ? '#C9CDD3' : '#5A606A', sym = sorte === 'q' ? '?' : '⊘';
  sc.add(9000 + cy / 1000, `<g><line x1="${cx}" y1="${cy + 10}" x2="${cx}" y2="${sc.P(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 0.2)[1]}" stroke="#4A5160"/>` +
    `<circle cx="${cx}" cy="${cy}" r="11" fill="${fond}" stroke="${bord}" stroke-width="1.5" ${sorte === 'q' ? 'stroke-dasharray="3 2"' : ''}/>` +
    `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="VC Barlow, Barlow Condensed, system-ui" font-weight="800" font-size="12" fill="#fff">${num}</text>` +
    `<circle cx="${cx + 10}" cy="${cy - 9}" r="6.5" fill="#0A0B0D" stroke="${bord}"/><text x="${cx + 10}" y="${cy - 5.8}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="8.5" fill="${bord}">${sym}</text></g>`);
}
// Tour de briques LEGO : 1 brique par catégorie, hauteur = nombre d'établissements (vue département, agrégée).
function tourCommune(sc, x, y, cats) {
  let z = 0.25;
  for (const [couleur, n, lisere, pointille] of cats) {
    if (!n) continue;
    const h = 0.3 * n, haut = couleur === '#0B0B0D' ? '#1A1A1E' : couleur;
    sc.boite(x, y, 1.2, 1.2, h, { haut, gauche: shade(haut, -.28), droite: shade(haut, -.45), z, prof: x + y + 2.4 + z * 0.01 });
    if (lisere) sc.neon(x, y, 1.2, 1.2, z + h, '#F4F2EF', { epais: 1.2, prof: x + y + 2.4 + z * 0.01 + 0.005 });
    if (pointille) sc.add(x + y + 2.4 + z * 0.01 + 0.006, `<polyline points="${sc.pts([[x, y + 1.2, z + h], [x + 1.2, y + 1.2, z + h], [x + 1.2, y, z + h]])}" fill="none" stroke="#C9CDD3" stroke-width="1" stroke-dasharray="3 2"/>`);
    z += h;
  }
  // Tenons LEGO sur la brique du haut.
  let t = ''; for (const [a, b] of [[0.3, 0.3], [0.9, 0.3], [0.3, 0.9], [0.9, 0.9]]) { const [cx, cy] = sc.P(x + a, y + b, z); t += `<ellipse cx="${cx}" cy="${cy}" rx="${sc.S ? 3 : 3.2}" ry="1.9" fill="rgba(255,255,255,.18)"/>`; }
  sc.add(x + y + 2.5 + z, t);
  return z;
}

  // Catégories hors couleurs commerciales (référence : gris = à qualifier, très sombre = hors cible).
  SEG['a-qualifier'] = { c: '#6E737B', l: 'À qualifier (SIRENE, activité probable)' };
  SEG['hors-cible'] = { c: '#3F444C', l: 'Hors cible' };
  racine.DessinIso = Object.freeze({ Scene, SEG, DEFS, shade, agence, carrosserie, mecanique, miniGarage, batAQualifier, batHorsCible,
    repere, repereQualif, etiquette, badgeDormant, tourCommune, panneauCommune, C30, S30 });
})(typeof self !== 'undefined' ? self : this);
