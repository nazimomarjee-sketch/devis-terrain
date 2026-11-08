// API + tableau de bord. Écoute en local par défaut. Authentification par jeton (en-tête Authorization).
import http from 'node:http';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { diagnostic } from './sante.js';
import { metriques } from './metriques.js';
import { sauvegarder, derniereSauvegarde } from './sauvegarde.js';
import { AGENTS_PREVUS } from './orchestrateur.js';
import { horloge } from './horloge.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.pdf': 'application/pdf' };
const EN_TETES_SECURITE = {
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

const empreinte = (s) => createHash('sha256').update(s).digest();

export function creerServeur({ jarvis, jeton, dossierPublic, dossierSauvegardes = null, cleSauvegarde = null, hotesAutorises = [] }) {
  if (!jeton || jeton.length < 24) throw new Error('Jeton d’accès trop court (24 caractères minimum)');
  const jetonHash = empreinte(jeton);
  const echecs = new Map(); // ip -> { n, jusqua }
  const hotes = new Set(['localhost', '127.0.0.1', '[::1]', ...hotesAutorises]);
  const { db } = jarvis;

  function repondre(res, code, corps, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type, ...EN_TETES_SECURITE });
    res.end(typeof corps === 'string' || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps));
  }

  function authentifie(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    return !!m && timingSafeEqual(empreinte(m[1]), jetonHash);
  }

  async function corpsJson(req) {
    let taille = 0;
    const morceaux = [];
    for await (const c of req) {
      taille += c.length;
      if (taille > 16384) throw Object.assign(new Error('Corps trop grand'), { code: 413 });
      morceaux.push(c);
    }
    if (!morceaux.length) return {};
    try { return JSON.parse(Buffer.concat(morceaux).toString('utf8')); } catch { throw Object.assign(new Error('JSON invalide'), { code: 400 }); }
  }

  function etat() {
    const missions = db.prepare('SELECT id, demande, statut, agent, raison, question, cree_le, maj_le, corrections, cout_cents FROM missions ORDER BY cree_le DESC LIMIT 100').all();
    const aValider = db.prepare(`SELECT id, demande, resultat, rapport_audit FROM missions WHERE statut='EN_ATTENTE_APPROBATION' ORDER BY cree_le`).all().map((m) => {
      const r = JSON.parse(m.resultat);
      return { id: m.id, demande: m.demande, client: r.client.nom, total_ttc_cents: r.total_ttc_cents, avertissements: r.avertissements.map((a) => a.message), fictif: r.donnees_fictives };
    });
    const diag = diagnostic(db, { dossierDonnees: jarvis.dossierDonnees });
    return {
      heure: horloge.iso(),
      mode: 'demo-donnees-fictives',
      agents: AGENTS_PREVUS,
      a_valider: aValider,
      missions,
      alertes: diag.alertes,
      metriques: metriques(db),
      derniere_sauvegarde_verifiee: derniereSauvegarde(db)?.ts ?? null,
    };
  }

  const serveur = http.createServer(async (req, res) => {
    try {
      const hote = (req.headers.host ?? '').replace(/:\d+$/, '');
      if (!hotes.has(hote)) return repondre(res, 421, { erreur: 'Hôte non autorisé' });
      const url = new URL(req.url, 'http://x');
      const chemin = url.pathname;

      // Pages statiques : ne contiennent aucune donnée.
      if (req.method === 'GET' && !chemin.startsWith('/api/')) {
        const nom = chemin === '/' ? 'index.html' : chemin.slice(1);
        const complet = resolve(dossierPublic, nom);
        if (!complet.startsWith(resolve(dossierPublic) + sep) || !existsSync(complet)) return repondre(res, 404, { erreur: 'Introuvable' });
        return repondre(res, 200, readFileSync(complet), TYPES[extname(complet)] ?? 'application/octet-stream');
      }

      // API : jeton obligatoire, verrouillage après échecs répétés.
      const ip = req.socket.remoteAddress ?? '?';
      const f = echecs.get(ip);
      if (f && f.n >= 5 && f.jusqua > Date.now()) return repondre(res, 429, { erreur: 'Trop de tentatives, réessayez plus tard' });
      if (!authentifie(req)) {
        const n = (f && f.jusqua > Date.now() ? f.n : 0) + 1;
        echecs.set(ip, { n, jusqua: Date.now() + 5 * 60000 });
        return repondre(res, 401, { erreur: 'Authentification requise' });
      }
      echecs.delete(ip);

      if (req.method === 'GET' && chemin === '/api/etat') return repondre(res, 200, etat());

      let m;
      if (req.method === 'GET' && (m = /^\/api\/missions\/(M-\d{8}-[0-9a-f]{6})$/.exec(chemin))) {
        const mission = db.prepare('SELECT * FROM missions WHERE id = ?').get(m[1]);
        if (!mission) return repondre(res, 404, { erreur: 'Introuvable' });
        return repondre(res, 200, { ...mission, plan: mission.plan && JSON.parse(mission.plan), resultat: mission.resultat && JSON.parse(mission.resultat), rapport_audit: mission.rapport_audit && JSON.parse(mission.rapport_audit) });
      }
      if (req.method === 'GET' && (m = /^\/api\/fichiers\/(M-\d{8}-[0-9a-f]{6})\/devis\.pdf$/.exec(chemin))) {
        const f2 = jarvis.fichierMission(m[1], 'devis.pdf');
        if (!existsSync(f2)) return repondre(res, 404, { erreur: 'Introuvable' });
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="devis-brouillon.pdf"', ...EN_TETES_SECURITE });
        return createReadStream(f2).pipe(res);
      }
      if (req.method === 'POST' && chemin === '/api/missions') {
        const b = await corpsJson(req);
        const r = jarvis.deposerParUtilisateur(String(b.demande ?? ''), { projet: 'demo', cle: b.cle ? String(b.cle).slice(0, 80) : null });
        return repondre(res, 201, r);
      }
      if (req.method === 'POST' && (m = /^\/api\/missions\/(M-\d{8}-[0-9a-f]{6})\/decision$/.exec(chemin))) {
        const b = await corpsJson(req);
        return repondre(res, 200, jarvis.approuver(m[1], String(b.decision), 'utilisateur'));
      }
      if (req.method === 'POST' && (m = /^\/api\/missions\/(M-\d{8}-[0-9a-f]{6})\/relancer$/.exec(chemin))) {
        return repondre(res, 200, jarvis.relancer(m[1]));
      }
      if (req.method === 'POST' && chemin === '/api/arret') { jarvis.arreterTout(); return repondre(res, 200, { arret: true }); }
      if (req.method === 'POST' && chemin === '/api/reprise') { jarvis.reprendre(); return repondre(res, 200, { arret: false }); }
      if (req.method === 'POST' && chemin === '/api/sauvegarde') {
        if (!dossierSauvegardes || !cleSauvegarde) return repondre(res, 409, { erreur: 'Sauvegarde non configurée (clé absente)' });
        const r = sauvegarder(db, dossierSauvegardes, cleSauvegarde);
        return repondre(res, 200, { ok: true, missions: r.missions });
      }
      return repondre(res, 404, { erreur: 'Introuvable' });
    } catch (e) {
      const code = e.code === 413 || e.code === 400 ? e.code : 400;
      return repondre(res, code, { erreur: e.message });
    }
  });
  return serveur;
}
