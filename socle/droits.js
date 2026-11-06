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
  // Pendant une offre, seul l'état « remis » des cadeaux peut changer (libellés et coûts validés figés).
  const memesCadeaux = (a = [], b = []) => a.length === b.length && a.every((c, i) => c.libelle === b[i].libelle && c.coutReelCents === b[i].coutReelCents);

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
      case 'offreConquete': {
        // Le développement prépare et suit ; la direction valide ou refuse. Une offre ne démarre qu'une fois validée.
        if (op.type === 'creer') {
          if (r !== 'developpement') return non('Les Offres de conquête sont préparées par le pilotage commercial.');
          if (ch.proposeePar !== utilisateur.uid) return non('Une Offre de conquête est proposée en son propre nom.');
          return ['brouillon', 'proposee'].includes(ch.statut) && !ch.valideePar ? oui : non('Une Offre de conquête part en brouillon ou proposée ; seule la direction la valide.');
        }
        const vers = ch.statut, de = av.statut;
        if (r === 'direction') {
          if (cles.some(k => !['statut', 'valideePar', 'valideeLe', 'motifDirection'].includes(k))) return non('La direction valide ; le contenu de l’offre reste celui de son auteur.');
          if (!['validee', 'refusee', 'proposee', undefined].includes(vers)) return non('La direction valide, refuse ou renvoie en proposition.');
          if (vers === 'validee' && ch.valideePar !== utilisateur.uid) return non('Une offre validée indique qui l’a validée.');
          return de === 'proposee' ? oui : non('Seule une offre proposée peut être validée ou refusée.');
        }
        if (cles.some(k => ['valideePar', 'valideeLe', 'motifDirection'].includes(k)) || ['validee', 'refusee'].includes(vers)) return non('Valider ou refuser une Offre de conquête relève de la direction.');
        if (['brouillon', 'proposee'].includes(de)) return vers == null || ['brouillon', 'proposee', 'annulee'].includes(vers) ? oui : non('Une offre non validée ne peut pas démarrer.');
        if (de === 'validee') return cles.every(k => ['statut', 'debut', 'fin'].includes(k)) && ['en_cours', 'annulee', undefined].includes(vers) ? oui : non('Offre validée : seuls le démarrage et les dates sont modifiables ; les conditions validées sont figées.');
        if (de === 'en_cours') return cles.every(k => ['statut', 'cadeaux', 'termineeLe', 'bilan', 'fin'].includes(k)) && ['terminee', undefined].includes(vers) && (!('cadeaux' in ch) || memesCadeaux(av.cadeaux, ch.cadeaux)) ? oui : non('Offre en cours : seuls la remise des cadeaux, la fin et le bilan sont modifiables.');
        return non('Offre terminée, refusée ou annulée : historique figé.');
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
