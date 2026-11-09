// ESSAI D'ENDURANCE REPRODUCTIBLE (données fictives). Lance un vrai service + un second travailleur + un superviseur,
// injecte de la charge et du CHAOS (kill -9, gel de processus, panne de l'intégration), puis vérifie les invariants.
//   node --disable-warning=ExperimentalWarning scripts/endurance.js --minutes 1440 --graine 7 --dir /chemin/neuf
// Rien n'est simulé côté mécanique (vrais processus, vrai SQLite, vrais signaux) ; SIMULÉS : l'humain (approbateur automatique),
// la boîte Gmail (fichiers .eml locaux), et l'horloge n'est PAS accélérée (durée réelle = durée annoncée).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, renameSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Superviseur } from '../src/superviseur.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const MINUTES = Number(arg('minutes', '2')); const GRAINE = Number(arg('graine', '1')); const DIR = arg('dir');
const CHAOS_MOYEN_S = Number(arg('chaos-s', '60'));
if (!DIR) { console.error('--dir obligatoire (dossier NEUF)'); process.exit(2); }
if (existsSync(DIR) && readdirSync(DIR).length) { console.error('Le dossier doit être vide/neuf'); process.exit(2); }
mkdirSync(DIR, { recursive: true }); chmodSync(DIR, 0o711);
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
let s = GRAINE >>> 0; const alea = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; // PRNG déterministe (graine)
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const portLibre = () => new Promise((ok) => { const x = createServer(); x.listen(0, '127.0.0.1', () => { const p = x.address().port; x.close(() => ok(p)); }); });
const PORT = await portLibre(); const U = 'endurance-utilisateur-0123456789abcdef'; const A = 'endurance-admin-0123456789abcdefghij';
const BASE = join(DIR, 'odicolor'); const DBF = join(BASE, 'jarvis.sqlite'); const BOITE = join(BASE, 'boite-synthetique', 'brouillons');
const env = { PATH: process.env.PATH, JARVIS_ESPACE: 'odicolor', JARVIS_DONNEES: DIR, JARVIS_ODICOLOR_TOKEN: U, JARVIS_ODICOLOR_ADMIN_TOKEN: A, JARVIS_ODICOLOR_CLE_SAUVEGARDE: 'cle-endurance-sauvegarde-solide', JARVIS_ODICOLOR_PORT: String(PORT), JARVIS_ISOLATION: 'oui', JARVIS_CONFINEMENT: 'permission', JARVIS_OUVRIER_DUREE_MS: '86400000' };
const NODE = ['--disable-warning=ExperimentalWarning'];

// ---------- processus ----------
const compt = { redemarrages_service: 0, redemarrages_ouvrier: 0, kill9_service: 0, kill9_ouvrier: 0, gel_service: 0, pannes_integration: 0, pannes_integration_s: 0 };
let service = null; let ouvrier = null; let fin = false;
const lancerService = () => { service = spawn(process.execPath, [...NODE, join(RACINE, 'src', 'demarrer.js')], { env, stdio: 'ignore' }); };
const lancerOuvrier = () => { ouvrier = spawn(process.execPath, [...NODE, join(RACINE, 'scripts', 'ouvrier.js')], { env, stdio: 'ignore' }); ouvrier.on('exit', () => { ouvrier = null; }); };
const sonder = async () => { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/sante`, { signal: AbortSignal.timeout(2000) }); return r.ok ? await r.json() : null; } catch { return null; } };
const sup = new Superviseur({ services: [{ id: 'odicolor', sonder, redemarrer: async () => { try { service.kill('SIGKILL'); } catch { /* */ } compt.redemarrages_service++; lancerService(); } }], politique: { echecsAvantRedemarrage: 2, silenceMaxS: 30, redemarragesMax: 1000, fenetreS: 600 } });
const alertes = {}; sup.alerter = (a) => { alertes[a.code] = (alertes[a.code] ?? 0) + 1; };
const http = async (chemin, corps, jeton = U) => { try { const r = await fetch(`http://127.0.0.1:${PORT}${chemin}`, { method: corps ? 'POST' : 'GET', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined, signal: AbortSignal.timeout(5000) }); return { status: r.status, corps: await r.json().catch(() => ({})) }; } catch { return { status: 0, corps: {} }; } };
const lecture = () => { const d = new DatabaseSync(DBF, { readOnly: true }); d.exec('PRAGMA busy_timeout=5000'); return d; };
const rss = (pid) => { try { return Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))[1]) / 1024; } catch { return null; } };
const taille = (d) => { let t = 0; try { for (const f of readdirSync(d, { withFileTypes: true })) t += f.isDirectory() ? taille(join(d, f.name)) : statSync(join(d, f.name)).size; } catch { /* */ } return t; };

// ---------- charge ----------
const DEMANDES = ['devis pour le garage Martin : 3 vernis', 'devis pour le garage Durand : 2 vernis', 'prépare les relances', 'analyse financière', 'planifie ma journée', 'dossier du client Garage Martin', 'contrôle du catalogue produits', 'suivi des commandes', 'priorise les prospects', 'prépare la commande du devis DEV-2026-012'];
const soumises = new Map(); // cle → { id, accuse }
const decisions = { approuve: 0, refuse: 0, double_clic: 0, erreurs: 0 }; const approuvees = new Set();
let n = 0;
async function chargeur() {
  while (!fin) {
    const lot = 1 + Math.floor(alea() * 3);
    for (let i = 0; i < lot; i++) {
      const cle = `endurance-${GRAINE}-${n++}`; const d = DEMANDES[Math.floor(alea() * DEMANDES.length)];
      let r = await http('/api/missions', { demande: d, cle });
      // Service indisponible : on RÉESSAIE avec la MÊME clé (idempotence) — c'est ce que ferait le téléphone.
      for (let t = 0; r.status !== 201 && t < 60 && !fin; t++) { await dormir(2000); r = await http('/api/missions', { demande: d, cle }); }
      if (r.status === 201) soumises.set(cle, { id: r.corps.id, demande: d });
    }
    await dormir(4000 + alea() * 8000);
  }
}
async function approbateur() { // SIMULÉ : humain automatique (85 % approuve, 15 % refuse, double clic une fois sur 4)
  while (!fin) {
    let ids = [];
    try { const d = lecture(); ids = d.prepare(`SELECT id FROM missions WHERE statut='EN_ATTENTE_APPROBATION'`).all().map((x) => x.id); d.close(); } catch { /* base occupée */ }
    for (const id of ids) {
      const dec = alea() < 0.85 ? 'approuver' : 'refuser';
      const r = await http(`/api/missions/${id}/decision`, { decision: dec });
      if (r.status === 200) { if (dec === 'approuver') { approuvees.add(id); decisions.approuve++; } else decisions.refuse++; if (alea() < 0.25) { await http(`/api/missions/${id}/decision`, { decision: dec }); decisions.double_clic++; } } else if (r.status !== 0) decisions.erreurs++;
    }
    await dormir(3000);
  }
}

// ---------- chaos ----------
// Les missions durent ~0,1 s : un kill aléatoire tombe presque toujours à vide. On CIBLE donc le moment où une mission est réellement EN_COURS
// (au mieux pendant 15 s ; sinon on tue quand même) pour exercer pour de bon la reprise après interruption.
const enVol = async () => { for (let i = 0; i < 150; i++) { try { const d = lecture(); const n = d.prepare(`SELECT COUNT(*) AS n FROM missions WHERE statut='EN_COURS'`).get().n; d.close(); if (n) return true; } catch { /* */ } await dormir(100); } return false; };
const tues = { en_vol: 0, a_vide: 0 };
const journalChaos = [];
async function chaos() {
  while (!fin) {
    await dormir(-Math.log(1 - alea()) * CHAOS_MOYEN_S * 1000); if (fin) break;
    const tirage = alea(); const t0 = Date.now();
    if (tirage < 0.3 && service) { try { (await enVol()) ? tues.en_vol++ : tues.a_vide++; service.kill('SIGKILL'); compt.kill9_service++; journalChaos.push({ t: new Date().toISOString(), evt: 'kill9_service' }); } catch { /* */ } }
    else if (tirage < 0.5 && ouvrier) { try { (await enVol()) ? tues.en_vol++ : tues.a_vide++; ouvrier.kill('SIGKILL'); compt.kill9_ouvrier++; journalChaos.push({ t: new Date().toISOString(), evt: 'kill9_ouvrier' }); } catch { /* */ } }
    else if (tirage < 0.65 && service) { try { process.kill(service.pid, 'SIGSTOP'); compt.gel_service++; journalChaos.push({ t: new Date().toISOString(), evt: 'gel_service' }); await dormir(15000); try { process.kill(service.pid, 'SIGCONT'); } catch { /* déjà remplacé */ } } catch { /* */ } }
    else { // panne de l'intégration Gmail synthétique : le dossier devient introuvable
      const d = 15000 + alea() * 60000; try { renameSync(BOITE, `${BOITE}.panne`); compt.pannes_integration++; journalChaos.push({ t: new Date().toISOString(), evt: 'panne_integration', duree_s: Math.round(d / 1000) }); await dormir(d); renameSync(`${BOITE}.panne`, BOITE); compt.pannes_integration_s += Math.round((Date.now() - t0) / 1000); } catch { /* */ }
    }
  }
  try { if (existsSync(`${BOITE}.panne`)) renameSync(`${BOITE}.panne`, BOITE); } catch { /* */ }
}

// ---------- échantillonnage ----------
const echantillons = [];
function echantillon() {
  const e = { t: new Date().toISOString(), service_rss_mo: service?.pid ? rss(service.pid) : null, ouvrier_rss_mo: ouvrier?.pid ? rss(ouvrier.pid) : null, dossier_mo: +(taille(DIR) / 1048576).toFixed(2) };
  try { const d = lecture(); e.journal_lignes = d.prepare('SELECT COUNT(*) AS n FROM journal').get().n; e.missions = d.prepare('SELECT COUNT(*) AS n FROM missions').get().n; e.outbox = Object.fromEntries(d.prepare('SELECT etat, COUNT(*) AS n FROM outbox GROUP BY etat').all().map((r) => [r.etat, r.n])); d.close(); } catch { /* base occupée : échantillon partiel */ }
  try { e.db_mo = +((statSync(DBF).size + (existsSync(`${DBF}-wal`) ? statSync(`${DBF}-wal`).size : 0)) / 1048576).toFixed(2); } catch { /* */ }
  echantillons.push(e);
}

// ---------- déroulement ----------
const debut = Date.now(); lancerService();
for (let i = 0; i < 60 && !(await sonder()); i++) await dormir(500);
await http('/api/admin/parametres', { cle: 'connecteur_gmail', valeur: 'synthetique' }, A);
lancerOuvrier();
const boucles = [(async () => { while (!fin) { try { await sup.cycle(); if (!ouvrier) { compt.redemarrages_ouvrier++; lancerOuvrier(); } } catch { /* */ } await dormir(5000); } })(), (async () => { while (!fin) { echantillon(); await dormir(30000); } })()];
const taches = [chargeur(), approbateur(), chaos()];
const arret = () => { fin = true; }; process.on('SIGTERM', arret); process.on('SIGINT', arret);
while (!fin && Date.now() - debut < MINUTES * 60000) await dormir(1000);
fin = true; const dureeChargeS = Math.round((Date.now() - debut) / 1000);
await Promise.all(taches);

// ---------- purge : plus de chaos, on laisse finir ----------
const finTravail = Date.now() + 8 * 60000; let reste = 1;
while (Date.now() < finTravail) {
  await sup.cycle(); if (!ouvrier) lancerOuvrier();
  try { const d = lecture(); reste = d.prepare(`SELECT COUNT(*) AS n FROM missions WHERE statut IN ('EN_FILE','EN_COURS','A_CORRIGER')`).get().n + d.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE etat IN ('A_FAIRE','EN_COURS')`).get().n; d.close(); } catch { /* */ }
  if (reste === 0) break; await dormir(2000);
}
// Les validations tombées en attente pendant la purge : on les décide aussi (simulé), puis on re-purge brièvement.
fin = false; const apb = approbateur(); await dormir(20000); fin = true; await apb;
for (let i = 0; i < 60; i++) { try { const d = lecture(); const r = d.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE etat IN ('A_FAIRE','EN_COURS')`).get().n; d.close(); if (!r) break; } catch { /* */ } await dormir(2000); }
echantillon();

// ---------- vérification des invariants ----------
const d = lecture(); const R = {};
const missions = d.prepare('SELECT id, cle_idempotence, statut, executions, reprises, corrections FROM missions').all();
const parCle = new Map(missions.map((m) => [m.cle_idempotence, m]));
R.missions_acceptees_par_l_api = soumises.size;
R.missions_perdues = [...soumises.keys()].filter((c) => !parCle.has(c)).length; // accusé 201 reçu mais absente de la base
R.missions_en_base = missions.length;
R.missions_dupliquees = missions.length - new Set(missions.map((m) => m.cle_idempotence)).size;
R.statuts = Object.fromEntries(d.prepare('SELECT statut, COUNT(*) AS n FROM missions GROUP BY statut').all().map((r) => [r.statut, r.n]));
R.missions_non_terminees = missions.filter((m) => ['EN_FILE', 'EN_COURS', 'A_CORRIGER'].includes(m.statut)).length;
R.missions_rejouees_apres_interruption = missions.filter((m) => m.reprises > 0).length;
R.missions_executees_plus_d_une_fois = missions.filter((m) => m.executions > 1 + m.corrections).length; // au-delà des corrections demandées par l'auditeur
R.executions_totales = missions.reduce((a, m) => a + m.executions, 0);
const ev = (nom) => d.prepare('SELECT COUNT(*) AS n FROM journal WHERE evenement=?').get(nom).n;
R.erreurs_agents = ev('AGENT_ERREUR'); R.audits_refuses_puis_corriges = ev('CORRECTION_DEMANDEE'); R.resultats_contradictoires = ev('RESULTATS_CONTRADICTOIRES'); R.resultats_abandonnes_bail_perdu = ev('RESULTAT_ABANDONNE_BAIL_PERDU'); R.reprises_apres_interruption_journalisees = ev('REPRISE_APRES_INTERRUPTION'); R.demarrages_journalises = ev('DEMARRAGE');
R.sorties = d.prepare('SELECT COUNT(*) AS n FROM sorties').get().n; R.sorties_distinctes = d.prepare('SELECT COUNT(DISTINCT mission_id || type) AS n FROM sorties').get().n;
const approuveesDb = d.prepare(`SELECT COUNT(*) AS n FROM missions WHERE statut='VALIDE' AND decide_par IS NOT NULL`).get().n;
R.approbations_en_base = approuveesDb; R.sorties_sans_approbation = d.prepare(`SELECT COUNT(*) AS n FROM sorties s JOIN missions m ON m.id=s.mission_id WHERE m.decide_par IS NULL`).get().n;
R.outbox = Object.fromEntries(d.prepare('SELECT etat, COUNT(*) AS n FROM outbox GROUP BY etat').all().map((r) => [r.etat, r.n]));
R.outbox_tentatives_max = d.prepare('SELECT COALESCE(MAX(tentatives),0) AS n FROM outbox').get().n; R.outbox_actions_ayant_du_etre_retentees = d.prepare('SELECT COUNT(*) AS n FROM outbox WHERE tentatives>1').get().n;
const brouillons = existsSync(BOITE) ? readdirSync(BOITE).filter((f) => f.endsWith('.eml')) : [];
R.brouillons_dans_la_boite = brouillons.length; R.brouillons_attendus = d.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE etat='FAIT'`).get().n + d.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE etat IN ('A_FAIRE','EN_COURS','ECHEC')`).get().n * 0;
R.doublons_de_brouillon = brouillons.length - new Set(brouillons).size;
R.alertes_critiques_finales = (await http('/api/etat')).corps.alertes?.filter((a) => a.niveau === 'critique').map((a) => a.code) ?? 'indisponible';
d.close();
const { verifierJournal, ouvrir } = await import('../src/db.js'); const dbv = ouvrir(DBF); const jr = verifierJournal(dbv); R.journal_chaine_intact = jr.ok; R.journal_lignes = jr.lignes;
const { verifierTracabilite } = await import('../src/tracabilite.js'); const tr = verifierTracabilite(dbv, 100000); R.tracabilite_ok = tr.ok; R.tracabilite_problemes = tr.problemes?.slice(0, 5) ?? []; dbv.close();
const rs = echantillons.map((e) => e.service_rss_mo).filter(Number.isFinite); const ro = echantillons.map((e) => e.ouvrier_rss_mo).filter(Number.isFinite);
const moitie = (a) => a.length ? { debut_mo: +a[0].toFixed(1), fin_mo: +a.at(-1).toFixed(1), max_mo: +Math.max(...a).toFixed(1), mediane_premier_tiers_mo: +[...a.slice(0, Math.max(1, Math.floor(a.length / 3)))].sort((x, y) => x - y)[Math.floor(Math.max(1, Math.floor(a.length / 3)) / 2)].toFixed(1), mediane_dernier_tiers_mo: +[...a.slice(-Math.max(1, Math.floor(a.length / 3)))].sort((x, y) => x - y)[Math.floor(Math.max(1, Math.floor(a.length / 3)) / 2)].toFixed(1) } : null;
const first = echantillons.find((e) => e.journal_lignes !== undefined); const last = [...echantillons].reverse().find((e) => e.journal_lignes !== undefined);
const rapport = {
  protocole: { duree_demandee_min: MINUTES, duree_charge_reelle_s: dureeChargeS, duree_totale_reelle_s: Math.round((Date.now() - debut) / 1000), graine: GRAINE, chaos_moyen_s: CHAOS_MOYEN_S, horloge_acceleree: false, node: process.version, commit: arg('commit', 'non fourni') },
  simule: ['humain (approbateur automatique, 85 % approuve / 15 % refuse / double clic 25 %)', 'boîte Gmail (fichiers .eml locaux)', 'données ODICOLOR (fictives)'],
  reel: ['processus (service, 2e travailleur, agents isolés)', 'signaux kill -9 / SIGSTOP', 'SQLite WAL', 'disque'],
  chaos: { ...compt, kill9_pendant_une_mission: tues.en_vol, kill9_a_vide: tues.a_vide, evenements: journalChaos.length, alertes_superviseur: alertes },
  charge: { decisions },
  invariants: R,
  memoire: { service: moitie(rs), ouvrier: moitie(ro) },
  croissance: { journal_lignes: [first?.journal_lignes, last?.journal_lignes], db_mo: [first?.db_mo, last?.db_mo], dossier_mo: [echantillons[0]?.dossier_mo, echantillons.at(-1)?.dossier_mo], octets_par_mission_en_base: last?.missions ? Math.round(((last.db_mo ?? 0) * 1048576) / last.missions) : null, lignes_de_journal_par_mission: last?.missions ? +(last.journal_lignes / last.missions).toFixed(1) : null },
  echantillons: echantillons.length,
};
const verdictOk = R.missions_perdues === 0 && R.missions_dupliquees === 0 && R.missions_non_terminees === 0 && R.sorties === R.sorties_distinctes && R.sorties_sans_approbation === 0 && R.journal_chaine_intact && R.tracabilite_ok && R.doublons_de_brouillon === 0 && (R.outbox.ECHEC ?? 0) === 0 && R.brouillons_dans_la_boite === R.brouillons_attendus;
rapport.verdict = verdictOk ? 'INVARIANTS_RESPECTES_SUR_CETTE_DUREE' : 'INVARIANTS_VIOLES';
writeFileSync(join(DIR, 'rapport-endurance.json'), JSON.stringify({ ...rapport, serie: echantillons }, null, 1));
console.log(JSON.stringify(rapport, null, 1));
try { service?.kill('SIGTERM'); ouvrier?.kill('SIGTERM'); } catch { /* */ }
await Promise.all(boucles.map((b) => Promise.race([b, dormir(6000)]))); setTimeout(() => process.exit(verdictOk ? 0 : 1), 500);
