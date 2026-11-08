// Sauvegarde chiffrée (AES-256-GCM, clé dérivée par scrypt) + vérification par restauration réelle.
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { definirParam, param, verifierJournal, journaliser } from './db.js';
import { horloge } from './horloge.js';

const MAGIE = Buffer.from('JARVISB1');

export function chiffrer(buf, phrase) {
  if (!phrase || phrase.length < 12) throw new Error('Clé de sauvegarde trop courte (12 caractères minimum)');
  const sel = randomBytes(16);
  const iv = randomBytes(12);
  const cle = scryptSync(phrase, sel, 32);
  const c = createCipheriv('aes-256-gcm', cle, iv);
  const donnees = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIE, sel, iv, c.getAuthTag(), donnees]);
}

export function dechiffrer(buf, phrase) {
  if (!buf.subarray(0, 8).equals(MAGIE)) throw new Error('Fichier de sauvegarde invalide');
  const sel = buf.subarray(8, 24);
  const iv = buf.subarray(24, 36);
  const tag = buf.subarray(36, 52);
  const d = createDecipheriv('aes-256-gcm', scryptSync(phrase, sel, 32), iv);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(buf.subarray(52)), d.final()]);
  } catch {
    throw new Error('Déchiffrement impossible : mauvaise clé ou fichier altéré');
  }
}

/** Restaure un fichier chiffré vers un chemin SQLite, puis contrôle l'intégrité. */
export function restaurer(fichierEnc, phrase, destination) {
  const clair = dechiffrer(readFileSync(fichierEnc), phrase);
  writeFileSync(destination, clair, { mode: 0o600 });
  const r = new DatabaseSync(destination);
  try {
    const integrite = r.prepare('PRAGMA integrity_check').get().integrity_check;
    const chaine = verifierJournal(r);
    const missions = r.prepare('SELECT COUNT(*) AS n FROM missions').get().n;
    return { ok: integrite === 'ok' && chaine.ok, integrite, chaine, missions };
  } finally {
    r.close();
  }
}

export function sauvegarder(db, dossier, phrase) {
  mkdirSync(dossier, { recursive: true });
  const stamp = horloge.iso().replace(/[:.]/g, '-');
  const tmp = join(dossier, `tmp-${stamp}.sqlite`);
  const enc = join(dossier, `jarvis-${stamp}.sqlite.enc`);
  const verif = join(dossier, `verif-${stamp}.sqlite`);
  const attendu = db.prepare('SELECT COUNT(*) AS n FROM missions').get().n;
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const clair = readFileSync(tmp);
    writeFileSync(enc, chiffrer(clair, phrase), { mode: 0o600 });
    // Vérification réelle : on restaure la sauvegarde dans un fichier temporaire et on la contrôle.
    const v = restaurer(enc, phrase, verif);
    if (!v.ok || v.missions !== attendu) throw new Error(`Vérification de sauvegarde négative : ${JSON.stringify(v)}`);
    const empreinte = createHash('sha256').update(readFileSync(enc)).digest('hex');
    definirParam(db, 'derniere_sauvegarde_verifiee', JSON.stringify({ fichier: enc, ts: horloge.iso(), sha256: empreinte, missions: attendu }));
    journaliser(db, { acteur: 'sauvegarde', evenement: 'SAUVEGARDE_VERIFIEE', detail: { missions: attendu } });
    return { fichier: enc, missions: attendu, sha256: empreinte };
  } catch (e) {
    journaliser(db, { acteur: 'sauvegarde', evenement: 'SAUVEGARDE_ECHEC', detail: { message: e.message } });
    if (existsSync(enc)) rmSync(enc);
    throw e;
  } finally {
    for (const f of [tmp, verif, `${verif}-wal`, `${verif}-shm`]) if (existsSync(f)) rmSync(f);
  }
}

export function derniereSauvegarde(db) {
  const v = param(db, 'derniere_sauvegarde_verifiee');
  return v ? JSON.parse(v) : null;
}
