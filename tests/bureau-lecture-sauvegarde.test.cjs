'use strict';
// Bureau ODICOLOR — lecture des sauvegardes du téléphone (.odicolor du Lot 1 et ancien JSON V47).
// Exécution : node --test tests/bureau-lecture-sauvegarde.test.cjs
// Les fichiers de tests/fixtures/bureau ont été fabriqués par le VRAI code du téléphone
// (sauvegarde-locale.js, branche fix/lot1-f01-f03-recuperation) — voir origine.json. Données fictives.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const LS = require('../bureau/lecture-sauvegarde.js');

const DOSSIER = join(__dirname, 'fixtures', 'bureau');
const octets = nom => readFileSync(join(DOSSIER, nom));
const blob = b => new Blob([b]);
const origine = JSON.parse(readFileSync(join(DOSSIER, 'origine.json'), 'utf8'));
const attendu = nom => origine.fichiers.find(f => f.fichier === nom);

async function refuse(contenu, motif) {
  await assert.rejects(LS.lire(contenu instanceof Blob ? contenu : blob(contenu)), e => {
    assert.match(e.message, motif);
    return true;
  });
}

// Fabrique un .odicolor « à la main » avec des empreintes CORRECTES (fichier forgé, pas abîmé).
function emballer(v) {
  if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) return v;
  if (Array.isArray(v)) return ['array', v.map(emballer)];
  return ['object', Object.entries(v).map(([k, x]) => [k, emballer(x)])];
}
function forger(entete, pieces = []) {
  const h = Buffer.from(JSON.stringify(entete));
  const lg = Buffer.alloc(4); lg.writeUInt32LE(h.length);
  return Buffer.concat([Buffer.from(LS.MAGIC), lg, createHash('sha256').update(h).digest(), h, ...pieces]);
}
const enteteValide = data => ({ appli: 'devis-terrain', version: 2, date: '2026-11-05T09:00:00.000Z', warning: '', data, attachments: [] });

test('fichiers d’essai : bien produits par le code du téléphone, inchangés depuis', () => {
  assert.equal(origine.donnees, 'Fictives uniquement');
  assert.match(origine.codeTelephoneSha256, /^[a-f0-9]{64}$/);
  for (const f of origine.fichiers) assert.equal(createHash('sha256').update(octets(f.fichier)).digest('hex'), f.sha256, f.fichier);
});

test('compatibilité : jeu Samsung du 29/10 (.odicolor) — 3 garages, 12 devis, 3 photos, 2 PDF vérifiés', async () => {
  const nom = 'telephone-jeu-samsung.odicolor';
  const r = await LS.lire(blob(octets(nom)));
  assert.deepEqual(r.garages.map(g => g.nom), attendu(nom).noms);
  assert.equal(r.rapport.format, 'odicolor-2');
  assert.deepEqual(r.rapport.contenu, { garages: 3, devis: 12, articles: 30, photos: 3, pdf: 2 });
  assert.deepEqual(r.rapport.controle, { entete: true, pieces: 5, octets: attendu(nom).octets });
  for (const g of r.garages) { assert.equal(g.source, 'reel'); assert.equal(g.caMois, null); }
  assert.match(LS.message(r.rapport), /intégrité OK/);
  assert.match(LS.message(r.rapport), /3 garages, 12 devis, 3 photos, 2 PDF/);
});

test('compatibilité : garages d’Île-de-France classés, homonymes conservés, prochaine action lue', async () => {
  const r = await LS.lire(blob(octets('telephone-idf.odicolor')));
  assert.equal(r.garages.length, 6);
  const niveaux = r.garages.map(g => [g.ville, g.classement.niveau]);
  assert.deepEqual(niveaux, [['Massy', 'sur'], ['Palaiseau', 'sur'], ['Saclay', 'a_verifier'], ['Créteil', 'sur'], ['Chartres', 'hors_idf'], ['Massy', 'sur']]);
  const homonymes = r.garages.filter(g => g.nom === 'GARAGE FICTIF IDF 1');
  assert.equal(homonymes.length, 2, 'deux fiches homonymes restent deux fiches');
  assert.notEqual(homonymes[0].id, homonymes[1].id);
  assert.equal(r.garages[0].etape, 'Rappeler pour essai vernis (fictif)');
  assert.equal(r.garages[0].etapeDate, '2026-11-12');
  assert.equal(r.garages[0].statut, 'actif');
  assert.equal(r.garages[1].statut, 'prospect');
});

test('compatibilité : sauvegarde complète vide acceptée (0 garage, pas d’erreur)', async () => {
  const r = await LS.lire(blob(octets('telephone-vide.odicolor')));
  assert.equal(r.garages.length, 0);
  assert.match(LS.message(r.rapport), /0 garage, 0 devis, 0 photo, 0 PDF\. 0 garage classé/);
});

test('ancien format V47 : toujours lu, et mêmes garages que le .odicolor équivalent', async () => {
  const ancien = await LS.lire(blob(octets('telephone-v47.json')));
  const nouveau = await LS.lire(blob(octets('telephone-idf.odicolor')));
  assert.equal(ancien.rapport.format, 'json-v47');
  assert.deepEqual(ancien.garages, nouveau.garages, 'les deux formats donnent exactement les mêmes garages');
  for (const k of ['lus', 'classes', 'sur', 'cp', 'commune', 'aVerifier', 'hors', 'nonClasses']) assert.equal(ancien.rapport[k], nouveau.rapport[k], k);
  assert.match(LS.message(ancien.rapport), /Pas de contrôle d’intégrité/);
});

test('lecture d’un File du navigateur (avec nom de fichier)', async () => {
  const f = new File([octets('telephone-idf.odicolor')], 'ODICOLOR-sauvegarde.odicolor', { type: 'application/octet-stream' });
  assert.equal((await LS.lire(f)).garages.length, 6);
});

test('intégrité : CHAQUE octet modifié est détecté (balayage complet du fichier)', async () => {
  const sain = octets('telephone-idf.odicolor');
  let refuses = 0;
  for (let i = 0; i < sain.length; i++) {
    const abime = Buffer.from(sain); abime[i] ^= 0x01;
    try { await LS.lire(blob(abime)); } catch (e) { refuses++; continue; }
    assert.fail('octet ' + i + ' modifié mais fichier accepté');
  }
  assert.equal(refuses, sain.length);
});

test('intégrité : photo ou PDF abîmé détecté (jeu Samsung)', async () => {
  const sain = octets('telephone-jeu-samsung.odicolor');
  const fin = Buffer.from(sain); fin[fin.length - 1] ^= 0x01; // dernier octet = dernier PDF
  await refuse(fin, /corrompue \(PDF n° 2\)/);
  // Première photo abîmée : premier octet après l’en-tête.
  const lg = sain.readUInt32LE(LS.MAGIC.length), photo = Buffer.from(sain); photo[LS.MAGIC.length + 4 + 32 + lg] ^= 0x01;
  await refuse(photo, /corrompue \(photo n° 1\)/);
  // Échantillon régulier sur tout le fichier (en-tête, photos, PDF).
  for (let i = 0; i < sain.length; i += 211) {
    const abime = Buffer.from(sain); abime[i] ^= 0x80;
    await assert.rejects(LS.lire(blob(abime)), undefined, 'octet ' + i);
  }
});

test('intégrité : fichier tronqué à n’importe quel endroit refusé', async () => {
  const sain = octets('telephone-jeu-samsung.odicolor');
  for (const n of [1, 10, 18, 20, 22, 54, 60, 500, Math.floor(sain.length / 2), sain.length - 1]) {
    await assert.rejects(LS.lire(blob(sain.subarray(0, n))), /tronqu|non reconnu|incomplet/, 'coupé à ' + n);
  }
  await refuse(sain.subarray(0, sain.length - 1), /tronquée : une photo ou un PDF est incomplet/);
});

test('intégrité : octets ajoutés à la fin refusés', async () => {
  await refuse(Buffer.concat([octets('telephone-idf.odicolor'), Buffer.from('x')]), /contenu inattendu/);
});

test('messages clairs : version future, copie à réparer, vide, fichier inconnu', async () => {
  const futur = Buffer.from(octets('telephone-idf.odicolor')); futur.write('3', 'ODICOLOR-BACKUP-'.length);
  await refuse(futur, /version plus récente.*mets le Bureau à jour/);
  await refuse(octets('telephone-copie-a-reparer.odicolor'), /copie brute « à réparer » \(Devis lié à un garage absent\.\)/);
  await refuse(Buffer.alloc(0), /Fichier vide/);
  await refuse(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), /Fichier non reconnu/);
  await refuse(Buffer.from('{"appli":"devis-terrain","clients":['), /Fichier non reconnu/);
  await assert.rejects(LS.lire(null), /Aucun fichier/);
});

test('messages clairs : mauvais fichiers JSON du téléphone', async () => {
  const j = o => Buffer.from(JSON.stringify(o));
  await refuse(j({ appli: 'plan-pc', version: 2 }), /plan PC/);
  await refuse(j({ appli: 'devis-terrain', type: 'envoi-devis', version: 1 }), /envoi de devis/);
  await refuse(j({ appli: 'devis-terrain', version: 2, stores: { clients: [] } }), /\.odicolor d’origine/);
  await refuse(j({ appli: 'devis-terrain', version: 9, clients: [] }), /Version de sauvegarde inconnue \(9\)/);
  await refuse(j({ appli: 'devis-terrain', version: 1 }), /sans liste de garages/);
  await refuse(j({ appli: 'autre' }), /ne vient pas de l’appli téléphone/);
  await refuse(j([1, 2]), /illisible/);
});

test('limites : JSON de plus de 25 Mo et fichier de plus de 1 Go refusés sans tout lire', async () => {
  await refuse(Buffer.alloc(LS.MAX_JSON + 1, 0x20), /25 Mo/);
  const enorme = { size: LS.MAX_FICHIER + 1, slice() { throw new Error('ne doit pas être lu'); } };
  await assert.rejects(LS.lire(enorme), /1 Go/);
});

test('fichier forgé (empreintes correctes) mais contenu incohérent : refusé', async () => {
  const deuxFoisId1 = enteteValide(emballer({ clients: [{ id: 1, nom: 'A' }, { id: 1, nom: 'B' }] }));
  await refuse(forger(deuxFoisId1), /identifiant de garage absent ou répété/);
  await refuse(forger(enteteValide(emballer({ devis: [] }))), /sans liste de garages/);
  await refuse(forger({ ...enteteValide(emballer({ clients: [] })), appli: 'autre' }), /version inconnue/);
  let profond = ['array', []]; for (let i = 0; i < 70; i++) profond = ['array', [profond]];
  await refuse(forger(enteteValide(['object', [['clients', ['array', []]], ['x', profond]]])), /trop imbriquées/);
  await refuse(forger({ ...enteteValide(emballer({ clients: [] })), attachments: [{ size: 10, type: 'image/png', sha256: 'a'.repeat(64) }] }), /tronquée/);
});

test('sécurité : une clé « __proto__ » dans le fichier ne contamine pas le Bureau', async () => {
  const data = ['object', [['clients', ['array', [['object', [['id', 1], ['nom', 'X'], ['__proto__', ['object', [['pollue', true]]]]]]]]]]];
  const r = await LS.lire(blob(forger(enteteValide(data))));
  assert.equal(r.garages.length, 1);
  assert.equal({}.pollue, undefined);
  assert.equal(Object.prototype.pollue, undefined);
});

test('aucune modification : le fichier reste identique et deux lectures donnent le même résultat', async () => {
  const brut = octets('telephone-jeu-samsung.odicolor');
  const copie = Buffer.from(brut);
  const f = blob(brut);
  const a = await LS.lire(f), b = await LS.lire(f);
  assert.deepEqual(a, b);
  assert.ok(Buffer.from(await f.arrayBuffer()).equals(copie));
  assert.ok(brut.equals(copie));
});

// Contrôle croisé facultatif : le Bureau accepte et refuse EXACTEMENT les mêmes fichiers que le téléphone.
//   git worktree add /tmp/lot1 origin/fix/lot1-f01-f03-recuperation
//   TELEPHONE_LOT1=/tmp/lot1 node --test tests/bureau-lecture-sauvegarde.test.cjs
test('même verdict que le téléphone sur chaque fichier sain ou abîmé (si TELEPHONE_LOT1 est fourni)', { skip: !process.env.TELEPHONE_LOT1 && 'TELEPHONE_LOT1 absent' }, async () => {
  const telephone = require(join(process.env.TELEPHONE_LOT1, 'sauvegarde-locale.js'));
  const verdict = async (lire, b) => { try { await lire(blob(b)); return 'accepté'; } catch (_) { return 'refusé'; } };
  const cas = [];
  for (const f of origine.fichiers) cas.push(octets(f.fichier));
  cas.push(octets('telephone-v47.json'));
  const idf = octets('telephone-idf.odicolor');
  for (let i = 0; i < idf.length; i++) { const b = Buffer.from(idf); b[i] ^= 0x01; cas.push(b); }
  const samsung = octets('telephone-jeu-samsung.odicolor');
  for (let i = 0; i < samsung.length; i += 97) { const b = Buffer.from(samsung); b[i] ^= 0x80; cas.push(b); }
  for (const n of [0, 18, 22, 54, 300, samsung.length - 1]) cas.push(samsung.subarray(0, n));
  cas.push(Buffer.concat([idf, Buffer.from('x')]));
  let n = 0;
  for (const b of cas) {
    const t = await verdict(f => telephone.decode(f), b), bu = await verdict(f => LS.lire(f), b);
    assert.equal(bu, t, 'cas ' + n + ' : téléphone ' + t + ', Bureau ' + bu);
    n++;
  }
  assert.ok(n > 1800);
});
