/* ODICOLOR Bureau — pipeline commercial, 3 actions du jour et plan du matin pour le téléphone.
   Règles utiles reprises de la page « Chaîne Odicolor » (22/10/2026) : étapes devis → commande → livraison → facture
   → règlement, délais en jours ouvrés (fériés français), prochain geste, levier de la semaine. Sans son interface.
   Différences volontaires (fiabilité) :
   - montants en centimes entiers ; pas de TTC « HT × 1,2 » : le reste dû vient UNIQUEMENT de l'échéancier EBP ;
   - sans échéancier chargé, aucune facture n'est déclarée impayée (« règlement non vérifiable ») ;
   - pas d'objectif codé en dur : l'objectif est fourni, sinon absent ;
   - un compte bloqué dans EBP ne reçoit jamais d'action de vente, seulement de règlement.
   Les seuils (délais) sont des HYPOTHÈSES réglables, rappelées dans chaque preuve.
   Logique pure : aucune écriture, aucun réseau. */
(function (racine) {
  'use strict';

  const SEUILS = Object.freeze({ devisRelanceJours: 3, devisFroidJours: 14, prepJoursOuvres: 1, factJoursOuvres: 2, echeanceToleranceJours: 1,
    reconqueteJours: 60, suiviMaxJoursOuvres: 20, baisseJours: 90, baisseTaux: 0.5, baisseMinCents: 50000, historiqueJours: 365 });
  const ETAPES = Object.freeze({ devis: 'Devis envoyé', prep: 'Commande en préparation', livraison: 'Livraison', facturation: 'Livré, à facturer',
    encaissement: 'Facture à encaisser', facture: 'Facturé (règlement non vérifiable)', solde: 'Soldée' });

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ') + ' €';
  const enEuros = c => Math.round(c) / 100;
  // Raccourcit sans couper en silence : « … » signale la coupe (limites du téléphone : app.js, nettoyerPlan).
  const court = (v, n) => { const t = String(v == null ? '' : v); return t.length <= n ? t : t.slice(0, n - 1) + '…'; };

  // ---------- dates « AAAA-MM-JJ » (calculs en UTC : aucun décalage de fuseau) ----------
  const jour = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const versIso = t => new Date(t).toISOString().slice(0, 10);
  const plus = (iso, n) => versIso(jour(iso) + n * 864e5);
  const ecart = (a, b) => Math.round((jour(b) - jour(a)) / 864e5); // b − a en jours
  const lundi = iso => plus(iso, -((new Date(jour(iso)).getUTCDay() + 6) % 7));
  const finMois = iso => { const [y, m] = iso.split('-').map(Number); return versIso(Date.UTC(y, m, 0)); };
  const debutMois = iso => iso.slice(0, 8) + '01';
  const feries = new Map();
  function joursFeries(y) {
    if (feries.has(y)) return feries.get(y);
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mois = Math.floor((h + l - 7 * m + 114) / 31), jr = ((h + l - 7 * m + 114) % 31) + 1;
    const paques = versIso(Date.UTC(y, mois - 1, jr));
    const s = new Set(['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map(x => y + '-' + x));
    [1, 39, 50].forEach(n => s.add(plus(paques, n))); // lundi de Pâques, Ascension, lundi de Pentecôte
    feries.set(y, s); return s;
  }
  const ouvre = iso => { const w = new Date(jour(iso)).getUTCDay(); return w !== 0 && w !== 6 && !joursFeries(+iso.slice(0, 4)).has(iso); };
  function joursOuvres(de, a) { let n = 0, d = de; if (a <= de) return 0; while (d < a) { d = plus(d, 1); if (ouvre(d)) n++; } return n; }

  // ---------- pièces du téléphone (devis envoyés, commandes déclarées) ----------
  function totalDevisCents(d) {
    let t = 0n;
    for (const l of d.lignes || []) {
      if (!Number.isSafeInteger(l.q) || !Number.isSafeInteger(l.pu) || !Number.isSafeInteger(l.r)) return null;
      t += (BigInt(l.q) * BigInt(l.pu) * BigInt(10000 - l.r) * 2n + 1000000n) / 2000000n;
    }
    return Number(t);
  }
  function piecesTelephone(devis) {
    const out = [];
    for (const d of Array.isArray(devis) ? devis : []) {
      if (!d || !Array.isArray(d.lignes) || !d.lignes.length || d.statut === 'brouillon' || d.statut === 'refuse') continue;
      const ht = totalDevisCents(d), envoi = String(d.t2 || d.creeLe || '').slice(0, 10);
      if (ht == null || !/^\d{4}-\d\d-\d\d$/.test(envoi)) continue;
      const no = 'TEL-D' + d.id;
      out.push({ type: 'devis', no, date: envoi, code: '', client: String(d.clientNom || ''), htCents: ht, origine: '', ref: '', source: 'telephone',
        accepteSansCommande: d.statut === 'accepte' && !d.commandeLe });
      const cmd = String(d.commandeLe || '').slice(0, 10);
      if (d.statut === 'accepte' && /^\d{4}-\d\d-\d\d$/.test(cmd))
        out.push({ type: 'commande', no: 'TEL-C' + d.id, date: cmd, code: '', client: String(d.clientNom || ''), htCents: ht, origine: no, ref: no, source: 'telephone' });
    }
    return out;
  }

  // ---------- fusion téléphone / EBP : EBP fait foi, le téléphone ne compte jamais en double ----------
  function fusionner(telephone, ebp) {
    const tel = telephone.map(p => ({ ...p })), e = ebp.map(p => ({ ...p })), pris = new Set(), rapprochements = [];
    const proche = (a, b) => norm(a.client) === norm(b.client) && Math.abs(a.htCents - b.htCents) <= 100 && Math.abs(ecart(a.date, b.date)) <= 7;
    for (const t of tel.filter(p => p.type === 'devis')) {
      const m = e.find(x => x.type === 'devis' && !pris.has(x.no) && proche(x, t));
      if (m) { pris.add(m.no); t.remplacePar = m.no; rapprochements.push({ telephone: t.no, ebp: m.no, mode: 'probable' }); }
    }
    for (const t of tel.filter(p => p.type === 'commande')) {
      let mode = 'référence', m = e.find(x => x.type === 'commande' && !pris.has(x.no) && x.ref && x.ref.toUpperCase().includes(t.ref.toUpperCase()));
      if (!m) { mode = 'probable'; m = e.find(x => x.type === 'commande' && !pris.has(x.no) && proche(x, t)); }
      if (m) {
        pris.add(m.no); t.remplacePar = m.no; m.rapprochement = mode; rapprochements.push({ telephone: t.no, ebp: m.no, mode });
        const devisTel = tel.find(x => x.no === t.origine);
        if (!m.origine && devisTel) m.origine = devisTel.remplacePar || devisTel.no;
        if (devisTel && !devisTel.remplacePar && !e.some(x => x.no === m.origine && x.type === 'devis')) devisTel.garde = true;
      }
    }
    const pieces = [...tel.filter(p => !p.remplacePar), ...e];
    return { pieces, rapprochements };
  }

  // ---------- affaires : une chaîne devis → commande → BL → facture(s) → règlement ----------
  function construireAffaires(pieces, reglements, clientsEbp, aujourdhui, seuils = SEUILS) {
    const S = Object.assign({}, SEUILS, seuils);
    const par = new Map(pieces.map(p => [p.no, p])), enfants = new Map(), regl = new Map(), utilise = new Set(), out = [];
    pieces.forEach(p => { if (p.origine) { if (!enfants.has(p.origine)) enfants.set(p.origine, []); enfants.get(p.origine).push(p); } });
    const echeancier = Array.isArray(reglements) && reglements.length > 0;
    (reglements || []).forEach(r => { if (!regl.has(r.facture)) regl.set(r.facture, []); regl.get(r.facture).push(r); });
    const bloques = new Map((clientsEbp || []).map(c => [c.code, c]));
    const deType = (liste, t) => (liste || []).filter(x => x.type === t).sort((a, b) => a.date.localeCompare(b.date));

    function terminer(a) {
      const tete = a.commande || a.devis || a.bl || a.facture;
      a.id = tete.no; a.client = tete.client; a.code = (a.commande || a.devis || a.bl || a.facture).code || (a.facture || a.bl || {}).code || '';
      a.htCents = tete.htCents; a.source = tete.source;
      const ce = a.code ? bloques.get(a.code) : null; a.compteBloque = !!(ce && ce.bloque);
      if (a.facture) {
        const rs = a.factures.flatMap(f => regl.get(f.no) || []);
        a.depuis = a.facture.date;
        if (!echeancier || !rs.length) {
          a.etape = 'facture'; a.resteCents = null; a.niveau = 'ok'; a.retard = false; a.age = ecart(a.facture.date, aujourdhui);
          a.aVerifier = echeancier; // échéancier chargé mais facture absente : à vérifier, jamais déclarée impayée
        } else {
          a.resteCents = rs.reduce((s, r) => s + r.resteCents, 0);
          a.echeance = rs.map(r => r.echeance).sort()[0];
          a.payeLe = rs.map(r => r.reglement).filter(Boolean).sort().pop() || '';
          if (a.resteCents <= 0) { a.etape = 'solde'; a.niveau = 'ok'; a.retard = false; a.age = 0; }
          else { a.etape = 'encaissement'; a.age = ecart(a.echeance, aujourdhui); a.retard = a.age >= S.echeanceToleranceJours; a.niveau = a.retard ? 'bad' : a.age >= -3 ? 'warn' : 'ok'; }
        }
      } else if (a.bl) {
        const n = joursOuvres(a.bl.date, aujourdhui); a.depuis = a.bl.date; a.age = n;
        if (n <= 1) { a.etape = 'livraison'; a.niveau = 'ok'; a.retard = false; }
        else { a.etape = 'facturation'; a.retard = n > S.factJoursOuvres; a.niveau = a.retard ? 'bad' : 'warn'; }
        // Au-delà de suiviMaxJoursOuvres, l'absence de suite vient presque sûrement d'un lien manquant dans l'export :
        // « à vérifier », jamais une action pour Mohamed (hypothèse réglable).
        if (n > S.suiviMaxJoursOuvres) { a.retard = false; a.niveau = 'warn'; a.lienAVerifier = true; }
      } else if (a.commande) {
        const n = joursOuvres(a.commande.date, aujourdhui); a.depuis = a.commande.date; a.age = n; a.etape = 'prep';
        a.attenteEbp = a.commande.source === 'telephone';
        a.retard = n > S.prepJoursOuvres; a.niveau = a.retard ? 'bad' : 'warn';
        if (n > S.suiviMaxJoursOuvres) { a.retard = false; a.niveau = 'warn'; a.lienAVerifier = true; }
      } else {
        const n = ecart(a.devis.date, aujourdhui); a.depuis = a.devis.date; a.age = n; a.etape = 'devis';
        a.froid = n > S.devisFroidJours;
        if (a.devis.accepteSansCommande) { a.retard = n >= 1; a.niveau = a.retard ? 'bad' : 'warn'; a.froid = false; }
        else { a.retard = n > S.devisRelanceJours; a.niveau = a.retard ? 'bad' : n >= S.devisRelanceJours * 0.67 ? 'warn' : 'ok'; }
      }
      a.ouverte = a.etape !== 'solde';
      out.push(a);
    }
    pieces.filter(p => p.type === 'commande').forEach(c => {
      const d = par.get(c.origine), devis = d && d.type === 'devis' ? d : null;
      const bls = deType(enfants.get(c.no), 'bl');
      const facs = [...deType(enfants.get(c.no), 'facture'), ...bls.flatMap(b => deType(enfants.get(b.no), 'facture'))].sort((x, y) => x.date.localeCompare(y.date));
      [devis, c, ...bls, ...facs].forEach(x => x && utilise.add(x.no));
      terminer({ devis, commande: c, bl: bls[0] || null, facture: facs[facs.length - 1] || null, factures: facs, lie: true });
    });
    pieces.filter(p => p.type === 'devis' && !utilise.has(p.no)).forEach(d => { utilise.add(d.no); terminer({ devis: d, commande: null, bl: null, facture: null, factures: [], lie: true }); });
    pieces.filter(p => p.type === 'bl' && !utilise.has(p.no)).forEach(b => {
      const facs = deType(enfants.get(b.no), 'facture'); facs.forEach(f => utilise.add(f.no)); utilise.add(b.no);
      terminer({ devis: null, commande: null, bl: b, facture: facs[facs.length - 1] || null, factures: facs, lie: false });
    });
    pieces.filter(p => p.type === 'facture' && !utilise.has(p.no)).forEach(f => { utilise.add(f.no); terminer({ devis: null, commande: null, bl: null, facture: f, factures: [f], lie: false }); });
    return out;
  }

  // ---------- actions du jour : valeur en jeu, preuve, source, contrôle ----------
  function actions(affaires, { arrete, aujourdhui, seuils = SEUILS, supplementaires = [] }) {
    const S = Object.assign({}, SEUILS, seuils), src = a => (a.source === 'telephone' ? 'Téléphone (déclaratif)' : 'Export EBP du ' + arrete);
    const out = [];
    const ajouter = (a, genre, tag, responsable, t, d, preuve, poids, montant) => out.push({
      id: court('chaine:' + genre + ':' + a.id, 150), genre, tag, responsable, client: court(a.client, 80), t: court(t, 200), d: court(d, 200), preuve: court(preuve, 500), source: src(a),
      qualite: a.lie ? (a.commande && a.commande.rapprochement === 'probable' ? 'Rapprochement téléphone/EBP probable : à confirmer' : 'Pièces liées') : 'Pièce sans lien dans l’export : à vérifier',
      valeur: montant * poids, montantCents: montant, jour: aujourdhui, statut: 'a_faire' });
    for (const a of affaires) {
      if (!a.ouverte || !a.retard) continue;
      if (a.etape === 'encaissement') {
        ajouter(a, 'reglement', 'Règlement', 'Toi', 'Relancer le règlement : ' + court(a.client, 80), 'Reste ' + eur(a.resteCents) + ' · échu depuis ' + a.age + ' j',
          'Facture ' + a.facture.no + ' du ' + a.facture.date + ', échéance ' + a.echeance + ', reste ' + eur(a.resteCents) + ' (échéancier EBP). Tolérance : ' + S.echeanceToleranceJours + ' j (hypothèse).', 3, a.resteCents);
        continue;
      }
      if (a.compteBloque) continue; // compte bloqué : pas d'action de vente
      if (a.etape === 'devis' && a.devis.accepteSansCommande)
        ajouter(a, 'commande-a-envoyer', 'Commande', 'Toi', 'Envoyer la commande à Mohamed : ' + court(a.client, 80), 'Devis accepté (saisi au téléphone), pas encore commandé · ' + eur(a.htCents) + ' HT',
          'Devis ' + a.devis.no + ' accepté (téléphone), aucune commande enregistrée.', 4, a.htCents);
      else if (a.etape === 'devis' && !a.froid)
        ajouter(a, 'relance-devis', 'Devis', 'Toi', 'Relancer le devis : ' + court(a.client, 80), 'Sans réponse depuis ' + a.age + ' j · ' + eur(a.htCents) + ' HT',
          'Devis ' + a.devis.no + ' du ' + a.devis.date + ', aucune commande liée. Relance après ' + S.devisRelanceJours + ' j (hypothèse).', 2, a.htCents);
      else if (a.etape === 'prep')
        ajouter(a, 'preparation', 'Commande', 'Mohamed', (a.attenteEbp ? 'Vérifier avec Mohamed la commande de ' : 'Débloquer avec Mohamed la commande de ') + court(a.client, 80),
          (a.attenteEbp ? 'Commande déclarée au téléphone, absente de l’export EBP' : 'En préparation depuis ' + a.age + ' j ouvrés') + ' · ' + eur(a.htCents) + ' HT',
          'Commande ' + a.commande.no + ' du ' + a.commande.date + ', aucun bon de livraison. Seuil ' + S.prepJoursOuvres + ' j ouvré (hypothèse).', 2.5, a.htCents);
      else if (a.etape === 'facturation')
        ajouter(a, 'facturation', 'Facture', 'Mohamed', 'Faire facturer : ' + court(a.client, 80), 'Livré depuis ' + a.age + ' j ouvrés sans facture · ' + eur(a.htCents) + ' HT',
          'Bon de livraison ' + a.bl.no + ' du ' + a.bl.date + ', aucune facture liée. Seuil ' + S.factJoursOuvres + ' j ouvrés (hypothèse).', 2, a.htCents);
    }
    out.push(...supplementaires);
    out.sort((x, y) => y.valeur - x.valeur || x.id.localeCompare(y.id));
    out.forEach((x, i) => { x.prio = i < 3 ? 1 : i < 10 ? 2 : 3; });
    return out;
  }

  // ---------- indicateurs EBP par période (format attendu par le téléphone, montants en euros) ----------
  function periodes(aujourdhui) {
    const l = lundi(aujourdhui), m0 = debutMois(aujourdhui), mp = debutMois(plus(m0, -1));
    return { semaine: [l, plus(l, 6)], passee: [plus(l, -7), plus(l, -1)], avant: [plus(l, -14), plus(l, -8)], mois: [m0, finMois(m0)], moisPrec: [mp, finMois(mp)] };
  }
  function kpi(piecesEbp, affaires, reglements, aujourdhui) {
    const out = {};
    for (const [k, [debut, fin]] of Object.entries(periodes(aujourdhui))) {
      const dans = t => piecesEbp.filter(p => p.type === t && p.date >= debut && p.date <= fin);
      const c = dans('commande'), f = dans('facture');
      out[k] = { debut, fin, cmdN: c.length, cmdHt: enEuros(c.reduce((s, p) => s + p.htCents, 0)), facN: f.length, facHt: enEuros(f.reduce((s, p) => s + p.htCents, 0)) };
    }
    if (Array.isArray(reglements) && reglements.length) {
      const echues = affaires.filter(a => a.etape === 'encaissement' && a.retard);
      out.echu = { n: echues.length, reste: enEuros(echues.reduce((s, a) => s + a.resteCents, 0)), sansMontant: 0,
        aVerifier: affaires.filter(a => a.aVerifier).length };
    }
    return out;
  }

  // Levier de la semaine (repris de la Chaîne) : le retard qui coûte le plus.
  function levier(affaires, seuils = SEUILS) {
    const S = Object.assign({}, SEUILS, seuils), g = f => affaires.filter(a => a.ouverte && a.retard && f(a)), som = l => l.reduce((s, a) => s + (a.resteCents != null && a.etape === 'encaissement' ? a.resteCents : a.htCents), 0);
    const L = [
      [g(a => a.etape === 'devis' && !a.froid && !a.devis.accepteSansCommande && !a.compteBloque), n => n + ' devis sans réponse depuis plus de ' + S.devisRelanceJours + ' j', 'Devis relancés et devis transformés en commande'],
      [g(a => a.etape === 'prep'), n => n + ' commande(s) en retard de préparation', 'Délai commande → bon de livraison'],
      [g(a => a.etape === 'facturation'), n => n + ' livraison(s) non facturée(s)', 'Délai livraison → facture'],
      [g(a => a.etape === 'encaissement'), n => n + ' facture(s) échue(s) non réglée(s)', 'Montant échu et ancienneté']
    ].filter(([l]) => l.length).map(([l, t, m]) => ({ texte: t(l.length) + ' (' + eur(som(l)) + ') : à traiter cette semaine.', mesure: 'Mesure lundi : ' + m + '.', valeur: som(l) })).sort((a, b) => b.valeur - a.valeur);
    return L[0] || null;
  }


  // ---------- signaux commerciaux par client, lus par le téléphone (commercial-v22.js : « Opportunités ») ----------
  // reconquete : du CA commandé sur 12 mois mais plus aucune commande depuis reconqueteJours ;
  // baisse : CA commandé des baisseJours derniers jours inférieur de baisseTaux à la période précédente (minimum baisseMinCents).
  // Seuils = HYPOTHÈSES, recopiées dans chaque signal. Jamais de signal pour un compte bloqué dans EBP.
  function signauxClients(piecesEbp, clientsEbp, arrete, seuils = SEUILS) {
    const S = Object.assign({}, SEUILS, seuils), bloques = new Set((clientsEbp || []).filter(c => c.bloque).map(c => c.code));
    const parClient = new Map();
    for (const p of piecesEbp) {
      if (p.type !== 'commande' || p.date > arrete) continue;
      const k = p.code || norm(p.client); if (!parClient.has(k)) parClient.set(k, { nom: p.client, code: p.code, cmd: [] });
      parClient.get(k).cmd.push(p);
    }
    const source = 'Export EBP du ' + arrete + ' (commandes)', out = new Map();
    for (const [k, c] of parClient) {
      if (c.code && bloques.has(c.code)) continue;
      const cmd = c.cmd.sort((a, b) => b.date.localeCompare(a.date)), entre = (de, a) => cmd.filter(p => p.date > de && p.date <= a);
      const ca12 = entre(plus(arrete, -S.historiqueJours), arrete).reduce((n, p) => n + p.htCents, 0), dernier = cmd[0].date, depuis = ecart(dernier, arrete);
      const signaux = [];
      if (ca12 > 0 && depuis > S.reconqueteJours) {
        signaux.push({ type: 'reconquete', titre: court('Aucune commande depuis ' + depuis + ' j (dernière le ' + dernier + ')', 120),
          preuve: court('CA commandé sur 12 mois : ' + eur(ca12) + ' HT, ' + entre(plus(arrete, -S.historiqueJours), arrete).length + ' commande(s). Dernières : ' + cmd.slice(0, 5).map(p => p.no + ' du ' + p.date + ' (' + eur(p.htCents) + ')').join(', ') + '.', 650),
          source, dateDernier: dernier, ca12: enEuros(ca12), pieces: cmd.slice(0, 15).map(p => p.no), seuil: 'Plus de ' + S.reconqueteJours + ' jours sans commande', actionId: 'chaine:reconquete:' + k });
      } else {
        const recent = entre(plus(arrete, -S.baisseJours), arrete), avant = entre(plus(arrete, -2 * S.baisseJours), plus(arrete, -S.baisseJours));
        const r = recent.reduce((n, p) => n + p.htCents, 0), a = avant.reduce((n, p) => n + p.htCents, 0);
        if (a >= S.baisseMinCents && r < a * (1 - S.baisseTaux))
          signaux.push({ type: 'baisse', titre: court('Commandes en baisse : ' + eur(r) + ' sur ' + S.baisseJours + ' j contre ' + eur(a) + ' avant', 120),
            preuve: court(recent.length + ' commande(s) récentes contre ' + avant.length + ' sur la période précédente. Pièces : ' + [...recent, ...avant].slice(0, 8).map(p => p.no).join(', ') + '.', 650),
            source, dateDernier: dernier, ca12: enEuros(ca12), pieces: [...recent, ...avant].slice(0, 15).map(p => p.no), seuil: 'Baisse de plus de ' + Math.round(S.baisseTaux * 100) + ' % sur ' + S.baisseJours + ' jours (minimum ' + eur(S.baisseMinCents) + ' avant)', actionId: '' });
      }
      if (signaux.length) out.set(k, { nom: c.nom, code: c.code, signaux });
    }
    return out;
  }

  // Fiabilité déclarée au téléphone : historique de commandes EBP ≥ 12 mois ET aucune ligne de pièce écartée.
  function preuvesCommerciales(piecesEbp, ignorees, arrete, nbSignaux, seuils = SEUILS) {
    const S = Object.assign({}, SEUILS, seuils), cmd = piecesEbp.filter(p => p.type === 'commande').map(p => p.date).sort(), restrictions = [];
    if (!cmd.length) restrictions.push('Aucune commande dans l’export EBP : signaux commerciaux impossibles.');
    else if (cmd[0] > plus(arrete, -S.historiqueJours)) restrictions.push('Historique des commandes EBP depuis le ' + cmd[0] + ' seulement : ' + Math.round(S.historiqueJours / 30) + ' mois nécessaires pour les signaux.');
    if (ignorees) restrictions.push(ignorees + ' ligne(s) de pièces EBP écartée(s) à l’import : preuves incomplètes.');
    return { fiable: restrictions.length === 0, restrictions, signaux: nbSignaux };
  }

  // ---------- plan du matin pour le téléphone (format « plan-pc » version 2) ----------
  function construirePlan({ piecesEbp, reglements = [], clientsEbp = [], devisTelephone = [], arrete, aujourdhui, maintenant, seuils = SEUILS, ignorees = 0 }) {
    if (!/^\d{4}-\d\d-\d\d$/.test(arrete || '')) throw new Error('Date de l’export EBP obligatoire (AAAA-MM-JJ).');
    aujourdhui = aujourdhui || arrete;
    if (ecart(arrete, aujourdhui) < 0) throw new Error('La date de l’export EBP est dans le futur.');
    const { pieces, rapprochements } = fusionner(piecesTelephone(devisTelephone), piecesEbp);
    const affaires = construireAffaires(pieces, reglements, clientsEbp, aujourdhui, seuils);
    const sig = signauxClients(piecesEbp, clientsEbp, arrete, seuils);
    const reconquetes = [...sig.values()].flatMap(c => c.signaux.filter(s => s.type === 'reconquete').map(s => ({
      id: court(s.actionId, 150), genre: 'reconquete', tag: 'Visite', responsable: 'Toi', client: court(c.nom, 80), t: court('Reconquérir : ' + c.nom, 200),
      d: court('Plus de commande depuis ' + ecart(s.dateDernier, arrete) + ' j · ' + eur(Math.round(s.ca12 * 100)) + ' HT sur 12 mois', 200), preuve: court(s.preuve, 500),
      source: 'Export EBP du ' + arrete, qualite: 'Historique de commandes EBP', valeur: Math.round(s.ca12 * 100) / 12, montantCents: Math.round(s.ca12 * 100), jour: aujourdhui, statut: 'a_faire' })));
    const acts = actions(affaires, { arrete, aujourdhui, seuils, supplementaires: reconquetes }).slice(0, 200);
    const parClient = new Map();
    for (const a of affaires.filter(x => x.ouverte)) {
      const k = a.code || norm(a.client); if (!parClient.has(k)) parClient.set(k, { nom: court(a.client, 80), code: court(a.code, 20), niveau: 'ok', lignes: [] });
      const e = parClient.get(k), l = ETAPES[a.etape] + ' · ' + a.id + ' · ' + eur(a.etape === 'encaissement' ? a.resteCents : a.htCents) + (a.retard ? ' (en retard)' : '');
      if (e.lignes.length < 8) e.lignes.push(court(l, 160));
      if (a.niveau === 'bad') e.niveau = 'bad'; else if (a.niveau === 'warn' && e.niveau === 'ok') e.niveau = 'warn';
    }
    for (const [k2, c] of sig) {
      if (!parClient.has(k2)) parClient.set(k2, { nom: court(c.nom, 80), code: court(c.code, 20), niveau: 'warn', lignes: [] });
      const e = parClient.get(k2); e.signaux = c.signaux;
      for (const s of c.signaux) if (e.lignes.length < 8) e.lignes.push(court((s.type === 'reconquete' ? 'À reconquérir · ' : 'Achats en baisse · ') + s.titre, 160));
      if (e.niveau === 'ok') e.niveau = 'warn';
    }
    const nbSignaux = [...sig.values()].reduce((n, c) => n + c.signaux.length, 0);
    const k = kpi(piecesEbp, affaires, reglements, aujourdhui), lv = levier(affaires, seuils);
    const ouvertes = affaires.filter(a => a.ouverte);
    const ind = [
      { l: 'CA commandé, semaine passée', v: eur(Math.round(k.passee.cmdHt * 100)), n: k.passee.cmdN + ' commande(s) EBP' },
      { l: 'CA commandé, ce mois', v: eur(Math.round(k.mois.cmdHt * 100)), n: k.mois.cmdN + ' commande(s) EBP' },
      { l: 'Devis sans réponse', v: String(ouvertes.filter(a => a.etape === 'devis' && a.retard && !a.froid).length), n: 'au-delà de ' + Object.assign({}, SEUILS, seuils).devisRelanceJours + ' j' },
      { l: 'Commandes en retard de préparation', v: String(ouvertes.filter(a => a.etape === 'prep' && a.retard).length) },
      { l: 'Livré non facturé', v: String(ouvertes.filter(a => a.etape === 'facturation' && a.retard).length) },
      { l: 'Pièces sans suite à vérifier', v: String(ouvertes.filter(a => a.lienAVerifier).length), n: 'plus de ' + Object.assign({}, SEUILS, seuils).suiviMaxJoursOuvres + ' j ouvrés : lien manquant dans l’export ?' },
      k.echu ? { l: 'Échu non réglé', v: eur(Math.round(k.echu.reste * 100)), n: k.echu.n + ' facture(s)' } : { l: 'Échu non réglé', v: 'non vérifiable', n: 'échéancier EBP non chargé' }
    ];
    return {
      appli: 'plan-pc', version: 2, date: maintenant || new Date().toISOString(), arrete,
      chiffre: { source: 'import', arrete },
      // Format lu par le téléphone (commercial-v22.js, nettoyerPlan) : ebpDate, importStats.pieces.ignorees, preuvesCommerciales.
      sources: { ebpDate: arrete, importStats: { pieces: { ignorees } }, preuvesCommerciales: preuvesCommerciales(piecesEbp, ignorees, arrete, nbSignaux, seuils) },
      kpi: k, changement: lv ? { texte: lv.texte, mesure: lv.mesure } : null, indicateurs: ind.map(x => ({ l: x.l, v: x.v, n: x.n || '' })),
      actions: acts.map(({ valeur, montantCents, genre, ...a }) => a),
      clients: [...parClient.values()].slice(0, 600),
      rapprochements
    };
  }

  // Contrôle du plan avec les règles d'import du téléphone (app.js : importerPlanPC / nettoyerPlan).
  function verifierPlan(p) {
    const err = [];
    if (!p || p.appli !== 'plan-pc' || p.version !== 2) err.push('appli/version');
    if (!/^\d{4}-\d\d-\d\dT/.test(p && p.date || '')) err.push('date');
    if (!Array.isArray(p && p.actions)) err.push('actions');
    else {
      if (p.actions.length > 200) err.push('plus de 200 actions');
      const ids = new Set();
      p.actions.forEach((a, i) => {
        if (!a.t) err.push('action ' + i + ' sans titre');
        if (![1, 2, 3].includes(a.prio)) err.push('action ' + i + ' priorité');
        if (!a.id || a.id.length > 150 || ids.has(a.id)) err.push('action ' + i + ' identifiant'); ids.add(a.id);
        for (const [c, n] of [['t', 200], ['d', 200], ['preuve', 500], ['source', 90], ['qualite', 100], ['tag', 20], ['client', 80], ['responsable', 50]])
          if (a[c] != null && String(a[c]).length > n) err.push('action ' + i + ' : ' + c + ' trop long (' + String(a[c]).length + ' > ' + n + ')');
      });
    }
    for (const c of ['semaine', 'passee', 'avant', 'mois', 'moisPrec']) { const v = p && p.kpi && p.kpi[c]; if (!v || !/^\d{4}-\d\d-\d\d$/.test(v.debut)) err.push('kpi ' + c); }
    if (!Array.isArray(p && p.clients) || p.clients.length > 600) err.push('clients');
    else p.clients.forEach((c, i) => {
      if (c.lignes.length > 8 || c.lignes.some(l => l.length > 160) || String(c.nom).length > 80) err.push('client ' + i);
      const sg = c.signaux || [];
      if (sg.length > 4 || sg.some(z => !['reconquete', 'baisse'].includes(z.type) || z.titre.length > 120 || z.preuve.length > 650 || z.source.length > 130 ||
        z.seuil.length > 130 || z.actionId.length > 160 || z.pieces.length > 15 || z.pieces.some(x => x.length > 45))) err.push('signaux du client ' + i);
    });
    const pc = p && p.sources && p.sources.preuvesCommerciales;
    if (!pc || typeof pc.fiable !== 'boolean' || !Array.isArray(pc.restrictions) || pc.restrictions.length > 8 || pc.restrictions.some(r => r.length > 170)) err.push('sources.preuvesCommerciales');
    if (!(p && p.chiffre && p.chiffre.source === 'import')) err.push('chiffre.source');
    if (!Array.isArray(p && p.indicateurs) || p.indicateurs.length > 12) err.push('indicateurs');
    return err;
  }

  const api = { signauxClients, preuvesCommerciales, SEUILS, ETAPES, joursFeries, ouvre, joursOuvres, lundi, periodes, piecesTelephone, totalDevisCents, fusionner, construireAffaires, actions, kpi, levier, construirePlan, verifierPlan };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.Pipeline = api;
})(typeof self !== 'undefined' ? self : this);
