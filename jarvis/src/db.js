import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { horloge } from './horloge.js';
import { masquer } from './confiance.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  demande TEXT NOT NULL,
  projet TEXT NOT NULL,
  type TEXT,
  agent TEXT,
  statut TEXT NOT NULL,
  source TEXT NOT NULL,
  cle_idempotence TEXT UNIQUE,
  cree_le TEXT NOT NULL,
  maj_le TEXT NOT NULL,
  bail_ouvrier TEXT,
  bail_jusqua INTEGER,
  executions INTEGER NOT NULL DEFAULT 0,
  corrections INTEGER NOT NULL DEFAULT 0,
  reprises INTEGER NOT NULL DEFAULT 0,
  plan TEXT,
  resultat TEXT,
  resultat_hash TEXT,
  rapport_audit TEXT,
  retours TEXT,
  raison TEXT,
  question TEXT,
  cout_cents INTEGER NOT NULL DEFAULT 0,
  debut_ms INTEGER,
  fin_ms INTEGER,
  decide_par TEXT
);
CREATE INDEX IF NOT EXISTS idx_missions_statut ON missions(statut, cree_le);

CREATE TABLE IF NOT EXISTS journal (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  mission_id TEXT,
  acteur TEXT NOT NULL,
  evenement TEXT NOT NULL,
  detail TEXT NOT NULL,
  prec_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parametres (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS depenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_ms INTEGER NOT NULL,
  mission_id TEXT,
  fournisseur TEXT NOT NULL,
  cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS regles (
  type TEXT NOT NULL,
  cle TEXT NOT NULL,
  valeur TEXT NOT NULL,
  justification TEXT NOT NULL,
  source TEXT NOT NULL,
  statut TEXT NOT NULL CHECK (statut IN ('NON_VALIDE','FICTIF_DEMO','VALIDE')),
  valide_par TEXT,
  valide_le TEXT,
  maj_par TEXT NOT NULL,
  maj_le TEXT NOT NULL,
  PRIMARY KEY (type, cle)
);

CREATE TABLE IF NOT EXISTS autorisations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  portee TEXT NOT NULL,
  accorde_par TEXT NOT NULL,
  accorde_le TEXT NOT NULL,
  expire_le TEXT,
  revoque_le TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS sorties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  type TEXT NOT NULL,
  simule INTEGER NOT NULL,
  contenu TEXT NOT NULL
);
`;

// Seuls des paramètres d'EXPLOITATION figurent ici. Les règles métier (TVA, remises, marges…)
// vivent dans la table `regles`, avec justification, source et statut de validation.
export const PARAMETRES_PAR_DEFAUT = {
  budget_jour_cents: '500',
  delai_mission_ms: '30000',
};

export function ouvrir(chemin = ':memory:') {
  const db = new DatabaseSync(chemin);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  db.exec(SCHEMA);
  for (const [cle, valeur] of Object.entries(PARAMETRES_PAR_DEFAUT)) {
    db.prepare('INSERT OR IGNORE INTO parametres(cle, valeur) VALUES (?, ?)').run(cle, valeur);
  }
  return db;
}

/** Exécute fn dans une transaction exclusive ; réutilise la transaction en cours si elle existe. */
export function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw e;
  }
}

export function param(db, cle, defaut = null) {
  const r = db.prepare('SELECT valeur FROM parametres WHERE cle = ?').get(cle);
  return r ? r.valeur : defaut;
}

export function definirParam(db, cle, valeur) {
  db.prepare('INSERT INTO parametres(cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, String(valeur));
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Journal d'audit chaîné par hachage : toute modification a posteriori est détectable. */
export function journaliser(db, { missionId = null, acteur, evenement, detail = {} }) {
  return transaction(db, () => {
    const ts = horloge.iso();
    const det = JSON.stringify(masquer(detail));
    const prec = db.prepare('SELECT hash FROM journal ORDER BY seq DESC LIMIT 1').get()?.hash ?? 'GENESE';
    const hash = sha([prec, ts, missionId ?? '', acteur, evenement, det].join('|'));
    db.prepare('INSERT INTO journal(ts, mission_id, acteur, evenement, detail, prec_hash, hash) VALUES (?,?,?,?,?,?,?)').run(
      ts, missionId, acteur, evenement, det, prec, hash,
    );
  });
}

export function verifierJournal(db) {
  let prec = 'GENESE';
  let n = 0;
  for (const l of db.prepare('SELECT * FROM journal ORDER BY seq').all()) {
    const attendu = sha([prec, l.ts, l.mission_id ?? '', l.acteur, l.evenement, l.detail].join('|'));
    if (l.prec_hash !== prec || l.hash !== attendu) return { ok: false, rompu_a: l.seq, lignes: n };
    prec = l.hash;
    n++;
  }
  return { ok: true, lignes: n };
}

export const sha256 = sha;
