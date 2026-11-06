'use strict';
// Lot B — suggestions EBP de l'écran « Vérifier les comptes » (bureau/verifier-comptes.js). DONNÉES FICTIVES.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../bureau/verifier-comptes.js');
const g = { id: 2, nom: 'GARAGE FICTIF DEUX', ville: 'Goussainville', cp: '95190' };
const C = [{ code: 'C10', nom: 'SARL GARAGE FICTIF DEUX', ville: 'Goussainville', cp: '95190' }, { code: 'C11', nom: 'CARROSSERIE DEUX FICTIVE', ville: 'Cergy', cp: '95000' },
  { code: 'C12', nom: 'GARAGE FICTIF TROIS', ville: 'Goussainville', cp: '95190' }, { code: 'C13', nom: 'GARAGE FICTIF DEUX', ville: 'Paris', cp: '75011' }];

test('1. suggestions : formes juridiques et mots génériques ignorés ; même code postal ou ville exigé, sauf nom identique', () => {
  const s = V.suggestions(g, C);
  assert.deepEqual(s.map(x => x.code), ['C13', 'C10'], 'nom identique d’abord, puis mot commun + même code postal');
  assert.match(s[1].pourquoi, /mot\(s\) commun\(s\) : DEUX · même code postal/);
  assert.ok(!s.some(x => x.code === 'C11'), 'mot commun mais ni même code postal ni même ville');
  assert.ok(!s.some(x => x.code === 'C12'), 'seuls des mots génériques en commun');
});
test('2. une suggestion n’est qu’une proposition : aucune n’est marquée choisie ; fiche déjà reliée signalée', () => {
  const s = V.suggestions(g, C, new Map([['C10', 'AUTRE GARAGE']]));
  assert.ok(s.every(x => !('choisie' in x)));
  assert.equal(s.find(x => x.code === 'C10').dejaRelieA, 'AUTRE GARAGE');
  assert.deepEqual(V.suggestions(g, []), []);
});
