import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { environnement, lire, traiter, auditer, DEMANDE_TYPE } from './aide.js';
import { genererPdf } from '../src/pdf.js';
import { definirRegle } from '../src/regles.js';

const pdfTexte = (e, r) => readFileSync(join(e.dossierSorties, r.fichiers.pdf.chemin)).toString('latin1');

// Calcul fait à la main : 3×84,90 + 2×31,20 + 10×0,85 = 325,60 ; remise 10 % ligne par ligne → net 293,04 ; TVA 8,5 % → 24,91 ; TTC 317,95.
test('devis nominal : montants, fichiers, mentions « fictif », approbation obligatoire', async () => {
  const e = environnement();
  try {
    const m = await traiter(e, DEMANDE_TYPE);
    assert.equal(m.statut, 'EN_ATTENTE_APPROBATION');
    const r = JSON.parse(m.resultat);
    assert.deepEqual([r.total_ht_cents, r.tva_cents, r.total_ttc_cents], [29304, 2491, 31795]);
    assert.equal(r.ebp_enregistre, false);
    assert.equal(r.donnees_fictives, true);
    assert.equal(r.tva_regle.statut, 'FICTIF_DEMO');
    assert.ok(!JSON.stringify(r).includes('achat'), 'aucun prix d’achat dans le devis');
    const pdf = pdfTexte(e, r);
    assert.match(pdf, /PRIX ET DONNEES FICTIFS/); assert.match(pdf, /NON ENREGISTR/); assert.match(pdf, /règle de démonstration NON VALID/);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0);
    assert.deepEqual(e.jarvis.approuver(m.id, 'approuver'), { statut: 'VALIDE', envoi: 'SIMULE' });
    assert.equal(e.db.prepare('SELECT type, simule FROM sorties').get().simule, 1);
  } finally { e.nettoyer(); }
});

test('le PDF généré a une table xref valide (offsets exacts)', () => {
  const s = genererPdf(['Bonjour', 'Total : 12,00 EUR', 'Ligne avec (parenthèses) et \\ antislash']).toString('latin1');
  const start = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]);
  assert.ok(s.startsWith('xref', start));
  [...s.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((x) => Number(x[1])).forEach((off, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, off)));
});

test('TVA selon le territoire et l’opération (règles de démonstration), jamais un taux unique codé en dur', async () => {
  const e = environnement();
  try {
    const m1 = await traiter(e, 'devis pour le garage Métropole Test : 2 vernis'); // métropole, vente locale, 20 %
    const r1 = JSON.parse(m1.resultat);
    assert.deepEqual([r1.tva_pct, r1.total_ht_cents, r1.tva_cents, r1.total_ttc_cents], ['20', 16980, 3396, 20376]);
    const m2 = await traiter(e, 'devis export pour le garage Métropole Test : 2 vernis'); // export : 0 %
    const r2 = JSON.parse(m2.resultat);
    assert.deepEqual([r2.operation, r2.tva_pct, r2.tva_cents, r2.total_ttc_cents], ['export', '0', 0, 16980]);
    const m3 = await traiter(e, 'devis pour le garage Martin : 2 vernis'); // La Réunion : 8,5 %, remise 10 %
    assert.equal(JSON.parse(m3.resultat).tva_pct, '8.5');
    // Territoire sans règle : blocage + question, aucun taux deviné.
    const m4 = await traiter(e, 'devis pour le garage Mayotte Test : 2 vernis');
    assert.equal(m4.statut, 'BLOQUE'); assert.match(m4.question, /règle de TVA/);
    // Opération sans règle (export depuis La Réunion).
    const m5 = await traiter(e, 'devis export pour le garage Martin : 2 vernis');
    assert.equal(m5.statut, 'BLOQUE'); assert.match(m5.raison, /Aucune règle de TVA/);
  } finally { e.nettoyer(); }
});

test('règles : une règle NON VALIDÉE bloque ; validée par l’administrateur, elle sert et la mention « non validée » disparaît', async () => {
  const e = environnement();
  try {
    const r0 = JSON.parse((await traiter(e, DEMANDE_TYPE)).resultat);
    definirRegle(e.db, { type: 'tva', cle: 'reunion|vente_locale', valeur: { taux_pct: '8.5' }, justification: 'Vérifié avec l’expert-comptable (démo)', source: 'avis écrit fictif', statut: 'NON_VALIDE' }, 'administrateur');
    const bloque = await traiter(e, DEMANDE_TYPE);
    assert.equal(bloque.statut, 'BLOQUE'); assert.match(bloque.raison, /pas validée/);
    definirRegle(e.db, { type: 'tva', cle: 'reunion|vente_locale', valeur: { taux_pct: '8.5' }, justification: 'Vérifié avec l’expert-comptable (démo)', source: 'avis écrit fictif', statut: 'VALIDE' }, 'administrateur');
    const m = await traiter(e, DEMANDE_TYPE);
    assert.equal(m.statut, 'EN_ATTENTE_APPROBATION');
    const r = JSON.parse(m.resultat);
    assert.equal(r.tva_regle.statut, 'VALIDE');
    assert.ok(!/règle de démonstration NON VALID/.test(pdfTexte(e, r)));
    assert.equal(r0.total_ttc_cents, r.total_ttc_cents);
    // Une règle sans justification ou sans source est refusée à l'écriture.
    assert.throws(() => definirRegle(e.db, { type: 'tva', cle: 'x|y', valeur: {}, justification: '', source: 's', statut: 'VALIDE' }, 'administrateur'), /Justification/);
    assert.throws(() => definirRegle(e.db, { type: 'tva', cle: 'x|y', valeur: {}, justification: 'j', source: '', statut: 'VALIDE' }, 'administrateur'), /source/);
  } finally { e.nettoyer(); }
});

test('règle supprimée : blocage « règle absente », jamais de valeur par défaut silencieuse', async () => {
  const e = environnement();
  try {
    e.db.prepare(`DELETE FROM regles WHERE type='remise_max_pct'`).run();
    const m = await traiter(e, DEMANDE_TYPE);
    assert.equal(m.statut, 'BLOQUE'); assert.match(m.question, /remise_max_pct/);
  } finally { e.nettoyer(); }
});

test('quantités, références, remises et marges : JARVIS bloque et pose une question, il ne devine pas', async () => {
  const e = environnement();
  try {
    const cas = [
      'devis pour le garage Martin : 2 peintures', 'devis pour Martin : 3 vernis', 'devis pour le garage Inconnu : 3 vernis', 'devis pour le garage Martin : 15 abrasifs',
      'devis pour le garage Martin : 2 apprêts', 'devis pour le garage Remise Folle : 1 vernis', 'devis pour le garage Martin : 2 trucs', 'fais-moi un devis sans structure',
      'devis pour le garage Sans Justification : 1 vernis', 'devis pour le garage Martin : 2 rubans', 'devis pour le garage Martin : 3 colles',
    ];
    const codes = [];
    for (const d of cas) {
      const m = await traiter(e, d);
      assert.equal(m.statut, 'BLOQUE', d); assert.ok(m.question?.length > 5, d); assert.equal(JSON.parse(m.rapport_audit).verdict, 'BLOQUE');
      codes.push(m.raison);
    }
    assert.match(codes[8], /sans justification/); assert.match(codes[9], /marge/); assert.match(codes[10], /marge/);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0);
  } finally { e.nettoyer(); }
});

test('tarif ancien : devis préparé, avertissement obligatoire', async () => {
  const e = environnement();
  try {
    const r = JSON.parse((await traiter(e, 'devis pour le garage Martin : 4 mastics')).resultat);
    assert.deepEqual(r.avertissements.map((a) => a.ref), ['MAS-0001']);
  } finally { e.nettoyer(); }
});

test('références explicites et remise client différente', async () => {
  const e = environnement();
  try {
    const r = JSON.parse((await traiter(e, 'devis pour Carrosserie Martin & Fils : 1 x VRN-5000')).resultat);
    assert.deepEqual([r.client.id, r.remise_pct, r.lignes[0].remise_cents, r.total_ht_cents, r.tva_cents, r.total_ttc_cents], ['C002', '5', 425, 8065, 686, 8751]);
    assert.equal(r.remise_justification, 'Remise de démarrage fictive');
  } finally { e.nettoyer(); }
});

test('l’auditeur recalcule indépendamment : 200 combinaisons aléatoires (clients, quantités) sans écart', async () => {
  const e = environnement();
  try {
    let g = 12345; const alea = (n) => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g % n; };
    for (let i = 0; i < 200; i++) {
      const d = `devis${alea(4) === 0 ? ' export' : ''} pour le garage ${['Martin', 'Durand', 'Métropole Test'][alea(3)]} : ${1 + alea(40)} vernis, ${1 + alea(40)} durcisseurs et ${(1 + alea(20)) * 10} abrasifs`;
      const m = await traiter(e, d);
      // Soit validé, soit bloqué pour une raison de règle (ex. export depuis La Réunion) : jamais en échec ni en correction.
      assert.ok(['EN_ATTENTE_APPROBATION', 'BLOQUE'].includes(m.statut), `${d} → ${m.statut} ${m.raison}`);
      assert.equal(m.corrections, 0, d);
    }
  } finally { e.nettoyer(); }
});

test('l’auditeur rejette 12 falsifications d’un devis (client, prix, total, EBP, TVA, remise, marge, fichiers, fictif…)', async () => {
  const e = environnement();
  try {
    const m = await traiter(e, DEMANDE_TYPE);
    const base = JSON.parse(m.resultat);
    assert.equal(auditer(e, 'devis', m, base).verdict, 'VALIDE');
    const mutants = {
      client_invente: (r) => { r.client.id = 'C999'; }, prix_modifie: (r) => { r.lignes[0].pu_ht_cents += 1; }, total_modifie: (r) => { r.total_ttc_cents += 1; },
      ebp_presente_enregistre: (r) => { r.ebp_enregistre = true; }, ligne_supprimee: (r) => { r.lignes.pop(); }, reference_inventee: (r) => { r.lignes[0].ref = 'ZZZ-9999'; },
      tva_non_autorisee: (r) => { r.tva_pct = '20'; }, fichier_hors_dossier: (r) => { r.fichiers.pdf.chemin = '../../etc/passwd'; },
      remise_modifiee: (r) => { r.remise_pct = '50'; }, justification_effacee: (r) => { r.remise_justification = ''; },
      declare_non_fictif: (r) => { r.donnees_fictives = false; }, degrade_en_non_sensible: (r) => { r.action_sensible = false; },
      regle_validee_a_tort: (r) => { r.regles_utilisees[0].statut = 'VALIDE'; }, achat_expose: (r) => { r.lignes[0].achat_cents = 5500; },
    };
    for (const [nom, mut] of Object.entries(mutants)) { const c = structuredClone(base); mut(c); assert.equal(auditer(e, 'devis', m, c).verdict, 'A_CORRIGER', `mutant non détecté : ${nom}`); }
  } finally { e.nettoyer(); }
});
