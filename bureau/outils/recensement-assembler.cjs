'use strict';
// Assemble les résultats de l'extraction du stock Sirene (établissements + noms d'entreprises) en livrables HORS dépôt : fichier CSV par commune, comptes, verdict des contrôles.
// Usage : node bureau/outils/recensement-assembler.cjs <dossier-extraction> <dossier-sortie> <date AAAA-MM-JJ>
const fs = require('node:fs'), path = require('node:path');
const R = require('../recensement-assemblage.js');
const [dossier, sortie, date] = process.argv.slice(2);
if (!dossier || !sortie || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { console.error('Usage : recensement-assembler.cjs <dossier-extraction> <dossier-sortie> <AAAA-MM-JJ>'); process.exit(2); }
const lire = f => JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8'));
const lecture = { ...lire('meta-lecture.json'), source: 'INSEE · base Sirene, fichiers StockEtablissement et StockUniteLegale (Parquet) publiés sur data.gouv.fr', fichierDu: '2026-11-03', extraitLe: date };
const noms = {};
for (const f of fs.readdirSync(path.join(dossier, 'noms')).filter(x => /^n\d+\.json$/.test(x))) Object.assign(noms, lire('noms/' + f).noms);
const etablissements = lire('etablissements-brut.json').map(r => ({ ...r, naf: r.naf }));
const r = R.assembler({ etablissements, noms, lecture });
fs.mkdirSync(sortie, { recursive: true });
if (r.statut !== 'complet') { fs.writeFileSync(path.join(sortie, 'INCOMPLET.json'), JSON.stringify({ statut: r.statut, motifs: r.motifs, controles: r.controles }, null, 2)); console.log('INCOMPLET :', r.motifs.join(' | ')); process.exit(1); }
fs.writeFileSync(path.join(sortie, `recensement-45-20A-${date}.csv`), R.versCsv(r.lignes, R.COLONNES));
fs.writeFileSync(path.join(sortie, `recensement-45-20A-par-commune-${date}.csv`), R.versCsv(r.parCommune, ['departement', 'commune_insee', 'commune', 'etablissements', 'diffusion_partielle', 'sans_nom']));
const { lignes, parCommune, ...resume } = r; fs.writeFileSync(path.join(sortie, `recensement-45-20A-resume-${date}.json`), JSON.stringify(resume, null, 2));
console.log('COMPLET', JSON.stringify(r.comptes));
