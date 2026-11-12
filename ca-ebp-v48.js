'use strict';
/* ODICOLOR — import EBP du CA FACTURÉ HT (téléphone). Module sans interface, testable sous Node.
   Entrée : lignes d'un export EBP des pièces (CSV/Excel déjà lu en tableau de lignes). Sortie : un APERÇU (rien n'est écrit) puis l'application au magasin du CA.
   Règles : seules les FACTURES et les AVOIRS comptent ; devis, commandes, bons de livraison sont ignorés (comptés à part). Une pièce = un numéro ;
   une ligne par article d'une même pièce est totalisée. Déjà présente et identique = ignorée (réimport sans risque) ; déjà présente et DIFFÉRENTE = conflit,
   jamais écrasée. Chaque pièce importée garde sa traçabilité (fichier, ligne, date d'import) et chaque import est un événement annulable en bloc.
   HYPOTHÈSE : les noms de colonnes EBP réels ne sont pas connus (aucun export réel reçu) → détection automatique, correspondance toujours affichée, refus si colonne obligatoire absente. */
const ODICOLOR_CA_EBP = (() => {
  const CA = (typeof module !== 'undefined' && module.exports) ? require('./ca-facture-v48.js') : ODICOLOR_CA;
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const texte = (v, n = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  // Libellés rencontrés dans les exports EBP et tableurs (hypothèses larges) : la correspondance retenue est toujours affichée et corrigeable à la main.
  const COL = [
    ['type', 'Type de pièce', /^(type|nature)( de)?( la)?( piece| document)?$|type de (piece|document)|^document$|^type doc/, false],
    ['no', 'N° de pièce', /^(n°|n|no|num|numero|num\.)( de| du)?( la)? ?(piece|document|facture|doc)?$|^(n°|no|numero|num\.?) ?(de |du )?(piece|document|facture|doc)|^piece$|^reference (piece|document)$|^code (piece|document)$/, true],
    ['date', 'Date', /^date( de| du)?( la)? ?(piece|document|facture|doc)?$|^date$|^date d.emission$|^date facture$/, true],
    ['code', 'Code client', /code.*(client|tiers)|^tiers$|^code$|^(n°|no|numero) (client|tiers)$|^compte (client|tiers)$/, false],
    ['client', 'Client', /(nom|raison sociale|libelle|intitule).*(client|tiers)|^client$|^raison sociale$|^nom$|^tiers \(nom\)$|^societe$/, false],
    ['ht', 'Montant HT', /(montant|total|net|prix|base).*h\.?t\.?|h\.?t\.?.*(net|total|montant)|^h\.?t\.?$|^net a payer ht$|^total net$/, true]
  ];
  const TTC = /t\.?t\.?c/;
  const TOTAL = /^(total|sous[- ]?total|totaux|somme|cumul)\b/;
  const pad = n => String(n).padStart(2, '0');
  function lireDate(v) {
    let y, m, d;
    if (v instanceof Date && !isNaN(v)) { y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate(); }
    else if (typeof v === 'number' && v > 20000 && v < 80000) { const x = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); y = x.getUTCFullYear(); m = x.getUTCMonth() + 1; d = x.getUTCDate(); }
    else { const s = String(v == null ? '' : v).trim(); let r;
      if ((r = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:\s|$)/))) { d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000; }
      else if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +r[1]; m = +r[2]; d = +r[3]; } else return ''; }
    const iso = y + '-' + pad(m) + '-' + pad(d), x = new Date(Date.UTC(y, m - 1, d));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? iso : '';
  }
  function lireMontant(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
    let s = String(v == null ? '' : v).replace(/[\s  €]/g, ''); if (!s) return null;
    const neg = /^-|^\(.*\)$/.test(s); s = s.replace(/^[-(]|\)$/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const c = Math.round(parseFloat(s) * 100); return Number.isSafeInteger(c) ? (neg ? -c : c) : null;
  }
  function lireType(t, no) {
    const s = norm(t);
    if (/avoir|note de credit|credit note/.test(s)) return 'avoir'; if (/devis|proposition/.test(s)) return 'devis'; if (/commande/.test(s)) return 'commande'; if (/livraison|^bl\b/.test(s)) return 'bl'; if (/facture/.test(s)) return 'facture';
    const n = String(no || '').toUpperCase();
    if (/^(AV|AF)/.test(n)) return 'avoir'; if (/^(DE|DV|DEV)/.test(n)) return 'devis'; if (/^(CC|CO|CDE|BC)/.test(n)) return 'commande'; if (/^(BL|LI)/.test(n)) return 'bl'; if (/^(FA|FC|FAC)/.test(n)) return 'facture';
    return '';
  }
  const deviner = (ent) => { const hn = ent.map(norm), pris = new Set(), carte = {};
    for (const [k, , re] of COL) { const j = hn.findIndex((x, q) => !pris.has(q) && re.test(x) && !(k === 'ht' && TTC.test(x))); if (j >= 0) { carte[k] = j; pris.add(j); } }
    return carte; };
  const manquantes = carte => COL.filter(([k, , , ob]) => ob && carte[k] == null).map(([, l]) => l);
  // Analyse TOUJOURS disponible (même si la détection est incomplète) : sert au choix manuel des colonnes. Ne contient que des TITRES, aucune donnée.
  function analyser(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return { ok: false, erreur: 'Fichier vide : aucune ligne après les en-têtes.' };
    let meilleur = null;
    for (let i = 0; i < Math.min(rows.length - 1, 15); i++) {
      const ent = (rows[i] || []).map(c => texte(c, 80)); if (ent.filter(Boolean).length < 2) continue;
      const carte = deviner(ent), manque = manquantes(carte);
      if (!meilleur || manque.length < meilleur.manque.length) meilleur = { debut: i, entetes: ent, carte, manque };
      if (!manque.length) break;
    }
    if (!meilleur) return { ok: false, erreur: 'Aucune ligne d’en-têtes reconnaissable.' };
    return { ok: true, ...meilleur, champs: COL.map(([cle, libelle, , obligatoire]) => ({ cle, libelle, obligatoire })) };
  }
  // Correspondance des colonnes. `force` = { debut, carte } choisi à la main par l'utilisateur (prioritaire sur la détection).
  function associer(rows, force) {
    const an = analyser(rows); if (!an.ok) return an;
    let carte = an.carte, debut = an.debut, ent = an.entetes;
    if (force && force.carte) {
      debut = Number.isInteger(force.debut) ? force.debut : an.debut; ent = (rows[debut] || []).map(c => texte(c, 80)); carte = {};
      for (const [k] of COL) { const v = force.carte[k]; if (Number.isInteger(v) && v >= 0 && v < ent.length) carte[k] = v; }
      const vals = Object.values(carte); if (new Set(vals).size !== vals.length) return { ok: false, erreur: 'Deux champs utilisent la même colonne.', analyse: an };
    }
    const manque = manquantes(carte);
    if (manque.length) return { ok: false, analyse: an, erreur: 'Colonne(s) obligatoire(s) introuvable(s) : ' + manque.join(', ') + '. Colonnes lues : ' + ent.filter(Boolean).join(' | ') + '. (Seul le montant HT est accepté : jamais le TTC.) Choisis les colonnes à la main ci-dessous.' };
    return { ok: true, debut, carte, analyse: an, correspondance: COL.filter(([k]) => carte[k] != null).map(([k, l]) => ({ cle: k, libelle: l, colonne: ent[carte[k]] })) };
  }
  /* APERÇU : aucune écriture. ctx = { auj, existantes (entrées du magasin) }. Retourne { ok, correspondance, nouvelles[], identiques[], conflits[], ignorees[], horsCa{}, totaux }. */
  function apercu(rows, ctx) {
    const a = associer(rows, ctx.colonnes); if (!a.ok) return a;
    const { carte } = a, nouvelles = [], identiques = [], conflits = [], ignorees = [], horsCa = {}, pieces = new Map(); let totaux = 0, sansType = 0;
    const existantes = (ctx.existantes || []).filter(e => !e.annule), parCle = new Map(existantes.map(e => [e.type + '|' + CA.numeroNorm(e.numero), e]));
    for (let i = a.debut + 1; i < rows.length; i++) {
      const r = rows[i] || []; if (!r.some(c => texte(c) !== '')) continue;
      const ligne = i + 1, g = k => (carte[k] == null ? '' : r[carte[k]]);
      const no = texte(g('no'), 40);
      // Ligne de total ou de sous-total d'un export : jamais une pièce.
      if (r.some(c => TOTAL.test(norm(c))) && (!no || TOTAL.test(norm(no)))) { totaux++; continue; }
      if (!no) { ignorees.push({ ligne, motif: 'N° de pièce absent' }); continue; }
      let type = lireType(g('type'), no);
      // Fichier déclaré « factures et avoirs seulement » par l'utilisateur : une pièce sans type lisible est une facture (un avoir si son montant est négatif).
      if (!type && ctx.typeDefaut === 'facture') { const m0 = lireMontant(g('ht')); type = m0 != null && m0 < 0 ? 'avoir' : 'facture'; }
      if (!type) { sansType++; ignorees.push({ ligne, motif: 'Type de pièce non reconnu (' + no + ')' }); continue; }
      if (type !== 'facture' && type !== 'avoir') { horsCa[type] = (horsCa[type] || 0) + 1; continue; }
      const date = lireDate(g('date')), ht = lireMontant(g('ht'));
      if (!date) { ignorees.push({ ligne, motif: 'Date illisible pour ' + no }); continue; }
      if (ht == null) { ignorees.push({ ligne, motif: 'Montant HT illisible pour ' + no }); continue; }
      if (ctx.auj && date > ctx.auj) { ignorees.push({ ligne, motif: 'Date future pour ' + no }); continue; }
      const cle = type + '|' + CA.numeroNorm(no), client = texte(g('client')) , code = texte(g('code'), 40);
      if (pieces.has(cle)) { const p = pieces.get(cle); if (p.date !== date) { ignorees.push({ ligne, motif: 'N° ' + no + ' répété avec une date différente' }); continue; } p.signe += ht; p.lignes++; continue; }
      pieces.set(cle, { type, numero: no, date, client, code, signe: ht, ligne, lignes: 1 });
    }
    for (const [cle, p] of pieces) {
      // Avoir : montant positif quel que soit le signe de l'export. Facture : un total ≤ 0 n'est pas une facture.
      const montantHt = p.type === 'avoir' ? Math.abs(p.signe) : p.signe;
      if (!(montantHt > 0)) { ignorees.push({ ligne: p.ligne, motif: (p.type === 'avoir' ? 'Avoir' : 'Facture') + ' ' + p.numero + ' : montant HT nul ou négatif' }); continue; }
      const ex = parCle.get(cle), entree = { type: p.type, numero: p.numero, date: p.date, montantHt, clientNom: p.client, codeEbp: p.code, ligne: p.ligne };
      if (!ex) nouvelles.push(entree);
      else if (ex.date === p.date && ex.montantHt === montantHt) identiques.push(entree);
      else conflits.push({ ...entree, existant: { date: ex.date, montantHt: ex.montantHt, source: ex.source } });
    }
    const multi = [...pieces.values()].filter(p => p.lignes > 1).map(p => p.numero);
    const somme = l => l.reduce((s, e) => s + (e.type === 'avoir' ? -e.montantHt : e.montantHt), 0);
    return { ok: true, correspondance: a.correspondance, analyse: a.analyse, carte: a.carte, debut: a.debut, lignesTotal: totaux, sansType, multiLignes: multi, nouvelles, identiques, conflits, ignorees, horsCa, totaux: { nouvellesCents: somme(nouvelles), nNouvelles: nouvelles.length } };
  }
  /* APPLICATION : n'écrit que les NOUVELLES pièces ; les conflits restent à traiter à la main. Ajoute un événement d'import à l'historique. ctx = { idImport, nouvelId(), maintenant, fichier, auj } */
  function appliquer(magasin, ap, ctx) {
    if (!ap || !ap.ok) throw new Error('Aperçu invalide : rien à importer.');
    let m = magasin || CA.vide();
    for (const e of ap.nouvelles) {
      m = CA.ajouter(m, { type: e.type, numero: e.numero, date: e.date, montantHt: e.montantHt, clientNom: e.clientNom, codeEbp: e.codeEbp, source: 'ebp' }, { id: ctx.nouvelId(), maintenant: ctx.maintenant, auj: ctx.auj, confirme: true });
      const dern = m.entrees[m.entrees.length - 1]; dern.import = { id: ctx.idImport, fichier: texte(ctx.fichier, 120), ligne: e.ligne };
    }
    const evt = { id: ctx.idImport, fichier: texte(ctx.fichier, 120), le: ctx.maintenant, ajoutees: ap.nouvelles.length, identiques: ap.identiques.length, conflits: ap.conflits.length, ignorees: ap.ignorees.length, horsCa: ap.horsCa, totalCents: ap.totaux.nouvellesCents };
    return { version: 1, entrees: m.entrees, imports: [...(m.imports || []), evt] };
  }
  // Annule en bloc les pièces d'un import (motif obligatoire) ; l'historique et les pièces restent.
  function annulerImport(magasin, idImport, motif, ctx) {
    if (!String(motif || '').trim()) throw new Error('Indique le motif de l’annulation.');
    const ev = (magasin.imports || []).find(x => x.id === idImport); if (!ev) throw new Error('Import introuvable.');
    if (ev.annule) throw new Error('Import déjà annulé.');
    const entrees = magasin.entrees.map(e => e.import && e.import.id === idImport && !e.annule ? { ...e, annule: { le: ctx.maintenant, motif: 'Import annulé : ' + String(motif).trim().slice(0, 160) } } : e);
    return { version: 1, entrees, imports: magasin.imports.map(x => x.id === idImport ? { ...x, annule: { le: ctx.maintenant, motif: String(motif).trim().slice(0, 160) } } : x) };
  }
  return { analyser, associer, apercu, appliquer, annulerImport, lireDate, lireMontant, lireType };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_CA_EBP;
