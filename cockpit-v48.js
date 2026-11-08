'use strict';
/* ODICOLOR — COCKPIT du téléphone : fonction PURE (aucun accès réseau ni navigateur) qui transforme les données locales en priorités commerciales.
   Utilisable hors ligne, sans PC. Rien n'est inventé : chaque ligne vient d'une donnée saisie (visite, devis, facture, rappel) et dit pourquoi elle est là. */
const ODICOLOR_COCKPIT = (() => {
  const JOUR = 864e5;
  const iso = s => typeof s === 'string' && /^\d{4}-\d\d-\d\d/.test(s) ? s.slice(0, 10) : null;
  const ecart = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / JOUR); // b - a en jours
  const derniereVisite = c => (Array.isArray(c.visites) ? c.visites : []).filter(v => v && v.res === 'vu' && iso(v.date)).map(v => iso(v.date)).sort().pop() || null;
  const ouverts = c => (Array.isArray(c.factures) ? c.factures : []).filter(f => f && !f.regleLe);
  /* d = { auj:'YYYY-MM-DD', clients, devis, ca:{renseigne, moisCents, nFactures, nAvoirs}, objectifMoisCents, jours:{ouvresTotal, ouvresFaits}, relanceJours, totalDevis(d)->cents HT }
     Retour : sections ordonnées, chacune avec sa liste (limitée) et son total réel. */
  function calculer(d) {
    const auj = d.auj, relJ = d.relanceJours || 3, ht = d.totalDevis || (() => 0), lim = (a, n) => ({ total: a.length, lignes: a.slice(0, d.sansLimite ? Infinity : n) });
    const cl = Array.isArray(d.clients) ? d.clients : [], dv = Array.isArray(d.devis) ? d.devis : [];
    const rappels = cl.filter(c => iso(c.rappel) && iso(c.rappel) <= auj).map(c => ({ id: c.id, nom: c.nom, quand: iso(c.rappel), retard: ecart(iso(c.rappel), auj), raison: 'Rappel prévu le ' + iso(c.rappel) })).sort((a, b) => b.retard - a.retard);
    const devisASuivre = dv.filter(x => x.statut === 'envoye' && Array.isArray(x.lignes) && x.lignes.length).map(x => {
      const depuis = ecart(iso(x.relanceLe || x.t2 || x.creeLe) || auj, auj); return { id: x.id, nom: x.clientNom, montant: ht(x), jours: depuis, raison: 'Devis sans réponse depuis ' + depuis + ' j', du: depuis >= relJ };
    }).filter(x => x.du).sort((a, b) => b.montant - a.montant);
    const acceptesSansCommande = dv.filter(x => x.statut === 'accepte' && !x.commandeLe && Array.isArray(x.lignes) && x.lignes.length).map(x => ({ id: x.id, nom: x.clientNom, montant: ht(x), raison: 'Devis accepté, commande non envoyée' })).sort((a, b) => b.montant - a.montant);
    const impayes = cl.flatMap(c => ouverts(c).filter(f => f.echeance && iso(f.echeance) < auj).map(f => ({ id: c.id, nom: c.nom, montant: f.montant || 0, jours: ecart(iso(f.echeance), auj), raison: 'Facture ' + (f.num || 'sans numéro') + ' échue depuis ' + ecart(iso(f.echeance), auj) + ' j' }))).sort((a, b) => b.jours - a.jours);
    const bloques = cl.filter(c => c.compte && c.compte.statut === 'bloque').map(c => ({ id: c.id, nom: c.nom, raison: 'Compte bloqué : ne pas livrer sans vérification' }));
    const prospects = cl.filter(c => c.statutCrm !== 'client' && (c.priorite === 'A' || c.priorite === 'B') && c.conv !== 'refus' && c.conv !== 'converti').map(c => {
      const v = derniereVisite(c), jours = v ? ecart(v, auj) : null;
      return { id: c.id, nom: c.nom, ville: c.ville || c.villeProspection || '', priorite: c.priorite, jours, raison: 'Priorité ' + c.priorite + (v ? ' · vu il y a ' + jours + ' j' : ' · jamais visité') };
    }).filter(p => p.jours == null || p.jours >= 14).sort((a, b) => (a.priorite === b.priorite ? 0 : a.priorite === 'A' ? -1 : 1) || (b.jours == null ? 1e9 : b.jours) - (a.jours == null ? 1e9 : a.jours));
    const risque = cl.filter(c => c.statutCrm === 'client').map(c => {
      const v = derniereVisite(c), jours = v ? ecart(v, auj) : null;
      return { id: c.id, nom: c.nom, jours, raison: v ? 'Client pas vu depuis ' + jours + ' j' : 'Client jamais visité depuis l’appli' };
    }).filter(x => x.jours == null || x.jours > 45).sort((a, b) => (b.jours == null ? 1e9 : b.jours) - (a.jours == null ? 1e9 : a.jours));
    // Réachat : clients dont le code EBP est rattaché à leur fiche ET dont la dernière facture date de plus de N jours (d.facturation = { [idClient]: { derniere, moisCents } }).
    const seuil = d.seuilReachatJours || 60, fact = d.facturation || {};
    const reachat = cl.filter(c => fact[c.id] && fact[c.id].derniere).map(c => ({ id: c.id, nom: c.nom, jours: ecart(fact[c.id].derniere, auj), derniere: fact[c.id].derniere })).filter(x => x.jours > seuil).map(x => ({ ...x, raison: 'Dernière facture il y a ' + x.jours + ' j (' + x.derniere + ')' })).sort((a, b) => b.jours - a.jours);
    const topMois = cl.filter(c => fact[c.id] && fact[c.id].moisCents > 0).map(c => ({ id: c.id, nom: c.nom, montant: fact[c.id].moisCents, raison: 'Facturé ce mois' })).sort((a, b) => b.montant - a.montant);
    // Rythme du CA : prorata des jours ouvrés (seulement si CA saisi et objectif réglé), sinon « non calculable » — jamais un chiffre inventé.
    let rythme = { calculable: false, motif: !d.ca || !d.ca.renseigne ? 'CA facturé non saisi' : !d.objectifMoisCents ? 'objectif du mois non réglé' : 'jours ouvrés indisponibles' };
    if (d.ca && d.ca.renseigne && d.objectifMoisCents > 0 && d.jours && d.jours.ouvresTotal > 0) {
      const attendu = Math.round(d.objectifMoisCents * Math.min(d.jours.ouvresFaits, d.jours.ouvresTotal) / d.jours.ouvresTotal);
      rythme = { calculable: true, attenduCents: attendu, ecartCents: d.ca.moisCents - attendu, pct: Math.round(d.ca.moisCents / d.objectifMoisCents * 100), resteCents: Math.max(0, d.objectifMoisCents - d.ca.moisCents),
        resteParJourOuvre: d.jours.ouvresTotal - d.jours.ouvresFaits > 0 ? Math.ceil(Math.max(0, d.objectifMoisCents - d.ca.moisCents) / (d.jours.ouvresTotal - d.jours.ouvresFaits)) : null };
    }
    return { auj, ca: d.ca || { renseigne: false }, objectifMoisCents: d.objectifMoisCents || 0, rythme,
      sections: [
        { id: 'bloques', titre: 'Comptes bloqués', urgence: 0, ...lim(bloques, 5), lien: c => '#/client/' + c.id },
        { id: 'accepte', titre: 'Devis acceptés à commander', urgence: 1, ...lim(acceptesSansCommande, 5), montant: acceptesSansCommande.reduce((a, x) => a + x.montant, 0), lien: x => '#/devis/' + x.id },
        { id: 'impayes', titre: 'Règlements en retard', urgence: 1, ...lim(impayes, 5), montant: impayes.reduce((a, x) => a + x.montant, 0), lien: x => '#/client/' + x.id },
        { id: 'rappels', titre: 'Rappels du jour et en retard', urgence: 2, ...lim(rappels, 5), lien: x => '#/client/' + x.id },
        { id: 'devis', titre: 'Devis à relancer', urgence: 2, ...lim(devisASuivre, 5), montant: devisASuivre.reduce((a, x) => a + x.montant, 0), lien: x => '#/devis/' + x.id },
        { id: 'prospects', titre: 'Prospects prioritaires à visiter', urgence: 3, ...lim(prospects, 8), lien: x => '#/client/' + x.id },
        { id: 'reachat', titre: 'Clients à relancer : plus de facture récente', urgence: 2, ...lim(reachat, 6), lien: x => '#/client/' + x.id },
        { id: 'top', titre: 'Mes plus gros CA facturés ce mois', urgence: 4, ...lim(topMois, 5), montant: topMois.reduce((a, x) => a + x.montant, 0), lien: x => '#/client/' + x.id },
        { id: 'risque', titre: 'Clients à ne pas laisser dormir', urgence: 3, ...lim(risque, 5), lien: x => '#/client/' + x.id }
      ] };
  }
  return { calculer, derniereVisite, ecart };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_COCKPIT;
