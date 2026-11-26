'use strict';
/* CHARLIE — préparation du matin, bilan du soir et suivi de l'objectif commercial (module pur, testable sous Node).
 * Règles : aucun chiffre, marge, règlement ou visite inventé ; tout manque est affiché « non disponible » ; les trames de questions/objections
 * sont des TRAMES GÉNÉRIQUES à adapter (aucune promesse de prix, de remise ni de performance produit) ; méthodes légales, éthiques, non manipulatrices.
 * Contexte de transition ODICOLOR 2.0 : rassurer et écouter, sans supposer les sentiments du client (consigne de la feuille de Laurent). */
(function (racine) {
  const T = typeof module === 'object' && module.exports ? require('./charlie-optimiseur-v50.js') : racine.TourneeOpt;
  const eur = (c) => (c == null ? 'non disponible' : Math.round(c / 100).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ') + ' € HT');
  const TRAMES = Object.freeze({
    questions: { prospect: ['Qui décide des achats de peinture et consommables ?', 'Chez quel fournisseur achetez-vous aujourd’hui, et qu’est-ce qui fonctionne bien ou moins bien ?', 'Combien de véhicules passent en cabine par semaine (estimation) ?', 'Quel est votre principal irritant (délai, teinte, reprises, rupture) ?'],
      client: ['Comment se sont passées vos dernières commandes et livraisons ?', 'Y a-t-il un sujet en cours (litige, retard, produit) à traiter en priorité ?', 'Que changeriez-vous dans notre service ?'],
      dormant: ['Qu’est-ce qui a changé depuis votre dernière commande ?', 'Avez-vous eu une difficulté avec nous que nous devons connaître ?', 'Quels produits achetez-vous maintenant, et ailleurs ?'],
      devis_a_relancer: ['Le devis vous convient-il ou manque-t-il un élément pour décider ?', 'Quand pensez-vous pouvoir décider, et qui valide ?', 'Un essai sur un produit précis vous aiderait-il ?'] },
    objections: [{ objection: 'Je suis fidèle à mon fournisseur actuel', approche: 'Écouter ; demander ce qui compte le plus (délai, qualité, prix, service) ; proposer un essai limité sur UN besoin, sans critiquer le fournisseur.' },
      { objection: 'C’est trop cher', approche: 'Clarifier : cher par rapport à quoi ? Comparer à produit équivalent et coût d’usage ; ne promettre AUCUNE remise sans validation du responsable.' },
      { objection: 'Je ne sais pas ce que devient l’entreprise (changements récents)', approche: 'Reconnaître le changement, donner uniquement des faits confirmés (interlocuteurs, livraison, continuité), noter les questions sans réponse et les remonter ; ne rien promettre non validé.' },
      { objection: 'Envoyez-moi un devis', approche: 'Demander les références/quantités et la date de décision ; préparer le devis dans EBP après la visite (le devis se réalise dans EBP).' }],
    transition: 'Contexte de transition : écouter et rassurer, sans supposer les sentiments du client ; ne s’engager que sur ce qui est confirmé.' });

  // fiche d'un garage planifié : uniquement les faits connus (planifié par CHARLIE + fiche + EBP)
  function fiche(o, client, finance) {
    const vis = ((client && client.visites) || []).filter((v) => v && v.res === 'vu'), f = finance || null, vigilance = [], infos = [];
    if (f && f.bloque) vigilance.push('COMPTE BLOQUÉ : aucune vente sans validation du responsable.');
    if (f && f.retardCents > 0) vigilance.push('Règlement en retard : ' + eur(f.retardCents) + ' — voir avec le responsable avant toute commande.');
    if (o.dureeSource && /HYPOTH/.test(o.dureeSource)) infos.push('Durée de visite = hypothèse (aucune visite mesurée).');
    if (o.manquants && o.manquants.includes('ca_ebp')) infos.push('CA EBP non disponible (aucun import vérifié).');
    if (o.manquants && o.manquants.includes('marge')) infos.push('Marge non disponible (prix d’achat EBP absent).');
    if (!vis.length) infos.push('Aucune visite enregistrée.');
    const type = o.type || 'client';
    return { garageId: o.garageId, nom: o.nom, heure: o.debut, laurent: !!o.laurent, rdv: !!o.rdv, type, adresse: o.adresse || null, positionApproximative: o.posQualite === 'commune',
      resume: { statut: client ? client.statutCrm || 'prospect' : null, priorite: client ? client.priorite || null : null, visitesVues: vis.length, derniereVisite: vis.length ? vis[vis.length - 1].date : null, ca12: f && f.source === 'EBP' ? eur(f.ca12Cents) : 'non disponible', derniereFacture: f && f.derniereFacture || 'non disponible', encours: f ? eur(f.encoursCents) : 'non disponible' },
      pourquoi: (o.composantes || []).map((c) => c.detail), questions: TRAMES.questions[type] || TRAMES.questions.client, vigilance, informationsManquantes: infos };
  }
  // Matin : tournée validée + fiches + 3 actions prioritaires (jamais plus de 3, chacune avec sa preuve).
  function preparerMatin({ jour, plan, clients = [], finance = () => null, objectif = null }) {
    const parId = new Map(clients.map((c) => [String(c.id), c])), fiches = (plan ? plan.ordre : []).map((o) => fiche(o, parId.get(o.garageId), finance(parId.get(o.garageId) || { id: o.garageId })));
    const actions = [];
    const oblig = fiches.filter((f) => f.laurent);
    if (oblig.length) actions.push({ ordre: 0, action: 'Réaliser les ' + oblig.length + ' passage(s) de la feuille de Laurent' + (plan.nonPlanifies && plan.nonPlanifies.some((n) => n.obligatoire) ? ' — ATTENTION : ' + plan.nonPlanifies.filter((n) => n.obligatoire).length + ' ne tiennent pas, décision de Laurent requise' : ''), preuve: 'Feuille de Laurent du ' + jour, source: 'feuille de Laurent' });
    const devis = fiches.filter((f) => f.type === 'devis_a_relancer'); if (devis.length) actions.push({ ordre: 0, action: 'Relancer le(s) devis en attente : ' + devis.map((d) => d.nom).join(', '), preuve: 'Devis envoyé(s) sans retour (données de l’application)', source: 'application' });
    const alerte = fiches.filter((f) => f.vigilance.length); if (alerte.length) actions.push({ ordre: 0, action: 'Traiter avec le responsable avant la vente : ' + alerte.map((a) => a.nom).join(', '), preuve: alerte[0].vigilance[0], source: 'EBP / fiche' });
    const dorm = fiches.filter((f) => f.type === 'dormant' && !f.laurent); if (dorm.length) actions.push({ ordre: 0, action: 'Réactiver : ' + dorm.slice(0, 2).map((d) => d.nom).join(', '), preuve: 'Client non vu depuis longtemps (fiche)', source: 'application' });
    const prios = actions.slice(0, 3).map((a, i) => ({ ...a, ordre: i + 1 }));
    return { jour, troisActions: prios, fiches, objections: TRAMES.objections, transition: TRAMES.transition, objectif, vigilance: fiches.flatMap((f) => f.vigilance.map((v) => f.nom + ' : ' + v)), validationHumaineRequise: false,
      avertissement: 'Trames génériques : aucune remise, prix ou délai n’est promis ; tout engagement passe par le responsable.' };
  }
  // Soir : prévu/réalisé + difficultés + relances + ajustements + journée suivante (rien d'envoyé, rien d'écrit dans EBP).
  function bilanSoir({ jour, plan, reel = [], journal = null, prochainJour = null }) {
    if (!plan) throw new Error('Aucune tournée validée : pas de bilan.');
    const cmp = T.comparerPrevuReel(plan, reel), difficultes = [], relances = [];
    cmp.lignes.forEach((l) => { if (l.resultat === 'absent') relances.push({ garageId: l.garageId, nom: l.nom, action: 'Rappeler / repasser (client absent)', echeanceSuggeree: 'sous 2 jours ouvrés (règle de l’application)' }); if (l.dureeReelleMin != null && l.dureePrevueMin != null && l.resultat === 'vu' && l.dureeReelleMin > l.dureePrevueMin * 1.25) difficultes.push('Visite chez ' + (l.nom || '#' + l.garageId) + ' : ' + l.dureeReelleMin + ' min au lieu de ' + l.dureePrevueMin + ' min prévues'); if (l.ecartArriveeMin != null && Math.abs(l.ecartArriveeMin) >= 30) difficultes.push('Arrivée chez ' + (l.nom || '#' + l.garageId) + ' avec ' + l.ecartArriveeMin + ' min d’écart'); });
    cmp.nonFaits.forEach((n) => { relances.push({ garageId: n.garageId, nom: n.nom, action: n.laurent ? 'Passage de Laurent non réalisé : à signaler à Laurent, report à valider' : 'Visite non réalisée : à reporter', echeanceSuggeree: 'prochain jour du secteur' }); });
    const ens = journal ? T.enseignements(journal) : [];
    return { jour, prevuRealise: cmp, difficultes, relances, ajustementsProposes: ens.map((e) => ({ ...e, application: 'proposition : à valider' })), journeeSuivante: prochainJour || 'à préparer demain matin (secteur et feuille de Laurent)',
      resultatsCommerciaux: { visitesVues: cmp.vus, absents: cmp.absents, devisEnvoyes: 'non disponible (à saisir)', commandes: 'non disponible (à saisir)' }, memoire: { aEnregistrer: ['journee', 'visites', 'absences', 'enseignements'], donneesInventees: 0 } };
  }
  // Objectif : 20 000 € HT mensuels facturés d'ici fin février 2027. Le point de départ vient UNIQUEMENT des factures EBP importées ; sinon « inconnu ».
  function suivreObjectif({ ciblesCents = 2000000, echeance = '2027-02-28', mois = {}, aujourdhui }) {
    const cles = Object.keys(mois).sort(), connu = cles.length > 0, dernier = connu ? mois[cles[cles.length - 1]] : null;
    const reste = Math.max(0, Math.round((Date.parse(echeance + 'T12:00:00Z') - Date.parse(aujourdhui + 'T12:00:00Z')) / 864e5 / 30.4));
    if (!connu) return { statut: 'BASE_INCONNUE', message: 'Aucun CA facturé EBP importé : impossible de calculer la trajectoire sans inventer. Importer l’export de factures.', ciblesCents, echeance, moisRestants: reste };
    const jalons = []; for (let i = 1; i <= Math.max(1, reste); i++) jalons.push({ mois: i, objectifCents: Math.round(dernier + (ciblesCents - dernier) * i / Math.max(1, reste)) });
    return { statut: 'TRAJECTOIRE_INDICATIVE', dernierMoisCents: dernier, ciblesCents, echeance, moisRestants: reste, ecartCents: ciblesCents - dernier, multiple: Math.round(ciblesCents / Math.max(1, dernier) * 10) / 10, jalonsLineaires: jalons,
      note: 'Jalons LINÉAIRES indicatifs (hypothèse de progression régulière) ; aucune garantie de résultat. Leviers à tester et mesurer : réactiver les dormants, convertir les devis, élargir le portefeuille sur les secteurs de Laurent.' };
  }
  const API = { TRAMES, fiche, preparerMatin, bilanSoir, suivreObjectif };
  if (typeof module === 'object' && module.exports) module.exports = API; else racine.CharlieCommercial = API;
})(typeof window !== 'undefined' ? window : globalThis);
