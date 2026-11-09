// Superviseur externe : politique de redémarrage (horloge simulée) + scénario RÉEL (vrai service, kill -9, redémarrage, aucun doublon).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Superviseur } from '../src/superviseur.js';
import { RACINE } from './aide.js';
import { ouvrir, verifierJournal } from '../src/db.js';
import { reclamer } from '../src/moteur.js';

function fabrique(reponses, { peut = true } = {}) {
  let t = 0; const alertes = []; const redemarrages = [];
  const svc = { id: 's1', sonder: async () => (typeof reponses === 'function' ? reponses(t) : reponses), redemarrer: async () => { redemarrages.push(t); }, peutRedemarrer: async () => peut };
  const sup = new Superviseur({ services: [svc], maintenant: () => t, alerter: (a) => alertes.push(a), politique: { echecsAvantRedemarrage: 2, redemarragesMax: 3, fenetreS: 600 } });
  return { sup, alertes, redemarrages, avancer: (s) => { t += s * 1000; } };
}
const SAIN = { ok: true, battement_age_s: 1, critiques: 0 };

test('politique : service sain → aucune action ; un raté isolé ne déclenche PAS de redémarrage (confirmation)', async () => {
  const f = fabrique(SAIN); assert.deepEqual(await f.sup.cycle(), { s1: { etat: 'sain' } }); assert.equal(f.redemarrages.length, 0);
  let n = 0; const g = fabrique(() => (n++ === 1 ? null : SAIN)); await g.sup.cycle(); await g.sup.cycle(); await g.sup.cycle(); assert.equal(g.redemarrages.length, 0);
});

test('politique : service MORT (2 sondes ratées) → redémarrage automatique + alerte', async () => {
  const f = fabrique(null); await f.sup.cycle(); assert.equal(f.redemarrages.length, 0); const b = await f.sup.cycle();
  assert.equal(f.redemarrages.length, 1); assert.equal(b.s1.etat, 'redemarre'); assert.equal(f.alertes[0].code, 'SERVICE_MORT');
});

test('politique : service vivant mais SILENCIEUX (orchestrateur bloqué) → redémarrage', async () => {
  const f = fabrique({ ok: true, battement_age_s: 300, critiques: 0 }); await f.sup.cycle(); await f.sup.cycle(); assert.equal(f.redemarrages.length, 1); assert.equal(f.alertes[0].code, 'SERVICE_SILENCIEUX');
  const g = fabrique({ ok: true, battement_age_s: null, critiques: 0 }); await g.sup.cycle(); await g.sup.cycle(); assert.equal(g.redemarrages.length, 1, 'aucun battement jamais reçu = silencieux');
});

test('politique : alertes critiques sur service vivant → ALERTE seulement (un redémarrage ne règle ni un journal altéré ni un échec métier)', async () => {
  const f = fabrique({ ok: false, battement_age_s: 1, critiques: 2 }); const b = await f.sup.cycle(); await f.sup.cycle();
  assert.equal(b.s1.etat, 'degrade'); assert.equal(f.redemarrages.length, 0); assert.equal(f.alertes[0].code, 'ALERTES_CRITIQUES');
});

test('protection contre la BOUCLE DE CRASH : 3 redémarrages puis ESCALADE, supervision suspendue ; reprise manuelle seulement', async () => {
  const f = fabrique(null);
  for (let i = 0; i < 6; i++) { await f.sup.cycle(); f.avancer(10); }       // 2 sondes ratées = 1 redémarrage → 3 redémarrages en 6 cycles
  assert.equal(f.redemarrages.length, 3);
  await f.sup.cycle(); const e = await f.sup.cycle();                       // la 4e tentative dans la fenêtre déclenche l'escalade
  assert.equal(e.s1.etat, 'escalade'); assert.ok(f.alertes.some((a) => a.code === 'BOUCLE_DE_CRASH' && a.niveau === 'critique'));
  for (let i = 0; i < 6; i++) await f.sup.cycle(); assert.equal(f.redemarrages.length, 3, 'plus aucun redémarrage après escalade');
  f.sup.reprendre('s1'); await f.sup.cycle(); await f.sup.cycle(); assert.equal(f.redemarrages.length, 4, 'reprise manuelle : la supervision repart');
});

test('fenêtre glissante : des redémarrages anciens (> fenêtre) ne comptent plus — pas d’escalade à tort', async () => {
  const f = fabrique(null);
  for (let i = 0; i < 6; i++) { await f.sup.cycle(); f.avancer(10); } assert.equal(f.redemarrages.length, 3);
  f.avancer(700);                                                           // plus de 600 s : les 3 redémarrages sortent de la fenêtre
  await f.sup.cycle(); const b = await f.sup.cycle();
  assert.equal(f.redemarrages.length, 4); assert.notEqual(b.s1.etat, 'escalade');
});

test('redémarrage différé si la condition de sûreté n’est pas remplie ; échec du redémarrage signalé', async () => {
  const f = fabrique(null, { peut: false }); await f.sup.cycle(); const b = await f.sup.cycle(); assert.equal(b.s1.differe, true); assert.equal(f.redemarrages.length, 0); assert.equal(f.alertes.at(-1).code, 'REDEMARRAGE_DIFFERE');
  const al = []; const sup = new Superviseur({ services: [{ id: 'x', sonder: async () => null, redemarrer: async () => { throw new Error('refusé'); } }], alerter: (a) => al.push(a), politique: { echecsAvantRedemarrage: 1 } });
  await sup.cycle(); assert.ok(al.some((a) => a.code === 'REDEMARRAGE_ECHEC'));
});

test('la sonde qui plante ou dépasse son délai est traitée comme un service MORT', async () => {
  const al = []; const sup = new Superviseur({ services: [{ id: 'x', sonder: async () => { throw new Error('réseau'); }, redemarrer: async () => {} }], alerter: (a) => al.push(a), politique: { echecsAvantRedemarrage: 1 } });
  await sup.cycle(); assert.equal(al[0].code, 'SERVICE_MORT');
});

// ---------- Scénario RÉEL ----------
const portLibre = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const U = 'utilisateur-odicolor-0123456789abcdef'; const A = 'admin-odicolor-0123456789abcdefghij';

test('RÉEL : service kill -9 en pleine activité → le superviseur le redémarre, TOUTES les missions aboutissent UNE fois, aucun double envoi, journal intact', async () => {
  const donnees = mkdtempSync(join(tmpdir(), 'sup-')); chmodSync(donnees, 0o711); const port = await portLibre();
  const env = { PATH: process.env.PATH, JARVIS_ESPACE: 'odicolor', JARVIS_DONNEES: donnees, JARVIS_ODICOLOR_TOKEN: U, JARVIS_ODICOLOR_ADMIN_TOKEN: A, JARVIS_ODICOLOR_CLE_SAUVEGARDE: 'cle-sauvegarde-odicolor-solide', JARVIS_ODICOLOR_PORT: String(port), JARVIS_ISOLATION: 'non', JARVIS_CONFINEMENT: 'permission' };
  let enfant = null; const demarrages = [];
  const lancer = () => { enfant = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(RACINE, 'src', 'demarrer.js')], { env, stdio: 'ignore' }); demarrages.push(enfant.pid); };
  const sonder = async () => { try { const r = await fetch(`http://127.0.0.1:${port}/api/sante`, { signal: AbortSignal.timeout(2000) }); return r.ok ? await r.json() : null; } catch { return null; } };
  const sup = new Superviseur({ services: [{ id: 'odicolor', sonder, redemarrer: async () => { try { enfant.kill('SIGKILL'); } catch { /* */ } lancer(); } }], politique: { echecsAvantRedemarrage: 1, silenceMaxS: 20 } });
  const attendre = async (cond, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };
  try {
    lancer(); assert.ok(await attendre(async () => (await sonder())?.battement_age_s !== null && (await sonder()) !== null), 'le service démarre');
    const post = (chemin, corps) => fetch(`http://127.0.0.1:${port}${chemin}`, { method: 'POST', headers: { Authorization: `Bearer ${U}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }).then((r) => r.json());
    const demandes = ['devis pour le garage Martin : 3 vernis', 'devis pour le garage Durand : 2 vernis', 'prépare les relances', 'analyse financière', 'planifie ma journée', 'dossier du client Garage Martin', 'contrôle du catalogue produits', 'suivi des commandes', 'priorise les prospects', 'prépare la commande du devis DEV-2026-012'];
    const ids = []; for (const d of demandes) ids.push((await post('/api/missions', { demande: d })).id);
    // Mission « en vol » : un faux ouvrier la prend (bail court) puis le service est tué net.
    const db0 = ouvrir(join(donnees, 'odicolor', 'jarvis.sqlite')); reclamer(db0, 'ouvrier-fantome', 300); db0.close();
    enfant.kill('SIGKILL'); await new Promise((r) => setTimeout(r, 200));
    assert.equal(await sonder(), null, 'le service est bien mort');
    // Le superviseur détecte et redémarre.
    for (let i = 0; i < 4 && demarrages.length < 2; i++) await sup.cycle();
    assert.equal(demarrages.length, 2, 'redémarré par le superviseur');
    const db = ouvrir(join(donnees, 'odicolor', 'jarvis.sqlite'));
    assert.ok(await attendre(() => db.prepare(`SELECT COUNT(*) AS n FROM missions WHERE statut IN ('EN_FILE','EN_COURS','A_CORRIGER')`).get().n === 0, 90000), 'toutes les missions sont traitées');
    const ms = db.prepare('SELECT id, statut, executions, reprises FROM missions').all(); assert.equal(ms.length, 10);
    for (const m of ms) assert.ok(['VALIDE', 'EN_ATTENTE_APPROBATION'].includes(m.statut), `${m.id} ${m.statut}`);
    assert.equal(ms.filter((m) => m.reprises > 0).length, 1, 'seule la mission « en vol » a été reprise'); assert.equal(ms.filter((m) => m.executions > 1).length, 1, 'une seule mission exécutée deux fois (la reprise)');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, 0, 'aucun envoi avant approbation');
    // Approbations : chaque action sensible produit EXACTEMENT un envoi, même si on clique deux fois.
    const aValider = db.prepare(`SELECT id FROM missions WHERE statut='EN_ATTENTE_APPROBATION'`).all(); assert.ok(aValider.length >= 4);
    for (const { id } of aValider) { await post(`/api/missions/${id}/decision`, { decision: 'approuver' }); await post(`/api/missions/${id}/decision`, { decision: 'approuver' }); }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sorties').get().n, aValider.length); assert.equal(db.prepare('SELECT COUNT(DISTINCT mission_id) AS n FROM sorties').get().n, aValider.length);
    assert.equal(verifierJournal(db).ok, true); assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM journal WHERE evenement='DEMARRAGE'`).get().n, 2);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM journal WHERE evenement='REPRISE_APRES_INTERRUPTION'`).get().n, 1);
    db.close(); void ids;
  } finally { try { enfant?.kill('SIGKILL'); } catch { /* */ } rmSync(donnees, { recursive: true, force: true }); }
});
