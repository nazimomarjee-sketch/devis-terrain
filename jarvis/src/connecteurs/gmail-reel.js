// Gmail API : création de brouillons de TEST uniquement, jamais d'envoi.
// Un POST dont l'issue est inconnue n'est JAMAIS répété automatiquement.
import { createHash } from 'node:crypto';
import { exiger } from '../regles.js';
import { param } from '../db.js';

const DRAFTS = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
const TOKEN = 'https://oauth2.googleapis.com/token';
const stop = (message) => Object.assign(new Error(message), { definitif: true });

export function jetonGmail({ accessToken, clientId, clientSecret, refreshToken, transport = fetch } = {}) {
  if (accessToken) return async () => accessToken;
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Configuration OAuth Gmail absente');
  let cache = null;
  return async () => {
    if (cache && cache.expire > Date.now()) return cache.valeur;
    let r, j;
    try {
      r = await transport(TOKEN, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }).toString() });
      if (!r.ok) throw new Error();
      j = await r.json();
    } catch { throw new Error('Authentification Gmail indisponible — vérifier la connexion Google'); }
    if (typeof j.access_token !== 'string' || !j.access_token || !Number.isFinite(j.expires_in) || j.expires_in <= 60) throw new Error('Réponse OAuth Gmail invalide');
    cache = { valeur: j.access_token, expire: Date.now() + (j.expires_in - 60) * 1000 };
    return cache.valeur;
  };
}

export function connecteurGmailReel({ db, obtenirJeton, compte, transport = fetch }) {
  if (typeof obtenirJeton !== 'function' || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(compte ?? '')) throw new Error('Configuration OAuth Gmail absente ou compte invalide');
  // Le compte configuré identifie la destination ; son empreinte lie chaque clé à ce compte.
  const compteHash = createHash('sha256').update(compte.toLowerCase()).digest('hex');
  return {
    nom: 'gmail_reel', mode: 'reel_test',
    async executer(action, charge, cle) {
      exiger(db, 'integration:gmail');
      if (param(db, 'arret_urgence', '0') === '1' || param(db, 'connecteur_gmail') !== 'reel_test') throw new Error('Gmail réel désactivé ou arrêt d’urgence actif');
      if (action !== 'CREER_BROUILLON') throw stop('Action Gmail non autorisée');
      if (!/^[A-Za-z0-9._-]{8,80}$/.test(cle)) throw stop('Clé Gmail invalide');
      if (!/^[^@\s<>]+@[^@\s<>]+\.invalid$/.test(charge.vers ?? '')) throw stop('Cet essai Gmail exige un destinataire fictif .invalid');
      if (typeof charge.eml_base64 !== 'string' || charge.eml_base64.length > 7_000_000) throw stop('Message Gmail invalide ou trop volumineux');
      const eml = Buffer.from(charge.eml_base64, 'base64');
      const texte = eml.toString('utf8'); const entetes = texte.split('\r\n\r\n')[0];
      if (eml.toString('base64') !== charge.eml_base64 || /(?:^|\r\n)[ \t]/.test(entetes) || !texte.includes('\r\n\r\n') || !/^X-Jarvis-Statut: BROUILLON\r?$/m.test(entetes) ||
          (entetes.match(/^To: /gim) ?? []).length !== 1 || !entetes.split('\r\n').includes(`To: ${charge.vers}`) ||
          /^(?:Cc|Bcc|Resent-[^:]+):/im.test(entetes)) throw stop('En-têtes du brouillon Gmail invalides');
      const hash = createHash('sha256').update(eml).digest('hex');
      const lire = () => db.prepare('SELECT * FROM gmail_operations WHERE cle=?').get(cle);
      const deja = lire();
      if (deja) {
        if (deja.empreinte !== hash || deja.compte_hash !== compteHash) throw stop('Clé Gmail déjà liée à un autre contenu ou compte');
        if (deja.brouillon_id) return { id: deja.brouillon_id };
        throw stop('Résultat Gmail incertain : vérifier les brouillons avant toute nouvelle action');
      }
      // Authentification AVANT la réservation : son échec ne peut pas créer de brouillon.
      const token = await obtenirJeton();
      if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw stop('Jeton Gmail invalide');
      // Une révocation ou un arrêt pendant l'authentification interdit encore le POST.
      exiger(db, 'integration:gmail');
      if (param(db, 'arret_urgence', '0') === '1' || param(db, 'connecteur_gmail') !== 'reel_test') throw new Error('Gmail réel désactivé ou arrêt d’urgence actif');
      const reservation = db.prepare('INSERT OR IGNORE INTO gmail_operations(cle, empreinte, compte_hash) VALUES (?,?,?)').run(cle, hash, compteHash);
      if (reservation.changes !== 1) throw stop('Opération Gmail déjà réservée : vérifier les brouillons');
      try {
        const r = await transport(DRAFTS, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { raw: eml.toString('base64url') } }) });
        // Même une erreur HTTP reste bloquée : aucune hypothèse de non-création.
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (typeof j.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(j.id)) throw new Error();
        db.prepare('UPDATE gmail_operations SET brouillon_id=? WHERE cle=?').run(j.id, cle);
        return { id: j.id };
      } catch { throw stop('Résultat Gmail incertain : vérifier les brouillons avant toute nouvelle action'); }
    },
  };
}
