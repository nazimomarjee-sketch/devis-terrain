/* ODICOLOR 2.0 — Offres de conquête : mesure du coût d'acquisition d'un client et de sa rentabilité dans le temps.
   Logique pure (aucune interface). Montants en centimes. Aucun chiffre inventé :
   - un coût d'achat ou un coût de cadeau inconnu rend la marge « non calculable » (null), jamais estimée ;
   - le chiffre d'affaires et la marge RÉELS viennent des pièces EBP (commandes ; marge si l'export la fournit) ;
   - commandes et facturé ne sont pas mélangés : le suivi des réachats porte sur les COMMANDES EBP.
   Définitions (HYPOTHÈSES à valider avec la direction) :
   - coût d'acquisition = remises accordées par rapport au tarif + coût réel des cadeaux ;
   - rentabilité = marge EBP cumulée depuis le début de l'offre − coût réel des cadeaux
     (la remise est déjà incluse dans la marge réelle : elle n'est pas retirée une seconde fois) ;
   - verdict à J90 : « conquête réussie » si rentable ET au moins un réachat ; « opération déficitaire » si non rentable ;
     « à surveiller » si rentable sans réachat. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const O = node ? require('./organisation.js') : racine.SocleOrganisation;
  const plus = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);
  const ecart = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);
  const sommeOuNull = l => (l.some(v => v == null) ? null : l.reduce((n, v) => n + v, 0));

  // Prix appliqué : palier dégressif le plus élevé atteint par la quantité, sinon prix de l'offre.
  function prixApplique(l) {
    const p = (l.paliers || []).filter(x => l.quantite >= x.aPartirDe).sort((a, b) => b.aPartirDe - a.aPartirDe)[0];
    return p ? p.prixCents : l.prixOffreCents;
  }

  // Chiffrage prévisionnel de l'offre (à la proposition).
  function chiffrer(offre) {
    const lignes = offre.lignes.map(l => {
      const prix = prixApplique(l), ca = prix * l.quantite;
      return { produit: l.produit, quantite: l.quantite, prixTarifCents: l.prixTarifCents, prixAppliqueCents: prix, caCents: ca,
        remiseCents: (l.prixTarifCents - prix) * l.quantite, coutCents: l.coutAchatCents == null ? null : l.coutAchatCents * l.quantite };
    });
    const ca = lignes.reduce((n, l) => n + l.caCents, 0), tarif = offre.lignes.reduce((n, l) => n + l.prixTarifCents * l.quantite, 0);
    const remise = lignes.reduce((n, l) => n + l.remiseCents, 0);
    const coutMarchandise = sommeOuNull(lignes.map(l => l.coutCents)), coutCadeaux = sommeOuNull(offre.cadeaux.map(c => c.coutReelCents));
    const marge = coutMarchandise == null || coutCadeaux == null ? null : ca - coutMarchandise - coutCadeaux;
    const R = O.REGLES_OFFRES_CONQUETE, alertes = [];
    if (marge == null) alertes.push('Marge non calculable : coût d’achat ou coût de cadeau inconnu.');
    else if (ca > 0 && marge / ca < R.alerteTauxMargeMin) alertes.push('Taux de marge prévu ' + Math.round(marge / ca * 100) + ' % (seuil ' + Math.round(R.alerteTauxMargeMin * 100) + ' %).');
    if (tarif > 0 && remise / tarif > R.alerteRemiseMax) alertes.push('Remise ' + Math.round(remise / tarif * 100) + ' % du tarif (seuil ' + Math.round(R.alerteRemiseMax * 100) + ' %).');
    if (coutCadeaux != null && coutCadeaux > R.alerteCadeauMaxCents) alertes.push('Cadeaux au-delà du seuil de ' + R.alerteCadeauMaxCents / 100 + ' €.');
    if (offre.debut && offre.fin && ecart(offre.debut, offre.fin) > R.dureeMaxJours) alertes.push('Durée au-delà de ' + R.dureeMaxJours + ' jours.');
    return { lignes, tarifCents: tarif, caCents: ca, remiseCents: remise, coutMarchandiseCents: coutMarchandise, coutCadeauxCents: coutCadeaux,
      margeCents: marge, tauxMarge: marge == null || !ca ? null : Math.round(marge / ca * 1000) / 1000,
      coutAcquisitionCents: coutCadeaux == null ? null : remise + coutCadeaux,
      validationDirection: R.validationToujours || alertes.length > 0, alertes };
  }

  // Suivi réel à partir des commandes EBP du client depuis le début de l'offre.
  function suivre(offre, commandesClient, aujourdhui) {
    if (!offre.debut) return { statut: 'non_demarree' };
    const cmd = commandesClient.filter(p => p.type === 'commande' && p.date >= offre.debut && p.date <= aujourdhui).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
    const initiale = cmd[0] || null, reachats = cmd.slice(1);
    const fenetre = j => { const l = reachats.filter(p => p.date <= plus(offre.debut, j)); return { commandes: l.length, caCents: l.reduce((n, p) => n + p.htCents, 0), pieces: l.map(p => p.no), atteint: ecart(offre.debut, aujourdhui) >= j }; };
    const ca = cmd.reduce((n, p) => n + p.htCents, 0), marge = sommeOuNull(cmd.map(p => p.margeCents));
    const ch = chiffrer(offre), cadeaux = ch.coutCadeauxCents;
    const net = marge == null || cadeaux == null ? null : marge - cadeaux;
    // Seuil de rentabilité : première commande à partir de laquelle la marge cumulée couvre le coût des cadeaux.
    let cumul = 0, seuil = null;
    if (net != null) for (const p of cmd) { cumul += p.margeCents; if (cumul - cadeaux >= 0) { seuil = p.date; break; } }
    const j90 = ecart(offre.debut, aujourdhui) >= 90, r90 = fenetre(90);
    let verdict;
    if (!initiale) verdict = 'sans_commande';
    else if (net == null) verdict = 'non_calculable';
    else if (!j90) verdict = 'en_cours';
    else verdict = net < 0 ? 'deficitaire' : r90.commandes > 0 ? 'reussie' : 'a_surveiller';
    const engagement = offre.engagementCents == null ? null : { attenduCents: offre.engagementCents, realiseCents: ca, taux: offre.engagementCents ? Math.round(ca / offre.engagementCents * 100) : null };
    return { statut: offre.statut, commandeInitiale: initiale ? initiale.no : null, reachats: { j30: fenetre(30), j60: fenetre(60), j90: r90 },
      caCumuleCents: ca, margeCumuleeCents: marge, margeNetteCents: net, coutAcquisitionCents: ch.coutAcquisitionCents,
      seuilRentabilite: seuil, joursDepuisDebut: ecart(offre.debut, aujourdhui), engagement, verdict,
      libelleVerdict: { reussie: 'Conquête réussie', deficitaire: 'Opération déficitaire', a_surveiller: 'Rentable, sans réachat : à surveiller', en_cours: 'En cours de mesure',
        non_calculable: 'Marge non calculable (coûts ou marges EBP manquants)', sans_commande: 'Aucune commande EBP depuis le début de l’offre' }[verdict] };
  }

  // Cockpit : toutes les Offres de conquête, avec chiffrage, suivi et totaux.
  function tableau(offres, piecesEbp, aujourdhui, cleClient = p => p.garageUid) {
    const lignes = offres.map(o => {
      const cmd = piecesEbp.filter(p => cleClient(p) === o.garageUid);
      return { uid: o.uid, garageUid: o.garageUid, titre: o.titre, statut: o.statut, cadeaux: o.cadeaux, chiffrage: chiffrer(o), suivi: suivre(o, cmd, aujourdhui) };
    });
    const mesurees = lignes.filter(l => l.suivi.verdict && !['en_cours', 'non_demarree'].includes(l.suivi.verdict) && l.suivi.statut !== 'non_demarree');
    const n = v => lignes.filter(l => l.suivi.verdict === v).length;
    return { offres: lignes, aValider: lignes.filter(l => l.statut === 'proposee'), enCours: lignes.filter(l => l.statut === 'en_cours'),
      bilan: { reussies: n('reussie'), deficitaires: n('deficitaire'), aSurveiller: n('a_surveiller'), nonCalculables: n('non_calculable'), mesurees: mesurees.length,
        coutAcquisitionTotalCents: sommeOuNull(lignes.filter(l => l.suivi.commandeInitiale).map(l => l.suivi.coutAcquisitionCents)),
        margeNetteTotaleCents: sommeOuNull(lignes.filter(l => l.suivi.commandeInitiale).map(l => l.suivi.margeNetteCents)) } };
  }

  const api = { prixApplique, chiffrer, suivre, tableau };
  if (node) module.exports = api;
  else racine.SocleOffresConquete = api;
})(typeof self !== 'undefined' ? self : this);
