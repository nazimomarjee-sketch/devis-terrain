'use strict';
/* Banque locale — logique pure (lecture des relevés, doublons, catégories, synthèse).
 * Aucun accès réseau, aucun accès au DOM : ce fichier est testé tel quel sous Node.
 * Les montants sont des entiers en centimes pour éviter les erreurs d'arrondi.
 */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.BanqueCoeur = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const A_CLASSER = 'À classer';
  const NEUTRE = 'Épargne et virements internes';
  const CATEGORIES = ['Revenus', 'Entrées diverses', 'Logement', 'Énergie et télécoms', 'Courses', 'Restaurants',
    'Transport', 'Santé', 'Assurances', 'Abonnements', 'Shopping', 'Loisirs', 'Impôts', 'Frais bancaires',
    'Retraits', NEUTRE, A_CLASSER];

  /* Mot-clé terminé par une espace = mot entier ; sinon début de mot. L'ordre compte : première règle gagnante. */
  const REGLES_DEFAUT = [
    { cat: NEUTRE, mots: ['LIVRET', 'EPARGNE', 'VIR VERS', 'VIREMENT INTERNE', 'PEA ', 'PEL ', 'LDDS', 'ASSURANCE VIE'] },
    { cat: 'Revenus', signe: 1, mots: ['SALAIRE', 'PAIE ', 'PAYE ', 'CAF ', 'POLE EMPLOI', 'FRANCE TRAVAIL', 'PENSION', 'RETRAITE'] },
    { cat: 'Impôts', mots: ['DGFIP', 'IMPOT', 'TRESOR PUBLIC', 'AMENDE', 'URSSAF'] },
    { cat: 'Logement', mots: ['LOYER', 'SYNDIC', 'FONCIA', 'CREDIT IMMO', 'PRET IMMO', 'ECHEANCE PRET'] },
    { cat: 'Énergie et télécoms', mots: ['EDF ', 'ENGIE', 'VEOLIA', 'SUEZ ', 'ORANGE', 'SFR ', 'BOUYGUES', 'FREE MOBILE', 'FREE TELECOM', 'FREEBOX', 'SOSH', 'RED BY'] },
    { cat: 'Restaurants', mots: ['RESTAURANT', 'MCDONALD', 'MC DONALD', 'BURGER', 'KFC ', 'PIZZA', 'SUSHI', 'UBER EATS', 'DELIVEROO', 'JUST EAT', 'BOULANGERIE', 'BRASSERIE', 'CAFE ', 'STARBUCKS', 'SNACK'] },
    { cat: 'Courses', mots: ['CARREFOUR', 'LECLERC', 'AUCHAN', 'INTERMARCHE', 'LIDL', 'ALDI ', 'MONOPRIX', 'FRANPRIX', 'CASINO', 'SUPER U', 'HYPER U', 'U EXPRESS', 'PICARD', 'BIOCOOP', 'LEADER PRICE', 'SPAR ', 'CORA ', 'RUN MARKET', 'JUMBO'] },
    { cat: 'Transport', mots: ['SNCF', 'RATP', 'UBER', 'BOLT ', 'TAXI', 'PEAGE', 'AUTOROUTE', 'APRR', 'SANEF', 'PARKING', 'INDIGO', 'ESSENCE', 'STATION', 'TOTAL ACCESS', 'ESSO ', 'SHELL', 'BP ', 'AVIA ', 'CARBURANT', 'NAVIGO', 'BLABLACAR', 'AIR FRANCE', 'AIR AUSTRAL', 'CORSAIR', 'EASYJET', 'RYANAIR'] },
    { cat: 'Santé', mots: ['PHARMA', 'DOCTEUR', 'DR ', 'MEDECIN', 'DENTISTE', 'OPTIQUE', 'OPTICIEN', 'LABORATOIRE', 'HOPITAL', 'CLINIQUE', 'CPAM', 'MUTUELLE', 'DOCTOLIB', 'KINE'] },
    { cat: 'Assurances', mots: ['ASSURANCE', 'MAIF', 'MACIF', 'MAAF', 'MATMUT', 'AXA ', 'ALLIANZ', 'GROUPAMA', 'GMF ', 'MMA '] },
    { cat: 'Abonnements', mots: ['NETFLIX', 'SPOTIFY', 'DEEZER', 'DISNEY', 'AMAZON PRIME', 'PRIME VIDEO', 'CANAL', 'YOUTUBE', 'APPLE COM', 'GOOGLE', 'ICLOUD', 'MICROSOFT', 'ADOBE', 'OPENAI', 'CHATGPT', 'ANTHROPIC', 'CLAUDE AI', 'DROPBOX', 'BASIC FIT', 'FITNESS PARK'] },
    { cat: 'Shopping', mots: ['AMAZON', 'AMZN', 'FNAC', 'DARTY', 'ZARA', 'DECATHLON', 'IKEA', 'LEROY MERLIN', 'CASTORAMA', 'ZALANDO', 'VINTED', 'SHEIN', 'ALIEXPRESS', 'TEMU ', 'CDISCOUNT', 'KIABI', 'BOULANGER'] },
    { cat: 'Loisirs', mots: ['CINEMA', 'UGC ', 'PATHE', 'GAUMONT', 'STEAM', 'PLAYSTATION', 'NINTENDO', 'XBOX', 'FDJ ', 'PMU ', 'BOOKING', 'AIRBNB', 'HOTEL', 'THEATRE', 'CONCERT', 'TICKETMASTER'] },
    { cat: 'Frais bancaires', mots: ['COTISATION', 'FRAIS', 'COMMISSION', 'AGIOS', 'INTERETS DEBITEURS'] },
    { cat: 'Retraits', mots: ['RETRAIT', 'DAB '] }
  ];

  /* ---------- Lecture des valeurs ---------- */
  function parseMontant(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
    let s = String(v == null ? '' : v).replace(/EUR/gi, '').replace(/[\s  €$£]/g, '').replace(/[−–]/g, '-');
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
    if (s[0] === '-') { neg = !neg; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
    s = s.replace(/'/g, '');
    const iv = s.lastIndexOf(','), ip = s.lastIndexOf('.');
    let dec = -1;
    if (iv >= 0 && ip >= 0) dec = Math.max(iv, ip);
    else if (iv >= 0 || ip >= 0) {
      const i = Math.max(iv, ip), sep = s[i];
      const plusieurs = s.indexOf(sep) !== i, apres = s.length - i - 1;
      const milliers = plusieurs || (apres === 3 && s.slice(0, i) !== '0');
      if (!milliers) dec = i;
    }
    const entier = (dec >= 0 ? s.slice(0, dec) : s).replace(/[.,]/g, '') || '0';
    const frac = dec >= 0 ? s.slice(dec + 1) : '';
    if (/[.,]/.test(frac)) return null;
    const n = Math.round(parseFloat(entier + '.' + (frac || '0')) * 100);
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
  }

  function parseDate(v) {
    const s = String(v == null ? '' : v).trim();
    let a, m, j, r;
    if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { a = +r[1]; m = +r[2]; j = +r[3]; }
    else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/))) { j = +r[1]; m = +r[2]; a = +r[3]; if (a < 100) a += 2000; }
    else if ((r = s.match(/^(\d{4})(\d{2})(\d{2})/))) { a = +r[1]; m = +r[2]; j = +r[3]; }
    else return null;
    const d = new Date(Date.UTC(a, m - 1, j));
    if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j || a < 1990 || a > 2100) return null;
    return a + '-' + String(m).padStart(2, '0') + '-' + String(j).padStart(2, '0');
  }

  function sansAccent(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /** Libellé en majuscules, sans accents ni ponctuation : sert aux règles et aux doublons. */
  function normaliser(libelle) {
    return sansAccent(libelle).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  /** Nom de commerçant approximatif : libellé sans moyen de paiement, dates ni numéros. */
  function marchand(libelle) {
    const mots = normaliser(libelle)
      .replace(/\b(PAIEMENT|ACHAT|PAR|CARTE|CB|PRLV|PRELEVEMENT|SEPA|VIR|VIREMENT|INST|RECU|EMIS|DE|DU|FACTURE|REF|ECH|ECHEANCE)\b/g, ' ')
      .replace(/\b[A-Z]*\d[A-Z0-9]*\b/g, ' ')
      .replace(/\b(JANVIER|JANV?|FEVRIER|FEVR?|MARS|AVRIL|AVR|MAI|JUIN|JUILLET|JUIL?|AOUT|SEPTEMBRE|SEPT?|OCTOBRE|OCT|NOVEMBRE|NOV|DECEMBRE|DEC)\b/g, ' ')
      .split(/\s+/).filter(Boolean);
    return mots.slice(0, 3).join(' ');
  }

  /* ---------- CSV ---------- */
  function decouperCSV(texte, sep) {
    const lignes = []; let ligne = [], champ = '', guillemets = false;
    for (let i = 0; i < texte.length; i++) {
      const c = texte[i];
      if (guillemets) {
        if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; }
        else champ += c;
      } else if (c === '"' && champ === '') guillemets = true;
      else if (c === sep) { ligne.push(champ); champ = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texte[i + 1] === '\n') i++;
        ligne.push(champ); champ = ''; lignes.push(ligne); ligne = [];
      } else champ += c;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes;
  }

  function reperer(entete) {
    const col = { dates: [], libelles: [], montant: -1, debit: -1, credit: -1 };
    entete.forEach((cellule, i) => {
      const c = sansAccent(cellule).toLowerCase().trim();
      if (!c) return;
      if (/^date/.test(c)) col.dates.push({ i, valeur: /valeur/.test(c) });
      else if (/debit/.test(c)) { if (col.debit < 0) col.debit = i; }
      else if (/credit/.test(c)) { if (col.credit < 0) col.credit = i; }
      else if (/^(montant|amount)/.test(c)) { if (col.montant < 0) col.montant = i; }
      else if (/libelle|label|intitule|description|detail|designation|nature|operation|motif/.test(c))
        col.libelles.push({ i, principal: /libelle|label/.test(c) });
    });
    if (!col.dates.length || !col.libelles.length || (col.montant < 0 && col.debit < 0 && col.credit < 0)) return null;
    col.dates.sort((a, b) => a.valeur - b.valeur);
    col.libelles.sort((a, b) => b.principal - a.principal);
    return col;
  }

  function lireCSV(texte) {
    const candidats = [';', '\t', ',', '|']
      .map(sep => ({ sep, n: texte.slice(0, 5000).split(sep).length - 1 }))
      .filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    for (const { sep } of candidats) {
      const lignes = decouperCSV(texte, sep);
      for (let h = 0; h < Math.min(lignes.length, 40); h++) {
        const col = reperer(lignes[h]);
        if (!col) continue;
        const ops = [], refus = [];
        for (let k = h + 1; k < lignes.length; k++) {
          const l = lignes[k];
          if (!l.some(x => String(x).trim() !== '')) continue;
          const refuser = motif => refus.push({ ligne: k + 1, motif });
          let date = null;
          for (const d of col.dates) { date = parseDate(l[d.i]); if (date) break; }
          if (!date) { refuser('date illisible'); continue; }
          let montant = col.montant >= 0 ? parseMontant(l[col.montant]) : null;
          if (montant === null && (col.debit >= 0 || col.credit >= 0)) {
            const d = col.debit >= 0 ? parseMontant(l[col.debit]) : null;
            const c = col.credit >= 0 ? parseMontant(l[col.credit]) : null;
            if (d !== null || c !== null) montant = (c || 0) - Math.abs(d || 0);
          }
          if (montant === null) { refuser('montant illisible'); continue; }
          if (montant === 0) { refuser('montant nul'); continue; }
          let libelle = '';
          for (const c of col.libelles) { libelle = String(l[c.i] || '').replace(/\s+/g, ' ').trim(); if (libelle) break; }
          ops.push({ date, libelle: libelle || '(sans libellé)', montant });
        }
        return { format: 'CSV', ops, refus };
      }
    }
    return { format: 'CSV', ops: [], refus: [], erreur: 'En-têtes introuvables : il faut des colonnes Date, Libellé et Montant (ou Débit / Crédit).' };
  }

  /* ---------- OFX ---------- */
  function lireOFX(texte) {
    const ops = [], refus = [];
    const entites = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
    texte.split(/<STMTTRN>/i).slice(1).forEach((bloc, n) => {
      bloc = bloc.split(/<\/STMTTRN>/i)[0];
      const champ = nom => { const r = bloc.match(new RegExp('<' + nom + '>([^<\\r\\n]*)', 'i')); return r ? entites(r[1]).trim() : ''; };
      const date = parseDate(champ('DTPOSTED')), montant = parseMontant(champ('TRNAMT'));
      if (!date) { refus.push({ ligne: n + 1, motif: 'date illisible' }); return; }
      if (montant === null) { refus.push({ ligne: n + 1, motif: 'montant illisible' }); return; }
      if (montant === 0) { refus.push({ ligne: n + 1, motif: 'montant nul' }); return; }
      const nom = champ('NAME'), memo = champ('MEMO');
      const libelle = (nom && memo && nom !== memo ? nom + ' ' + memo : nom || memo).replace(/\s+/g, ' ').trim();
      ops.push({ date, libelle: libelle || '(sans libellé)', montant });
    });
    return { format: 'OFX', ops, refus, erreur: ops.length || refus.length ? undefined : 'Aucune opération trouvée dans ce fichier OFX.' };
  }

  function lireReleve(texte) {
    texte = String(texte || '').replace(/^﻿/, '');
    if (!texte.trim()) return { format: '?', ops: [], refus: [], erreur: 'Fichier vide.' };
    return /<STMTTRN>|OFXHEADER|<OFX>/i.test(texte) ? lireOFX(texte) : lireCSV(texte);
  }

  /* ---------- Doublons ---------- */
  /** Identifiant stable : même fichier réimporté = mêmes identifiants. Deux opérations identiques le même jour sont numérotées. */
  function identifier(ops, compte) {
    const vus = new Map();
    return ops.map(o => {
      const base = [compte, o.date, o.montant, normaliser(o.libelle)].join('|');
      const n = vus.get(base) || 0; vus.set(base, n + 1);
      return { id: base + '|' + n, date: o.date, libelle: o.libelle, montant: o.montant, compte };
    });
  }

  function fusionner(idsExistants, nouvelles) {
    const ajouts = [], doublons = [];
    for (const o of nouvelles) (idsExistants.has(o.id) ? doublons : ajouts).push(o);
    return { ajouts, doublons };
  }

  /* ---------- Catégories ---------- */
  function categorie(op, reglesPerso) {
    if (op.catManuelle && CATEGORIES.includes(op.catManuelle)) return op.catManuelle;
    const texte = ' ' + normaliser(op.libelle) + ' ';
    for (const r of reglesPerso || []) if (r.motif && texte.includes(' ' + r.motif + ' ')) return r.cat;
    for (const r of REGLES_DEFAUT) {
      if (r.signe && Math.sign(op.montant) !== r.signe) continue;
      if (r.mots.some(m => texte.includes(' ' + m))) return r.cat;
    }
    return op.montant > 0 ? 'Entrées diverses' : A_CLASSER;
  }

  /* ---------- Synthèse ---------- */
  const moisDe = op => op.date.slice(0, 7);

  function listeMois(ops) { return [...new Set(ops.map(moisDe))].sort(); }

  function syntheseMois(ops, regles, mois) {
    const s = { mois, entrees: 0, sorties: 0, neutre: 0, nb: 0, aClasser: 0, parCat: {} };
    for (const o of ops) {
      if (moisDe(o) !== mois) continue;
      s.nb++;
      const cat = categorie(o, regles);
      if (cat === NEUTRE) { s.neutre += o.montant; continue; }
      if (cat === A_CLASSER) s.aClasser++;
      if (o.montant > 0) s.entrees += o.montant; else s.sorties += o.montant;
      s.parCat[cat] = (s.parCat[cat] || 0) + o.montant;
    }
    s.solde = s.entrees + s.sorties;
    return s;
  }

  function mediane(valeurs) {
    const t = [...valeurs].sort((a, b) => a - b), m = t.length >> 1;
    return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2);
  }

  /** Mouvements qui reviennent au moins 3 mois distincts pour un montant proche (± 25 %), encore actifs.
   *  signe = -1 : dépenses (défaut) ; signe = 1 : revenus. Les montants renvoyés sont positifs. */
  function recurrentes(ops, regles, signe) {
    signe = signe === 1 ? 1 : -1;
    const tous = listeMois(ops);
    if (!tous.length) return [];
    const recents = new Set(tous.slice(-2)), groupes = new Map();
    for (const o of ops) {
      if (Math.sign(o.montant) !== signe) continue;
      const cat = categorie(o, regles), cle = marchand(o.libelle);
      if (cat === NEUTRE || !cle) continue;
      if (!groupes.has(cle)) groupes.set(cle, { marchand: cle, cat, parMois: new Map(), jours: [] });
      const g = groupes.get(cle);
      g.parMois.set(moisDe(o), (g.parMois.get(moisDe(o)) || 0) + Math.abs(o.montant));
      g.jours.push(Number(o.date.slice(8, 10)));
    }
    const res = [];
    for (const g of groupes.values()) {
      const med = mediane(g.parMois.values());
      const proches = [...g.parMois].filter(([, v]) => Math.abs(v - med) <= med * 0.25).map(([m]) => m);
      if (proches.length >= 3 && proches.some(m => recents.has(m)))
        res.push({ marchand: g.marchand, cat: g.cat, montant: med, nbMois: proches.length, jour: mediane(g.jours) });
    }
    return res.sort((a, b) => b.montant - a.montant);
  }

  /* ---------- Résumé anonymisé pour Claude ---------- */
  function euros(centimes) {
    const n = Math.abs(centimes), e = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (centimes < 0 ? '-' : '') + e + ',' + String(n % 100).padStart(2, '0');
  }

  /** Texte à coller dans Claude : totaux par catégorie uniquement. Aucun libellé, commerçant, compte ni date d'opération. */
  function resumePourClaude(ops, regles, nbMois) {
    const mois = listeMois(ops).slice(-nbMois);
    if (!mois.length) return '';
    const synth = mois.map(m => syntheseMois(ops, regles, m));
    const dernier = ops.reduce((a, o) => (o.date > a ? o.date : a), '');
    const L = [];
    L.push('BANQUE-RESUME-01 — résumé anonymisé de mes comptes (aucun libellé, aucun commerçant, aucun numéro de compte).');
    L.push('Période : ' + mois[0] + ' à ' + mois[mois.length - 1] + ' (' + mois.length + ' mois), ' + synth.reduce((a, s) => a + s.nb, 0) + ' opérations, montants en euros.');
    L.push('Le dernier mois peut être incomplet : dernière opération connue le ' + dernier + '.');
    L.push('', 'Par mois — entrées / sorties / solde :');
    for (const s of synth) L.push(s.mois + ' : +' + euros(s.entrees) + ' / ' + euros(s.sorties) + ' / ' + (s.solde >= 0 ? '+' : '') + euros(s.solde));
    const cats = {};
    for (const s of synth) for (const [c, v] of Object.entries(s.parCat)) if (v < 0) cats[c] = (cats[c] || 0) + v;
    const totalSorties = Object.values(cats).reduce((a, v) => a + v, 0);
    L.push('', 'Sorties par catégorie — moyenne mensuelle (total sur la période) :');
    for (const [c, v] of Object.entries(cats).sort((a, b) => a[1] - b[1]))
      L.push('- ' + c + ' : ' + euros(-Math.round(v / mois.length)) + ' / mois (' + euros(-v) + ')');
    const rec = recurrentes(ops.filter(o => mois.includes(moisDe(o))), regles);
    if (rec.length) {
      L.push('', 'Charges récurrentes détectées — catégorie, montant mensuel médian, nombre de mois :');
      for (const r of rec) L.push('- ' + r.cat + ' : ' + euros(r.montant) + ' (' + r.nbMois + ' mois)');
      L.push('Total récurrent estimé : ' + euros(rec.reduce((a, r) => a + r.montant, 0)) + ' / mois.');
    }
    if (totalSorties && cats[A_CLASSER]) L.push('', 'Part des sorties non classée : ' + Math.round(100 * cats[A_CLASSER] / totalSorties) + ' %.');
    const neutre = synth.reduce((a, s) => a + s.neutre, 0);
    if (neutre) L.push('Épargne et virements internes (exclus des totaux ci-dessus) : ' + euros(neutre) + ' net sur la période.');
    L.push('', 'Ce que j\'attends de toi : sois direct. Dis-moi 1) où part mon argent, 2) ce qui est anormal ou en hausse, 3) au maximum trois actions concrètes, chiffrées, classées par gain. Signale ce que ces chiffres ne permettent pas de conclure. N\'invente aucun montant.');
    return L.join('\n');
  }

  /* ---------- Comptes et argent disponible ---------- */
  /** Solde d'un compte = solde relevé par le propriétaire à une date + opérations postérieures à cette date. */
  function soldes(comptes, ops) {
    const noms = [...new Set([...(comptes || []).map(c => c.nom), ...ops.map(o => o.compte)])];
    const res = { parCompte: [], disponible: 0, epargne: 0, connus: 0, inconnus: [] };
    for (const nom of noms) {
      const c = (comptes || []).find(x => x.nom === nom) || { nom };
      const connu = Number.isInteger(c.soldeRef) && !!c.dateRef;
      const depuis = connu ? ops.filter(o => o.compte === nom && o.date > c.dateRef) : [];
      const solde = connu ? c.soldeRef + depuis.reduce((a, o) => a + o.montant, 0) : null;
      res.parCompte.push({ nom, epargne: !!c.epargne, solde, dateRef: c.dateRef || null, opsDepuis: depuis.length });
      if (!connu) res.inconnus.push(nom);
      else { res.connus++; if (c.epargne) res.epargne += solde; else res.disponible += solde; }
    }
    return res;
  }

  /* ---------- Échéances : charges fixes, crédits, revenus réguliers ---------- */
  const TYPES_ECHEANCE = ['charge', 'credit', 'revenu'];
  const joursDansMois = mois => new Date(Date.UTC(+mois.slice(0, 4), +mois.slice(5, 7), 0)).getUTCDate();
  const ecartJours = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
  function moisSuivant(mois, n) {
    const d = new Date(Date.UTC(+mois.slice(0, 4), +mois.slice(5, 7) - 1 + (n || 1), 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
  function echeanceDue(e, mois) {
    if (e.fin && mois > e.fin) return false;
    return !e.mois || !e.mois.length || e.mois.includes(+mois.slice(5, 7));
  }
  const dateEcheance = (e, mois) => mois + '-' + String(Math.min(e.jour, joursDansMois(mois))).padStart(2, '0');

  /** Pour un mois : chaque échéance due, sa date, et l'opération du relevé qui la règle si on la retrouve.
   *  Avec mot-clé : libellé contenant le mot-clé, montant à ± 50 %. Sans : montant à ± 5 % et date à 7 jours près. */
  function etatEcheances(echeances, ops, mois) {
    const duMois = ops.filter(o => moisDe(o) === mois), prises = new Set();
    return (echeances || []).filter(e => echeanceDue(e, mois)).map(e => {
      const date = dateEcheance(e, mois), abs = Math.abs(e.montant);
      const op = duMois.find(o => {
        if (prises.has(o.id) || Math.sign(o.montant) !== Math.sign(e.montant)) return false;
        const ecart = Math.abs(Math.abs(o.montant) - abs);
        if (e.motif) return (' ' + normaliser(o.libelle) + ' ').includes(' ' + e.motif + ' ') && ecart <= abs * 0.5;
        return ecart <= abs * 0.05 && Math.abs(ecartJours(o.date, date)) <= 7;
      });
      if (op) prises.add(op.id);
      return { echeance: e, date, reglee: !!op, op: op || null };
    }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  /** Charge mensuelle lissée : une échéance annuelle compte pour 1/12. */
  function totalMensuel(echeances, type) {
    return Math.round((echeances || []).filter(e => !type || e.type === type)
      .reduce((a, e) => a + e.montant * ((e.mois && e.mois.length) || 12) / 12, 0));
  }

  /** Récurrences repérées dans les relevés et pas encore déclarées : propositions à valider d'un geste. */
  function suggestionsEcheances(ops, regles, echeances) {
    const fixes = ['Logement', 'Énergie et télécoms', 'Assurances', 'Abonnements', 'Santé', 'Impôts', 'Frais bancaires', A_CLASSER];
    const connue = r => (echeances || []).some(e => e.motif && (e.motif === r.marchand || r.marchand.includes(e.motif) || e.motif.includes(r.marchand)));
    const charges = recurrentes(ops, regles, -1).filter(r => fixes.includes(r.cat) && !connue(r))
      .map(r => ({ libelle: r.marchand, montant: -r.montant, jour: r.jour, cat: r.cat, type: 'charge', motif: r.marchand, nbMois: r.nbMois }));
    const revenus = recurrentes(ops, regles, 1).filter(r => !connue(r))
      .map(r => ({ libelle: r.marchand, montant: r.montant, jour: r.jour, cat: r.cat, type: 'revenu', motif: r.marchand, nbMois: r.nbMois }));
    return [...revenus, ...charges];
  }

  /* ---------- Prévision de fin de mois ---------- */
  /** Dépenses courantes par jour (hors échéances déclarées, hors épargne), estimées sur les 3 derniers mois complets. */
  function rythmeVariable(d, aujourdhui) {
    const mois = aujourdhui.slice(0, 7);
    const horsCharges = m => {
      const s = syntheseMois(d.ops, d.regles, m);
      const fixes = (d.echeances || []).filter(e => e.montant < 0 && echeanceDue(e, m)).reduce((a, e) => a - e.montant, 0);
      return Math.max(0, -s.sorties - fixes);
    };
    const complets = listeMois(d.ops).filter(m => m < mois).slice(-3);
    if (complets.length) {
      const jours = complets.reduce((a, m) => a + joursDansMois(m), 0);
      return { parJour: complets.reduce((a, m) => a + horsCharges(m), 0) / jours, base: complets.length + ' mois complet' + (complets.length > 1 ? 's' : '') };
    }
    const s = syntheseMois(d.ops, d.regles, mois);
    if (!s.nb) return { parJour: 0, base: 'aucune donnée' };
    const reglees = etatEcheances(d.echeances, d.ops, mois).filter(x => x.reglee && x.echeance.montant < 0).reduce((a, x) => a - x.op.montant, 0);
    return { parJour: Math.max(0, -s.sorties - reglees) / +aujourdhui.slice(8, 10), base: 'le mois en cours seulement' };
  }

  /** Solde prévu à la fin du mois en cours et point le plus bas d'ici là. Tout est une estimation. */
  function prevision(d, aujourdhui) {
    const mois = aujourdhui.slice(0, 7), nbJours = joursDansMois(mois), jourAuj = +aujourdhui.slice(8, 10);
    const s = soldes(d.comptes, d.ops);
    if (!s.parCompte.some(c => c.solde !== null && !c.epargne)) return { inconnu: true, mois };
    const restantes = etatEcheances(d.echeances, d.ops, mois).filter(x => !x.reglee)
      .map(x => ({ libelle: x.echeance.libelle, type: x.echeance.type, cat: x.echeance.cat, montant: x.echeance.montant, date: x.date, enRetard: x.date < aujourdhui }));
    const r = rythmeVariable(d, aujourdhui);
    let solde = s.disponible, bas = { montant: s.disponible, date: aujourdhui };
    for (let j = jourAuj; j <= nbJours; j++) {
      const date = mois + '-' + String(j).padStart(2, '0');
      for (const e of restantes) if (e.date === date || (j === jourAuj && e.enRetard)) solde += e.montant;
      if (j > jourAuj) solde -= r.parJour;
      if (solde < bas.montant) bas = { montant: Math.round(solde), date };
    }
    const revenusAttendus = restantes.filter(e => e.montant > 0).reduce((a, e) => a + e.montant, 0);
    const chargesAVenir = restantes.filter(e => e.montant < 0).reduce((a, e) => a + e.montant, 0);
    const variablesRestantes = -Math.round(r.parJour * (nbJours - jourAuj));
    return { mois, disponible: s.disponible, revenusAttendus, chargesAVenir, variablesRestantes,
      soldeFin: s.disponible + revenusAttendus + chargesAVenir + variablesRestantes,
      pointBas: bas, base: r.base, parJour: Math.round(r.parJour), joursRestants: nbJours - jourAuj, echeancesRestantes: restantes };
  }

  /* ---------- Alertes et pistes d'économies ---------- */
  const jourFr = d => d.slice(8, 10) + '/' + d.slice(5, 7);

  function alertes(d, aujourdhui) {
    const res = [], p = prevision(d, aujourdhui), seuil = Number.isInteger(d.seuil) ? d.seuil : 0, mois = aujourdhui.slice(0, 7);
    if (!p.inconnu) {
      if (p.pointBas.montant < 0) res.push({ niveau: 'rouge', texte: 'Découvert possible le ' + jourFr(p.pointBas.date) + ' : ' + euros(p.pointBas.montant) + ' €.' });
      if (p.soldeFin < seuil && !(p.pointBas.montant < 0 && p.pointBas.date.slice(8) === String(joursDansMois(mois))))
        res.push({ niveau: 'rouge', texte: 'Solde prévu en fin de mois : ' + euros(p.soldeFin) + ' €' + (seuil ? ', sous votre seuil de ' + euros(seuil) + ' €.' : '.') });
      for (const e of p.echeancesRestantes.filter(e => e.enRetard && e.montant < 0))
        res.push({ niveau: 'orange', texte: '« ' + e.libelle + ' » (' + euros(-e.montant) + ' €) était prévue le ' + jourFr(e.date) + ' et n\'apparaît pas dans vos opérations.' });
      for (const e of p.echeancesRestantes.filter(e => e.enRetard && e.montant > 0))
        res.push({ niveau: 'orange', texte: 'Revenu « ' + e.libelle + ' » attendu le ' + jourFr(e.date) + ', pas encore vu.' });
    }
    const s = syntheseMois(d.ops, d.regles, mois);
    for (const [cat, budget] of Object.entries(d.budgets || {})) {
      const depense = -(s.parCat[cat] || 0);
      if (depense > budget) res.push({ niveau: 'orange', texte: 'Budget « ' + cat + ' » dépassé : ' + euros(depense) + ' € pour ' + euros(budget) + ' € prévus.' });
    }
    for (const c of soldes(d.comptes, d.ops).parCompte)
      if (c.dateRef && !c.opsDepuis && ecartJours(aujourdhui, c.dateRef) > 14)
        res.push({ niveau: 'info', texte: 'Solde de « ' + c.nom + ' » non mis à jour depuis ' + ecartJours(aujourdhui, c.dateRef) + ' jours.' });
    return res;
  }

  /** Constats chiffrés sur les relevés. Ce sont des faits ; juger une dépense « inutile » reste votre décision. */
  function pistes(d, aujourdhui) {
    const res = [], mois = aujourdhui.slice(0, 7);
    const complets = listeMois(d.ops).filter(m => m < mois);
    const abos = recurrentes(d.ops, d.regles, -1).filter(r => r.cat === 'Abonnements');
    if (abos.length) {
      const t = abos.reduce((a, r) => a + r.montant, 0);
      res.push({ titre: abos.length + ' abonnement' + (abos.length > 1 ? 's' : '') + ' : ' + euros(t) + ' € par mois, soit ' + euros(t * 12) + ' € par an',
        detail: abos.map(r => r.marchand + ' ' + euros(r.montant) + ' €').join(' · '), gainMensuel: t });
    }
    const trois = complets.slice(-3);
    if (trois.length) {
      const frais = trois.reduce((a, m) => a - (syntheseMois(d.ops, d.regles, m).parCat['Frais bancaires'] || 0), 0);
      if (frais > 0) res.push({ titre: 'Frais bancaires : ' + euros(frais) + ' € sur ' + trois.length + ' mois',
        detail: 'Souvent négociables ou évitables (cotisation de carte, commissions, agios).', gainMensuel: Math.round(frais / trois.length) });
    }
    if (complets.length >= 2) {
      const dernier = complets[complets.length - 1], avant = complets.slice(-4, -1);
      const sd = syntheseMois(d.ops, d.regles, dernier), sa = avant.map(m => syntheseMois(d.ops, d.regles, m));
      for (const [cat, v] of Object.entries(sd.parCat)) {
        if (v >= 0 || cat === A_CLASSER) continue;
        const moy = sa.reduce((a, x) => a - (x.parCat[cat] || 0), 0) / sa.length, hausse = -v - moy;
        if (moy > 0 && hausse > 3000 && hausse > moy * 0.2)
          res.push({ titre: cat + ' en hausse en ' + dernier + ' : +' + euros(Math.round(hausse)) + ' €',
            detail: euros(-v) + ' € contre ' + euros(Math.round(moy)) + ' € en moyenne sur les ' + sa.length + ' mois précédents.', gainMensuel: Math.round(hausse) });
      }
      const petits = new Map();
      for (const o of d.ops) {
        if (moisDe(o) !== dernier || o.montant >= 0 || o.montant < -1500 || categorie(o, d.regles) === NEUTRE) continue;
        const cle = marchand(o.libelle); if (!cle) continue;
        const g = petits.get(cle) || { n: 0, total: 0 }; g.n++; g.total -= o.montant; petits.set(cle, g);
      }
      for (const [cle, g] of petits) if (g.n >= 8)
        res.push({ titre: g.n + ' petits achats chez ' + cle + ' en ' + dernier + ' : ' + euros(g.total) + ' €', detail: 'Moins de 15 € à chaque fois, mais ' + euros(g.total * 12) + ' € par an à ce rythme.', gainMensuel: g.total });
    }
    return res.sort((a, b) => b.gainMensuel - a.gainMensuel);
  }

  /** Budgets proposés : moyenne des 3 derniers mois complets, arrondie à 10 € au-dessus. Ne remplace pas un budget existant. */
  function budgetsProposes(d, aujourdhui) {
    const complets = listeMois(d.ops).filter(m => m < aujourdhui.slice(0, 7)).slice(-3), res = {};
    if (!complets.length) return res;
    const hors = ['Revenus', 'Entrées diverses', NEUTRE, A_CLASSER];
    for (const cat of CATEGORIES) {
      if (hors.includes(cat) || (d.budgets && d.budgets[cat])) continue;
      const moy = complets.reduce((a, m) => a - (syntheseMois(d.ops, d.regles, m).parCat[cat] || 0), 0) / complets.length;
      if (moy >= 1000) res[cat] = Math.ceil(moy / 1000) * 1000;
    }
    return res;
  }

  /* ---------- Saisies manuelles et rapprochement avec un relevé ---------- */
  const estManuelle = o => o.id.startsWith('M|');
  /** Une saisie manuelle retrouvée dans un relevé (même compte, même montant, 4 jours d'écart au plus) est remplacée. */
  function rapprocher(ops, ajouts) {
    const prises = new Set(), paires = [];
    for (const a of ajouts) {
      const m = ops.find(o => estManuelle(o) && !prises.has(o.id) && o.compte === a.compte && o.montant === a.montant && Math.abs(ecartJours(o.date, a.date)) <= 4);
      if (m) { prises.add(m.id); paires.push({ manuelle: m, importee: a }); }
    }
    return paires;
  }

  /** Résumé pour Claude, complété par la situation du moment (toujours sans libellé ni nom de compte). */
  function resumeComplet(d, nbMois, aujourdhui) {
    const base = resumePourClaude(d.ops, d.regles, nbMois);
    if (!base) return '';
    const L = [], p = prevision(d, aujourdhui);
    L.push('Situation au ' + aujourdhui + ' :');
    if (p.inconnu) L.push('- Solde des comptes non renseigné.');
    else {
      L.push('- Argent disponible (hors épargne) : ' + euros(p.disponible));
      L.push('- Prévision fin de mois : ' + euros(p.soldeFin) + ' (revenus attendus ' + euros(p.revenusAttendus) + ', charges à venir ' + euros(p.chargesAVenir) + ', dépenses courantes estimées ' + euros(p.variablesRestantes) + ' d\'après ' + p.base + ')');
      L.push('- Point le plus bas prévu : ' + euros(p.pointBas.montant) + ' le ' + p.pointBas.date);
    }
    if ((d.echeances || []).length) {
      L.push('- Charges fixes déclarées : ' + euros(-totalMensuel(d.echeances, 'charge')) + ' / mois ; crédits : ' + euros(-totalMensuel(d.echeances, 'credit')) + ' / mois ; revenus réguliers : ' + euros(totalMensuel(d.echeances, 'revenu')) + ' / mois (montants lissés).');
      for (const e of d.echeances.filter(x => x.type === 'credit' && x.fin)) L.push('- Un crédit de ' + euros(-e.montant) + ' / mois se termine en ' + e.fin + '.');
    }
    const budgets = Object.entries(d.budgets || {});
    if (budgets.length) L.push('- Budgets mensuels fixés : ' + budgets.map(([c, v]) => c + ' ' + euros(v)).join(', ') + '.');
    return base.replace('\n\nCe que j\'attends de toi', '\n\n' + L.join('\n') + '\n\nCe que j\'attends de toi');
  }

  /* ---------- Sauvegarde ---------- */
  function validerSauvegarde(d) {
    if (!d || d.format !== 'banque-locale' || !Array.isArray(d.ops)) throw new Error('Ce fichier n\'est pas une sauvegarde Banque locale.');
    const ids = new Set();
    const texte = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
    const ops = d.ops.map((o, i) => {
      const ok = o && typeof o.id === 'string' && o.id && !ids.has(o.id) && typeof o.libelle === 'string'
        && typeof o.compte === 'string' && Number.isInteger(o.montant) && o.montant !== 0
        && typeof o.date === 'string' && parseDate(o.date) === o.date;
      if (!ok) throw new Error('Sauvegarde refusée : opération n° ' + (i + 1) + ' invalide.');
      ids.add(o.id);
      const p = { id: o.id, date: o.date, libelle: o.libelle, montant: o.montant, compte: o.compte };
      if (CATEGORIES.includes(o.catManuelle)) p.catManuelle = o.catManuelle;
      return p;
    });
    const regles = (Array.isArray(d.regles) ? d.regles : [])
      .filter(r => r && typeof r.motif === 'string' && r.motif && CATEGORIES.includes(r.cat))
      .map(r => ({ motif: normaliser(r.motif), cat: r.cat }));
    const nomsVus = new Set();
    const comptes = (Array.isArray(d.comptes) ? d.comptes : []).map((c, i) => {
      const soldeOk = c && (c.soldeRef === undefined || (Number.isInteger(c.soldeRef) && typeof c.dateRef === 'string' && parseDate(c.dateRef) === c.dateRef));
      if (!c || !texte(c.nom, 40) || nomsVus.has(c.nom) || !soldeOk) throw new Error('Sauvegarde refusée : compte n° ' + (i + 1) + ' invalide.');
      nomsVus.add(c.nom);
      const p = { nom: c.nom, epargne: c.epargne === true };
      if (c.soldeRef !== undefined) { p.soldeRef = c.soldeRef; p.dateRef = c.dateRef; }
      return p;
    });
    const idsE = new Set();
    const echeances = (Array.isArray(d.echeances) ? d.echeances : []).map((e, i) => {
      const ok = e && texte(e.id, 60) && !idsE.has(e.id) && texte(e.libelle, 60) && Number.isInteger(e.montant) && e.montant !== 0
        && Number.isInteger(e.jour) && e.jour >= 1 && e.jour <= 31 && CATEGORIES.includes(e.cat) && TYPES_ECHEANCE.includes(e.type)
        && (e.type === 'revenu') === (e.montant > 0)
        && (e.mois === undefined || (Array.isArray(e.mois) && e.mois.length <= 12 && e.mois.every(m => Number.isInteger(m) && m >= 1 && m <= 12)))
        && (e.fin === undefined || /^\d{4}-(0[1-9]|1[0-2])$/.test(e.fin)) && (e.motif === undefined || texte(e.motif, 60));
      if (!ok) throw new Error('Sauvegarde refusée : échéance n° ' + (i + 1) + ' invalide.');
      idsE.add(e.id);
      const p = { id: e.id, libelle: e.libelle, montant: e.montant, jour: e.jour, cat: e.cat, type: e.type };
      if (e.mois && e.mois.length) p.mois = [...new Set(e.mois)].sort((a, b) => a - b);
      if (e.fin) p.fin = e.fin;
      if (e.motif && normaliser(e.motif)) p.motif = normaliser(e.motif);
      return p;
    });
    const budgets = {};
    for (const [cat, v] of Object.entries(d.budgets && typeof d.budgets === 'object' && !Array.isArray(d.budgets) ? d.budgets : {}))
      if (CATEGORIES.includes(cat) && Number.isInteger(v) && v > 0) budgets[cat] = v;
    return { ops, regles, comptes, echeances, budgets, seuil: Number.isInteger(d.seuil) ? d.seuil : 0 };
  }

  return { CATEGORIES, A_CLASSER, NEUTRE, parseMontant, parseDate, normaliser, marchand, lireReleve, identifier,
    fusionner, categorie, listeMois, syntheseMois, recurrentes, resumePourClaude, euros, validerSauvegarde,
    TYPES_ECHEANCE, soldes, echeanceDue, dateEcheance, etatEcheances, totalMensuel, suggestionsEcheances, moisSuivant,
    rythmeVariable, prevision, alertes, pistes, budgetsProposes, estManuelle, rapprocher, resumeComplet };
});
