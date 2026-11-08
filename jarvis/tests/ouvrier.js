// Processus ouvrier minimal utilisé par le test de concurrence : prend des missions jusqu'à épuisement.
import { ouvrir } from '../src/db.js';
import { reclamer } from '../src/moteur.js';

const db = ouvrir(process.argv[2]);
const pris = [];
for (;;) {
  const m = reclamer(db, process.argv[3], 60000);
  if (!m) break;
  pris.push(m.id);
}
console.log(JSON.stringify(pris));
