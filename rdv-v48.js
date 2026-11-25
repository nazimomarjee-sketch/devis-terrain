'use strict';
/* ODICOLOR — RENDEZ-VOUS AVEC HEURE ET INTÉGRATION AUX TOURNÉES (logique pure, testable sous Node).
   Un rendez-vous = un garage, un jour, une heure de début, une durée. Statuts : prevu, fait, annule (jamais supprimé : historique conservé).
   Intégration : les rendez-vous du jour sont des POINTS FIXES (dans l'ordre de l'heure) ; les autres garages de la tournée sont insérés là où ils allongent le moins le trajet.
   Le temps de trajet est ESTIMÉ à vol d'oiseau (35 km/h) : un avertissement, jamais une garantie. */
const ODICOLOR_RDV = (() => {
  const iso = s => typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
  const heure = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const min = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const VITESSE_KMH = 35, DUREE_DEFAUT = 30, DUREES = [15, 30, 45, 60, 90, 120];
  const vide = () => ({ version: 1, rdv: [] });
  const norm = m => { if (m == null) return vide(); if (typeof m !== 'object' || m.version !== 1 || !Array.isArray(m.rdv)) throw new Error('Agenda invalide.'); return m; };
  const fin = r => min(r.heure) + r.duree;
  const chevauche = (a, b) => a.date === b.date && min(a.heure) < fin(b) && min(b.heure) < fin(a);
  function controler(r, existants, ctx) {
    const e = [], w = [];
    if (!r || typeof r !== 'object') return { ok: false, erreurs: ['Saisie vide.'], avertissements: w };
    if (!Number.isInteger(r.clientId) || r.clientId < 1) e.push('Choisis un garage.');
    if (!iso(r.date)) e.push('Date invalide.'); else if (ctx.auj && r.date < ctx.auj) e.push('Date passée : un rendez-vous se fixe aujourd’hui ou plus tard.');
    if (!heure(r.heure)) e.push('Heure invalide (HH:MM).'); else if (r.heure < '06:00' || r.heure > '21:00') w.push('Heure inhabituelle (' + r.heure + ') : vérifie.');
    if (!Number.isInteger(r.duree) || r.duree < 5 || r.duree > 480) e.push('Durée invalide (5 à 480 minutes).');
    if (e.length) return { ok: false, erreurs: e, avertissements: w };
    if (min(r.heure) + r.duree > 24 * 60) e.push('Le rendez-vous dépasse minuit.');
    const actifs = (existants || []).filter(x => x.statut === 'prevu');
    const clash = actifs.find(x => chevauche(x, r)); if (clash) e.push('Chevauche le rendez-vous de ' + clash.heure + ' (' + (clash.clientNom || 'garage') + ').');
    const doublon = actifs.find(x => x.clientId === r.clientId && x.date === r.date); if (doublon && !clash) w.push('Ce garage a déjà un rendez-vous ce jour-là à ' + doublon.heure + '.');
    return { ok: e.length === 0, erreurs: e, avertissements: w };
  }
  function ajouter(magasin, r, ctx) {
    const m = norm(magasin), c = controler(r, m.rdv, ctx); if (!c.ok) throw Object.assign(new Error(c.erreurs.join(' ')), { controle: c });
    if (c.avertissements.length && !ctx.confirme) throw Object.assign(new Error('Confirmation nécessaire : ' + c.avertissements.join(' ')), { controle: c, confirmation: true });
    return { ...m, rdv: [...m.rdv, { id: ctx.id, clientId: r.clientId, clientNom: String(r.clientNom || '').slice(0, 120), date: r.date, heure: r.heure, duree: r.duree, objet: String(r.objet || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200), statut: 'prevu', creeLe: ctx.maintenant }] };
  }
  const modifier = (magasin, id, champs) => { const m = norm(magasin); if (!m.rdv.some(x => x.id === id)) throw new Error('Rendez-vous introuvable.'); return { ...m, rdv: m.rdv.map(x => x.id === id ? { ...x, ...champs } : x) }; };
  const terminer = (m, id, ctx) => modifier(m, id, { statut: 'fait', faitLe: ctx.maintenant });
  function annuler(m, id, motif, ctx) { if (!String(motif || '').trim()) throw new Error('Indique le motif.'); return modifier(m, id, { statut: 'annule', annuleLe: ctx.maintenant, motif: String(motif).trim().slice(0, 200) }); }
  function deplacer(magasin, id, date, h, ctx) {
    const m = norm(magasin), r = m.rdv.find(x => x.id === id); if (!r || r.statut !== 'prevu') throw new Error('Rendez-vous introuvable ou déjà clos.');
    const autres = m.rdv.filter(x => x.id !== id), c = controler({ ...r, date, heure: h }, autres, ctx); if (!c.ok) throw new Error(c.erreurs.join(' '));
    return modifier(m, id, { date, heure: h, deplaceLe: ctx.maintenant, ancien: { date: r.date, heure: r.heure } });
  }
  const duJour = (magasin, jour) => norm(magasin).rdv.filter(x => x.date === jour && x.statut === 'prevu').sort((a, b) => min(a.heure) - min(b.heure));
  const aVenir = (magasin, depuis, jours) => { const fin2 = new Date(Date.parse(depuis + 'T12:00:00Z') + jours * 864e5).toISOString().slice(0, 10); return norm(magasin).rdv.filter(x => x.statut === 'prevu' && x.date >= depuis && x.date <= fin2).sort((a, b) => a.date.localeCompare(b.date) || min(a.heure) - min(b.heure)); };
  const km = (a, b) => { const dx = (a.lng - b.lng) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), dy = (a.lat - b.lat) * 111.32; return Math.hypot(dx, dy); };
  /* Ordonne une journée : points fixes (rdv) par heure, garages libres insérés au moindre détour.
     rdvs = rendez-vous du jour (prevu) ; libres = ids de garages sans rendez-vous ; position(id) -> {lat,lng}|null.
     Retour : { sequence:[{id, rdv?:{heure,duree}}], avertissements:[...] }. Un garage libre sans position est placé en fin de journée. */
  function integrer(rdvs, libres, position) {
    const fixes = rdvs.slice().sort((a, b) => min(a.heure) - min(b.heure)), seq = fixes.map(r => ({ id: r.clientId, rdv: { heure: r.heure, duree: r.duree, id: r.id } })), avert = [];
    const libresIds = [...new Set(libres)].filter(id => !fixes.some(r => r.clientId === id));
    const sans = libresIds.filter(id => !position(id)), avec = libresIds.filter(id => position(id));
    for (const id of avec) {
      const p = position(id); let meilleur = 0, bd = Infinity;
      for (let i = 0; i <= seq.length; i++) {
        const a = i > 0 ? position(seq[i - 1].id) : null, b = i < seq.length ? position(seq[i].id) : null;
        const d = a && b ? km(a, p) + km(p, b) - km(a, b) : a ? km(a, p) : b ? km(p, b) : 0;
        if (d < bd - 1e-9) { bd = d; meilleur = i; }
      }
      seq.splice(meilleur, 0, { id });
    }
    for (const id of sans) seq.push({ id });
    // Faisabilité entre deux points fixes consécutifs : temps disponible vs trajet estimé + visites intercalées (durée présumée 20 min chacune).
    for (let i = 0; i < seq.length; i++) {
      if (!seq[i].rdv) continue;
      let j = i + 1, libresEntre = 0; while (j < seq.length && !seq[j].rdv) { libresEntre++; j++; }
      if (j >= seq.length) continue;
      const a = seq[i], b = seq[j], dispo = min(b.rdv.heure) - (min(a.rdv.heure) + a.rdv.duree);
      let trajet = 0, prev = position(a.id); for (let q = i + 1; q <= j; q++) { const c = position(seq[q].id); if (prev && c) trajet += km(prev, c) / VITESSE_KMH * 60; prev = c || prev; }
      const besoin = Math.round(trajet + libresEntre * 20);
      if (dispo < 0) avert.push('Rendez-vous de ' + a.rdv.heure + ' et ' + b.rdv.heure + ' : ils se chevauchent.');
      else if (besoin > dispo) avert.push('Entre ' + hhmm(min(a.rdv.heure) + a.rdv.duree) + ' et ' + b.rdv.heure + ' : ≈ ' + besoin + ' min nécessaires (trajet estimé + ' + libresEntre + ' visite(s)), ' + dispo + ' min disponibles.');
    }
    return { sequence: seq, avertissements: avert };
  }
  function valider(m) {
    m = norm(m); const ids = new Set();
    for (const r of m.rdv) {
      if (!r || typeof r.id !== 'string' || !r.id || ids.has(r.id)) throw new Error('Agenda : identifiant invalide ou répété.'); ids.add(r.id);
      if (!Number.isInteger(r.clientId) || !iso(r.date) || !heure(r.heure) || !Number.isInteger(r.duree) || r.duree < 5 || r.duree > 480 || !['prevu', 'fait', 'annule'].includes(r.statut)) throw new Error('Agenda : rendez-vous invalide.');
      if (r.statut === 'annule' && !String(r.motif || '').trim()) throw new Error('Agenda : annulation sans motif.');
    }
    const prevus = m.rdv.filter(r => r.statut === 'prevu'); for (let i = 0; i < prevus.length; i++) for (let j = i + 1; j < prevus.length; j++) if (chevauche(prevus[i], prevus[j])) throw new Error('Agenda : deux rendez-vous prévus se chevauchent.');
    return { rdv: m.rdv.length };
  }
  return { vide, controler, ajouter, terminer, annuler, deplacer, duJour, aVenir, integrer, valider, min, hhmm, DUREES, DUREE_DEFAUT };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_RDV;
