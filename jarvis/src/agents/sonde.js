// Point d'entrée stdin des sondes (backends « permission » et « linux-os »).
import { lancerSondes } from './sondes.js';
let entree = ''; process.stdin.setEncoding('utf8'); for await (const c of process.stdin) entree += c;
process.stdout.write(JSON.stringify(await lancerSondes(JSON.parse(entree).canaris)));
