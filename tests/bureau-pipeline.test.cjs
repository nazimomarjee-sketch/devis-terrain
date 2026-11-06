'use strict';
// Bureau ODICOLOR — pipeline commercial, 3 actions du jour et plan du matin pour le téléphone.
// Exécution : node --test tests/bureau-pipeline.test.cjs
// Scénario 100 % fictif, « aujourd'hui » = vendredi 06/11/2026 (fichiers tests/fixtures/bureau/ebp-*.csv).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const E = require('../bureau/ebp-import.js');
const P = require('../bureau/pipeline.js');

const F = join(__dirname, 'fixtures', 'bureau');
const table = n => E.lireCsv(E.decoderTexte(readFileSync(join(F, n))).texte);
const AUJ = '2026-11-06', MAINTENANT = '2026-11-06T07:00:00.000Z';
function scenario() {
  const p = E.lirePieces(table('ebp-pieces.csv'));
  return { piecesEbp: p.pieces, ignorees: p.ignorees.length, reglements: E.lireReglements(table('ebp-reglements.csv')).reglements,
    clientsEbp: E.lireClientsEbp(table('ebp-clients.csv')).clients,
    devisTelephone: JSON.parse(readFileSync(join(F, 'telephone-devis-pipeline.json'), 'utf8')).devis, arrete: AUJ, maintenant: MAINTENANT };
}
function geler(o) { if (o && typeof o === 'object') { Object.values(o).forEach(geler); Object.freeze(o); } return o; }

test('jours ouvrés : week-ends et fériés français exclus (Pâques calculée)', () => {
  const f = P.joursFeries(2026);
  for (const d of ['2026-01-01', '2026-04-06', '2026-05-01', '2026-05-08', '2026-05-14', '2026-05-25', '2026-07-14', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25']) assert.ok(f.has(d), d);
  assert.equal(f.size, 11);
  assert.equal(P.ouvre('2026-11-11'), false);
  assert.equal(P.ouvre('2026-11-07'), false);
  assert.equal(P.joursOuvres('2026-11-06', '2026-11-13'), 4, 'lun 9, mar 10, jeu 12, ven 13 (11 novembre férié)');
  assert.equal(P.joursOuvres('2026-11-06', '2026-11-06'), 0);
  assert.equal(P.lundi('2026-11-08'), '2026-11-02');
});

test('montant d’un devis téléphone : même calcul que l’appli (quantités ×100, centimes, remise)', () => {
  assert.equal(P.totalDevisCents({ lignes: [{ q: 100, pu: 1000, r: 0 }] }), 1000);
  assert.equal(P.totalDevisCents({ lignes: [{ q: 250, pu: 1999, r: 1500 }] }), 4248); // 2,5 × 19,99 € − 15 % = 42,48 €
  assert.equal(P.totalDevisCents({ lignes: [{ q: 1.5, pu: 1, r: 0 }] }), null, 'quantité non entière : refusée');
});

test('fusion : une affaire saisie au téléphone ET dans EBP ne compte qu’une fois, EBP fait foi', () => {
  const s = scenario();
  const tel = P.piecesTelephone(s.devisTelephone);
  assert.deepEqual(tel.map(p => p.no), ['TEL-D11', 'TEL-D12', 'TEL-D13', 'TEL-C13'], 'le brouillon est exclu');
  const { pieces, rapprochements } = P.fusionner(tel, s.piecesEbp);
  assert.deepEqual(rapprochements, [{ telephone: 'TEL-D11', ebp: 'DV-1001', mode: 'probable' }, { telephone: 'TEL-C13', ebp: 'CC-2001', mode: 'probable' }]);
  assert.ok(!pieces.some(p => p.no === 'TEL-D11' || p.no === 'TEL-C13'));
  assert.equal(pieces.filter(p => p.type === 'commande').reduce((n, p) => n + p.htCents, 0), 210000 + 180000 + 300000 + 150000 + 70000, 'aucune commande en double');
});

test('fusion : commande retrouvée par sa référence avant toute ressemblance', () => {
  const tel = [{ type: 'commande', no: 'TEL-C1', date: '2026-11-02', client: 'X', htCents: 100, ref: 'TEL-D1', origine: 'TEL-D1', source: 'telephone' }];
  const ebp = [{ type: 'commande', no: 'CC-9', date: '2026-10-01', client: 'Autre nom', htCents: 999, ref: 'Selon TEL-D1', origine: '', source: 'ebp' }];
  assert.equal(P.fusionner(tel, ebp).rapprochements[0].mode, 'référence');
});

test('3 actions du jour : les plus gros montants en jeu, avec responsable, preuve et source', () => {
  const plan = P.construirePlan(scenario());
  const top = plan.actions.filter(a => a.prio === 1);
  assert.deepEqual(top.map(a => [a.tag, a.responsable, a.client]), [
    ['Règlement', 'Toi', 'GARAGE FICTIF EPSILON'], ['Commande', 'Mohamed', 'GARAGE FICTIF BETA'], ['Facture', 'Mohamed', 'GARAGE FICTIF DELTA']]);
  assert.match(top[0].preuve, /FA-4002 du 2026-10-22, échéance 2026-10-31, reste 3 600,00 €/);
  assert.match(top[0].d, /échu depuis 6 j/);
  assert.equal(top[0].source, 'Export EBP du 2026-11-06');
  assert.match(top[1].qualite, /probable : à confirmer/, 'rapprochement téléphone/EBP signalé');
  for (const a of plan.actions) { assert.ok(a.preuve && a.source && a.qualite, a.id); assert.match(a.preuve + a.d, /\d/); }
});

test('actions : compte bloqué sans action de vente, devis froid et affaires à jour ignorés', () => {
  const plan = P.construirePlan(scenario());
  const clients = plan.actions.map(a => a.client);
  assert.ok(!clients.includes('GARAGE FICTIF GAMMA'), 'compte bloqué : pas de relance de devis');
  assert.ok(!plan.actions.some(a => a.id.endsWith('DV-1004')), 'devis froid (> 14 j) : pas de relance automatique');
  assert.ok(!clients.includes('GARAGE FICTIF ZETA'), 'facture soldée');
  assert.ok(!plan.actions.some(a => a.id.endsWith('CC-2002')), 'facture non échue');
  assert.deepEqual(plan.actions.filter(a => a.prio === 2).map(a => a.client), ['GARAGE FICTIF THETA', 'GARAGE FICTIF ALPHA']);
});

test('compte bloqué : une facture échue reste suivie (action règlement uniquement)', () => {
  const s = scenario();
  s.clientsEbp = s.clientsEbp.map(c => c.code === 'C005' ? { ...c, bloque: true } : c);
  const plan = P.construirePlan(s);
  assert.deepEqual(plan.actions.filter(a => a.client === 'GARAGE FICTIF EPSILON').map(a => a.tag), ['Règlement']);
});

test('sans échéancier EBP : aucune facture déclarée impayée, mention « non vérifiable »', () => {
  const s = scenario(); s.reglements = [];
  const plan = P.construirePlan(s);
  assert.ok(!plan.actions.some(a => a.tag === 'Règlement'));
  assert.equal(plan.kpi.echu, undefined);
  assert.deepEqual(plan.indicateurs.find(i => i.l === 'Échu non réglé'), { l: 'Échu non réglé', v: 'non vérifiable', n: 'échéancier EBP non chargé' });
});

test('échéancier chargé mais facture absente : « à vérifier », jamais impayée', () => {
  const s = scenario(); s.reglements = s.reglements.filter(r => r.facture !== 'FA-4002');
  const plan = P.construirePlan(s);
  assert.equal(plan.kpi.echu.aVerifier, 1);
  assert.equal(plan.kpi.echu.n, 0);
  assert.ok(!plan.actions.some(a => a.client === 'GARAGE FICTIF EPSILON'));
});

test('indicateurs EBP par période : montants en euros, commandes du téléphone non comptées', () => {
  const k = P.construirePlan(scenario()).kpi;
  assert.deepEqual(k.semaine, { debut: '2026-11-02', fin: '2026-11-08', cmdN: 2, cmdHt: 2800, facN: 1, facHt: 700 });
  assert.deepEqual(k.passee, { debut: '2026-10-26', fin: '2026-11-01', cmdN: 1, cmdHt: 1500, facN: 0, facHt: 0 });
  assert.deepEqual(k.avant, { debut: '2026-10-19', fin: '2026-10-25', cmdN: 1, cmdHt: 3000, facN: 2, facHt: 4800 });
  assert.deepEqual(k.mois, { debut: '2026-11-01', fin: '2026-11-30', cmdN: 2, cmdHt: 2800, facN: 1, facHt: 700 });
  assert.deepEqual(k.moisPrec, { debut: '2026-10-01', fin: '2026-10-31', cmdN: 3, cmdHt: 6300, facN: 2, facHt: 4800 });
  assert.deepEqual(k.echu, { n: 1, reste: 3600, sansMontant: 0, aVerifier: 0 });
});

test('plan : identifiants d’action stables d’un jour à l’autre (le téléphone garde « fait » / « reporté »)', () => {
  const a = P.construirePlan(scenario()), s = scenario();
  const b = P.construirePlan({ ...s, arrete: '2026-11-09', maintenant: '2026-11-09T07:00:00.000Z' });
  const ids = x => x.actions.map(y => y.id);
  for (const id of ids(a).filter(i => !i.includes('devis'))) assert.ok(ids(b).includes(id), id);
});

test('plan : reproductible, n’altère aucune donnée reçue', () => {
  const s = geler(scenario());
  assert.deepEqual(P.construirePlan(s), P.construirePlan(s)); // lèverait une erreur si une entrée gelée était modifiée
});

test('plan : refus clairs (date d’export absente ou dans le futur)', () => {
  const s = scenario();
  assert.throws(() => P.construirePlan({ ...s, arrete: '' }), /Date de l’export EBP obligatoire/);
  assert.throws(() => P.construirePlan({ ...s, arrete: '2026-11-07', aujourdhui: '2026-11-06' }), /futur/);
});

test('plan : format « sources » lu par le téléphone ; preuves incomplètes si historique court ou lignes écartées', () => {
  const plan = P.construirePlan(scenario());
  assert.deepEqual(plan.chiffre, { source: 'import', arrete: AUJ });
  assert.equal(plan.sources.ebpDate, AUJ);
  assert.deepEqual(plan.sources.importStats, { pieces: { ignorees: 1 } });
  const pc = plan.sources.preuvesCommerciales;
  assert.equal(pc.fiable, false);
  assert.match(pc.restrictions[0], /Historique des commandes EBP depuis le 2026-10-15 seulement : 12 mois nécessaires/);
  assert.match(pc.restrictions[1], /1 ligne\(s\) de pièces EBP écartée\(s\)/);
});

function historique() {
  const p = E.lirePieces(table('ebp-pieces-historique.csv'));
  return { piecesEbp: p.pieces, ignorees: p.ignorees.length, clientsEbp: E.lireClientsEbp(table('ebp-clients-historique.csv')).clients, arrete: AUJ, maintenant: MAINTENANT };
}

test('signaux : reconquête et baisse détectées sur 14 mois d’historique, compte bloqué exclu', () => {
  const plan = P.construirePlan(historique());
  assert.deepEqual(plan.sources.preuvesCommerciales, { fiable: true, restrictions: [], signaux: 2 });
  const sig = Object.fromEntries(plan.clients.filter(c => c.signaux && c.signaux.length).map(c => [c.nom, c.signaux]));
  assert.deepEqual(Object.keys(sig).sort(), ['GARAGE FICTIF OMEGA', 'GARAGE FICTIF SIGMA']);
  const o = sig['GARAGE FICTIF OMEGA'][0];
  assert.deepEqual([o.type, o.dateDernier, o.ca12, o.seuil], ['reconquete', '2026-07-15', 7200, 'Plus de 60 jours sans commande']);
  assert.match(o.titre, /Aucune commande depuis 114 j/);
  assert.match(o.preuve, /CA commandé sur 12 mois : 7 200,00 € HT, 9 commande\(s\)/);
  const g = sig['GARAGE FICTIF SIGMA'][0];
  assert.equal(g.type, 'baisse');
  assert.match(g.titre, /400,00 € sur 90 j contre 3 000,00 € avant/);
  assert.match(g.seuil, /50 %/);
});

test('reconquête : devient une action « Visite » avec preuve ; pièces sans suite anciennes = à vérifier, pas d’action', () => {
  const plan = P.construirePlan(historique());
  assert.deepEqual(plan.actions.map(a => [a.prio, a.tag, a.client]), [[1, 'Commande', 'GARAGE FICTIF KAPPA'], [1, 'Visite', 'GARAGE FICTIF OMEGA']]);
  const r = plan.actions[1];
  assert.equal(r.id, 'chaine:reconquete:C101');
  assert.match(r.preuve, /CA commandé sur 12 mois/);
  assert.deepEqual(plan.indicateurs.find(i => i.l === 'Pièces sans suite à vérifier'), { l: 'Pièces sans suite à vérifier', v: '26', n: 'plus de 20 j ouvrés : lien manquant dans l’export ?' });
  assert.deepEqual(P.verifierPlan(plan), []);
});

test('plan : conforme aux limites du téléphone, même avec des noms très longs', () => {
  const s = scenario();
  s.piecesEbp = s.piecesEbp.map(p => ({ ...p, client: p.client + ' ' + 'X'.repeat(110) }));
  const plan = P.construirePlan(s);
  assert.deepEqual(P.verifierPlan(plan), []);
  assert.ok(plan.actions.filter(a => a.source.startsWith('Export EBP')).every(a => a.client.endsWith('…') && a.client.length === 80), 'coupe signalée par « … »');
  assert.deepEqual(P.verifierPlan({ ...plan, version: 1 }), ['appli/version']);
});

// ---- Le VRAI code d'import du téléphone (app.js en service) accepte le plan sans rien perdre ----
function importTelephone() {
  const app = readFileSync(join(__dirname, '..', 'app.js'), 'utf8');
  const bloc = (debut, fin) => { const i = app.indexOf(debut), j = app.indexOf(fin, i); assert.ok(i > 0 && j > i, debut); return app.slice(i, j); };
  const code = [bloc('const clean =', '\n'), bloc('const lirePC =', '\n'), bloc('function nettoyerPlan(o)', 'function cartePC('), bloc('async function importerPlanPC(f)', 'async function pagePC(')].join('\n');
  const meta = new Map(), ctx = { confirm: () => true, get: async (s, k) => meta.get(k), put: async (s, v, k) => { meta.set(k, structuredClone(v)); }, Date, JSON, Math, Number, String, Array, Map, Object, isFinite };
  runInNewContext(code + '\nthis.importer = importerPlanPC;', ctx);
  return { importer: ctx.importer, meta };
}
const fichier = o => { const t = JSON.stringify(o); return { size: Buffer.byteLength(t), text: async () => t }; };

test('téléphone (code réel) : le plan est importé, actions, chiffres EBP et fiches intacts', async () => {
  const plan = P.construirePlan(scenario());
  const { importer, meta } = importTelephone();
  const recu = JSON.parse(JSON.stringify(await importer(fichier(plan)))); // objets d'un autre contexte : comparaison par contenu
  assert.ok(recu, 'import accepté');
  assert.equal(recu.actions.length, plan.actions.length);
  assert.deepEqual(recu.actions.map(a => [a.id, a.prio, a.t, a.d, a.tag, a.responsable, a.client, a.preuve, a.source, a.qualite]),
    plan.actions.map(a => [a.id, a.prio, a.t, a.d, a.tag, a.responsable, a.client, a.preuve, a.source, a.qualite]), 'aucun texte tronqué');
  for (const k of ['semaine', 'passee', 'avant', 'mois', 'moisPrec', 'echu']) assert.deepEqual(recu.kpi[k], plan.kpi[k], k);
  assert.deepEqual(recu.clients, plan.clients);
  assert.deepEqual(recu.indicateurs, plan.indicateurs);
  assert.equal(recu.arrete, AUJ);
  assert.ok(meta.get('pc'));
});

test('téléphone (code réel) : statut « fait » d’une action conservé au plan du lendemain', async () => {
  const { importer, meta } = importTelephone();
  await importer(fichier(P.construirePlan(scenario())));
  const h = meta.get('pcActions'), id = h[0].id;
  h[0] = { ...h[0], statut: 'fait', modifieLe: '2026-11-06T10:00:00.000Z' }; meta.set('pcActions', h);
  const demain = P.construirePlan({ ...scenario(), maintenant: '2026-11-07T07:00:00.000Z' });
  const recu = await importer(fichier(demain));
  assert.equal(recu.actions.find(a => a.id === id).statut, 'fait');
});
