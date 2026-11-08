'use strict';
// Recensement : préparation de l'import « Marché à prospecter » (bureau/marche-sirene.js). DONNÉES FICTIVES.
// Exécution : node --test tests/bureau-marche-sirene.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../bureau/marche-sirene.js');
const MC = require('../bureau/ville/modele-commune.js');

const EN = 'siret;siren;nom;enseigne;denomination_usuelle;denomination_entreprise;commune_insee;code_postal;naf;diffusion';
const csv = l => '﻿' + [EN, ...l].join('\r\n') + '\r\n';
const ligne = (siret, o = {}) => [siret, siret.slice(0, 9), o.nom ?? '', o.enseigne ?? '', o.usuelle ?? '', o.ent ?? 'SARL FICTIVE', o.insee ?? '95280', o.cp ?? '95190', o.naf ?? '45.20A', o.diff ?? 'O'].join(';');
const S = n => String(10000000000000 + n);

test('1. lecture du CSV (BOM, guillemets, point-virgule) et refus d’un fichier sans colonne SIRET ou commune', () => {
  const r = M.lireCsv(csv([ligne(S(1), { nom: '"GARAGE ""FICTIF"" ; UN"'.replace(/^"|"$/g, '') })]));
  assert.equal(r.length, 1); assert.equal(r[0].siret, S(1));
  assert.throws(() => M.lireCsv('nom;ville\r\nA;B\r\n'), /Colonne\(s\) obligatoire\(s\) absente\(s\) : siret, commune_insee/);
  assert.throws(() => M.lireCsv(''), /Fichier vide/);
  assert.equal(M.lireCsv('siret;commune_insee\r\n"1234;5";95280').length, 1, 'un « ; » entre guillemets ne coupe pas la cellule');
});

test('2. SIRET distincts : doublons et SIRET invalides comptés à part, jamais perdus en silence', () => {
  const r = M.versMarche(M.lireCsv(csv([ligne(S(1)), ligne(S(1)), ligne('123'), ligne(S(2), { insee: '94028' }), ligne(S(3), { naf: '45.11Z' })])), { date: '2026-11-08' });
  assert.deepEqual([r.bilan.lignes, r.bilan.importes, r.bilan.doublons, r.bilan.rejetes], [5, 2, 1, 2]);
  assert.deepEqual(r.rejets.map(x => x.motif).sort(), ['Code 45.11Z : seul le 45.20A est importé', 'SIRET invalide']);
  assert.deepEqual(r.bilan.parDepartement, { 95: 1, 94: 1, 91: 0, 77: 0, 93: 0 });
});

test('3. cinq départements dans l’ordre cité, sans classement ; une commune hors des cinq est écartée à part', () => {
  const r = M.versMarche(M.lireCsv(csv([ligne(S(1), { insee: '77284' }), ligne(S(2), { insee: '93066' }), ligne(S(3), { insee: '78646' })])), { date: '2026-11-08' });
  assert.deepEqual(r.liste.map(x => x.departement), ['95', '94', '91', '77', '93'], 'ordre cité, jamais trié par nombre'); assert.deepEqual(M.DEPARTEMENTS, ['95', '94', '91', '77', '93']);
  assert.deepEqual(r.liste.map(x => x.total), [0, 0, 0, 1, 1]);
  assert.equal(r.bilan.horsDepartements, 1); assert.match(r.rejets[0].motif, /hors des cinq départements/);
});

test('4. AUCUN établissement n’est qualifié peintre : « à qualifier », preuve d’activité peinture « inconnu », même avec CARROSSERIE dans le nom', () => {
  const r = M.versMarche(M.lireCsv(csv([ligne(S(1), { nom: 'CARROSSERIE PEINTURE FICTIVE', enseigne: 'CARROSSERIE DU PARC' }), ligne(S(2), { nom: 'GARAGE FICTIF' })])), { date: '2026-11-08' });
  for (const e of r.marches['95'].etablissements) {
    assert.equal(e.typeProbable, 'a_qualifier'); assert.equal(e.activitePeinture.niveau, 'inconnu'); assert.equal(e.activitePeinture.preuve, null);
    assert.match(e.motifType, /activité peinture NON confirmée/); assert.equal(e.naf, '45.20A');
  }
  assert.match(r.avertissement, /MÉCANIQUE|mécanique ET carrosserie/);
});

test('5. nom : le plus précis connu, sans en inventer ; diffusion partielle conservée', () => {
  const r = M.versMarche(M.lireCsv(csv([ligne(S(1), { usuelle: 'ATELIER FICTIF UN', enseigne: 'AUTRE' }), ligne(S(2), { enseigne: 'ENSEIGNE FICTIVE', ent: '[ND]' }), ligne(S(3), { ent: '[ND]', diff: 'P' })])), { date: '2026-11-08' });
  const e = r.marches['95'].etablissements;
  assert.equal(e[0].nom, 'ATELIER FICTIF UN'); assert.equal(e[1].nom, 'ENSEIGNE FICTIVE');
  assert.equal(e[2].nom, 'Nom non communiqué (diffusion partielle)'); assert.equal(e[2].diffusionPartielle, true);
});

test('6. commune : nom retrouvé par le code INSEE dans le référentiel officiel ; code inconnu signalé', () => {
  const r = M.versMarche(M.lireCsv(csv([ligne(S(1), { insee: '95280' }), ligne(S(2), { insee: '95999' })])), { date: '2026-11-08' });
  const e = r.marches['95'].etablissements;
  assert.equal(e[0].ville, 'Goussainville'); assert.equal(e[1].ville, ''); assert.equal(r.marches['95'].communesSansNom, 1);
});

test('7. source et date d’extraction conservées dans chaque marché', () => {
  const r = M.versMarche(M.lireCsv(csv([ligne(S(1))])), { date: '2026-11-08', source: 'INSEE · stock Sirene au 01/11/2026 (data.gouv.fr)' });
  assert.equal(r.marches['95'].date, '2026-11-08'); assert.match(r.marches['95'].source, /stock Sirene/); assert.equal(r.date, '2026-11-08');
});

test('8. dans Ma Ville : le marché importé reste « Marché à prospecter », à qualifier, sans couleur commerciale, sans fusion par le nom', () => {
  const r = M.versMarche(M.lireCsv(csv([ligne(S(1), { nom: 'CARROSSERIE FICTIVE UN' }), ligne(S(2), { nom: 'GARAGE FICTIF DEUX' })])), { date: '2026-11-08' });
  const m = MC.construire({ arrete: '2026-11-08', annuaire: r.marches['95'].etablissements,
    terrain: [{ id: 1, nom: 'CARROSSERIE FICTIVE UN', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect' }] });   // même NOM, pas de SIRET commun : jamais fusionné
  const l = MC.commune(m, '95280').etablissements;
  assert.equal(l.length, 3, 'la fiche du téléphone et les 2 établissements du marché restent séparés');
  const marche = l.filter(e => e.portee === 'marche');
  assert.equal(marche.length, 2);
  for (const e of marche) { assert.equal(e.categorie, 'a_qualifier'); assert.equal(e.segment, null, 'aucune couleur commerciale'); assert.equal(e.compte.statut, 'a_verifier'); }
  assert.equal(l.filter(e => e.portee === 'mes_garages').length, 1);
});
