// Processus JARVIS complet de test : exécute réellement les agents et l'auditeur jusqu'à épuisement de la file.
import { ouvrir } from '../src/db.js';
import { Jarvis } from '../src/orchestrateur.js';
import { configurerEspace } from '../src/espaces.js';
import { horloge } from '../src/horloge.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [racineDonnees, nom, gele] = process.argv.slice(2);
horloge.gele = Number(gele);
const racineCode = join(dirname(fileURLToPath(import.meta.url)), '..');
const espace = configurerEspace('odicolor', { racineDonnees, racineCode, env: {} });
const db = ouvrir(espace.dbChemin);
const j = new Jarvis({ db, espace, ouvrier: nom, isolation: process.argv[5] === 'isole', racineCode });
const actions = await j.executerJusquaVide(100);
console.log(JSON.stringify(actions.length));
db.close();
