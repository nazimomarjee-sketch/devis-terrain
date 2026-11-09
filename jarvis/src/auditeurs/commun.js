// Outils des AUDITEURS. Écrits séparément de src/agents/ : un auditeur ne partage aucun code de calcul avec l'agent qu'il contrôle.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { horloge } from '../horloge.js';
import { detecterInjection, detecterSecrets } from '../confiance.js';

export const CLES = { catalogue: 'references', clients: 'clients', devis_historique: 'devis', commandes: 'commandes', factures: 'factures', paiements: 'paiements', prospects: 'prospects', taches: 'taches', ordres_atelier: 'ordres' };

export function charger(dossierJeu, nom) {
  const f = join(dossierJeu, `${nom}.json`);
  if (!existsSync(f)) return { lignes: [], fictif: true, present: false };
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return { lignes: j[CLES[nom]] ?? [], fictif: j.genere === 'FICTIF', present: true };
}

export const CODES_BLOCAGE = new Set(['CLIENT_INCONNU', 'CLIENT_AMBIGU', 'REFERENCE_INCONNUE', 'REFERENCE_AMBIGUE', 'CONDITIONNEMENT', 'TARIF_MANQUANT', 'QUANTITE_INVALIDE',
  'REMISE_HORS_PLAFOND', 'REMISE_NON_JUSTIFIEE', 'DEMANDE_INCOMPRISE', 'TVA_REGLE_ABSENTE', 'TVA_REGLE_NON_VALIDEE', 'REGLE_ABSENTE', 'REGLE_NON_VALIDEE', 'MARGE_SOUS_SEUIL',
  'PRIX_ACHAT_ABSENT', 'CONNECTEUR_NON_AUTORISE', 'DEVIS_INCONNU', 'DEVIS_NON_ACCEPTE']);

// Quelles sorties exigent une approbation humaine : défini ICI, pas par l'agent (il ne peut pas se déclarer « non sensible »).
export const SENSIBLE_PAR_TYPE = { devis: true, relances: true, commande_brouillon: true, rapport_produits: false, classement_prospects: false, dossier_client: false, suivi_commandes: false, analyse_finance: false, plan_journee: false, charge_atelier: false };

export const estEntier = (n) => Number.isSafeInteger(n);
export const estTexte = (s) => typeof s === 'string' && s.length > 0;
export const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const jours = (de, a) => Math.round((Date.parse(a) - Date.parse(de)) / 86400000);

export function centimes(txt) {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(txt));
  if (!m) throw new Error(`décimal invalide : ${txt}`);
  return BigInt(m[1]) * 100n + BigInt(((m[2] ?? '') + '00').slice(0, 2));
}
export const demiSup = (n, d) => (2n * n + d) / (2n * d);
export function eur(c) {
  c = BigInt(c);
  const neg = c < 0n; const v = neg ? -c : c;
  const s = String(v).padStart(3, '0');
  return `${neg ? '-' : ''}${s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${s.slice(-2)}`;
}

export function conclure(controles, verdictSiOk = 'VALIDE') {
  const echecs = controles.filter((c) => !c.ok).flatMap((c) => c.detail.map((d) => `${c.nom} : ${d}`));
  return { verdict: echecs.length ? 'A_CORRIGER' : verdictSiOk, controles, echecs, horodatage: horloge.iso() };
}
export function ctrl(controles, nom, erreurs) { controles.push({ nom, ok: erreurs.length === 0, detail: erreurs }); }

/** Contrôles génériques communs à tous les agents. */
export function controlesGeneraux(controles, { resultat: r, regles, datasets, dossierJeu, typeAttendu, aujourdhui }) {
  const e = [];
  if (aujourdhui !== undefined && r?.date !== aujourdhui) e.push(`date ${r?.date} ≠ ${aujourdhui}`);
  if (r?.type !== typeAttendu) e.push(`type ${r?.type} ≠ ${typeAttendu}`);
  const genere = datasets.map((n) => charger(dossierJeu, n)).filter((x) => x.present);
  const fictifReel = genere.every((x) => x.fictif);
  if (r.donnees_fictives !== fictifReel) e.push(`donnees_fictives=${r.donnees_fictives} alors que les données sont ${fictifReel ? 'fictives' : 'réelles'}`);
  if (SENSIBLE_PAR_TYPE[r.type] !== undefined && r.action_sensible !== SENSIBLE_PAR_TYPE[r.type]) e.push(`action_sensible=${r.action_sensible} (attendu ${SENSIBLE_PAR_TYPE[r.type]} pour ${r.type})`);
  for (const u of r.regles_utilisees ?? []) {
    const reg = regles[`${u.type}|${u.cle}`];
    if (!reg) e.push(`règle citée inexistante : ${u.type}|${u.cle}`);
    else {
      if (reg.statut !== u.statut) e.push(`statut de règle cité (${u.statut}) ≠ base (${reg.statut})`);
      if (!(reg.statut === 'VALIDE' || (reg.statut === 'FICTIF_DEMO' && fictifReel))) e.push(`règle ${u.type}|${u.cle} inutilisable (${reg.statut}) avec ces données`);
    }
  }
  const texte = JSON.stringify({ ...r, fichiers: undefined });
  for (const x of detecterInjection(texte)) e.push(`instruction suspecte dans la sortie (${x})`);
  for (const x of detecterSecrets(texte)) e.push(`secret dans la sortie (${x})`);
  ctrl(controles, 'generaux', e);
  return fictifReel;
}

export function auditerBlocage({ blocage, ids }) {
  const e = [];
  if (!CODES_BLOCAGE.has(blocage.code)) e.push(`code de blocage inconnu : ${blocage.code}`);
  if (!estTexte(blocage.raison)) e.push('raison manquante');
  if (!estTexte(blocage.question)) e.push('question à l’humain manquante');
  if (blocage.candidats) for (const c of blocage.candidats) if (!ids.has(c)) e.push(`candidat inventé : ${c}`);
  return conclure([{ nom: 'blocage_justifie', ok: e.length === 0, detail: e }], 'BLOQUE');
}
