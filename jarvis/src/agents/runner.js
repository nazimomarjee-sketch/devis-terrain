// Point d'entrée du processus isolé d'un agent. Reçoit {nomAgent, options, mission, ctx} sur stdin, répond en JSON sur stdout.
import { FABRIQUES } from './index.js';

let entree = '';
process.stdin.setEncoding('utf8');
for await (const c of process.stdin) entree += c;
try {
  const { nomAgent, options, mission, ctx } = JSON.parse(entree);
  const depenses = [];
  const agent = FABRIQUES[nomAgent](options);
  const sortie = await agent.executer(mission, { ...ctx, depenser: (c) => depenses.push(c) });
  process.stdout.write(JSON.stringify({ ok: true, sortie, depenses }));
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, erreur: `${e.code ? `[${e.code}] ` : ''}${e.message}` }));
}
