/* ODICOLOR 2.0 — Socle 0 : migration à blanc des données actuelles vers le modèle commun (lecture seule).
   Sources : sauvegarde du téléphone (.odicolor ou JSON V47, déjà lue par bureau/lecture-sauvegarde.js) et pièces EBP
   (bureau/ebp-import.js). Garanties : la fiche d'origine du téléphone est conservée telle quelle (retour sans perte) ;
   toute donnée non reprise est listée avec son motif ; aucune donnée n'est inventée. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const M = node ? require('./modele.js') : racine.SocleModele;
  const P = node ? require('../bureau/pipeline.js') : racine.Pipeline;
  const copie = o => JSON.parse(JSON.stringify(o));
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const jour = v => String(v || '').slice(0, 10);
  const statutGarage = c => (c.statutCrm === 'client' ? 'client' : 'prospect');

  function depuisTelephone({ clients = [], devis = [] }, { genUid, responsable }) {
    const objets = [], ecartes = [], correspondance = new Map(), origine = new Map();
    const ajouter = (entite, objet, motifSi) => { const e = M.valider(entite, objet); if (e.length) ecartes.push({ entite, source: motifSi, motif: e.join(', ') }); else objets.push({ entite, objet }); return !e.length; };
    for (const c of clients) {
      const uid = genUid(); origine.set(uid, copie(c));
      const g = { uid, nom: String(c.nom || '').trim(), statut: statutGarage(c) };
      const ville = c.villeProspection || c.ville; if (ville) g.ville = String(ville).slice(0, 80);
      if (c.cp || c.codePostal) g.cp = String(c.cp || c.codePostal).slice(0, 10);
      if (c.notes) g.notes = String(c.notes).slice(0, 2000);
      if (!ajouter('garage', g, 'garage ' + c.id)) { origine.delete(uid); continue; }
      correspondance.set(c.id, uid);
      for (const v of Array.isArray(c.visites) ? c.visites : [])
        ajouter('visite', { uid: genUid(), garageUid: uid, date: jour(v.date), resultat: v.res, ...(v.note ? { note: String(v.note).slice(0, 1000) } : {}) }, 'visite du garage ' + c.id);
      if (c.etape) ajouter('action', { uid: genUid(), titre: String(c.etape).slice(0, 200), garageUid: uid, responsable, priorite: 2, statut: 'a_faire', source: 'terrain', ...(c.etapeDate ? { echeance: jour(c.etapeDate) } : {}) }, 'étape du garage ' + c.id);
    }
    for (const d of devis) {
      const garageUid = correspondance.get(d.clientId), total = P.totalDevisCents(d);
      if (!garageUid) { ecartes.push({ entite: 'devisTerrain', source: 'devis ' + d.id, motif: 'Garage du devis introuvable' }); continue; }
      ajouter('devisTerrain', { uid: genUid(), garageUid, totalCents: total, statut: d.statut, date: jour(d.creeLe) }, 'devis ' + d.id);
    }
    return { objets, ecartes, correspondance, origine };
  }

  // Retour vers le format du téléphone : la fiche d'origine, avec seulement les champs gérés par le socle mis à jour.
  function versTelephone(garages, origine) {
    return garages.filter(g => origine.has(g.uid)).map(g => {
      const c = copie(origine.get(g.uid));
      if (c.nom !== g.nom) c.nom = g.nom;
      if (statutGarage(c) !== g.statut && ['client', 'prospect'].includes(g.statut)) c.statutCrm = g.statut;
      return c;
    });
  }

  // Pièces EBP → copies en lecture seule, reliées à un garage seulement si le nom (ou code EBP) désigne UN seul garage.
  function depuisEbp(pieces, { arrete, garages = [], genUid }) {
    const parNom = new Map(), parCode = new Map();
    garages.forEach(g => { const k = norm(g.nom); parNom.set(k, parNom.has(k) ? null : g.uid); if (g.codeEbp) parCode.set(g.codeEbp, g.uid); });
    const objets = [], ecartes = [];
    for (const p of pieces) {
      const garageUid = (p.code && parCode.get(p.code)) || parNom.get(norm(p.client)) || undefined;
      const o = { uid: genUid(), type: p.type, no: p.no, date: p.date, client: p.client, htCents: p.htCents, arrete, ...(p.code ? { codeEbp: p.code } : {}), ...(p.origine ? { origine: p.origine } : {}), ...(garageUid ? { garageUid } : {}) };
      const e = M.valider('pieceEbp', o); if (e.length) ecartes.push({ no: p.no, motif: e.join(', ') }); else objets.push({ entite: 'pieceEbp', objet: o });
    }
    return { objets, ecartes };
  }

  const api = { depuisTelephone, versTelephone, depuisEbp };
  if (node) module.exports = api;
  else racine.SocleMigration = api;
})(typeof self !== 'undefined' ? self : this);
