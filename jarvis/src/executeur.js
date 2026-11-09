// Exécution d'un agent. Deux modes :
//  - « isole »  : processus Node séparé, modèle de permissions (lecture limitée au code, écriture limitée au dossier
//                 de sortie de la mission), environnement VIDE (aucun jeton ni clé), mémoire plafonnée, délai et taille
//                 de sortie bornés. C'est le mode de production.
//  - « direct » : même protocole dans le processus courant (tests unitaires rapides).
// LIMITE CONNUE : le modèle de permissions de Node 22 ne filtre PAS le réseau. À couvrir par le pare-feu
// Windows (règle sortante bloquante pour le compte qui exécute le service).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FABRIQUES } from './agents/index.js';

const aller_retour = (x) => JSON.parse(JSON.stringify(x));

export async function executerDirect({ nomAgent, options, mission, ctx, delaiMs }) {
  const ctrl = new AbortController();
  let timer;
  const depenses = [];
  const limite = new Promise((_, ko) => { timer = setTimeout(() => { ctrl.abort(); ko(new Error(`Délai dépassé (${delaiMs} ms)`)); }, delaiMs); });
  try {
    const agent = FABRIQUES[nomAgent](options);
    const sortie = await Promise.race([
      agent.executer(aller_retour(mission), { ...aller_retour(ctx), depenser: (c) => depenses.push(c), signal: ctrl.signal }),
      limite,
    ]);
    return { sortie: aller_retour(sortie), depenses };
  } finally { clearTimeout(timer); }
}

export function executerIsole({ nomAgent, options, mission, ctx, dossierSortie, racineCode, delaiMs, maxSortie = 2_000_000, memoireMo = 256 }) {
  return new Promise((ok, ko) => {
    mkdirSync(dossierSortie, { recursive: true });
    const args = [
      '--permission',
      `--allow-fs-read=${join(racineCode, 'src')}`,
      `--allow-fs-read=${join(racineCode, 'package.json')}`,
      `--allow-fs-write=${dossierSortie}`,
      `--max-old-space-size=${memoireMo}`,
      '--disable-warning=ExperimentalWarning',
      join(racineCode, 'src', 'agents', 'runner.js'),
    ];
    // Exécutable DÉDIÉ aux agents (copie de node.exe) : permet au pare-feu Windows de bloquer SON accès réseau sans bloquer le service.
    const exe = process.env.JARVIS_NODE_AGENT || process.execPath;
    const p = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { NODE_ENV: 'production' }, cwd: dossierSortie, windowsHide: true });
    let out = ''; let err = ''; let fini = false;
    const terminer = (fn, v) => { if (fini) return; fini = true; clearTimeout(timer); fn(v); };
    const timer = setTimeout(() => { p.kill('SIGKILL'); terminer(ko, new Error(`Délai dépassé (${delaiMs} ms) : processus agent arrêté`)); }, delaiMs);
    p.stdout.on('data', (c) => { out += c; if (out.length > maxSortie) { p.kill('SIGKILL'); terminer(ko, new Error('Sortie de l’agent trop volumineuse : processus arrêté')); } });
    p.stderr.on('data', (c) => { if (err.length < 4000) err += c; });
    p.on('error', (e) => terminer(ko, e));
    p.on('close', (code) => {
      if (fini) return;
      try {
        const r = JSON.parse(out);
        if (!r.ok) return terminer(ko, new Error(r.erreur));
        terminer(ok, { sortie: r.sortie, depenses: r.depenses });
      } catch {
        terminer(ko, new Error(`Processus agent en échec (code ${code}) : ${err.trim().split('\n').slice(-2).join(' | ') || 'sans message'}`));
      }
    });
    p.stdin.end(JSON.stringify({ nomAgent, options, mission, ctx }));
  });
}
