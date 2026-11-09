// Connecteurs EBP / Gmail / Airtable : interfaces préparées avec DONNÉES SYNTHÉTIQUES. Aucun accès réel, aucune action externe sans décision humaine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environnement, traiter, RACINE, DEMANDE_TYPE } from './aide.js';
import { analyserExport, importerExport } from '../src/connecteurs/ebp.js';
import { connecteurGmail } from '../src/connecteurs/gmail.js';
import { connecteurAirtable } from '../src/connecteurs/airtable.js';
import { enfiler, traiter as traiterOutbox } from '../src/outbox.js';
import { definirParam, ouvrir } from '../src/db.js';
import { accorder, amorcerRegles } from '../src/regles.js';
import { IntegrationNonDeveloppee } from '../src/integrations.js';
import { validerJeux } from '../src/validation.js';
import { chargerJeux } from '../src/donnees.js';
import { horloge } from '../src/horloge.js';

const SYN = join(RACINE, 'data', 'synthetique');
const tmp = () => mkdtempSync(join(tmpdir(), 'conn-'));
const entetesArt = 'Référence;Désignation;Famille;Conditionnement;Prix vente HT;Prix achat HT;Date tarif';

test('EBP : import des 4 exports synthétiques → jeux normalisés valides, rapport, empreinte, marqués FICTIF ; les agents tournent dessus', async () => {
  const jeu = join(tmp(), 'import'); const e = environnement({ dossierJeu: jeu });
  try {
    for (const [type, f] of [['articles', 'ebp-articles.csv'], ['clients', 'ebp-clients.csv'], ['factures', 'ebp-factures.csv'], ['paiements', 'ebp-paiements.csv']]) {
      const r = importerExport({ db: e.db, type, chemin: join(SYN, f), dossierJeu: jeu }); assert.equal(r.rejetees.length, 0, `${type} : ${JSON.stringify(r.rejetees)}`); assert.match(r.sha256, /^[0-9a-f]{64}$/); assert.equal(r.mode, 'synthetique');
    }
    const jeux = chargerJeux(jeu, ['catalogue', 'clients', 'factures', 'paiements']); assert.equal(jeux.fictif, true); assert.equal(validerJeux(jeux.donnees).ok, true);
    const cat = jeux.donnees.catalogue; assert.deepEqual([cat.length, cat[0].prix_ht, cat[2].multiple, cat[3].date_prix, cat[4].prix_ht], [5, '85.50', 10, '2026-05-02', null]); // virgule décimale, dates JJ/MM/AAAA, BOM, prix absent
    assert.deepEqual(jeux.donnees.factures.map((f) => f.ttc_cents), [108500, 60000, 27125]);
    // Les agents fonctionnent sur les données importées (financier + produits), l'auditeur indépendant valide.
    for (const [agent, d] of [['finance', 'analyse financière'], ['produits', 'contrôle du catalogue produits']]) {
      writeFileSync(join(jeu, 'regles.json'), readFileSync(join(RACINE, 'data', 'canari', 'regles.json'))); amorcerRegles(e.db, jeu); if (agent === 'finance') for (const f of ['commandes']) writeFileSync(join(jeu, `${f}.json`), JSON.stringify({ genere: 'FICTIF', commandes: [] }));
      const m = await traiter(e, d); assert.ok(['VALIDE', 'EN_ATTENTE_APPROBATION'].includes(m.statut), `${d} : ${m.statut} ${m.raison}`);
    }
  } finally { e.nettoyer(); rmSync(jeu, { recursive: true, force: true }); }
});

test('EBP adversarial : injection de formule, en-têtes faux, cellules géantes, contrôles, dates/montants invalides, doublons — tout REJETÉ ligne par ligne, jamais de plantage', () => {
  const lignes = [entetesArt, 'OK-001;Vernis;vernis;1;10,00;5,00;01/01/2026', '=CMD|\' /C calc\'!A0;Piège;x;1;1;1;', 'FOR-002;+1+1;x;1;1;1;', 'FOR-003;@SUM(A1);x;1;1;1;', 'FOR-004;-2+3;x;1;1;1;', `LON-005;${'x'.repeat(600)};x;1;1;1;`,
    'CTL-006;Cont\u0007rôle;x;1;1;1;', 'DAT-007;Date;x;1;1;1;31/02/2026', 'DAT-008;Date;x;1;1;1;2026-13-01', 'PRI-009;Prix;x;1;abc;1;', 'PRI-010;Prix;x;1;-5;1;', 'CON-011;Cond;x;0;1;1;', 'CON-012;Cond;x;1,5;1;1;', 'COL-013;Trop;x;1;1;1;;extra', 'COL-014;Pas assez;x', 'OK-001;Doublon;x;1;1;1;', 'a b;Réf invalide;x;1;1;1;', '\t=cmd;Tab;x;1;1;1;'];
  const { donnees, rapport } = analyserExport('articles', lignes.join('\n'));
  assert.equal(donnees.length, 1); assert.equal(donnees[0].ref, 'OK-001'); assert.equal(rapport.lues, 18); assert.equal(rapport.rejetees.length, 17);
  const motifs = rapport.rejetees.map((r) => r.motif).join(' | '); for (const m of [/formule tableur/, /cellule trop longue/, /caractère de contrôle/, /date invalide/, /prix de vente invalide/, /conditionnement invalide/, /colonnes/, /en double/, /référence invalide/]) assert.match(motifs, m);
  assert.match(analyserExport('articles', 'Mauvais;En-têtes\n1;2').rapport.rejetees[0].motif, /^en-têtes inattendus/); assert.equal(analyserExport('clients', '').rapport.rejetees[0].motif, 'fichier vide');
  assert.throws(() => analyserExport('inconnu', 'x'), /inconnu/);
  const gros = [entetesArt, ...Array.from({ length: 100_001 }, (_, i) => `R${i}-001;x;x;1;1;1;`)].join('\n'); assert.match(analyserExport('articles', gros).rapport.rejetees[0].motif, /trop de lignes/);
});

test('EBP : fichier > 5 Mo refusé ; mode réel REFUSÉ sans autorisations puis NON DÉVELOPPÉ ; type de mode inconnu refusé', () => {
  const e = environnement(); const d = tmp();
  try {
    const gros = join(d, 'gros.csv'); writeFileSync(gros, Buffer.alloc(5 * 1024 * 1024 + 1, 65)); assert.throws(() => importerExport({ db: e.db, type: 'articles', chemin: gros, dossierJeu: join(d, 'j') }), /trop volumineux/);
    const chemin = join(SYN, 'ebp-clients.csv');
    assert.throws(() => importerExport({ db: e.db, mode: 'reel', type: 'clients', chemin, dossierJeu: d }), /Autorisation requise.*donnees_reelles/);
    accorder(e.db, { type: 'donnees_reelles', portee: 't' }, 'a'); assert.throws(() => importerExport({ db: e.db, mode: 'reel', type: 'clients', chemin, dossierJeu: d }), /Autorisation requise.*integration:ebp/);
    accorder(e.db, { type: 'integration:ebp', portee: 't' }, 'a'); assert.throws(() => importerExport({ db: e.db, mode: 'reel', type: 'clients', chemin, dossierJeu: d }), IntegrationNonDeveloppee);
    assert.throws(() => importerExport({ db: e.db, mode: 'bizarre', type: 'clients', chemin, dossierJeu: d }), /Mode inconnu/);
    assert.ok(!existsSync(join(d, 'clients.json')), 'aucun fichier écrit par un import refusé');
  } finally { e.nettoyer(); }
});

test('Gmail : AUCUNE méthode d’envoi ; brouillon seulement, destinataire synthétique, message marqué BROUILLON, une seule action permise', async () => {
  const e = environnement(); const d = tmp();
  try {
    const g = connecteurGmail({ db: e.db, dossierBoite: d });
    for (const interdit of ['envoyer', 'send', 'sendMessage', 'envoi', 'repondre', 'supprimer']) assert.equal(g[interdit], undefined, `méthode « ${interdit} » ne doit pas exister`);
    const eml = (st = 'BROUILLON') => Buffer.from(`From: a@b.invalid\r\nX-Jarvis-Statut: ${st}\r\n\r\ncorps`).toString('base64');
    await g.executer('CREER_BROUILLON', { vers: 'client@x.invalid', eml_base64: eml() }, 'brouillon-M-20261109-abc123'); assert.equal(g.lireBrouillons().length, 1);
    await g.executer('CREER_BROUILLON', { vers: 'client@x.invalid', eml_base64: eml() }, 'brouillon-M-20261109-abc123'); assert.equal(g.lireBrouillons().length, 1, 'rejouer ne duplique pas');
    await assert.rejects(g.executer('ENVOYER', { vers: 'client@x.invalid' }, 'cle-envoi-0001'), /non autorisée/); await assert.rejects(g.executer('CREER_BROUILLON', { vers: 'vrai@client.fr', eml_base64: eml() }, 'cle-reel-00001'), /non synthétique/);
    await assert.rejects(g.executer('CREER_BROUILLON', { vers: 'a@x.invalid', eml_base64: eml('ENVOYE') }, 'cle-statut-001'), /BROUILLON/); await assert.rejects(g.executer('CREER_BROUILLON', { vers: 'a@x.invalid', eml_base64: eml() }, '../evasion'), /clé/);
    assert.throws(() => connecteurGmail({ db: e.db, mode: 'reel', dossierBoite: d }), /Autorisation requise.*integration:gmail/); accorder(e.db, { type: 'integration:gmail', portee: 't' }, 'a'); assert.throws(() => connecteurGmail({ db: e.db, mode: 'reel', dossierBoite: d }), IntegrationNonDeveloppee);
  } finally { e.nettoyer(); }
});

test('OUTBOX : l’approbation d’un devis enfile UN brouillon (même transaction) ; exécuté une fois ; reprise après crash ; idempotent ; double traitement concurrent sans doublon', async () => {
  const e = environnement(); const boite = tmp(); const gmail = connecteurGmail({ db: e.db, dossierBoite: boite });
  try {
    definirParam(e.db, 'connecteur_gmail', 'synthetique');
    const m = await traiter(e, DEMANDE_TYPE); assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n, 0, 'rien n’est enfilé avant la décision humaine');
    e.jarvis.approuver(m.id, 'approuver'); assert.equal(e.db.prepare(`SELECT etat FROM outbox`).get().etat, 'A_FAIRE'); assert.equal(gmail.lireBrouillons().length, 0, 'enfilé ≠ exécuté');
    // Deux travailleurs en même temps (deux connexions) : UNE seule exécution.
    const db2 = ouvrir(e.fichierDb); let appels = 0; const compte = { gmail: { executer: async (...a) => { appels++; return gmail.executer(...a); } } };
    await Promise.all([traiterOutbox(e.db, compte), traiterOutbox(db2, compte)]); db2.close();
    assert.equal(appels, 1); assert.equal(gmail.lireBrouillons().length, 1); assert.equal(e.db.prepare(`SELECT etat FROM outbox`).get().etat, 'FAIT');
    assert.match(gmail.lireBrouillons()[0].contenu, /X-Jarvis-Statut: BROUILLON/); assert.equal(await traiterOutbox(e.db, compte), 0, 'rien à refaire');
    assert.equal(enfiler(e.db, { missionId: m.id, connecteur: 'gmail', action: 'CREER_BROUILLON', cle: `brouillon-${m.id}`, charge: {} }), false, 'même clé = déjà enfilée');
    assert.throws(() => e.db.prepare(`INSERT INTO outbox(connecteur, action, cle_idempotence, charge, cree_le, maj_le) VALUES ('g','a',?, '{}','x','x')`).run(`brouillon-${m.id}`), /UNIQUE/);
  } finally { e.nettoyer(); }
});

test('OUTBOX : crash pendant l’exécution (bail expiré) → reprise ; échecs répétés → ECHEC définitif tracé ; connecteur absent → échec', async () => {
  const e = environnement();
  try {
    enfiler(e.db, { connecteur: 'x', action: 'A', cle: 'cle-crash-0001', charge: { n: 1 } });
    e.db.prepare(`UPDATE outbox SET etat='EN_COURS', tentatives=1, bail_jusqua=? WHERE cle_idempotence='cle-crash-0001'`).run(horloge.maintenant() + 1000); // un travailleur est « mort » en cours d'action
    let n = 0; const ok = { x: { executer: async () => { n++; } } };
    assert.equal(await traiterOutbox(e.db, ok), 0, 'bail encore valide : on n’exécute pas en double'); horloge.decalageMs = 5000; assert.equal(await traiterOutbox(e.db, ok), 1); assert.equal(n, 1);
    enfiler(e.db, { connecteur: 'y', action: 'A', cle: 'cle-echec-0001', charge: {} }); const ko = { y: { executer: async () => { throw new Error('API indisponible'); } } };
    await traiterOutbox(e.db, ko, { maxTentatives: 3, backoffMs: [0] }); const r = e.db.prepare(`SELECT etat, tentatives, derniere_erreur FROM outbox WHERE cle_idempotence='cle-echec-0001'`).get(); assert.deepEqual([r.etat, r.tentatives, r.derniere_erreur], ['ECHEC', 3, 'API indisponible']);
    assert.ok(e.db.prepare(`SELECT 1 FROM journal WHERE evenement='ACTION_EXTERNE_ECHEC'`).get()); enfiler(e.db, { connecteur: 'zz', action: 'A', cle: 'cle-absent-0001', charge: {} }); await traiterOutbox(e.db, {}, { maxTentatives: 1 });
    assert.equal(e.db.prepare(`SELECT etat FROM outbox WHERE cle_idempotence='cle-absent-0001'`).get().etat, 'ECHEC');
  } finally { e.nettoyer(); }
});

test('Airtable synthétique : lecture libre, écriture idempotente par clé, actions et tables non conformes refusées, réel refusé puis non développé', async () => {
  const e = environnement(); const d = tmp();
  try {
    const a = connecteurAirtable({ db: e.db, fichierBase: join(d, 'base.json') }); assert.deepEqual(a.lire('Clients'), []);
    await a.executer('UPSERT_ENREGISTREMENT', { table: 'Clients', id: 'rec1', champs: { Nom: 'Synthétique' } }, 'cle-airtable-1'); await a.executer('UPSERT_ENREGISTREMENT', { table: 'Clients', id: 'rec1', champs: { Nom: 'Autre' } }, 'cle-airtable-1');
    assert.deepEqual(a.lire('Clients'), [{ id: 'rec1', Nom: 'Synthétique' }], 'rejouer la même clé ne réapplique rien');
    await a.executer('UPSERT_ENREGISTREMENT', { table: 'Clients', id: 'rec1', champs: { Nom: 'Mis à jour' } }, 'cle-airtable-2'); assert.equal(a.lire('Clients').length, 1); assert.equal(a.lire('Clients')[0].Nom, 'Mis à jour');
    await assert.rejects(a.executer('SUPPRIMER_TABLE', {}, 'cle-airtable-3'), /non autorisée/); await assert.rejects(a.executer('UPSERT_ENREGISTREMENT', { table: '../../etc', id: 'x', champs: {} }, 'cle-airtable-4'), /charge invalide/);
    assert.throws(() => connecteurAirtable({ db: e.db, mode: 'reel', fichierBase: join(d, 'b2.json') }), /Autorisation requise.*integration:airtable/);
    accorder(e.db, { type: 'integration:airtable', portee: 't' }, 'a'); assert.throws(() => connecteurAirtable({ db: e.db, mode: 'reel', fichierBase: join(d, 'b2.json') }), IntegrationNonDeveloppee);
    void readdirSync;
  } finally { e.nettoyer(); }
});
