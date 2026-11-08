'use strict';
/* ODICOLOR — SERVEUR DE DÉMONSTRATION PRIVÉE (aucune dépendance). Sert UNIQUEMENT les fichiers de l'application (liste de pwa-release.json), derrière un mot de passe.
   Aucune donnée : l'application stocke tout dans le navigateur de l'utilisateur ; ce serveur n'en reçoit jamais. Origine dédiée = stockage isolé de l'application réelle.
   Variables : DEMO_USER, DEMO_PASS (≥ 12 caractères, OBLIGATOIRES, jamais dans le dépôt), PORT. Sans mot de passe valide, le serveur refuse de démarrer.
   Accès libre limité à : /sante (état), manifeste et icônes (le navigateur les demande sans identifiants). Tout le reste : authentification Basic.
   Protection : comparaison à temps constant, 5 échecs/minute/adresse puis blocage, X-Robots-Tag noindex, aucune liste de répertoire. */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const RACINE = path.resolve(__dirname, '..');
const release = JSON.parse(fs.readFileSync(path.join(RACINE, 'pwa-release.json'), 'utf8'));
const FICHIERS = new Set([...release.assets.map(a => a.path), 'index.html', 'sw.js', 'pwa-client.js', 'recuperation-v47.html', 'recuperation-v47.js']);
const PUBLICS = new Set(['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'logo-96.png']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' };
const egal = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

function creer({ user, pass, journal = () => {} }) {
  if (!user || !pass || String(pass).length < 12) throw new Error('DEMO_USER et DEMO_PASS (12 caractères minimum) sont obligatoires : démarrage refusé.');
  const echecs = new Map();
  const bloque = ip => { const e = echecs.get(ip); return !!e && e.n >= 5 && Date.now() - e.t < 60000; };
  const echec = ip => { const e = echecs.get(ip); if (!e || Date.now() - e.t >= 60000) echecs.set(ip, { n: 1, t: Date.now() }); else e.n++; };
  const enTetes = (type, extra = {}) => ({ 'Content-Type': type, 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
  return http.createServer((req, res) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    let chemin; try { chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { res.writeHead(400, enTetes('text/plain')); return res.end('Requête invalide'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, enTetes('text/plain', { Allow: 'GET, HEAD' })); return res.end('Méthode non autorisée'); }
    if (chemin === '/sante') { res.writeHead(200, enTetes('application/json', { 'Cache-Control': 'no-store' })); return res.end(JSON.stringify({ ok: true, release: release.id.slice(0, 12), mode: 'demo-prive' })); }
    const nom = chemin === '/' ? 'index.html' : chemin.replace(/^\//, '');
    if (!PUBLICS.has(nom)) {
      if (bloque(ip)) { res.writeHead(429, enTetes('text/plain', { 'Retry-After': '60' })); return res.end('Trop d’essais. Réessaie dans une minute.'); }
      const h = req.headers.authorization || '', m = /^Basic (.+)$/.exec(h); let ok = false;
      if (m) { const [u, ...p] = Buffer.from(m[1], 'base64').toString('utf8').split(':'); ok = egal(u, user) & egal(p.join(':'), pass); }
      if (!ok) { if (m) echec(ip); res.writeHead(401, enTetes('text/plain', { 'WWW-Authenticate': 'Basic realm="ODICOLOR démonstration privée", charset="UTF-8"', 'Cache-Control': 'no-store' })); return res.end('Authentification requise'); }
    }
    if (!FICHIERS.has(nom)) { res.writeHead(404, enTetes('text/plain')); return res.end('Introuvable'); }
    const f = path.join(RACINE, nom); let octets; try { octets = fs.readFileSync(f); } catch (_) { res.writeHead(404, enTetes('text/plain')); return res.end('Introuvable'); }
    const html = nom === 'index.html' || nom === 'sw.js' || nom === 'pwa-client.js' || nom === 'recuperation-v47.html' || nom === 'manifest.webmanifest';
    res.writeHead(200, enTetes(TYPES[path.extname(nom)] || 'application/octet-stream', { 'Cache-Control': html ? 'no-store' : 'private, max-age=31536000, immutable', 'Content-Length': octets.length }));
    res.end(req.method === 'HEAD' ? undefined : octets); journal(nom);
  });
}
module.exports = { creer, FICHIERS, PUBLICS };
if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  let s; try { s = creer({ user: process.env.DEMO_USER, pass: process.env.DEMO_PASS }); } catch (e) { console.error(e.message); process.exit(1); }
  s.listen(port, '0.0.0.0', () => console.log('Démonstration privée ODICOLOR prête sur le port ' + port + ' · version ' + release.id.slice(0, 12)));
}
