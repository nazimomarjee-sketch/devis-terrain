// AUTO-TEST DE L'AUDITEUR (supervision de la supervision). Un auditeur silencieusement défaillant est le pire cas :
// il valide tout. À intervalles réguliers, sur un jeu CANARI figé (indépendant des données de l'espace), pour chaque agent :
//   1) l'agent produit un résultat → l'auditeur DOIT le valider (sinon : faux positif, travail bloqué à tort) ;
//   2) on falsifie ce résultat → l'auditeur DOIT le refuser (sinon : il laisse passer des erreurs).
// Tout écart ⇒ état « AUDITEUR_DEFAILLANT » : l'orchestrateur n'attribue plus de validation et refuse les approbations (échec fermé).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FABRIQUES } from './agents/index.js';
import { AUDITEURS } from './auditeurs/index.js';
import { chargerJeux } from './donnees.js';
import { amorcerRegles } from './regles.js';
import { ouvrir } from './db.js';
import { reglesEnDict } from './regles.js';

const CANARI = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'canari');
const DEMANDES = {
  devis: 'prépare un devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs', produits: 'contrôle du catalogue produits', prospection: 'priorise les prospects top 5',
  clients: 'dossier du client Garage Martin', relances: 'prépare les relances', commandes: 'prépare la commande du devis DEV-2026-012', finance: 'analyse financière', planification: 'planifie ma journée',
};
const AUJOURDHUI = '2026-11-09'; // fixe : le canari ne dépend pas de l'horloge

/** Falsifie le premier champ numérique significatif d'un résultat (copie profonde). */
export function falsifier(resultat) {
  const c = structuredClone(resultat); let fait = false;
  const marche = (o) => { for (const [k, v] of Object.entries(o)) { if (fait) return; if (typeof v === 'number' && /cents|score|nombre|qte|minutes|total|charge|nb_|age/.test(k) && Number.isSafeInteger(v)) { o[k] = v + 1; fait = true; return; } if (v && typeof v === 'object') marche(v); } };
  marche(c); return fait ? c : null;
}

export async function autotestAuditeurs({ agents = Object.keys(DEMANDES) } = {}) {
  const dossierSorties = mkdtempSync(join(tmpdir(), 'autotest-')); const db = ouvrir(':memory:');
  const echecs = []; const verifies = [];
  try {
    amorcerRegles(db, CANARI); const regles = reglesEnDict(db);
    for (const nom of agents) {
      const mission = { id: 'M-20261109-c0ffee', demande: DEMANDES[nom], corrections: 0 };
      const jeux = chargerJeux(CANARI, FABRIQUES[nom]().droits.lire.filter((n) => !['regles', 'missions_en_attente', 'ordres_atelier'].includes(n)));
      const ctx = { donnees: { ...jeux.donnees, missions_en_attente: [] }, regles, fictif: true, retours: [], aujourdhui: AUJOURDHUI, dossierSortie: join(dossierSorties, mission.id), depenser() {} };
      let sortie;
      try { sortie = await FABRIQUES[nom]({}).executer(mission, ctx); } catch (e) { echecs.push(`${nom} : l'agent canari a échoué (${e.message})`); continue; }
      const audit = (r) => AUDITEURS[nom]({ mission: { id: mission.id, demande: mission.demande }, resultat: r, regles, aujourdhui: AUJOURDHUI, dossierSorties, dossierJeu: CANARI, missionsEnAttente: [], autorisations: [] });
      let bon; try { bon = audit(sortie.resultat); } catch (e) { echecs.push(`${nom} : l'auditeur a planté (${e.message})`); continue; }
      if (bon.verdict !== 'VALIDE') echecs.push(`${nom} : FAUX POSITIF — résultat correct refusé (${bon.echecs?.[0]})`);
      const faux = falsifier(sortie.resultat);
      if (!faux) { echecs.push(`${nom} : aucun champ falsifiable dans le canari`); continue; }
      let mauvais; try { mauvais = audit(faux); } catch { mauvais = { verdict: 'A_CORRIGER' }; } // un plantage face à une falsification = refus
      if (mauvais.verdict === 'VALIDE') echecs.push(`${nom} : FAUX NÉGATIF — résultat falsifié ACCEPTÉ`);
      verifies.push(nom);
    }
  } finally { try { db.close(); } catch { /* */ } rmSync(dossierSorties, { recursive: true, force: true }); }
  return { ok: echecs.length === 0, verifies, echecs };
}
