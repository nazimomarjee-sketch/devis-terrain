/* ODICOLOR 2.0 — Application locale, étape 1 : le COFFRE (données fictives uniquement à ce stade).
   Un fichier chiffré sur le disque du PC ODICOLOR 2.0 : les données ne dépendent plus du stockage du navigateur.
   Aucun serveur externe, aucune connexion réseau, aucune dépendance : uniquement les modules intégrés de Node.js.

   Sécurité
   - Les données sont chiffrées en AES-256-GCM avec une clé aléatoire (« clé du coffre »).
   - Cette clé est elle-même chiffrée deux fois : par le mot de passe et par la clé de secours (scrypt N=2^17, r=8, p=1).
     Changer de mot de passe ne re-chiffre donc pas les données.
   - L'en-tête (format, génération, date, paramètres) est authentifié avec les données : toute retouche est refusée.
   - La clé n'existe qu'en mémoire pendant l'ouverture ; verrouillage manuel ou après inactivité (10 min par défaut).
   Protection contre les pertes
   - Écriture « tout ou rien » : fichier temporaire écrit et forcé sur disque, puis renommé. Une coupure ne laisse jamais
     un coffre à moitié écrit ; la génération précédente est gardée (coffre.precedent.odc).
   - À l'ouverture, la génération valide la plus récente est retenue ; si ce n'est pas le fichier principal, une alerte le dit
     et le fichier abîmé est mis de côté (jamais effacé).
   - Un seul programme à la fois peut ouvrir le coffre (fichier verrou). */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FORMAT = 'ODICOLOR-COFFRE', VERSION = 1;
const KDF_DEFAUT = Object.freeze({ algo: 'scrypt', N: 2 ** 17, r: 8, p: 1 });
const MOT_DE_PASSE_MIN = 12;
const FICHIERS = { principal: 'coffre.odc', temporaire: 'coffre.tmp', precedent: 'coffre.precedent.odc', verrou: 'coffre.verrou' };
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // base 32 sans I, L, O, U (lecture sans ambiguïté)

class ErreurCoffre extends Error { constructor(code, message) { super(message); this.code = code; } }
const refus = () => new ErreurCoffre('REFUS', 'Mot de passe incorrect, ou coffre altéré. Aucune donnée n’a été lue.');

function verifierKdf(k) {
  if (!k || k.algo !== 'scrypt' || !Number.isInteger(Math.log2(k.N)) || k.N < 2 ** 14 || k.N > 2 ** 20 || k.r !== 8 || k.p !== 1)
    throw new ErreurCoffre('FORMAT', 'Paramètres de protection du mot de passe invalides.');
  return k;
}
const deriver = (secret, sel, k) => crypto.scryptSync(String(secret).normalize('NFC'), sel, 32, { N: k.N, r: k.r, p: k.p, maxmem: 256 * 1024 * 1024 });
const b64 = b => Buffer.from(b).toString('base64'), deB64 = s => Buffer.from(String(s), 'base64');

function chiffrer(cle, clair, aad) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', cle, iv);
  c.setAAD(Buffer.from(aad));
  const texte = Buffer.concat([c.update(clair), c.final()]);
  return { iv: b64(iv), tag: b64(c.getAuthTag()), texte: b64(texte) };
}
function dechiffrer(cle, bloc, aad) {
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', cle, deB64(bloc.iv));
    d.setAAD(Buffer.from(aad)); d.setAuthTag(deB64(bloc.tag));
    return Buffer.concat([d.update(deB64(bloc.texte)), d.final()]);
  } catch { return null; }
}
const aadEnveloppe = nom => FORMAT + '/' + VERSION + '/enveloppe/' + nom;
const aadDonnees = e => JSON.stringify({ format: e.format, version: e.version, generation: e.generation, ecritLe: e.ecritLe, kdf: e.kdf });

function envelopper(cleCoffre, secret, kdf, nom) {
  const sel = crypto.randomBytes(16), kek = deriver(secret, sel, kdf);
  try { return Object.assign({ sel: b64(sel) }, chiffrer(kek, cleCoffre, aadEnveloppe(nom))); } finally { kek.fill(0); }
}
function ouvrirEnveloppe(env, secret, kdf, nom) {
  if (!env) return null;
  const kek = deriver(secret, deB64(env.sel), kdf);
  try { const c = dechiffrer(kek, env, aadEnveloppe(nom)); return c && c.length === 32 ? c : null; } finally { kek.fill(0); }
}

// Clé de secours : 160 bits aléatoires, 32 caractères en 8 groupes de 4, à imprimer une seule fois.
function nouvelleCleSecours() {
  const o = crypto.randomBytes(20); let bits = '', s = '';
  for (const x of o) bits += x.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) s += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return s.match(/.{4}/g).join('-');
}
const normaliserSecours = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

function controlerMotDePasse(m) {
  if (typeof m !== 'string' || [...m].length < MOT_DE_PASSE_MIN)
    throw new ErreurCoffre('MOT_DE_PASSE', 'Mot de passe trop court : ' + MOT_DE_PASSE_MIN + ' caractères minimum.');
}

// Écriture « tout ou rien » d'un fichier.
function ecrireAtomique(dossier, enveloppe) {
  const tmp = path.join(dossier, FICHIERS.temporaire), principal = path.join(dossier, FICHIERS.principal);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(enveloppe)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (fs.existsSync(principal)) fs.renameSync(principal, path.join(dossier, FICHIERS.precedent));
  fs.renameSync(tmp, principal);
  try { const d = fs.openSync(dossier, 'r'); fs.fsyncSync(d); fs.closeSync(d); } catch { /* Windows : synchronisation du dossier non disponible */ }
}

function prendreVerrou(dossier) {
  const f = path.join(dossier, FICHIERS.verrou);
  for (let essai = 0; essai < 2; essai++) {
    try { const fd = fs.openSync(f, 'wx', 0o600); fs.writeSync(fd, JSON.stringify({ pid: process.pid, depuis: new Date().toISOString() })); fs.closeSync(fd); return f; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = 0; try { pid = JSON.parse(fs.readFileSync(f, 'utf8')).pid; } catch { /* verrou illisible : considéré abandonné */ }
      let vivant = false; if (pid && pid !== process.pid) { try { process.kill(pid, 0); vivant = true; } catch (k) { vivant = k.code === 'EPERM'; } }
      if (vivant || pid === process.pid) throw new ErreurCoffre('DEJA_OUVERT', 'Le coffre est déjà ouvert dans une autre fenêtre ODICOLOR.');
      fs.rmSync(f, { force: true }); // programme arrêté brutalement : verrou abandonné
    }
  }
  throw new ErreurCoffre('DEJA_OUVERT', 'Le coffre est déjà ouvert dans une autre fenêtre ODICOLOR.');
}

function lireCandidat(dossier, nom) {
  const f = path.join(dossier, nom);
  if (!fs.existsSync(f)) return null;
  try {
    const e = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!e || e.format !== FORMAT || e.version !== VERSION || !Number.isSafeInteger(e.generation) || !e.enveloppes || !e.donnees) return { nom, invalide: true };
    verifierKdf(e.kdf); return { nom, e };
  } catch { return { nom, invalide: true }; }
}

class Coffre {
  constructor(dossier, enveloppe, cle, donnees, verrou, options) {
    this.dossier = dossier; this._e = enveloppe; this._cle = cle; this._donnees = donnees; this._verrou = verrou;
    this.delaiVerrouillageMs = options.delaiVerrouillageMs == null ? 10 * 60 * 1000 : options.delaiVerrouillageMs;
    this.alerte = options.alerte || ''; this._abime = options.abime || null; this._minuteur = null; this._activite();
  }
  get generation() { return this._e.generation; }
  get estVerrouille() { return !this._cle; }

  static creer(dossier, motDePasse, { donnees = {}, kdf = KDF_DEFAUT, delaiVerrouillageMs } = {}) {
    controlerMotDePasse(motDePasse); verifierKdf(kdf);
    fs.mkdirSync(dossier, { recursive: true });
    if ([FICHIERS.principal, FICHIERS.precedent].some(n => fs.existsSync(path.join(dossier, n))))
      throw new ErreurCoffre('EXISTE', 'Un coffre existe déjà dans ce dossier : il n’est jamais remplacé.');
    const verrou = prendreVerrou(dossier);
    try {
      const cle = crypto.randomBytes(32), cleSecours = nouvelleCleSecours();
      const e = { format: FORMAT, version: VERSION, generation: 0, ecritLe: '', kdf: { ...kdf },
        enveloppes: { motDePasse: envelopper(cle, motDePasse, kdf, 'motDePasse'), secours: envelopper(cle, normaliserSecours(cleSecours), kdf, 'secours') } };
      const coffre = new Coffre(dossier, e, cle, null, verrou, { delaiVerrouillageMs });
      coffre.ecrire(donnees);
      return { coffre, cleSecours };
    } catch (err) { fs.rmSync(verrou, { force: true }); throw err; }
  }

  static ouvrir(dossier, motDePasse, options = {}) { return Coffre._ouvrir(dossier, motDePasse, 'motDePasse', options); }

  // Mot de passe oublié : la clé de secours ouvre le coffre et un nouveau mot de passe est enregistré.
  static ouvrirAvecSecours(dossier, cleSecours, nouveauMotDePasse, options = {}) {
    controlerMotDePasse(nouveauMotDePasse);
    const c = Coffre._ouvrir(dossier, normaliserSecours(cleSecours), 'secours', options);
    c._remplacerEnveloppe('motDePasse', nouveauMotDePasse);
    return c;
  }

  static _ouvrir(dossier, secret, nom, options) {
    const verrou = prendreVerrou(dossier);
    try {
      const candidats = [FICHIERS.principal, FICHIERS.temporaire, FICHIERS.precedent].map(n => lireCandidat(dossier, n)).filter(Boolean);
      if (!candidats.length) throw new ErreurCoffre('ABSENT', 'Aucun coffre dans ce dossier.');
      const valides = [];
      for (const c of candidats) {
        if (c.invalide) continue;
        const cle = ouvrirEnveloppe(c.e.enveloppes[nom], secret, c.e.kdf, nom);
        if (!cle) continue;
        const clair = dechiffrer(cle, c.e.donnees, aadDonnees(c.e));
        if (!clair) { cle.fill(0); continue; }
        valides.push({ ...c, cle, donnees: JSON.parse(clair.toString('utf8')) });
      }
      if (!valides.length) throw refus();
      valides.sort((a, b) => b.e.generation - a.e.generation);
      const r = valides[0]; valides.slice(1).forEach(v => v.cle.fill(0));
      const principal = candidats.find(c => c.nom === FICHIERS.principal);
      const principalOk = valides.some(v => v.nom === FICHIERS.principal && v.e.generation === r.e.generation);
      let alerte = '', abime = null;
      if (r.nom === FICHIERS.temporaire) alerte = 'Dernier enregistrement interrompu (coupure ?) : il a été récupéré complet.';
      else if (!principalOk && principal && valides.some(v => v.nom === FICHIERS.principal)) { alerte = 'Le fichier principal est plus ancien que la version précédente (ancienne copie remise à la main ?) : la version la plus récente (génération ' + r.e.generation + ') a été ouverte. L’ancien fichier est conservé à part.'; abime = principal.nom; }
      else if (!principalOk && principal) { alerte = 'Le fichier principal du coffre est abîmé : la version précédente (génération ' + r.e.generation + ') a été ouverte. Le fichier abîmé est conservé à part.'; abime = principal.nom; }
      else if (!principal) alerte = 'Fichier principal absent : la version précédente (génération ' + r.e.generation + ') a été ouverte.';
      return new Coffre(dossier, r.e, r.cle, r.donnees, verrou, { ...options, alerte, abime });
    } catch (err) { fs.rmSync(verrou, { force: true }); throw err; }
  }

  _exiger() { if (!this._cle) throw new ErreurCoffre('VERROUILLE', 'Coffre verrouillé : mot de passe nécessaire.'); this._activite(); }
  _activite() {
    clearTimeout(this._minuteur);
    if (this._cle && this.delaiVerrouillageMs > 0) { this._minuteur = setTimeout(() => this.verrouiller(), this.delaiVerrouillageMs); this._minuteur.unref?.(); }
  }

  lire() { this._exiger(); return structuredClone(this._donnees); }

  ecrire(donnees) {
    this._exiger();
    const clair = Buffer.from(JSON.stringify(donnees), 'utf8');
    if (this._abime) { // jamais effacé : mis de côté pour analyse, puis le coffre repart proprement
      const src = path.join(this.dossier, this._abime);
      if (fs.existsSync(src)) fs.renameSync(src, path.join(this.dossier, 'coffre.abime-' + Date.now() + '.odc'));
      this._abime = null;
    }
    const e = { ...this._e, generation: this._e.generation + 1, ecritLe: new Date().toISOString() };
    e.donnees = chiffrer(this._cle, clair, aadDonnees(e));
    ecrireAtomique(this.dossier, e);
    this._e = e; this._donnees = JSON.parse(clair.toString('utf8'));
    return e.generation;
  }

  changerMotDePasse(ancien, nouveau) {
    this._exiger(); controlerMotDePasse(nouveau);
    const cle = ouvrirEnveloppe(this._e.enveloppes.motDePasse, ancien, this._e.kdf, 'motDePasse');
    if (!cle || !crypto.timingSafeEqual(cle, this._cle)) { cle && cle.fill(0); throw refus(); }
    cle.fill(0); this._remplacerEnveloppe('motDePasse', nouveau);
  }
  _remplacerEnveloppe(nom, secret) {
    this._e = { ...this._e, enveloppes: { ...this._e.enveloppes, [nom]: envelopper(this._cle, secret, this._e.kdf, nom) } };
    // Deux générations écrites : la version précédente garde aussi le nouveau mot de passe (secours en cas de fichier abîmé).
    this.ecrire(this._donnees); this.ecrire(this._donnees);
  }

  verrouiller() {
    clearTimeout(this._minuteur);
    if (this._cle) this._cle.fill(0);
    this._cle = null; this._donnees = null;
  }
  deverrouiller(motDePasse) {
    if (this._cle) return;
    const cle = ouvrirEnveloppe(this._e.enveloppes.motDePasse, motDePasse, this._e.kdf, 'motDePasse');
    const clair = cle && dechiffrer(cle, this._e.donnees, aadDonnees(this._e));
    if (!clair) { cle && cle.fill(0); throw refus(); }
    this._cle = cle; this._donnees = JSON.parse(clair.toString('utf8')); this._activite();
  }
  fermer() { this.verrouiller(); if (this._verrou) { fs.rmSync(this._verrou, { force: true }); this._verrou = null; } }
}

module.exports = { Coffre, ErreurCoffre, FICHIERS, KDF_DEFAUT, MOT_DE_PASSE_MIN, nouvelleCleSecours };
