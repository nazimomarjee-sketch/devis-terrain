'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../coeur.js');

test('montants : formats français, anglais, négatifs', () => {
  assert.equal(C.parseMontant('-1 234,56'), -123456);
  assert.equal(C.parseMontant('1.234,56 €'), 123456);
  assert.equal(C.parseMontant('1,234.56'), 123456);
  assert.equal(C.parseMontant('−12,00'), -1200);
  assert.equal(C.parseMontant('(45,10)'), -4510);
  assert.equal(C.parseMontant('12'), 1200);
  assert.equal(C.parseMontant('12,5'), 1250);
  assert.equal(C.parseMontant('-25.99'), -2599);
  assert.equal(C.parseMontant('1.234'), 123400);
  assert.equal(C.parseMontant('0,125'), 13);
  assert.equal(C.parseMontant(''), null);
  assert.equal(C.parseMontant('abc'), null);
});

test('dates : jour/mois français, ISO, compact, dates impossibles refusées', () => {
  assert.equal(C.parseDate('05/11/2026'), '2026-11-05');
  assert.equal(C.parseDate('5/1/26'), '2026-01-05');
  assert.equal(C.parseDate('2026-11-05'), '2026-11-05');
  assert.equal(C.parseDate('20261105120000'), '2026-11-05');
  assert.equal(C.parseDate('31/02/2026'), null);
  assert.equal(C.parseDate('pas une date'), null);
});

test('CSV banque française : préambule, point-virgule, virgule décimale, lignes refusées', () => {
  const csv = 'Compte courant;;\nSolde au 10/11/2026;1 520,10;\n\nDate;Date valeur;Libellé;Montant\n' +
    '05/11/2026;06/11/2026;"CARTE 04/11 CARREFOUR MARKET";-54,30\n' +
    '03/11/2026;03/11/2026;VIR SEPA SALAIRE NOVEMBRE;2 100,00\n' +
    'total;;;\n' +
    '02/11/2026;02/11/2026;Ligne sans montant;\n';
  const r = C.lireReleve(csv);
  assert.equal(r.erreur, undefined);
  assert.deepEqual(r.ops, [
    { date: '2026-11-05', libelle: 'CARTE 04/11 CARREFOUR MARKET', montant: -5430 },
    { date: '2026-11-03', libelle: 'VIR SEPA SALAIRE NOVEMBRE', montant: 210000 }
  ]);
  assert.deepEqual(r.refus.map(x => x.motif), ['date illisible', 'montant illisible']);
});

test('CSV avec colonnes Débit / Crédit et séparateur virgule', () => {
  const csv = 'Date,Description,Débit,Crédit\n01/10/2026,"LOYER, OCTOBRE","750,00",\n02/10/2026,REMBOURSEMENT,,"20,00"\n';
  const r = C.lireReleve(csv);
  assert.deepEqual(r.ops.map(o => o.montant), [-75000, 2000]);
  assert.equal(r.ops[0].libelle, 'LOYER, OCTOBRE');
});

test('CSV sans en-têtes reconnaissables : erreur claire', () => {
  assert.match(C.lireReleve('a;b;c\n1;2;3\n').erreur, /En-têtes introuvables/);
});

test('OFX : balises SGML sans fermeture', () => {
  const ofx = 'OFXHEADER:100\n<OFX><BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261104\n<TRNAMT>-13.49\n<FITID>1\n<NAME>NETFLIX.COM\n<MEMO>PRLV SEPA\n</STMTTRN>\n' +
    '<STMTTRN><DTPOSTED>20261103120000<TRNAMT>+2100,00<NAME>SALAIRE &amp; PRIME</STMTTRN></BANKTRANLIST></OFX>';
  const r = C.lireReleve(ofx);
  assert.equal(r.format, 'OFX');
  assert.deepEqual(r.ops, [
    { date: '2026-11-04', libelle: 'NETFLIX.COM PRLV SEPA', montant: -1349 },
    { date: '2026-11-03', libelle: 'SALAIRE & PRIME', montant: 210000 }
  ]);
});

test('doublons : réimport sans doublon, deux opérations identiques le même jour conservées', () => {
  const lot = [
    { date: '2026-11-05', libelle: 'CAFE DU PORT', montant: -150 },
    { date: '2026-11-05', libelle: 'Café du Port', montant: -150 },
    { date: '2026-11-06', libelle: 'LIDL', montant: -2000 }
  ];
  const premier = C.identifier(lot, 'Courant');
  assert.equal(new Set(premier.map(o => o.id)).size, 3);
  const ids = new Set(premier.map(o => o.id));
  const second = C.identifier([...lot, { date: '2026-11-07', libelle: 'SNCF', montant: -4000 }], 'Courant');
  const f = C.fusionner(ids, second);
  assert.equal(f.doublons.length, 3);
  assert.deepEqual(f.ajouts.map(o => o.libelle), ['SNCF']);
  assert.equal(C.fusionner(ids, C.identifier(lot, 'Autre compte')).ajouts.length, 3);
});

test('catégories : règles par défaut, ordre, signe, règle perso, choix manuel', () => {
  const cat = (libelle, montant, extra) => C.categorie({ libelle, montant, ...extra }, extra && extra.regles);
  assert.equal(cat('CARTE 04/11 CARREFOUR MARKET', -5430), 'Courses');
  assert.equal(cat('UBER EATS PARIS', -2200), 'Restaurants');
  assert.equal(cat('UBER TRIP', -1500), 'Transport');
  assert.equal(cat('VIR SEPA SALAIRE NOVEMBRE', 210000), 'Revenus');
  assert.equal(cat('SALAIRE NOUNOU', -40000), C.A_CLASSER);
  assert.equal(cat('VIR VERS LIVRET A', -30000), C.NEUTRE);
  assert.equal(cat('PRLV EDF', -8000), 'Énergie et télécoms');
  assert.equal(cat('REDFORD SARL', -8000), C.A_CLASSER);
  assert.equal(cat('REMBOURSEMENT INCONNU', 2000), 'Entrées diverses');
  assert.equal(C.categorie({ libelle: 'CB GARAGE DUPONT 12/10', montant: -9000 }, [{ motif: 'GARAGE DUPONT', cat: 'Transport' }]), 'Transport');
  assert.equal(C.categorie({ libelle: 'CARREFOUR', montant: -100, catManuelle: 'Loisirs' }, []), 'Loisirs');
});

function jeu() {
  const ops = [];
  for (const m of ['07', '08', '09', '10']) {
    ops.push({ date: '2026-' + m + '-02', libelle: 'VIR SALAIRE', montant: 200000 });
    ops.push({ date: '2026-' + m + '-05', libelle: 'PRLV SEPA NETFLIX.COM ' + m, montant: -1349 });
    ops.push({ date: '2026-' + m + '-06', libelle: 'CARTE LIDL', montant: -(10000 + Number(m) * 1000) });
    ops.push({ date: '2026-' + m + '-10', libelle: 'VIR VERS LIVRET A', montant: -30000 });
  }
  ops.push({ date: '2026-10-20', libelle: 'CB BRICOLAGE XYZ', montant: -45000 });
  return C.identifier(ops, 'Courant');
}

test('synthèse du mois : totaux en centimes, épargne exclue', () => {
  const s = C.syntheseMois(jeu(), [], '2026-10');
  assert.equal(s.entrees, 200000);
  assert.equal(s.sorties, -(1349 + 20000 + 45000));
  assert.equal(s.solde, 200000 - 66349);
  assert.equal(s.neutre, -30000);
  assert.equal(s.aClasser, 1);
  assert.equal(s.parCat.Courses, -20000);
});

test('récurrentes : abonnement stable détecté, achat ponctuel ignoré', () => {
  const r = C.recurrentes(jeu(), []);
  const netflix = r.find(x => x.marchand === 'NETFLIX COM');
  assert.deepEqual(netflix, { marchand: 'NETFLIX COM', cat: 'Abonnements', montant: 1349, nbMois: 4 });
  assert.equal(r.some(x => /BRICOLAGE/.test(x.marchand)), false);
});

test('résumé pour Claude : chiffres justes et aucun libellé ni compte', () => {
  const t = C.resumePourClaude(jeu(), [], 3);
  assert.match(t, /Période : 2026-08 à 2026-10 \(3 mois\), 13 opérations/);
  assert.match(t, /2026-10 : \+2 000,00 \/ -663,49 \/ \+1 336,51/);
  assert.match(t, /- Abonnements : 13,49 \/ mois \(40,47\)/);
  assert.match(t, /- Abonnements : 13,49 \(3 mois\)/);
  for (const interdit of ['NETFLIX', 'LIDL', 'BRICOLAGE', 'SALAIRE', 'LIVRET', 'Courant'])
    assert.equal(t.includes(interdit), false, interdit + ' ne doit pas sortir');
  assert.equal(C.resumePourClaude([], [], 3), '');
});

test('sauvegarde : aller-retour accepté, contenu invalide refusé', () => {
  const ops = jeu();
  ops[0].catManuelle = 'Revenus';
  const s = JSON.parse(JSON.stringify({ format: 'banque-locale', version: 1, ops, regles: [{ motif: 'garage dupont', cat: 'Transport' }, { motif: 'x', cat: 'Inconnue' }] }));
  const v = C.validerSauvegarde(s);
  assert.equal(v.ops.length, ops.length);
  assert.deepEqual(v.regles, [{ motif: 'GARAGE DUPONT', cat: 'Transport' }]);
  assert.throws(() => C.validerSauvegarde({ format: 'autre', ops: [] }), /pas une sauvegarde/);
  assert.throws(() => C.validerSauvegarde({ format: 'banque-locale', ops: [{ ...ops[0], montant: 12.5 }] }), /invalide/);
  assert.throws(() => C.validerSauvegarde({ format: 'banque-locale', ops: [ops[0], ops[0]] }), /invalide/);
});
