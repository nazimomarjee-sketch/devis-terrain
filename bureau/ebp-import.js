/* ODICOLOR Bureau — lecture des exports EBP (pièces, échéancier des règlements, clients). LECTURE SEULE.
   Fonctions utiles reprises de la page « Chaîne Odicolor » (22/10/2026), sans son interface.
   Règles : aucune ligne devinée. Une ligne illisible est ignorée AVEC son motif ; les montants sont en centimes entiers
   (pas d'erreur d'arrondi) ; les dates en texte « AAAA-MM-JJ » (pas de décalage de fuseau).
   HYPOTHÈSE : les noms de colonnes EBP réels ne sont pas encore connus (aucun export réel reçu). La détection est
   automatique, la correspondance retenue est toujours affichée, et l'import est refusé s'il manque une colonne obligatoire. */
(function (racine) {
  'use strict';

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const texte = (v, n = 160) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

  // Colonnes attendues par type d'export : [clé, libellé, expression de détection, obligatoire]
  const COLONNES = {
    pieces: [
      ['type', 'Type de pièce', /^(type|nature)|type de (piece|document)|^document$/, false],
      // Lot 1 : variantes alignées sur l'import du téléphone (ca-ebp-v48.js) — « Numéro du document », « N° de facture »,
      // « Date du document », « Nom du tiers », « Intitulé du client », « N° client », « Compte client » (HYPOTHÈSE : identifiant client).
      ['no', 'N° de pièce', /^(n°|no|num(ero)?)( (de|du))?( la)? ?(piece|document|facture)?$|^(n°|no|numero) (piece|document|facture)|^piece$/, true],
      ['date', 'Date', /^date( (de|du))?( la)? ?(piece|document|facture)?$/, true],
      ['code', 'Code client', /code.*client|^code tiers$|^tiers$|^code$|^(n°|no|numero) (client|tiers)$|^compte (client|tiers)$/, false],
      ['client', 'Nom du client', /(nom|raison sociale|libelle|intitule).*(client|tiers)|^client$|^raison sociale$|^nom$/, true],
      ['ht', 'Montant HT', /(montant|total|net).*h\.?t|^h\.?t\.?$/, true],
      ['origine', 'N° de pièce d’origine', /origine|piece (precedente|liee|source)|precedent/, false],
      ['ref', 'Référence / commentaire', /reference|commentaire|objet/, false]
    ],
    reglements: [
      ['facture', 'N° de facture', /facture|^(n°|no|numero)( de)? ?piece$/, true],
      ['echeance', 'Date d’échéance', /echeance/, true],
      ['reglement', 'Date de règlement', /reglement|paiement|encaisse/, false],
      // « Montant réglé » est lu AVANT « Montant TTC » et exclu de celui-ci : sinon la colonne du réglé pouvait être prise pour le dû.
      ['regle', 'Montant réglé', /(montant|total) (deja )?(regle|paye|encaisse)|^(deja )?regle$|^paye$/, false],
      ['montant', 'Montant TTC', /^(?!.*(regle|paye|encaiss|reste)).*(montant|total|ttc)/, true],
      ['reste', 'Reste à payer', /reste|solde|impaye|du$/, false]
    ],
    clients: [
      ['code', 'Code client', /^code$|code.*(client|tiers)|^(n°|no|numero) client$/, true], // jamais « Code postal »
      ['nom', 'Nom', /nom|raison sociale|^client$/, true],
      ['ville', 'Ville', /ville|commune/, false],
      ['cp', 'Code postal', /code postal|^cp$/, false],
      ['siret', 'SIRET', /siret/, false], // lot 1 : rapprochement EBP ↔ SIRET (vérifié par la clé de Luhn)
      ['statut', 'Statut du compte', /statut|bloque|sommeil|^etat|^actif$/, false], // jamais « Compte comptable »
      ['famille', 'Famille / activité (carrosserie, mécanique)', /famille|categorie|activite|type de client|secteur/, false],
      // Portefeuille : sert seulement à distinguer le CA personnel du CA de l'agence. Jamais « Nom commercial » (enseigne).
      ['commercial', 'Représentant / commercial', /^(code )?(representant|commercial|vendeur)$|representant|^portefeuille|^vendeur|^commercial (attitre|affecte)/, false]
    ],
    // FEC : en-têtes comptables reconnus, sans alimentation des chiffres commerciaux.
    fec: [
      ['journalCode','Code journal',/^journal ?code$/,true],
      ['journalLib','Libellé journal',/^journal ?lib$/,false],
      ['ecritureNum','N° écriture',/^ecriture ?num$/,false],
      ['ecritureDate','Date écriture',/^ecriture ?date$/,true],
      ['compteNum','N° compte',/^compte ?num$/,true],
      ['compteLib','Libellé compte',/^compte ?lib$/,false],
      ['compAuxNum','Compte auxiliaire',/^comp ?aux ?num$/,false],
      ['compAuxLib','Libellé auxiliaire',/^comp ?aux ?lib$/,false],
      ['pieceRef','Référence pièce',/^piece ?ref$/,false],
      ['pieceDate','Date pièce',/^piece ?date$/,false],
      ['ecritureLib','Libellé écriture',/^ecriture ?lib$/,false],
      ['debit','Débit',/^debit$/,true],
      ['credit','Crédit',/^credit$/,true],
      ['ecritureLet','Lettrage',/^ecriture ?let$/,false],
      ['dateLet','Date lettrage',/^date ?let$/,false],
      ['validDate','Date validation',/^valid ?date$/,false],
      ['montantdevise','Montant devise',/^montant ?devise$/,false],
      ['idevise','Identifiant devise',/^idevise$/,false]
    ]
  };

  // Octets → texte : UTF-8 strict, sinon Windows-1252 (export Excel/EBP français courant).
  function decoderTexte(octets) {
    const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    // Lot 8 : « Texte Unicode » d'Excel / EBP = UTF-16 avec marque d'ordre des octets (BOM).
    if (u8[0] === 0xFF && u8[1] === 0xFE) return { texte: new TextDecoder('utf-16le').decode(u8.subarray(2)), encodage: 'UTF-16' };
    if (u8[0] === 0xFE && u8[1] === 0xFF) return { texte: new TextDecoder('utf-16be').decode(u8.subarray(2)), encodage: 'UTF-16' };
    try { return { texte: new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''), encodage: 'UTF-8' }; }
    catch (_) { return { texte: new TextDecoder('windows-1252').decode(u8), encodage: 'Windows-1252' }; }
  }

  // CSV avec séparateur détecté (; tabulation ,) et guillemets.
  function lireCsv(t) {
    t = String(t).replace(/^﻿/, '');
    const premiere = t.split(/\r?\n/, 1)[0];
    const sep = [';', '\t', ',', '|'].map(d => [d, premiere.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const lignes = []; let ligne = [], cur = '', q = false, physique = 1, debut = 1;
    const ajouter = () => {
      ligne.push(cur);
      if (ligne.some(x => x !== '')) {
        Object.defineProperty(ligne, 'lignePhysique', { value: debut, enumerable: false });
        lignes.push(ligne);
      }
      ligne = []; cur = '';
    };
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false;
        else { cur += c; if (c === '\n' || (c === '\r' && t[i + 1] !== '\n')) physique++; } }
      else if (c === '"') q = true;
      else if (c === sep) { ligne.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; ajouter(); physique++; debut = physique; }
      else cur += c;
    }
    ajouter();
    return lignes;
  }

  // Détection des colonnes. Retourne { carte: {clé: index}, manquantes: [libellés obligatoires absents] }.
  function associerColonnes(type, entetes) {
    const def = COLONNES[type]; if (!def) throw new Error('Type d’export inconnu : ' + type);
    const hn = entetes.map(norm), pris = new Set(), carte = {};
    for (const [k, , re] of def) {
      const i = hn.findIndex((x, j) => !pris.has(j) && re.test(x));
      if (i >= 0) { carte[k] = i; pris.add(i); }
    }
    const manquantes = def.filter(([k, , , ob]) => ob && carte[k] == null).map(([, lib]) => lib);
    return { carte, manquantes, correspondance: def.filter(([k]) => carte[k] != null).map(([k, lib]) => ({ cle: k, libelle: lib, colonne: entetes[carte[k]] })) };
  }

  const pad = n => String(n).padStart(2, '0');
  // Date → « AAAA-MM-JJ » ou '' si illisible. Accepte JJ/MM/AAAA, JJ-MM-AA, AAAA-MM-JJ, numéro de série Excel, Date.
  function lireDate(v) {
    let y, m, d;
    if (v instanceof Date && !isNaN(v)) { y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate(); }
    else if (typeof v === 'number' && v > 20000 && v < 80000) { const x = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); y = x.getUTCFullYear(); m = x.getUTCMonth() + 1; d = x.getUTCDate(); }
    else {
      const s = String(v == null ? '' : v).trim(); let r;
      if ((r = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:\s|$)/))) { d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000; }
      else if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +r[1]; m = +r[2]; d = +r[3]; }
      else return '';
    }
    const iso = y + '-' + pad(m) + '-' + pad(d), x = new Date(Date.UTC(y, m - 1, d));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? iso : '';
  }

  // Montant ambigu : « 1.234 » ou « 1,234 » (un seul séparateur suivi de 3 chiffres) peut être 1 234 € ou 1,234 €.
  // Constaté le 13/11/2026 : « 1.234 » était lu 1,23 €. Une telle valeur n'est plus devinée : la ligne est écartée avec ce motif.
  function montantAmbigu(v) {
    if (typeof v === 'number') return false;
    const s = String(v == null ? '' : v).replace(/[\s  €]/g, '').replace(/^[-(]|\)$/g, '');
    return /^\d{1,3}[.,]\d{3}$/.test(s);
  }

  // Montant → centimes entiers, ou null si illisible. « 1 234,56 », « 1.234,56 », « 1234.56 », « 1 234,56 € », nombre Excel.
  function lireMontant(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
    if (montantAmbigu(v)) return null;
    let s = String(v == null ? '' : v).replace(/[\s  €]/g, '');
    if (!s) return null;
    const neg = /^-|^\(.*\)$/.test(s); s = s.replace(/^[-(]|\)$/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const c = Math.round(parseFloat(s) * 100);
    return Number.isSafeInteger(c) ? (neg ? -c : c) : null;
  }

  // Type de pièce, depuis la colonne « type » ou le préfixe du numéro. Les avoirs sont signalés, jamais mélangés.
  function lireType(t, no) {
    const s = norm(t);
    if (/avoir/.test(s)) return 'avoir';
    if (/devis|proposition/.test(s)) return 'devis';
    if (/commande/.test(s)) return 'commande';
    if (/livraison|^bl\b/.test(s)) return 'bl';
    if (/facture/.test(s)) return 'facture';
    const n = String(no || '').toUpperCase();
    if (/^(AV|AF)/.test(n)) return 'avoir';
    if (/^(DE|DV|DEV)/.test(n)) return 'devis';
    if (/^(CC|CO|CDE|BC)/.test(n)) return 'commande';
    if (/^(BL|LI)/.test(n)) return 'bl';
    if (/^(FA|FC|FAC)/.test(n)) return 'facture';
    return '';
  }

  // Lot 8 : ligne d'en-tête = parmi les 15 premières, celle qui reconnaît le plus de colonnes (les lignes de titre d'un état EBP
  // au-dessus sont ignorées). À score égal, la plus haute. Aucune ligne reconnue : la première (comportement d'origine).
  function trouverEntete(type, lignes) {
    let meilleur = 0, score = -1;
    for (let i = 0; i < Math.min(15, (lignes || []).length); i++) {
      const a = associerColonnes(type, (lignes[i] || []).map(x => texte(x, 80))), sc = Object.keys(a.carte).length - a.manquantes.length * 0.01;
      if (sc > score) { score = sc; meilleur = i; }
    }
    return meilleur;
  }
  // Le FEC est reconnu par une combinaison de cinq champs, jamais par « débit » seul.
  function estFec(entetes) {
    const h = new Set((entetes || []).map(x => norm(x).replace(/[^a-z0-9]/g,'')));
    return ['journalcode','ecrituredate','comptenum','debit','credit'].every(k => h.has(k));
  }
  function appliquerCarteMemorisee(type, entetes, memorisee = {}) {
    if (!COLONNES[type]) throw new Error('Type d’export inconnu : ' + type);
    const carte = {}, utilises = new Set();
    for (const [cle, colonne] of Object.entries(memorisee || {})) {
      if (!COLONNES[type].some(c => c[0] === cle)) throw new Error('Champ mémorisé inconnu.');
      if (colonne === '' || colonne == null) continue;
      if (!entetes.includes(colonne)) throw new Error('Colonne mémorisée absente du fichier.');
      if (utilises.has(colonne)) throw new Error('Une colonne ne peut servir à deux champs.');
      utilises.add(colonne); carte[cle] = colonne;
    }
    return { carte };
  }
  const modeImport = options => {
    const mode = options.mode || 'tolere';
    if (!['strict', 'tolere'].includes(mode)) throw new Error('Mode d’import inconnu.');
    return mode;
  };
  function terminerLecture(T, ignorees) {
    if (T.mode === 'strict' && ignorees.length) throw new Error(
      'Import strict refusé : ' + ignorees.length + ' ligne(s) rejetée(s) (lignes ' +
      ignorees.slice(0,15).map(x => x.ligne).join(', ') + '). Aucune donnée importée.');
  }
  // Aucune valeur brute, référence, nom, montant ni nom de fichier dans le rapport partageable.
  function motifPublic(motif) {
    const m = norm(motif);
    if (/tronqu|colonne/.test(m)) return 'Nombre de colonnes incorrect';
    if (/montant|reste|regle|ht/.test(m)) return 'Montant illisible ou incohérent';
    if (/date|echeance/.test(m)) return 'Date illisible ou absente';
    if (/double|doublon/.test(m)) return 'Doublon';
    if (/siret/.test(m)) return 'SIRET invalide';
    if (/type/.test(m)) return 'Type de pièce non reconnu';
    if (/client|code|nom/.test(m)) return 'Information client manquante';
    return 'Ligne à vérifier (détail masqué)';
  }
  function rapportAnomalies(resultat) {
    const r = resultat || {}, ignorees = r.ignorees || [], anomalies = r.anomalies || [];
    return {
      type: ['pieces','reglements','clients','fec'].includes(r.type) ? r.type : 'inconnu',
      lues: r.lues || 0,
      acceptees: r.acceptees == null ? r.lues - ignorees.length : r.acceptees,
      rejetees: ignorees.length,
      anomalies: ignorees.map(x => ({ ligne:x.ligne, motif:motifPublic(x.motif), gravite:'rejet' }))
        .concat(anomalies.map(x => ({ ligne:x.ligne, motif:motifPublic(x.motif), gravite:'attention' }))),
      colonnes: (r.correspondance || []).map(c => ({ cle:c.cle, libelle:c.libelle, colonne:'[nom d’en-tête masqué]' }))
    };
  }
  // Signature d'un format d'export : type + en-têtes normalisés (pour retrouver une correspondance validée).
  const signature = (type, entetes) => type + '|' + entetes.map(norm).join('|');
  // options : { ligneEntete, carte (clé → NOM de colonne choisi à la main) }. Une association manuelle prime sur la détection.
  function analyser(type, lignes, options = {}) {
    if (!Array.isArray(lignes) || !lignes.length) throw new Error('Export ' + type + ' vide.');
    if (!COLONNES[type]) throw new Error('Type d’export inconnu : ' + type);
    const fec = lignes.slice(0,15).some(estFec);
    if (fec && type !== 'fec') throw new Error('FEC comptable détecté : impossible de l’importer comme export commercial. Utilise les exports de ventes, règlements ou clients EBP.');
    if (type === 'fec' && !fec) throw new Error('Colonnes caractéristiques d’un FEC absentes.');
    const mode = modeImport(options);
    const i = options.ligneEntete != null ? options.ligneEntete : trouverEntete(type, lignes);
    const entetes = (lignes[i] || []).map(x => texte(x, 80)), a = associerColonnes(type, entetes), carte = Object.assign({}, a.carte), def = COLONNES[type];
    for (const [k, nom] of Object.entries(options.carte || {})) {
      if (!def.some(d => d[0] === k)) continue;
      if (nom === '' || nom == null) { delete carte[k]; continue; }
      const j = entetes.indexOf(nom); if (j < 0) throw new Error('Colonne « ' + nom + ' » absente de ce fichier.');
      for (const [k2, v] of Object.entries(carte)) if (v === j && k2 !== k) delete carte[k2];
      carte[k] = j;
    }
    const manquantes = def.filter(([k, , , ob]) => ob && carte[k] == null).map(([, lib]) => lib);
    const utilises = new Set(Object.values(carte));
    const ambiguites = entetes.flatMap((nom, index) => {
      const compatibles = def.filter(([, , re]) => re.test(norm(nom))).map(([cle, libelle]) => ({ cle, libelle }));
      if (compatibles.length > 1 || (!utilises.has(index) && /montant|total|solde/.test(norm(nom)))) {
        const possibles = compatibles.length > 1 ? compatibles : def.filter(([cle]) => /^(ht|montant|regle|reste|debit|credit)$/.test(cle)).map(([cle, libelle]) => ({ cle, libelle }));
        return [{ colonne: nom, possibles }];
      }
      return [];
    });
    return { type, ligneEntete: i, entetes, carte, manquantes, mode, ambiguites, signature: signature(type, entetes), manuel: !!(options.carte && Object.keys(options.carte).length),
      correspondance: def.filter(([k]) => carte[k] != null).map(([k, lib]) => ({ cle: k, libelle: lib, colonne: entetes[carte[k]] })),
      champs: def.map(([k, lib, , ob]) => ({ cle: k, libelle: lib, obligatoire: ob, colonne: carte[k] != null ? entetes[carte[k]] : '' })), lignesTitre: i };
  }
  function verifierTable(type, lignes, options = {}) {
    if (!Array.isArray(lignes) || lignes.length < 2) throw new Error('Export ' + type + ' vide : aucune ligne après les en-têtes.');
    const A = analyser(type, lignes, options);
    if (A.manquantes.length) throw new Error('Export ' + type + ' : colonne(s) obligatoire(s) introuvable(s) : ' + A.manquantes.join(', ') + '. Colonnes lues : ' + A.entetes.join(' | ') + '.');
    if (lignes.length < A.ligneEntete + 2) throw new Error('Export ' + type + ' vide : aucune ligne après les en-têtes.');
    return { entetes: A.entetes, carte: A.carte, mode: A.mode, manquantes: [], correspondance: A.correspondance, corps: lignes.slice(A.ligneEntete + 1), decalage: A.ligneEntete };
  }
  const cellule = (r, carte, k) => (carte[k] == null ? '' : r[carte[k]]);

  // Pièces commerciales (devis, commandes, BL, factures). lignes = tableau de lignes (1re = en-têtes).
  function lirePieces(lignes, options = {}) {
    const T = verifierTable('pieces', lignes, options), pieces = [], ignorees = [], avoirs = [], vus = new Map();
    T.corps.forEach((r, i) => {
      const n = r.lignePhysique || i + 2 + T.decalage, g = k => cellule(r, T.carte, k);
      if (r.length !== T.entetes.length) return ignorees.push({ ligne:n, motif:'Ligne tronquée : ' + r.length + ' colonne(s) au lieu de ' + T.entetes.length });
      const no = texte(g('no'), 40), date = lireDate(g('date')), type = lireType(g('type'), no), ht = lireMontant(g('ht'));
      const client = texte(g('client'), 120) || texte(g('code'), 40);
      if (!no) return ignorees.push({ ligne: n, motif: 'N° de pièce absent' });
      if (!type) return ignorees.push({ ligne: n, motif: 'Type de pièce non reconnu (' + texte(g('type'), 30) + ' / ' + no + ')' });
      if (!date) return ignorees.push({ ligne: n, motif: 'Date illisible pour ' + no });
      if (ht == null) return ignorees.push({ ligne: n, motif: (montantAmbigu(g('ht')) ? 'Montant HT ambigu (« ' + texte(g('ht'), 20) + ' » : séparateur de milliers ou décimal ?)' : 'Montant HT illisible') + ' pour ' + no });
      if (!client) return ignorees.push({ ligne: n, motif: 'Client absent pour ' + no });
      // Un avoir incomplet n'est jamais utilisé pour corriger le chiffre d'affaires.
      if (type === 'avoir') return avoirs.push({ ligne: n, no, date, client, htCents: ht, origine: texte(g('origine'), 40), code: texte(g('code'), 40) });
      const cle = type + '|' + no;
      if (vus.has(cle)) {
        const p = vus.get(cle);
        if (p.date !== date || p.client !== client) return ignorees.push({ ligne: n, motif: 'N° ' + no + ' en double avec des informations différentes' });
        p.htCents += ht; p.lignesSource++; // export ligne par ligne d'article : on totalise la pièce
        const sig = r.map(x => texte(x, 200)).join('\u0001'); // ligne strictement identique à une autre de la même pièce : signalée (export dupliqué ?)
        if (p._sig.has(sig)) p.lignesIdentiques = (p.lignesIdentiques || 0) + 1; else p._sig.add(sig);
        return;
      }
      const p = { type, no, date, code: texte(g('code'), 40), client, htCents: ht, origine: texte(g('origine'), 40), ref: texte(g('ref'), 160), source: 'ebp', lignesSource: 1 };
      Object.defineProperty(p, '_sig', { value: new Set([r.map(x => texte(x, 200)).join('\u0001')]), enumerable: false });
      vus.set(cle, p); pieces.push(p);
    });
    // liens = l'export indique la pièce d'origine (indispensable pour suivre devis → commande → BL → facture).
    terminerLecture(T, ignorees);
    return { type:'pieces', pieces, ignorees, avoirs, liens:T.carte.origine != null, correspondance:T.correspondance, lues:T.corps.length, acceptees:T.corps.length-ignorees.length, rejetees:ignorees.length };
  }

  // Échéancier des règlements. Reste à payer, par ordre de fiabilité :
  //  1. colonne « Reste à payer » (demandée par le guide d'extraction) ;
  //  2. sinon « Montant TTC − Montant réglé » si la colonne du réglé existe ;
  //  3. sinon : sans date de règlement → montant entier dû ; AVEC une date mais sans montant réglé → reste INCONNU (null).
  //     Avant le lot 1, ce cas était lu « soldé » : un règlement partiel devenait invisible (constaté le 13/11/2026).
  function lireReglements(lignes, options = {}) {
    const T = verifierTable('reglements', lignes, options), reglements = [], ignorees = [], vus = new Set();
    T.corps.forEach((r, i) => {
      const n = r.lignePhysique || i + 2 + T.decalage, g = k => cellule(r, T.carte, k);
      if (r.length !== T.entetes.length) return ignorees.push({ ligne:n, motif:'Ligne tronquée : ' + r.length + ' colonne(s) au lieu de ' + T.entetes.length });
      const facture = texte(g('facture'), 40), echeance = lireDate(g('echeance')), reglement = lireDate(g('reglement')), montant = lireMontant(g('montant'));
      if (!facture) return ignorees.push({ ligne: n, motif: 'N° de facture absent' });
      if (!echeance) return ignorees.push({ ligne: n, motif: 'Échéance illisible pour ' + facture });
      if (montant == null) return ignorees.push({ ligne: n, motif: 'Montant illisible pour ' + facture });
      const sig = [facture, echeance, reglement, montant, texte(g('reste'), 30), texte(g('regle'), 30)].join('|');
      if (vus.has(sig)) return ignorees.push({ ligne: n, motif: 'Échéance en double (même facture, dates et montants) pour ' + facture });
      vus.add(sig);
      let reste, origineReste;
      if (T.carte.reste != null) {
        reste = lireMontant(g('reste')); origineReste = 'declare';
        if (reste == null) return ignorees.push({ ligne: n, motif: 'Reste à payer illisible pour ' + facture });
      } else if (T.carte.regle != null && texte(g('regle'))) {
        const regle = lireMontant(g('regle'));
        if (regle == null) return ignorees.push({ ligne: n, motif: 'Montant réglé illisible pour ' + facture });
        if (Math.abs(regle) > Math.abs(montant)) return ignorees.push({ ligne: n, motif: 'Montant réglé supérieur au montant de l’échéance pour ' + facture });
        reste = montant - regle; origineReste = 'calcule';
      } else if (reglement) { reste = null; origineReste = 'inconnu'; }
      else { reste = montant; origineReste = 'sans_reglement'; }
      reglements.push({ facture, echeance, reglement, montantCents: montant, resteCents: reste, resteDeclare: T.carte.reste != null, origineReste,
        motifReste: reste == null ? 'Règlement daté du ' + reglement + ' sans montant réglé ni reste : solde non vérifiable (partiel possible)' : null });
    });
    terminerLecture(T, ignorees);
    return { type:'reglements', reglements, ignorees, correspondance:T.correspondance, lues:T.corps.length, acceptees:reglements.length, rejetees:ignorees.length };
  }

  // SIRET : 14 chiffres et clé de Luhn (exception officielle de La Poste, SIREN 356 000 000 : somme des chiffres multiple de 5).
  function siretValide(v) {
    const s = String(v == null ? '' : v).replace(/[\s.\-]/g, '');
    if (!/^\d{14}$/.test(s)) return null;
    if (s.startsWith('356000000')) return [...s].reduce((t, c) => t + +c, 0) % 5 === 0 ? s : null;
    let t = 0; for (let i = 0; i < 14; i++) { let d = +s[13 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } t += d; }
    return t % 10 === 0 ? s : null;
  }

  // Fichier clients EBP. Statut « bloqué » repéré dans le texte du statut.
  function lireClientsEbp(lignes, options = {}) {
    const T = verifierTable('clients', lignes, options), clients = [], ignorees = [], anomalies = [], codes = new Set();
    T.corps.forEach((r, i) => {
      const n = r.lignePhysique || i + 2 + T.decalage, g = k => cellule(r, T.carte, k);
      if (r.length !== T.entetes.length) return ignorees.push({ ligne:n, motif:'Ligne tronquée : ' + r.length + ' colonne(s) au lieu de ' + T.entetes.length });
      const code = texte(g('code'), 40), nom = texte(g('nom'), 120);
      if (!code || !nom) return ignorees.push({ ligne: n, motif: 'Code ou nom absent' });
      if (codes.has(code)) return ignorees.push({ ligne: n, motif: 'Code client ' + code + ' en double' });
      codes.add(code);
      // Colonne case à cocher (« Bloqué », « En sommeil » : Oui / Non) : la valeur « Oui » prend le sens du titre.
      const titre = norm(T.entetes[T.carte.statut] || ''), brut = texte(g('statut'), 40);
      const statut = /^(bloque|sommeil|en sommeil)/.test(titre) && /^(oui|vrai|1|x)$/.test(norm(brut)) ? (/bloque/.test(titre) ? 'Bloqué' : 'En sommeil')
        : /^(bloque|sommeil|en sommeil)/.test(titre) && /^(non|faux|0)?$/.test(norm(brut)) ? 'Actif'
        : titre === 'actif' && /^(non|faux|0)$/.test(norm(brut)) ? 'Inactif' : titre === 'actif' && /^(oui|vrai|1|x)$/.test(norm(brut)) ? 'Actif' : brut;
      const siretBrut = texte(g('siret'), 30), siret = siretValide(siretBrut);
      if (siretBrut && !siret) anomalies.push({ ligne: n, code, motif: 'SIRET invalide (' + siretBrut + ') : ignoré pour le rapprochement' });
      clients.push({ code, nom, siret: siret || '', ville: texte(g('ville'), 80), cp: texte(g('cp'), 10), statut, famille: texte(g('famille'), 60), commercial: texte(g('commercial'), 40), bloque: /bloqu|suspendu|interdit|contentieux/.test(norm(statut)) });
    });
    terminerLecture(T, ignorees);
    return { type:'clients', clients, ignorees, anomalies, correspondance:T.correspondance, lues:T.corps.length, acceptees:clients.length, rejetees:ignorees.length };
  }

  const api = { COLONNES, decoderTexte, lireCsv, associerColonnes, trouverEntete, analyser, estFec, appliquerCarteMemorisee, rapportAnomalies, signature, lireDate, lireMontant, montantAmbigu, siretValide, lireType, lirePieces, lireReglements, lireClientsEbp };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.EbpImport = api;
})(typeof self !== 'undefined' ? self : this);
