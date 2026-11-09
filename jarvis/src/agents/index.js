import { creerAgentDevis } from './devis.js';
import { creerAgentProduits } from './produits.js';
import { creerAgentProspection } from './prospection.js';
import { creerAgentClients } from './clients.js';
import { creerAgentRelances } from './relances.js';
import { creerAgentCommandes } from './commandes.js';
import { creerAgentFinance } from './finance.js';
import { creerAgentPlanification } from './planification.js';

export const FABRIQUES = {
  devis: creerAgentDevis, produits: creerAgentProduits, prospection: creerAgentProspection, clients: creerAgentClients,
  relances: creerAgentRelances, commandes: creerAgentCommandes, finance: creerAgentFinance, planification: creerAgentPlanification,
};
export const NOMS_AGENTS = Object.keys(FABRIQUES);
