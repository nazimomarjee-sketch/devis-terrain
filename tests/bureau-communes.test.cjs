'use strict';
// Bureau ODICOLOR — intégrité de la liste officielle des communes d'Île-de-France.
// Exécution : node --test tests/bureau-communes.test.cjs
// Contrôle complet facultatif contre la source officielle :
//   npm pack @etalab/decoupage-administratif@6.0.0 && tar xzf etalab-*.tgz
//   ETALAB_PACKAGE=./package node --test tests/bureau-communes.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const C = require('../bureau/communes-idf.js');
const G = require('../bureau/outils/generer-communes.cjs');

const DEPS = ['75', '77', '78', '91', '92', '93', '94', '95'];

test('1 287 lignes : 1 266 communes actuelles + 21 anciennes communes rattachées', () => {
  assert.equal(C.length, 1287);
  assert.equal(C.filter(r => !r[4]).length, 1266);
  assert.equal(C.filter(r => r[4]).length, 21);
});

test('chaque ligne est complète et cohérente avec son département', () => {
  for (const [nom, dep, cps, insee] of C) {
    assert.ok(nom, 'nom vide');
    assert.ok(DEPS.includes(dep), nom + ' : département ' + dep);
    assert.match(insee, /^\d{5}$/, nom);
    // Un code postal peut déborder sur un département voisin (ex. Paray-Vieille-Poste 91 : 94390, zone d'Orly).
    assert.ok(cps.split(' ').every(cp => /^\d{5}$/.test(cp) && DEPS.includes(cp.slice(0, 2))), nom + ' : codes postaux ' + cps);
    assert.ok(cps.split(' ').some(cp => cp.slice(0, 2) === dep), nom + ' : aucun code postal dans son département');
  }
});

test('codes INSEE des communes actuelles uniques', () => {
  const codes = C.filter(r => !r[4]).map(r => r[3]);
  assert.equal(new Set(codes).size, codes.length);
});

test('une ancienne commune pointe vers une commune actuelle existante', () => {
  const actuelles = new Map(C.filter(r => !r[4]).map(r => [r[3], r[0]]));
  for (const [nom, , , insee, parent] of C.filter(r => r[4])) assert.equal(actuelles.get(insee), parent, nom);
});

test('Essonne : 196 lignes, repères connus présents', () => {
  const ess = C.filter(r => r[1] === '91');
  assert.equal(ess.length, 196);
  const massy = ess.find(r => r[0] === 'Massy');
  assert.deepEqual(massy, ['Massy', '91', '91300', '91377', '']);
});

test('l’outil de génération reproduit le format exact sur un échantillon', () => {
  const echantillon = [
    { code: '91377', nom: 'Massy', departement: '91', type: 'commune-actuelle', codesPostaux: ['91300'] },
    { code: '77316', nom: 'Moret-Loing-et-Orvanne', departement: '77', type: 'commune-actuelle', codesPostaux: ['77250'] },
    { code: '77166', nom: 'Écuelles', departement: '77', type: 'commune-deleguee', chefLieu: '77316' },
    { code: '28085', nom: 'Chartres', departement: '28', type: 'commune-actuelle', codesPostaux: ['28000'] },
    { code: '75101', nom: 'Paris 1er Arrondissement', departement: '75', type: 'arrondissement-municipal', codesPostaux: ['75001'] }
  ];
  const lignes = G.construire(echantillon);
  assert.deepEqual(lignes, [
    ['Écuelles', '77', '77250', '77316', 'Moret-Loing-et-Orvanne'],
    ['Massy', '91', '91300', '91377', ''],
    ['Moret-Loing-et-Orvanne', '77', '77250', '77316', '']
  ]);
  const js = G.ecrire(lignes);
  const charge = new Function('self', 'module', js + ';return self.COMMUNES_IDF;')({}, undefined);
  assert.deepEqual(charge, lignes);
});

test('reproduction complète depuis la source officielle (si ETALAB_PACKAGE est fourni)', { skip: !process.env.ETALAB_PACKAGE && 'ETALAB_PACKAGE absent' }, () => {
  const communes = JSON.parse(readFileSync(join(process.env.ETALAB_PACKAGE, 'data', 'communes.json'), 'utf8'));
  const attendu = readFileSync(join(__dirname, '..', 'bureau', 'communes-idf.js'), 'utf8');
  assert.equal(G.ecrire(G.construire(communes)), attendu);
});
