// Service d'UN espace (JARVIS_ESPACE=perso|odicolor|cockpit). En production : un service Windows par espace, sous un compte distinct.
// Redémarrable à tout moment : l'état est dans SQLite. Données réelles : désactivées tant qu'un administrateur n'a pas accordé l'autorisation.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { ouvrir, journaliser } from './db.js';
import { Jarvis } from './orchestrateur.js';
import { configurerEspace, verifierCloisonnement, PROFILS } from './espaces.js';
import { creerServeur } from './serveur.js';
import { diagnostic } from './sante.js';
import { sauvegarder, derniereSauvegarde, exercerRestauration } from './sauvegarde.js';
import { backendsDisponibles } from './confinement.js';
import { Interpreteur } from './modeles.js';
import { lanceurSchtasks } from './echange.js';
import { fournisseurAnthropic } from './fournisseurs/anthropic.js';
import { definirParam, param } from './db.js';
import { horloge } from './horloge.js';

const racineCode = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.env.JARVIS_ESPACE ?? 'odicolor';
if (!PROFILS[id]) { console.error(`Espace inconnu : ${id} (attendu : ${Object.keys(PROFILS).join(', ')})`); process.exit(2); }
if ((process.env.JARVIS_MODE ?? 'demo') !== 'demo') { console.error('Mode « reel » volontairement NON implémenté : les données réelles passent par une autorisation administrateur (voir docs/04_SECURITE.md).'); process.exit(2); }

const racineDonnees = process.env.JARVIS_DONNEES ?? join(racineCode, 'data', 'exploitation');
const env = { ...process.env };
const ID = id.toUpperCase();
const gen = (nom) => { const v = randomBytes(24).toString('base64url'); console.log(`${nom} de démonstration généré (affiché une seule fois) : ${v}`); return v; };
env[`JARVIS_${ID}_TOKEN`] ??= gen('Jeton utilisateur');
env[`JARVIS_${ID}_ADMIN_TOKEN`] ??= gen('Jeton administrateur');
env[`JARVIS_${ID}_CLE_SAUVEGARDE`] ??= randomBytes(18).toString('base64url');
const espace = configurerEspace(id, { racineDonnees, racineCode, env });
verifierCloisonnement([espace]);

mkdirSync(espace.dossier, { recursive: true });
const db = ouvrir(espace.dbChemin);
// Confinement : « auto » choisit le meilleur backend DISPONIBLE ; le NIVEAU réel est ensuite ATTESTÉ par des sondes (jamais présumé).
const utilisateurAgent = process.env[`JARVIS_${ID}_AGENT_USER`] ?? null;
const choix = process.env.JARVIS_CONFINEMENT ?? 'auto';
const dispo = backendsDisponibles({ utilisateurAgent });
const backend = choix === 'auto' ? (dispo.includes('linux-os') ? 'linux-os' : 'permission') : choix;
if (!dispo.includes(backend) && backend !== 'echange') { console.error(`Backend de confinement « ${backend} » indisponible ici (disponibles : ${dispo.join(', ')})`); process.exit(2); }
// IA en ligne : activée SEULEMENT si clé, modèle et tarifs sont fournis (aucun défaut présumé) ; son usage exige en plus l'autorisation « ia_en_ligne ».
let interpreteur = null;
if (process.env.JARVIS_IA_CLE && process.env.JARVIS_IA_MODELE) {
  try { interpreteur = new Interpreteur({ fournisseurs: { en_ligne: fournisseurAnthropic({ cle: process.env.JARVIS_IA_CLE, modele: process.env.JARVIS_IA_MODELE, tarifEntreeCentsParMillion: Number(process.env.JARVIS_IA_TARIF_ENTREE), tarifSortieCentsParMillion: Number(process.env.JARVIS_IA_TARIF_SORTIE) }) } }); console.log('IA en ligne configurée (inactive tant que l’autorisation « ia_en_ligne » n’est pas accordée)'); }
  catch (e) { console.error(`IA en ligne NON activée : ${e.message}`); }
}
// Backend « échange » (Windows) : le lanceur démarre la tâche planifiée du compte agent de l'espace.
const confinement = backend === 'echange' ? { backend, dossierEchange: join(espace.dossier, 'echange'), lanceur: lanceurSchtasks(id), dossierSortieAttestation: join(espace.dossierSorties, '_attestation') } : { backend, utilisateurAgent };
const jarvis = new Jarvis({ db, espace, isolation: process.env.JARVIS_ISOLATION !== 'non', racineCode, confinement, interpreteur });
if (param(db, 'double_execution') === null) definirParam(db, 'double_execution', process.env.JARVIS_DOUBLE_EXECUTION ?? 'sensibles'); // contrôle par défaut en service
const serveur = creerServeur({
  jarvis, jeton: espace.jeton, jetonAdmin: espace.jetonAdmin, dossierPublic: join(racineCode, 'public'),
  dossierSauvegardes: espace.dossierSauvegardes, cleSauvegarde: espace.cleSauvegarde,
  hotesAutorises: (process.env.JARVIS_HOTES_AUTORISES ?? '').split(',').filter(Boolean),
  liensEspaces: JSON.parse(process.env.JARVIS_LIENS_ESPACES ?? '[]'),
});
serveur.listen(espace.port, process.env.JARVIS_ADRESSE ?? '127.0.0.1', () => {
  journaliser(db, { acteur: 'service', evenement: 'DEMARRAGE', detail: { espace: id, port: espace.port, isolation: jarvis.isolation } });
  console.log(`JARVIS « ${espace.libelle} » (données fictives) : http://127.0.0.1:${espace.port} — agents isolés : ${jarvis.isolation}`);
});

// Auto-test de l'auditeur et attestation du confinement : au démarrage puis périodiquement. Échec ⇒ échec fermé (voir orchestrateur).
const verifs = async () => {
  try { const t = await jarvis.autotester(); if (!t.ok) console.error(`ALERTE AUDITEUR_DEFAILLANT : ${t.echecs[0]}`); } catch (e) { console.error('Auto-test impossible :', e.message); }
  try { const a = await jarvis.attester(); console.log(`Confinement attesté : niveau « ${a.niveau} » (backend ${a.backend})${a.niveau === 'os' ? '' : ' — INSUFFISANT pour des données réelles'}`); } catch (e) { console.error('Attestation impossible :', e.message); }
};
await verifs();
const periodiques = setInterval(verifs, 30 * 60 * 1000);

// Disjoncteur de l'orchestrateur : trop d'erreurs de boucle consécutives ⇒ sortie (code 3) pour laisser le SUPERVISEUR redémarrer proprement.
let enCours = false; let erreursConsecutives = 0;
const boucle = setInterval(async () => {
  if (enCours) return; enCours = true;
  try { await jarvis.tick(); erreursConsecutives = 0; } catch (e) { erreursConsecutives++; console.error(`Erreur de boucle (${erreursConsecutives}) :`, e.message); if (erreursConsecutives >= 5) { journaliser(db, { acteur: 'service', evenement: 'DISJONCTEUR_ORCHESTRATEUR', detail: { message: e.message } }); console.error('Disjoncteur : arrêt pour redémarrage par le superviseur'); process.exit(3); } }
  finally { enCours = false; }
}, 2000);
const surveillance = setInterval(() => {
  try {
    for (const a of diagnostic(db, { dossierDonnees: espace.dossier }).alertes.filter((x) => x.niveau === 'critique')) console.error(`ALERTE ${a.code} : ${a.message}`);
    const s = derniereSauvegarde(db);
    if (!s || horloge.maintenant() - Date.parse(s.ts) > 24 * 3600 * 1000) sauvegarder(db, espace.dossierSauvegardes, espace.cleSauvegarde);
    const r = param(db, 'derniere_restauration_testee'); const rj = r ? JSON.parse(r) : null;
    if (derniereSauvegarde(db) && (!rj || horloge.maintenant() - Date.parse(rj.ts) > 7 * 86400000)) exercerRestauration(db, espace.dossierSauvegardes, espace.cleSauvegarde);
  } catch (e) { console.error('Erreur de surveillance :', e.message); }
}, 30000);
function arreter() {
  clearInterval(boucle); clearInterval(surveillance); clearInterval(periodiques); serveur.close();
  const a = setInterval(() => { if (!enCours) { clearInterval(a); journaliser(db, { acteur: 'service', evenement: 'ARRET_PROPRE', detail: {} }); db.close(); process.exit(0); } }, 100);
}
process.on('SIGINT', arreter); process.on('SIGTERM', arreter);
