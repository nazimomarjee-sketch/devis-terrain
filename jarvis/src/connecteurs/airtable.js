// Connecteur Airtable — base SYNTHÉTIQUE locale (JSON). Lecture libre en mode synthétique ; toute ÉCRITURE passe par l'outbox
// (donc par une décision humaine) et est idempotente par clé. Réel : refusé sans autorisation, puis non développé.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { exiger } from '../regles.js';
import { IntegrationNonDeveloppee } from '../integrations.js';

export function connecteurAirtable({ db, mode = 'synthetique', fichierBase }) {
  if (mode === 'reel') { exiger(db, 'integration:airtable'); throw new IntegrationNonDeveloppee('airtable'); }
  mkdirSync(dirname(fichierBase), { recursive: true });
  const charger = () => (existsSync(fichierBase) ? JSON.parse(readFileSync(fichierBase, 'utf8')) : { tables: {}, appliques: [] });
  return {
    nom: 'airtable', mode,
    lire: (table) => charger().tables[table] ?? [],
    async executer(action, charge, cle) {
      if (action !== 'UPSERT_ENREGISTREMENT') throw new Error(`Action non autorisée : ${action}`);
      if (!/^[A-Za-z0-9_ -]{1,60}$/.test(String(charge.table)) || typeof charge.id !== 'string' || typeof charge.champs !== 'object') throw new Error('charge invalide');
      const b = charger(); if (b.appliques.includes(cle)) return; // déjà appliquée : idempotent
      const t = (b.tables[charge.table] ??= []); const i = t.findIndex((x) => x.id === charge.id); if (i >= 0) t[i] = { id: charge.id, ...charge.champs }; else t.push({ id: charge.id, ...charge.champs });
      b.appliques.push(cle); writeFileSync(fichierBase, JSON.stringify(b));
    },
  };
}
