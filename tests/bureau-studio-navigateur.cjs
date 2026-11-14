'use strict';
// Lot 4 : écran Studio du Bureau. Contenus FICTIFS, Internet coupé. Exécution : node tests/bureau-studio-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs');
const { chromium } = require('playwright');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'bureau', 'index.html');
let nav;
before(async () => { nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); });
after(async () => { await nav?.close(); });

test('Studio : prix sans source bloqué, validation par un nom, pack téléphone avec le seul contenu validé, Roberlo non proposable', async () => {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('dialog', d => d.accept());
  try {
    await p.clock.setFixedTime(new Date('2026-11-14T10:00:00'));
    await p.goto(PAGE + '#studio'); await p.waitForSelector('[data-studio="titre"]');
    assert.equal(await p.locator('[data-studio="marque"] option[value="roberlo"]').count(), 0, 'Roberlo absente des nouvelles actions');
    assert.deepEqual(await p.$$eval('[data-studio="marque"] option', l => l.map(o => o.textContent)), ['Carsystem', 'Abel Auto', 'Sifa']);
    await p.fill('[data-studio="titre"]', 'Vernis du mois');
    await p.fill('[data-studio="texte"]', 'Bonjour, découvrez notre vernis Carsystem.');
    await p.locator('details', { hasText: 'Conditions commerciales' }).locator('summary').click();
    await p.fill('[data-studio="remise"]', '10 %');
    await p.waitForFunction(() => /sans source des conditions/.test(document.querySelector('[data-studio="bloquants"]').textContent));
    await p.click('[data-studio="valider"]');
    await p.waitForFunction(() => /Validation refusée/.test(document.querySelector('[data-studio="message"]').textContent));
    // Après le refus, la fiche est redessinée avec les conditions ouvertes (une remise est saisie).
    await p.fill('[data-studio="validite"]', 'jusqu’au 31/12/2026');
    await p.fill('[data-studio="source-conditions"]', 'Conditions validées par la direction (fictif)');
    await p.fill('[data-studio="valideur"]', 'Responsable fictif');
    await p.click('[data-studio="valider"]');
    await p.waitForFunction(() => document.querySelector('[data-studio="statut"]').textContent === 'Validé');
    assert.match(await p.innerHTML('[data-studio="apercu"]'), /<svg|Remise : 10 %/);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-studio="pack"]')]);
    const pack = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    assert.equal(pack.appli, 'odicolor-contenus'); assert.equal(pack.contenus.length, 1);
    assert.match(pack.contenus[0].texte, /Remise : 10 % · Valable : jusqu’au 31\/12\/2026/); assert.equal(pack.contenus[0].validePar, 'Responsable fictif');
    // Modifier un contenu validé le remet « à vérifier » : il ne part plus vers le téléphone.
    await p.fill('[data-studio="texte"]', 'Bonjour, texte modifié.');
    await p.waitForFunction(() => document.querySelector('[data-studio="statut"]').textContent === 'À vérifier');
    await p.click('[data-studio="enregistrer"]');
    const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('[data-studio="pack"]')]);
    assert.equal(JSON.parse(fs.readFileSync(await dl2.path(), 'utf8')).contenus.length, 0);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('Studio : un scénario est affiché comme scénario, jamais comme une vidéo', async () => {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  try {
    await p.goto(PAGE + '#studio'); await p.waitForSelector('[data-studio="type"]');
    await p.selectOption('[data-studio="type"]', 'scenario');
    await p.locator('details', { hasText: 'Image (visuel)' }).locator('summary').click();
    await p.fill('[data-studio="plans"]', '5 | Atelier, pistolet | Vernis Carsystem\n4 | Logo | ODICOLOR');
    await p.waitForFunction(() => /^Scénario de vidéo — aucune vidéo générée/.test(document.querySelector('[data-studio="apercu"]').textContent));
    assert.match(await p.textContent('[data-studio="apercu"]'), /Durée totale : 9 s/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
