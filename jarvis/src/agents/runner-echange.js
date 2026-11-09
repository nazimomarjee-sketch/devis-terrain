// Point d'entrée du backend par ÉCHANGE DE FICHIERS (Windows : lancé par la tâche planifiée du compte agent).
// Lit <dossier>/entree.json, exécute (agent ou sondes), écrit <dossier>/sortie.json de façon atomique avec le même `nonce`.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { FABRIQUES } from './index.js';
import { lancerSondes } from './sondes.js';

const dossier = process.argv[2];
const entree = JSON.parse(readFileSync(join(dossier, 'entree.json'), 'utf8'));
let sortie;
try {
  if (entree.mode === 'sonde') sortie = { ok: true, sondes: await lancerSondes(entree.canaris) };
  else {
    const depenses = [];
    const agent = FABRIQUES[entree.nomAgent](entree.options);
    const r = await agent.executer(entree.mission, { ...entree.ctx, depenser: (c) => depenses.push(c) });
    sortie = { ok: true, sortie: r, depenses };
  }
} catch (e) { sortie = { ok: false, erreur: `${e.code ? `[${e.code}] ` : ''}${e.message}` }; }
const tmp = join(dossier, 'sortie.tmp');
writeFileSync(tmp, JSON.stringify({ nonce: entree.nonce, ...sortie }));
renameSync(tmp, join(dossier, 'sortie.json')); // atomique : le service ne lit jamais un fichier à moitié écrit
