import { charger, jours, conclure, ctrl, controlesGeneraux } from './commun.js';

const POSTES = ['reception', 'demontage', 'tolerie', 'preparation', 'peinture', 'remontage', 'controle'];
const score = (t, auj) => { const j = jours(auj, t.echeance); return (j < 0 ? 1000 + 10 * -j : j === 0 ? 500 : j <= 3 ? 200 : j <= 14 ? 50 : 0) + Math.trunc((t.valeur_eur ?? 0) / 10); };
const ouvres = (d, f) => { let n = 0; for (let t = Date.parse(d); t <= Date.parse(f); t += 86400000) { const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n++; } return n; };

export function auditerPlanification({ mission, resultat: r, regles, aujourdhui, dossierJeu, missionsEnAttente = [], autorisations = [] }) {
  const C = [];
  const ds = r.type === 'charge_atelier' ? ['ordres_atelier', 'taches'] : ['taches'];
  controlesGeneraux(C, { resultat: r, regles, datasets: ds, dossierJeu, typeAttendu: r.type });
  const e = []; const w = regles['planning|*']?.valeur;
  if (!w) e.push('règle de planning absente');
  else if (r.type === 'charge_atelier') {
    if (!autorisations.includes('connecteur:cockpit')) e.push('connecteur cockpit utilisé SANS autorisation');
    const ordres = charger(dossierJeu, 'ordres_atelier').lignes; const cap = regles['cockpit_capacite_h_par_jour|*']?.valeur;
    if (!cap) e.push('capacités absentes'); else {
      const d = ordres.map((o) => o.entree).sort()[0]; const f = ordres.map((o) => o.restitution).sort().slice(-1)[0]; const jo = ouvres(d, f);
      if (r.periode.debut !== d || r.periode.fin !== f || r.periode.jours_ouvres !== jo) e.push('période ou jours ouvrés faux');
      const an = new Set();
      for (const p of POSTES) {
        const ch = ordres.reduce((s, o) => s + Math.round((o.heures[p] ?? 0) * 60), 0); const ca = Math.round(cap[p] * 60) * jo;
        if (r.charge_min_par_poste[p] !== ch) e.push(`charge ${p} : ${r.charge_min_par_poste[p]} ≠ ${ch}`);
        if (r.capacite_min_par_poste[p] !== ca) e.push(`capacité ${p} faux`);
        if (ch > ca) an.add(`SURCHARGE_POSTE|${p}`);
      }
      const ob = new Set(r.anomalies.map((a) => `${a.code}|${a.poste}`));
      for (const x of an) if (!ob.has(x)) e.push(`surcharge omise : ${x}`); for (const x of ob) if (!an.has(x)) e.push(`surcharge inventée : ${x}`);
    }
  } else {
    const taches = [...charger(dossierJeu, 'taches').lignes];
    for (const m of missionsEnAttente) taches.push({ id: `VAL-${m.id}`, echeance: aujourdhui, duree_min: 5, valeur_eur: 0 });
    const classes = taches.map((t) => ({ ...t, s: score(t, aujourdhui) })).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
    const plan = []; const rep = []; let min = 0;
    for (const t of classes) (min + t.duree_min <= w.capacite_min ? (plan.push(t.id), (min += t.duree_min)) : rep.push(t.id));
    const ids = r.planifiees.map((p) => p.id);
    if (JSON.stringify(ids) !== JSON.stringify(plan)) e.push(`plan ${JSON.stringify(ids)} ≠ ${JSON.stringify(plan)}`);
    if (JSON.stringify(r.reportees.map((x) => x.id)) !== JSON.stringify(rep)) e.push('tâches reportées ≠ attendues');
    for (const id of ids) if (!taches.some((t) => t.id === id)) e.push(`tâche inventée : ${id}`);
    if (r.minutes_planifiees !== min) e.push(`minutes ${r.minutes_planifiees} ≠ ${min}`); if (min > w.capacite_min) e.push('capacité dépassée');
    if (r.priorites.length > w.max_priorites) e.push(`${r.priorites.length} priorités (maximum ${w.max_priorites})`);
    if (JSON.stringify(r.priorites) !== JSON.stringify(plan.slice(0, w.max_priorites))) e.push('priorités ≠ attendues');
    if ((r.prochaine_action?.id ?? null) !== (plan[0] ?? null)) e.push('prochaine action ≠ première priorité');
    const retard = rep.filter((id) => taches.find((t) => t.id === id).echeance < aujourdhui);
    if (JSON.stringify(r.en_retard_non_planifiees) !== JSON.stringify(retard)) e.push('tâches en retard non planifiées mal signalées');
    for (const t of taches) if (t.echeance < aujourdhui && !plan.includes(t.id) && !rep.includes(t.id)) e.push(`tâche en retard oubliée : ${t.id}`);
  }
  ctrl(C, 'recalcul_plan', e);
  return conclure(C);
}
