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
  assert.deepEqual(netflix, { marchand: 'NETFLIX COM', cat: 'Abonnements', montant: 1349, nbMois: 4, jour: 5 });
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

/* ---------- Finances personnelles : soldes, échéances, prévision ---------- */
function situation() {
  const brut = [];
  for (const m of ['08', '09', '10']) {
    brut.push({ date: '2026-' + m + '-02', libelle: 'VIR SEPA SALAIRE ' + ({ '08': 'AOUT', '09': 'SEPT', '10': 'OCT' })[m], montant: 200000 });
    brut.push({ date: '2026-' + m + '-05', libelle: 'PRLV SEPA LOYER FONCIA', montant: -70000 });
    brut.push({ date: '2026-' + m + '-06', libelle: 'PRLV SEPA NETFLIX.COM', montant: -1349 });
    brut.push({ date: '2026-' + m + '-15', libelle: 'CARTE LIDL', montant: -60000 });
  }
  brut.push({ date: '2026-11-02', libelle: 'VIR SEPA SALAIRE NOV', montant: 200000 });
  brut.push({ date: '2026-11-05', libelle: 'PRLV SEPA LOYER FONCIA', montant: -70000 });
  brut.push({ date: '2026-11-08', libelle: 'CARTE LIDL', montant: -20000 });
  return {
    ops: C.identifier(brut, 'Courant'), regles: [], budgets: {}, seuil: 0,
    comptes: [{ nom: 'Courant', soldeRef: 100000, dateRef: '2026-11-04' }, { nom: 'Livret', epargne: true, soldeRef: 500000, dateRef: '2026-11-01' }],
    echeances: [
      { id: 'e1', libelle: 'Loyer', montant: -70000, jour: 5, cat: 'Logement', type: 'charge', motif: 'FONCIA' },
      { id: 'e2', libelle: 'Netflix', montant: -1349, jour: 6, cat: 'Abonnements', type: 'charge', motif: 'NETFLIX' },
      { id: 'e3', libelle: 'Crédit auto', montant: -25000, jour: 20, cat: 'Transport', type: 'credit', fin: '2027-03' },
      { id: 'e4', libelle: 'Assurance habitation', montant: -24000, jour: 12, cat: 'Assurances', type: 'charge', mois: [3] },
      { id: 'e5', libelle: 'Salaire', montant: 200000, jour: 2, cat: 'Revenus', type: 'revenu', motif: 'SALAIRE' }
    ]
  };
}

test('soldes : solde relevé + opérations postérieures, épargne à part, compte sans solde signalé', () => {
  const d = situation();
  d.ops.push(...C.identifier([{ date: '2026-11-03', libelle: 'X', montant: -500 }], 'Joint'));
  const s = C.soldes(d.comptes, d.ops);
  assert.equal(s.disponible, 100000 - 70000 - 20000);
  assert.equal(s.epargne, 500000);
  assert.deepEqual(s.inconnus, ['Joint']);
  assert.equal(s.parCompte.find(c => c.nom === 'Courant').opsDepuis, 2);
});

test('échéances : dues selon le mois et la fin, réglées retrouvées dans le relevé', () => {
  const d = situation();
  const nov = C.etatEcheances(d.echeances, d.ops, '2026-11');
  assert.deepEqual(nov.map(x => [x.echeance.libelle, x.date, x.reglee]), [
    ['Salaire', '2026-11-02', true], ['Loyer', '2026-11-05', true], ['Netflix', '2026-11-06', false], ['Crédit auto', '2026-11-20', false]]);
  assert.equal(C.etatEcheances(d.echeances, d.ops, '2027-03').some(x => x.echeance.libelle === 'Assurance habitation'), true);
  assert.equal(C.etatEcheances(d.echeances, d.ops, '2027-04').some(x => x.echeance.type === 'credit'), false);
  assert.equal(C.dateEcheance({ jour: 31 }, '2027-02'), '2027-02-28');
  assert.equal(C.totalMensuel(d.echeances, 'charge'), -(70000 + 1349 + 2000));
  assert.equal(C.moisSuivant('2026-12'), '2027-01');
});

test('échéance sans mot-clé : rapprochée par montant et date, une opération ne règle qu\'une échéance', () => {
  const ops = C.identifier([{ date: '2026-11-19', libelle: 'PRLV BANQUE XYZ', montant: -25000 }], 'Courant');
  const ech = [{ id: 'a', libelle: 'Crédit A', montant: -25000, jour: 20, cat: 'Transport', type: 'credit' }, { id: 'b', libelle: 'Crédit B', montant: -25000, jour: 20, cat: 'Transport', type: 'credit' }];
  assert.deepEqual(C.etatEcheances(ech, ops, '2026-11').map(x => x.reglee), [true, false]);
});

test('prévision de fin de mois : calcul détaillé et point bas', () => {
  const d = situation(), p = C.prevision(d, '2026-11-10');
  // Rythme : 3 mois complets, sorties 1313,49 − charges déclarées (700 + 13,49 + 250) = 350 € / mois, sur 92 jours.
  const parJour = (35000 * 3) / 92;
  assert.equal(p.base, '3 mois complets');
  assert.equal(p.disponible, 10000);
  assert.equal(p.revenusAttendus, 0);
  assert.equal(p.chargesAVenir, -(1349 + 25000));
  assert.equal(p.variablesRestantes, -Math.round(parJour * 20));
  assert.equal(p.soldeFin, 10000 - 26349 - Math.round(parJour * 20));
  assert.equal(p.pointBas.date, '2026-11-30');
  assert.equal(p.echeancesRestantes.find(e => e.libelle === 'Netflix').enRetard, true);
  assert.equal(C.prevision({ ...d, comptes: [] }, '2026-11-10').inconnu, true);
});

test('alertes : découvert, échéance non retrouvée, budget dépassé, solde ancien', () => {
  const d = situation(); d.budgets = { Courses: 15000 };
  const a = C.alertes(d, '2026-11-10').map(x => x.niveau + ' ' + x.texte);
  assert.equal(a.some(t => /^rouge Découvert possible le 30\/11/.test(t)), true);
  assert.equal(a.some(t => /^orange « Netflix » \(13,49 €\) était prévue le 06\/11/.test(t)), true);
  assert.equal(a.some(t => /^orange Budget « Courses » dépassé : 200,00 € pour 150,00 €/.test(t)), true);
  assert.equal(a.some(t => /^info Solde de « Livret » non mis à jour/.test(t)), false);
  assert.equal(C.alertes(d, '2026-11-20').some(x => /Livret.*19 jours/.test(x.texte)), true);
  const sain = situation(); sain.comptes[0].soldeRef = 400000;
  assert.equal(C.alertes(sain, '2026-11-10').some(x => x.niveau === 'rouge'), false);
});

test('suggestions d\'échéances : récurrences non déclarées proposées, courses jamais', () => {
  const d = situation();
  assert.deepEqual(C.suggestionsEcheances(d.ops, d.regles, d.echeances), []);
  const s = C.suggestionsEcheances(d.ops, d.regles, []);
  assert.deepEqual(s.map(x => [x.libelle, x.montant, x.jour, x.type]), [['SALAIRE', 200000, 2, 'revenu'], ['LOYER FONCIA', -70000, 5, 'charge'], ['NETFLIX COM', -1349, 6, 'charge']]);
});

test('pistes d\'économies et budgets proposés', () => {
  const d = situation();
  d.ops.push(...C.identifier([{ date: '2026-10-28', libelle: 'COMMISSION INTERVENTION', montant: -800 }], 'Courant'));
  const p = C.pistes(d, '2026-11-10');
  assert.match(p.find(x => /abonnement/.test(x.titre)).titre, /1 abonnement : 13,49 € par mois, soit 161,88 € par an/);
  assert.match(p.find(x => /Frais bancaires/.test(x.titre)).titre, /8,00 € sur 3 mois/);
  const b = C.budgetsProposes(d, '2026-11-10');
  assert.equal(b.Courses, 60000);
  assert.equal(b.Logement, 70000);
  assert.equal('Revenus' in b, false);
  assert.equal('Courses' in C.budgetsProposes({ ...d, budgets: { Courses: 1 } }, '2026-11-10'), false);
});

test('rapprochement : une saisie manuelle retrouvée dans le relevé est repérée', () => {
  const manuelle = { id: 'M|abc', date: '2026-11-08', libelle: 'Courses', montant: -2000, compte: 'Courant' };
  const autre = { id: 'M|def', date: '2026-10-01', libelle: 'Vieux', montant: -2000, compte: 'Courant' };
  const ajouts = C.identifier([{ date: '2026-11-10', libelle: 'CARTE LIDL', montant: -2000 }, { date: '2026-11-10', libelle: 'CARTE ALDI', montant: -2000 }], 'Courant');
  const paires = C.rapprocher([manuelle, autre], ajouts);
  assert.deepEqual(paires.map(x => [x.manuelle.id, x.importee.libelle]), [['M|abc', 'CARTE LIDL']]);
});

test('résumé complet : situation ajoutée, toujours sans libellé ni nom de compte ou d\'échéance', () => {
  const d = situation(), t = C.resumeComplet(d, 3, '2026-11-10');
  assert.match(t, /Argent disponible \(hors épargne\) : 100,00/);
  assert.match(t, /Un crédit de 250,00 \/ mois se termine en 2027-03/);
  for (const interdit of ['FONCIA', 'NETFLIX', 'Netflix', 'LIDL', 'Loyer', 'Crédit auto', 'Courant', 'Livret'])
    assert.equal(t.includes(interdit), false, interdit + ' ne doit pas sortir');
});

test('sauvegarde version 2 : comptes, échéances, budgets validés ; ancienne version acceptée', () => {
  const d = situation(); d.budgets = { Courses: 30000, Inconnue: 5 };
  const v = C.validerSauvegarde(JSON.parse(JSON.stringify({ format: 'banque-locale', version: 2, ...d })));
  assert.equal(v.echeances.length, 5);
  assert.deepEqual(v.budgets, { Courses: 30000 });
  assert.deepEqual(v.comptes[1], { nom: 'Livret', epargne: true, soldeRef: 500000, dateRef: '2026-11-01' });
  const ancienne = C.validerSauvegarde({ format: 'banque-locale', version: 1, ops: d.ops });
  assert.deepEqual([ancienne.comptes, ancienne.echeances, ancienne.budgets, ancienne.seuil], [[], [], {}, 0]);
  const mauvais = e => () => C.validerSauvegarde({ format: 'banque-locale', ops: [], echeances: [e] });
  assert.throws(mauvais({ ...d.echeances[0], jour: 40 }), /échéance n° 1 invalide/);
  assert.throws(mauvais({ ...d.echeances[0], montant: 70000 }), /échéance n° 1 invalide/);
  assert.throws(() => C.validerSauvegarde({ format: 'banque-locale', ops: [], comptes: [{ nom: 'A', soldeRef: 1.5, dateRef: '2026-01-01' }] }), /compte n° 1 invalide/);
});
