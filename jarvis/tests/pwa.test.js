// PWA / interface Samsung testée dans un VRAI Chromium (viewport 360×780, tactile) : installabilité (critères vérifiables), service worker,
// absence de mise en cache des données, mode hors ligne, XSS, cibles tactiles. L'installation sur un vrai Samsung reste l'essai S1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { environnement, RACINE, DEMANDE_TYPE, traiter } from './aide.js';
import { creerServeur } from '../src/serveur.js';

let chromium = null; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* sauté */ }
const U = 'jeton-utilisateur-0123456789-abcdef'; const A = 'jeton-administrateur-0123456789-abcdef';
const png = (f) => { const b = readFileSync(join(RACINE, 'public', f)); return { ok: b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), l: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

test('manifeste et icônes : champs d’installabilité présents, PNG réels aux bonnes dimensions', () => {
  const m = JSON.parse(readFileSync(join(RACINE, 'public', 'manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.short_name && m.start_url && m.scope); assert.equal(m.display, 'standalone'); assert.match(m.theme_color, /^#/);
  for (const [f, t] of [['icone-192.png', 192], ['icone-512.png', 512], ['icone-maskable-512.png', 512]]) { const p = png(f); assert.ok(p.ok, `${f} n’est pas un PNG`); assert.deepEqual([p.l, p.h], [t, t]); assert.ok(m.icons.some((i) => i.src === f)); }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('service worker : jamais d’API en cache (données confidentielles) — vérifié sur le code', () => {
  const sw = readFileSync(join(RACINE, 'public', 'sw.js'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'); // hors commentaires
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)\) return/); assert.ok(!/\/api\//.test(sw.replace(/pathname\.startsWith\('\/api\/'\)/, '')), 'aucune autre mention de /api/ dans le service worker');
});

test('NAVIGATEUR RÉEL : service worker actif, coquille en cache, AUCUNE donnée en cache, hors ligne explicite, retour en ligne, XSS inopérant, cibles tactiles', { skip: chromium ? false : 'SAUTÉ : Playwright indisponible' }, async () => {
  const e = environnement(); const serveur = creerServeur({ jarvis: e.jarvis, jeton: U, jetonAdmin: A, dossierPublic: join(RACINE, 'public') });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok)); const port = serveur.address().port; const base = `http://127.0.0.1:${port}`;
  let nav;
  try {
    nav = await chromium.launch(); const ctx = await nav.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('jarvis_jeton', t); } catch { /* */ } }, U);
    const p = await ctx.newPage(); const erreurs = []; const dialogues = []; p.on('pageerror', (x) => erreurs.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) erreurs.push(m.text()); }); p.on('dialog', (d) => { dialogues.push(d.message()); d.dismiss(); });
    await traiter(e, DEMANDE_TYPE); // une validation en attente
    // XSS : une demande contenant du HTML doit s'afficher comme TEXTE
    e.jarvis.deposerParUtilisateur('<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> obscur'); await e.jarvis.executerJusquaVide();
    await p.goto(`${base}/`); await p.waitForSelector('#carte-prochaine .carte');
    assert.equal(await p.evaluate(() => window.__xss), undefined, 'XSS exécuté !'); assert.equal(await p.locator('img[src="x"]').count(), 0); assert.match(await p.textContent('#resultats'), /<img src=x/);
    // Service worker
    await p.waitForFunction(() => navigator.serviceWorker.ready.then(() => true)); await p.reload(); await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    const caches = await p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname); return out; });
    const urls = Object.values(caches).flat(); assert.ok(urls.includes('/app.js') && urls.some((u) => u === '/' || u === '/index.html')); assert.ok(!urls.some((u) => u.startsWith('/api/')), `API en cache : ${urls.filter((u) => u.startsWith('/api/'))}`);
    const stockage = await p.evaluate(() => JSON.stringify({ ...localStorage })); assert.ok(!/Martin|M-2026/.test(stockage), 'aucune donnée métier dans le stockage local');
    // Mise en page tactile
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    const petits = await p.evaluate(() => [...document.querySelectorAll('button:not(.petit):not(.puce)')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.id || b.textContent.slice(0, 20))); assert.deepEqual(petits, [], `cibles tactiles < 44 px : ${petits}`);
    const urgence = await p.evaluate(() => { const r = document.getElementById('arret').getBoundingClientRect(); return r.bottom <= innerHeight && r.height >= 44; }); assert.equal(urgence, true);
    // Hors ligne : la coquille s'ouvre depuis le cache, le dit clairement, et ne montre AUCUNE donnée
    await ctx.setOffline(true); await p.reload(); await p.waitForSelector('#hors-ligne:not([hidden])');
    assert.match(await p.textContent('#hors-ligne'), /HORS LIGNE.*arrêt d’urgence n’est PAS disponible/); assert.equal(await p.locator('#arret').isDisabled(), true);
    assert.ok(!/Garage Martin/.test(await p.textContent('body')), 'aucune donnée affichée hors ligne');
    // Retour en ligne : l'interface se reconnecte et recharge les données
    await ctx.setOffline(false); await p.waitForSelector('#hors-ligne', { state: 'hidden' }); await p.waitForSelector('#carte-prochaine .carte', { timeout: 15000 }); assert.equal(await p.locator('#arret').isDisabled(), false);
    // Détail d'une décision : ouverture, fermeture clavier
    await p.click('#carte-prochaine button:has-text("Détail")'); await p.waitForSelector('#detail[open]'); await p.keyboard.press('Escape'); assert.equal(await p.locator('#detail[open]').count(), 0);
    assert.deepEqual(dialogues, [], `dialogues inattendus : ${dialogues}`); assert.deepEqual(erreurs, [], `erreurs console : ${erreurs}`);
  } finally { await nav?.close(); serveur.close(); e.nettoyer(); }
});

test('en-têtes : manifeste servi avec le bon type, jamais mis en cache HTTP par le serveur, icônes accessibles sans jeton', async () => {
  const e = environnement(); const serveur = creerServeur({ jarvis: e.jarvis, jeton: U, jetonAdmin: A, dossierPublic: join(RACINE, 'public') });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok)); const base = `http://127.0.0.1:${serveur.address().port}`;
  try {
    const m = await fetch(`${base}/manifest.webmanifest`); assert.equal(m.status, 200); assert.match(m.headers.get('content-type'), /application\/manifest\+json/); assert.equal(m.headers.get('cache-control'), 'no-store');
    const i = await fetch(`${base}/icone-192.png`); assert.equal(i.status, 200); assert.equal(i.headers.get('content-type'), 'image/png'); assert.equal((await fetch(`${base}/sw.js`)).status, 200);
    assert.equal((await fetch(`${base}/api/etat`)).status, 401);
  } finally { serveur.close(); e.nettoyer(); }
});
