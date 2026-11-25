'use strict';
// Lance le comptage des établissements actifs 45.20A (95, 94, 91, 77, 93) sur l'API officielle ; un fichier par département, écrit dès qu'il est COMPLET.
// Reprenable : relancé après une coupure, il saute les départements déjà complets (un redémarrage ne fait perdre qu'un département au plus).
// Usage : node bureau/outils/comptage-sirene.cjs <dossier-de-sortie HORS dépôt>
// Ne stocke que des NOMBRES (aucun établissement, aucun SIRET). Lecture par curl (utilise le proxy de l'environnement).
const { execFile } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const C = require('../comptage-sirene.js');

function fetchCurl(url) {
  return new Promise((ok, ko) => execFile('curl', ['-sS', '-m', '40', '-w', '\n%{http_code}', url], { maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
    if (err) return ko(err);
    const i = out.lastIndexOf('\n'), status = Number(out.slice(i + 1)), corps = out.slice(0, i);
    ok({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(corps) });
  }));
}
const dossier = process.argv[2];
if (!dossier) { console.error('Indique le dossier de sortie (hors dépôt).'); process.exit(2); }
fs.mkdirSync(dossier, { recursive: true });
(async () => {
  for (const dep of C.DEPARTEMENTS) {
    const f = path.join(dossier, 'departement-' + dep + '.json');
    try { if (JSON.parse(fs.readFileSync(f, 'utf8')).statut === 'complet') { console.log(dep, 'déjà complet, repris'); continue; } } catch (e) { /* à faire */ }
    console.log(dep, 'début', new Date().toISOString());
    const r = await C.compterDepartement(dep, { fetch: fetchCurl, progression: (d, p, n) => { if (p % 20 === 0) console.log('  ' + d + ' : page ' + p + '/' + n); } });
    if (r.statut === 'complet') fs.writeFileSync(f, JSON.stringify(r, null, 2));
    console.log(dep, r.statut, r.etablissementsActifs == null ? r.motif : r.etablissementsActifs + ' (45.20A : ' + r.dontEntreprisesCode452A + ' + codes voisins : ' + r.dontEntreprisesCodesVoisins + ')');
  }
  const faits = C.DEPARTEMENTS.filter(d => fs.existsSync(path.join(dossier, 'departement-' + d + '.json')));
  console.log('FINI', faits.length === C.DEPARTEMENTS.length ? 'complet' : 'INCOMPLET : ' + C.DEPARTEMENTS.filter(d => !faits.includes(d)).join(', ') + ' à relancer');
})().catch(e => { console.error('Erreur :', e.message); process.exit(1); });
