/* ODICOLOR 2.0 — Socle 0 : droits d'accès par rôle. Une seule fonction de contrôle, utilisée par la synchronisation.
   Principes :
   - rien n'est jamais supprimé (on archive par un statut) ;
   - EBP reste la source de vérité : une pièce EBP s'importe, ne se modifie jamais ;
   - la direction consulte tout et VALIDE les décisions de direction ; elle ne réécrit pas les fiches terrain ;
   - le responsable du développement pilote et coordonne ; il PROPOSE les décisions de direction sans pouvoir les valider ;
   - rôle ou pôle inactif = aucun droit. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const O = node ? require('./organisation.js') : racine.SocleOrganisation;
  const M = node ? require('./modele.js') : racine.SocleModele;

  const oui = { ok: true, motif: '' }, non = motif => ({ ok: false, motif });
  const CHAMPS_DIRECTION = ['statut', 'motifDirection', 'decideePar', 'decideeLe'];

  // op = { type: 'lire' | 'creer' | 'modifier' | 'importer' | 'supprimer', entite, avant (objet actuel ou null), champs (nouvelles valeurs) }
  function peut(utilisateur, op) {
    if (!utilisateur || utilisateur.actif !== true) return non('Compte absent ou désactivé.');
    if (!O.roleActif(utilisateur.role)) return non('Rôle « ' + utilisateur.role + ' » non activé.');
    const def = M.ENTITES[op.entite]; if (!def) return non('Entité inconnue.');
    if (!O.POLES[def.pole] || !O.POLES[def.pole].actif) return non('Pôle « ' + def.pole + ' » non activé.');
    const r = utilisateur.role, ch = op.champs || {}, av = op.avant || {}, cles = Object.keys(ch);
    if (op.type === 'supprimer') return non('Aucune suppression : archiver par le statut.');
    if (op.type === 'lire') return oui;
    if ('uid' in ch && op.type === 'modifier' && ch.uid !== av.uid) return non('Identifiant non modifiable.');

    switch (op.entite) {
      case 'pieceEbp':
        if (op.type === 'importer' && r === 'developpement') return oui;
        return non('Pièce EBP : import uniquement, jamais modifiée (EBP fait foi).');
      case 'utilisateur':
        return r === 'direction' ? oui : non('Comptes et rôles : réservés à la direction.');
      case 'garage': case 'visite': case 'devisTerrain':
        return r === 'developpement' ? oui : non('Lecture seule pour la direction : les fiches terrain ne sont modifiées que par le terrain.');
      case 'action':
        if (r === 'developpement') return oui;
        if (r === 'direction' && op.type === 'creer' && ch.source === 'direction') return oui; // la direction peut demander une action
        return non('La direction demande des actions (source « direction ») ; leur suivi revient au pilotage.');
      case 'decision': {
        if (op.type === 'creer') {
          if (ch.proposeePar !== utilisateur.uid) return non('Une décision est proposée en son propre nom.');
          if (r === 'developpement') return ch.statut === 'proposee' && !ch.decideePar ? oui : non('Une décision proposée part au statut « proposée » ; seule la direction tranche.');
          return oui; // direction : peut créer et trancher ses propres décisions
        }
        const toucheDirection = cles.some(k => CHAMPS_DIRECTION.includes(k) && !(k === 'statut' && ch.statut === 'proposee'));
        if (r === 'direction') {
          if (cles.some(k => !CHAMPS_DIRECTION.includes(k)) && av.proposeePar !== utilisateur.uid) return non('La direction tranche ; le contenu de la proposition reste celui de son auteur.');
          if (['validee', 'refusee'].includes(ch.statut) && ch.decideePar !== utilisateur.uid) return non('Une décision tranchée indique qui l’a prise.');
          return oui;
        }
        if (toucheDirection) return non('Valider, refuser ou demander un complément relève de la direction.');
        if (av.proposeePar !== utilisateur.uid) return non('Seul l’auteur modifie sa proposition.');
        if (!['proposee', 'a_completer'].includes(av.statut)) return non('Décision déjà tranchée : non modifiable.');
        return oui;
      }
      case 'objectif':
        if (r === 'direction') {
          if (ch.statut === 'valide' && ch.valideePar !== utilisateur.uid) return non('Un objectif validé indique qui l’a validé.');
          return oui;
        }
        if (op.type === 'creer') return ch.statut === 'propose' && !ch.valideePar ? oui : non('Un objectif est proposé ; seule la direction le valide.');
        if (av.statut === 'valide') return non('Objectif validé : seule la direction peut le changer.');
        return cles.some(k => ['statut', 'valideePar'].includes(k)) ? non('Seule la direction valide un objectif.') : oui;
    }
    return non('Opération non prévue.');
  }

  // Lecture : champs sensibles masqués pour les rôles qui ne doivent pas les voir (prévu pour les futurs pôles).
  const SENSIBLES = { pieceEbp: ['htCents'], devisTerrain: ['totalCents'], objectif: ['caCents'], decision: ['montantCents'] };
  function filtrerLecture(utilisateur, entite, objet) {
    if (!peut(utilisateur, { type: 'lire', entite }).ok) return null;
    const voit = O.ROLES[utilisateur.role].voit;
    if (voit.includes('ca')) return Object.assign({}, objet);
    const copie = Object.assign({}, objet);
    for (const k of SENSIBLES[entite] || []) if (k in copie) copie[k] = null;
    return copie;
  }

  const api = { peut, filtrerLecture };
  if (node) module.exports = api;
  else racine.SocleDroits = api;
})(typeof self !== 'undefined' ? self : this);
