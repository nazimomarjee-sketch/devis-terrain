// Démonstration de bout en bout avec DONNÉES FICTIVES, sans serveur : dépôt → exécution → audit → approbation.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrir, verifierJournal } from '../src/db.js';
import { Jarvis } from '../src/orchestrateur.js';
import { creerAgentDevis, formaterCentimes } from '../src/agents/devis.js';
import { metriques } from '../src/metriques.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'jarvis-scenario-'));
const db = ouvrir(join(tmp, 'jarvis.sqlite'));
const jarvis = new Jarvis({ db, agents: [creerAgentDevis()], dossierDonnees: tmp, dossierFictif: join(racine, 'data', 'fictif'), dossierSorties: join(tmp, 'sorties') });

const demande = process.argv[2] ?? 'Jarvis, prépare un devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs';
console.log('DEMANDE      :', demande);
const { id } = jarvis.deposerParUtilisateur(demande);
console.log('MISSION      :', id);
await jarvis.executerJusquaVide();
const m = db.prepare('SELECT * FROM missions WHERE id=?').get(id);
console.log('STATUT       :', m.statut, m.raison ? `— ${m.raison}` : '');
if (m.question) console.log('QUESTION     :', m.question);
if (m.resultat) {
  const r = JSON.parse(m.resultat);
  for (const l of r.lignes) console.log(`  ${l.ref}  x${l.qte}  net ${formaterCentimes(l.net_cents)}`);
  console.log(`TOTAL HT ${formaterCentimes(r.total_ht_cents)} | TVA ${formaterCentimes(r.tva_cents)} | TTC ${formaterCentimes(r.total_ttc_cents)} EUR`);
  console.log('AUDIT        :', JSON.parse(m.rapport_audit).controles.map((c) => `${c.ok ? '✔' : '✘'} ${c.nom}`).join('  '));
  console.log('AVANT APPROBATION, ENVOIS :', db.prepare('SELECT COUNT(*) n FROM sorties').get().n);
  console.log('APPROBATION  :', JSON.stringify(jarvis.approuver(id, 'approuver')));
  console.log('SORTIE       :', db.prepare('SELECT type, simule FROM sorties').get());
  console.log('FICHIERS     :', join(tmp, 'sorties', id));
}
console.log('JOURNAL      :', JSON.stringify(verifierJournal(db)));
console.log('MÉTRIQUES    :', JSON.stringify(metriques(db)));
db.close();
