/* ODICOLOR 2.0 — Lot 4 : STUDIO MARKETING (Bureau). Logique pure, testable sous Node. Aucun envoi, aucun réseau.
   Règles :
   - marques actives : Carsystem, Abel Auto, Sifa. Roberlo n'est plus une gamme active (14/11/2026) : ses contenus anciens restent
     dans l'historique (archivés), mais aucun nouveau contenu, aucune proposition, aucun export ne la reprend ;
   - JAMAIS de prix, remise, disponibilité ou caractéristique inventés : un prix ou une remise n'est accepté qu'avec la source
     des conditions (ex. « conditions validées par la direction le … ») ; une caractéristique produit exige sa source officielle ;
   - un visuel n'utilise une image fournie que si l'utilisateur confirme en détenir les droits ;
   - un scénario de vidéo reste un SCÉNARIO : il est toujours étiqueté « aucune vidéo générée » ;
   - validation humaine avant toute diffusion, valable pour la VERSION EXACTE validée (empreinte) : toute modification
     ultérieure remet le contenu « à vérifier » ;
   - les propositions par garage n'utilisent que des contenus validés et des données déjà chargées dans le Bureau. */
(function (racine) {
  'use strict';
  const MARQUES = [
    { id: 'carsystem', nom: 'Carsystem', active: true, docs: [{ titre: 'Catalogue de produits Carsystem 2025 (officiel)', url: 'https://www.carsystem.org/fileadmin/CS-Kataloge-2025/Carsystem-catalogue-de-produits-2025.pdf' }] },
    { id: 'abel', nom: 'Abel Auto', active: true, docs: [] },
    { id: 'sifa', nom: 'Sifa', active: true, docs: [] },
    { id: 'roberlo', nom: 'Roberlo', active: false, motif: 'Gamme non active depuis le 14/11/2026 : historique conservé, plus de nouvelle action commerciale.' }
  ];
  const TYPES = { promotion: 'Promotion', visuel: 'Visuel', message: 'Message WhatsApp', scenario: 'Scénario de vidéo' };
  const CIBLES = { client: 'Clients actifs', prospect: 'Prospects', dormant: 'Garages dormants' };
  const MENTION_SCENARIO = 'Scénario de vidéo — aucune vidéo générée';
  const marque = id => MARQUES.find(m => m.id === id) || null;
  const t = (v, n = 500) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

  // Empreinte stable du CONTENU (hors statut, validation, historique) : FNV-1a 32 bits sur un JSON trié.
  function empreinte(c) {
    const { id, statut, validation, historique, maj, ...fond } = c || {}; // l’identifiant n’est pas du contenu
    const json = JSON.stringify(fond, Object.keys(fond).sort());
    let h = 0x811c9dc5; for (const ch of json) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  function normaliser(e = {}) {
    const type = TYPES[e.type] ? e.type : 'message';
    const c = { id: t(e.id, 40), type, marque: t(e.marque, 20), titre: t(e.titre, 120), texte: t(e.texte, 1500),
      produit: { ref: t(e.produit && e.produit.ref, 40), nom: t(e.produit && e.produit.nom, 120), caracteristiques: t(e.produit && e.produit.caracteristiques, 400), source: t(e.produit && e.produit.source, 300) },
      conditions: { prix: t(e.conditions && e.conditions.prix, 60), remise: t(e.conditions && e.conditions.remise, 60), validite: t(e.conditions && e.conditions.validite, 60), source: t(e.conditions && e.conditions.source, 300) },
      cibles: (Array.isArray(e.cibles) ? e.cibles : []).filter(x => CIBLES[x]),
      image: e.image && e.image.donnees ? { nom: t(e.image.nom, 80), donnees: String(e.image.donnees).slice(0, 3_000_000), droitsConfirmes: e.image.droitsConfirmes === true } : null,
      plans: type === 'scenario' ? (Array.isArray(e.plans) ? e.plans : []).slice(0, 12).map(p => ({ duree: Math.max(1, Math.min(60, Number(p && p.duree) || 5)), image: t(p && p.image, 200), texte: t(p && p.texte, 200) })) : [] };
    return c;
  }
  // Points bloquants avant validation (liste vide = validable).
  function controler(c) {
    const p = [], m = marque(c.marque);
    if (!m) p.push('Marque non choisie');
    else if (!m.active) p.push(m.nom + ' : ' + m.motif);
    if (!c.titre) p.push('Titre manquant');
    if (!c.texte && c.type !== 'scenario') p.push('Texte manquant');
    if (!c.cibles.length) p.push('Choisir au moins une cible (clients, prospects, dormants)');
    if ((c.conditions.prix || c.conditions.remise) && !c.conditions.source) p.push('Prix ou remise sans source des conditions : jamais de prix inventé');
    if ((c.conditions.prix || c.conditions.remise) && !c.conditions.validite) p.push('Prix ou remise sans durée de validité');
    if (c.produit.caracteristiques && !c.produit.source) p.push('Caractéristiques produit sans source officielle');
    if (/\d+([.,]\d+)?\s*(€|eur|%)/i.test(c.texte) && !c.conditions.source) p.push('Le texte cite un prix ou un pourcentage sans source des conditions');
    if (c.image && !c.image.droitsConfirmes) p.push('Image sans confirmation des droits d’utilisation');
    if (c.type === 'scenario' && !c.plans.length) p.push('Scénario sans plan');
    return p;
  }
  // Statut réel : une validation ne vaut que pour l'empreinte validée.
  function statut(c) {
    if (c.statut === 'archive') return 'archive';
    const m = marque(c.marque); if (m && !m.active) return 'archive';
    if (c.validation && c.validation.empreinte === empreinte(c)) return 'valide';
    return controler(c).length ? 'brouillon' : 'a_verifier';
  }
  function valider(c, { par, le }) {
    const p = controler(c); if (p.length) throw new Error('Validation refusée : ' + p.join(' ; '));
    if (!t(par)) throw new Error('Nom de la personne qui valide obligatoire');
    const v = { par: t(par, 60), le, empreinte: empreinte(c) };
    return Object.assign({}, c, { validation: v, historique: (c.historique || []).concat([{ le, evenement: 'valide', par: v.par, empreinte: v.empreinte }]) });
  }
  // Ajout / mise à jour dans la bibliothèque, jamais de suppression : « archiver » garde le contenu.
  function enregistrer(biblio, entree, { le, nouvelId }) {
    const liste = Array.isArray(biblio) ? biblio.slice() : [];
    const c = normaliser(entree), i = c.id ? liste.findIndex(x => x.id === c.id) : -1;
    if (i < 0) {
      const m = marque(c.marque); if (m && !m.active) throw new Error(m.nom + ' : ' + m.motif);
      c.id = nouvelId(); c.historique = [{ le, evenement: 'cree' }]; liste.push(c);
    } else {
      const a = liste[i]; Object.assign(c, { validation: a.validation, historique: (a.historique || []).concat([{ le, evenement: 'modifie' }]), statut: a.statut });
      liste[i] = c;
    }
    return { biblio: liste, contenu: c };
  }
  const archiver = (biblio, id, le) => biblio.map(x => x.id === id ? Object.assign({}, x, { statut: 'archive', historique: (x.historique || []).concat([{ le, evenement: 'archive' }]) }) : x);

  // Texte final d'un contenu pour WhatsApp (mentions de conditions ajoutées, jamais inventées).
  function texteDiffusion(c) {
    const k = c.conditions, mentions = [];
    if (k.prix) mentions.push('Prix : ' + k.prix); if (k.remise) mentions.push('Remise : ' + k.remise); if (k.validite) mentions.push('Valable : ' + k.validite);
    return [c.texte, mentions.join(' · ')].filter(Boolean).join('\n');
  }
  // Pack des contenus VALIDÉS pour le téléphone (WhatsApp manuel). Rien d'autre ne part.
  function pack(biblio, { le }) {
    const contenus = (biblio || []).filter(c => statut(c) === 'valide' && c.type !== 'scenario').map(c => ({ id: c.id, type: c.type, marque: marque(c.marque).nom,
      titre: c.titre, texte: texteDiffusion(c), cibles: c.cibles, empreinte: c.validation.empreinte, validePar: c.validation.par, valideLe: c.validation.le }));
    return { appli: 'odicolor-contenus', version: 1, date: le, contenus };
  }
  // Segment commercial d'un garage, à partir des données déjà chargées (jamais deviné).
  function segment(g) {
    if (g.compteBloque) return null; // compte bloqué : aucune proposition commerciale
    if (g.client && g.inactif) return 'dormant';
    if (g.client) return 'client';
    return 'prospect';
  }
  // Propositions : pour chaque garage, les contenus validés de sa cible. Une proposition n'est PAS une diffusion.
  function proposer(garages, biblio, max = 3) {
    const valides = (biblio || []).filter(c => statut(c) === 'valide' && c.type !== 'scenario');
    const out = [];
    for (const g of garages || []) {
      const s = segment(g); if (!s) continue;
      const cs = valides.filter(c => c.cibles.includes(s)).slice(0, max);
      if (cs.length) out.push({ garageId: g.id, nom: g.nom, segment: s, raison: CIBLES[s], contenus: cs.map(c => ({ id: c.id, titre: c.titre, marque: marque(c.marque).nom })) });
    }
    return out;
  }
  // Visuel aux couleurs ODICOLOR : SVG autonome (aucune ressource externe). Image incluse seulement si les droits sont confirmés.
  function visuelSVG(c) {
    const e = s => String(s).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
    const m = marque(c.marque), lignes = [], mots = (c.texte || '').split(' '); let l = '';
    for (const w of mots) { if ((l + ' ' + w).trim().length > 38) { lignes.push(l.trim()); l = w; } else l += ' ' + w; } if (l.trim()) lignes.push(l.trim());
    const k = c.conditions, cond = [k.prix && 'Prix : ' + k.prix, k.remise && 'Remise : ' + k.remise, k.validite && 'Valable : ' + k.validite].filter(Boolean).join(' · ');
    const img = c.image && c.image.droitsConfirmes && /^data:image\/(png|jpe?g|webp);base64,/.test(c.image.donnees) ? `<image href="${e(c.image.donnees)}" x="40" y="150" width="1000" height="420" preserveAspectRatio="xMidYMid slice" clip-path="url(#arrondi)"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><defs><clipPath id="arrondi"><rect x="40" y="150" width="1000" height="420" rx="28"/></clipPath></defs>`
      + `<rect width="1080" height="1080" rx="48" fill="#0A0B0D"/><rect x="0" y="0" width="1080" height="12" fill="#E21B2A"/>`
      + `<text x="40" y="100" font-family="Barlow Condensed, Arial, sans-serif" font-size="56" font-weight="800" fill="#FFFFFF">ODICOLOR</text>`
      + `<text x="1040" y="100" text-anchor="end" font-family="Arial, sans-serif" font-size="36" fill="#E21B2A">${e(m ? m.nom : '')}</text>`
      + (img || `<rect x="40" y="150" width="1000" height="420" rx="28" fill="#16181C" stroke="#E21B2A" stroke-width="3"/>`)
      + `<text x="40" y="650" font-family="Barlow Condensed, Arial, sans-serif" font-size="64" font-weight="800" fill="#FFFFFF">${e(c.titre)}</text>`
      + lignes.slice(0, 5).map((x, i) => `<text x="40" y="${730 + i * 50}" font-family="Arial, sans-serif" font-size="38" fill="#D8D6D2">${e(x)}</text>`).join('')
      + (cond ? `<rect x="40" y="975" width="1000" height="64" rx="32" fill="#E21B2A"/><text x="540" y="1018" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#FFFFFF">${e(cond)}</text>` : '')
      + `</svg>`;
  }
  // Fiche texte du scénario (jamais présentée comme une vidéo).
  function scenarioTexte(c) {
    let t0 = 0;
    return [MENTION_SCENARIO, (marque(c.marque) || {}).nom + ' · ' + c.titre, ...c.plans.map((p, i) => { const s = `Plan ${i + 1} (${t0}–${t0 + p.duree} s) · Image : ${p.image || 'à définir'} · Texte : ${p.texte || '—'}`; t0 += p.duree; return s; }), 'Durée totale : ' + t0 + ' s'].join('\n');
  }
  const api = { MARQUES, TYPES, CIBLES, MENTION_SCENARIO, marque, empreinte, normaliser, controler, statut, valider, enregistrer, archiver, texteDiffusion, pack, segment, proposer, visuelSVG, scenarioTexte };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.Studio = api;
})(typeof self !== 'undefined' ? self : this);
