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
      ['no', 'N° de pièce', /^(n°|no|num(ero)?)( de)? ?(piece|document)?$|^(n°|no|numero) (piece|document)|^piece$/, true],
      ['date', 'Date', /^date( de)?( la)? ?(piece|document)?$/, true],
      ['code', 'Code client', /code.*client|^code tiers$|^tiers$|^code$/, false],
      ['client', 'Nom du client', /(nom|raison sociale|libelle).*client|^client$|^raison sociale$|^nom$/, true],
      ['ht', 'Montant HT', /(montant|total|net).*h\.?t|^h\.?t\.?$/, true],
      ['origine', 'N° de pièce d’origine', /origine|piece (precedente|liee|source)|precedent/, false],
      ['ref', 'Référence / commentaire', /reference|commentaire|objet/, false]
    ],
    reglements: [
      ['facture', 'N° de facture', /facture|^(n°|no|numero)( de)? ?piece$/, true],
      ['echeance', 'Date d’échéance', /echeance/, true],
      ['reglement', 'Date de règlement', /reglement|paiement|encaisse/, false],
      ['montant', 'Montant TTC', /montant|total|ttc/, true],
      ['reste', 'Reste à payer', /reste|solde|impaye|du$/, false]
    ],
    clients: [
      ['code', 'Code client', /^code$|code.*(client|tiers)|^(n°|no|numero) client$/, true], // jamais « Code postal »
      ['nom', 'Nom', /nom|raison sociale|^client$/, true],
      ['ville', 'Ville', /ville|commune/, false],
      ['cp', 'Code postal', /code postal|^cp$/, false],
      ['statut', 'Statut du compte', /statut|bloque|sommeil|^etat|^actif$/, false], // jamais « Compte comptable »
      ['famille', 'Famille / activité (carrosserie, mécanique)', /famille|categorie|activite|type de client|secteur/, false]
    ]
  };

  // Octets → texte : UTF-8 strict, sinon Windows-1252 (export Excel/EBP français courant).
  function decoderTexte(octets) {
    const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    try { return { texte: new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''), encodage: 'UTF-8' }; }
    catch (_) { return { texte: new TextDecoder('windows-1252').decode(u8), encodage: 'Windows-1252' }; }
  }

  // CSV avec séparateur détecté (; tabulation ,) et guillemets.
  function lireCsv(t) {
    t = String(t).replace(/^﻿/, '');
    const premiere = t.split(/\r?\n/, 1)[0];
    const sep = [';', '\t', ','].map(d => [d, premiere.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const lignes = []; let ligne = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { ligne.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; ligne.push(cur); cur = ''; if (ligne.some(x => x !== '')) lignes.push(ligne); ligne = []; }
      else cur += c;
    }
    ligne.push(cur); if (ligne.some(x => x !== '')) lignes.push(ligne);
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

  // Montant → centimes entiers, ou null si illisible. « 1 234,56 », « 1.234,56 », « 1234.56 », « 1 234,56 € », nombre Excel.
  function lireMontant(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
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

  function verifierTable(type, lignes) {
    if (!Array.isArray(lignes) || lignes.length < 2) throw new Error('Export ' + type + ' vide : aucune ligne après les en-têtes.');
    const entetes = lignes[0].map(x => texte(x, 80));
    const a = associerColonnes(type, entetes);
    if (a.manquantes.length) throw new Error('Export ' + type + ' : colonne(s) obligatoire(s) introuvable(s) : ' + a.manquantes.join(', ') + '. Colonnes lues : ' + entetes.join(' | ') + '.');
    return { entetes, ...a, corps: lignes.slice(1) };
  }
  const cellule = (r, carte, k) => (carte[k] == null ? '' : r[carte[k]]);

  // Pièces commerciales (devis, commandes, BL, factures). lignes = tableau de lignes (1re = en-têtes).
  function lirePieces(lignes) {
    const T = verifierTable('pieces', lignes), pieces = [], ignorees = [], avoirs = [], vus = new Map();
    T.corps.forEach((r, i) => {
      const n = i + 2, g = k => cellule(r, T.carte, k);
      const no = texte(g('no'), 40), date = lireDate(g('date')), type = lireType(g('type'), no), ht = lireMontant(g('ht'));
      const client = texte(g('client'), 120) || texte(g('code'), 40);
      if (!no) return ignorees.push({ ligne: n, motif: 'N° de pièce absent' });
      if (!type) return ignorees.push({ ligne: n, motif: 'Type de pièce non reconnu (' + texte(g('type'), 30) + ' / ' + no + ')' });
      // Avoir : pièce normale, gardée à part (non déduite du CA tant que la règle n'est pas validée), jamais « écartée ».
      if (type === 'avoir') return avoirs.push({ ligne: n, no, date, client, htCents: ht, origine: texte(g('origine'), 40) });
      if (!date) return ignorees.push({ ligne: n, motif: 'Date illisible pour ' + no });
      if (ht == null) return ignorees.push({ ligne: n, motif: 'Montant HT illisible pour ' + no });
      if (!client) return ignorees.push({ ligne: n, motif: 'Client absent pour ' + no });
      const cle = type + '|' + no;
      if (vus.has(cle)) {
        const p = vus.get(cle);
        if (p.date !== date || p.client !== client) return ignorees.push({ ligne: n, motif: 'N° ' + no + ' en double avec des informations différentes' });
        p.htCents += ht; p.lignesSource++; return; // export ligne par ligne d'article : on totalise la pièce
      }
      const p = { type, no, date, code: texte(g('code'), 40), client, htCents: ht, origine: texte(g('origine'), 40), ref: texte(g('ref'), 160), source: 'ebp', lignesSource: 1 };
      vus.set(cle, p); pieces.push(p);
    });
    // liens = l'export indique la pièce d'origine (indispensable pour suivre devis → commande → BL → facture).
    return { pieces, ignorees, avoirs, liens: T.carte.origine != null, correspondance: T.correspondance, lues: T.corps.length };
  }

  // Échéancier des règlements. Sans colonne « reste » : réglé si date de règlement, sinon montant entier dû.
  function lireReglements(lignes) {
    const T = verifierTable('reglements', lignes), reglements = [], ignorees = [];
    T.corps.forEach((r, i) => {
      const n = i + 2, g = k => cellule(r, T.carte, k);
      const facture = texte(g('facture'), 40), echeance = lireDate(g('echeance')), reglement = lireDate(g('reglement')), montant = lireMontant(g('montant'));
      if (!facture) return ignorees.push({ ligne: n, motif: 'N° de facture absent' });
      if (!echeance) return ignorees.push({ ligne: n, motif: 'Échéance illisible pour ' + facture });
      if (montant == null) return ignorees.push({ ligne: n, motif: 'Montant illisible pour ' + facture });
      let reste = T.carte.reste == null ? (reglement ? 0 : montant) : lireMontant(g('reste'));
      if (reste == null) return ignorees.push({ ligne: n, motif: 'Reste à payer illisible pour ' + facture });
      reglements.push({ facture, echeance, reglement, montantCents: montant, resteCents: reste, resteDeclare: T.carte.reste != null });
    });
    return { reglements, ignorees, correspondance: T.correspondance, lues: T.corps.length };
  }

  // Fichier clients EBP. Statut « bloqué » repéré dans le texte du statut.
  function lireClientsEbp(lignes) {
    const T = verifierTable('clients', lignes), clients = [], ignorees = [], codes = new Set();
    T.corps.forEach((r, i) => {
      const n = i + 2, g = k => cellule(r, T.carte, k);
      const code = texte(g('code'), 40), nom = texte(g('nom'), 120);
      if (!code || !nom) return ignorees.push({ ligne: n, motif: 'Code ou nom absent' });
      if (codes.has(code)) return ignorees.push({ ligne: n, motif: 'Code client ' + code + ' en double' });
      codes.add(code);
      // Colonne case à cocher (« Bloqué », « En sommeil » : Oui / Non) : la valeur « Oui » prend le sens du titre.
      const titre = norm(T.entetes[T.carte.statut] || ''), brut = texte(g('statut'), 40);
      const statut = /^(bloque|sommeil|en sommeil)/.test(titre) && /^(oui|vrai|1|x)$/.test(norm(brut)) ? (/bloque/.test(titre) ? 'Bloqué' : 'En sommeil')
        : /^(bloque|sommeil|en sommeil)/.test(titre) && /^(non|faux|0)?$/.test(norm(brut)) ? 'Actif'
        : titre === 'actif' && /^(non|faux|0)$/.test(norm(brut)) ? 'Inactif' : titre === 'actif' && /^(oui|vrai|1|x)$/.test(norm(brut)) ? 'Actif' : brut;
      clients.push({ code, nom, ville: texte(g('ville'), 80), cp: texte(g('cp'), 10), statut, famille: texte(g('famille'), 60), bloque: /bloqu|suspendu|interdit|contentieux/.test(norm(statut)) });
    });
    return { clients, ignorees, correspondance: T.correspondance, lues: T.corps.length };
  }

  const api = { COLONNES, decoderTexte, lireCsv, associerColonnes, lireDate, lireMontant, lireType, lirePieces, lireReglements, lireClientsEbp };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.EbpImport = api;
})(typeof self !== 'undefined' ? self : this);
