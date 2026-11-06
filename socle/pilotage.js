/* ODICOLOR 2.0 — Socle 0 : calculs du cockpit (responsable du développement) et de la supervision (direction).
   Lecture seule, sans interface pour l'instant. Aucun chiffre inventé : un objectif non validé est signalé comme tel. */
(function (racine) {
  'use strict';
  const ouverte = a => a.statut === 'a_faire' || a.statut === 'reporte';
  const somme = l => l.reduce((n, x) => n + x, 0);
  const plus = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);

  function resultatsMois(etat, aujourdhui) {
    const mois = aujourdhui.slice(0, 7), cmd = (etat.pieceEbp || []).filter(p => p.type === 'commande' && p.date.slice(0, 7) === mois);
    const fac = (etat.pieceEbp || []).filter(p => p.type === 'facture' && p.date.slice(0, 7) === mois);
    const obj = (etat.objectif || []).find(o => o.periode === mois);
    const caCents = somme(cmd.map(p => p.htCents));
    return { mois, caCommandeCents: caCents, commandes: cmd.length, factureCents: somme(fac.map(p => p.htCents)),
      objectif: obj ? { caCents: obj.caCents, statut: obj.statut } : null,
      avancement: obj && obj.statut === 'valide' && obj.caCents > 0 ? Math.round(caCents / obj.caCents * 100) : null };
  }

  // Cockpit : piloter (mes 3 priorités) et coordonner (demandes de la direction, décisions à préparer, conflits).
  function cockpit(etat, utilisateur, aujourdhui, conflits = []) {
    const actions = (etat.action || []).filter(ouverte);
    const miennes = actions.filter(a => a.responsable === utilisateur.uid)
      .sort((a, b) => a.priorite - b.priorite || (a.echeance || '9999').localeCompare(b.echeance || '9999') || a.titre.localeCompare(b.titre));
    const dec = (etat.decision || []).filter(d => d.proposeePar === utilisateur.uid);
    return {
      priorites: miennes.slice(0, 3),
      enRetard: miennes.filter(a => a.echeance && a.echeance < aujourdhui).length,
      demandesDirection: actions.filter(a => a.source === 'direction'),
      decisionsEnAttente: dec.filter(d => d.statut === 'proposee'),
      decisionsACompleter: dec.filter(d => d.statut === 'a_completer'),
      decisionsTranchees: dec.filter(d => d.statut === 'validee' || d.statut === 'refusee'),
      conflits,
      resultats: resultatsMois(etat, aujourdhui)
    };
  }

  // Supervision : consulter les résultats et trancher les décisions de direction.
  function supervision(etat, aujourdhui) {
    const debutSemaine = plus(aujourdhui, -((new Date(aujourdhui + 'T00:00:00Z').getUTCDay() + 6) % 7));
    const garages = etat.garage || [];
    return {
      aValider: (etat.decision || []).filter(d => d.statut === 'proposee').sort((a, b) => (a.proposeeLe || '').localeCompare(b.proposeeLe || '')),
      objectifsAValider: (etat.objectif || []).filter(o => o.statut === 'propose'),
      resultats: resultatsMois(etat, aujourdhui),
      activite: {
        visitesSemaine: (etat.visite || []).filter(v => v.date >= debutSemaine && v.date <= aujourdhui).length,
        actionsOuvertes: (etat.action || []).filter(ouverte).length,
        actionsBloquees: (etat.action || []).filter(a => a.statut === 'bloque').length,
        garages: { clients: garages.filter(g => g.statut === 'client').length, prospects: garages.filter(g => g.statut === 'prospect').length, dormants: garages.filter(g => g.statut === 'dormant').length }
      }
    };
  }

  const api = { cockpit, supervision, resultatsMois };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.SoclePilotage = api;
})(typeof self !== 'undefined' ? self : this);
