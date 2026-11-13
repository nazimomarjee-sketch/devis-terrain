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

  /** Dépenses qui reviennent au moins 3 mois distincts pour un montant proche (± 25 %), encore actives. */
  function recurrentes(ops, regles) {
    const tous = listeMois(ops);
    if (!tous.length) return [];
    const recents = new Set(tous.slice(-2)), groupes = new Map();
    for (const o of ops) {
      if (o.montant >= 0) continue;
      const cat = categorie(o, regles), cle = marchand(o.libelle);
      if (cat === NEUTRE || !cle) continue;
      if (!groupes.has(cle)) groupes.set(cle, { marchand: cle, cat, parMois: new Map() });
      const g = groupes.get(cle);
      g.parMois.set(moisDe(o), (g.parMois.get(moisDe(o)) || 0) - o.montant);
    }
    const res = [];
    for (const g of groupes.values()) {
      const med = mediane(g.parMois.values());
      const proches = [...g.parMois].filter(([, v]) => Math.abs(v - med) <= med * 0.25).map(([m]) => m);
      if (proches.length >= 3 && proches.some(m => recents.has(m)))
        res.push({ marchand: g.marchand, cat: g.cat, montant: med, nbMois: proches.length });
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

  /* ---------- Sauvegarde ---------- */
  function validerSauvegarde(d) {
    if (!d || d.format !== 'banque-locale' || !Array.isArray(d.ops)) throw new Error('Ce fichier n\'est pas une sauvegarde Banque locale.');
    const ids = new Set();
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
    return { ops, regles };
  }

  return { CATEGORIES, A_CLASSER, NEUTRE, parseMontant, parseDate, normaliser, marchand, lireReleve, identifier,
    fusionner, categorie, listeMois, syntheseMois, recurrentes, resumePourClaude, euros, validerSauvegarde };
});
