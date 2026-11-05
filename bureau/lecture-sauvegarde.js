/* ODICOLOR Bureau — lecture des sauvegardes du téléphone. LECTURE SEULE.
   Formats acceptés :
   - .odicolor (sauvegarde complète du Lot 1, format « ODICOLOR-BACKUP-2 ») : intégrité vérifiée
     par empreintes SHA-256 (en-tête + chaque photo/PDF), exactement comme le téléphone avant restauration ;
   - .json V47 (ancienne sauvegarde) : contrôles de bureau-logique.js.
   Le fichier n'est jamais modifié ; les photos et PDF sont vérifiés mais pas conservés (le Bureau n'en a pas besoin).
   Aucune donnée n'est envoyée sur Internet ni enregistrée dans le navigateur.
   Format de référence : sauvegarde-locale.js (téléphone, branche fix/lot1-f01-f03-recuperation). */
(function (racine) {
  'use strict';
  const L0 = (typeof module === 'object' && module.exports) ? require('./bureau-logique.js') : racine.BureauLogique;
  if (!L0) throw new Error('bureau-logique.js doit être chargé avant lecture-sauvegarde.js');

  const MAGIC = 'ODICOLOR-BACKUP-2\n';
  // Mêmes limites que le téléphone : un fichier qu'il produit est toujours lisible ici.
  const MAX_FICHIER = 1024 * 1024 * 1024, MAX_ENTETE = 64 * 1024 * 1024, MAX_PIECE = 128 * 1024 * 1024, MAX_JSON = 25 * 1024 * 1024;
  const MAX_PROFONDEUR = 64;

  const objet = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const entier = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
  const dateIso = s => typeof s === 'string' && /^\d{4}-\d\d-\d\d(?:$|T)/.test(s) && Number.isFinite(Date.parse(s));
  const refus = message => { const e = new Error(message); e.refus = true; throw e; };
  const hex = b => Array.from(new Uint8Array(b), n => n.toString(16).padStart(2, '0')).join('');
  async function empreinte(octets) {
    const c = racine.crypto && racine.crypto.subtle ? racine.crypto : (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    if (!c || !c.subtle) refus('Ce navigateur ne sait pas vérifier l’intégrité des sauvegardes (ouvre le Bureau en https ou en local).');
    return hex(await c.subtle.digest('SHA-256', octets));
  }
  const taille = n => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' Ko' : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';

  // Décode la représentation typée du téléphone. Les pièces jointes deviennent de simples repères.
  function deballer(v, pieces, prof = 0) {
    if (prof > MAX_PROFONDEUR) refus('Sauvegarde invalide : données trop imbriquées.');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isFinite(v)) refus('Sauvegarde invalide : nombre incorrect.'); return v; }
    if (!Array.isArray(v)) refus('Sauvegarde invalide : encodage inconnu.');
    const [tag, d] = v;
    if (tag === 'undefined' && v.length === 1) return undefined;
    if (v.length !== 2) refus('Sauvegarde invalide : encodage inconnu.');
    if (tag === 'blob' && entier(d, 0, pieces.length - 1)) return { pieceJointe: d, type: pieces[d].type, taille: pieces[d].size };
    if (tag === 'file' && objet(d) && entier(d.index, 0, pieces.length - 1) && typeof d.name === 'string')
      return { pieceJointe: d.index, type: pieces[d.index].type, taille: pieces[d.index].size, nom: d.name };
    if (tag === 'date' && dateIso(d)) return d;
    if (tag === 'array' && Array.isArray(d)) return d.map(x => deballer(x, pieces, prof + 1));
    if (tag === 'object' && Array.isArray(d)) {
      const out = {}, vus = new Set();
      for (const e of d) {
        if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string' || vus.has(e[0])) refus('Sauvegarde invalide : fiche mal formée.');
        vus.add(e[0]);
        // defineProperty : une clé « __proto__ » reste une donnée, sans effet sur les objets du Bureau.
        Object.defineProperty(out, e[0], { value: deballer(e[1], pieces, prof + 1), enumerable: true, writable: true, configurable: true });
      }
      return out;
    }
    refus('Sauvegarde invalide : type de donnée inconnu.');
  }

  async function lireOdicolor(fichier) {
    const debut = MAGIC.length;
    const tl = await fichier.slice(debut, debut + 4).arrayBuffer();
    if (tl.byteLength !== 4) refus('Sauvegarde tronquée : le fichier est incomplet. Refais l’export sur le téléphone.');
    const lg = new DataView(tl).getUint32(0, true), corps = debut + 4 + 32;
    if (!lg || lg > MAX_ENTETE || corps + lg > fichier.size) refus('Sauvegarde tronquée ou en-tête invalide : le fichier est incomplet. Refais l’export sur le téléphone.');
    const entete = await fichier.slice(corps, corps + lg).arrayBuffer();
    const attendue = hex(await fichier.slice(debut + 4, corps).arrayBuffer());
    if (await empreinte(entete) !== attendue) refus('Sauvegarde corrompue (en-tête) : le fichier a été modifié ou abîmé pendant le transfert.');
    let h;
    try { h = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entete)); } catch (_) { refus('Sauvegarde corrompue : en-tête illisible.'); }
    if (!objet(h) || h.appli !== 'devis-terrain' || h.version !== 2 || !dateIso(h.date) || !Array.isArray(h.attachments))
      refus('Sauvegarde .odicolor de version inconnue : mets le Bureau à jour.');
    if (h.warning) refus('Ce fichier est une copie brute « à réparer » (' + String(h.warning).slice(0, 160) + ') : le téléphone lui-même refuse de la restaurer. Fais une sauvegarde complète normale.');
    const pieces = []; let curseur = corps + lg;
    for (const a of h.attachments) {
      if (!objet(a) || !entier(a.size, 0, MAX_PIECE) || typeof a.type !== 'string' || !/^[a-f0-9]{64}$/.test(a.sha256) || curseur + a.size > fichier.size)
        refus('Sauvegarde tronquée : une photo ou un PDF est incomplet. Refais l’export sur le téléphone.');
      const morceau = await fichier.slice(curseur, curseur + a.size).arrayBuffer(); curseur += a.size;
      if (await empreinte(morceau) !== a.sha256) {
        const sorte = t => t.startsWith('image/') ? 'photo' : t === 'application/pdf' ? 'PDF' : 'pièce jointe';
        const rang = pieces.filter(x => sorte(x.type) === sorte(a.type)).length + 1;
        refus('Sauvegarde corrompue (' + sorte(a.type) + ' n° ' + rang + ') : le fichier a été abîmé pendant le transfert.');
      }
      pieces.push({ type: a.type, size: a.size });
    }
    if (curseur !== fichier.size) refus('Sauvegarde invalide : contenu inattendu à la fin du fichier.');
    const magasins = deballer(h.data, pieces);
    if (!objet(magasins) || !Array.isArray(magasins.clients)) refus('Sauvegarde sans liste de garages.');
    const ids = new Set();
    for (const c of magasins.clients) {
      if (!objet(c) || !entier(c.id, 1) || ids.has(c.id)) refus('Sauvegarde invalide : identifiant de garage absent ou répété.');
      ids.add(c.id);
    }
    const meta = Array.isArray(magasins.meta) ? magasins.meta.filter(e => Array.isArray(e) && typeof e[0] === 'string') : [];
    const resume = {
      garages: magasins.clients.length,
      devis: Array.isArray(magasins.devis) ? magasins.devis.length : 0,
      articles: Array.isArray(magasins.articles) ? magasins.articles.length : 0,
      photos: meta.filter(e => e[0].startsWith('garage-photo-v38:')).length,
      pdf: meta.filter(e => e[0].startsWith('pdfFournisseur:')).length
    };
    return { format: 'odicolor-2', date: h.date, clients: magasins.clients, resume,
      controle: { entete: true, pieces: pieces.length, octets: fichier.size } };
  }

  async function lireJson(fichier) {
    if (fichier.size > MAX_JSON) refus('Ancienne sauvegarde JSON trop volumineuse (25 Mo maximum). Utilise la sauvegarde complète .odicolor.');
    let o;
    try { o = JSON.parse(await fichier.text()); } catch (_) {
      refus('Fichier non reconnu : ni une sauvegarde complète .odicolor, ni une sauvegarde JSON lisible (fichier tronqué ?).');
    }
    const lu = L0.lireSauvegarde(o); // contrôles de format et de version V47
    return { format: 'json-v47', date: typeof o.date === 'string' ? o.date : '', clients: o.clients, resume: null, controle: null, lu };
  }

  // Point d'entrée. fichier = Blob ou File (navigateur ou Node 18+). Retourne { garages, rapport }.
  async function lire(fichier) {
    if (!fichier || typeof fichier.slice !== 'function' || typeof fichier.size !== 'number') refus('Aucun fichier à lire.');
    if (!fichier.size) refus('Fichier vide : l’export n’a pas abouti. Refais-le sur le téléphone.');
    if (fichier.size > MAX_FICHIER) refus('Fichier trop volumineux (1 Go maximum).');
    const prefixe = new TextDecoder().decode(await fichier.slice(0, MAGIC.length).arrayBuffer());
    let lu;
    if (prefixe === MAGIC) lu = await lireOdicolor(fichier);
    else if (prefixe.startsWith('ODICOLOR-BACKUP-')) refus('Sauvegarde .odicolor d’une version plus récente que ce Bureau : mets le Bureau à jour.');
    else lu = await lireJson(fichier);
    const r = lu.lu || L0.lireClients(lu.clients, lu.date);
    r.rapport.format = lu.format;
    r.rapport.contenu = lu.resume;
    r.rapport.controle = lu.controle;
    r.rapport.octets = fichier.size;
    return r;
  }

  // Phrase affichée après un import réussi.
  function message(rapport) {
    const d = rapport.date && Number.isFinite(Date.parse(rapport.date)) ? new Date(rapport.date).toLocaleDateString('fr-FR') : 'date inconnue';
    const p = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');
    const classes = p(rapport.classes, 'garage') + ' classé' + (rapport.classes > 1 ? 's' : '');
    if (rapport.format === 'odicolor-2') {
      const c = rapport.contenu;
      return `Sauvegarde complète du ${d} vérifiée (intégrité OK, ${taille(rapport.octets)}) : ${p(c.garages, 'garage')}, ${c.devis} devis, ${p(c.photos, 'photo')}, ${c.pdf} PDF. ` +
        `${classes} en Île-de-France. Lecture seule : rien n’est modifié.`;
    }
    return `Ancienne sauvegarde V47 du ${d} lue : ${p(rapport.lus, 'garage')}, ${classes} en Île-de-France. ` +
      'Pas de contrôle d’intégrité possible sur ce format : préfère la sauvegarde complète .odicolor.';
  }

  const api = { lire, message, MAGIC, MAX_FICHIER, MAX_JSON };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.LectureSauvegarde = api;
})(typeof self !== 'undefined' ? self : this);
