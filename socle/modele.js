/* ODICOLOR 2.0 — Socle 0 : modèle de données commun (téléphone, Bureau, Ville, cockpit, supervision).
   Chaque objet a un identifiant unique universel « uid » (fin des identifiants propres à chaque outil).
   Validation stricte et sans réparation silencieuse : un objet invalide est refusé avec la liste des causes.
   Montants en centimes entiers ; dates « AAAA-MM-JJ ». */
(function (racine) {
  'use strict';
  const O = (typeof module === 'object' && module.exports) ? require('./organisation.js') : racine.SocleOrganisation;

  const texte = n => v => typeof v === 'string' && v.trim().length > 0 && v.length <= n;
  const texteLibre = n => v => v == null || (typeof v === 'string' && v.length <= n);
  const date = v => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
  const dateOpt = v => v == null || v === '' || date(v);
  const parmi = l => v => l.includes(v);
  const parmiOpt = l => v => v == null || v === '' || l.includes(v);
  const centimes = v => Number.isSafeInteger(v);
  const centimesOpt = v => v == null || Number.isSafeInteger(v);
  const uid = v => typeof v === 'string' && /^[a-z0-9-]{8,64}$/.test(v);
  const uidOpt = v => v == null || v === '' || uid(v);

  // pole : pôle propriétaire de l'entité (droits) ; immuable : jamais modifiable après création.
  const ENTITES = Object.freeze({
    utilisateur: { pole: 'pilotage', champs: { nom: texte(80), role: parmi(Object.keys(O.ROLES)), actif: v => typeof v === 'boolean' }, obligatoires: ['nom', 'role', 'actif'] },
    garage: { pole: 'commercial', champs: { nom: texte(120), ville: texteLibre(80), cp: texteLibre(10), insee: texteLibre(5), siret: v => v == null || v === '' || /^\d{14}$/.test(v),
      codeEbp: texteLibre(40), statut: parmi(['prospect', 'client', 'dormant', 'perdu']), notes: texteLibre(2000) }, obligatoires: ['nom', 'statut'] },
    visite: { pole: 'commercial', champs: { garageUid: uid, date, resultat: parmi(['vu', 'absent', 'rappeler']), note: texteLibre(1000) }, obligatoires: ['garageUid', 'date', 'resultat'] },
    action: { pole: 'commercial', champs: { titre: texte(200), garageUid: uidOpt, responsable: uid, echeance: dateOpt, priorite: parmi([1, 2, 3]),
      statut: parmi(['a_faire', 'fait', 'reporte', 'bloque']), source: parmi(['terrain', 'plan-ebp', 'direction']), preuve: texteLibre(500) },
      obligatoires: ['titre', 'responsable', 'priorite', 'statut', 'source'] },
    devisTerrain: { pole: 'commercial', champs: { garageUid: uid, totalCents: centimes, statut: parmi(['brouillon', 'envoye', 'accepte', 'refuse']), date },
      obligatoires: ['garageUid', 'totalCents', 'statut', 'date'] },
    decision: { pole: 'pilotage', champs: { type: parmi(O.DECISIONS_DIRECTION.concat(['autre'])), titre: texte(200), expose: texteLibre(2000), montantCents: centimesOpt,
      garageUid: uidOpt, proposeePar: uid, proposeeLe: dateOpt, statut: parmi(['proposee', 'a_completer', 'validee', 'refusee']), motifDirection: texteLibre(1000), decideePar: uidOpt, decideeLe: dateOpt },
      obligatoires: ['type', 'titre', 'proposeePar', 'statut'] },
    objectif: { pole: 'pilotage', champs: { periode: v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v), caCents: centimes, statut: parmi(['propose', 'valide']), valideePar: uidOpt },
      obligatoires: ['periode', 'caCents', 'statut'] },
    // Copie en lecture seule d'une pièce EBP importée (EBP reste la source de vérité ; aucune écriture vers EBP).
    pieceEbp: { pole: 'commercial', champs: { type: parmi(['devis', 'commande', 'bl', 'facture', 'avoir']), no: texte(40), date, client: texte(120), htCents: centimes,
      codeEbp: texteLibre(40), garageUid: uidOpt, origine: texteLibre(40), arrete: date }, obligatoires: ['type', 'no', 'date', 'client', 'htCents', 'arrete'] }
  });

  // Retourne la liste des erreurs (vide = valide). Les champs inconnus sont refusés : rien n'entre sans être prévu.
  function valider(entite, objet) {
    const def = ENTITES[entite]; if (!def) return ['Entité inconnue : ' + entite];
    if (!objet || typeof objet !== 'object' || Array.isArray(objet)) return ['Objet absent'];
    const err = [];
    if (!uid(objet.uid)) err.push('uid invalide');
    for (const k of Object.keys(objet)) {
      if (k === 'uid') continue;
      if (!def.champs[k]) err.push('Champ inconnu : ' + k);
      else if (!def.champs[k](objet[k])) err.push('Valeur invalide : ' + k);
    }
    for (const k of def.obligatoires) if (objet[k] == null || objet[k] === '') err.push('Champ obligatoire : ' + k);
    return err;
  }

  const api = { ENTITES, valider };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.SocleModele = api;
})(typeof self !== 'undefined' ? self : this);
