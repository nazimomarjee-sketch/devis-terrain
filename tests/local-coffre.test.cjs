'use strict';
// Application locale ODICOLOR 2.0 — étape 1 : le coffre chiffré (local/coffre.js). Données FICTIVES uniquement.
// Exécution : node --test tests/local-coffre.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync, spawn } = require('node:child_process');
const { Coffre, FICHIERS, KDF_DEFAUT } = require('../local/coffre.js');

const RAPIDE = { algo: 'scrypt', N: 2 ** 14, r: 8, p: 1 }; // essais rapides ; un test vérifie les paramètres réels
const MDP = 'Fictif-Coffre-2026!', AUTRE = 'Autre-Mot-De-Passe-99';
const FICTIF = { garages: [{ id: 1, nom: 'GARAGE FICTIF ALPHA', commune: 'Massy', notes: ['Visite fictive du 02/11'] }], ebp: { clients: [{ code: 'C001', nom: 'GARAGE FICTIF ALPHA' }] } };
const dossier = () => fs.mkdtempSync(path.join(os.tmpdir(), 'odicolor-coffre-'));
const creer = (d, o = {}) => Coffre.creer(d, MDP, { donnees: FICTIF, kdf: RAPIDE, ...o });
const brut = d => fs.readdirSync(d).map(f => fs.readFileSync(path.join(d, f), 'utf8')).join('\n');

test('1. persistance : le programme s’arrête, redémarre (autre processus), les données sont identiques', () => {
  const d = dossier(); const { coffre } = creer(d); coffre.ecrire({ ...FICTIF, compteur: 7 }); coffre.fermer();
  const code = `const {Coffre}=require(${JSON.stringify(path.resolve(__dirname, '../local/coffre.js'))});const c=Coffre.ouvrir(${JSON.stringify(d)},${JSON.stringify(MDP)});process.stdout.write(JSON.stringify(c.lire()));c.fermer();`;
  const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { ...FICTIF, compteur: 7 });
});

test('2. mauvais mot de passe : refusé, message neutre, aucune donnée lue', () => {
  const d = dossier(); creer(d).coffre.fermer();
  assert.throws(() => Coffre.ouvrir(d, 'Mauvais-mot-de-passe'), e => e.code === 'REFUS' && !/GARAGE/.test(e.message));
  assert.ok(!fs.existsSync(path.join(d, FICHIERS.verrou)), 'un refus ne laisse pas le coffre bloqué');
});

test('3. sur le disque, tout est chiffré : aucun nom, code client ni note en clair', () => {
  const d = dossier(); creer(d).coffre.fermer();
  const contenu = brut(d);
  for (const mot of ['GARAGE', 'ALPHA', 'Massy', 'C001', 'Visite fictive']) assert.ok(!contenu.includes(mot), mot + ' visible en clair');
});

test('4. mot de passe trop court refusé ; coffre existant jamais remplacé', () => {
  assert.throws(() => Coffre.creer(dossier(), 'court', { kdf: RAPIDE }), e => e.code === 'MOT_DE_PASSE');
  const d = dossier(); creer(d).coffre.fermer();
  assert.throws(() => creer(d), e => e.code === 'EXISTE');
  const c = Coffre.ouvrir(d, MDP); assert.deepEqual(c.lire(), FICTIF); c.fermer();
});

test('5. retouche du fichier (données, en-tête ou mot de passe chiffré) : refus total', () => {
  for (const retouche of [
    e => { const t = Buffer.from(e.donnees.texte, 'base64'); t[0] ^= 1; e.donnees.texte = t.toString('base64'); },
    e => { e.generation += 5; },
    e => { e.ecritLe = '2020-01-01T00:00:00.000Z'; },
    e => { const t = Buffer.from(e.enveloppes.motDePasse.texte, 'base64'); t[3] ^= 1; e.enveloppes.motDePasse.texte = t.toString('base64'); }]) {
    const d = dossier(); creer(d).coffre.fermer();
    fs.rmSync(path.join(d, FICHIERS.precedent), { force: true }); // sans version de secours : la retouche doit être refusée
    const f = path.join(d, FICHIERS.principal), e = JSON.parse(fs.readFileSync(f, 'utf8')); retouche(e); fs.writeFileSync(f, JSON.stringify(e));
    assert.throws(() => Coffre.ouvrir(d, MDP), x => x.code === 'REFUS');
  }
});

test('6. fichier principal abîmé : la version précédente est ouverte, avec alerte ; le fichier abîmé est gardé à part', () => {
  const d = dossier(); const { coffre } = creer(d); coffre.ecrire({ etape: 'avant' }); coffre.ecrire({ etape: 'dernière' }); coffre.fermer();
  const f = path.join(d, FICHIERS.principal); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').slice(0, 200)); // coupure en pleine écriture simulée
  const c = Coffre.ouvrir(d, MDP);
  assert.deepEqual(c.lire(), { etape: 'avant' });
  assert.match(c.alerte, /abîmé.*version précédente/);
  c.ecrire({ etape: 'reprise' }); c.fermer();
  assert.ok(fs.readdirSync(d).some(n => /^coffre\.abime-\d+\.odc$/.test(n)), 'fichier abîmé conservé');
  const c2 = Coffre.ouvrir(d, MDP); assert.deepEqual(c2.lire(), { etape: 'reprise' }); assert.equal(c2.alerte, ''); c2.fermer();
});

test('7. coupure entre l’écriture et le renommage : l’enregistrement complet est récupéré', () => {
  const d = dossier(); const { coffre } = creer(d); coffre.ecrire({ etape: 1 }); coffre.ecrire({ etape: 2 }); coffre.fermer();
  // État laissé par une coupure au pire moment : principal déjà renommé en « précédent », nouveau fichier encore en « .tmp ».
  fs.renameSync(path.join(d, FICHIERS.principal), path.join(d, FICHIERS.temporaire));
  const c = Coffre.ouvrir(d, MDP); assert.deepEqual(c.lire(), { etape: 2 }); assert.match(c.alerte, /interrompu.*récupéré/); c.fermer();
});

test('8. verrouillage : manuel et après inactivité ; plus rien n’est lisible sans le mot de passe', async () => {
  const d = dossier(); const { coffre } = creer(d, { delaiVerrouillageMs: 60 });
  await new Promise(r => setTimeout(r, 150));
  assert.equal(coffre.estVerrouille, true);
  assert.throws(() => coffre.lire(), e => e.code === 'VERROUILLE');
  assert.throws(() => coffre.deverrouiller('Mauvais-mot-de-passe'), e => e.code === 'REFUS');
  coffre.deverrouiller(MDP); assert.deepEqual(coffre.lire(), FICTIF);
  coffre.verrouiller(); assert.throws(() => coffre.ecrire({}), e => e.code === 'VERROUILLE'); coffre.fermer();
});

test('9. clé de secours : ouvre le coffre et impose un nouveau mot de passe ; l’ancien ne marche plus', () => {
  const d = dossier(); const { coffre, cleSecours } = creer(d); coffre.fermer();
  assert.match(cleSecours, /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.throws(() => Coffre.ouvrirAvecSecours(d, 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH', AUTRE), e => e.code === 'REFUS');
  const c = Coffre.ouvrirAvecSecours(d, cleSecours.toLowerCase().replace(/-/g, ' '), AUTRE); // saisie tolérante
  assert.deepEqual(c.lire(), FICTIF); c.fermer();
  assert.throws(() => Coffre.ouvrir(d, MDP), e => e.code === 'REFUS');
  const c2 = Coffre.ouvrir(d, AUTRE); assert.deepEqual(c2.lire(), FICTIF); c2.fermer();
});

test('10. changement de mot de passe : données intactes ; même un fichier principal abîmé s’ouvre avec le nouveau', () => {
  const d = dossier(); const { coffre } = creer(d);
  assert.throws(() => coffre.changerMotDePasse('Mauvais-mot-de-passe', AUTRE), e => e.code === 'REFUS');
  coffre.changerMotDePasse(MDP, AUTRE); coffre.fermer();
  assert.throws(() => Coffre.ouvrir(d, MDP), e => e.code === 'REFUS');
  fs.writeFileSync(path.join(d, FICHIERS.principal), '{abîmé');
  const c = Coffre.ouvrir(d, AUTRE); assert.deepEqual(c.lire(), FICTIF); assert.ok(c.alerte); c.fermer();
});

test('11. une seule fenêtre à la fois ; un verrou laissé par un programme arrêté brutalement est levé', async () => {
  const d = dossier(); creer(d).coffre.fermer();
  const code = `const {Coffre}=require(${JSON.stringify(path.resolve(__dirname, '../local/coffre.js'))});Coffre.ouvrir(${JSON.stringify(d)},${JSON.stringify(MDP)});console.log('ouvert');setInterval(()=>{},1000);`;
  const autre = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise(r => autre.stdout.once('data', r));
    assert.throws(() => Coffre.ouvrir(d, MDP), e => e.code === 'DEJA_OUVERT');
  } finally { autre.kill('SIGKILL'); await new Promise(r => autre.exitCode !== null || autre.signalCode ? r() : autre.once('exit', r)); } // arrêt brutal : le verrou reste sur le disque
  assert.ok(fs.existsSync(path.join(d, FICHIERS.verrou)));
  const c = Coffre.ouvrir(d, MDP); assert.deepEqual(c.lire(), FICTIF); c.fermer();
});

test('12. lire() rend une copie : modifier l’affichage ne modifie pas le coffre sans enregistrement', () => {
  const d = dossier(); const { coffre } = creer(d);
  const x = coffre.lire(); x.garages[0].nom = 'MODIFIÉ'; assert.equal(coffre.lire().garages[0].nom, 'GARAGE FICTIF ALPHA'); coffre.fermer();
});

test('13. paramètres réels (scrypt N=2^17) : création, réouverture, temps d’ouverture mesuré', () => {
  const d = dossier(), t0 = Date.now();
  const { coffre } = Coffre.creer(d, MDP, { donnees: FICTIF }); coffre.fermer();
  const t1 = Date.now(); const c = Coffre.ouvrir(d, MDP); const ouverture = Date.now() - t1;
  assert.deepEqual(c.lire(), FICTIF); c.fermer();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, FICHIERS.principal), 'utf8')).kdf, { ...KDF_DEFAUT });
  console.log('# création ' + (t1 - t0) + ' ms, ouverture ' + ouverture + ' ms (paramètres réels)');
});

test('14. paramètres de protection imposés par un fichier piégé (trop faibles ou trop lourds) : refusés', () => {
  for (const N of [2 ** 10, 2 ** 24]) {
    const d = dossier(); creer(d).coffre.fermer();
    for (const n of [FICHIERS.principal, FICHIERS.precedent]) {
      const f = path.join(d, n); if (!fs.existsSync(f)) continue;
      const e = JSON.parse(fs.readFileSync(f, 'utf8')); e.kdf.N = N; fs.writeFileSync(f, JSON.stringify(e));
    }
    assert.throws(() => Coffre.ouvrir(d, MDP), e => e.code === 'REFUS');
  }
});

test('15. ancienne copie remise à la main à la place du fichier principal : la version la plus récente est ouverte, avec alerte', () => {
  const d = dossier(); const { coffre } = creer(d); coffre.ecrire({ etape: 'ancienne' });
  const ancienne = fs.readFileSync(path.join(d, FICHIERS.principal)); coffre.ecrire({ etape: 'récente' }); coffre.fermer();
  // Le fichier « précédent » contient maintenant « ancienne » ; on met la génération récente en « précédent » et l'ancienne en principal.
  fs.renameSync(path.join(d, FICHIERS.principal), path.join(d, FICHIERS.precedent)); fs.writeFileSync(path.join(d, FICHIERS.principal), ancienne);
  const c = Coffre.ouvrir(d, MDP); assert.deepEqual(c.lire(), { etape: 'récente' }); assert.match(c.alerte, /plus ancien/); c.fermer();
});
