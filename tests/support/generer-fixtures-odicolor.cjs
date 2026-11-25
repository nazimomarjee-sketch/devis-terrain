#!/usr/bin/env node
'use strict';
/* Fabrique les fichiers d'essai .odicolor du Bureau AVEC LE VRAI CODE DU TÉLÉPHONE (Lot 1).
   Usage : node tests/support/generer-fixtures-odicolor.cjs <dossier d'une copie de la branche fix/lot1-f01-f03-recuperation>
   Exemple : git worktree add /tmp/lot1 origin/fix/lot1-f01-f03-recuperation
             node tests/support/generer-fixtures-odicolor.cjs /tmp/lot1
   Toutes les données sont fictives. Les fichiers existants ne sont jamais écrasés. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

const source = path.resolve(process.argv[2] || '');
const telephone = require(path.join(source, 'sauvegarde-locale.js'));
const jeu = require(path.join(source, 'scripts', 'generer-jeu-synthetique.cjs'));
const sortie = path.join(__dirname, '..', 'fixtures', 'bureau');

// Jeu « Île-de-France » : garages fictifs placés dans de vraies communes pour tester le classement.
function jeuIdf() {
  const date = '2026-11-05T09:00:00.000Z';
  const villes = [['Massy', '91300', 'client'], ['Palaiseau', '91120', 'prospect'], ['Saclay', '91190', 'prospect'], ['Créteil', '94000', 'client'], ['Chartres', '28000', 'prospect']];
  const clients = villes.map(([ville, cp, statutCrm], i) => ({ id: i + 1, nom: 'GARAGE FICTIF IDF ' + (i + 1), tel: '', ville, cp, statutCrm, creeLe: date,
    etape: i === 0 ? 'Rappeler pour essai vernis (fictif)' : '', etapeDate: i === 0 ? '2026-11-12' : '' }));
  clients.push({ id: 6, nom: 'GARAGE FICTIF IDF 1', tel: '', ville: 'Massy', cp: '91300', statutCrm: 'prospect', creeLe: date }); // homonyme volontaire
  return { articles: [], clients, devis: [], meta: [['settings', { societe: 'ODICOLOR — FICTIF' }]], recuperations: [] };
}

async function ecrire(nom, stores, options) {
  const { file, warning } = await telephone.encode(stores, options);
  const octets = Buffer.from(await file.arrayBuffer());
  const chemin = path.join(sortie, nom);
  fs.writeFileSync(chemin, octets, { flag: 'wx' });
  return { fichier: nom, octets: octets.length, sha256: crypto.createHash('sha256').update(octets).digest('hex'), garages: stores.clients.length,
    noms: stores.clients.map(c => c.nom), avertissement: warning || '' };
}

(async () => {
  fs.mkdirSync(sortie, { recursive: true });
  const smoke = jeu.create('smoke').stores;
  const brut = jeuIdf(); brut.devis.push({ id: 1, clientId: 99, clientNom: 'INEXISTANT', creeLe: '2026-11-05', statut: 'brouillon', lignes: [] });
  const resultats = [
    await ecrire('telephone-jeu-samsung.odicolor', smoke),
    await ecrire('telephone-idf.odicolor', jeuIdf()),
    await ecrire('telephone-vide.odicolor', { articles: [], clients: [], devis: [], meta: [], recuperations: [] }),
    await ecrire('telephone-copie-a-reparer.odicolor', brut, { recovery: true })
  ];
  const v47 = { appli: 'devis-terrain', version: 1, date: '2026-11-05T09:00:00.000Z', reglages: {}, clients: jeuIdf().clients, devis: [], signalements: [], point: null,
    comparateur: null, appels: [], tournees: {}, pcActions: [] };
  fs.writeFileSync(path.join(sortie, 'telephone-v47.json'), JSON.stringify(v47), { flag: 'wx' });
  const origine = { generePar: 'tests/support/generer-fixtures-odicolor.cjs', codeTelephone: 'sauvegarde-locale.js',
    codeTelephoneSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(source, 'sauvegarde-locale.js'))).digest('hex'),
    branche: 'fix/lot1-f01-f03-recuperation', donnees: 'Fictives uniquement', fichiers: resultats };
  fs.writeFileSync(path.join(sortie, 'origine.json'), JSON.stringify(origine, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(resultats.map(r => [r.fichier, r.octets, r.garages, r.avertissement.slice(0, 60)])));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
