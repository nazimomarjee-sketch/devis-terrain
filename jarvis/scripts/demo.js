// PARCOURS DE DÉMONSTRATION de bout en bout, sur un VRAI service et une VRAIE interface (Chromium au format téléphone 360×780) :
//   demande tapée sur le téléphone → agent Devis → contrôle de l'auditeur indépendant → validation humaine → brouillon de mail.
// Chaque étape est étiquetée RÉEL ou SIMULÉ. L'« humain » du script est un clic automatique : en démo interactive, lance le service
// (`npm start`) et fais les clics toi-même. Usage : node --disable-warning=ExperimentalWarning scripts/demo.js --dir <dossier neuf> [--captures <dossier>]
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DIR = arg('dir'); const CAP = arg('captures', DIR); if (!DIR) { console.error('--dir obligatoire'); process.exit(2); }
if (existsSync(DIR) && readdirSync(DIR).length) { console.error('Dossier non vide'); process.exit(2); }
mkdirSync(DIR, { recursive: true }); chmodSync(DIR, 0o711); mkdirSync(CAP, { recursive: true });
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const portLibre = () => new Promise((ok) => { const x = createServer(); x.listen(0, '127.0.0.1', () => { const p = x.address().port; x.close(() => ok(p)); }); });
const PORT = await portLibre(); const U = 'demo-utilisateur-0123456789abcdef'; const A = 'demo-admin-0123456789abcdefghijk';
const env = { PATH: process.env.PATH, JARVIS_ESPACE: 'odicolor', JARVIS_DONNEES: DIR, JARVIS_ODICOLOR_TOKEN: U, JARVIS_ODICOLOR_ADMIN_TOKEN: A, JARVIS_ODICOLOR_CLE_SAUVEGARDE: 'cle-demo-sauvegarde-solide-xyz', JARVIS_ODICOLOR_PORT: String(PORT), JARVIS_ISOLATION: 'oui', JARVIS_CONFINEMENT: 'permission' };
const svc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(RACINE, 'src', 'demarrer.js')], { env, stdio: 'ignore' });
const base = `http://127.0.0.1:${PORT}`; const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (c, corps, j = U) => (await fetch(base + c, { method: corps ? 'POST' : 'GET', headers: { Authorization: `Bearer ${j}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })).json();
const etapes = []; const noter = (n, nature, quoi, preuve) => { etapes.push({ n, nature, quoi, preuve }); console.log(`${String(n).padStart(2)}. [${nature.padEnd(6)}] ${quoi}${preuve ? `\n      → ${preuve}` : ''}`); };
const attendre = async (f, ms = 90000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await dormir(400); } throw new Error('délai dépassé'); };
let nav;
try {
  await attendre(async () => { try { return (await fetch(`${base}/api/sante`)).ok; } catch { return false; } });
  await api('/api/admin/parametres', { cle: 'connecteur_gmail', valeur: 'synthetique' }, A);
  noter(0, 'RÉEL', 'Service JARVIS ODICOLOR démarré (processus Node distinct, SQLite, agents isolés)', `port ${PORT}`);
  nav = await chromium.launch(); const ctx = await nav.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript((t) => { try { localStorage.setItem('jarvis_jeton', t); } catch { /* */ } }, U);
  const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); await p.goto(base); await p.waitForSelector('#demande');
  await p.screenshot({ path: join(CAP, '1-accueil-telephone.png') });
  noter(1, 'SIMULÉ', 'Téléphone : un navigateur Chromium émulant un Samsung (360×780, tactile) — PAS un vrai téléphone, pas de VPN', '1-accueil-telephone.png (bandeau « MODE DÉMO — données et prix fictifs »)');
  const DEMANDE = 'prépare un devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs';
  await p.fill('#demande', DEMANDE); await p.screenshot({ path: join(CAP, '2-demande-saisie.png') }); await p.click('#envoyer');
  noter(2, 'RÉEL', `Demande envoyée depuis l’interface : « ${DEMANDE} »`, 'POST /api/missions authentifié (jeton utilisateur), 2-demande-saisie.png');
  await p.waitForSelector('#liste-validations li, #liste-validations .carte, #carte-prochaine .carte', { timeout: 90000 });
  const etat = await attendre(async () => { const e = await api('/api/etat'); return e.a_valider.length ? e : null; });
  const v = etat.a_valider[0]; const det = await api(`/api/missions/${v.id}/decision-detail`);
  noter(3, 'RÉEL', `Agent Devis (RÈGLES déterministes, aucun modèle IA) a préparé « ${v.titre} » — ${v.detail}`, `plan : ${JSON.stringify(det.plan)?.slice(0, 90)} ; règles utilisées : ${JSON.stringify(det.regles_utilisees)?.slice(0, 120)}`);
  const ok = det.controles.filter((c) => c.ok).length;
  noter(4, 'RÉEL', `Auditeur INDÉPENDANT (recalcul depuis les sources, sans importer le code de l’agent) : ${ok}/${det.controles.length} contrôles réussis`, det.controles.map((c) => `${c.ok ? '✔' : '✘'} ${c.nom}`).join(' | '));
  await dormir(500); await p.reload(); await p.waitForSelector('#carte-prochaine .carte'); await p.screenshot({ path: join(CAP, '3-a-valider.png') });
  await p.locator('#carte-prochaine button', { hasText: 'Détail' }).click(); await p.waitForSelector('#detail[open]'); await p.screenshot({ path: join(CAP, '4-detail-auditeur.png') }); await p.click('#fermer-detail');
  noter(5, 'RÉEL', 'Écran « à valider » et détail de la décision (plan, droits, contrôles, chronologie)', '3-a-valider.png, 4-detail-auditeur.png');
  const avant = readdirSync(join(DIR, 'odicolor')).includes('boite-synthetique') ? readdirSync(join(DIR, 'odicolor', 'boite-synthetique', 'brouillons')).length : 0;
  noter(6, 'RÉEL', `Avant validation : brouillons dans la boîte = ${avant} (rien n’est créé sans décision humaine)`, 'dossier boite-synthetique/brouillons');
  await p.locator('#carte-prochaine button.ok').click(); // clic automatique = SIMULATION de l’humain
  noter(7, 'SIMULÉ', 'VALIDATION HUMAINE : ici un clic automatique sur « Approuver » (en usage réel : toi, sur ton téléphone). Le code, lui, est réel : réaudit, puis approbation transactionnelle', 'POST …/decision');
  const brouillon = await attendre(() => { const d = join(DIR, 'odicolor', 'boite-synthetique', 'brouillons'); try { const f = readdirSync(d).filter((x) => x.endsWith('.eml')); return f.length ? f[0] : null; } catch { return null; } });
  const eml = readFileSync(join(DIR, 'odicolor', 'boite-synthetique', 'brouillons', brouillon), 'utf8');
  await p.reload(); await p.waitForSelector('#app'); await dormir(800); await p.screenshot({ path: join(CAP, '5-apres-validation.png'), fullPage: true });
  writeFileSync(join(CAP, 'brouillon-synthetique.eml'), eml);
  noter(8, 'SIMULÉ', 'Brouillon de mail : écrit par l’outbox dans une BOÎTE SYNTHÉTIQUE locale (fichier .eml, destinataire .invalid). Aucun appel à Gmail, rien n’est envoyé (le connecteur n’a même pas de méthode d’envoi)', `${brouillon} — X-Jarvis-Statut: ${/^X-Jarvis-Statut:\s*(\S+)/m.exec(eml)?.[1]}`);
  noter(9, 'RÉEL', 'État final de la mission', `statut ${(await api(`/api/missions/${v.id}`)).statut} (journal chaîné vérifié par la supervision : alertes critiques = ${(await api('/api/etat')).alertes.filter((a) => a.niveau === 'critique').length})`);
  console.log('\n----- Brouillon (extrait) -----\n' + eml.split('\n').slice(0, 14).join('\n'));
  writeFileSync(join(CAP, 'parcours.json'), JSON.stringify({ etapes, demande: DEMANDE }, null, 1));
  console.log(`\nOK — captures et parcours.json dans ${CAP}`);
} catch (e) { console.error('ÉCHEC DE LA DÉMO :', e.message); process.exitCode = 1; }
finally { try { await nav?.close(); } catch { /* */ } svc.kill('SIGTERM'); await dormir(800); try { svc.kill('SIGKILL'); } catch { /* */ } }
