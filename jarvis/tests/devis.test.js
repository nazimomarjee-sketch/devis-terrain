import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { environnement, lire, DEMANDE_TYPE, FICTIF } from './aide.js';
import { chargerDonnees } from '../src/donnees.js';
import { auditerDevis } from '../src/auditeur.js';
import { genererPdf } from '../src/pdf.js';

// Calcul fait à la main, hors du code : 3×84,90 + 2×31,20 + 10×0,85 = 254,70 + 62,40 + 8,50 = 325,60 brut.
// Remise client 10 % ligne par ligne : 25,47 + 6,24 + 0,85 = 32,56 → net 229,23 + 56,16 + 7,65 = 293,04 HT.
// TVA 8,5 % : 293,04 × 0,085 = 24,9084 → 24,91. TTC = 317,95.
test('devis nominal : montants, fichiers, et approbation humaine obligatoire', async () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    const actions = await e.jarvis.executerJusquaVide();
    assert.equal(actions.length, 1);
    const m = lire(e.db, id);
    assert.equal(m.statut, 'EN_ATTENTE_APPROBATION');
    const r = JSON.parse(m.resultat);
    assert.equal(r.total_ht_cents, 29304);
    assert.equal(r.tva_cents, 2491);
    assert.equal(r.total_ttc_cents, 31795);
    assert.equal(r.ebp_enregistre, false);
    assert.equal(r.client.id, 'C001');
    assert.equal(JSON.parse(m.rapport_audit).verdict, 'VALIDE');
    // Rien n'est parti avant la validation humaine.
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0);
    // Les fichiers existent vraiment.
    const pdf = readFileSync(join(e.racine, 'sorties', r.fichiers.pdf.chemin));
    assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
    assert.match(readFileSync(join(e.racine, 'sorties', r.fichiers.eml.chemin), 'utf8'), /X-Jarvis-Statut: BROUILLON/);
    // Approbation : l'envoi est SIMULÉ et tracé.
    const dec = e.jarvis.approuver(id, 'approuver');
    assert.deepEqual(dec, { statut: 'VALIDE', envoi: 'SIMULE' });
    const sortie = e.db.prepare('SELECT * FROM sorties').get();
    assert.equal(sortie.simule, 1);
    assert.equal(sortie.type, 'MAIL_ENVOI_SIMULE');
  } finally { e.nettoyer(); }
});

test('le PDF généré a une table xref valide (offsets exacts)', () => {
  const pdf = genererPdf(['Bonjour', 'Total : 12,00 EUR', 'Ligne avec (parenthèses) et \\ antislash']);
  const s = pdf.toString('latin1');
  const start = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]);
  assert.ok(s.startsWith('xref', start));
  const offsets = [...s.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.ok(offsets.length >= 4);
  offsets.forEach((off, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, off), `objet ${i + 1} mal placé`));
});

test('quantités et références ambiguës : JARVIS bloque et pose une question, il ne devine pas', async () => {
  const e = environnement();
  try {
    const cas = [
      ['devis pour le garage Martin : 2 peintures', 'REFERENCE_AMBIGUE'],
      ['devis pour Martin : 3 vernis', 'CLIENT_AMBIGU'], // « Martin » seul ne désigne pas un client exact
      ['devis pour le garage Inconnu : 3 vernis', 'CLIENT_INCONNU'],
      ['devis pour le garage Martin : 15 abrasifs', 'CONDITIONNEMENT'],
      ['devis pour le garage Martin : 2 apprêts', 'TARIF_MANQUANT'],
      ['devis pour le garage Remise Folle : 1 vernis', 'REMISE_HORS_PLAFOND'],
      ['devis pour le garage Martin : 2 trucs', 'REFERENCE_INCONNUE'],
      ['fais-moi un devis sans structure', 'DEMANDE_INCOMPRISE'],
    ];
    for (const [demande, code] of cas) {
      const { id } = e.jarvis.deposerParUtilisateur(demande);
      await e.jarvis.executerJusquaVide();
      const m = lire(e.db, id);
      assert.equal(m.statut, 'BLOQUE', demande);
      assert.ok(m.question && m.question.length > 5, `question manquante : ${demande}`);
      const audit = JSON.parse(m.rapport_audit);
      assert.equal(audit.verdict, 'BLOQUE');
      assert.ok(m.raison, code);
    }
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0);
  } finally { e.nettoyer(); }
});

test('tarif ancien : le devis est préparé mais l’avertissement est obligatoire', async () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur('devis pour le garage Martin : 4 mastics');
    await e.jarvis.executerJusquaVide();
    const r = JSON.parse(lire(e.db, id).resultat);
    assert.equal(r.avertissements.length, 1);
    assert.equal(r.avertissements[0].code, 'TARIF_ANCIEN');
    assert.equal(r.avertissements[0].ref, 'MAS-0001');
  } finally { e.nettoyer(); }
});

test('références explicites (codes) acceptées, remise client différente appliquée', async () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur('devis pour Carrosserie Martin & Fils : 1 x VRN-5000');
    await e.jarvis.executerJusquaVide();
    const m = lire(e.db, id);
    assert.equal(m.statut, 'EN_ATTENTE_APPROBATION');
    const r = JSON.parse(m.resultat);
    assert.equal(r.client.id, 'C002');
    assert.equal(r.remise_pct, '5');
    // 84,90 − 5 % (4,245 → 4,25 arrondi demi supérieur) = 80,65 ; TVA 8,5 % = 6,85525 → 6,86 ; TTC 87,51.
    assert.equal(r.lignes[0].remise_cents, 425);
    assert.equal(r.total_ht_cents, 8065);
    assert.equal(r.tva_cents, 686);
    assert.equal(r.total_ttc_cents, 8751);
  } finally { e.nettoyer(); }
});

test('l’auditeur recalcule indépendamment : propriété sur 200 combinaisons aléatoires', async () => {
  const e = environnement();
  try {
    let graine = 12345;
    const alea = (n) => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine % n; };
    for (let i = 0; i < 200; i++) {
      const demande = `devis pour le garage ${['Martin', 'Durand'][alea(2)]} : ${1 + alea(40)} vernis, ${1 + alea(40)} durcisseurs et ${(1 + alea(20)) * 10} abrasifs`;
      const { id } = e.jarvis.deposerParUtilisateur(demande);
      await e.jarvis.tick();
      const m = lire(e.db, id);
      assert.equal(m.statut, 'EN_ATTENTE_APPROBATION', `${demande} → ${m.statut} ${m.raison ?? ''}`);
    }
  } finally { e.nettoyer(); }
});

test('l’auditeur rejette un résultat falsifié (client, prix, total, EBP)', async () => {
  const e = environnement();
  try {
    const { id } = e.jarvis.deposerParUtilisateur(DEMANDE_TYPE);
    await e.jarvis.executerJusquaVide();
    const m = lire(e.db, id);
    const base = JSON.parse(m.resultat);
    const donnees = chargerDonnees(FICTIF);
    const ctx = (r) => ({ mission: m, resultat: r, donnees, params: { tva_pct: '8.5', remise_max_pct: '60', anciennete_tarif_jours: 90 }, dossierSorties: join(e.racine, 'sorties') });
    assert.equal(auditerDevis(ctx(base)).verdict, 'VALIDE');
    const mutants = {
      client_invente: (r) => { r.client.id = 'C999'; },
      prix_modifie: (r) => { r.lignes[0].pu_ht_cents += 1; },
      total_modifie: (r) => { r.total_ttc_cents += 1; },
      ebp_presente_enregistre: (r) => { r.ebp_enregistre = true; },
      ligne_supprimee: (r) => { r.lignes.pop(); },
      reference_inventee: (r) => { r.lignes[0].ref = 'ZZZ-9999'; },
      tva_non_autorisee: (r) => { r.tva_pct = '20'; },
      fichier_hors_dossier: (r) => { r.fichiers.pdf.chemin = '../../etc/passwd'; },
    };
    for (const [nom, mutation] of Object.entries(mutants)) {
      const copie = structuredClone(base);
      mutation(copie);
      assert.equal(auditerDevis(ctx(copie)).verdict, 'A_CORRIGER', `mutant non détecté : ${nom}`);
    }
  } finally { e.nettoyer(); }
});
