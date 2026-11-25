'use strict';
/* ODICOLOR — WHATSAPP COMMERCIAL MANUEL (logique pure, testable sous Node). Lot 3, 14/11/2026.
   Règles :
   - AUCUN envoi automatique : on prépare un lien wa.me ; le commercial relit et appuie lui-même sur « Envoyer » dans WhatsApp ;
   - le journal n'enregistre que « WhatsApp ouvert » : ouvrir WhatsApp ne prouve ni l'envoi, ni la réception, ni la lecture ;
   - une même ouverture (même garage, même jour, même texte) n'est notée qu'une fois ;
   - numéro vérifié avant ouverture ; formats français (06…, +33…, 0033…), DOM et étrangers au format international ;
     un fixe est accepté avec un avertissement (WhatsApp peu probable), un numéro spécial (08…) est refusé. */
const ODICOLOR_WA = (() => {
  const MAX_TEXTE = 1500, MAX_JOURNAL = 200;

  function normaliser(brut, indicatif = '33') {
    const s = String(brut == null ? '' : brut).trim();
    if (!s) return { ok: false, motif: 'Numéro non renseigné' };
    if (/[a-z]/i.test(s.replace(/^tel:/i, ''))) return { ok: false, motif: 'Numéro illisible (lettres)' };
    let d = s.replace(/^tel:/i, '').replace(/[\s.\-()/]/g, ''), intl;
    if (/^\+\d+$/.test(d)) intl = d.slice(1);
    else if (/^00\d+$/.test(d)) intl = d.slice(2);
    else if (/^0\d{9}$/.test(d)) intl = String(indicatif || '33').replace(/\D/g, '') + d.slice(1);
    else if (/^33\d{9}$/.test(d)) intl = d;
    else return { ok: false, motif: 'Format non reconnu (attendu : 06 12 34 56 78 ou +33 6 12 34 56 78)' };
    if (intl.startsWith('33')) {
      const n = intl.slice(2);
      if (n.startsWith('0')) intl = '33' + n.slice(1); // +33 0 6… saisi par erreur
      const m = intl.slice(2);
      if (!/^[1-9]\d{8}$/.test(m)) return { ok: false, motif: 'Numéro français incomplet ou trop long' };
      if (m[0] === '8') return { ok: false, motif: 'Numéro spécial (08…) : pas de WhatsApp' };
      const type = m[0] === '6' || m[0] === '7' ? 'mobile' : 'fixe';
      return { ok: true, intl, type, affichage: '+33 ' + m[0] + ' ' + m.slice(1).replace(/(\d\d)(?=\d)/g, '$1 '),
        avertissement: type === 'fixe' ? 'Numéro fixe : un compte WhatsApp y est peu probable. Vérifie le portable du gérant.' : null };
    }
    if (!/^[1-9]\d{7,14}$/.test(intl)) return { ok: false, motif: 'Numéro international invalide' };
    return { ok: true, intl, type: 'international', affichage: '+' + intl, avertissement: null };
  }

  const MODELES = {
    presentation: { libelle: 'Présentation', texte: 'Bonjour {contact}, {vendeur} de {societe}, distributeur peinture et produits carrosserie en Île-de-France. Je passe régulièrement près de {garage} : seriez-vous d’accord pour un court échange cette semaine ?' },
    relance: { libelle: 'Relance', texte: 'Bonjour {contact}, {vendeur} de {societe}. Je reviens vers vous suite à notre échange : avez-vous pu regarder ma proposition pour {garage} ? Je reste disponible.' },
    visite: { libelle: 'Après visite', texte: 'Bonjour {contact}, merci pour votre accueil chez {garage}. Comme convenu, je reviens vers vous rapidement. {vendeur}, {societe}.' }
  };
  function rediger(cle, v = {}) {
    const m = MODELES[cle] || MODELES.presentation;
    const val = { contact: v.contact || '', garage: v.garage || 'votre garage', vendeur: v.vendeur || 'votre commercial', societe: v.societe || 'Odicolor' };
    return m.texte.replace(/\{(\w+)\}/g, (_, k) => val[k] || '').replace(/Bonjour ,/, 'Bonjour,').replace(/\s{2,}/g, ' ').trim();
  }
  function lien(intl, texte) {
    if (!/^\d{8,15}$/.test(String(intl || ''))) throw new Error('Numéro international requis');
    return 'https://wa.me/' + intl + '?text=' + encodeURIComponent(String(texte || '').slice(0, MAX_TEXTE));
  }
  // Empreinte courte et stable du texte (dédoublonnage du journal) : FNV-1a 32 bits.
  function empreinte(t) { let h = 0x811c9dc5; for (const ch of String(t)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

  // contacts : historique du garage (tableau, jamais remplacé). Renvoie { contacts, entree, doublon }.
  function noterOuverture(contacts, { maintenant, jour, texte, modele, intl, relance = '' }) {
    const liste = Array.isArray(contacts) ? contacts.slice() : [];
    const cle = 'wa|' + jour + '|' + empreinte(texte);
    const deja = liste.find(x => x && x.cle === cle);
    if (deja) return { contacts: liste, entree: deja, doublon: true };
    const entree = { cle, canal: 'whatsapp', statut: 'whatsapp_ouvert', le: maintenant, jour, modele: MODELES[modele] || /^contenu:[\w-]{1,40}$/.test(String(modele)) ? modele : 'libre',
      numero: '+' + intl, apercu: String(texte).slice(0, 120), relance: /^\d{4}-\d\d-\d\d$/.test(relance) ? relance : '' };
    liste.push(entree);
    return { contacts: liste.slice(-MAX_JOURNAL), entree, doublon: false };
  }
  // Relance proposée : J+n, reportée au lundi si elle tombe un week-end.
  function relanceProposee(jour, n = 2) {
    const d = new Date(jour + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    const w = d.getUTCDay(); if (w === 6) d.setUTCDate(d.getUTCDate() + 2); else if (w === 0) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  // Lot 4 : pack de contenus VALIDÉS produit par le Studio du Bureau. Seules les marques actives sont gardées.
  const MARQUES_ACTIVES = ['Carsystem', 'Abel Auto', 'Sifa'];
  function lirePack(o) {
    if (!o || o.appli !== 'odicolor-contenus' || o.version !== 1 || !Array.isArray(o.contenus)) throw new Error('Fichier de contenus invalide (attendu : contenus validés du Studio).');
    const vus = new Set(), contenus = [], ecartes = [];
    for (const x of o.contenus.slice(0, 300)) {
      const id = String(x && x.id || '').slice(0, 40), ok = /^[\w-]{1,40}$/.test(id) && x.validePar && /^[0-9a-f]{8}$/.test(String(x.empreinte || '')) && typeof x.texte === 'string' && x.texte.trim();
      if (!ok) { ecartes.push((x && x.titre) || id || '?'); continue; }
      if (!MARQUES_ACTIVES.includes(x.marque)) { ecartes.push(x.titre + ' (marque non active)'); continue; }
      if (vus.has(id)) continue; vus.add(id);
      contenus.push({ id, marque: x.marque, titre: String(x.titre || '').slice(0, 120), texte: String(x.texte).slice(0, MAX_TEXTE),
        cibles: (Array.isArray(x.cibles) ? x.cibles : []).filter(c => ['client', 'prospect', 'dormant'].includes(c)), validePar: String(x.validePar).slice(0, 60), valideLe: String(x.valideLe || '').slice(0, 30), empreinte: x.empreinte });
    }
    return { date: String(o.date || '').slice(0, 30), contenus, ecartes };
  }
  // Contenus proposés pour un garage : ceux de sa cible d'abord.
  function contenusPour(c, pack) {
    const l = pack && Array.isArray(pack.contenus) ? pack.contenus : [];
    const cible = c && c.statutCrm === 'client' ? (c.dormant ? 'dormant' : 'client') : 'prospect';
    return l.slice().sort((a, b) => (b.cibles.includes(cible) - a.cibles.includes(cible)) || a.titre.localeCompare(b.titre, 'fr'));
  }
  const libelleStatut = s => s === 'whatsapp_ouvert' ? 'WhatsApp ouvert (envoi non confirmé)' : 'Inconnu';
  return { normaliser, MODELES, MARQUES_ACTIVES, lirePack, contenusPour, rediger, lien, empreinte, noterOuverture, relanceProposee, libelleStatut };
})();
if (typeof module === 'object' && module.exports) module.exports = ODICOLOR_WA;
