// Garanties STRUCTURELLES : l'auditeur ne partage aucun code avec les agents ; les agents n'ont aucun accès à la base, aux règles ni aux autorisations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FABRIQUES, NOMS_AGENTS } from '../src/agents/index.js';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const imports = (f) => [...readFileSync(f, 'utf8').matchAll(/^\s*import\s+[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);

test('indépendance : aucun fichier de src/auditeurs/ n’importe un fichier de src/agents/ (ni l’inverse)', () => {
  for (const f of readdirSync(join(src, 'auditeurs'))) assert.ok(!imports(join(src, 'auditeurs', f)).some((i) => /agents/.test(i)), `auditeurs/${f} importe du code d’agent`);
  for (const f of readdirSync(join(src, 'agents'))) assert.ok(!imports(join(src, 'agents', f)).some((i) => /auditeurs/.test(i)), `agents/${f} importe du code d’auditeur`);
});

test('moindre privilège : les agents n’importent ni la base, ni le moteur, ni les règles/autorisations, ni l’orchestrateur, ni le serveur', () => {
  const INTERDITS = /(\/db\.js|moteur|orchestrateur|regles|serveur|sauvegarde|espaces|donnees\.js|executeur)/;
  const AUTORISES = new Set(['./commun.js', '../pdf.js', '../horloge.js', '../confiance.js', 'node:fs', 'node:path', 'node:crypto', 'node:child_process']);
  for (const f of readdirSync(join(src, 'agents')).filter((x) => !['index.js', 'runner.js', 'runner-echange.js', 'sonde.js', 'sondes.js'].includes(x))) {
    for (const i of imports(join(src, 'agents', f))) { assert.ok(!INTERDITS.test(i), `agents/${f} importe ${i}`); if (f !== 'commun.js') assert.ok(AUTORISES.has(i) || /^\.\/[a-z]+\.js$/.test(i) === false, `import inattendu ${i} dans ${f}`); }
  }
});

test('droits déclarés : lecture limitée à des jeux connus, jamais de réseau ni d’envoi, 8 agents avec critères mesurables', () => {
  const JEUX = new Set(['catalogue', 'clients', 'regles', 'devis_historique', 'commandes', 'factures', 'paiements', 'prospects', 'taches', 'missions_en_attente', 'ordres_atelier']);
  assert.equal(NOMS_AGENTS.length, 8);
  for (const nom of NOMS_AGENTS) {
    const a = FABRIQUES[nom]();
    assert.ok(a.droits.lire.every((j) => JEUX.has(j)), nom); assert.equal(a.droits.reseau, false); assert.equal(a.droits.envoyer, false);
    assert.ok(a.criteres.length >= 3, `${nom} : critères de réussite insuffisants`); assert.ok(a.role && a.description && a.plan().length >= 3);
  }
});

test('un agent ne peut se donner aucun droit : l’orchestrateur n’importe AUCUNE fonction d’octroi de droit ou de modification de règle', () => {
  const orch = readFileSync(join(src, 'orchestrateur.js'), 'utf8');
  const importsRegles = /import\s*\{([^}]*)\}\s*from\s*'\.\/regles\.js'/.exec(orch)[1].split(',').map((x) => x.trim());
  for (const interdit of ['accorder', 'revoquer', 'definirRegle', 'exiger']) assert.ok(!importsRegles.includes(interdit) || interdit === 'exiger', `l’orchestrateur importe ${interdit}`);
  assert.ok(!importsRegles.some((n) => ['accorder', 'revoquer', 'definirRegle'].includes(n)));
  const serveur = readFileSync(join(src, 'serveur.js'), 'utf8');
  assert.ok(/\/api\/admin\//.test(serveur) && /Jeton administrateur requis/.test(serveur), 'octroi de droits réservé au jeton administrateur');
  // L'unique module qui appelle accorder/definirRegle/revoquer est le serveur (route admin).
  for (const f of readdirSync(src, { recursive: true }).filter((x) => x.endsWith('.js') && !/regles\.js$/.test(x))) {
    const code = readFileSync(join(src, f), 'utf8');
    if (/\b(accorder|definirRegle|revoquer)\(/.test(code)) assert.equal(f, 'serveur.js', `${f} appelle une fonction d’octroi de droits`);
  }
});
