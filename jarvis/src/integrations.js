// Intégrations externes (EBP, Gmail, Airtable) : TOUTES désactivées. Aucune n'est développée.
// Même avec une autorisation accordée, l'appel échoue explicitement tant que le connecteur n'existe pas : on ne simule jamais un accès.
import { exiger, autorise } from './regles.js';

export const INTEGRATIONS = ['ebp', 'gmail', 'airtable'];

export class IntegrationNonDeveloppee extends Error {
  constructor(nom) { super(`L’intégration « ${nom} » n’est pas développée : aucun accès n’est simulé.`); this.nom = nom; }
}

export function appelerIntegration(db, nom) {
  if (!INTEGRATIONS.includes(nom)) throw new Error(`Intégration inconnue : ${nom}`);
  exiger(db, `integration:${nom}`); // refuse et journalise sans autorisation
  throw new IntegrationNonDeveloppee(nom);
}

export function etatIntegrations(db) {
  return INTEGRATIONS.map((nom) => ({ nom, autorisee: autorise(db, `integration:${nom}`), developpee: false }));
}
