/* ODICOLOR 2.0 — Ma Ville, étape 2 : VUE COMMUNE (dessin + liste + aperçu). Données fictives à ce stade.
   Entrée : une commune construite par bureau/ville/modele-commune.js. Lecture seule : rien n'est écrit nulle part.
   Conforme à la référence figée (docs/maquettes/ma-ville-reference/) :
   - 1 bâtiment = 1 établissement ; tous les établissements sont dans la liste, mêmes numéros que sur la scène ;
   - au plus 40 bâtiments dessinés ; au-delà, un îlot « +N » et la liste complète ;
   - au plus 5 personnages ; agence ODICOLOR seulement à Goussainville, emplacement symbolique ;
   - à qualifier (gris pointillé, « ? ») ≠ hors cible (sombre hachuré, « ⊘ ») ; dormant = petite pastille, couleur client conservée ;
   - mentions « plan schématique » (et « données fictives » si demandé) ; aucune rubrique vide (pointage, obstacles : rien affiché).
   Gestes : 1er clic / toucher = aperçu ; 2e clic, Entrée ou bouton = fiche (rappel options.ouvrirFiche) ; Échap = fermer.
   Étape 3 : sélecteur EN COMPTE | SANS COMPTE | À VÉRIFIER | TOUT (options.compte), filtre indépendant des 4 couleurs :
   la scène et la liste ne montrent que la sélection, les numéros restent ceux de la liste complète.
   Lot C : sélecteur de périmètre « Mes garages | Marché à prospecter | Tous » (options.portee), indépendant du compte et des couleurs ;
   statut du téléphone et situation du compte EBP affichés séparément ; sources et dates (options.sources, options.etiquette). */
(function (racine) {
  'use strict';
  const AGENCE_INSEE = '95280'; // Goussainville
  const MAX_BATIMENTS = 40, MAX_PERSONNAGES = 5, LOT = [6.55, 7.6], COLONNES = 4, S = 19;
  const CAT = { client: 'Client', prospect: 'Prospect', a_qualifier: 'À qualifier', hors_cible: 'Hors cible' };
  const METIER = { carrosserie: 'carrosserie', mecanique: 'mécanique' };
  const ACHAT = { actif: '', reachat: 'réachat à vérifier', potentiellement_dormant: 'potentiellement dormant', inactif: 'inactif', a_verifier: 'achats à vérifier' };
  const COMPTE = { en_compte: 'En compte', sans_compte: 'Sans compte', a_verifier: 'À vérifier', tous: 'Tout' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fr = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';

  function sorte(e) { return e.categorie === 'a_qualifier' ? 'q' : e.categorie === 'hors_cible' ? 'x' : (e.activite && e.activite.valeur === 'mecanique') ? 'm' : (e.activite && e.activite.valeur === 'carrosserie') ? 'c' : 'g'; }
  function couleurRepere(e) {
    if (e.categorie === 'a_qualifier') return '#5A606A';
    if (e.categorie === 'hors_cible') return '#26292F';
    return e.segment ? racine.DessinIso.SEG[e.segment].c : '#8A9099'; // métier inconnu : neutre, jamais deviné
  }
  function qualif(e) {
    if (e.categorie === 'a_qualifier') return ['vc-b-sir', e.qualification === 'a_verifier' ? '? À vérifier' : '? À qualifier'];
    if (e.categorie === 'hors_cible') return ['vc-b-inc', '⊘ Hors cible'];
    return e.qualification === 'a_verifier' ? ['vc-b-sir', 'À vérifier'] : ['vc-b-ebp', 'Confirmé'];
  }
  function sousTitre(e) {
    const p = [CAT[e.categorie] + (e.activite ? ' ' + (METIER[e.activite.valeur] || '') + (e.activite.probable ? ' (probable)' : '') : ' · métier inconnu')];
    if (e.achat && ACHAT[e.achat.niveau]) p.push(ACHAT[e.achat.niveau] + (e.achat.joursDepuis != null ? ' · ' + e.achat.joursDepuis + ' j' : ''));
    if (e.alertes.some(a => a.type === 'compte_bloque')) p.push('compte bloqué');
    if (e.etapeTerrain) p.push(e.etapeTerrain.valeur);
    return p.join(' · ');
  }

  // Bâtiment générique (client ou prospect dont le métier est inconnu) : neutre, panneau « MÉTIER ? ».
  function batGenerique(D, sc, x, y) {
    sc.sol(x - 0.3, y - 0.3, 3.3, 3.2, '#171B21', x + y - 5, '#232830');
    sc.boite(x, y, 2.7, 2.1, 1.1, { haut: '#343B46', gauche: '#262C35', droite: '#1D2229' });
    sc.porte(x + 0.6, y + 2.1, 1.3, 0.8, { ouverte: false });
    sc.neon(x, y, 2.7, 2.1, 1.1, '#9EA3AB', { epais: 1.6 });
    sc.texteFace('gauche', x + 0.3, y + 2.12, 0.85, 'MÉTIER ?', { taille: 8.5, couleur: '#C9CDD3', prof: x + y + 6 });
    return { x, y, w: 2.7, d: 2.1, h: 1.1 };
  }

  // ---------- Scène SVG ----------
  function scene(commune, opts) {
    const D = racine.DessinIso, l = commune.etablissements, agence = commune.insee === AGENCE_INSEE;
    const dessines = l.length > MAX_BATIMENTS ? l.slice(0, MAX_BATIMENTS - 1) : l, reste = l.length - dessines.length;
    const nbLots = dessines.length + (agence ? 2 : 0) + (reste ? 1 : 0), rangees = Math.max(1, Math.ceil(nbLots / COLONNES));
    const largeur = COLONNES * LOT[0] + 1, profondeur = rangees * LOT[1] + 0.6;
    const tmp = D.Scene(S, 0, 0), pts = [[-1, -1.5], [largeur, -1.5], [-1, profondeur], [largeur, profondeur]].map(p => tmp.P(p[0], p[1], 0));
    const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1])) - 120, maxY = Math.max(...pts.map(p => p[1])) + 30;
    const sc = D.Scene(S, -minX + 20, -minY);
    sc.sol(-1, -1.5, largeur + 1, profondeur + 1.5, '#151A22', -5000, '#1E232B');
    for (let r = 0; r <= rangees; r++) sc.route(-1, -0.2 + r * LOT[1] - 1.7, largeur + 1, 1.5, 'x');
    for (let c = 0; c <= COLONNES; c++) sc.route(-1 + c * LOT[0], -1.5, 1.1, profondeur + 1.5, 'y', -890);
    const lots = []; for (let r = 0; r < rangees; r++) for (let c = 0; c < COLONNES; c++) lots.push([c, r]);
    let i0 = 0;
    if (agence) { D.agence(sc, 2.6, 0.3, 0.86, { sousTitre: 'AGENCE GOUSSAINVILLE' }); i0 = 2; }
    const cibles = [], plus = [];
    let persos = 0;
    dessines.forEach((e, k) => {
      const [c, r] = lots[i0 + k], x = 0.75 + c * LOT[0], y = -0.2 + r * LOT[1], s = sorte(e);
      const b = s === 'c' ? D.carrosserie(sc, x, y, e.segment || 'prospect-carrosserie', '', { porteOuverte: k % 2 === 0 })
        : s === 'm' ? D.mecanique(sc, x, y, e.segment || 'prospect-mecanique', '')
        : s === 'q' ? D.batAQualifier(sc, x, y) : s === 'x' ? D.batHorsCible(sc, x + 0.3, y + 0.3) : batGenerique(D, sc, x, y);
      if ((s === 'c' || s === 'm') && persos < MAX_PERSONNAGES) { persos++; sc.figurine(x + b.w + 0.3, y + b.d + 0.55, e.segment, { echelle: .8, tenue: '#E9EAEC' }); sc.vehicule(x + 0.2, y + b.d + 0.35, ['#B8312F', '#C9CED6', '#3E86F0', '#2B2F36'][k % 4]); }
      if (s === 'q' || s === 'x') D.repereQualif(sc, b, e.numero, s);
      else if (e.segment) D.repere(sc, b, e.numero, e.segment);
      else D.repere(sc, b, e.numero, 'a-qualifier'); // métier inconnu : repère gris plein, SANS « ? » (le « ? » est réservé aux établissements à qualifier)
      if (e.dormant) D.badgeDormant(sc, b.x + b.w + 0.15, b.y + b.d * 0.6, b.h + 0.1, e.dormant.niveau === 'inactif' ? 'inactif' : (e.dormant.depuisMois >= 1 ? e.dormant.depuisMois + ' mois' : e.dormant.depuisJours + ' j'));
      const [px, py] = sc.P(b.x + b.w * 0.5, b.y + b.d * 0.5, b.h + 1.3);
      if (e.alertes.length) sc.add(9100 + py / 1000, `<circle cx="${px - 12}" cy="${py - 9}" r="6.5" fill="#F0343F" stroke="#0A0B0D" stroke-width="1.5"/><text x="${px - 12}" y="${py - 5.5}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="9" fill="#fff">!</text>`);
      else if (e.achat && e.achat.niveau === 'reachat') sc.add(9100 + py / 1000, `<circle cx="${px - 12}" cy="${py - 9}" r="6.5" fill="#E8A33B" stroke="#0A0B0D" stroke-width="1.5"/><text x="${px - 12}" y="${py - 5.5}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="8.5" fill="#1A1206">↻</text>`);
      // Zone cliquable / touchable : sol du lot + repère (au moins 44 px à l'échelle d'origine).
      const zone = sc.pts([[x - 0.4, y - 0.4, 0], [x + b.w + 0.6, y - 0.4, 0], [x + b.w + 0.6, y + b.d + 1.2, 0], [x - 0.4, y + b.d + 1.2, 0]]);
      cibles.push(`<g class="vc-cible" data-uid="${esc(e.uid)}" data-num="${e.numero}"><polygon points="${zone}" fill="transparent"/><circle cx="${px}" cy="${py}" r="22" fill="transparent"/></g>`);
      plus.push({ uid: e.uid, px, py });
    });
    if (reste) {
      const [c, r] = lots[i0 + dessines.length], x = 0.75 + c * LOT[0], y = -0.2 + r * LOT[1];
      for (let k = 0; k < 6; k++) sc.boite(x + (k % 3) * 1.1, y + Math.floor(k / 3) * 1.1, 0.9, 0.8, 0.35 + (k % 2) * 0.2, { haut: '#3A414D', gauche: '#2A3039', droite: '#1F242C' });
      const [cx, cy] = sc.P(x + 1.6, y + 1, 1.8);
      sc.add(9500, `<g class="vc-ilot"><rect x="${cx - 46}" y="${cy - 14}" width="92" height="28" rx="14" fill="rgba(10,11,13,.92)" stroke="#C9CDD3"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="VC Barlow, Barlow Condensed, system-ui" font-weight="800" font-size="15" fill="#fff">+${reste} · liste</text></g>`);
    }
    for (let c = 0; c <= COLONNES; c++) { sc.lampe(-0.3 + c * LOT[0], 5.7); }
    const w = maxX - minX + 40, h = maxY - minY;
    return { svg: `<svg class="vc-svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" role="img" aria-label="Plan schématique de ${esc(commune.commune)}">${D.DEFS}${sc.rendu()}<g class="vc-cibles">${cibles.join('')}</g><g class="vc-selection"></g></svg>`,
      positions: plus, dessines: dessines.length, reste, personnages: persos, agence };
  }

  // Sélecteur commercial (aussi utilisé par la vue Département du Bureau). k = { total, en_compte, sans_compte, a_verifier, enCompteDormants, enCompteBloques, sansCompteHorsCible }.
  function selecteur(k, actif = 'tous') {
    const det = { en_compte: [k.enCompteDormants && k.enCompteDormants + ' dormant' + (k.enCompteDormants > 1 ? 's' : ''), k.enCompteBloques && k.enCompteBloques + ' bloqué' + (k.enCompteBloques > 1 ? 's' : '')],
      sans_compte: [k.sansCompteHorsCible && k.sansCompteHorsCible + ' hors cible'], a_verifier: ['jamais classés sans compte'], tous: [] };
    return `<div class="vc-compte" role="group" aria-label="Compte ODICOLOR">${['en_compte', 'sans_compte', 'a_verifier', 'tous'].map(c =>
      `<button type="button" class="vc-cpt vc-cpt-${c}" data-compte="${c}" aria-pressed="${c === actif}"><b>${COMPTE[c]}</b><span class="vc-cpt-n">${c === 'tous' ? k.total : k[c]}</span>${det[c].filter(Boolean).length ? `<small>${det[c].filter(Boolean).join(' · ')}</small>` : ''}</button>`).join('')}</div>`;
  }
  const garde = c => COMPTE[c] ? c : 'tous';
  const PORTEE = { mes_garages: 'Mes garages', marche: 'Marché à prospecter', tous: 'Tous' };
  const gardeP = c => PORTEE[c] ? c : 'tous';
  function selecteurPortee(n, actif) {
    return `<div class="vc-portee" role="group" aria-label="Périmètre : mes garages ou marché à prospecter">${['mes_garages', 'marche', 'tous'].map(c =>
      `<button type="button" class="vc-por vc-por-${c}" data-portee="${c}" aria-pressed="${c === actif}"><b>${PORTEE[c]}</b><span>${n[c]}</span></button>`).join('')}</div>`;
  }
  const TEL = { client: 'client', prospect: 'prospect' };
  // Deux informations DISTINCTES : ce que le téléphone déclare, et la situation du compte dans EBP (jamais fusionnées).
  function deux(e) {
    if (e.portee === 'marche') return 'Annuaire officiel seul : jamais travaillé, à prospecter';
    const t = e.statutTelephone, tel = !t ? 'absent du téléphone' : (t.valeur ? TEL[t.valeur] : 'statut non renseigné');
    return 'Téléphone : ' + tel + (t && t.date ? ' (' + fr(t.date) + ')' : '') + ' · Compte EBP : ' + COMPTE[e.compte ? e.compte.statut : 'a_verifier'].toLowerCase();
  }

  // ---------- Montage dans la page ----------
  function monter(conteneur, communeComplete, opts = {}) {
    const ouvrir = typeof opts.ouvrirFiche === 'function' ? opts.ouvrirFiche : () => {};
    const filtre = garde(opts.compte), portee = gardeP(opts.portee);
    const toutes = communeComplete.etablissements, l0 = portee === 'tous' ? toutes : toutes.filter(e => e.portee === portee);
    const k = racine.ModeleCommune.comptesDe(l0); // compteurs du périmètre choisi : chaque établissement compté une seule fois
    const l = l0.filter(e => filtre === 'tous' || (e.compte ? e.compte.statut : 'a_verifier') === filtre);
    const commune = Object.assign({}, communeComplete, { etablissements: l });
    const sc = scene(commune, opts);
    const cptK = Object.assign({ total: k.total }, k.compte);
    const nPortee = { mes_garages: toutes.filter(e => e.portee === 'mes_garages').length, marche: toutes.filter(e => e.portee === 'marche').length, tous: toutes.length };
    const parUid = new Map(l.map(e => [e.uid, e])), pos = new Map(sc.positions.map(p => [p.uid, p]));
    const sources = e => [...new Set(e.sources.map(s => s.source))].map(s => { const d = e.sources.find(x => x.source === s).date; return `<span class="vc-b vc-src" title="${esc(s + (d ? ' · ' + fr(d) : ''))}">${esc(s)}</span>`; }).join('');
    const fil = (opts.fil || []).map(f => f.href ? `<a href="${esc(f.href)}">${esc(f.libelle)}</a>` : `<span>${esc(f.libelle)}</span>`).join(' › ');
    const badgeCompte = e => { const c = e.compte ? e.compte.statut : 'a_verifier'; return `<span class="vc-b vc-bc-${c}" title="${esc(e.compte ? e.compte.motif : '')}">${COMPTE[c]}</span>`; };
    conteneur.classList.add('vc');
    conteneur.innerHTML = `
      <div class="vc-carte">
        <div class="vc-mention">🗺 Plan schématique de la commune : emplacements non réels${sc.agence ? ' · agence : emplacement symbolique' : ''}</div>
        ${opts.fictif ? '<div class="vc-fictif">DONNÉES FICTIVES</div>' : opts.etiquette ? `<div class="vc-fictif vc-reel">${esc(opts.etiquette)}</div>` : ''}
        <div class="vc-zoom"><button type="button" data-zoom="1" aria-label="Zoomer">＋</button><button type="button" data-zoom="-1" aria-label="Dézoomer">－</button></div>
        <div class="vc-defile">${sc.svg}</div>
        <div class="vc-apercu" hidden role="dialog" aria-live="polite"></div>
      </div>
      <aside class="vc-panneau">
        ${fil ? `<nav class="vc-fil" aria-label="Où je suis">${fil}</nav>` : ''}
        ${selecteurPortee(nPortee, portee)}
        ${selecteur(cptK, filtre)}
        <div class="vc-tete"><h2>${esc(commune.commune)} <small>· ${commune.dep}</small></h2>
          <p>${k.total} établissement${k.total > 1 ? 's' : ''} · tous listés${sc.reste ? ' · ' + sc.dessines + ' dessinés' : ''}</p>
          ${opts.sources && opts.sources.length ? `<p class="vc-src-ligne">Sources : ${opts.sources.map(esc).join(' · ')}</p>` : ''}
          <div class="vc-comptes"><span><b>${k.clients}</b> clients${k.dontDormants ? ' · dont ' + k.dontDormants + ' dormant' + (k.dontDormants > 1 ? 's' : '') + '/inactif' + (k.dontDormants > 1 ? 's' : '') : ''}</span>
          <span><b>${k.prospects}</b> prospects</span><span><b>${k.aQualifier}</b> ? à qualifier</span><span><b>${k.horsCible}</b> ⊘ hors cible</span></div>
          ${opts.ca ? `<div class="vc-ca"><span>${esc(opts.ca.libelle)}</span><b>${esc(opts.ca.commune)}</b><small>${esc(opts.ca.fraicheur)}</small></div>` : ''}
          ${filtre !== 'tous' ? `<p class="vc-filtre-etat">Sélection <b>${COMPTE[filtre].toUpperCase()}</b> : ${l.length} sur ${k.total} affiché${l.length > 1 ? 's' : ''}${l.length ? '' : ' · aucun établissement dans cette sélection'}</p>` : ''}
          ${l.length > 12 ? `<input type="search" class="vc-chercher" placeholder="Chercher dans la liste (nom, n°, SIRET)" aria-label="Chercher dans la liste">` : ''}</div>
        <ol class="vc-liste">${l.map(e => { const q = qualif(e);
          return `<li><button type="button" class="vc-ligne" data-uid="${esc(e.uid)}" data-num="${e.numero}">
            <span class="vc-num vc-num-${sorte(e) === 'g' ? 'n' : sorte(e)}" style="background:${couleurRepere(e)}${e.segment === 'client-mecanique' ? ';box-shadow:0 0 0 1.6px #F4F2EF' : ''}">${e.numero}</span>
            <span class="vc-nom" title="${esc(e.nom.valeur)}">${esc(e.nom.valeur)}${e.avertissements.length ? ` <span class="vc-avert" title="${esc(e.avertissements.join(' · '))}">⚠</span>` : ''}</span>
            <span class="vc-badges">${sources(e)}<span class="vc-b ${q[0]}">${q[1]}</span>${badgeCompte(e)}${e.portee === 'marche' ? '<span class="vc-b vc-b-marche">Marché à prospecter</span>' : ''}</span>
            <span class="vc-sous">${esc(sousTitre(e))}</span><span class="vc-sous vc-deux">${esc(deux(e))}</span></button></li>`; }).join('')}</ol>
        <p class="vc-aucun" hidden>Aucun établissement ne correspond.</p>
      </aside>`;
    const svg = conteneur.querySelector('.vc-svg'), ap = conteneur.querySelector('.vc-apercu'), sel = conteneur.querySelector('.vc-selection');
    let choisi = null, zoom = 1;
    function fermer() { choisi = null; ap.hidden = true; sel.innerHTML = ''; conteneur.querySelectorAll('.vc-ligne[aria-current]').forEach(b => b.removeAttribute('aria-current')); }
    function choisir(uid) {
      if (choisi === uid) { ouvrir(uid, parUid.get(uid)); return; } // 2e geste : fiche
      const e = parUid.get(uid); if (!e) return; choisi = uid;
      conteneur.querySelectorAll('.vc-ligne').forEach(b => b.toggleAttribute('aria-current', b.dataset.uid === uid));
      const p = pos.get(uid);
      sel.innerHTML = p ? `<circle cx="${p.px}" cy="${p.py}" r="17" fill="none" stroke="#FF2D3D" stroke-width="2.5" filter="url(#lueur)"/>` : '';
      const q = qualif(e);
      ap.innerHTML = `<h4>${e.numero} · ${esc(e.nom.valeur)}</h4><p>${esc(sousTitre(e))}</p>
        <p class="vc-ap-sep"><span class="vc-b ${e.portee === 'marche' ? 'vc-b-marche' : 'vc-b-ebp'}">${PORTEE[e.portee]}</span> ${esc(deux(e))}</p>
        <p class="vc-ap-src">${sources(e)} <span class="vc-b ${q[0]}">${q[1]}</span>${p ? '' : ' <span class="vc-b vc-b-inc">dans la liste (îlot)</span>'}</p>
        <p class="vc-ap-compte">${badgeCompte(e)} ${esc(e.compte ? e.compte.motif : '')}${e.compte && e.compte.source ? ` <span class="vc-b vc-src">${esc(e.compte.source)}${e.compte.date ? ' · ' + fr(e.compte.date) : ''}</span>` : ''}</p>
        ${opts.ca ? `<p class="vc-ap-ca">${esc(opts.ca.libelle)} : <b>${esc(opts.ca.etablissement(e))}</b></p>` : ''}
        ${e.achat && e.achat.motif && e.achat.niveau !== 'actif' ? `<p class="vc-ap-motif">${esc(e.achat.motif)} <span class="vc-b vc-src">${esc(e.achat.source)}${e.achat.date ? ' · ' + fr(e.achat.date) : ''}</span></p>` : ''}
        <div class="vc-ap-btns"><button type="button" class="vc-ouvrir">Ouvrir la fiche ›</button><button type="button" class="vc-fermer">Fermer</button></div>`;
      ap.hidden = false;
      ap.querySelector('.vc-ouvrir').onclick = () => ouvrir(uid, e);
      ap.querySelector('.vc-fermer').onclick = fermer;
    }
    conteneur.addEventListener('click', ev => {
      const z = ev.target.closest('[data-zoom]');
      if (z) { zoom = Math.min(3, Math.max(1, zoom + Number(z.dataset.zoom) * 0.5)); svg.style.width = (zoom * 100) + '%'; return; }
      const b = ev.target.closest('[data-compte]');
      if (b) { const v = garde(b.dataset.compte); if (typeof opts.surCompte === 'function') opts.surCompte(v); else conteneur._vc = monter(conteneur, communeComplete, Object.assign({}, opts, { compte: v, choisir: null })); return; }
      const bp = ev.target.closest('[data-portee]');
      if (bp) { const v = gardeP(bp.dataset.portee); if (typeof opts.surPortee === 'function') opts.surPortee(v); else conteneur._vc = monter(conteneur, communeComplete, Object.assign({}, opts, { portee: v, choisir: null })); return; }
      const c = ev.target.closest('.vc-cible, .vc-ligne'); if (c) choisir(c.dataset.uid);
    });
    const champ = conteneur.querySelector('.vc-chercher');
    if (champ) champ.addEventListener('input', () => {
      const q = champ.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); let n = 0;
      conteneur.querySelectorAll('.vc-liste li').forEach(li => { const e = parUid.get(li.firstElementChild.dataset.uid);
        const t = (e.numero + ' ' + e.nom.valeur + ' ' + (e.siret ? e.siret.valeur : '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        li.hidden = !!q && !t.includes(q); if (!li.hidden) n++; });
      conteneur.querySelector('.vc-aucun').hidden = n > 0;
    });
    // Échap ferme l'aperçu où que soit le focus (après un clic sur la scène, le focus n'est pas dans la vue).
    const doc = conteneur.ownerDocument;
    if (conteneur._vcEchap) doc.removeEventListener('keydown', conteneur._vcEchap);
    conteneur._vcEchap = ev => { if (ev.key === 'Escape' && choisi && !(ev.target.closest && ev.target.closest('[aria-modal="true"]'))) fermer(); }; // une fiche ouverte par-dessus se ferme seule
    doc.addEventListener('keydown', conteneur._vcEchap);
    const vue = { fermer, choisir, compte: filtre, portee, stats: { dessines: sc.dessines, reste: sc.reste, personnages: sc.personnages, agence: sc.agence, affiches: l.length } };
    conteneur._vc = vue;
    if (opts.choisir && parUid.has(opts.choisir)) { choisir(opts.choisir); const li = conteneur.querySelector(`.vc-ligne[data-uid="${CSS.escape(opts.choisir)}"]`); if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' }); }
    return vue;
  }

  const api = { monter, selecteur, selecteurPortee, COMPTE, PORTEE, AGENCE_INSEE, MAX_BATIMENTS, MAX_PERSONNAGES };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.VueCommune = api;
})(typeof self !== 'undefined' ? self : this);
