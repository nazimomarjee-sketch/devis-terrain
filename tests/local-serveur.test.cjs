'use strict';
// Application locale ODICOLOR 2.0 — étape 2 : sécurité de la liaison Bureau ↔ programme local (local/serveur.js).
// Données FICTIVES. Exécution : node --test tests/local-serveur.test.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { demarrer } = require('../local/serveur.js');

const RAPIDE = { algo: 'scrypt', N: 2 ** 14, r: 8, p: 1 };
const MDP = 'Mot-De-Passe-Fictif-2026';
let app, dossier, journal = [], origine;

// Requête brute (pour maîtriser Host, Origin, cookies).
function requete(methode, chemin, { corps, entetes = {}, host } = {}) {
  return new Promise((ok, ko) => {
    const donnees = corps === undefined ? null : Buffer.from(typeof corps === 'string' ? corps : JSON.stringify(corps));
    const r = http.request({ host: '127.0.0.1', port: app.port, method: methode, path: chemin,
      headers: { Host: host || '127.0.0.1:' + app.port, ...(donnees ? { 'Content-Type': 'application/json', 'Content-Length': donnees.length } : {}), ...entetes } }, res => {
      const m = []; res.on('data', x => m.push(x)); res.on('end', () => { const t = Buffer.concat(m).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch { /* pas du JSON */ } ok({ statut: res.statusCode, entetes: res.headers, texte: t, json: j }); });
    });
    r.on('error', ko); if (donnees) r.write(donnees); r.end();
  });
}
const API = (extra = {}) => ({ 'X-ODICOLOR': '1', Origin: origine, ...extra });
const cookieDe = r => (r.entetes['set-cookie'] || [''])[0].split(';')[0];

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-serveur-'));
  app = await demarrer({ dossier, port: 0, kdf: RAPIDE, journal: l => journal.push(l), essaisAvantAttente: 3, attenteMs: 60000 });
  origine = 'http://127.0.0.1:' + app.port;
});
after(async () => { await app.arreter(); fs.rmSync(dossier, { recursive: true, force: true }); });

test('n’écoute que sur 127.0.0.1 (inaccessible depuis un autre appareil)', () => {
  assert.equal(app.serveur.address().address, '127.0.0.1');
});

test('Host étranger refusé (protection « DNS rebinding »), même pour le Bureau', async () => {
  assert.equal((await requete('GET', '/bureau/index.html', { host: 'site-pirate.example:' + app.port })).statut, 421);
  assert.equal((await requete('GET', '/api/statut', { host: 'site-pirate.example', entetes: API() })).statut, 421);
  assert.equal((await requete('GET', '/bureau/index.html')).statut, 200);
});

test('seuls le Bureau et l’écran d’ouverture sont servis : ni coffre, ni code local, ni tests, ni dépôt', async () => {
  for (const c of ['/local/coffre.js', '/local/serveur.js', '/tests/local-coffre.test.cjs', '/.git/config', '/bureau/../local/coffre.js', '/bureau/%2e%2e/local/coffre.js',
    '/app.js', '/index.html', '/bureau/outils/generer-communes.cjs', '/docs/APPLICATION_LOCALE.md', '/coffre.odc'])
    assert.equal((await requete('GET', c)).statut, 404, c);
  const b = await requete('GET', '/bureau/index.html');
  assert.match(b.entetes['content-security-policy'], /connect-src 'self'/);
  assert.match(b.entetes['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(b.entetes['x-content-type-options'], 'nosniff');
});

test('API : en-tête dédié obligatoire, Origin obligatoire et identique pour toute écriture', async () => {
  assert.equal((await requete('GET', '/api/statut')).statut, 403);
  assert.equal((await requete('POST', '/api/creer', { corps: { motDePasse: MDP }, entetes: { 'X-ODICOLOR': '1' } })).statut, 403, 'sans Origin');
  assert.equal((await requete('POST', '/api/creer', { corps: { motDePasse: MDP }, entetes: API({ Origin: 'http://127.0.0.1:9999' }) })).statut, 403, 'autre port local');
  assert.equal((await requete('POST', '/api/creer', { corps: { motDePasse: MDP }, entetes: API({ Origin: 'https://site-pirate.example' }) })).statut, 403);
  assert.equal(fs.readdirSync(dossier).length, 0, 'aucun coffre créé par ces tentatives');
});

let session;
test('création : clé de secours rendue une fois, session en cookie HttpOnly SameSite=Strict, pas de seconde création', async () => {
  const r = await requete('POST', '/api/creer', { corps: { motDePasse: MDP }, entetes: API() });
  assert.equal(r.statut, 201);
  assert.match(r.json.cleSecours, /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  assert.match(r.entetes['set-cookie'][0], /HttpOnly; SameSite=Strict; Path=\//);
  session = cookieDe(r);
  assert.equal((await requete('POST', '/api/creer', { corps: { motDePasse: MDP }, entetes: API() })).statut, 409);
});

test('état : illisible sans session, enregistré et relu avec la session', async () => {
  assert.equal((await requete('GET', '/api/etat', { entetes: API() })).statut, 401);
  assert.equal((await requete('GET', '/api/etat', { entetes: API({ Cookie: 'odicolor_session=faux' }) })).statut, 401);
  const etat = { version: 1, telephone: { clients: [{ id: 1, nom: 'GARAGE FICTIF ALPHA' }] }, garagesTelephone: [{ id: 1, nom: 'GARAGE FICTIF ALPHA' }], ebp: { arrete: '2026-11-06' } };
  const w = await requete('PUT', '/api/etat', { corps: etat, entetes: API({ Cookie: session }) });
  assert.equal(w.statut, 200);
  const r = await requete('GET', '/api/etat', { entetes: API({ Cookie: session }) });
  assert.deepEqual(r.json.etat, etat);
  assert.equal((await requete('PUT', '/api/etat', { corps: { version: 3 }, entetes: API({ Cookie: session }) })).statut, 400);
  assert.equal((await requete('PUT', '/api/etat', { corps: '{abîmé', entetes: API({ Cookie: session }) })).statut, 400);
});

test('verrouillage : la session tombe, les données ne sont plus lisibles', async () => {
  assert.equal((await requete('POST', '/api/verrouiller', { corps: {}, entetes: API({ Cookie: session }) })).statut, 200);
  assert.equal((await requete('GET', '/api/etat', { entetes: API({ Cookie: session }) })).statut, 401);
  assert.equal((await requete('GET', '/api/statut', { entetes: API({ Cookie: session }) })).json.session, false);
});

test('mauvais mot de passe : refus neutre, puis attente imposée après 3 échecs', async () => {
  for (let i = 0; i < 3; i++) {
    const r = await requete('POST', '/api/deverrouiller', { corps: { motDePasse: 'Mauvais-mot-de-passe-' + i }, entetes: API() });
    assert.equal(r.statut, 401); assert.doesNotMatch(r.texte, /GARAGE/);
  }
  const bloque = await requete('POST', '/api/deverrouiller', { corps: { motDePasse: MDP }, entetes: API() });
  assert.equal(bloque.statut, 429, 'même le bon mot de passe attend : impossible d’essayer en rafale');
});

test('aucun mot de passe dans le journal, les fichiers du coffre ou les réponses', async () => {
  const tout = journal.join('\n') + fs.readdirSync(dossier).map(f => fs.readFileSync(path.join(dossier, f), 'utf8')).join('\n');
  for (const s of [MDP, 'Mauvais-mot-de-passe', 'GARAGE FICTIF']) assert.ok(!tout.includes(s), s);
  assert.ok(journal.some(l => / POST \/api\/deverrouiller 401$/.test(l)), 'le journal garde la trace des refus, sans détail');
});
