#!/usr/bin/env node
'use strict';
/* Banque locale — mode bureau (PC). Aucune dépendance : Node 18 ou plus suffit.
 *
 *   node bureau.cjs                 démarre l'appli sur http://127.0.0.1:8765 (cette machine uniquement)
 *   node bureau.cjs mcp             connecteur MCP (stdio) pour un assistant : Claude Desktop, Claude Code, etc.
 *   node bureau.cjs action <nom> '<json>'   exécute une action depuis un script ou un terminal
 *   node bureau.cjs actions         liste les actions disponibles
 *
 * Les données vivent dans un fichier du PC (par défaut ~/BanqueLocale/donnees.json), jamais dans le dépôt.
 * L'assistant ne passe que par la liste ACTIONS ci-dessous : il ne peut ni effacer ni restaurer,
 * il ne lit que les fichiers du dossier « a-importer », et il ne voit les libellés que si vous l'autorisez.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const C = require('./coeur.js');

const DOSSIER = path.resolve(process.env.BANQUE_DOSSIER || path.join(os.homedir(), 'BanqueLocale'));
const PORT = Number(process.env.BANQUE_PORT) || 8765;
const F = {
  donnees: path.join(DOSSIER, 'donnees.json'), config: path.join(DOSSIER, 'reglages.json'),
  jeton: path.join(DOSSIER, 'jeton.txt'), journal: path.join(DOSSIER, 'journal.log'),
  entree: path.join(DOSSIER, 'a-importer'), copies: path.join(DOSSIER, 'sauvegardes')
};
const TAILLE_MAX = 20 * 1024 * 1024;

/* ---------- Fichiers ---------- */
function preparer() {
  for (const d of [DOSSIER, F.entree, F.copies]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(F.jeton)) fs.writeFileSync(F.jeton, crypto.randomBytes(24).toString('hex'), { mode: 0o600 });
}
function ecrireAtomique(fichier, texte) {
  const tmp = fichier + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, texte, { mode: 0o600 });
  fs.renameSync(tmp, fichier);
}
/** Lit les données. Un fichier illisible lève une erreur : il n'est jamais écrasé par un fichier vide. */
function lire() {
  let brut;
  try { brut = fs.readFileSync(F.donnees, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return { ops: [], regles: [], rev: 0 }; throw e; }
  let d;
  try { d = JSON.parse(brut); } catch (e) { throw new Error('donnees.json est illisible. Restaurez une copie du dossier « sauvegardes ».'); }
  const v = C.validerSauvegarde(d);
  return { ops: v.ops, regles: v.regles, rev: Number.isInteger(d.rev) ? d.rev : 0 };
}
function ecrire(d) {
  const v = C.validerSauvegarde({ format: 'banque-locale', ops: d.ops, regles: d.regles });
  const copie = path.join(F.copies, 'donnees-' + new Date().toISOString().slice(0, 10) + '.json');
  if (fs.existsSync(F.donnees) && !fs.existsSync(copie)) {
    fs.copyFileSync(F.donnees, copie);
    const anciennes = fs.readdirSync(F.copies).filter(n => /^donnees-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    for (const n of anciennes.slice(0, -30)) fs.unlinkSync(path.join(F.copies, n));
  }
  d.rev = (d.rev || 0) + 1;
  ecrireAtomique(F.donnees, JSON.stringify({ format: 'banque-locale', version: 1, rev: d.rev, ops: v.ops, regles: v.regles }));
  return d.rev;
}
function lireConfig() {
  try { return { detailPourAssistant: JSON.parse(fs.readFileSync(F.config, 'utf8')).detailPourAssistant === true }; }
  catch (e) { return { detailPourAssistant: false }; }
}
function journaliser(source, action, note) {
  const ligne = new Date().toISOString() + '\t' + source + '\t' + action + '\t' + String(note || '').replace(/\s+/g, ' ').slice(0, 200) + '\n';
  try { fs.appendFileSync(F.journal, ligne, { mode: 0o600 }); } catch (e) { /* le journal ne doit jamais bloquer une action */ }
}
function finJournal(n) {
  try { return fs.readFileSync(F.journal, 'utf8').trim().split('\n').slice(-n).reverse(); } catch (e) { return []; }
}
function lireTexte(fichier) {
  const octets = fs.readFileSync(fichier);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(octets); }
  catch (e) { return new TextDecoder('windows-1252').decode(octets); }
}

/* ---------- Actions offertes à l'assistant ---------- */
const eur = c => c / 100;
const erreur = m => { const e = new Error(m); e.attendue = true; return e; };
function exigerDetail() {
  if (!lireConfig().detailPourAssistant)
    throw erreur('Accès aux libellés désactivé. Le propriétaire peut l\'activer dans l\'appli : Réglages > Assistant.');
}
function exigerCategorie(c) {
  if (!C.CATEGORIES.includes(c)) throw erreur('Catégorie inconnue. Valeurs possibles : ' + C.CATEGORIES.join(', '));
}
function moisValide(d, m) {
  const tous = C.listeMois(d.ops);
  if (m == null || m === '') return tous[tous.length - 1] || null;
  if (!/^\d{4}-\d{2}$/.test(String(m))) throw erreur('Mois attendu au format AAAA-MM.');
  return String(m);
}
const chaine = { type: 'string' }, nombre = { type: 'integer' };

const ACTIONS = {
  etat: {
    description: 'État général : nombre d\'opérations, comptes, mois disponibles, date de la dernière opération, opérations à classer, et si l\'accès aux libellés est autorisé.',
    params: {},
    run() {
      const d = lire();
      return {
        operations: d.ops.length, comptes: [...new Set(d.ops.map(o => o.compte))], mois: C.listeMois(d.ops),
        derniereOperation: d.ops.reduce((a, o) => (o.date > a ? o.date : a), '') || null,
        aClasser: d.ops.filter(o => C.categorie(o, d.regles) === C.A_CLASSER).length,
        reglesPersonnelles: d.regles.length, libellesAutorises: lireConfig().detailPourAssistant,
        categories: C.CATEGORIES, dossierImport: F.entree
      };
    }
  },
  synthese: {
    description: 'Synthèse d\'un mois : entrées, sorties, solde et total par catégorie, en euros. Sans mois : le dernier mois connu. L\'épargne et les virements internes sont exclus des totaux.',
    params: { mois: { ...chaine, description: 'AAAA-MM' } },
    run(a) {
      const d = lire(), mois = moisValide(d, a.mois);
      if (!mois) return { vide: true, message: 'Aucune opération importée.' };
      const s = C.syntheseMois(d.ops, d.regles, mois);
      return {
        mois, operations: s.nb, entrees: eur(s.entrees), sorties: eur(s.sorties), solde: eur(s.solde),
        epargneEtVirementsInternes: eur(s.neutre), aClasser: s.aClasser,
        parCategorie: Object.fromEntries(Object.entries(s.parCat).sort((x, y) => x[1] - y[1]).map(([k, v]) => [k, eur(v)]))
      };
    }
  },
  resume: {
    description: 'Résumé anonymisé sur plusieurs mois (totaux par catégorie, charges récurrentes par catégorie). Ne contient aucun libellé ni nom de compte : c\'est la forme à utiliser pour une analyse.',
    params: { nbMois: { ...nombre, description: 'Nombre de mois, 1 à 24. Défaut : 6.' } },
    run(a) {
      const d = lire(), n = Math.min(24, Math.max(1, Number.isInteger(a.nbMois) ? a.nbMois : 6));
      return { texte: C.resumePourClaude(d.ops, d.regles, n) || 'Aucune opération importée.' };
    }
  },
  recurrentes: {
    description: 'Charges qui reviennent chaque mois (au moins 3 mois, montant proche). Le nom du commerçant n\'est donné que si l\'accès aux libellés est autorisé.',
    params: {},
    run() {
      const d = lire(), detail = lireConfig().detailPourAssistant;
      const liste = C.recurrentes(d.ops, d.regles).map(r => ({ ...(detail ? { commercant: r.marchand } : {}), categorie: r.cat, montantMensuel: eur(r.montant), mois: r.nbMois }));
      return { totalMensuel: eur(C.recurrentes(d.ops, d.regles).reduce((s, r) => s + r.montant, 0)), charges: liste };
    }
  },
  fichiers_a_importer: {
    description: 'Liste les relevés (CSV, OFX) déposés par le propriétaire dans le dossier d\'import. C\'est le seul dossier lisible.',
    params: {},
    run() {
      return { dossier: F.entree, fichiers: fs.readdirSync(F.entree, { withFileTypes: true }).filter(x => x.isFile()).map(x => x.name).sort() };
    }
  },
  importer: {
    description: 'Lit un relevé du dossier d\'import. Sans « confirmer », renvoie seulement un aperçu (nouvelles opérations, doublons, lignes refusées, période, totaux) à faire valider par le propriétaire. Avec confirmer=true, enregistre les nouvelles opérations. Réimporter un relevé ne crée pas de doublon.',
    params: { fichier: { ...chaine, description: 'Nom du fichier dans le dossier d\'import' }, compte: { ...chaine, description: 'Nom libre du compte, sans numéro. Défaut : Compte courant.' }, confirmer: { type: 'boolean' } },
    requis: ['fichier'], ecrit: true,
    run(a) {
      const nom = path.basename(String(a.fichier || '')), chemin = path.join(F.entree, nom);
      let info;
      try { info = fs.lstatSync(chemin); } catch (e) { throw erreur('Fichier introuvable dans le dossier d\'import : ' + nom); }
      if (!nom || !info.isFile()) throw erreur('Ce n\'est pas un fichier ordinaire du dossier d\'import.');
      if (info.size > TAILLE_MAX) throw erreur('Fichier trop volumineux (plus de 20 Mo).');
      const compte = String(a.compte || 'Compte courant').replace(/\|/g, ' ').trim().slice(0, 40) || 'Compte courant';
      const r = C.lireReleve(lireTexte(chemin));
      if (r.erreur) throw erreur(r.erreur);
      const d = lire(), f = C.fusionner(new Set(d.ops.map(o => o.id)), C.identifier(r.ops, compte));
      const dates = f.ajouts.map(o => o.date).sort();
      const apercu = {
        fichier: nom, format: r.format, compte, lues: r.ops.length, nouvelles: f.ajouts.length, dejaPresentes: f.doublons.length,
        refusees: r.refus.length, motifsRefus: [...new Set(r.refus.map(x => x.motif))],
        periode: dates.length ? { du: dates[0], au: dates[dates.length - 1] } : null,
        totalEntrees: eur(f.ajouts.filter(o => o.montant > 0).reduce((s, o) => s + o.montant, 0)),
        totalSorties: eur(f.ajouts.filter(o => o.montant < 0).reduce((s, o) => s + o.montant, 0))
      };
      if (a.confirmer !== true) return { enregistre: false, apercu, suite: 'Faites vérifier ces totaux au propriétaire, puis rappelez avec confirmer=true.' };
      if (f.ajouts.length) { d.ops.push(...f.ajouts); ecrire(d); }
      return { enregistre: true, apercu };
    },
    note: a => path.basename(String(a.fichier || '')) + (a.confirmer === true ? ' (enregistré)' : ' (aperçu)')
  },
  operations: {
    description: 'Liste des opérations avec leur libellé (libellés autorisés uniquement). Filtres : mois, catégorie, texte. 50 résultats par défaut, 200 au plus.',
    params: { mois: { ...chaine, description: 'AAAA-MM' }, categorie: chaine, texte: chaine, limite: nombre },
    run(a) {
      exigerDetail();
      const d = lire(), t = C.normaliser(a.texte || '');
      if (a.categorie) exigerCategorie(a.categorie);
      const mois = a.mois ? moisValide(d, a.mois) : null;
      const liste = d.ops.filter(o => (!mois || o.date.slice(0, 7) === mois) && (!a.categorie || C.categorie(o, d.regles) === a.categorie) && (!t || C.normaliser(o.libelle).includes(t)))
        .sort((x, y) => (x.date < y.date ? 1 : -1));
      const limite = Math.min(200, Math.max(1, Number.isInteger(a.limite) ? a.limite : 50));
      return { total: liste.length, affichees: Math.min(limite, liste.length), operations: liste.slice(0, limite).map(o => ({ id: o.id, date: o.date, libelle: o.libelle, montant: eur(o.montant), compte: o.compte, categorie: C.categorie(o, d.regles) })) };
    }
  },
  classer: {
    description: 'Change la catégorie d\'une opération précise, désignée par son id (libellés autorisés uniquement).',
    params: { id: chaine, categorie: chaine }, requis: ['id', 'categorie'], ecrit: true,
    run(a) {
      exigerDetail(); exigerCategorie(a.categorie);
      const d = lire(), op = d.ops.find(o => o.id === a.id);
      if (!op) throw erreur('Opération introuvable.');
      op.catManuelle = a.categorie; ecrire(d);
      return { ok: true, categorie: a.categorie };
    },
    note: a => String(a.categorie)
  },
  ajouter_regle: {
    description: 'Crée une règle : toute opération dont le libellé contient ce mot-clé (mots entiers) est rangée dans la catégorie, y compris les prochaines (libellés autorisés uniquement).',
    params: { motCle: { ...chaine, description: 'Au moins 3 caractères, par exemple un nom de commerçant' }, categorie: chaine }, requis: ['motCle', 'categorie'], ecrit: true,
    run(a) {
      exigerDetail(); exigerCategorie(a.categorie);
      const motif = C.normaliser(a.motCle || '');
      if (motif.length < 3) throw erreur('Mot-clé trop court.');
      const d = lire();
      d.regles = d.regles.filter(r => r.motif !== motif).concat({ motif, cat: a.categorie });
      const touchees = d.ops.filter(o => (' ' + C.normaliser(o.libelle) + ' ').includes(' ' + motif + ' '));
      for (const o of touchees) delete o.catManuelle;
      ecrire(d);
      return { ok: true, motCle: motif, categorie: a.categorie, operationsConcernees: touchees.length };
    },
    note: a => C.normaliser(a.motCle || '') + ' -> ' + a.categorie
  },
  supprimer_regle: {
    description: 'Supprime une règle personnelle par son mot-clé (libellés autorisés uniquement).',
    params: { motCle: chaine }, requis: ['motCle'], ecrit: true,
    run(a) {
      exigerDetail();
      const motif = C.normaliser(a.motCle || ''), d = lire(), avant = d.regles.length;
      d.regles = d.regles.filter(r => r.motif !== motif);
      if (d.regles.length === avant) throw erreur('Aucune règle avec ce mot-clé.');
      ecrire(d);
      return { ok: true };
    },
    note: a => C.normaliser(a.motCle || '')
  },
  regles: {
    description: 'Liste les règles personnelles de catégorie (libellés autorisés uniquement).',
    params: {},
    run() { exigerDetail(); return { regles: lire().regles.map(r => ({ motCle: r.motif, categorie: r.cat })) }; }
  }
};

function executer(nom, args, source) {
  const action = Object.prototype.hasOwnProperty.call(ACTIONS, nom) ? ACTIONS[nom] : null;
  if (!action) throw erreur('Action inconnue : ' + nom + '. Disponibles : ' + Object.keys(ACTIONS).join(', '));
  args = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  for (const r of action.requis || []) if (args[r] == null || args[r] === '') throw erreur('Paramètre manquant : ' + r);
  try {
    const res = action.run(args);
    journaliser(source, nom, action.note ? action.note(args) : '');
    return res;
  } catch (e) { journaliser(source, nom, 'REFUS : ' + e.message); throw e; }
}

/* ---------- Connecteur MCP (stdio, JSON-RPC ligne par ligne) ---------- */
function demarrerMCP() {
  const outils = Object.entries(ACTIONS).map(([nom, a]) => ({
    name: nom, description: a.description,
    inputSchema: { type: 'object', properties: a.params, required: a.requis || [], additionalProperties: false },
    annotations: { readOnlyHint: !a.ecrit, destructiveHint: false, openWorldHint: false }
  }));
  const envoyer = m => process.stdout.write(JSON.stringify(m) + '\n');
  function traiter(msg) {
    const { id, method, params } = msg;
    if (id === undefined || id === null) return;
    if (method === 'initialize') return envoyer({ jsonrpc: '2.0', id, result: {
      protocolVersion: (params && params.protocolVersion) || '2024-11-05', capabilities: { tools: {} },
      serverInfo: { name: 'banque-locale', version: '1.0.0' },
      instructions: 'Comptes bancaires du propriétaire, stockés sur son PC. Pour analyser, utilisez « resume » ou « synthese » (aucun libellé). N\'inventez aucun montant. Avant d\'enregistrer un import, montrez l\'aperçu au propriétaire.'
    } });
    if (method === 'ping') return envoyer({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return envoyer({ jsonrpc: '2.0', id, result: { tools: outils } });
    if (method === 'tools/call') {
      try {
        const res = executer(params && params.name, params && params.arguments, 'assistant-mcp');
        return envoyer({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(res, null, 1) }] } });
      } catch (e) {
        return envoyer({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: e.attendue ? e.message : 'Erreur interne : ' + e.message }] } });
      }
    }
    envoyer({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Méthode inconnue : ' + method } });
  }
  let tampon = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', bloc => {
    tampon += bloc;
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const ligne = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1);
      if (!ligne) continue;
      let msg;
      try { msg = JSON.parse(ligne); } catch (e) { envoyer({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } }); continue; }
      traiter(msg);
    }
  });
}

/* ---------- Serveur local (appli + API) ---------- */
const STATIQUES = { 'banque.css': 'text/css', 'coeur.js': 'text/javascript', 'app.js': 'text/javascript', 'icone.svg': 'image/svg+xml', 'manifest.webmanifest': 'application/manifest+json' };

function demarrerServeur() {
  const jeton = fs.readFileSync(F.jeton, 'utf8').trim();
  const hotes = new Set(['127.0.0.1:' + PORT, 'localhost:' + PORT]);
  const json = (rep, code, corps) => { rep.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); rep.end(JSON.stringify(corps)); };
  const corpsJSON = req => new Promise((ok, ko) => {
    const morceaux = []; let taille = 0;
    req.on('data', m => { taille += m.length; if (taille > 40 * 1024 * 1024) { ko(erreur('Requête trop volumineuse.')); req.destroy(); } else morceaux.push(m); });
    req.on('end', () => { try { ok(morceaux.length ? JSON.parse(Buffer.concat(morceaux).toString('utf8')) : {}); } catch (e) { ko(erreur('JSON invalide.')); } });
    req.on('error', ko);
  });
  const jetonValide = req => {
    const recu = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, '')), attendu = Buffer.from(jeton);
    return recu.length === attendu.length && crypto.timingSafeEqual(recu, attendu);
  };

  const serveur = http.createServer(async (req, rep) => {
    try {
      /* Refuser tout nom d'hôte inattendu bloque les attaques par « DNS rebinding » depuis un site web. */
      if (!hotes.has(String(req.headers.host))) return json(rep, 403, { erreur: 'Hôte refusé.' });
      const url = new URL(req.url, 'http://127.0.0.1');
      const chemin = url.pathname.replace(/^\/banque\//, '/');

      if (!chemin.startsWith('/api/')) {
        if (req.method !== 'GET') return json(rep, 405, { erreur: 'Méthode refusée.' });
        if (chemin === '/' || chemin === '/index.html') {
          const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
            .replace("default-src 'self'; connect-src 'none';", "default-src 'self'; connect-src 'self';")
            .replace('<meta name="referrer"', '<meta name="banque-jeton" content="' + jeton + '">\n<meta name="referrer"');
          rep.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
          return rep.end(html);
        }
        const nom = chemin.slice(1);
        if (!Object.prototype.hasOwnProperty.call(STATIQUES, nom)) return json(rep, 404, { erreur: 'Introuvable.' });
        rep.writeHead(200, { 'Content-Type': STATIQUES[nom] + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return rep.end(fs.readFileSync(path.join(__dirname, nom)));
      }

      if (!jetonValide(req)) return json(rep, 401, { erreur: 'Jeton absent ou incorrect.' });
      const route = req.method + ' ' + chemin;
      if (route === 'GET /api/rev') return json(rep, 200, { rev: lire().rev });
      if (route === 'GET /api/donnees') {
        const d = lire();
        return json(rep, 200, { ops: d.ops, regles: d.regles, rev: d.rev, config: lireConfig(), dossier: DOSSIER, dossierImport: F.entree, journal: finJournal(25) });
      }
      if (req.method !== 'POST') return json(rep, 404, { erreur: 'Introuvable.' });
      const corps = await corpsJSON(req);
      if (chemin.startsWith('/api/action/'))
        return json(rep, 200, { resultat: executer(decodeURIComponent(chemin.slice(12)), corps, 'assistant-http') });
      /* Routes réservées à l'écran de l'appli (le propriétaire). */
      if (route === 'POST /api/ops') {
        const d = lire(), parId = new Map(d.ops.map(o => [o.id, o]));
        for (const o of Array.isArray(corps.ops) ? corps.ops : []) parId.set(o && o.id, o);
        d.ops = [...parId.values()];
        return json(rep, 200, { rev: ecrire(d) });
      }
      if (route === 'POST /api/regles') { const d = lire(); d.regles = corps.regles; return json(rep, 200, { rev: ecrire(d) }); }
      if (route === 'POST /api/remplacer') { const d = lire(); d.ops = corps.ops; d.regles = corps.regles; journaliser('ecran', 'remplacer', d.ops.length + ' opérations'); return json(rep, 200, { rev: ecrire(d) }); }
      if (route === 'POST /api/config') {
        const c = { detailPourAssistant: corps.detailPourAssistant === true };
        ecrireAtomique(F.config, JSON.stringify(c)); journaliser('ecran', 'config', 'libellés ' + (c.detailPourAssistant ? 'autorisés' : 'masqués'));
        return json(rep, 200, { config: c });
      }
      return json(rep, 404, { erreur: 'Introuvable.' });
    } catch (e) {
      json(rep, e.attendue || /Sauvegarde refusée|pas une sauvegarde/.test(e.message) ? 400 : 500, { erreur: e.message });
    }
  });
  serveur.on('error', e => {
    console.error(e.code === 'EADDRINUSE' ? 'Le port ' + PORT + ' est déjà utilisé : l\'appli tourne peut-être déjà. Ouvrez http://127.0.0.1:' + PORT + '/' : 'Démarrage impossible : ' + e.message);
    process.exit(1);
  });
  serveur.listen(PORT, '127.0.0.1', () => {
    console.log('Banque locale est ouverte : http://127.0.0.1:' + PORT + '/');
    console.log('Données            : ' + F.donnees);
    console.log('Relevés à importer : ' + F.entree);
    console.log('Jeton pour une API : ' + F.jeton);
    console.log('Accessible depuis ce PC uniquement. Fermez cette fenêtre pour arrêter.');
  });
  return serveur;
}

/* ---------- Lancement ---------- */
if (require.main === module) {
  preparer();
  const [commande, nom, brut] = process.argv.slice(2);
  if (!commande || commande === 'serveur') demarrerServeur();
  else if (commande === 'mcp') demarrerMCP();
  else if (commande === 'actions') for (const [n, a] of Object.entries(ACTIONS)) console.log(n + (a.ecrit ? ' [écrit]' : '') + '\n    ' + a.description);
  else if (commande === 'action') {
    try {
      let args = {};
      if (brut) { try { args = JSON.parse(brut); } catch (e) { throw erreur('Le 3e argument doit être du JSON, par exemple \'{"nbMois":6}\'.'); } }
      console.log(JSON.stringify(executer(nom, args, 'assistant-cli'), null, 1));
    } catch (e) { console.error(e.message); process.exit(1); }
  } else { console.error('Commande inconnue. Utilisez : (rien) | mcp | actions | action <nom> \'<json>\''); process.exit(1); }
}

module.exports = { ACTIONS, executer, preparer, lire, ecrire, demarrerServeur, DOSSIER, F };
