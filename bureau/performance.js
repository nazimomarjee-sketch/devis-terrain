/* ODICOLOR 2.0 — Lot 6 : PILOTAGE DE LA PERFORMANCE COMMERCIALE (Bureau). Logique pure, LECTURE SEULE.
   Sources : exports EBP (pièces, avoirs, règlements, clients), demandes de devis du téléphone, garages du téléphone.
   Règles générales : chiffre absent = null (« Non renseigné ») avec sa cause ; aucune estimation présentée comme un fait ;
   rattachement par identifiant (code client EBP, n° de pièce) uniquement ; aucune intelligence artificielle : des règles écrites.
   Montants en centimes entiers, dates « AAAA-MM-JJ ». */
(function (racine) {
  'use strict';
  const norm = s => String(s == null ? '' : s).trim();
  const ajouter = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const moisDe = d => d.slice(0, 7), debutMois = d => d.slice(0, 7) + '-01';
  const finMois = d => { const [a, m] = d.slice(0, 7).split('-').map(Number); return d.slice(0, 7) + '-' + String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0'); };
  const moisPrec = d => ajouter(debutMois(d), -1);
  const moinsMois = (d, n) => { const [a, m] = d.slice(0, 7).split('-').map(Number), t = new Date(Date.UTC(a, m - 1 - n, 1)); return t.toISOString().slice(0, 10); };
  const jours = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

  // ---------- 1. Consolidation des imports successifs ----------
  // lots : [{ provenance:{fichier, empreinte, importeLe, dateFichier}, pieces, avoirs, ignorees, liens }] du plus ancien au plus récent.
  // Même fichier (même empreinte) réimporté : ignoré. Même pièce (type + n°) identique : comptée une fois. Même pièce modifiée
  // entre deux exports : la plus récente fait foi, l'écart est listé (EBP peut corriger une pièce).
  function consolider(lots) {
    const vus = new Set(), parCle = new Map(), modifiees = [], doublonsFichier = [], retenus = [];
    for (const l of lots || []) {
      const emp = l && l.provenance && l.provenance.empreinte;
      if (emp && vus.has(emp)) { doublonsFichier.push(l.provenance.fichier || emp); continue; }
      if (emp) vus.add(emp); retenus.push(l);
      for (const p of (l.pieces || []).map(x => ({ ...x })).concat((l.avoirs || []).map(a => ({ ...a, type: 'avoir' })))) {
        const k = p.type + '|' + p.no, a = parCle.get(k);
        if (a && (a.htCents !== p.htCents || a.date !== p.date || norm(a.code) !== norm(p.code))) modifiees.push({ no: p.no, type: p.type, avant: { date: a.date, htCents: a.htCents }, apres: { date: p.date, htCents: p.htCents } });
        parCle.set(k, p);
      }
    }
    const tout = [...parCle.values()], datesP = tout.map(p => p.date).filter(Boolean).sort();
    const dernier = retenus[retenus.length - 1];
    return { pieces: tout.filter(p => p.type !== 'avoir'), avoirs: tout.filter(p => p.type === 'avoir'), ignorees: retenus.flatMap(l => l.ignorees || []),
      liens: retenus.length ? retenus.every(l => l.liens) : false, modifiees, doublonsFichier, imports: retenus.length,
      couverture: datesP.length ? { debut: datesP[0], fin: datesP[datesP.length - 1] } : null,
      dernierImport: dernier && dernier.provenance ? { fichier: dernier.provenance.fichier, le: dernier.provenance.importeLe || null } : null };
  }

  // ---------- 2. Catégories de clientèle (règles datées du 14/11/2026) ----------
  const REGLES_CATEGORIES = {
    date: '2026-11-14', fenetreMois: 12,
    existant: 'Client facturé ce mois ET déjà facturé dans les 12 mois précédents.',
    nouveau: 'Client facturé ce mois, JAMAIS facturé avant ; exige un historique EBP couvrant les 12 mois précédents.',
    reactive: 'Client facturé ce mois, facturé avant mais PAS dans les 12 mois précédents ; exige un historique couvrant ces 12 mois.',
    non_determine: 'Historique EBP trop court pour trancher entre nouveau, réactivé et existant.',
    prospect: 'Garage du téléphone sans code client EBP et sans facture : prospect non converti.'
  };
  function categories({ pieces = [], avoirs = [], couverture = null, aujourdhui, garages = [] }) {
    const debut = debutMois(aujourdhui), fin = finMois(aujourdhui), dFenetre = moinsMois(aujourdhui, 12);
    const historiqueSuffisant = !!(couverture && couverture.debut <= dFenetre);
    const factures = pieces.filter(p => p.type === 'facture' && p.date), parCode = new Map();
    for (const f of factures) { const c = norm(f.code); if (!c) continue; if (!parCode.has(c)) parCode.set(c, []); parCode.get(c).push(f); }
    const avParCode = new Map(); for (const a of avoirs) { const c = norm(a.code); if (c && a.date >= debut && a.date <= fin) avParCode.set(c, (avParCode.get(c) || 0) - Math.abs(a.htCents || 0)); }
    const res = { existant: [], nouveau: [], reactive: [], non_determine: [] };
    for (const [code, fs] of parCode) {
      const duMois = fs.filter(f => f.date >= debut && f.date <= fin); if (!duMois.length) continue;
      const avant = fs.filter(f => f.date < debut), dans12 = avant.filter(f => f.date >= dFenetre);
      const cat = dans12.length ? 'existant' : !historiqueSuffisant ? 'non_determine' : avant.length ? 'reactive' : 'nouveau';
      res[cat].push({ code, client: duMois[0].client, htCents: duMois.reduce((s, f) => s + f.htCents, 0) + (avParCode.get(code) || 0), derniereAvant: avant.map(f => f.date).sort().pop() || null });
    }
    const somme = l => l.reduce((s, x) => s + x.htCents, 0);
    const prospects = (garages || []).filter(g => g && !g.codeEbp && !(g.liaisonEbp && g.liaisonEbp.code) && (g.statutCrm || 'prospect') !== 'client');
    return { regles: REGLES_CATEGORIES, historiqueSuffisant, fenetreDebut: dFenetre,
      lignes: Object.fromEntries(Object.entries(res).map(([k, l]) => [k, { nb: l.length, htCents: somme(l), clients: l.sort((a, b) => b.htCents - a.htCents) }])),
      avoirsSansFactureCents: [...avParCode.entries()].filter(([c]) => !res.existant.concat(res.nouveau, res.reactive, res.non_determine).some(x => x.code === c)).reduce((x, [, v]) => x + v, 0),
      prospectsNonConvertis: { nb: prospects.length }, sansCode: factures.filter(f => !norm(f.code) && f.date >= debut && f.date <= fin).length, sansCodeCents: factures.filter(f => !norm(f.code) && f.date >= debut && f.date <= fin).reduce((x, f) => x + f.htCents, 0) };
  }

  // ---------- 3. Objectif, projection, mois précédent ----------
  // ca : résultat de CaFacture.calculer (mois en cours) ; caPrec : idem pour le mois précédent (ou null).
  function objectif({ ca, caPrec = null, objectifCents = null, aujourdhui, joursOuvres, couverture = null }) {
    const fait = ca && ca.statut === 'renseigne' ? ca.totalCents : null;
    const r = { faitCents: fait, objectifCents: objectifCents || null, resteCents: null, pct: null, projection: null, moisPrecedent: null, motifs: [] };
    if (fait == null) r.motifs.push(ca && ca.motif ? ca.motif : 'CA du mois non calculable');
    if (!objectifCents) r.motifs.push('Objectif mensuel non saisi');
    if (fait != null && objectifCents) { r.resteCents = Math.max(0, objectifCents - fait); r.pct = Math.round(fait / objectifCents * 100); }
    if (fait != null && ca.fin) {
      const d0 = debutMois(aujourdhui), ecoules = joursOuvres(ajouter(d0, -1), ca.fin), total = joursOuvres(ajouter(d0, -1), finMois(aujourdhui));
      if (ecoules >= 3 && total > 0) r.projection = { cents: Math.round(fait / ecoules * total), base: 'Rythme des ' + ecoules + ' jours ouvrés écoulés appliqué aux ' + total + ' jours ouvrés du mois', estimation: true };
      else r.motifs.push('Projection non calculée : moins de 3 jours ouvrés de données ce mois-ci');
    }
    // Mois précédent comparable seulement si l'export va jusqu'à sa fin ET si les pièces couvrent son début (sinon il paraîtrait vide).
    if (caPrec && caPrec.statut === 'renseigne' && caPrec.fin === finMois(caPrec.debut) && couverture && couverture.debut <= caPrec.debut) r.moisPrecedent = { cents: caPrec.totalCents, libelle: caPrec.libelleMois };
    else r.motifs.push('Mois précédent incomplet dans les exports : comparaison non disponible');
    return r;
  }

  // ---------- 4. Recommandations explicables (règles, pas d'IA) ----------
  const SEUILS = { devisSansCommandeJours: 10, commandeSansFactureJours: 15, demandeRelanceJours: 7, dormantMinJours: 90, dormantMaxJours: 365 };
  function recommandations({ pieces = [], reglements = null, clientsEbp = [], demandes = [], liens = false, arrete, couverture = null, seuils = {} }) {
    const S = Object.assign({}, SEUILS, seuils), out = [], bloques = new Set((clientsEbp || []).filter(c => c && c.bloque).map(c => c.code));
    const add = (type, cle, garage, raison, preuve, priorite, action) => out.push({ id: type + '|' + cle, type, garage, raison, preuve, priorite, action });
    const parOrigine = new Map(); for (const p of pieces) if (p.origine) { if (!parOrigine.has(p.origine)) parOrigine.set(p.origine, []); parOrigine.get(p.origine).push(p); }
    const suite = no => { const r = [], f = [no], v = new Set([no]); while (f.length) for (const e of parOrigine.get(f.shift()) || []) if (!v.has(e.no)) { v.add(e.no); r.push(e); f.push(e.no); } return r; };
    if (liens) {
      for (const d of pieces.filter(p => p.type === 'devis')) {
        const j = jours(d.date, arrete);
        if (j >= S.devisSansCommandeJours && !suite(d.no).some(p => p.type === 'commande' || p.type === 'facture'))
          add('devis_a_relancer', d.no, d.client, 'Devis EBP ' + d.no + ' sans commande depuis ' + j + ' jours', [d.no], j > 30 ? 2 : 1, 'Relancer le client sur le devis');
      }
      for (const c of pieces.filter(p => p.type === 'commande')) {
        const j = jours(c.date, arrete), bl = bloques.has(norm(c.code));
        if ((j >= S.commandeSansFactureJours || bl) && !suite(c.no).some(p => p.type === 'facture'))
          add('commande_bloquee', c.no, c.client, bl ? 'Commande ' + c.no + ' d’un compte BLOQUÉ dans EBP' : 'Commande ' + c.no + ' non facturée depuis ' + j + ' jours', [c.no], 1, bl ? 'Voir avec la direction avant toute livraison' : 'Vérifier avec Mohamed : livraison, BL, facturation');
      }
    }
    for (const d of demandes || []) {
      const env = ((d.historique || []).filter(h => h.etape === 'envoye').pop() || {}).le;
      if (d.statut === 'envoye' && env && jours(env.slice(0, 10), arrete) >= S.demandeRelanceJours)
        add('devis_a_relancer', 'tel-' + d.uid, d.clientNom, 'Devis ' + (d.noDevisEbp || '') + ' envoyé il y a ' + jours(env.slice(0, 10), arrete) + ' jours, sans réponse', [d.noDevisEbp || d.uid], 1, 'Relancer (appel ou WhatsApp manuel)');
      if (d.statut === 'accepte' && liens && d.noDevisEbp && !suite(d.noDevisEbp).some(p => p.type === 'commande'))
        add('commande_bloquee', 'tel-' + d.uid, d.clientNom, 'Devis ' + d.noDevisEbp + ' accepté par le client mais aucune commande dans EBP', [d.noDevisEbp], 1, 'Faire saisir la commande dans EBP');
    }
    if (Array.isArray(reglements)) {
      for (const r of reglements) {
        if (r.resteCents == null) add('facture_a_surveiller', r.facture + '|' + r.echeance, '', 'Facture ' + r.facture + ' : règlement daté sans montant, solde non vérifiable', [r.facture], 2, 'Vérifier le règlement dans EBP');
        else if (r.resteCents > 0 && r.echeance < arrete) add('facture_a_surveiller', r.facture + '|' + r.echeance, '', 'Facture ' + r.facture + ' échue depuis ' + jours(r.echeance, arrete) + ' jours, reste ' + new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.resteCents / 100) + ' € TTC', [r.facture], jours(r.echeance, arrete) > 30 ? 1 : 2, 'Relancer le règlement');
      }
    }
    // Dormants : dernière facture entre 90 et 365 jours, seulement si l'historique couvre la période (sinon on ne sait pas).
    if (couverture && couverture.debut <= ajouter(arrete, -S.dormantMaxJours)) {
      const der = new Map(), ca12 = new Map();
      for (const f of pieces.filter(p => p.type === 'facture' && norm(p.code))) { const c = norm(f.code); if (!der.has(c) || f.date > der.get(c).date) der.set(c, f); if (f.date >= ajouter(arrete, -365)) ca12.set(c, (ca12.get(c) || 0) + f.htCents); }
      for (const [code, f] of der) { const j = jours(f.date, arrete); if (j >= S.dormantMinJours && j <= S.dormantMaxJours && !bloques.has(code))
        add('dormant_a_reactiver', code, f.client, 'Client sans facture depuis ' + j + ' jours (dernière : ' + f.no + ')', [f.no], ca12.get(code) > 100000 ? 1 : 2, 'Visiter ou appeler pour réactiver'); }
    }
    // Garages à visiter : ceux qui cumulent au moins une raison, priorité la plus forte puis nombre de raisons.
    const parGarage = new Map(); for (const r of out) if (r.garage) { if (!parGarage.has(r.garage)) parGarage.set(r.garage, []); parGarage.get(r.garage).push(r); }
    const visites = [...parGarage.entries()].map(([g, rs]) => ({ id: 'visite|' + g, type: 'garage_a_visiter', garage: g, raison: rs.map(r => r.raison).join(' ; '), preuve: rs.flatMap(r => r.preuve), priorite: Math.min(...rs.map(r => r.priorite)), action: 'Planifier une visite', nb: rs.length }))
      .sort((a, b) => a.priorite - b.priorite || b.nb - a.nb || a.garage.localeCompare(b.garage)).slice(0, 10);
    const manques = [];
    if (!liens) manques.push('Export sans colonne « pièce d’origine » : devis sans commande et commandes bloquées non détectables');
    if (!Array.isArray(reglements)) manques.push('Échéancier des règlements non chargé : factures à surveiller non détectables');
    if (!(couverture && couverture.debut <= ajouter(arrete, -S.dormantMaxJours))) manques.push('Historique EBP inférieur à 12 mois : dormants non déterminés');
    return { seuils: S, liste: visites.concat(out.sort((a, b) => a.priorite - b.priorite)), manques };
  }
  // Décisions du responsable sur les recommandations (journal qui ne fait que grandir).
  function decider(journal, { id, decision, le, par = '' }) {
    if (!['valide', 'ecarte'].includes(decision)) throw new Error('Décision inconnue');
    return (Array.isArray(journal) ? journal : []).concat([{ id, decision, le, par: String(par).slice(0, 60) }]);
  }
  const derniereDecision = (journal, id) => (journal || []).filter(x => x.id === id).pop() || null;

  const api = { consolider, REGLES_CATEGORIES, categories, objectif, SEUILS, recommandations, decider, derniereDecision, utils: { debutMois, finMois, moisPrec, ajouter } };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.Performance = api;
})(typeof self !== 'undefined' ? self : this);
