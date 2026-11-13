'use strict';
// Lot 2 : ordre de tournée. Centres de communes publics (communes-centres.js), garages FICTIFS. node --test tests/bureau-tournee.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../bureau/tournee.js');
const centres = require('../communes-centres.js');

const G = (id, insee, rdv) => ({ id, nom: 'GARAGE FICTIF ' + id, insee, rdv });
// Massy 91377, Les Ulis 91692, Orsay 91471, Évry 91228 (Évry-Courcouronnes), Palaiseau 91477 (départ).
const code = nom => centres.find(c => c[1] === nom)[0];

test('ordre : chaque garage une fois, départ et retour à Palaiseau, distance estimée annoncée comme hypothèse', () => {
  const r = T.ordonner({ centres, etapes: [G('E', code('Évry-Courcouronnes')), G('M', code('Massy')), G('U', code('Les Ulis')), G('O', code('Orsay')), G('M', code('Massy'))] });
  assert.deepEqual(r.ordre.map(x => x.id).sort(), ['E', 'M', 'O', 'U']);
  assert.deepEqual(r.doublons, ['M']);
  assert.equal(r.depart, 'Palaiseau'); assert.ok(r.kmEstimes > 0); assert.match(r.hypothese, /pas un itinéraire routier/);
  // Optimalité vérifiée par énumération exhaustive (4! = 24 ordres) sur ce petit jeu.
  const dep = centres.find(c => c[0] === '91477'), P = c => ({ lat: c[2], lon: c[3] }), pos = id => P(centres.find(c => c[0] === r.ordre.find(x => x.id === id).insee));
  const long = ord => { const l = [P(dep), ...ord.map(pos), P(dep)]; let k = 0; for (let i = 1; i < l.length; i++) k += T.km(l[i - 1], l[i]); return k; };
  const perms = a => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(q => [x, ...q]));
  const meilleur = Math.min(...perms(['E', 'M', 'O', 'U']).map(long));
  assert.ok(Math.abs(long(r.ordre.map(x => x.id)) - meilleur) < 1e-6, 'tournée optimale sur ce jeu');
});

test('la tournée calculée n’est jamais plus longue que l’ordre de saisie (sur ce jeu)', () => {
  const etapes = [G('U', code('Les Ulis')), G('E', code('Évry-Courcouronnes')), G('O', code('Orsay')), G('M', code('Massy'))];
  const r = T.ordonner({ centres, etapes });
  const dep = centres.find(c => c[0] === '91477'), P = c => ({ lat: c[2], lon: c[3] });
  const saisie = [dep, ...etapes.map(e => centres.find(c => c[0] === e.insee)), dep].map(P);
  let ks = 0; for (let i = 1; i < saisie.length; i++) ks += T.km(saisie[i - 1], saisie[i]);
  assert.ok(r.kmEstimes <= Math.round(ks), r.kmEstimes + ' ≤ ' + Math.round(ks));
});

test('rendez-vous : jamais déplacés, toujours dans l’ordre de leurs heures', () => {
  const r = T.ordonner({ centres, etapes: [G('R2', code('Orsay'), '15:00'), G('X', code('Massy')), G('R1', code('Évry-Courcouronnes'), '09:30'), G('Y', code('Les Ulis'))] });
  const ids = r.ordre.map(x => x.id);
  assert.ok(ids.indexOf('R1') < ids.indexOf('R2'), ids.join(','));
  assert.equal(r.ordre.find(x => x.id === 'R1').rdv, '09:30');
});

test('position inconnue ou heure illisible : jamais placés au hasard, listés à part avec motif', () => {
  const r = T.ordonner({ centres, etapes: [G('A', code('Massy')), { id: 'P', nom: 'GARAGE FICTIF PARIS', insee: '75111' }, G('H', code('Orsay'), '25h')] });
  assert.deepEqual(r.ordre.map(x => x.id), ['A']);
  assert.deepEqual(r.inconnues.map(x => [x.id, /Position inconnue|illisible/.test(x.motif)]), [['P', true], ['H', true]]);
});

test('rattachement par code postal + commune quand le code INSEE manque', () => {
  const r = T.ordonner({ centres, etapes: [{ id: 'C', nom: 'GARAGE FICTIF C', cp: '91300', commune: 'MASSY' }] });
  assert.equal(r.ordre[0].commune, 'Massy');
});
