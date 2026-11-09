// Connecteur EBP — import de FICHIERS d'export (CSV) vers des jeux de données normalisés. SYNTHÉTIQUE : le format réel d'export d'EBP
// n'est pas connu ; le mapping ci-dessous est celui d'un export de DÉMONSTRATION, à reconfigurer après examen d'un vrai export.
// Lecture seule, aucune écriture dans EBP. Un import « réel » exige l'autorisation donnees_reelles + integration:ebp ET reste à développer.
import { readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { exiger } from '../regles.js';
import { IntegrationNonDeveloppee } from '../integrations.js';

const MAX_OCTETS = 5 * 1024 * 1024; const MAX_LIGNES = 100_000; const MAX_CELLULE = 500;
const decimal = (s) => /^\d+(?:[.,]\d{1,2})?$/.test(s) ? s.replace(',', '.') : null;
const centimes = (s) => { const d = decimal(s); if (d === null) return null; const [e, f = ''] = d.split('.'); return Number(e) * 100 + Number((f + '00').slice(0, 2)); };
const date = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return null; const iso = m[3].length === 4 ? `${m[3]}-${m[2]}-${m[1]}` : s; try { return new Date(iso).toISOString().slice(0, 10) === iso ? iso : null; } catch { return null; } }; // jamais d'exception : une date invalide est rejetée
const FORMULE = /^[=+\-@\t\r]/; // injection de formule tableur : refusée dans tout champ texte

const FORMATS = {
  articles: { sortie: 'catalogue', cle: 'references', entetes: ['Référence', 'Désignation', 'Famille', 'Conditionnement', 'Prix vente HT', 'Prix achat HT', 'Date tarif'],
    ligne: (c) => { const [ref, des, fam, cond, pv, pa, dt] = c; const m = Number(cond); if (!/^[A-Z0-9-]{3,20}$/i.test(ref)) return 'référence invalide'; if (!Number.isInteger(m) || m < 1) return 'conditionnement invalide'; if (pv && decimal(pv) === null) return 'prix de vente invalide'; if (pa && decimal(pa) === null) return 'prix d’achat invalide'; if (dt && !date(dt)) return 'date invalide';
      return { ref, designation: des, categorie: fam, mots: [des.split(/\s+/)[0].toLowerCase()], multiple: m, prix_ht: pv ? decimal(pv) : null, prix_achat_ht: pa ? decimal(pa) : null, date_prix: dt ? date(dt) : null, compatible_avec: [] }; }, texte: [0, 1, 2] },
  clients: { sortie: 'clients', cle: 'clients', entetes: ['Code', 'Nom', 'Email', 'Territoire', 'Remise %', 'Justification remise'],
    ligne: (c) => { const [id, nom, email, terr, rem, just] = c; if (!/^[A-Z0-9-]{1,20}$/i.test(id)) return 'code invalide'; if (!nom) return 'nom absent'; if (decimal(rem) === null) return 'remise invalide'; return { id, nom, email, territoire: terr.toLowerCase(), remise_pct: decimal(rem), remise_justification: just, notes: '' }; }, texte: [0, 1, 2, 3, 5] },
  factures: { sortie: 'factures', cle: 'factures', entetes: ['Numéro', 'Client', 'Date', 'Échéance', 'HT', 'TVA', 'TTC', 'Commande'],
    ligne: (c) => { const [id, cl, d, e, ht, tva, ttc, cmd] = c; if (!id || !cl) return 'numéro ou client absent'; if (!date(d) || !date(e)) return 'date invalide'; const v = [ht, tva, ttc].map(centimes); if (v.includes(null)) return 'montant invalide'; return { id, client_id: cl, commande_id: cmd || null, date: date(d), echeance: date(e), ht_cents: v[0], tva_cents: v[1], ttc_cents: v[2], lignes: [], derniere_relance: null }; }, texte: [0, 1, 7] },
  paiements: { sortie: 'paiements', cle: 'paiements', entetes: ['Numéro', 'Facture', 'Date', 'Montant'],
    ligne: (c) => { const [id, f, d, mt] = c; if (!id || !f) return 'numéro ou facture absent'; if (!date(d)) return 'date invalide'; const m = centimes(mt); if (m === null || m <= 0) return 'montant invalide'; return { id, facture_id: f, date: date(d), montant_cents: m }; }, texte: [0, 1] },
};

/** Parse STRICT d'un export CSV (séparateur « ; », UTF-8, BOM toléré). Ne lève jamais sur le contenu : tout est rapporté. */
export function analyserExport(type, texte) {
  const F = FORMATS[type]; if (!F) throw new Error(`Type d'export inconnu : ${type}`);
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const rapport = { type, lues: 0, acceptees: 0, rejetees: [] }; const donnees = [];
  if (!lignes.length) { rapport.rejetees.push({ ligne: 0, motif: 'fichier vide' }); return { donnees, rapport }; }
  const entete = lignes[0].split(';').map((x) => x.trim());
  if (JSON.stringify(entete) !== JSON.stringify(F.entetes)) { rapport.rejetees.push({ ligne: 1, motif: `en-têtes inattendus (attendu : ${F.entetes.join(';')})` }); return { donnees, rapport }; }
  if (lignes.length - 1 > MAX_LIGNES) { rapport.rejetees.push({ ligne: 0, motif: `trop de lignes (${lignes.length - 1} > ${MAX_LIGNES})` }); return { donnees, rapport }; }
  const vus = new Set();
  lignes.slice(1).forEach((l, i) => {
    rapport.lues++; const n = i + 2; const c = l.split(';').map((x) => x.trim());
    const rej = (motif) => rapport.rejetees.push({ ligne: n, motif });
    if (c.length !== F.entetes.length) return rej(`${c.length} colonnes au lieu de ${F.entetes.length}`);
    if (c.some((x) => x.length > MAX_CELLULE)) return rej('cellule trop longue');
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(l)) return rej('caractère de contrôle');
    if (F.texte.some((k) => FORMULE.test(c[k]))) return rej('injection de formule tableur refusée');
    const r = F.ligne(c); if (typeof r === 'string') return rej(r);
    const cle = type === 'articles' ? r.ref : r.id ?? r.ref; if (type !== 'factures' && vus.has(cle)) return rej(`identifiant en double « ${cle} »`); vus.add(cle);
    donnees.push(r); rapport.acceptees++;
  });
  return { donnees, rapport };
}

/**
 * Importe un fichier d'export vers un dossier de jeu de données (écrase le fichier de même nom).
 * @param mode 'synthetique' (défaut, aucune autorisation requise : données locales fictives) | 'reel' (autorisations + connecteur NON développé)
 */
export function importerExport({ db, mode = 'synthetique', type, chemin, dossierJeu }) {
  if (mode === 'reel') { exiger(db, 'donnees_reelles'); exiger(db, 'integration:ebp'); throw new IntegrationNonDeveloppee('ebp'); }
  if (mode !== 'synthetique') throw new Error(`Mode inconnu : ${mode}`);
  if (statSync(chemin).size > MAX_OCTETS) throw new Error(`Fichier trop volumineux (> ${MAX_OCTETS} octets)`);
  const brut = readFileSync(chemin); const { donnees, rapport } = analyserExport(type, brut.toString('utf8'));
  rapport.sha256 = createHash('sha256').update(brut).digest('hex'); rapport.mode = mode;
  mkdirSync(dossierJeu, { recursive: true });
  if (rapport.acceptees > 0) writeFileSync(join(dossierJeu, `${FORMATS[type].sortie}.json`), JSON.stringify({ genere: 'FICTIF', source: 'ebp-synthetique', [FORMATS[type].cle]: donnees }));
  writeFileSync(join(dossierJeu, `rapport-import-${type}.json`), JSON.stringify(rapport, null, 2));
  return rapport;
}
