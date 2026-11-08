import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { param } from './db.js';

/** Charge catalogue et clients depuis un dossier (fictif par défaut). Relu à chaque exécution. */
export function chargerDonnees(dossier) {
  const catalogue = JSON.parse(readFileSync(join(dossier, 'catalogue.json'), 'utf8'));
  const clients = JSON.parse(readFileSync(join(dossier, 'clients.json'), 'utf8'));
  return {
    catalogue,
    clients,
    fictif: catalogue.genere === 'FICTIF' && clients.genere === 'FICTIF',
  };
}

export function chargerParametres(db) {
  return {
    tva_pct: param(db, 'tva_pct'),
    remise_max_pct: param(db, 'remise_max_pct'),
    anciennete_tarif_jours: Number(param(db, 'anciennete_tarif_jours')),
  };
}
