'use strict';
// Lot 4 : Studio marketing (logique). Contenus FICTIFS. node --test tests/bureau-studio.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../bureau/studio.js');
const LE = '2026-11-14T10:00:00.000Z';
const ids = (n => () => 'C' + (++n))(0);
const base = (x = {}) => ({ type: 'message', marque: 'carsystem', titre: 'Vernis Carsystem', texte: 'Bonjour, découvrez notre gamme de vernis Carsystem.', cibles: ['prospect'], ...x });

test('marques actives : Carsystem, Abel Auto, Sifa ; Roberlo inactive, refusée pour tout nouveau contenu', () => {
  assert.deepEqual(S.MARQUES.filter(m => m.active).map(m => m.nom), ['Carsystem', 'Abel Auto', 'Sifa']);
  assert.throws(() => S.enregistrer([], base({ marque: 'roberlo' }), { le: LE, nouvelId: ids }), /Roberlo : Gamme non active/);
});

test('historique Roberlo conservé (archivé), jamais proposé ni exporté', () => {
  const ancien = { ...S.normaliser(base({ marque: 'roberlo' })), id: 'R1', historique: [{ le: '2026-01-01', evenement: 'cree' }] };
  assert.equal(S.statut(ancien), 'archive');
  const b = [ancien];
  assert.equal(S.pack(b, { le: LE }).contenus.length, 0);
  assert.deepEqual(S.proposer([{ id: 1, nom: 'G', client: false }], b), []);
  assert.equal(b[0].id, 'R1', 'contenu conservé');
});

test('jamais de prix inventé : prix ou remise sans source / sans validité, ou chiffre dans le texte sans source ⇒ non validable', () => {
  assert.match(S.controler(S.normaliser(base({ conditions: { remise: '10 %' } }))).join(), /sans source des conditions/);
  assert.match(S.controler(S.normaliser(base({ conditions: { remise: '10 %', source: 'Conditions validées par la direction' } }))).join(), /sans durée de validité/);
  assert.match(S.controler(S.normaliser(base({ texte: 'Vernis à 39,90 € ce mois-ci' }))).join(), /cite un prix/);
  assert.match(S.controler(S.normaliser(base({ produit: { caracteristiques: 'Séchage 15 min' } }))).join(), /sans source officielle/);
  assert.deepEqual(S.controler(S.normaliser(base({ conditions: { remise: '10 %', validite: 'jusqu’au 31/12/2026', source: 'Conditions validées par la direction le 14/11/2026' } }))), []);
});

test('validation humaine liée à la version exacte : toute modification remet « à vérifier »', () => {
  let { biblio, contenu } = S.enregistrer([], base(), { le: LE, nouvelId: ids });
  assert.equal(S.statut(contenu), 'a_verifier');
  assert.throws(() => S.valider(contenu, { par: '', le: LE }), /Nom/);
  const v = S.valider(contenu, { par: 'Responsable fictif', le: LE }); biblio = biblio.map(x => x.id === v.id ? v : x);
  assert.equal(S.statut(v), 'valide');
  ({ biblio, contenu } = S.enregistrer(biblio, { ...v, texte: v.texte + ' Nouveau.' }, { le: LE, nouvelId: ids }));
  assert.equal(S.statut(contenu), 'a_verifier'); assert.equal(biblio.length, 1);
  assert.deepEqual(contenu.historique.map(h => h.evenement), ['cree', 'valide', 'modifie']);
});

test('image sans droits confirmés : non validable, jamais intégrée au visuel ; visuel SVG aux couleurs ODICOLOR', () => {
  const img = { nom: 'photo.png', donnees: 'data:image/png;base64,iVBORw0KGgo=' };
  const c1 = S.normaliser(base({ type: 'visuel', image: img }));
  assert.match(S.controler(c1).join(), /droits/); assert.doesNotMatch(S.visuelSVG(c1), /<image /);
  const c2 = S.normaliser(base({ type: 'visuel', image: { ...img, droitsConfirmes: true }, conditions: { remise: '10 %', validite: 'novembre 2026', source: 'Direction' } }));
  const svg = S.visuelSVG(c2);
  assert.match(svg, /<image href="data:image\/png/); assert.match(svg, /#E21B2A/); assert.match(svg, /ODICOLOR/); assert.match(svg, /Remise : 10 %/);
  assert.doesNotMatch(S.visuelSVG(S.normaliser(base({ titre: '<script>x</script>' }))), /<script>/, 'texte échappé');
});

test('scénario : toujours étiqueté « aucune vidéo générée », jamais exporté vers le téléphone', () => {
  const sc = S.valider(S.normaliser(base({ type: 'scenario', texte: '', plans: [{ duree: 5, image: 'Garage, pistolet', texte: 'Vernis Carsystem' }, { duree: 4, image: 'Logo', texte: 'ODICOLOR' }] })), { par: 'X', le: LE });
  assert.match(S.scenarioTexte(sc), /^Scénario de vidéo — aucune vidéo générée/); assert.match(S.scenarioTexte(sc), /Durée totale : 9 s/);
  assert.equal(S.pack([sc], { le: LE }).contenus.length, 0);
});

test('propositions : contenus validés de la cible ; dormant, client, prospect ; compte bloqué exclu', () => {
  const v = c => S.valider(S.normaliser(c), { par: 'X', le: LE });
  const b = [{ ...v(base({ cibles: ['dormant'], titre: 'Reconquête' })), id: 'A' }, { ...v(base({ cibles: ['prospect', 'client'], titre: 'Découverte' })), id: 'B' }, { ...S.normaliser(base({ cibles: ['client'] })), id: 'NV' }];
  const p = S.proposer([{ id: 1, nom: 'DORMANT', client: true, inactif: true }, { id: 2, nom: 'CLIENT', client: true }, { id: 3, nom: 'PROSPECT' }, { id: 4, nom: 'BLOQUE', client: true, compteBloque: true }], b);
  assert.deepEqual(p.map(x => [x.nom, x.segment, x.contenus.map(c => c.id).join()]), [['DORMANT', 'dormant', 'A'], ['CLIENT', 'client', 'B'], ['PROSPECT', 'prospect', 'B']]);
});

test('pack téléphone : seulement les validés, texte avec conditions sourcées, empreinte de validation', () => {
  const v = S.valider(S.normaliser(base({ conditions: { remise: '10 %', validite: 'novembre 2026', source: 'Direction' } })), { par: 'Responsable fictif', le: LE });
  const p = S.pack([{ ...v, id: 'V' }, { ...S.normaliser(base()), id: 'B' }], { le: LE });
  assert.equal(p.appli, 'odicolor-contenus'); assert.deepEqual(p.contenus.map(c => c.id), ['V']);
  assert.match(p.contenus[0].texte, /Remise : 10 % · Valable : novembre 2026$/); assert.equal(p.contenus[0].marque, 'Carsystem');
});
