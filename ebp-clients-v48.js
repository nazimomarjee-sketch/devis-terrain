'use strict';
/* ODICOLOR — IMPORT EBP DES CLIENTS ET RAPPROCHEMENT DES CODES AVEC LES GARAGES DU TÉLÉPHONE (logique pure, testable sous Node).
   Principe : un code client EBP n'est lié à un garage que par une décision explicite de l'utilisateur. Le programme PROPOSE, il ne valide jamais seul.
   - « forte » : même nom normalisé ET même code postal (ou même ville), unique des deux côtés ;
   - « à vérifier » : même nom sans lieu concordant, ou noms très proches avec même code postal, ou plusieurs candidats ;
   - « sans garage » : aucun candidat (création de fiche possible, sur demande) ;
   - « conflit » : le code ou le garage est déjà lié autrement.
   HYPOTHÈSE : noms de colonnes EBP non connus (aucun export réel reçu) → détection automatique, correspondance affichée, refus si colonne obligatoire absente. */
const ODICOLOR_EBP_CLIENTS = (() => {
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const texte = (v, n = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const COL = [
    ['code', 'Code client', /^code$|code.*(client|tiers)|^(n°|no|numero) (client|tiers)$|^tiers$|^compte (client|tiers)$|^reference client$/, true],
    ['nom', 'Nom / raison sociale', /raison sociale|^nom|^client$|^intitule|^societe$|^denomination|^libelle$/, true],
    ['ville', 'Ville', /ville|commune/, false],
    ['cp', 'Code postal', /code postal|^cp$/, false],
    ['statut', 'Statut du compte', /statut|bloque|sommeil|^etat|^actif$/, false],
    ['famille', 'Famille / activité', /famille|categorie|activite|type de client|secteur/, false],
    ['commercial', 'Représentant', /^(code )?(representant|commercial|vendeur)$|representant|^portefeuille/, false]
  ];
  const FORMES = new Set(['sarl', 'sas', 'sasu', 'eurl', 'sa', 'ets', 'etablissements', 'etablissement', 'ste', 'societe', 'snc', 'sci', 'ei', 'et', 'la', 'le', 'les', 'de', 'du', 'des']);
  const nomNorm = s => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t && !FORMES.has(t)).join(' ');
  const cpNorm = s => String(s || '').replace(/\D/g, '').slice(0, 5);
  const villeNorm = s => norm(s).replace(/[^a-z0-9]+/g, ' ').replace(/\bsaint\b/g, 'st').replace(/\bsainte\b/g, 'ste').trim();
  const jaccard = (a, b) => { const A = new Set(a.split(' ').filter(Boolean)), B = new Set(b.split(' ').filter(Boolean)); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };

  const deviner = ent => { const hn = ent.map(norm), pris = new Set(), carte = {};
    for (const [k, , re] of COL) { const j = hn.findIndex((x, q) => !pris.has(q) && re.test(x) && !(k === 'code' && /postal/.test(x))); if (j >= 0) { carte[k] = j; pris.add(j); } }
    return carte; };
  const manquantes = carte => COL.filter(([k, , , ob]) => ob && carte[k] == null).map(([, l]) => l);
  function analyser(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return { ok: false, erreur: 'Fichier vide : aucune ligne après les en-têtes.' };
    let meilleur = null;
    for (let i = 0; i < Math.min(rows.length - 1, 15); i++) {
      const ent = (rows[i] || []).map(c => texte(c, 80)); if (ent.filter(Boolean).length < 2) continue;
      const carte = deviner(ent), manque = manquantes(carte);
      if (!meilleur || manque.length < meilleur.manque.length) meilleur = { debut: i, entetes: ent, carte, manque };
      if (!manque.length) break;
    }
    if (!meilleur) return { ok: false, erreur: 'Aucune ligne d’en-têtes reconnaissable.' };
    return { ok: true, ...meilleur, champs: COL.map(([cle, libelle, , obligatoire]) => ({ cle, libelle, obligatoire })) };
  }
  function associer(rows, force) {
    const an = analyser(rows); if (!an.ok) return an;
    let carte = an.carte, debut = an.debut, ent = an.entetes;
    if (force && force.carte) {
      debut = Number.isInteger(force.debut) ? force.debut : an.debut; ent = (rows[debut] || []).map(c => texte(c, 80)); carte = {};
      for (const [k] of COL) { const v = force.carte[k]; if (Number.isInteger(v) && v >= 0 && v < ent.length) carte[k] = v; }
      const vals = Object.values(carte); if (new Set(vals).size !== vals.length) return { ok: false, erreur: 'Deux champs utilisent la même colonne.', analyse: an };
    }
    const manque = manquantes(carte);
    if (manque.length) return { ok: false, analyse: an, erreur: 'Colonne(s) obligatoire(s) introuvable(s) : ' + manque.join(', ') + '. Colonnes lues : ' + ent.filter(Boolean).join(' | ') + '. Choisis les colonnes à la main ci-dessous.' };
    return { ok: true, debut, carte, analyse: an, correspondance: COL.filter(([k]) => carte[k] != null).map(([k, l]) => ({ cle: k, libelle: l, colonne: ent[carte[k]] })) };
  }
  function lire(rows, colonnes) {
    const a = associer(rows, colonnes); if (!a.ok) return a;
    const clients = [], ignorees = [], conflitsCode = [], vus = new Map();
    for (let i = a.debut + 1; i < rows.length; i++) {
      const r = rows[i] || []; if (!r.some(c => texte(c) !== '')) continue;
      const g = k => (a.carte[k] == null ? '' : r[a.carte[k]]), ligne = i + 1, code = texte(g('code'), 40), nom = texte(g('nom'));
      if (!code) { ignorees.push({ ligne, motif: 'Code client absent' }); continue; }
      if (!nom) { ignorees.push({ ligne, motif: 'Nom absent pour le code ' + code }); continue; }
      const st = norm(g('statut')), brut = texte(g('statut'), 40);
      const bloque = /bloqu|suspendu|interdit/.test(st) || (/^(bloque|sommeil)/.test(norm(a.carte.statut != null ? rows[a.debut][a.carte.statut] : '')) && /^(oui|vrai|1|x)$/.test(st));
      const c = { code, nom, ville: texte(g('ville'), 80), cp: cpNorm(g('cp')), statut: brut, bloque: !!bloque, famille: texte(g('famille'), 60), commercial: texte(g('commercial'), 40), ligne };
      if (vus.has(code)) { const p = vus.get(code); if (nomNorm(p.nom) !== nomNorm(c.nom)) conflitsCode.push({ code, noms: [p.nom, c.nom], ligne }); continue; }
      vus.set(code, c); clients.push(c);
    }
    return { ok: true, correspondance: a.correspondance, analyse: a.analyse, carte: a.carte, debut: a.debut, clients, ignorees, conflitsCode, lues: rows.length - a.debut - 1 };
  }
  /* garages : fiches du téléphone (id, nom, ville, cp, codeEbp?). Retourne les propositions, sans rien modifier. */
  function rapprocher(ebp, garages) {
    const parCode = new Map(garages.filter(g => g.codeEbp).map(g => [g.codeEbp, g]));
    const liees = [], conflits = [], candidats = [];
    for (const c of ebp) {
      const deja = parCode.get(c.code);
      if (deja) { liees.push({ code: c.code, id: deja.id }); continue; }
      candidats.push(c);
    }
    const libres = garages.filter(g => !g.codeEbp).map(g => ({ g, n: nomNorm(g.nom), cp: cpNorm(g.cp), v: villeNorm(g.ville || g.villeProspection) }));
    const parNom = new Map(); for (const x of libres) { if (!x.n) continue; if (!parNom.has(x.n)) parNom.set(x.n, []); parNom.get(x.n).push(x); }
    const ebpParCle = new Map(); for (const c of candidats) { const k = nomNorm(c.nom) + '|' + (c.cp || villeNorm(c.ville)); ebpParCle.set(k, (ebpParCle.get(k) || 0) + 1); }
    const fortes = [], aVerifier = [], sansGarage = [], pris = new Set();
    for (const c of candidats) {
      const n = nomNorm(c.nom), cp = c.cp, v = villeNorm(c.ville), memes = parNom.get(n) || [];
      const lieu = memes.filter(x => (cp && x.cp && x.cp === cp) || (v && x.v && x.v === v));
      const cle = n + '|' + (cp || v);
      if (lieu.length === 1 && memes.length === 1 && ebpParCle.get(cle) === 1) { fortes.push({ code: c.code, id: lieu[0].g.id, raison: 'Même nom et même ' + (cp && lieu[0].cp === cp ? 'code postal (' + cp + ')' : 'ville (' + c.ville + ')') }); pris.add(lieu[0].g.id); continue; }
      let cands = memes.map(x => ({ id: x.g.id, raison: 'Même nom' + (lieu.includes(x) ? ' et même lieu' : ', lieu différent ou inconnu') }));
      if (!cands.length && cp) cands = libres.filter(x => x.cp === cp && jaccard(x.n, n) >= 0.6).map(x => ({ id: x.g.id, raison: 'Nom proche, même code postal ' + cp }));
      if (cands.length) aVerifier.push({ code: c.code, candidats: cands.slice(0, 5), raison: cands.length > 1 || memes.length > 1 ? 'Plusieurs candidats' : cands[0].raison }); else sansGarage.push(c.code);
    }
    // Un garage proposé « fort » pour un code ne doit pas l'être pour un autre : sécurité d'unicité.
    const compte = new Map(); for (const f of fortes) compte.set(f.id, (compte.get(f.id) || 0) + 1);
    const finales = []; for (const f of fortes) { if (compte.get(f.id) > 1) aVerifier.push({ code: f.code, candidats: [{ id: f.id, raison: f.raison }], raison: 'Garage proposé pour plusieurs codes' }); else finales.push(f); }
    return { liees, fortes: finales, aVerifier, sansGarage };
  }
  /* Applique des liaisons DÉCIDÉES par l'utilisateur : [{ code, id }] ; ebpParCode = Map(code → client EBP). Retourne les garages modifiés (copies) et les refus. */
  function appliquer(garages, decisions, ebpParCode, ctx) {
    const parId = new Map(garages.map(g => [g.id, g])), codesPris = new Map(garages.filter(g => g.codeEbp).map(g => [g.codeEbp, g.id])), modifies = [], refus = [], vusG = new Set();
    for (const d of decisions) {
      const g = parId.get(d.id), c = ebpParCode.get(d.code);
      if (!g || !c) { refus.push({ ...d, motif: 'Garage ou code introuvable' }); continue; }
      if (vusG.has(g.id)) { refus.push({ ...d, motif: 'Garage déjà lié dans cette opération' }); continue; }
      if (codesPris.has(d.code) && codesPris.get(d.code) !== g.id) { refus.push({ ...d, motif: 'Code déjà lié à un autre garage' }); continue; }
      if (g.codeEbp && g.codeEbp !== d.code && !d.remplacer) { refus.push({ ...d, motif: 'Garage déjà lié au code ' + g.codeEbp }); continue; }
      const copie = JSON.parse(JSON.stringify(g)); copie.codeEbp = d.code;
      copie.liaisonEbp = { code: d.code, par: ctx.auteur || 'Moi', le: ctx.auj, source: 'import clients EBP · ' + texte(ctx.fichier, 80), methode: d.methode || 'manuel', ancienCode: g.codeEbp && g.codeEbp !== d.code ? g.codeEbp : undefined };
      copie.ebp = { code: c.code, nom: c.nom, bloque: c.bloque, famille: c.famille, commercial: c.commercial, statut: c.statut, importeLe: ctx.auj, fichier: texte(ctx.fichier, 80) };
      codesPris.set(d.code, g.id); vusG.add(g.id); modifies.push(copie);
    }
    return { modifies, refus };
  }
  // Fiche garage créée À LA DEMANDE depuis un client EBP sans garage (jamais automatiquement).
  function nouveauGarage(c, ctx) {
    return { nom: c.nom, ville: c.ville, cp: c.cp, statutCrm: 'client', codeEbp: c.code, creeLe: ctx.auj,
      liaisonEbp: { code: c.code, par: ctx.auteur || 'Moi', le: ctx.auj, source: 'création depuis import clients EBP · ' + texte(ctx.fichier, 80), methode: 'creation' },
      ebp: { code: c.code, nom: c.nom, bloque: c.bloque, famille: c.famille, commercial: c.commercial, statut: c.statut, importeLe: ctx.auj, fichier: texte(ctx.fichier, 80) } };
  }
  return { analyser, associer, lire, rapprocher, appliquer, nouveauGarage, nomNorm };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_EBP_CLIENTS;
