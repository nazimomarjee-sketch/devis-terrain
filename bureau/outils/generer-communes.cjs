#!/usr/bin/env node
/* Régénère bureau/communes-idf.js depuis la source officielle @etalab/decoupage-administratif 6.0.0
   (INSEE / La Poste). Outil recréé le 05/11/2026 : il reproduit à l'identique le fichier récupéré
   le 31/10/2026 (vérifié par tests/bureau-communes.test.cjs).
   Usage : node bureau/outils/generer-communes.cjs <dossier du paquet etalab décompressé> [fichier de sortie]
   Obtenir le paquet : npm pack @etalab/decoupage-administratif@6.0.0 && tar xzf etalab-*.tgz  (→ ./package) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEPS_IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];

function construire(communes) {
  const parCode = new Map(communes.filter(c => c.type === 'commune-actuelle').map(c => [c.code, c]));
  const lignes = [];
  for (const c of communes) {
    if (!DEPS_IDF.includes(c.departement)) continue;
    if (c.type === 'commune-actuelle') {
      lignes.push([c.nom, c.departement, (c.codesPostaux || []).join(' '), c.code, '']);
    } else if (c.type === 'commune-deleguee' || c.type === 'commune-associee') {
      const parent = parCode.get(c.chefLieu);
      if (!parent) throw new Error('Commune actuelle introuvable pour ' + c.nom + ' (' + c.chefLieu + ')');
      lignes.push([c.nom, c.departement, (parent.codesPostaux || []).join(' '), parent.code, parent.nom]);
    }
    // Les arrondissements municipaux (Paris) sont couverts par la ligne « Paris » et ses codes postaux.
  }
  return lignes.sort((a, b) => a[0].localeCompare(b[0], 'fr') || a[3].localeCompare(b[3]));
}

function ecrire(lignes) {
  return '/* Communes d\'Île-de-France — généré par bureau/outils/generer-communes.cjs\n' +
    '   Source : @etalab/decoupage-administratif 6.0.0 (INSEE / La Poste). Ne pas modifier à la main.\n' +
    '   Colonnes : nom, département, codes postaux, code INSEE de la commune actuelle, commune actuelle si ancienne commune. */\n' +
    '(function(r){var C=' + JSON.stringify(lignes).replace(/\],\[/g, '],[') + ';\n' +
    'if(typeof module===\'object\'&&module.exports)module.exports=C;else r.COMMUNES_IDF=C;})(typeof self!==\'undefined\'?self:this);\n';
}

module.exports = { construire, ecrire, DEPS_IDF };

if (require.main === module) {
  const paquet = process.argv[2];
  if (!paquet) { console.error('Usage : node bureau/outils/generer-communes.cjs <dossier package etalab> [sortie]'); process.exit(2); }
  const communes = JSON.parse(fs.readFileSync(path.join(paquet, 'data', 'communes.json'), 'utf8'));
  const sortie = process.argv[3] || path.join(__dirname, '..', 'communes-idf.js');
  const lignes = construire(communes);
  fs.writeFileSync(sortie, ecrire(lignes));
  console.log(lignes.length + ' communes écrites dans ' + sortie);
}
