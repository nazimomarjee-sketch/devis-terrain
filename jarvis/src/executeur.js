// Exécution d'un agent. Deux modes :
//  - « isole »  : processus Node séparé, modèle de permissions (lecture limitée au code, écriture limitée au dossier
//                 de sortie de la mission), environnement VIDE (aucun jeton ni clé), mémoire plafonnée, délai et taille
//                 de sortie bornés. C'est le mode de production.
//  - « direct » : même protocole dans le processus courant (tests unitaires rapides).
// LIMITE CONNUE : le modèle de permissions de Node 22 ne filtre PAS le réseau. À couvrir par le pare-feu
// Windows (règle sortante bloquante pour le compte qui exécute le service).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { commandeLancement, verifierSortie, tailleDossier, LIMITES } from './confinement.js';
import { executerParEchange } from './echange.js';
import { join, dirname } from 'node:path';
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

export async function executerIsole(opts) {
  // Backend « échange » (Windows) : l'exécution est déléguée à un lanceur qui tourne sous le compte agent.
  if (opts.confinement?.backend === 'echange') {
    // Dossier de sortie NEUF, créé par le SERVICE (le compte agent n'a le droit d'écrire que dedans).
    rmSync(opts.dossierSortie, { recursive: true, force: true }); mkdirSync(opts.dossierSortie, { recursive: true });
    const r = await executerParEchange({ dossierEchange: opts.confinement.dossierEchange, lanceur: opts.confinement.lanceur, delaiMs: opts.delaiMs, dossierSortie: opts.dossierSortie, entree: { mode: 'agent', nomAgent: opts.nomAgent, options: opts.options, mission: opts.mission, ctx: opts.ctx } });
    return { sortie: r.sortie, depenses: r.depenses };
  }
  return executerIsoleProcessus(opts);
}

function executerIsoleProcessus({ nomAgent, options, mission, ctx, dossierSortie, racineCode, delaiMs, maxSortie = 2_000_000, memoireMo = 256, confinement = { backend: 'permission' }, dossierEspace = null }) {
  return new Promise((ok, ko) => {
    // Dossier de sortie NEUF à chaque exécution : aucun résidu d'une tentative précédente (échouée ou tuée).
    rmSync(dossierSortie, { recursive: true, force: true });
    mkdirSync(dossierSortie, { recursive: true });
    const argsNode = [
      '--permission',
      `--allow-fs-read=${join(racineCode, 'src')}`,
      `--allow-fs-read=${join(racineCode, 'package.json')}`,
      `--allow-fs-write=${dossierSortie}`,
      `--allow-fs-read=${dossierSortie}`,
      `--max-old-space-size=${memoireMo}`,
      '--disable-warning=ExperimentalWarning',
      join(racineCode, 'src', 'agents', 'runner.js'),
    ];
    const exe = process.env.JARVIS_NODE_AGENT || process.execPath; // sous Windows : exécutable dédié, utile au pare-feu (ne suffit PAS comme preuve)
    let lancement;
    try { lancement = commandeLancement({ backend: confinement.backend, exe, argsNode, utilisateurAgent: confinement.utilisateurAgent }); } catch (e) { return ko(e); }
    // Backend « os » : le dossier de sortie appartient TEMPORAIREMENT au compte agent ; il est repris par le service après l'exécution.
    const rendre = () => { if (lancement.uid !== undefined && process.getuid?.() === 0) { try { execFileSync('chown', ['-R', `${process.getuid()}:${process.getgid()}`, dossierSortie]); } catch { /* best-effort */ } } };
    if (lancement.uid !== undefined) { if (dossierEspace) { chmodSync(dossierEspace, 0o711); chmodSync(dirname(dossierSortie), 0o711); } if (process.getuid?.() !== 0) return ko(new Error('Le backend « os » exige les droits de changer de compte (voir docs/05)')); execFileSync('chown', ['-R', `${lancement.uid}:${lancement.gid}`, dossierSortie]); chmodSync(dossierSortie, 0o700); }
    const p = spawn(lancement.cmd, lancement.args, { stdio: ['pipe', 'pipe', 'pipe'], env: { NODE_ENV: 'production' }, cwd: lancement.uid !== undefined ? '/' : dossierSortie, windowsHide: true });
    let out = ''; let err = ''; let fini = false; const limites = confinement.limites ?? LIMITES;
    const terminer = (fn, v) => { if (fini) return; fini = true; clearTimeout(timer); clearInterval(quota); rendre(); if (fn === ko) { try { rmSync(dossierSortie, { recursive: true, force: true }); } catch { /* ignoré */ } } fn(v); };
    const timer = setTimeout(() => { p.kill('SIGKILL'); terminer(ko, new Error(`Délai dépassé (${delaiMs} ms) : processus agent arrêté`)); }, delaiMs);
    const quota = setInterval(() => { if (tailleDossier(dossierSortie) > limites.quotaSortieOctets) { p.kill('SIGKILL'); terminer(ko, new Error('Quota disque de la sortie dépassé : processus arrêté')); } }, 100);
    p.stdout.on('data', (c) => { out += c; if (out.length > maxSortie) { p.kill('SIGKILL'); terminer(ko, new Error('Sortie de l’agent trop volumineuse : processus arrêté')); } });
    p.stderr.on('data', (c) => { if (err.length < 4000) err += c; });
    p.on('error', (e) => terminer(ko, e));
    p.on('close', (code) => {
      if (fini) return;
      rendre();
      const hygiene = verifierSortie(dossierSortie, limites);
      if (!hygiene.ok) { try { rmSync(dossierSortie, { recursive: true, force: true }); } catch { /* ignoré */ } return terminer(ko, new Error(`Sortie non conforme (${hygiene.problemes.slice(0, 2).join(' ; ')}) : dossier détruit`)); }
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
