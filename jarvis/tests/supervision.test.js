// Supervision : le superviseur détecte les incohérences par lui-même, sans croire le rapport d'un agent ni l'état affiché.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement, traiter, DEMANDE_TYPE } from './aide.js';
import { diagnostic } from '../src/sante.js';
import { horloge } from '../src/horloge.js';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { RACINE } from './aide.js';
import { ouvrir } from '../src/db.js';

test('service silencieux : pas de battement → alerte critique ; après un tour de boucle → sain ; 3 minutes de silence → critique', async () => {
  const e = environnement();
  try {
    assert.ok(diagnostic(e.db, { exigerBattement: true }).alertes.some((a) => a.code === 'SERVICE_SILENCIEUX'));
    await e.jarvis.tick();
    assert.ok(!diagnostic(e.db, { exigerBattement: true }).alertes.some((a) => a.code === 'SERVICE_SILENCIEUX'));
    horloge.decalageMs = 3 * 60 * 1000;
    const d = diagnostic(e.db, { exigerBattement: true });
    assert.ok(d.alertes.some((a) => a.code === 'SERVICE_SILENCIEUX' && a.niveau === 'critique')); assert.equal(d.ok, false);
  } finally { e.nettoyer(); }
});

test('incohérences détectées par le superviseur : résultat modifié en base, validation sans trace', async () => {
  const e = environnement();
  try {
    const m = await traiter(e, DEMANDE_TYPE);
    assert.equal(diagnostic(e.db).ok, true);
    e.db.prepare(`UPDATE missions SET resultat = replace(resultat, '31795', '1') WHERE id = ?`).run(m.id);
    assert.ok(diagnostic(e.db).alertes.some((a) => a.code === 'RESULTAT_MODIFIE' && a.niveau === 'critique'));
    // Validation « fantôme » : statut VALIDE + décideur renseigné, mais jamais approuvée via le circuit.
    const m2 = await traiter(e, 'devis pour le garage Durand : 1 vernis');
    e.db.prepare(`UPDATE missions SET statut='VALIDE', decide_par='intrus' WHERE id = ?`).run(m2.id);
    assert.ok(diagnostic(e.db).alertes.some((a) => a.code === 'VALIDATION_SANS_TRACE'));
  } finally { e.nettoyer(); }
});

test('sonde de santé en ligne de commande : code de sortie 1 si service silencieux, 0 après un tour de boucle', async () => {
  const e = environnement();
  try {
    e.db.close();
    const sonde = () => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(RACINE, 'scripts', 'sante.js')], { env: { JARVIS_ESPACE: 'odicolor', JARVIS_DONNEES: e.racine, PATH: process.env.PATH }, encoding: 'utf8' });
    assert.equal(sonde().status, 1, 'aucun battement : service silencieux');
    const db = ouvrir(e.fichierDb); const { definirParam } = await import('../src/db.js'); definirParam(db, 'battement', Date.now()); db.close();
    const ok = sonde(); assert.equal(ok.status, 0, ok.stdout); assert.equal(JSON.parse(ok.stdout).espace, 'odicolor');
  } finally { e.nettoyer(); }
});
