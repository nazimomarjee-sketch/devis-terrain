'use strict';
// Bureau ODICOLOR — essai automatique dans un vrai navigateur (Chromium via Playwright).
// Exécution : node tests/bureau-navigateur.cjs
// (Pas nommé *.test.cjs : nécessite Playwright, absent de la vérification GitHub actuelle.)
// Internet est coupé pendant l'essai : toute requête sortante est bloquée et enregistrée.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const PAGE = 'file://' + join(__dirname, '..', 'bureau', 'index.html');

// Sauvegarde téléphone fictive (format V47) : 3 garages inventés, dont un nom repérable.
function fichierSauvegarde() {
  const dossier = mkdtempSync(join(tmpdir(), 'bureau-essai-'));
  const chemin = join(dossier, 'sauvegarde-fictive.json');
  writeFileSync(chemin, JSON.stringify({ appli: 'devis-terrain', version: 1, date: '2026-11-01T10:00:00.000Z', reglages: {}, devis: [],
    clients: [
      { nom: 'GARAGE-TEMOIN-CONFIDENTIEL', ville: 'Massy', cp: '91300', statut: 'client', tel: '0100000000' },
      { nom: 'Garage fictif B', ville: 'Palaiseau', cp: '91120', statut: 'prospect' },
      { nom: 'Garage fictif C', ville: 'Saclay', cp: '91190', statut: 'prospect' }
    ] }));
  return chemin;
}

async function ouvrir(navigateur, options = {}) {
  const contexte = await navigateur.newContext(options);
  const page = await contexte.newPage();
  const erreurs = [], sorties = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await contexte.route(/^https?:/, route => { sorties.push(route.request().url()); route.abort(); });
  await page.goto(PAGE);
  await page.waitForSelector('#kpis .kpi');
  return { contexte, page, erreurs, sorties };
}

test('Bureau dans le navigateur', async (t) => {
  const navigateur = await chromium.launch();
  try {
    await t.test('Ville : s’ouvre en mode DÉMO, sans erreur, chiffres marqués Démo', async () => {
      const { contexte, page, erreurs } = await ouvrir(navigateur);
      assert.equal(await page.title(), 'Ville ODICOLOR');
      assert.equal((await page.textContent('#mode')).trim(), 'Démo');
      assert.equal(await page.locator('#kpis .kpi').count(), 6);
      assert.ok(await page.locator('#kpis .badge.b-demo').count() >= 4, 'les chiffres de démo portent le badge Démo');
      assert.ok(await page.locator('svg[aria-label^="Ville ODICOLOR"]').count() === 1, 'la maquette de la Ville est dessinée');
      assert.deepEqual(erreurs, []);
      await contexte.close();
    });

    await t.test('Carte, Simulation, À classer : chaque écran s’affiche sans erreur', async () => {
      const { contexte, page, erreurs } = await ouvrir(navigateur);
      await page.evaluate(() => { location.hash = 'carte-91'; });
      await page.waitForSelector('text=La bibliothèque de carte n’a pas pu se charger');
      await page.evaluate(() => { location.hash = 'simulation'; });
      await page.waitForSelector('.bandeau-sim');
      assert.ok(await page.locator('#kpis').isHidden(), 'pas de chiffres réels affichés dans la simulation');
      await page.evaluate(() => { location.hash = 'a-classer'; });
      await page.waitForTimeout(200);
      await page.evaluate(() => { location.hash = ''; });
      await page.waitForSelector('svg[aria-label^="Ville ODICOLOR"]');
      assert.deepEqual(erreurs, []);
      await contexte.close();
    });

    await t.test('Import d’une sauvegarde téléphone : mode réel, aucun montant inventé, rien n’est envoyé', async () => {
      const { contexte, page, erreurs, sorties } = await ouvrir(navigateur);
      const avant = sorties.length;
      await page.click('#mode');
      await page.setInputFiles('#fichier-sauvegarde', fichierSauvegarde());
      await page.waitForFunction(() => document.querySelector('#mode').textContent.trim() !== 'Démo');
      const kpis = await page.textContent('#kpis');
      assert.match(kpis, /Non renseigné/, 'CA absent de la sauvegarde = « Non renseigné »');
      assert.doesNotMatch(kpis, /Démo/i);
      assert.match(kpis, /Saisi terrain/, 'les chiffres importés sont marqués « Saisi terrain »');
      assert.match(await page.textContent('body'), /garages classés/, 'le rapport d’import est affiché');
      const nouvelles = sorties.slice(avant);
      assert.deepEqual(nouvelles.filter(u => /TEMOIN|Massy|0100000000/i.test(decodeURIComponent(u))), [], 'aucune donnée de garage dans une requête');
      assert.deepEqual(nouvelles, [], 'aucune requête réseau pendant l’import');
      const stockage = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
      assert.doesNotMatch(stockage, /TEMOIN/, 'la sauvegarde n’est pas recopiée dans le navigateur');
      assert.deepEqual(erreurs, []);
      await contexte.close();
    });

    await t.test('Import d’un fichier invalide : refus clair, la démo reste affichée', async () => {
      const { contexte, page, erreurs } = await ouvrir(navigateur);
      const dossier = mkdtempSync(join(tmpdir(), 'bureau-essai-'));
      writeFileSync(join(dossier, 'faux.json'), '{"clients":[]}');
      await page.click('#mode');
      await page.setInputFiles('#fichier-sauvegarde', join(dossier, 'faux.json'));
      await page.waitForSelector('text=ne vient pas de l’appli téléphone');
      assert.equal((await page.textContent('#mode')).trim(), 'Démo');
      assert.deepEqual(erreurs, []);
      await contexte.close();
    });

    const FIXTURES = join(__dirname, 'fixtures', 'bureau');
    const garagesAffiches = page => page.evaluate(() => document.querySelector('#kpis').textContent);

    await t.test('Import .odicolor du téléphone : intégrité vérifiée, garages affichés, rien n’est envoyé', async () => {
      const { contexte, page, erreurs, sorties } = await ouvrir(navigateur);
      const avant = sorties.length;
      await page.click('#mode');
      assert.equal(await page.getAttribute('#fichier-sauvegarde', 'accept'), '.odicolor,.json', 'même filtre que le téléphone (validé sur Samsung)');
      await page.setInputFiles('#fichier-sauvegarde', join(FIXTURES, 'telephone-jeu-samsung.odicolor'));
      await page.waitForSelector('text=intégrité OK');
      const texte = await page.textContent('#donnees');
      assert.match(texte, /3 garages, 12 devis, 3 photos, 2 PDF/);
      assert.match(texte, /Lecture seule/);
      assert.equal((await page.textContent('#mode')).trim(), 'Mes garages');
      assert.deepEqual(sorties.slice(avant), [], 'aucune requête réseau');
      assert.deepEqual(erreurs, []);
      await contexte.close();
    });

    await t.test('Fichier abîmé après un bon import : refusé, les garages chargés restent affichés', async () => {
      const { contexte, page, erreurs } = await ouvrir(navigateur);
      await page.click('#mode');
      await page.setInputFiles('#fichier-sauvegarde', join(FIXTURES, 'telephone-idf.odicolor'));
      await page.waitForSelector('text=intégrité OK');
      const avant = await garagesAffiches(page);
      const abime = readFileSync(join(FIXTURES, 'telephone-idf.odicolor')); abime[abime.length - 5] ^= 1;
      await page.setInputFiles('#fichier-sauvegarde', { name: 'abime.odicolor', mimeType: 'application/octet-stream', buffer: abime });
      await page.waitForSelector('text=Fichier refusé');
      assert.match(await page.textContent('#donnees'), /corrompue.*Les garages déjà chargés restent affichés/);
      assert.equal(await garagesAffiches(page), avant, 'aucune perte : même affichage qu’avant le mauvais fichier');
      assert.equal((await page.textContent('#mode')).trim(), 'Mes garages');
      // Le même bon fichier peut être rechargé (le champ est remis à zéro après chaque choix).
      await page.setInputFiles('#fichier-sauvegarde', join(FIXTURES, 'telephone-idf.odicolor'));
      await page.waitForSelector('text=intégrité OK');
      assert.deepEqual(erreurs, []);
      await contexte.close();
    });

    await t.test('Ancienne sauvegarde V47 (.json) : toujours acceptée, avec rappel du format complet', async () => {
      const { contexte, page, erreurs } = await ouvrir(navigateur);
      await page.click('#mode');
      await page.setInputFiles('#fichier-sauvegarde', join(FIXTURES, 'telephone-v47.json'));
      await page.waitForSelector('text=Ancienne sauvegarde V47');
      assert.match(await page.textContent('#donnees'), /préfère la sauvegarde complète \.odicolor/);
      assert.deepEqual(erreurs, []);
      await contexte.close();
    });

    await t.test('Samsung (largeur téléphone) : pas de défilement horizontal de la page', async () => {
      const { contexte, page, erreurs } = await ouvrir(navigateur, { viewport: { width: 384, height: 832 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      for (const h of ['', 'simulation', 'carte-91']) {
        await page.evaluate(x => { location.hash = x; }, h);
        await page.waitForTimeout(250);
        const [large, ecran] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        assert.ok(large <= ecran + 1, `écran « ${h || 'ville'} » : ${large}px pour ${ecran}px`);
      }
      assert.deepEqual(erreurs, []);
      await contexte.close();
    });
  } finally {
    await navigateur.close();
  }
});
