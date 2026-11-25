'use strict';
/* ODICOLOR — ANALYSE COMMERCIALE PAR SECTEUR (logique pure, testable sous Node). Secteur = département, puis commune.
   Pour chaque secteur : CA facturé HT du mois, clients actifs / dormants / sans suivi de facturation, prospects et prioritaires, visites récentes, couverture du marché recensé, et la raison de la priorité.
   Règles (aucun chiffre deviné) :
   - ACTIF = client lié à un code EBP dont la dernière facture date de ≤ N jours (60 par défaut) ; DORMANT = lié à un code EBP mais plus de N jours (ou aucune facture connue) ;
     un client NON lié à un code EBP n'est ni actif ni dormant : « sans suivi de facturation » (on ne prétend pas savoir) ;
   - CA du secteur = factures − avoirs du mois des codes liés aux garages du secteur ; le CA des codes non liés ou de garages sans commune reste à part (non attribué) : total = secteurs + non attribué (contrôlé) ;
   - couverture = garages du téléphone / établissements 45.20A recensés dans la commune (le recensement n'est PAS une liste de carrosseries-peinture). */
const ODICOLOR_SECTEUR = (() => {
  const JOUR = 864e5, ecart = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / JOUR);
  const vide = (id, nom, dep) => ({ id, nom, dep, garages: 0, clients: 0, actifs: 0, dormants: 0, sansSuivi: 0, prospects: 0, prospectsPrio: 0, jamaisVisites: 0, visites30: 0, caMoisCents: 0, marche: 0, couverturePct: null, bloques: 0 });
  /* e = { auj, clients, facturation:{[id]:{derniere,moisCents}}, caTotalMoisCents?, placer(client)->{insee,commune}|null, communes:Map(insee→{nom}), marche:[[insee,n]], seuilJours } */
  function calculer(e) {
    const seuil = e.seuilJours || 60, par = new Map(), deps = new Map(), sans = vide('sans', 'Sans commune connue', '--');
    const ligne = (m, id, nom, dep) => { if (!m.has(id)) m.set(id, vide(id, nom, dep)); return m.get(id); };
    const fact = e.facturation || {};
    const compter = (r, c) => {
      r.garages++;
      const f = fact[c.id], lie = !!c.codeEbp;
      if (c.statutCrm === 'client') {
        r.clients++;
        if (!lie) r.sansSuivi++; else if (f && f.derniere && ecart(f.derniere, e.auj) <= seuil) r.actifs++; else r.dormants++;
      } else if (c.conv !== 'refus') { r.prospects++; if (c.priorite === 'A' || c.priorite === 'B') r.prospectsPrio++; }
      const vs = (Array.isArray(c.visites) ? c.visites : []).filter(v => v && v.res === 'vu' && typeof v.date === 'string').map(v => v.date.slice(0, 10)).sort();
      if (!vs.length) r.jamaisVisites++; else if (ecart(vs[vs.length - 1], e.auj) <= 30) r.visites30++;
      if (f) r.caMoisCents += f.moisCents || 0;
      if ((c.compte && c.compte.statut === 'bloque') || (c.ebp && c.ebp.bloque)) r.bloques++;
    };
    for (const c of e.clients || []) {
      const p = e.placer(c);
      if (!p || !p.insee) { compter(sans, c); continue; }
      const dep = p.insee.slice(0, 2), nomC = p.commune || (e.communes.get(p.insee) || {}).nom || p.insee;
      compter(ligne(par, p.insee, nomC, dep), c); compter(ligne(deps, dep, 'Département ' + dep, dep), c);
    }
    for (const [insee, n] of e.marche || []) {
      const c = e.communes.get(insee); if (!c) continue;
      const dep = insee.slice(0, 2); ligne(par, insee, c.nom, dep).marche = n; ligne(deps, dep, 'Département ' + dep, dep).marche += n;
    }
    const fin = r => { r.couverturePct = r.marche > 0 ? Math.round(r.garages / r.marche * 100) : null; return r; };
    const communes = [...par.values()].map(fin), departements = [...deps.values()].map(fin);
    // Priorité : ce qui rapporte le plus vite d'abord — dormants à relancer, prospects A/B jamais visités, bloqués à régulariser, couverture faible.
    for (const r of [...communes, ...departements, sans]) {
      const raisons = []; let score = 0;
      if (r.dormants) { score += r.dormants * 5; raisons.push(r.dormants + ' client(s) dormant(s) à relancer'); }
      if (r.prospectsPrio) { score += r.prospectsPrio * 4; raisons.push(r.prospectsPrio + ' prospect(s) A/B' + (r.jamaisVisites ? ' dont des garages jamais visités' : '')); }
      if (r.bloques) { score += r.bloques * 2; raisons.push(r.bloques + ' compte(s) bloqué(s)'); }
      if (r.marche > r.garages) { score += Math.min(10, Math.round((r.marche - r.garages) / 5)); raisons.push('couverture ' + (r.couverturePct == null ? '—' : r.couverturePct + ' %') + ' du marché recensé'); }
      if (r.visites30 === 0 && r.garages) { score += 1; raisons.push('aucune visite depuis 30 j'); }
      r.score = score; r.raisons = raisons;
    }
    const tri = (a, b) => b.score - a.score || b.garages - a.garages || String(a.nom).localeCompare(String(b.nom), 'fr');
    communes.sort(tri); departements.sort(tri);
    // CA : contrôle de cohérence avec le total du mois (si fourni) — le non attribué est ce qui n'est dans aucun secteur.
    const caSecteurs = communes.reduce((s, r) => s + r.caMoisCents, 0) + sans.caMoisCents;
    const controle = e.caTotalMoisCents == null ? null : { totalCents: e.caTotalMoisCents, secteursCents: caSecteurs, nonAttribueCents: e.caTotalMoisCents - caSecteurs, ok: e.caTotalMoisCents >= caSecteurs - 0 && caSecteurs >= 0 };
    return { auj: e.auj, seuilJours: seuil, communes, departements, sans, controle, totaux: { garages: (e.clients || []).length, clients: communes.reduce((s, r) => s + r.clients, 0) + sans.clients, actifs: communes.reduce((s, r) => s + r.actifs, 0), dormants: communes.reduce((s, r) => s + r.dormants, 0), prospects: communes.reduce((s, r) => s + r.prospects, 0) + sans.prospects } };
  }
  return { calculer };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_SECTEUR;
