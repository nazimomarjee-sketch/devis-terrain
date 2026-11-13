'use strict';
// Lot 1 (13/11/2026) : date d'export proposée d'après le fichier, jamais « aujourd'hui » en silence ; provenance de chaque import.
// DONNÉES FICTIVES, Internet coupé. Exécution : node tests/bureau-provenance-navigateur.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'bureau', 'index.html');
let nav;
before(async () => { nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); });
after(async () => { await nav?.close(); });
const CSV = 'Type;N° pièce;Date;Code client;Client;Montant HT\nFacture;FA-P1;15/10/2026;C1;GARAGE FICTIF P;100,00\n';

async function ouvrir() {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage(), erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-06T10:00:00'));
  await p.goto(PAGE + '#bureau'); await p.waitForSelector('#ebp-arrete', { state: 'attached' });
  return { ctx, p, erreurs };
}
// Le fichier est déposé dans le VRAI champ d'import (comme un utilisateur), avec une date de fichier choisie.
async function charger(p, csv, dateFichier) {
  const n = await p.evaluate(() => document.querySelectorAll('.provenance').length);
  await p.evaluate(([csv, d]) => { const i = document.querySelector('#ebp-pieces'), t = new DataTransfer();
    t.items.add(new File([csv], 'pieces-fictives.csv', { type: 'text/csv', lastModified: new Date(d).getTime() })); i.files = t.files; i.dispatchEvent(new Event('change', { bubbles: true })); }, [csv, dateFichier]);
  await p.waitForFunction(([n, d]) => document.querySelectorAll('.provenance').length > n || document.body.textContent.includes(d), [n, new Date(dateFichier).toLocaleDateString('fr-FR')]);
}
const texte = p => p.innerText('body').then(t => t.replace(/\s+/g, ' ')); // texte VISIBLE (pas le code source de la page)

test('date d’export : proposée d’après la date du fichier (pas aujourd’hui), signalée « à confirmer », puis confirmée par la saisie', async () => {
  const { ctx, p, erreurs } = await ouvrir();
  try {
    await charger(p, CSV, '2026-10-20T08:00:00');
    assert.equal(await p.inputValue('#ebp-arrete'), '2026-10-20', 'export du 20/10 : jamais présenté comme du 06/11');
    assert.match(await texte(p), /proposée d’après la date du fichier : à confirmer/);
    assert.match(await p.textContent('.provenance'), /Provenance : pieces-fictives\.csv · 0 Ko · fichier du 20\/10\/2026 · importé le .* · empreinte [0-9a-f]{12}/);
    await p.fill('#ebp-arrete', '2026-10-21'); await p.dispatchEvent('#ebp-arrete', 'change');
    assert.doesNotMatch(await texte(p), /proposée d’après la date du fichier/);
    await charger(p, CSV, '2026-10-01T08:00:00');
    assert.equal(await p.inputValue('#ebp-arrete'), '2026-10-21', 'une date confirmée n’est jamais remplacée par la proposition');
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('date d’export : un fichier « du futur » est ramené à aujourd’hui ; une pièce postérieure à la date d’export est signalée', async () => {
  const { ctx, p, erreurs } = await ouvrir();
  try {
    await charger(p, CSV, '2026-12-01T08:00:00');
    assert.equal(await p.inputValue('#ebp-arrete'), '2026-11-06');
    await p.fill('#ebp-arrete', '2026-10-10'); await p.dispatchEvent('#ebp-arrete', 'change');
    assert.match(await texte(p), /Une pièce est datée du 15\/10\/2026, après la date d’export : la date d’export est fausse/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});

test('encaissements : bloc TTC affiché depuis l’échéancier, distinct du CA HT ; règlement daté sans montant « à vérifier »', async () => {
  const { ctx, p, erreurs } = await ouvrir();
  try {
    const csv = 'N° facture;Date d\'échéance;Date de règlement;Montant TTC\nFA-1;31/10/2026;03/11/2026;500,00\nFA-2;31/10/2026;;250,00\n';
    await p.evaluate(([csv]) => { const i = document.querySelector('#ebp-reglements'), t = new DataTransfer();
      t.items.add(new File([csv], 'reglements-fictifs.csv', { type: 'text/csv', lastModified: new Date('2026-11-05T08:00:00').getTime() })); i.files = t.files; i.dispatchEvent(new Event('change', { bubbles: true })); }, [csv]);
    await p.waitForSelector('#bloc-encaissements');
    const t = s => p.textContent(s).then(x => x.replace(/\s+/g, ' ').trim());
    assert.match(await t('[data-enc="encaisse"]'), /0,00 € TTC · à vérifier/);
    assert.match(await t('[data-enc="creances"]'), /250,00 € TTC · à vérifier/);
    assert.match(await t('[data-enc="bloques"]'), /Non renseigné/);
    assert.match(await t('#bloc-encaissements'), /ne pas comparer au CA facturé HT/);
    assert.deepEqual(erreurs, []);
  } finally { await ctx.close(); }
});
