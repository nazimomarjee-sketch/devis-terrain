// API + tableau de bord d'UN espace. Écoute en local par défaut. Deux jetons distincts :
//  - utilisateur : missions, validations, arrêt d'urgence, lecture ;
//  - administrateur : règles métier, autorisations (données réelles, intégrations). JARVIS ne détient jamais ce jeton.
import http from 'node:http';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { diagnostic } from './sante.js';
import { metriques } from './metriques.js';
import { sauvegarder, derniereSauvegarde } from './sauvegarde.js';
import { horloge } from './horloge.js';
import { listerRegles, definirRegle, listerAutorisations, accorder, revoquer, autorise } from './regles.js';
import { etatIntegrations } from './integrations.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const EN_TETES = { 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' };
const empreinte = (s) => createHash('sha256').update(s).digest();
const ID = '(M-\\d{8}-[0-9a-f]{6})';

export function creerServeur({ jarvis, jeton, jetonAdmin, dossierPublic, dossierSauvegardes = null, cleSauvegarde = null, hotesAutorises = [], liensEspaces = [] }) {
  if (!jeton || jeton.length < 24) throw new Error('Jeton d’accès trop court (24 caractères minimum)');
  if (!jetonAdmin || jetonAdmin.length < 24 || jetonAdmin === jeton) throw new Error('Jeton administrateur absent, trop court ou identique au jeton utilisateur');
  const hU = empreinte(jeton); const hA = empreinte(jetonAdmin);
  const echecs = new Map();
  const hotes = new Set(['localhost', '127.0.0.1', '[::1]', ...hotesAutorises]);
  const { db, espace } = jarvis;

  const repondre = (res, code, corps, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, ...EN_TETES }); res.end(typeof corps === 'string' || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps)); };
  const role = (req) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? ''); if (!m) return null;
    const h = empreinte(m[1]);
    return timingSafeEqual(h, hA) ? 'admin' : timingSafeEqual(h, hU) ? 'utilisateur' : null;
  };
  async function corpsJson(req) {
    let t = 0; const ms = [];
    for await (const c of req) { t += c.length; if (t > 16384) throw Object.assign(new Error('Corps trop grand'), { code: 413 }); ms.push(c); }
    if (!ms.length) return {};
    try { return JSON.parse(Buffer.concat(ms).toString('utf8')); } catch { throw Object.assign(new Error('JSON invalide'), { code: 400 }); }
  }

  function titre(m, r) {
    if (r.type === 'devis') return { titre: `Devis ${r.client.nom}`, detail: `Total TTC : ${(r.total_ttc_cents / 100).toFixed(2).replace('.', ',')} €`, avertissements: r.avertissements.map((a) => a.message) };
    if (r.type === 'relances') return { titre: `${r.brouillons.length} relance(s) à valider`, detail: r.brouillons.slice(0, 3).map((b) => `${b.ref} niv.${b.niveau}`).join(' · '), avertissements: [r.avertissement] };
    return { titre: `Commande pour ${r.client.nom}`, detail: `Devis ${r.devis_ref} — ${(r.total_ht_cents / 100).toFixed(2).replace('.', ',')} € HT`, avertissements: r.avertissements.map((a) => a.message) };
  }

  function etat() {
    const missions = db.prepare('SELECT id, demande, statut, agent, raison, question, cree_le, maj_le, corrections, cout_cents FROM missions ORDER BY rowid DESC LIMIT 100').all();
    const aValider = db.prepare(`SELECT id, demande, resultat FROM missions WHERE statut='EN_ATTENTE_APPROBATION' ORDER BY rowid`).all().map((m) => { const r = JSON.parse(m.resultat); return { id: m.id, type: r.type, ...titre(m, r), fictif: r.donnees_fictives }; });
    const termines = db.prepare(`SELECT id, agent, resultat FROM missions WHERE statut='VALIDE' AND resultat IS NOT NULL ORDER BY rowid DESC LIMIT 50`).all().map((m) => ({ id: m.id, agent: m.agent, r: JSON.parse(m.resultat) }));
    const anomalies = []; const vus = new Set();
    for (const t of termines) { if (vus.has(t.r.type)) continue; const n = t.r.anomalies?.length; if (n !== undefined) { vus.add(t.r.type); anomalies.push({ source: t.r.type, mission_id: t.id, nombre: n }); } }
    const bloquee = missions.find((m) => m.statut === 'BLOQUE' || m.statut === 'ECHEC');
    const plan = termines.find((t) => t.r.type === 'plan_journee' && t.r.prochaine_action);
    const prochaine = aValider[0] ? { origine: 'validation', id: aValider[0].id, texte: aValider[0].titre }
      : bloquee ? { origine: bloquee.statut === 'ECHEC' ? 'echec' : 'question', id: bloquee.id, texte: bloquee.question ?? bloquee.raison }
        : plan ? { origine: 'planification', id: plan.r.prochaine_action.id, texte: plan.r.prochaine_action.titre } : null;
    const diag = diagnostic(db, { dossierDonnees: jarvis.dossierDonnees });
    return {
      heure: horloge.iso(),
      espace: { id: espace.id, libelle: espace.libelle, description: espace.description, donnees_reelles_autorisees: autorise(db, 'donnees_reelles'), liens: liensEspaces },
      integrations: etatIntegrations(db), connecteur_cockpit_autorise: autorise(db, 'connecteur:cockpit'),
      mode: autorise(db, 'donnees_reelles') ? 'donnees-reelles-autorisees' : 'demo-donnees-fictives',
      prochaine_action: prochaine, agents: jarvis.descriptionAgents(), a_valider: aValider, missions, anomalies, alertes: diag.alertes, metriques: metriques(db),
      autorisations: listerAutorisations(db).map((a) => ({ id: a.id, type: a.type, portee: a.portee, expire_le: a.expire_le, revoque_le: a.revoque_le })),
      derniere_sauvegarde_verifiee: derniereSauvegarde(db)?.ts ?? null,
    };
  }

  const serveur = http.createServer(async (req, res) => {
    try {
      const hote = (req.headers.host ?? '').replace(/:\d+$/, '');
      if (!hotes.has(hote)) return repondre(res, 421, { erreur: 'Hôte non autorisé' });
      const chemin = new URL(req.url, 'http://x').pathname;
      if (req.method === 'GET' && !chemin.startsWith('/api/')) {
        const complet = resolve(dossierPublic, chemin === '/' ? 'index.html' : chemin.slice(1));
        if (!complet.startsWith(resolve(dossierPublic) + sep) || !existsSync(complet)) return repondre(res, 404, { erreur: 'Introuvable' });
        return repondre(res, 200, readFileSync(complet), TYPES[extname(complet)] ?? 'application/octet-stream');
      }
      const ip = req.socket.remoteAddress ?? '?'; const f = echecs.get(ip);
      if (f && f.n >= 5 && f.jusqua > Date.now()) return repondre(res, 429, { erreur: 'Trop de tentatives, réessayez plus tard' });
      const qui = role(req);
      if (!qui) { echecs.set(ip, { n: (f && f.jusqua > Date.now() ? f.n : 0) + 1, jusqua: Date.now() + 5 * 60000 }); return repondre(res, 401, { erreur: 'Authentification requise' }); }
      echecs.delete(ip);
      const admin = qui === 'admin';
      let m;

      // ----- Administration : jeton administrateur UNIQUEMENT -----
      if (chemin.startsWith('/api/admin/')) {
        if (!admin) return repondre(res, 403, { erreur: 'Jeton administrateur requis' });
        if (req.method === 'POST' && chemin === '/api/admin/regles') { const b = await corpsJson(req); definirRegle(db, b, 'administrateur'); return repondre(res, 200, { ok: true }); }
        if (req.method === 'POST' && chemin === '/api/admin/autorisations') { const b = await corpsJson(req); return repondre(res, 201, { id: accorder(db, b, 'administrateur') }); }
        if (req.method === 'POST' && (m = /^\/api\/admin\/autorisations\/(\d+)\/revoquer$/.exec(chemin))) { revoquer(db, Number(m[1]), 'administrateur'); return repondre(res, 200, { ok: true }); }
        return repondre(res, 404, { erreur: 'Introuvable' });
      }
      if (admin) return repondre(res, 403, { erreur: 'Le jeton administrateur ne sert qu’à l’administration' }); // moindre privilège

      if (req.method === 'GET' && chemin === '/api/etat') return repondre(res, 200, etat());
      if (req.method === 'GET' && chemin === '/api/regles') return repondre(res, 200, listerRegles(db));
      if (req.method === 'GET' && (m = new RegExp(`^/api/missions/${ID}/decision-detail$`).exec(chemin))) { const d = jarvis.detailDecision(m[1]); return d ? repondre(res, 200, d) : repondre(res, 404, { erreur: 'Introuvable' }); }
      if (req.method === 'GET' && (m = new RegExp(`^/api/missions/${ID}$`).exec(chemin))) {
        const x = db.prepare('SELECT * FROM missions WHERE id = ?').get(m[1]); if (!x) return repondre(res, 404, { erreur: 'Introuvable' });
        return repondre(res, 200, { ...x, plan: x.plan && JSON.parse(x.plan), resultat: x.resultat && JSON.parse(x.resultat), rapport_audit: x.rapport_audit && JSON.parse(x.rapport_audit) });
      }
      if (req.method === 'GET' && (m = new RegExp(`^/api/fichiers/${ID}/devis\\.pdf$`).exec(chemin))) {
        const f2 = jarvis.fichierMission(m[1], 'devis.pdf'); if (!existsSync(f2)) return repondre(res, 404, { erreur: 'Introuvable' });
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="devis-brouillon.pdf"', ...EN_TETES }); return createReadStream(f2).pipe(res);
      }
      if (req.method === 'POST' && chemin === '/api/missions') { const b = await corpsJson(req); return repondre(res, 201, jarvis.deposerParUtilisateur(String(b.demande ?? ''), { cle: b.cle ? String(b.cle).slice(0, 80) : null })); }
      if (req.method === 'POST' && (m = new RegExp(`^/api/missions/${ID}/decision$`).exec(chemin))) { const b = await corpsJson(req); return repondre(res, 200, jarvis.approuver(m[1], String(b.decision), 'utilisateur')); }
      if (req.method === 'POST' && (m = new RegExp(`^/api/missions/${ID}/relancer$`).exec(chemin))) return repondre(res, 200, jarvis.relancer(m[1]));
      if (req.method === 'POST' && chemin === '/api/arret') { jarvis.arreterTout(); return repondre(res, 200, { arret: true }); }
      if (req.method === 'POST' && chemin === '/api/reprise') { jarvis.reprendre(); return repondre(res, 200, { arret: false }); }
      if (req.method === 'POST' && chemin === '/api/sauvegarde') {
        if (!dossierSauvegardes || !cleSauvegarde) return repondre(res, 409, { erreur: 'Sauvegarde non configurée (clé absente)' });
        return repondre(res, 200, { ok: true, missions: sauvegarder(db, dossierSauvegardes, cleSauvegarde).missions });
      }
      return repondre(res, 404, { erreur: 'Introuvable' });
    } catch (e) {
      return repondre(res, e.code === 413 || e.code === 400 ? e.code : 400, { erreur: e.message });
    }
  });
  return serveur;
}
