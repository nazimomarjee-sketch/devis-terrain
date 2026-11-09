import { charger, jours, conclure, ctrl, controlesGeneraux } from './commun.js';
import { detecterInjection } from '../confiance.js';

export function auditerProspection({ mission, resultat: r, regles, aujourdhui, dossierJeu }) {
  const C = []; const ps = charger(dossierJeu, 'prospects').lignes;
  controlesGeneraux(C, { resultat: r, regles, datasets: ['prospects'], dossierJeu, typeAttendu: 'classement_prospects' });
  const w = regles['prospection_poids|*']?.valeur; const e = [];
  if (!w) e.push('pondérations absentes'); else {
    const n = Math.min(20, Math.max(1, Number(/top\s*(\d+)/i.exec(mission.demande)?.[1] ?? 5)));
    const att = ps.map((p) => {
      const pot = p.potentiel_mensuel_eur == null ? 0 : Math.min(Math.trunc(p.potentiel_mensuel_eur / w.potentiel_diviseur), w.potentiel_max);
      const tec = Math.min(p.techniciens * w.points_par_technicien, w.technicien_max);
      let rec = 0; const flags = [];
      if (p.potentiel_mensuel_eur == null) flags.push('potentiel à vérifier');
      if (p.dernier_contact == null) { rec = w.jamais_contacte; flags.push('jamais contacté (à vérifier)'); } else { const j = jours(p.dernier_contact, aujourdhui); rec = j > w.ancien_jours ? w.ancien_points : j < w.recent_jours ? w.recent_points : 0; }
      if (p.notes && detecterInjection(p.notes).length) flags.push('NOTE_SUSPECTE_EXCLUE');
      return { id: p.id, score: pot + tec + rec, detail: { potentiel: pot, techniciens: tec, recence: rec }, flags };
    }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, n);
    if (r.top.length !== att.length) e.push(`${r.top.length} prospects au lieu de ${att.length}`);
    att.forEach((a, i) => {
      const o = r.top[i]; if (!o) return;
      if (o.id !== a.id) e.push(`rang ${i + 1} : ${o.id} au lieu de ${a.id}`);
      if (o.score !== a.score) e.push(`rang ${i + 1} (${o.id}) : score ${o.score} ≠ ${a.score}`);
      if (JSON.stringify(o.detail) !== JSON.stringify(a.detail)) e.push(`rang ${i + 1} : détail du score faux`);
      if (JSON.stringify([...o.a_verifier].sort()) !== JSON.stringify([...a.flags].sort())) e.push(`rang ${i + 1} : points « à vérifier » différents`);
    });
    for (const o of r.top) if (!ps.some((p) => p.id === o.id)) e.push(`prospect hors base : ${o.id}`);
    if (!/aucun compte n’est déclaré ouvert/.test(r.avertissement ?? '')) e.push('avertissement « aucun compte ouvert » absent');
  }
  ctrl(C, 'recalcul_classement', e);
  return conclure(C);
}
