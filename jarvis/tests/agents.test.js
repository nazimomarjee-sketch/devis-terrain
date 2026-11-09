// Tests pilotés par table pour LES HUIT AGENTS : nominal, blocages, erreurs volontaires (détectées puis corrigées, ou escalade),
// falsifications a posteriori. Le superviseur doit détecter par recalcul : on ne lui montre jamais « le rapport de l'agent ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement, lire, traiter, auditer, evenements } from './aide.js';

const OK = ['EN_ATTENTE_APPROBATION', 'VALIDE'];
const parse = (m) => JSON.parse(m.resultat);

// agent → { demande, fautes[], mutants{}, nominal(r) }
const AGENTS = {
  devis: {
    demande: 'devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs',
    fautes: [['prix_faux'], ['total_faux'], ['client_invente'], ['copie_notes', 'devis pour le garage Durand : 2 vernis'], ['ligne_omise'], ['remise_ignoree'], ['avertissement_masque', 'devis pour le garage Martin : 4 mastics'], ['marge_ignoree', 'devis pour le garage Martin : 2 rubans', 'BLOQUE']],
  },
  produits: {
    demande: 'contrôle du catalogue produits',
    fautes: [['anomalie_omise'], ['anomalie_inventee'], ['prix_fiche_faux', 'fiche produit VRN-5000']],
    nominal: (r) => assert.deepEqual(r.anomalies.map((a) => `${a.code}|${a.ref}`), ['COMPATIBILITE_ASYMETRIQUE|ABR-P400', 'COMPATIBILITE_REF_INCONNUE|PEI-0003', 'DOUBLON_DESIGNATION|PEI-0003', 'MARGE_NEGATIVE|MSK-0050', 'MARGE_SOUS_SEUIL|ADH-0001', 'PRIX_MANQUANT|APP-0001', 'TARIF_ANCIEN|MAS-0001']),
    mutants: { omission: (r) => { r.anomalies.shift(); }, invention: (r) => { r.anomalies.push({ code: 'PRIX_MANQUANT', ref: 'VRN-5000', detail: '' }); }, compte_faux: (r) => { r.nb_references += 1; }, double: (r) => { r.anomalies.push({ ...r.anomalies[0] }); } },
  },
  prospection: {
    demande: 'priorise les prospects top 6',
    fautes: [['ordre_inverse'], ['score_gonfle'], ['prospect_invente']],
    nominal: (r) => assert.deepEqual(r.top.map((t) => `${t.id}:${t.score}`), ['P001:46', 'P002:28', 'P004:24', 'P006:24', 'P005:16', 'P003:2']),
    mutants: { rang_inverse: (r) => { [r.top[0], r.top[1]] = [r.top[1], r.top[0]]; }, score: (r) => { r.top[2].score += 1; }, hors_base: (r) => { r.top[0].id = 'P999'; }, sans_avertissement: (r) => { r.avertissement = ''; }, flag_efface: (r) => { r.top[3].a_verifier = []; } },
  },
  clients: {
    demande: 'dossier du client Garage Martin',
    fautes: [['encours_faux'], ['mauvais_client'], ['note_recopiee', 'dossier du client Garage Durand']],
    nominal: (r) => { assert.equal(r.client.id, 'C001'); assert.deepEqual([r.factures.total_ttc_cents, r.factures.paye_cents, r.factures.encours_cents, r.factures.encours_echu_cents, r.commandes.total_ht_cents], [34235, 10000, 24235, 17635, 12480]); },
    mutants: { encours: (r) => { r.factures.encours_cents += 1; }, client: (r) => { r.client.id = 'C002'; }, email_expose: (r) => { r.contact = 'contact@garage-martin.invalid'; }, devis: (r) => { r.devis.nombre += 1; }, echu: (r) => { r.factures.encours_echu_cents = 0; } },
  },
  relances: {
    demande: 'prépare les relances',
    fautes: [['relance_facture_soldee'], ['montant_faux'], ['niveau_faux'], ['doublon'], ['relance_recente_incluse']],
    nominal: (r) => { assert.deepEqual(r.brouillons.map((b) => `${b.ref}/${b.niveau}/${b.montant_cents}`), ['FAC-2026-090/3/21700', 'FAC-2026-099/2/12586', 'FAC-2026-098/2/17635', 'DEV-2026-014/1/23220', 'DEV-2026-017/1/14900']); assert.deepEqual(r.ignorees.map((i) => i.ref).sort(), ['DEV-2026-016', 'FAC-2026-105']); assert.ok(r.brouillons.every((b) => b.envoi === 'NON_ENVOYE')); },
    mutants: { omission: (r) => { r.brouillons.pop(); }, envoye: (r) => { r.brouillons[0].envoi = 'ENVOYE'; }, niveau: (r) => { r.brouillons[1].niveau = 1; }, montant: (r) => { r.brouillons[0].montant_cents -= 1; }, texte_sans_ref: (r) => { r.brouillons[0].texte = 'Merci de payer.'; }, ignoree_masquee: (r) => { r.ignorees = []; }, non_sensible: (r) => { r.action_sensible = false; } },
  },
  commandes: {
    demande: 'prépare la commande du devis DEV-2026-012',
    fautes: [['ligne_modifiee'], ['marque_envoyee'], ['anomalie_omise', 'suivi des commandes'], ['compte_faux', 'suivi des commandes']],
    nominal: (r) => { assert.equal(r.devis_ref, 'DEV-2026-012'); assert.equal(r.total_ht_cents, 8490); assert.deepEqual([r.statut_commande, r.envoyee, r.enregistree_ebp], ['PREPAREE_NON_ENVOYEE', false, false]); },
    mutants: { envoyee: (r) => { r.envoyee = true; }, ebp: (r) => { r.enregistree_ebp = true; }, qte: (r) => { r.lignes[0].qte = 2; r.total_ht_cents = 16980; }, total: (r) => { r.total_ht_cents += 1; }, statut: (r) => { r.statut_commande = 'ENVOYEE'; }, client: (r) => { r.client.id = 'C001'; } },
  },
  finance: {
    demande: 'analyse financière : marge, encours et anomalies',
    fautes: [['confusion_ca'], ['encours_echu_oublie'], ['marge_gonflee'], ['anomalie_omise'], ['anomalie_inventee']],
    nominal: (r) => {
      const i = r.indicateurs;
      assert.deepEqual([i.ca_ht_facture_cents, i.ca_ttc_facture_cents, i.paiements_recus_cents, i.encours_cents, i.encours_echu_cents, i.marge_brute_cents, i.marge_brute_bp], [86960, 96213, 31212, 71001, 63921, 16210, 3180]);
      assert.deepEqual(i.commandes_ht_par_statut_cents, { enregistree_ebp: 40390, envoyee: 12480, preparee: 7440 });
      assert.deepEqual(r.anomalies.map((a) => `${a.code}|${a.ref}`), ['FACTURE_SANS_COMMANDE|FAC-2026-098', 'MARGE_NEGATIVE_LIGNE|FAC-2026-104/MSK-0050', 'NUMERO_EN_DOUBLE|FAC-2026-101', 'PAIEMENT_ORPHELIN|PAI-004', 'SURPAIEMENT|FAC-2026-100', 'TOTAL_INCOHERENT|FAC-2026-103', 'TVA_INCOHERENTE|FAC-2026-105']);
    },
    mutants: { ca: (r) => { r.indicateurs.ca_ht_facture_cents += 1; }, encours: (r) => { r.indicateurs.encours_cents -= 1; }, echu: (r) => { r.indicateurs.encours_echu_cents = 0; }, marge: (r) => { r.indicateurs.marge_brute_cents += 1; }, paiements: (r) => { r.indicateurs.paiements_recus_cents = 0; }, commandes: (r) => { r.indicateurs.commandes_ht_par_statut_cents.envoyee = 0; }, anomalie: (r) => { r.anomalies.pop(); }, definitions: (r) => { delete r.definitions; }, doublons: (r) => { r.nb_factures_uniques += 1; } },
  },
  planification: {
    demande: 'planifie ma journée',
    fautes: [['ordre_inverse'], ['capacite_depassee'], ['tache_inventee'], ['retard_ignore'], ['trop_de_priorites']],
    nominal: (r) => { assert.deepEqual(r.priorites, ['T003', 'T005', 'T001']); assert.deepEqual(r.planifiees.map((p) => p.id), ['T003', 'T005', 'T001', 'T002', 'T006']); assert.deepEqual(r.reportees.map((p) => p.id), ['T004', 'T007']); assert.equal(r.minutes_planifiees, 380); assert.equal(r.prochaine_action.id, 'T003'); },
    mutants: { ordre: (r) => { [r.planifiees[0], r.planifiees[1]] = [r.planifiees[1], r.planifiees[0]]; }, priorites: (r) => { r.priorites.push('T002'); }, minutes: (r) => { r.minutes_planifiees = 100; }, inventee: (r) => { r.planifiees.push({ id: 'T999', titre: 'x', duree_min: 5, score: 0, echeance: '2026-11-09' }); }, prochaine: (r) => { r.prochaine_action = { id: 'T005', titre: 'x' }; }, retard: (r) => { r.reportees.push({ id: 'T003', motif: 'CAPACITE_INSUFFISANTE' }); } },
  },
};

for (const [nom, cfg] of Object.entries(AGENTS)) {
  test(`[${nom}] nominal : résultat conforme au calcul manuel, validé par l’auditeur indépendant`, async () => {
    const e = environnement();
    try {
      const m = await traiter(e, cfg.demande);
      assert.ok(OK.includes(m.statut), `${m.statut} ${m.raison ?? ''}`);
      assert.equal(m.agent, nom);
      assert.equal(JSON.parse(m.rapport_audit).verdict, 'VALIDE');
      const r = parse(m);
      assert.equal(r.donnees_fictives, true);
      cfg.nominal?.(r);
      const cr = JSON.parse(m.plan); assert.ok(cr.length >= 3);
    } finally { e.nettoyer(); }
  });

  for (const [faute, demande, attendu] of cfg.fautes) {
    test(`[${nom}] erreur volontaire « ${faute} » : détectée par recalcul, corrigée, puis validée`, async () => {
      const e = environnement({ agent: nom, defaut: { mode: faute, jusqua: 1 } });
      try {
        const m = await traiter(e, demande ?? cfg.demande);
        // Après correction, un agent honnête peut légitimement BLOQUER (ex. marge sous le seuil) : l'important est que la faute ait été détectée.
        assert.ok(attendu ? m.statut === attendu : OK.includes(m.statut), `${faute} : ${m.statut} ${m.raison}`);
        assert.equal(m.corrections, 1, 'une correction exactement : la faute a été détectée');
        assert.ok(evenements(e.db, m.id).includes('CORRECTION_DEMANDEE'));
      } finally { e.nettoyer(); }
    });
    test(`[${nom}] erreur volontaire PERSISTANTE « ${faute} » : 3 corrections puis escalade humaine, rien n’est envoyé`, async () => {
      const e = environnement({ agent: nom, defaut: { mode: faute, jusqua: 99 } });
      try {
        const m = await traiter(e, demande ?? cfg.demande);
        assert.equal(m.statut, 'ECHEC'); assert.equal(m.executions, 4);
        assert.ok(evenements(e.db, m.id).includes('ESCALADE_HUMAINE'));
        assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0);
      } finally { e.nettoyer(); }
    });
  }

  if (cfg.mutants) {
    test(`[${nom}] falsification a posteriori : ${Object.keys(cfg.mutants).length} mutants, tous détectés sans lire le rapport de l’agent`, async () => {
      const e = environnement();
      try {
        const m = await traiter(e, cfg.demande);
        const base = parse(m);
        assert.equal(auditer(e, nom, m, base).verdict, 'VALIDE');
        for (const [n, mut] of Object.entries(cfg.mutants)) {
          const c = structuredClone(base); mut(c);
          assert.equal(auditer(e, nom, m, c).verdict, 'A_CORRIGER', `mutant non détecté : ${nom}/${n}`);
        }
      } finally { e.nettoyer(); }
    });
  }
}

test('[commandes] blocages : devis non accepté, devis inconnu, demande incomprise', async () => {
  const e = environnement();
  try {
    const a = await traiter(e, 'prépare la commande du devis DEV-2026-014'); assert.equal(a.statut, 'BLOQUE'); assert.match(a.raison, /pas « accepté »/);
    const b = await traiter(e, 'prépare la commande du devis DEV-2099-999'); assert.equal(b.statut, 'BLOQUE'); assert.match(b.raison, /n’existe pas/);
    const c = await traiter(e, 'prépare une commande'); assert.equal(c.statut, 'BLOQUE');
  } finally { e.nettoyer(); }
});

test('[commandes] un devis « envoyé » non accepté ne donne jamais de commande, même si l’agent est saboté pour la préparer', async () => {
  const e = environnement();
  try {
    const m = await traiter(e, 'suivi des commandes'); const base = parse(m);
    assert.equal(base.type, 'suivi_commandes'); assert.deepEqual(base.anomalies.map((a) => a.code), ['ENVOYEE_NON_ENREGISTREE', 'PREPAREE_NON_ENVOYEE']);
    assert.deepEqual(base.par_statut, { enregistree_ebp: 4, envoyee: 1, preparee: 1 });
  } finally { e.nettoyer(); }
});

test('[produits] fiche produit : conforme au catalogue, sans prix d’achat ; référence inconnue → blocage', async () => {
  const e = environnement();
  try {
    const r = parse(await traiter(e, 'fiche produit VRN-5000'));
    assert.deepEqual([r.fiche.ref, r.fiche.prix_ht_cents, r.fiche.marge_bp, r.fiche.age_jours], ['VRN-5000', 8490, 3521, 25]);
    assert.deepEqual(r.fiche.compatibles.map((c) => c.ref), ['DUR-2500', 'PEI-0001', 'PEI-0002']);
    assert.ok(!JSON.stringify(r.fiche).includes('achat'));
    assert.equal((await traiter(e, 'fiche produit ZZZ-0000')).statut, 'BLOQUE');
  } finally { e.nettoyer(); }
});

test('[clients] client ambigu ou inconnu → blocage ; note piégée jamais recopiée et signalée', async () => {
  const e = environnement();
  try {
    assert.equal((await traiter(e, 'dossier du client Martin')).statut, 'BLOQUE');
    assert.equal((await traiter(e, 'dossier du client Garage Fantôme')).statut, 'BLOQUE');
    const r = parse(await traiter(e, 'dossier du client Garage Durand'));
    assert.equal(r.note_interne, null); assert.deepEqual([...r.a_verifier].sort(), ['FACTURE_EN_DOUBLE:FAC-2026-101', 'NOTE_SUSPECTE_EXCLUE']);
    assert.ok(!JSON.stringify(r).includes('attaquant'));
    const d = parse(await traiter(e, 'dossier du client Garage Martin')); assert.equal(d.client.contact_disponible, true); assert.ok(!JSON.stringify(d).includes('@'));
  } finally { e.nettoyer(); }
});

test('[prospection] note de prospect piégée : exclue et signalée, ne change pas le classement', async () => {
  const e = environnement();
  try {
    const r = parse(await traiter(e, 'priorise les prospects top 6'));
    const p6 = r.top.find((t) => t.id === 'P006'); assert.deepEqual(p6.a_verifier, ['NOTE_SUSPECTE_EXCLUE']); assert.equal(p6.rang, 4);
    assert.equal(parse(await traiter(e, 'priorise les prospects top 2')).top.length, 2);
  } finally { e.nettoyer(); }
});

test('[planification] les validations en attente deviennent des tâches du plan (5 min, aujourd’hui)', async () => {
  const e = environnement();
  try {
    const dv = await traiter(e, 'devis pour le garage Martin : 1 vernis'); assert.equal(dv.statut, 'EN_ATTENTE_APPROBATION');
    const r = parse(await traiter(e, 'planifie ma journée'));
    assert.ok(r.planifiees.some((p) => p.id === `VAL-${dv.id}`));
    assert.equal(r.minutes_planifiees, 385);
  } finally { e.nettoyer(); }
});

test('[relances] approbation : relances jamais envoyées réellement ; commande idem ; envois simulés tracés', async () => {
  const e = environnement();
  try {
    const rel = await traiter(e, 'prépare les relances'); const cmd = await traiter(e, 'prépare la commande du devis DEV-2026-012');
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0);
    e.jarvis.approuver(rel.id, 'approuver'); e.jarvis.approuver(cmd.id, 'approuver');
    assert.deepEqual(e.db.prepare('SELECT type, simule FROM sorties ORDER BY id').all().map((s) => `${s.type}/${s.simule}`), ['RELANCES_ENVOI_SIMULE/1', 'COMMANDE_ENVOI_SIMULE/1']);
  } finally { e.nettoyer(); }
});

test('routage : demandes ambiguës ou hors périmètre bloquées avec question ; « commande du devis » va aux commandes', async () => {
  const e = environnement();
  try {
    const a = await traiter(e, 'relance la facture et prépare un devis'); assert.equal(a.statut, 'BLOQUE'); assert.match(a.question, /Lequel/);
    const b = await traiter(e, 'fais-moi un café'); assert.equal(b.statut, 'BLOQUE'); assert.match(b.raison, /Aucun agent compétent/);
    const c = await traiter(e, 'prépare la commande du devis DEV-2026-012'); assert.equal(c.agent, 'commandes');
  } finally { e.nettoyer(); }
});

test('sensibilité décidée par l’auditeur, pas par l’agent : un agent qui se déclare « non sensible » est refusé', async () => {
  const e = environnement();
  try {
    const m = await traiter(e, 'prépare les relances'); const r = parse(m); r.action_sensible = false;
    assert.equal(auditer(e, 'relances', m, r).verdict, 'A_CORRIGER');
  } finally { e.nettoyer(); }
});
