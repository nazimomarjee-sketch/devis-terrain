/* ODICOLOR Bureau — alimenter la Ville LEGO avec le pipeline commercial (MAQUETTE, en attente d'accord).
   Ce module N'EST PAS chargé par bureau/index.html : la Ville reste inchangée tant que le propriétaire n'a pas validé.
   Principe : aucun nouveau dessin. On remplit les états visuels que la Ville sait déjà afficher :
   - statut du personnage : actif (vert) · prospect (bleu) · dormant (orange) · risque (rouge) ;
   - caMois (CA du mois) déjà prévu dans les chiffres de la Ville ;
   - actionsEbp : les actions du plan, pour le fil d'actions existant (pictos Visite, Devis, Relance règlement).
   Règles de vérité :
   - un garage du téléphone n'est relié à EBP que si son nom correspond à UN seul client EBP et réciproquement ;
   - la fiche du téléphone n'est jamais modifiée (copie) ; son étape saisie au téléphone est conservée ;
   - priorité du statut : risque (facture échue ou compte bloqué) > dormant (à reconquérir) > actif (commande sur 12 mois) > statut du téléphone. */
(function (racine) {
  'use strict';
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const plus = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);

  // Pictos du fil d'actions de la Ville (types déjà existants : visite, devis, relance, action).
  const PICTO = { 'Règlement': 'relance', 'Visite': 'visite', 'Devis': 'devis', 'Commande': 'devis', 'Facture': 'action' };

  function alimenterVille(garages, { plan, piecesEbp = [], clientsEbp = [], arrete }) {
    if (!plan || !Array.isArray(plan.actions)) throw new Error('Plan du Bureau absent.');
    arrete = arrete || plan.arrete;
    // Clients EBP vus dans les pièces, le fichier clients et le plan, indexés par nom normalisé.
    const ebp = new Map(), ajoute = (nom, code) => {
      const k = norm(nom); if (!k) return;
      if (!ebp.has(k)) ebp.set(k, { nom, codes: new Set() });
      if (code) ebp.get(k).codes.add(code);
    };
    piecesEbp.forEach(p => ajoute(p.client, p.code)); clientsEbp.forEach(c => ajoute(c.nom, c.code)); plan.clients.forEach(c => ajoute(c.nom, c.code));
    const parNomTel = new Map();
    garages.forEach(g => { const k = norm(g.nom); parNomTel.set(k, (parNomTel.get(k) || 0) + 1); });
    const bloques = new Set(clientsEbp.filter(c => c.bloque).map(c => norm(c.nom)));
    const mois = arrete.slice(0, 8) + '01', an = plus(arrete, -365);
    const rapport = { relies: 0, ambigus: [], sansEbp: 0, ebpSansGarage: [] };
    const relies = new Set();

    const sortie = garages.map(g0 => {
      const g = Object.assign({}, g0), k = norm(g.nom), e = ebp.get(k);
      if (!e) { rapport.sansEbp++; return g; }
      if (parNomTel.get(k) > 1 || e.codes.size > 1) { rapport.ambigus.push(g.nom); return g; } // homonymes : jamais relié au hasard
      relies.add(k); rapport.relies++;
      const cmd = piecesEbp.filter(p => p.type === 'commande' && norm(p.client) === k && p.date <= arrete);
      const fac = piecesEbp.filter(p => p.type === 'facture' && norm(p.client) === k && p.date <= arrete);
      const somme = (l, de) => l.filter(p => p.date >= de).reduce((n, p) => n + p.htCents, 0) / 100;
      const actions = plan.actions.filter(a => norm(a.client) === k).sort((a, b) => a.prio - b.prio);
      const fiche = plan.clients.find(c => norm(c.nom) === k);
      const signaux = (fiche && fiche.signaux) || [];
      const echue = actions.some(a => a.tag === 'Règlement');
      g.statutTelephone = g0.statut;
      g.statut = echue || bloques.has(k) ? 'risque'
        : signaux.some(s => s.type === 'reconquete') ? 'dormant'
        : cmd.some(p => p.date > an) ? 'actif' : g0.statut;
      // Commandes et facturé ne sont JAMAIS confondus : caMois (champ de la Ville) = montant HT des COMMANDES EBP du mois.
      g.caMois = somme(cmd, mois); g.factureMois = somme(fac, mois);
      g.ebp = { code: [...e.codes][0] || '', arrete, ca12: cmd.filter(p => p.date > an).reduce((n, p) => n + p.htCents, 0) / 100, facture12: fac.filter(p => p.date > an).reduce((n, p) => n + p.htCents, 0) / 100,
        commandesMois: cmd.filter(p => p.date >= mois).map(p => p.no), facturesMois: fac.filter(p => p.date >= mois).map(p => p.no),
        derniereCommande: cmd.map(p => p.date).sort().pop() || '', signaux, lignes: fiche ? fiche.lignes : [], compteBloque: bloques.has(k) };
      g.actionsEbp = actions.map(a => ({ id: a.id, prio: a.prio, rang: plan.actions.indexOf(a), t: a.t, d: a.d, preuve: a.preuve, source: a.source, picto: PICTO[a.tag] || 'action', responsable: a.responsable }));
      return g;
    });
    rapport.ebpSansGarage = [...ebp.entries()].filter(([k]) => !relies.has(k) && !parNomTel.has(k)).map(([, v]) => v.nom);
    return { garages: sortie, rapport };
  }

  // Événements du fil d'actions : d'abord les 3 actions prioritaires du plan, puis les étapes saisies au téléphone.
  function filActions(garages, max = 10) {
    const ebp = garages.flatMap(g => (g.actionsEbp || []).map(a => ({ t: a.picto, x: g, prio: a.prio, rang: a.rang, texte: a.t })))
      .sort((a, b) => a.rang - b.rang).map(e => ({ ...e, quand: e.prio === 1 ? 'Priorité du jour' : 'À suivre' }));
    const tel = garages.filter(x => x.etape).sort((a, b) => (a.etapeDate || '9999').localeCompare(b.etapeDate || '9999'))
      .map(x => ({ t: 'action', x, quand: x.etapeDate || 'Sans date', texte: x.etape }));
    return [...ebp, ...tel].slice(0, max);
  }

  const api = { alimenterVille, filActions, PICTO };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.VillePipeline = api;
})(typeof self !== 'undefined' ? self : this);
