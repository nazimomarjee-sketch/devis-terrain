// Chargement des jeux de données. Un agent ne reçoit QUE les jeux qu'il déclare dans ses droits de lecture.
// Un jeu marqué REEL exige une autorisation explicite « donnees_reelles » (sinon refus + journal).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { exiger } from './regles.js';

const CLES = {
  catalogue: 'references', clients: 'clients', devis_historique: 'devis', commandes: 'commandes', factures: 'factures',
  paiements: 'paiements', prospects: 'prospects', taches: 'taches', ordres_atelier: 'ordres',
};

/** Charge les jeux demandés. Retourne { donnees:{nom:tableau}, fictif:boolean, absents:[] }. */
export function chargerJeux(dossierJeu, noms, { db = null } = {}) {
  const donnees = {};
  const absents = [];
  let fictif = true;
  for (const nom of noms) {
    const f = join(dossierJeu, `${nom}.json`);
    if (!existsSync(f)) { absents.push(nom); continue; }
    const brut = JSON.parse(readFileSync(f, 'utf8'));
    if (brut.genere !== 'FICTIF') {
      if (!db) throw new Error(`Jeu « ${nom} » non fictif : base requise pour vérifier l'autorisation`);
      exiger(db, 'donnees_reelles'); // lève AutorisationRequise + journalise
      fictif = false;
    }
    donnees[nom] = brut[CLES[nom]] ?? [];
  }
  return { donnees, fictif, absents };
}
