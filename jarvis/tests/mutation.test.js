// MUTATION SYSTÉMATIQUE champ par champ : pour CHAQUE champ de CHAQUE résultat des 8 agents, une falsification isolée doit être refusée
// par l'auditeur indépendant — sauf champs de TEXTE LIBRE explicitement listés (et justifiés). Une liste blanche obsolète fait échouer le test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement, traiter, auditer, lire } from './aide.js';
import { accorder } from '../src/regles.js';

const D = { devis: 'prépare un devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs', produits: 'contrôle du catalogue produits', prospection: 'priorise les prospects top 6', clients: 'dossier du client Garage Martin',
  relances: 'prépare les relances', commandes: 'prépare la commande du devis DEV-2026-012', finance: 'analyse financière', planification: 'planifie ma journée' };
// Textes libres : descriptifs ou modèles de rédaction. Protégés par le détecteur d'injection/secrets (contrôle général) ; leur contenu RÉFÉRENTIEL est vérifié à part.
const LIBRE = {
  produits: ['anomalies[].detail'], finance: ['anomalies[].detail'],
  relances: ['brouillons[].texte'], // texte modèle : l'auditeur vérifie qu'il cite la référence et le montant, pas la formulation
};
const feuilles = (o, c = []) => (o !== null && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => feuilles(v, [...c, k])) : [c]);
const lireChemin = (o, c) => c.reduce((a, k) => a[k], o);
const ecrire = (o, c, v) => { c.slice(0, -1).reduce((a, k) => a[k], o)[c.at(-1)] = v; };
const generique = (c) => c.join('.').replace(/\.\d+(\.|$)/g, '[]$1').replace(/\.\[\]/g, '[]');

for (const [nom, demande] of Object.entries(D)) {
  test(`[${nom}] mutation champ par champ : aucun champ non vérifié hors texte libre déclaré`, async () => {
    const e = environnement(); // environnement NEUF : l'auditeur reçoit exactement le contexte vu par l'agent
    try {
      const m = await traiter(e, demande); const base = JSON.parse(m.resultat); assert.equal(auditer(e, nom, m, base).verdict, 'VALIDE');
      const chemins = feuilles(base); const survivants = new Set();
      for (const ch of chemins) {
        const v = lireChemin(base, ch); const c = structuredClone(base);
        ecrire(c, ch, typeof v === 'number' ? v + 1 : typeof v === 'boolean' ? !v : v === null ? 'x' : `${v}X`);
        let verdict; try { verdict = auditer(e, nom, m, c).verdict; } catch { verdict = 'A_CORRIGER'; }
        if (verdict === 'VALIDE') survivants.add(generique(ch));
      }
      const permis = new Set(LIBRE[nom] ?? []);
      const nonDeclares = [...survivants].filter((s) => !permis.has(s));
      assert.deepEqual(nonDeclares, [], `${nom} : champs NON vérifiés par l'auditeur : ${nonDeclares.join(', ')}`);
      const obsoletes = [...permis].filter((p) => !survivants.has(p));
      assert.deepEqual(obsoletes, [], `${nom} : liste blanche obsolète (ces champs sont désormais vérifiés, retirer de LIBRE) : ${obsoletes.join(', ')}`);
      assert.ok(chemins.length >= 18, `${nom} : trop peu de champs testés`);
    } finally { e.nettoyer(); }
  });
}

test('[planification/charge_atelier] mutation champ par champ sur le connecteur cockpit autorisé', async () => {
  const e = environnement({ espace: 'cockpit' });
  try {
    accorder(e.db, { type: 'connecteur:cockpit', portee: 'test' }, 'administrateur');
    const m = await traiter(e, 'charge de l’atelier'); const base = JSON.parse(m.resultat); assert.equal(base.type, 'charge_atelier');
    const surv = [];
    for (const ch of feuilles(base)) {
      const v = lireChemin(base, ch); const c = structuredClone(base); ecrire(c, ch, typeof v === 'number' ? v + 1 : typeof v === 'boolean' ? !v : `${v}X`);
      let verdict; try { verdict = auditer(e, 'planification', m, c, { autorisations: ['connecteur:cockpit'] }).verdict; } catch { verdict = 'A_CORRIGER'; }
      if (verdict === 'VALIDE') surv.push(generique(ch));
    }
    assert.deepEqual([...new Set(surv)], [], `champs non vérifiés : ${surv.join(', ')}`);
  } finally { e.nettoyer(); }
});

test('résultats BLOQUÉS : un blocage inventé (code inconnu, candidat inexistant, question absente) est refusé', async () => {
  const e = environnement();
  try {
    const { auditerUnBlocage } = await import('../src/auditeurs/index.js');
    const FICTIF = e.cfg.dossierJeu;
    const ok = { statut: 'BLOQUE', code: 'CLIENT_AMBIGU', raison: 'ambigu', question: 'Lequel ?', candidats: ['C001', 'C002'] };
    assert.equal(auditerUnBlocage(ok, FICTIF).verdict, 'BLOQUE');
    for (const mauvais of [{ ...ok, code: 'INVENTE' }, { ...ok, candidats: ['C999'] }, { ...ok, question: '' }, { ...ok, raison: '' }]) assert.equal(auditerUnBlocage(mauvais, FICTIF).verdict, 'A_CORRIGER');
    void lire;
  } finally { e.nettoyer(); }
});
