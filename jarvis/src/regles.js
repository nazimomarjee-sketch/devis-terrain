// Règles métier configurables et JUSTIFIÉES + autorisations explicites.
// Principe : JARVIS n'affirme aucune règle fiscale ou commerciale. Chaque règle a une source,
// une justification et un statut ; seules les règles VALIDE (par un humain, via le jeton administrateur)
// servent avec de vraies données. Les règles FICTIF_DEMO ne servent qu'avec des données fictives.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { transaction, journaliser } from './db.js';
import { horloge } from './horloge.js';

export const STATUTS_REGLE = ['NON_VALIDE', 'FICTIF_DEMO', 'VALIDE'];
export const TYPES_AUTORISATION = ['donnees_reelles', 'integration:ebp', 'integration:gmail', 'integration:airtable', 'connecteur:cockpit', 'envoi_reel'];

export function amorcerRegles(db, dossierJeu) {
  const f = join(dossierJeu, 'regles.json');
  if (!existsSync(f)) return 0;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  let n = 0;
  for (const r of j.regles) {
    n += db.prepare(
      'INSERT OR IGNORE INTO regles(type, cle, valeur, justification, source, statut, maj_par, maj_le) VALUES (?,?,?,?,?,?,?,?)',
    ).run(r.type, r.cle, JSON.stringify(r.valeur), r.justification, r.source, r.statut, 'amorcage', horloge.iso()).changes;
  }
  return n;
}

export function listerRegles(db) {
  return db.prepare('SELECT * FROM regles ORDER BY type, cle').all().map((r) => ({ ...r, valeur: JSON.parse(r.valeur) }));
}

export function reglesEnDict(db) {
  return Object.fromEntries(listerRegles(db).map((r) => [`${r.type}|${r.cle}`, r]));
}

/** Modification d'une règle : réservée à l'administrateur (contrôlé par le serveur). Justification obligatoire. */
export function definirRegle(db, { type, cle, valeur, justification, source, statut }, par) {
  if (!STATUTS_REGLE.includes(statut)) throw new Error('Statut de règle invalide');
  if (!String(justification ?? '').trim() || !String(source ?? '').trim()) throw new Error('Justification et source obligatoires');
  if (!String(type ?? '').trim() || !String(cle ?? '').trim()) throw new Error('Type et clé obligatoires');
  const maintenant = horloge.iso();
  transaction(db, () => {
    db.prepare(
      `INSERT INTO regles(type, cle, valeur, justification, source, statut, valide_par, valide_le, maj_par, maj_le)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(type, cle) DO UPDATE SET valeur=excluded.valeur, justification=excluded.justification, source=excluded.source,
         statut=excluded.statut, valide_par=excluded.valide_par, valide_le=excluded.valide_le, maj_par=excluded.maj_par, maj_le=excluded.maj_le`,
    ).run(type, cle, JSON.stringify(valeur), justification, source, statut, statut === 'VALIDE' ? par : null, statut === 'VALIDE' ? maintenant : null, par, maintenant);
    journaliser(db, { acteur: par, evenement: 'REGLE_MODIFIEE', detail: { type, cle, statut } });
  });
}

// ---------- Autorisations explicites (données réelles, intégrations, connecteurs, envoi réel) ----------
export function autorise(db, type) {
  const now = horloge.iso();
  return !!db.prepare(
    `SELECT 1 FROM autorisations WHERE type = ? AND revoque_le IS NULL AND (expire_le IS NULL OR expire_le > ?) LIMIT 1`,
  ).get(type, now);
}

export function accorder(db, { type, portee, jours = null, note = null }, par) {
  if (!TYPES_AUTORISATION.includes(type)) throw new Error(`Type d'autorisation inconnu : ${type}`);
  if (!String(portee ?? '').trim()) throw new Error('Portée obligatoire (qui a autorisé, pour quoi)');
  const maintenant = horloge.iso();
  const expire = jours ? new Date(horloge.maintenant() + jours * 86400000).toISOString() : null;
  const r = db.prepare('INSERT INTO autorisations(type, portee, accorde_par, accorde_le, expire_le, note) VALUES (?,?,?,?,?,?)').run(type, portee, par, maintenant, expire, note);
  journaliser(db, { acteur: par, evenement: 'AUTORISATION_ACCORDEE', detail: { type, portee, expire } });
  return Number(r.lastInsertRowid);
}

export function revoquer(db, id, par) {
  const r = db.prepare('UPDATE autorisations SET revoque_le = ? WHERE id = ? AND revoque_le IS NULL').run(horloge.iso(), id);
  if (r.changes !== 1) throw new Error('Autorisation introuvable ou déjà révoquée');
  journaliser(db, { acteur: par, evenement: 'AUTORISATION_REVOQUEE', detail: { id } });
}

export function listerAutorisations(db) {
  return db.prepare('SELECT * FROM autorisations ORDER BY id DESC').all();
}

export class AutorisationRequise extends Error {
  constructor(type) { super(`Autorisation requise et absente : ${type}`); this.type = type; }
}

/** Garde pour toute intégration ou donnée réelle : refuse ET journalise. */
export function exiger(db, type) {
  if (!autorise(db, type)) {
    journaliser(db, { acteur: 'securite', evenement: 'ACCES_REFUSE_SANS_AUTORISATION', detail: { type } });
    throw new AutorisationRequise(type);
  }
}
