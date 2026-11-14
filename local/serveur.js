/* ODICOLOR 2.0 — Application locale, étape 2 : relier le Bureau au coffre chiffré (données fictives à ce stade).
   Petit programme Node.js, sans dépendance, qui :
   - affiche le Bureau et la Ville LEGO tels quels (fichiers servis sans modification) ;
   - garde l'état du Bureau dans le coffre chiffré (local/coffre.js), plus dans le navigateur.
   Sécurité de la liaison Bureau ↔ programme local
   - écoute UNIQUEMENT sur 127.0.0.1 : inaccessible depuis un autre appareil, même sur le même réseau ;
   - en-tête Host contrôlé (une page Internet ne peut pas se faire passer pour l'application) ;
   - API : Origin obligatoire et identique, en-tête X-ODICOLOR obligatoire (aucun site tiers ne peut appeler l'API) ;
   - session = jeton aléatoire dans un cookie HttpOnly SameSite=Strict, invalidé au verrouillage du coffre ;
   - mot de passe : uniquement dans le corps d'une requête POST, jamais dans l'adresse, jamais journalisé, jamais écrit ;
   - essais de mot de passe limités (attente croissante) ; politique de sécurité du contenu stricte.
   Lancement : node local/serveur.js [--dossier CHEMIN] [--port 4747] */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Coffre, ErreurCoffre, FICHIERS } = require('./coffre.js');

const RACINE = path.resolve(__dirname, '..');
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8' };
const CSP_BUREAU = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
  "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
const CSP_OUVRIR = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const MAX_CORPS = 60 * 1024 * 1024;
const COOKIE = 'odicolor_session';

// Fichiers servis : le Bureau, sa bibliothèque Excel, l'écran d'ouverture. Rien d'autre (ni coffre, ni tests, ni dépôt).
function fichierAutorise(chemin) {
  if (chemin === '/' || chemin === '/ouvrir.html') return path.join(PUBLIC, 'ouvrir.html');
  if (chemin === '/ouvrir.js' || chemin === '/ouvrir.css') return path.join(PUBLIC, chemin.slice(1));
  // communes-centres.js : centres des communes (données publiques, Licence Ouverte), utilisés par l'ordre de tournée du Bureau (lot 2).
  if (chemin === '/xlsx.mini.min.js' || chemin === '/odicolor-logo-officiel.png' || chemin === '/communes-centres.js') return path.join(RACINE, chemin.slice(1));
  if (chemin.startsWith('/bureau/')) {
    const f = path.resolve(RACINE, '.' + chemin), dossier = path.join(RACINE, 'bureau') + path.sep;
    if (f.startsWith(dossier) && !path.basename(f).startsWith('.') && !f.slice(dossier.length).includes(path.sep + 'outils' + path.sep) && !f.slice(dossier.length).startsWith('outils' + path.sep)) return f;
  }
  return null;
}

function demarrer({ dossier, port = 4747, delaiVerrouillageMs = 10 * 60 * 1000, controleMs = 30000, kdf, journal = m => console.log(m), essaisAvantAttente = 5, attenteMs = 30000 } = {}) {
  if (!dossier) throw new Error('Dossier du coffre non indiqué.');
  fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
  let coffre = null;
  const sessions = new Map(); // empreinte du jeton → expiration
  const limite = { echecs: 0, jusqua: 0 };
  const coffreExiste = () => [FICHIERS.principal, FICHIERS.precedent, FICHIERS.temporaire].some(n => fs.existsSync(path.join(dossier, n)));
  const empreinte = j => crypto.createHash('sha256').update(j).digest('hex');
  const origines = () => new Set(['http://127.0.0.1:' + serveur.address().port, 'http://localhost:' + serveur.address().port]);

  function sessionValide(req) {
    if (!coffre || coffre.estVerrouille) { sessions.clear(); return false; }
    const c = String(req.headers.cookie || '').split(/;\s*/).find(x => x.startsWith(COOKIE + '='));
    if (!c) return false;
    const h = empreinte(c.slice(COOKIE.length + 1)), exp = sessions.get(h);
    if (!exp || exp < Date.now()) { sessions.delete(h); return false; }
    return true;
  }
  function ouvrirSession(res) {
    sessions.clear(); // une seule session à la fois
    const jeton = crypto.randomBytes(32).toString('base64url');
    sessions.set(empreinte(jeton), Date.now() + 12 * 3600 * 1000);
    res.setHeader('Set-Cookie', COOKIE + '=' + jeton + '; HttpOnly; SameSite=Strict; Path=/');
  }
  const envoyer = (res, statut, objet) => { res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(objet)); };
  const lireCorps = req => new Promise((ok, ko) => {
    const morceaux = []; let n = 0;
    req.on('data', m => { n += m.length; if (n > MAX_CORPS) { ko(Object.assign(new Error('Données trop volumineuses.'), { statut: 413 })); req.destroy(); } else morceaux.push(m); });
    req.on('end', () => { try { const o = JSON.parse(Buffer.concat(morceaux).toString('utf8')); if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(); ok(o); } catch { ko(Object.assign(new Error('Requête illisible.'), { statut: 400 })); } });
    req.on('error', ko);
  });
  function freinMotDePasse() {
    if (limite.jusqua > Date.now()) return Math.ceil((limite.jusqua - Date.now()) / 1000);
    return 0;
  }
  function echec() {
    limite.echecs++;
    if (limite.echecs >= essaisAvantAttente) limite.jusqua = Date.now() + attenteMs * 2 ** Math.min(4, limite.echecs - essaisAvantAttente);
  }

  async function api(req, res, chemin) {
    // Garde-fous communs : en-tête dédié (bloque les requêtes « simples » d'un site tiers) ; Origin identique pour toute écriture.
    if (req.headers['x-odicolor'] !== '1') return envoyer(res, 403, { erreur: 'Requête refusée.' });
    if (req.method !== 'GET' && !origines().has(req.headers.origin)) return envoyer(res, 403, { erreur: 'Origine refusée.' });

    if (chemin === '/api/statut' && req.method === 'GET')
      return envoyer(res, 200, { application: 'odicolor-local', version: 1, coffreExiste: coffreExiste(), session: sessionValide(req), controleMs });

    if (chemin === '/api/creer' && req.method === 'POST') {
      if (coffreExiste()) return envoyer(res, 409, { erreur: 'Un coffre existe déjà : il n’est jamais remplacé.' });
      const { motDePasse } = await lireCorps(req);
      const r = Coffre.creer(dossier, motDePasse, { donnees: { bureau: null }, kdf, delaiVerrouillageMs });
      coffre = r.coffre; ouvrirSession(res);
      return envoyer(res, 201, { cleSecours: r.cleSecours });
    }
    if ((chemin === '/api/deverrouiller' || chemin === '/api/secours') && req.method === 'POST') {
      const attente = freinMotDePasse();
      if (attente) return envoyer(res, 429, { erreur: 'Trop d’essais. Réessaie dans ' + attente + ' s.' });
      const corps = await lireCorps(req);
      try {
        if (chemin === '/api/secours') {
          if (coffre) { coffre.fermer(); coffre = null; }
          coffre = Coffre.ouvrirAvecSecours(dossier, corps.cleSecours, corps.nouveauMotDePasse, { delaiVerrouillageMs });
        } else if (coffre) coffre.deverrouiller(corps.motDePasse);
        else coffre = Coffre.ouvrir(dossier, corps.motDePasse, { delaiVerrouillageMs });
      } catch (e) { if (e.code === 'REFUS') echec(); throw e; }
      limite.echecs = 0; limite.jusqua = 0; ouvrirSession(res);
      return envoyer(res, 200, { ouvert: true, alerte: coffre.alerte || '' });
    }
    if (chemin === '/api/verrouiller' && req.method === 'POST') {
      if (coffre) coffre.verrouiller(); sessions.clear();
      return envoyer(res, 200, { verrouille: true });
    }
    if (chemin === '/api/etat') {
      if (!sessionValide(req)) return envoyer(res, 401, { erreur: 'Coffre verrouillé.' });
      if (req.method === 'GET') { const d = coffre.lire(); return envoyer(res, 200, { etat: d.bureau || null, enregistreLe: d.enregistreLe || '', generation: coffre.generation, alerte: coffre.alerte || '' }); }
      if (req.method === 'PUT') {
        const etat = await lireCorps(req);
        if (etat.version !== 1 && etat.version !== 2) return envoyer(res, 400, { erreur: 'Format d’état inconnu.' }); // 2 = avec le journal des décisions de compte (lot A)
        const enregistreLe = new Date().toISOString();
        const generation = coffre.ecrire({ bureau: etat, enregistreLe });
        return envoyer(res, 200, { enregistre: true, generation, enregistreLe });
      }
    }
    return envoyer(res, 404, { erreur: 'Inconnu.' });
  }

  const serveur = http.createServer(async (req, res) => {
    let chemin = '?';
    // Journal minimal : méthode, chemin (sans paramètres), statut. Jamais de corps de requête, jamais de mot de passe.
    res.on('finish', () => journal(new Date().toISOString() + ' ' + req.method + ' ' + chemin.replace(/[^\w/.\-]/g, '?') + ' ' + res.statusCode));
    try {
      chemin = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
      // Seuls 127.0.0.1 et localhost sur notre port sont acceptés (protection contre le « DNS rebinding »).
      const p = serveur.address().port;
      if (!['127.0.0.1:' + p, 'localhost:' + p].includes(String(req.headers.host || ''))) { res.writeHead(421); return res.end(); }
      if (chemin.startsWith('/api/')) return await api(req, res, chemin);
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      const f = fichierAutorise(chemin);
      if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store',
        'Content-Security-Policy': f.startsWith(PUBLIC) ? CSP_OUVRIR : CSP_BUREAU });
      res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(f));
    } catch (e) {
      const code = e instanceof ErreurCoffre ? ({ REFUS: 401, MOT_DE_PASSE: 400, EXISTE: 409, DEJA_OUVERT: 409, VERROUILLE: 401, ABSENT: 404 }[e.code] || 400) : e.statut || 500;
      if (!res.headersSent) envoyer(res, code, { erreur: e instanceof ErreurCoffre || e.statut ? e.message : 'Erreur interne.' });
      else res.end();
    }
  });

  return new Promise((ok, ko) => {
    serveur.once('error', ko);
    serveur.listen(port, '127.0.0.1', () => ok({
      serveur, port: serveur.address().port, adresse: 'http://127.0.0.1:' + serveur.address().port + '/',
      arreter: () => new Promise(r => { if (coffre) coffre.fermer(); coffre = null; serveur.close(() => r()); serveur.closeAllConnections?.(); })
    }));
  });
}

module.exports = { demarrer, fichierAutorise };

if (require.main === module) {
  const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
  const dossier = arg('dossier') || process.env.ODICOLOR_COFFRE || path.join(os.homedir(), 'ODICOLOR-coffre');
  demarrer({ dossier, port: Number(arg('port') || process.env.ODICOLOR_PORT || 4747) }).then(a => {
    console.log('ODICOLOR 2.0 — application locale prête : ' + a.adresse + '  (coffre : ' + dossier + ')');
    console.log('Réservée à ce PC. Fermer cette fenêtre arrête l’application et verrouille le coffre.');
    const stop = () => a.arreter().then(() => process.exit(0));
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }, e => { console.error('Démarrage impossible : ' + (e.code === 'EADDRINUSE' ? 'ODICOLOR est déjà ouvert (port occupé).' : e.message)); process.exit(1); });
}
