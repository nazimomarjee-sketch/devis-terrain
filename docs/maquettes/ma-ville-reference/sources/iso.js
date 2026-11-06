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
    texteFace(face, x, y, z, txt, { taille = 12, couleur = '#F4F2EF', poids = 700, police = 'Barlow Condensed', lueur = false, prof, ancre = 'start' } = {}) {
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
  sc.add(prof, `<text transform="matrix(${C30},${S30},${-C30},${S30},${sx},${sy})" font-family="Barlow Condensed" font-weight="700" font-size="${taille}" fill="${couleur}" letter-spacing=".08em">${txt}</text>`);
};
