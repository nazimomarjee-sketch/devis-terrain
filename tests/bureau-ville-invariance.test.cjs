'use strict';
// Ville LEGO — garde-fou du graphisme (règle du propriétaire, 06/11/2026).
// Les fonctions de dessin, les personnages, les animations et les styles doivent rester IDENTIQUES à la version
// récupérée du 31/10/2026. Toute modification fait échouer ce test : elle exige l'accord préalable du propriétaire,
// puis la mise à jour volontaire des empreintes ci-dessous, avec la décision correspondante.
// Exception approuvée (07/11/2026) : la ligne de l'étiquette des villes (retouche P2) et la règle CSS mobile des onglets.
// Exécution : node --test tests/bureau-ville-invariance.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

const page = readFileSync(join(__dirname, '..', 'bureau', 'index.html'), 'utf8');
const h = t => createHash('sha256').update(t).digest('hex');
const fonction = n => { const i = page.indexOf('function ' + n + '('); assert.ok(i > 0, n + ' absente'); return page.slice(i, page.indexOf('\n}\n', i) + 2); };
const ligne = debut => { const l = page.split('\n').find(x => x.startsWith(debut)); assert.ok(l, debut + ' absente'); return l; };

const ORIGINE = {
  figurine: '4cb6ea8c6ab7a6f43a966957e7ad5192e742c55f1dd44114459a79eee3f629d5',
  persoVille: 'e482a968511761b3dfc27da82cb60ae47fad2dc418158d18f789543f9725d6ab',
  volume: '0c0131599e70897d5a3cf205a7f30a9c7e65fe8b187c1241e63080a2f85610a8',
  portrait: 'ffef7eaed42e891c0467548793ddfdccf2c0066e4b52912d58798f9937d7d6da',
  carteLabel: '606147324fe60dab0b85cc5a087009ad003f0f12ab7d0111d131238485345a4d',
  choixGarages: '18735961bc48644c9eac2385dcf5c50e3754901975e07a763ce1c285f1695d1f',
  vueCarte: 'b00110de9c970b6cbc002f3fedde10302ad6b1d1223ffd4d65e8dddb967d1538',
  vueSimulation: 'bfa91ef9f128bf25f04ea7ebfb8ba6718686d3e31f493baac2c34fca1a819abd'
};

test('dessin des bâtiments, personnages, fiches de choix, carte et simulation : identiques à l’origine', () => {
  for (const [n, empreinte] of Object.entries(ORIGINE)) assert.equal(h(fonction(n)), empreinte, n + ' a été modifiée');
  assert.equal(h(ligne('const vueVille =')), '865518d37db8f781d3372df46499e41b1812a871054d57480d6c75f2b16d9692', 'vueVille a été modifiée');
});

test('scène de la Ville : identique, hormis la ligne d’étiquette des villes (P2 approuvée)', () => {
  const sansEtiquette = fonction('dessinerVille').split('\n').filter(l => !l.includes('const ligne2 =')).join('\n');
  assert.equal(h(sansEtiquette), '2820866cceda145e434afb59085206b30393b1a1e0287d66491ef8df1f132d77');
});

test('styles (couleurs, animations, mise en page) : identiques, hormis la règle mobile des onglets approuvée', () => {
  const debut = page.indexOf('<style>\n/* Concept'), css = page.slice(debut, page.indexOf('</style>', debut));
  const sansMobile = css.split('\n').filter(l => !l.startsWith('@media (max-width:480px){.onglet svg{display:none}')).join('\n');
  assert.equal(h(sansMobile), '7db9792c647299c6c987c3dc2f274533798e91e60d2d480ba5aaabe591996978');
  for (const anim of ['@keyframes balance', '@keyframes rouler', '@keyframes clignote']) assert.ok(css.includes(anim), anim);
});
