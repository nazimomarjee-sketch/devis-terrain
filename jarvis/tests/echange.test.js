// Backend « échange » (design Windows : tâche planifiée sous compte agent). Le PROTOCOLE est testé ici avec un lanceur local ;
// les commandes schtasks sont construites et vérifiées mais JAMAIS exécutées : leur exécution réelle est l'essai W8/W15 (docs/09).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environnement, traiter, lanceurLocal, compteAgent, RACINE } from './aide.js';
import { executerParEchange, commandesSchtasks, lanceurSchtasks } from '../src/echange.js';
import { attester } from '../src/confinement.js';

const dossier = () => mkdtempSync(join(tmpdir(), 'ech-'));
const faux = (ecrire) => ({ lancer: async (courant) => ecrire?.(courant), arreter: () => { faux.arretes = (faux.arretes ?? 0) + 1; } });
const entree = { mode: 'agent', nomAgent: 'x', options: {}, mission: {}, ctx: {} };

test('protocole : sortie valide (même nonce) acceptée', async () => {
  const lanceur = faux((c) => { const e = JSON.parse(require_lire(join(c, 'entree.json'))); writeFileSync(join(c, 'sortie.json'), JSON.stringify({ nonce: e.nonce, ok: true, sortie: { statut: 'OK' }, depenses: [] })); });
  const r = await executerParEchange({ dossierEchange: dossier(), entree, lanceur, delaiMs: 2000 }); assert.equal(r.sortie.statut, 'OK');
});
import { readFileSync } from 'node:fs';
const require_lire = (f) => readFileSync(f, 'utf8');

test('protocole : sortie FORGÉE ou PÉRIMÉE (mauvais nonce) refusée', async () => {
  const lanceur = faux((c) => writeFileSync(join(c, 'sortie.json'), JSON.stringify({ nonce: 'ancien-nonce', ok: true, sortie: { statut: 'OK' } })));
  await assert.rejects(executerParEchange({ dossierEchange: dossier(), entree, lanceur, delaiMs: 2000 }), /périmée ou forgée/);
});

test('protocole : aucune réponse → délai, l’agent est ARRÊTÉ (end de la tâche) ; verrou libéré', async () => {
  faux.arretes = 0; const d = dossier();
  await assert.rejects(executerParEchange({ dossierEchange: d, entree, lanceur: faux(), delaiMs: 200 }), /Délai dépassé.*arrêté/);
  assert.equal(faux.arretes, 1); assert.ok(!existsSync(join(d, 'verrou')), 'verrou libéré');
});

test('protocole : sortie démesurée refusée', async () => {
  const lanceur = faux((c) => writeFileSync(join(c, 'sortie.json'), 'x'.repeat(3_000_000)));
  await assert.rejects(executerParEchange({ dossierEchange: dossier(), entree, lanceur, delaiMs: 2000 }), /trop volumineuse/);
});

test('protocole : une seule exécution à la fois par espace (verrou) ; un verrou périmé est repris', async () => {
  const d = dossier();
  const lent = faux(() => {}); const p1 = executerParEchange({ dossierEchange: d, entree, lanceur: lent, delaiMs: 400 }).catch((e) => e);
  await new Promise((r) => setTimeout(r, 80));
  await assert.rejects(executerParEchange({ dossierEchange: d, entree, lanceur: faux(), delaiMs: 400 }), /occupé/);
  await p1;
  // verrou abandonné par un crash, très ancien
  mkdirSync(join(d, 'verrou')); const vieux = new Date(Date.now() - 60_000); utimesSync(join(d, 'verrou'), vieux, vieux);
  const lanceur = faux((c) => { const e = JSON.parse(require_lire(join(c, 'entree.json'))); writeFileSync(join(c, 'sortie.json'), JSON.stringify({ nonce: e.nonce, ok: true, sortie: {}, depenses: [] })); });
  assert.deepEqual((await executerParEchange({ dossierEchange: d, entree, lanceur, delaiMs: 1000 })).ok, true);
});

test('protocole : erreur de l’agent propagée ; entrée écrite de façon atomique avec nonce unique', async () => {
  const nonces = new Set();
  const lanceur = faux((c) => { const e = JSON.parse(require_lire(join(c, 'entree.json'))); nonces.add(e.nonce); writeFileSync(join(c, 'sortie.json'), JSON.stringify({ nonce: e.nonce, ok: false, erreur: 'boum' })); });
  for (let i = 0; i < 3; i++) await assert.rejects(executerParEchange({ dossierEchange: dossier(), entree, lanceur, delaiMs: 1000 }), /boum/);
  assert.equal(nonces.size, 3);
});

test('Windows : commandes schtasks construites (Run/End de la tâche du compte agent de l’espace) — NON EXÉCUTÉES', () => {
  assert.deepEqual(commandesSchtasks('odicolor'), { lancer: ['schtasks', ['/Run', '/TN', 'Jarvis-agent-odicolor']], arreter: ['schtasks', ['/End', '/TN', 'Jarvis-agent-odicolor']] });
  const appels = []; const l = lanceurSchtasks('perso', (cmd, args) => { appels.push([cmd, ...args]); if (args[0] === '/End') throw new Error('déjà terminée'); });
  l.lancer(); l.arreter(); // l'arrêt d'une tâche déjà terminée ne doit pas lever
  assert.deepEqual(appels, [['schtasks', '/Run', '/TN', 'Jarvis-agent-perso'], ['schtasks', '/End', '/TN', 'Jarvis-agent-perso']]);
});

test('bout en bout par échange (compte courant, permissions Node) : un devis complet traverse le protocole', async () => {
  const e = environnement({ isolation: true });
  try {
    const echange = join(e.cfg.dossier, 'echange');
    e.jarvis.confinement = { backend: 'echange', dossierEchange: echange, lanceur: lanceurLocal({ dossiersEcriture: [e.dossierSorties] }) };
    const m = await traiter(e, 'prépare un devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs');
    assert.equal(m.statut, 'EN_ATTENTE_APPROBATION'); assert.equal(JSON.parse(m.resultat).total_ttc_cents, 31795);
    assert.ok(!existsSync(join(echange, 'courant')), 'échange nettoyé');
  } finally { e.nettoyer(); }
});

const AGENT = compteAgent('jvagent');
test('attestation via l’échange : « os » sous un compte agent distinct, « permission » sinon', { skip: AGENT ? false : 'SAUTÉ : exige Linux + root' }, async () => {
  const os = await attester({ backend: 'echange', lanceur: lanceurLocal({ backend: 'linux-os', utilisateurAgent: AGENT }) });
  assert.equal(os.niveau, 'os', os.echecs.join(' ; '));
  const perm = await attester({ backend: 'echange', lanceur: lanceurLocal({ backend: 'permission' }) });
  assert.equal(perm.niveau, 'permission'); assert.ok(perm.echecs.length >= 5);
});
