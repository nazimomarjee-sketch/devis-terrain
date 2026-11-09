// Backend « échange » : le service dépose l'entrée, un lanceur (Windows : tâche planifiée sous le COMPTE AGENT) exécute,
// le service relit la sortie. Protocole protégé contre : sortie périmée ou forgée (nonce), exécutions simultanées (verrou),
// sortie démesurée, absence de réponse (délai + arrêt). Les commandes schtasks sont construites ici ; leur EXÉCUTION n'a pas
// pu être testée hors Windows.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifierSortie, LIMITES } from './confinement.js';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export function commandesSchtasks(espace) {
  const tache = `Jarvis-agent-${espace}`;
  return { lancer: ['schtasks', ['/Run', '/TN', tache]], arreter: ['schtasks', ['/End', '/TN', tache]] };
}
export function lanceurSchtasks(espace, exec = execFileSync) {
  const c = commandesSchtasks(espace);
  return { lancer: () => exec(c.lancer[0], c.lancer[1], { windowsHide: true }), arreter: () => { try { exec(c.arreter[0], c.arreter[1], { windowsHide: true }); } catch { /* déjà terminé */ } } };
}

/**
 * @param lanceur  { lancer(dossierCourant), arreter() } — Windows : lanceurSchtasks ; tests : lanceur local.
 * @param entree   contenu de entree.json SANS nonce (ajouté ici)
 */
export async function executerParEchange({ dossierEchange, entree, lanceur, delaiMs, maxSortie = 2_000_000, dossierSortie = null, limites = LIMITES }) {
  const courant = join(dossierEchange, 'courant'); const verrou = join(dossierEchange, 'verrou');
  mkdirSync(dossierEchange, { recursive: true });
  // Verrou exclusif (mkdir atomique) : un seul agent à la fois par espace ; un verrou périmé est repris.
  const prendre = () => { try { mkdirSync(verrou); return true; } catch { return false; } };
  if (!prendre()) {
    const age = Date.now() - statSync(verrou).mtimeMs;
    if (age > delaiMs + 10_000) { rmSync(verrou, { recursive: true, force: true }); if (!prendre()) throw new Error('Échange occupé'); } else throw new Error('Échange occupé : une autre exécution est en cours');
  }
  const nonce = randomBytes(16).toString('hex');
  try {
    rmSync(courant, { recursive: true, force: true }); mkdirSync(courant, { recursive: true });
    const tmp = join(courant, 'entree.tmp'); writeFileSync(tmp, JSON.stringify({ ...entree, nonce })); renameSync(tmp, join(courant, 'entree.json'));
    await lanceur.lancer(courant);
    const t0 = Date.now(); const fichier = join(courant, 'sortie.json');
    while (Date.now() - t0 < delaiMs) {
      if (existsSync(fichier)) {
        if (statSync(fichier).size > maxSortie) { await lanceur.arreter(); throw new Error('Sortie de l’agent trop volumineuse : refusée'); }
        let r; try { r = JSON.parse(readFileSync(fichier, 'utf8')); } catch { await attendre(30); continue; }
        if (r.nonce !== nonce) throw new Error('Sortie périmée ou forgée (nonce différent) : refusée');
        if (dossierSortie) { const h = verifierSortie(dossierSortie, limites); if (!h.ok) { rmSync(dossierSortie, { recursive: true, force: true }); throw new Error(`Sortie non conforme (${h.problemes.slice(0, 2).join(' ; ')}) : dossier détruit`); } }
        if (!r.ok) throw new Error(r.erreur);
        return r;
      }
      await attendre(30);
    }
    await lanceur.arreter();
    throw new Error(`Délai dépassé (${delaiMs} ms) : agent arrêté`);
  } finally { rmSync(verrou, { recursive: true, force: true }); rmSync(courant, { recursive: true, force: true }); }
}
