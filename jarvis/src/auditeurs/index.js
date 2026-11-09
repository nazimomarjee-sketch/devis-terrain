import { auditerDevis } from './devis.js';
import { auditerProduits } from './produits.js';
import { auditerProspection } from './prospection.js';
import { auditerClients } from './clients.js';
import { auditerRelances } from './relances.js';
import { auditerCommandes } from './commandes.js';
import { auditerFinance } from './finance.js';
import { auditerPlanification } from './planification.js';
import { auditerBlocage, charger } from './commun.js';

export const AUDITEURS = { devis: auditerDevis, produits: auditerProduits, prospection: auditerProspection, clients: auditerClients, relances: auditerRelances, commandes: auditerCommandes, finance: auditerFinance, planification: auditerPlanification };

/** Un blocage n'est accepté que s'il est motivé, d'un code connu, et s'il pose une question à l'humain. */
export function auditerUnBlocage(blocage, dossierJeu) {
  const ids = new Set([...charger(dossierJeu, 'clients').lignes.map((c) => c.id), ...charger(dossierJeu, 'catalogue').lignes.map((x) => x.ref)]);
  return auditerBlocage({ blocage, ids });
}
