'use strict';
// Recensement 45.20A : assemblage et contrôles (bureau/recensement-assemblage.js) + passage dans l'import Marché. DONNÉES FICTIVES.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../bureau/recensement-assemblage.js');
const M = require('../bureau/marche-sirene.js');

let n = 0;
const e = (commune, o = {}) => { const s = String(100000000 + (++n)); return Object.assign({ siren: s, nic: '00012', siret: s + '00012', naf: '45.20A', commune, codePostalEtablissement: commune + '0'.slice(0, 0) + '0'.padStart(5 - commune.length, '0'),
  enseigne1Etablissement: null, denominationUsuelleEtablissement: null, statutDiffusionEtablissement: 'O' }, o); };
const lecture = (o = {}) => Object.assign({ lignesLues: 1000, lignesAttendues: 1000, groupesLus: 4, groupesAttendus: 4, source: 'INSEE · stock Sirene', fichierDu: '2026-11-03', extraitLe: '2026-11-08' }, o);

test('1. fichier lu en entier : comptes par département dans l’ordre cité, jamais triés ; SIRET distincts', () => {
  const r = R.assembler({ etablissements: [e('93066'), e('95280'), e('95280'), e('77284'), e('94028')], lecture: lecture() });
  assert.equal(r.statut, 'complet');
  assert.deepEqual(r.comptes.parDepartement, [{ departement: '95', etablissements: 2 }, { departement: '94', etablissements: 1 }, { departement: '91', etablissements: 0 }, { departement: '77', etablissements: 1 }, { departement: '93', etablissements: 1 }]);
  assert.equal(r.comptes.total, 5); assert.equal(new Set(r.lignes.map(l => l.siret)).size, 5);
});

test('2. un contrôle qui échoue = « incomplet », AUCUN nombre (fichier non lu en entier, bloc manquant)', () => {
  for (const [l, motif] of [[lecture({ lignesLues: 999 }), /non lu en entier/], [lecture({ groupesLus: 3 }), /Blocs lus/], [lecture({ lignesLues: 0, lignesAttendues: 0 }), /non lu en entier/]]) {
    const r = R.assembler({ etablissements: [e('95280')], lecture: l });
    assert.equal(r.statut, 'incomplet'); assert.equal(r.comptes, null); assert.equal(r.lignes, null); assert.match(r.motifs.join(' '), motif);
  }
});

test('3. SIRET invalide, autre code ou autre département : incomplet, signalé, jamais compté', () => {
  assert.match(R.assembler({ etablissements: [e('95280', { siret: '123' })], lecture: lecture() }).motifs.join(' '), /1 SIRET invalide/);
  assert.match(R.assembler({ etablissements: [e('95280', { naf: '45.11Z' })], lecture: lecture() }).motifs.join(' '), /autre code que 45.20A/);
  assert.match(R.assembler({ etablissements: [e('78646')], lecture: lecture() }).motifs.join(' '), /hors des départements demandés/);
});

test('4. doublons de SIRET : comptés une fois ; leur nombre reste visible dans les contrôles', () => {
  const a = e('95280'), r = R.assembler({ etablissements: [a, { ...a }, e('95280')], lecture: lecture() });
  assert.equal(r.statut, 'complet'); assert.equal(r.comptes.total, 2); assert.equal(r.controles.rejets.doublons, 1);
});

test('5. noms : dénomination usuelle, enseigne, entreprise, ou nom et prénom d’un entrepreneur individuel ; jamais inventé', () => {
  const ul = { denominationUniteLegale: 'SARL FICTIVE', nomUniteLegale: null, prenomUsuelUniteLegale: null };
  assert.equal(R.nomDe(e('95280', { denominationUsuelleEtablissement: 'ATELIER UN', enseigne1Etablissement: 'AUTRE' }), ul), 'ATELIER UN');
  assert.equal(R.nomDe(e('95280', { enseigne1Etablissement: 'ENSEIGNE' }), ul), 'ENSEIGNE');
  assert.equal(R.nomDe(e('95280'), ul), 'SARL FICTIVE');
  assert.equal(R.nomDe(e('95280'), { nomUniteLegale: 'DUPONT', prenomUsuelUniteLegale: 'JEAN' }), 'JEAN DUPONT');
  assert.equal(R.nomDe(e('95280', { denominationUsuelleEtablissement: '[ND]' }), { denominationUniteLegale: '[ND]' }), '', 'diffusion partielle : pas de nom inventé');
});

test('6. fichier par commune : colonnes fixes, commune nommée par le référentiel officiel, diffusion partielle conservée', () => {
  const r = R.assembler({ etablissements: [e('95280', { statutDiffusionEtablissement: 'P' }), e('95280')], noms: {}, lecture: lecture() });
  assert.equal(r.lignes[0].commune, 'Goussainville'); assert.equal(r.lignes.filter(l => l.diffusion === 'P').length, 1);
  assert.deepEqual(r.parCommune, [{ commune_insee: '95280', commune: 'Goussainville', departement: '95', etablissements: 2, diffusion_partielle: 1, sans_nom: 2 }]);
  const csv = R.versCsv(r.lignes, R.COLONNES);
  assert.ok(csv.startsWith('﻿siret;siren;nom;')); assert.equal(csv.trim().split('\r\n').length, 3);
});

test('7. de bout en bout : le fichier produit est relu par l’import « Marché à prospecter » sans perte ni qualification peintre', () => {
  const r = R.assembler({ etablissements: [e('95280'), e('77284'), e('93066')], noms: {}, lecture: lecture() });
  const csv = R.versCsv(r.lignes.map(l => ({ ...l, nom: l.nom || 'CARROSSERIE FICTIVE' })), R.COLONNES);
  const m = M.versMarche(M.lireCsv(csv), { date: '2026-11-08', source: r.source });
  assert.equal(m.bilan.importes, 3); assert.equal(m.bilan.rejetes, 0); assert.equal(m.bilan.doublons, 0);
  for (const dep of ['95', '77', '93']) for (const x of m.marches[dep].etablissements) { assert.equal(x.typeProbable, 'a_qualifier'); assert.equal(x.activitePeinture.niveau, 'inconnu'); }
});

test('8. limites toujours jointes, source et dates conservées', () => {
  const r = R.assembler({ etablissements: [e('95280')], lecture: lecture() });
  assert.ok(r.limites.some(l => /pas une confirmation d’activité de peinture/.test(l)) && r.limites.some(l => /diffusion partielle/.test(l)));
  assert.equal(r.fichierDu, '2026-11-03'); assert.equal(r.extraitLe, '2026-11-08'); assert.match(r.source, /stock Sirene/);
});

test('9. le fichier suit l’ordre cité des départements (95, 94, 91, 77, 93), puis la commune : jamais trié par nombre d’établissements', () => {
  const r = R.assembler({ etablissements: [e('93066'), e('77284'), e('77284'), e('77284'), e('91228'), e('94028'), e('95280')], lecture: lecture() });
  assert.deepEqual(r.lignes.map(l => l.departement), ['95', '94', '91', '77', '77', '77', '93']);
  assert.deepEqual(r.parCommune.map(c => c.departement), ['95', '94', '91', '77', '93'], 'la commune de 77 qui a le plus d’établissements n’est pas remontée');
});

test('10. code commune du fichier officiel absent du référentiel du Bureau (93059) : code CONSERVÉ, nom ajouté, comptes inchangés ; les deux modules ont la même table', () => {
  const r = R.assembler({ etablissements: [e('93059', { codePostalEtablissement: '93380' }), e('93066')], lecture: lecture() });
  const p = r.lignes.find(l => l.commune_insee === '93059');
  assert.equal(p.commune, 'Pierrefitte-sur-Seine'); assert.equal(p.departement, '93'); assert.equal(r.comptes.communesSansNomOfficiel, 0);
  assert.deepEqual(r.parCommune.map(c => [c.commune_insee, c.etablissements]), [['93059', 1], ['93066', 1]], 'le code officiel n’est pas fusionné avec Saint-Denis');
  assert.deepEqual({ ...R.ALIAS_COMMUNES }, { ...M.ALIAS_COMMUNES });
  const m = M.versMarche(M.lireCsv(R.versCsv(r.lignes, R.COLONNES)), { date: '2026-11-08' });
  assert.equal(m.marches['93'].etablissements.find(x => x.insee === '93059').ville, 'Pierrefitte-sur-Seine'); assert.equal(m.marches['93'].communesSansNom, 0);
});
