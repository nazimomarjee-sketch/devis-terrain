'use strict';
/* ODICOLOR — VISITE TERRAIN EN 4 TOUCHES MAXIMUM (logique pure, testable sous Node).
   Parcours : (1) ouvrir « Visiter » depuis le garage / la tournée / le cockpit → (2) résultat → (3) ce qui est ressorti → (4) suite. Absent : 3 touches.
   Chaque choix est un seul toucher ; la note libre est facultative. Le résultat est écrit sur la fiche (visite, note commerciale, rappel, étape) sans rien supprimer. */
const ODICOLOR_VISITE = (() => {
  const RESULTATS = [['vu', 'Vu', 'J’ai parlé à quelqu’un'], ['absent', 'Absent', 'Personne / fermé'], ['plus_tard', 'Pas le bon moment', 'À repasser']];
  const RETOURS = [['interet', 'Intéressé / besoin identifié', 'demande'], ['prix', 'Parle du prix', 'prix'], ['concurrent', 'Concurrent en place', 'marque'], ['rien', 'Rien de particulier', null]];
  const SUITES_VU = [['devis', 'Faire un devis', 'devis'], ['essai', 'Lancer un essai', 'essai'], ['rappel7', 'Rappeler dans 7 jours', 'rappel'], ['aucune', 'Aucune suite', 'aucune']];
  const SUITES_ABSENT = [['demain', 'Repasser demain', 1], ['rappel2', 'Rappeler dans 2 jours', 2], ['rappel7', 'Repasser dans 7 jours', 7]];
  const iso = s => typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
  const plus = (jour, n) => { const d = new Date(jour + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  // Nombre de touches du parcours (ouverture comprise) : le garde-fou testé par le navigateur.
  const touches = resultat => resultat === 'vu' ? 4 : 3;
  function etapes(resultat) { return resultat === 'vu' ? ['resultat', 'retour', 'suite'] : ['resultat', 'suite']; }
  function choixSuite(resultat) { return resultat === 'vu' ? SUITES_VU : resultat === 'absent' || resultat === 'plus_tard' ? SUITES_ABSENT : []; }
  /* Applique la visite à une COPIE du garage. choix = { resultat, retour?, suite, note? }. ctx = { auj, nouvelId(), prochainOuvre(jour) -> jour }. */
  function appliquer(client, choix, ctx) {
    if (!client || typeof client !== 'object') throw new Error('Garage introuvable.');
    if (!iso(ctx.auj)) throw new Error('Date du jour invalide.');
    if (!RESULTATS.some(r => r[0] === choix.resultat)) throw new Error('Résultat de visite inconnu.');
    const c = JSON.parse(JSON.stringify(client)), note = String(choix.note || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500);
    const ouvre = j => ctx.prochainOuvre ? ctx.prochainOuvre(j) : j;
    if (!Array.isArray(c.visites)) c.visites = [];
    if (choix.resultat === 'plus_tard') {
      const s = SUITES_ABSENT.find(x => x[0] === choix.suite); if (!s) throw new Error('Choisis quand repasser.');
      c.reporteAu = ouvre(plus(ctx.auj, s[2])); c.reports = (Number(c.reports) || 0) + 1; c.rappel = c.reporteAu;
      return { client: c, resume: 'Reporté au ' + c.reporteAu };
    }
    if (choix.resultat === 'absent') {
      const s = SUITES_ABSENT.find(x => x[0] === choix.suite); if (!s) throw new Error('Choisis quand repasser.');
      c.visites.push({ date: ctx.auj, res: 'absent', note }); if (c.visites.length > 100) c.visites = c.visites.slice(-100);
      c.rappel = ouvre(plus(ctx.auj, s[2])); c.reporteAu = ''; return { client: c, resume: 'Absent · rappel le ' + c.rappel };
    }
    const r = RETOURS.find(x => x[0] === choix.retour); if (!r) throw new Error('Choisis ce qui est ressorti de la visite.');
    const s = SUITES_VU.find(x => x[0] === choix.suite); if (!s) throw new Error('Choisis la suite à donner.');
    c.visites.push({ date: ctx.auj, res: 'vu', note }); if (c.visites.length > 100) c.visites = c.visites.slice(-100);
    c.reports = 0; c.reporteAu = ''; c.rappel = '';
    if (!c.conv || c.conv === 'cible') c.conv = 'contacte';
    if (r[2] || note || s[0] === 'devis' || s[0] === 'essai') {
      if (!Array.isArray(c.infosTerrain)) c.infosTerrain = [];
      const texte = (r[2] ? r[1] : 'Visite') + (note ? ' — ' + note : '') + (s[0] === 'devis' ? ' (devis à faire)' : s[0] === 'essai' ? ' (essai à lancer)' : '');
      c.infosTerrain.push({ id: ctx.nouvelId(), nature: 'note-commerciale', texte, type: r[2] || 'autre', source: 'vendeur', statut: s[0] === 'devis' || s[0] === 'essai' ? 'a_faire' : 'information', suite: s[2], creeLe: ctx.auj, modifieLe: ctx.auj });
    }
    if (s[0] === 'devis') { c.etape = 'Devis à préparer'; c.etapeDate = ctx.auj; c.rappel = ouvre(plus(ctx.auj, 1)); }
    else if (s[0] === 'essai') { c.etape = 'Essai à lancer'; c.etapeDate = ctx.auj; c.rappel = ouvre(plus(ctx.auj, 1)); }
    else if (s[0] === 'rappel7') c.rappel = ouvre(plus(ctx.auj, 7));
    return { client: c, resume: 'Vu · ' + (r[2] ? r[1] : 'rien de particulier') + ' · ' + s[1].toLowerCase() };
  }
  return { RESULTATS, RETOURS, SUITES_VU, SUITES_ABSENT, appliquer, etapes, choixSuite, touches };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_VISITE;
