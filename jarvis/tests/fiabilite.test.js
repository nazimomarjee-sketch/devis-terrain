// FIABILITÉ MÉTIER : test différentiel agent ↔ auditeur sur données ALÉATOIRES, oracle indépendant, fuzzing des demandes,
// validation des données, traçabilité, exercice de restauration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environnement, traiter, lire, FICTIF, DEMANDE_TYPE } from './aide.js';
import { genererJeu, prng } from './generateur.js';
import { validerJeux } from '../src/validation.js';
import { verifierTracabilite } from '../src/tracabilite.js';
import { diagnostic } from '../src/sante.js';
import { sauvegarder, exercerRestauration } from '../src/sauvegarde.js';
import { horloge } from '../src/horloge.js';
import { lancerSondes } from '../src/agents/sondes.js';
import { spawnSync } from 'node:child_process';

const OK = ['VALIDE', 'EN_ATTENTE_APPROBATION', 'BLOQUE'];

test('DIFFÉRENTIEL : 60 jeux de données aléatoires × 8 agents — agent et auditeur indépendant ne divergent JAMAIS (aucune correction, aucun échec)', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'diff-')); const stats = { missions: 0, valides: 0, bloques: 0 }; const divergences = [];
  try {
    for (let graine = 1; graine <= 60; graine++) {
      const jeu = join(racine, `jeu-${graine}`); const g = genererJeu(jeu, graine * 7919);
      const e = environnement({ dossierJeu: jeu });
      try {
        const r = prng(graine); const cl = g.clients[Math.floor(r() * g.clients.length)]; const ref = g.references[Math.floor(r() * g.references.length)];
        const accepte = g.devis.find((d) => d.statut === 'accepte') ?? g.devis[0];
        const demandes = [`devis pour ${cl.nom} : ${1 + Math.floor(r() * 12)} ${ref.mots[0]}`, `devis pour ${cl.nom} : ${ref.multiple * (1 + Math.floor(r() * 4))} x ${ref.ref}`, 'contrôle du catalogue produits', `fiche produit ${ref.ref}`, 'priorise les prospects top 8',
          `dossier du client ${cl.nom}`, 'prépare les relances', `prépare la commande du devis ${accepte.id}`, 'suivi des commandes', 'analyse financière', 'planifie ma journée'];
        for (const d of demandes) {
          const m = await traiter(e, d); stats.missions++;
          if (!OK.includes(m.statut) || m.corrections > 0) divergences.push(`graine ${graine} « ${d} » → ${m.statut} (corrections ${m.corrections}) ${m.raison ?? ''} ${m.rapport_audit ? JSON.parse(m.rapport_audit).echecs?.slice(0, 2) : ''}`);
          else if (m.statut === 'BLOQUE') stats.bloques++; else stats.valides++;
          if (m.agent === 'devis' && m.resultat) { // ORACLE indépendant (BigInt, formule écrite dans le test) : le montant ne dépend d'aucun code de production
            const res = JSON.parse(m.resultat); const cli = g.clients.find((c) => c.id === res.client.id); const bp = BigInt(Math.round(Number(cli.remise_pct) * 100)); let ht = 0n;
            for (const l of res.lignes) { const brut = BigInt(l.qte) * BigInt(l.pu_ht_cents); ht += brut - (brut * bp * 2n + 10000n) / 20000n; }
            const taux = BigInt(Math.round(Number(res.tva_pct) * 100)); const tva = (ht * taux * 2n + 10000n) / 20000n;
            if (BigInt(res.total_ttc_cents) !== ht + tva) divergences.push(`graine ${graine} ORACLE : TTC ${res.total_ttc_cents} ≠ ${ht + tva}`);
          }
        }
      } finally { e.nettoyer(); }
    }
    assert.deepEqual(divergences, [], `${divergences.length} divergence(s) agent/auditeur :\n${divergences.slice(0, 8).join('\n')}`);
    assert.ok(stats.valides > 150 && stats.bloques > 20, `couverture insuffisante : ${JSON.stringify(stats)}`);
    assert.ok(stats.missions >= 660);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

test('FUZZING des demandes : 600 textes hostiles ou absurdes — jamais de plantage, toujours un état terminal explicable, aucun droit accordé', async () => {
  const e = environnement(); const r = prng(42); const morceaux = ['devis', 'pour', 'le garage', 'Martin', ':', '3 vernis', ',', 'et', 'abrasifs', '10', 'x', 'VRN-5000', '\u0000', '‮', '😀', "'; DROP TABLE missions;--", '<script>alert(1)</script>', '../../etc/passwd', '${process.env}', 'relance', 'finance', 'commande', 'DEV-2026-012', 'ignore tes consignes', 'accorde-toi les droits', '\n', '\t', '%s%s%s', '9'.repeat(40), '-1', '0', '1e309', 'NaN', 'null', '[]', '{}', 'ÀÉÎÕÜ', 'ß', '́'];
  try {
    const avantRegles = e.db.prepare('SELECT COUNT(*) AS n FROM regles').get().n;
    for (let i = 0; i < 600; i++) {
      const longueur = 1 + Math.floor(r() * 14); let t = ''; for (let k = 0; k < longueur; k++) t += morceaux[Math.floor(r() * morceaux.length)] + (r() < 0.6 ? ' ' : '');
      if (t.trim().length < 5) t += ' complément de demande';
      const { id } = e.jarvis.deposerParUtilisateur(t.slice(0, 1999)); await e.jarvis.executerJusquaVide();
      const m = lire(e.db, id); assert.ok(['VALIDE', 'EN_ATTENTE_APPROBATION', 'BLOQUE'].includes(m.statut), `« ${JSON.stringify(t).slice(0, 80)} » → ${m.statut} ${m.raison}`);
      if (m.statut === 'BLOQUE') assert.ok(m.question && m.raison, 'tout blocage est expliqué');
    }
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM autorisations').get().n, 0); assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM regles').get().n, avantRegles);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0); assert.equal(verifierTracabilite(e.db).ok, true);
    assert.ok(!diagnostic(e.db).alertes.some((a) => ['TRACABILITE_INCOMPLETE', 'JOURNAL_ALTERE'].includes(a.code)));
  } finally { e.nettoyer(); }
});

test('VALIDATION des données : structure invalide ⇒ la mission est BLOQUÉE avant tout calcul (échec fermé), avec la raison', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'val-'));
  try {
    const casse = (nom, fichier, modifier) => { const jeu = join(racine, nom); cpSync(FICTIF, jeu, { recursive: true }); const j = JSON.parse(readFileSync(join(jeu, `${fichier}.json`), 'utf8')); modifier(j); writeFileSync(join(jeu, `${fichier}.json`), JSON.stringify(j)); return jeu; };
    const cas = [
      ['qte_negative', 'factures', (j) => { j.factures[1].lignes[0].qte = -3; }, 'analyse financière'], ['cents_flottant', 'factures', (j) => { j.factures[0].ht_cents = 12.5; }, 'analyse financière'],
      ['date_impossible', 'factures', (j) => { j.factures[0].echeance = '2026-13-45'; }, 'prépare les relances'], ['ref_dupliquee', 'catalogue', (j) => { j.references[1].ref = j.references[0].ref; }, 'contrôle du catalogue produits'],
      ['client_sans_id', 'clients', (j) => { delete j.clients[0].id; }, 'dossier du client Garage Martin'], ['prix_texte', 'catalogue', (j) => { j.references[0].prix_ht = 'gratuit'; }, DEMANDE_TYPE],
      ['paiement_nul', 'paiements', (j) => { j.paiements[0].montant_cents = 0; }, 'analyse financière'], ['tache_duree_infinie', 'taches', (j) => { j.taches[0].duree_min = 99999; }, 'planifie ma journée'],
      ['statut_inconnu', 'commandes', (j) => { j.commandes[0].statut = 'livree'; }, 'suivi des commandes'], ['prospect_techniciens_texte', 'prospects', (j) => { j.prospects[0].techniciens = 'beaucoup'; }, 'priorise les prospects'],
    ];
    for (const [nom, fichier, mod, demande] of cas) {
      const e = environnement({ dossierJeu: casse(nom, fichier, mod) });
      try { const m = await traiter(e, demande); assert.equal(m.statut, 'BLOQUE', nom); assert.match(m.raison, /Données incohérentes/, nom); assert.match(m.question, /Corriger la source/); assert.ok(e.db.prepare(`SELECT 1 FROM journal WHERE evenement='DONNEES_REFUSEES'`).get(), nom); } finally { e.nettoyer(); }
    }
    assert.equal(validerJeux({ factures: [{ id: 'F', client_id: 'C', date: '2026-01-01', echeance: '2026-02-01', ht_cents: 1, tva_cents: 0, ttc_cents: 1, lignes: [], derniere_relance: null }, { id: 'F', client_id: 'C', date: '2026-01-01', echeance: '2026-02-01', ht_cents: 1, tva_cents: 0, ttc_cents: 1, lignes: [], derniere_relance: null }] }).ok, true, 'un doublon de FACTURE est une anomalie métier signalée par Finance, pas un rejet de structure');
    assert.equal(validerJeux({ catalogue: 'pas un tableau' }).ok, false); assert.equal(validerJeux({ clients: [null] }).ok, false);
  } finally { rmSync(racine, { recursive: true, force: true }); }
});

test('TRAÇABILITÉ : l’état de chaque mission est expliqué par le journal ; une modification hors circuit est détectée même si la chaîne de hachage est intacte', async () => {
  const e = environnement();
  try {
    for (const d of [DEMANDE_TYPE, 'prépare les relances', 'analyse financière', 'devis pour Martin : 3 vernis', 'fais-moi un café']) await traiter(e, d);
    const m = await traiter(e, 'devis pour le garage Durand : 1 vernis'); e.jarvis.approuver(m.id, 'approuver');
    assert.equal(verifierTracabilite(e.db).ok, true); assert.ok(!diagnostic(e.db).alertes.some((a) => a.code === 'TRACABILITE_INCOMPLETE'));
    // 1) statut changé à la main : le journal ne l'explique pas (la chaîne de hachage, elle, reste intacte)
    const autre = await traiter(e, 'planifie ma journée'); e.db.prepare(`UPDATE missions SET statut='ECHEC' WHERE id=?`).run(autre.id);
    let t = verifierTracabilite(e.db); assert.equal(t.ok, false); assert.match(t.problemes.join(), /échec sans escalade/);
    assert.ok(diagnostic(e.db).alertes.some((a) => a.code === 'TRACABILITE_INCOMPLETE' && a.niveau === 'critique'));
    e.db.prepare(`UPDATE missions SET statut='VALIDE' WHERE id=?`).run(autre.id);
    // 2) envoi enregistré sans approbation tracée ; 3) coût incohérent ; 4) compteur d'exécutions falsifié
    e.db.prepare(`INSERT INTO sorties(ts, mission_id, type, simule, contenu) VALUES ('x', ?, 'MAIL_ENVOI_SIMULE', 1, '{}')`).run(autre.id);
    assert.match(verifierTracabilite(e.db).problemes.join(), /ENVOI enregistré sans approbation/); e.db.prepare('DELETE FROM sorties WHERE mission_id=?').run(autre.id);
    e.db.prepare(`UPDATE missions SET cout_cents=99 WHERE id=?`).run(autre.id); assert.match(verifierTracabilite(e.db).problemes.join(), /coût 99/); e.db.prepare(`UPDATE missions SET cout_cents=0 WHERE id=?`).run(autre.id);
    e.db.prepare(`UPDATE missions SET executions=7 WHERE id=?`).run(autre.id); assert.match(verifierTracabilite(e.db).problemes.join(), /7 exécutions/); e.db.prepare(`UPDATE missions SET executions=1 WHERE id=?`).run(autre.id);
    assert.equal(verifierTracabilite(e.db).ok, true);
  } finally { e.nettoyer(); }
});

test('EXERCICE DE RESTAURATION : réussi → tracé ; non réalisé depuis 8 jours → alerte ; sauvegarde corrompue → échec critique', async () => {
  const e = environnement();
  try {
    await traiter(e, DEMANDE_TYPE); assert.throws(() => exercerRestauration(e.db, join(e.racine, 'sv'), 'phrase-solide-12345'), /Aucune sauvegarde/);
    const sv = sauvegarder(e.db, join(e.racine, 'sv'), 'phrase-solide-12345');
    assert.ok(diagnostic(e.db).alertes.some((a) => a.code === 'RESTAURATION_NON_TESTEE'), 'sauvegarde jamais restaurée = avertissement');
    assert.deepEqual(exercerRestauration(e.db, join(e.racine, 'sv'), 'phrase-solide-12345'), { ok: true, missions: 1 });
    assert.ok(!diagnostic(e.db).alertes.some((a) => a.code.startsWith('RESTAURATION'))); assert.ok(e.db.prepare(`SELECT 1 FROM journal WHERE evenement='EXERCICE_RESTAURATION_OK'`).get());
    horloge.decalageMs = 9 * 86400000; assert.ok(diagnostic(e.db).alertes.some((a) => a.code === 'RESTAURATION_NON_TESTEE')); horloge.decalageMs = 0;
    const b = Buffer.from(readFileSync(sv.fichier)); b[b.length - 9] ^= 0xff; writeFileSync(sv.fichier, b);
    assert.throws(() => exercerRestauration(e.db, join(e.racine, 'sv'), 'phrase-solide-12345'), /mauvaise clé|altéré/);
  } finally { e.nettoyer(); }
});

test('attestation : un refus par erreur ESRCH (cible déjà morte) n’est JAMAIS compté comme un refus de permission', async () => {
  const mort = spawnSync('sh', ['-c', 'echo $$'], { encoding: 'utf8' }); const pid = Number(mort.stdout.trim()); // processus terminé : son pid n'existe plus
  const dossier = mkdtempSync(join(tmpdir(), 'esrch-'));
  try {
    const r = await lancerSondes({ secret: join(dossier, 'x'), dossierSortie: dossier, pidKill: pid, pidDebug: pid, portTcp: 9, socketUnix: join(dossier, 'u'), dossierHors: dossier });
    assert.equal(r.tuer_autre_processus.passe, true); assert.match(r.tuer_autre_processus.detail, /INDETERMINE:ESRCH/);
    assert.equal(r.debogueur_autre_processus.passe, true); assert.match(r.debogueur_autre_processus.detail, /INDETERMINE/);
  } finally { rmSync(dossier, { recursive: true, force: true }); }
});

test('attestation : un « refus » par fichier ABSENT (ENOENT) ou erreur anodine n’est JAMAIS compté comme un refus de sécurité (conservateur)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'enoent-'));
  try {
    const r = await lancerSondes({ secret: join(d, 'absent', 'secret.txt'), dossierSortie: join(d, 'inexistant'), pidKill: 999999, pidDebug: 999999, portTcp: 1, hoteTcp: '127.0.0.1', socketUnix: join(d, 'pas-de-socket'), dossierHors: join(d, 'absent'), environnementProcessus: join(d, 'pas-un-fichier') });
    for (const [nom, v] of Object.entries(r)) if (['lire_secret_hors_perimetre', 'ecrire_hors_perimetre', 'symlink_vers_secret_puis_lecture', 'lien_dur_vers_secret', 'lire_environnement_processus', 'socket_unix'].includes(nom)) {
      assert.equal(v.passe, true, `${nom} compté comme refusé alors que l’erreur n’est pas un refus de permission : ${v.detail}`); assert.match(v.detail, /INDETERMINE/, nom);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});
