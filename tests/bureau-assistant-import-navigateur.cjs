'use strict';
// Lot 7 : assistant d'import EBP pas à pas. Exports EBP FICTIFS, Internet coupé. Exécution : node tests/bureau-assistant-import-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const { chromium } = require('playwright');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'bureau', 'index.html');
let nav, dossier;
before(async () => {
  nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-assistant-'));
  fs.writeFileSync(path.join(dossier, 'clients.csv'), 'Code client;Nom;Ville;Code postal\nC1;GARAGE FICTIF UN;Massy;91300\n');
  fs.writeFileSync(path.join(dossier, 'pieces.csv'), ['Type;N° pièce;Date;Code client;Client;Montant HT', 'Facture;FA-O;15/10/2026;C1;GARAGE FICTIF UN;3 000,00', 'Facture;FA-N;05/11/2026;C1;GARAGE FICTIF UN;4 000,00', 'Facture;FA-X;hier;C1;GARAGE FICTIF UN;1,00'].join('\n'));
  fs.writeFileSync(path.join(dossier, 'reglements.csv'), 'N° facture;Échéance;Date de règlement;Montant TTC\nFA-N;05/12/2026;;4 800,00\n');
});
after(async () => { await nav?.close(); fs.rmSync(dossier, { recursive: true, force: true }); });

test('assistant : 5 étapes, période déclarée, lignes écartées et colonnes absentes expliquées, fichier rechargé détecté, mois précédent comparable', async () => {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  const txt = s => p.textContent(s).then(x => x.replace(/\s+/g, ' ').trim());
  const deposer = async (type, f) => { await p.setInputFiles('[data-assistant="fichier-' + type + '"]', path.join(dossier, f)); await p.waitForSelector('[data-assistant="bilan-' + type + '"] .badge'); };
  try {
    await p.clock.setFixedTime(new Date('2026-11-14T10:00:00'));
    await p.goto(PAGE + '#bureau'); await p.click('[data-assistant="ouvrir"]'); await p.waitForSelector('[data-assistant="etape-arrete"]');
    assert.match(await txt('.assistant .titre-bloc'), /étape 1 sur 5/);
    await p.fill('[data-assistant="arrete"]', '2026-11-14'); await p.dispatchEvent('[data-assistant="arrete"]', 'change');
    await p.click('[data-assistant="suivant"]'); await p.waitForSelector('[data-assistant="etape-clients"]');
    await deposer('clients', 'clients.csv');
    assert.match(await txt('[data-assistant="bilan-clients"]'), /Statut du compte — Sans statut, les comptes bloqués ne sont pas repérés/);
    await p.click('[data-assistant="suivant"]'); await p.waitForSelector('[data-assistant="etape-pieces"]');
    assert.equal(await p.inputValue('[data-assistant="periode-du"]'), '2025-11-01', 'période proposée : 12 mois');
    await deposer('pieces', 'pieces.csv');
    const b = await txt('[data-assistant="bilan-pieces"]');
    assert.match(b, /3 ligne\(s\) lue\(s\), 2 retenue\(s\), 1 écartée\(s\)/); assert.match(b, /1 × Date illisible/);
    assert.match(b, /N° de pièce d’origine — Sans « n° de pièce d’origine », impossible de relier/);
    await deposer('pieces', 'pieces.csv');
    await p.waitForFunction(() => /Fichier déjà chargé, ignoré : pieces\.csv/.test(document.querySelector('[data-assistant="bilan-pieces"]').textContent));
    await p.click('[data-assistant="suivant"]'); await deposer('reglements', 'reglements.csv');
    assert.match(await txt('[data-assistant="bilan-reglements"]'), /Reste à payer — Sans « reste à payer »/);
    await p.click('[data-assistant="suivant"]'); await p.waitForSelector('[data-assistant="bilan-final"]');
    assert.match(await txt('[data-assistant="absentes"]'), /Rien ne manque pour le pilotage/);
    await p.click('text=Voir le pilotage'); await p.waitForSelector('[data-pilotage="precedent"]');
    assert.match(await txt('[data-pilotage="precedent"]'), /^3 000,00 € HT/, 'octobre couvert par la période déclarée : comparaison disponible');
    assert.match(await txt('[data-pilotage="couverture"]'), /Périodes d’export déclarées : du 01\/11\/2025 au 14\/11\/2026/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('sans période déclarée (bouton d’import classique) : comparaison bloquée et invitation à utiliser l’assistant', async () => {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  try {
    await p.clock.setFixedTime(new Date('2026-11-14T10:00:00'));
    await p.goto(PAGE + '#bureau'); await p.waitForSelector('#ebp-pieces', { state: 'attached' });
    await p.setInputFiles('#ebp-pieces', path.join(dossier, 'pieces.csv')); await p.waitForSelector('#ebp-pieces >> xpath=ancestor::label[starts-with(normalize-space(.), "✓")]');
    await p.fill('#ebp-arrete', '2026-11-14'); await p.dispatchEvent('#ebp-arrete', 'change');
    await p.evaluate(() => { location.hash = '#pilotage'; }); await p.waitForSelector('[data-pilotage="precedent"]');
    assert.match(await p.textContent('[data-pilotage="precedent"]'), /Non disponible/, 'pièces d’octobre présentes mais période non déclarée : pas de comparaison');
    assert.match(await p.textContent('[data-pilotage="donnees"]'), /sans période déclarée : passe par l’assistant/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
