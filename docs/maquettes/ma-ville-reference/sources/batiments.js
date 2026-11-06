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
    `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="12" fill="#fff">${num}</text>` +
    (alerte ? `<circle cx="${cx + 10}" cy="${cy - 9}" r="6" fill="#F0343F" stroke="#0A0B0D" stroke-width="1.5"/><text x="${cx + 10}" y="${cy - 6}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="8" fill="#fff">!</text>` : '') + `</g>`);
}
function etiquette(sc, b, nom, seg, { alerte = '', taille = 11, selection = false } = {}) {
  const [cx, cy] = sc.P(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 1.6);
  const L = Math.max(90, nom.length * taille * 0.52 + 30), c = SEG[seg].c;
  const pastille = SEG[seg].lisere ? `<circle cx="${cx - L / 2 + 12}" cy="${cy}" r="5" fill="#0B0B0D" stroke="#F4F2EF" stroke-width="1.6"/>` : `<circle cx="${cx - L / 2 + 12}" cy="${cy}" r="5" fill="${c}"/>`;
  sc.add(9000 + cy / 1000, `<g><line x1="${cx}" y1="${cy + 11}" x2="${cx}" y2="${sc.P(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 0.2)[1]}" stroke="${selection ? '#FF2D3D' : '#4A5160'}" stroke-width="1"/>` +
    `<rect x="${cx - L / 2}" y="${cy - 11}" width="${L}" height="22" rx="6" fill="rgba(10,11,13,.88)" stroke="${selection ? '#FF2D3D' : '#2E343E'}" stroke-width="${selection ? 1.6 : 1}"/>${pastille}` +
    `<text x="${cx - L / 2 + 22}" y="${cy + 4}" font-family="Barlow Condensed" font-weight="700" font-size="${taille}" fill="#F4F2EF" letter-spacing=".03em">${nom}</text>` +
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
  sc.add(prof ?? 8500 + cy / 1000, `<g><rect x="${cx - L / 2}" y="${cy - 10}" width="${L}" height="18" rx="4" fill="rgba(10,11,13,.85)" stroke="#3A414D"/><text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="${taille}" fill="#DADDE2" letter-spacing=".04em">${txt}</text></g>`);
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
    `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="12" fill="#fff">${num}</text>` +
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
