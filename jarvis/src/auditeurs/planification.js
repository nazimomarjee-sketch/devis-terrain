import { charger, jours, conclure, ctrl, controlesGeneraux } from './commun.js';

const POSTES = ['reception', 'demontage', 'tolerie', 'preparation', 'peinture', 'remontage', 'controle'];
const score = (t, auj) => { const j = jours(auj, t.echeance); return (j < 0 ? 1000 + 10 * -j : j === 0 ? 500 : j <= 3 ? 200 : j <= 14 ? 50 : 0) + Math.trunc((t.valeur_eur ?? 0) / 10); };
const ouvres = (d, f) => { let n = 0; for (let t = Date.parse(d); t <= Date.parse(f); t += 86400000) { const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n++; } return n; };

export function auditerPlanification({ mission, resultat: r, regles, aujourdhui, dossierJeu, missionsEnAttente = [], autorisations = [] }) {
  const C = [];
  const ds = r.type === 'charge_atelier' ? ['ordres_atelier', 'taches'] : ['taches'];
  controlesGeneraux(C, { resultat: r, regles, datasets: ds, dossierJeu, aujourdhui, typeAttendu: ['plan_journee', 'charge_atelier'].includes(r.type) ? r.type : 'plan_journee' });
  const e = []; const w = regles['planning|*']?.valeur;
  if (!w) e.push('règle de planning absente');
  else if (r.type === 'charge_atelier') {
    if (!autorisations.includes('connecteur:cockpit')) e.push('connecteur cockpit utilisé SANS autorisation');
    const ordres = charger(dossierJeu, 'ordres_atelier').lignes; const cap = regles['cockpit_capacite_h_par_jour|*']?.valeur;
    if (!cap) e.push('capacités absentes'); else {
      const d = ordres.map((o) => o.entree).sort()[0]; const f = ordres.map((o) => o.restitution).sort().slice(-1)[0]; const jo = ouvres(d, f);
      if (r.periode.debut !== d || r.periode.fin !== f || r.periode.jours_ouvres !== jo) e.push('période ou jours ouvrés faux');
      const an = new Set(); const valeurs = new Map();
      if (r.nb_ordres !== ordres.length) e.push(`nb_ordres ${r.nb_ordres} ≠ ${ordres.length}`);
      for (const p of POSTES) {
        const ch = ordres.reduce((s, o) => s + Math.round((o.heures[p] ?? 0) * 60), 0); const ca = Math.round(cap[p] * 60) * jo;
        if (r.charge_min_par_poste[p] !== ch) e.push(`charge ${p} : ${r.charge_min_par_poste[p]} ≠ ${ch}`);
        if (r.capacite_min_par_poste[p] !== ca) e.push(`capacité ${p} faux`);
        if (ch > ca) { an.add(`SURCHARGE_POSTE|${p}`); valeurs.set(p, [ch, ca]); }
      }
      for (const a of r.anomalies) { const v = valeurs.get(a.poste); if (v && (a.charge_min !== v[0] || a.capacite_min !== v[1])) e.push(`surcharge ${a.poste} : valeurs ${a.charge_min}/${a.capacite_min} ≠ ${v[0]}/${v[1]}`); }
      const ob = new Set(r.anomalies.map((a) => `${a.code}|${a.poste}`));
      for (const x of an) if (!ob.has(x)) e.push(`surcharge omise : ${x}`); for (const x of ob) if (!an.has(x)) e.push(`surcharge inventée : ${x}`);
    }
  } else {
    const taches = [...charger(dossierJeu, 'taches').lignes];
    // Validations prises en compte : DÉCLARÉES par le résultat, VÉRIFIÉES ici (chacune doit être une vraie mission sensible arrivée au stade
    // d'approbation). On ne compare pas à l'état courant : d'autres travailleurs le font évoluer pendant le calcul.
    const declarees = Array.isArray(r.validations_prises_en_compte) && r.validations_prises_en_compte.every((x) => typeof x === 'string') ? r.validations_prises_en_compte : null;
    if (!declarees) e.push('validations_prises_en_compte absent ou invalide');
    const connues = new Map(missionsEnAttente.map((m) => [m.id, m]));
    for (const id of declarees ?? []) if (!connues.has(id)) e.push(`validation ${id} inconnue ou non sensible`);
    if (new Set(declarees ?? []).size !== (declarees ?? []).length) e.push('validations en double');
    for (const id of declarees ?? []) { const m = connues.get(id); if (m) taches.push({ id: `VAL-${m.id}`, echeance: aujourdhui, duree_min: 5, valeur_eur: 0 }); }
    const classes = taches.map((t) => ({ ...t, s: score(t, aujourdhui) })).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
    const plan = []; const rep = []; let min = 0; const fiche = new Map(classes.map((t) => [t.id, t]));
    for (const t of classes) (min + t.duree_min <= w.capacite_min ? (plan.push(t.id), (min += t.duree_min)) : rep.push(t.id));
    const ids = r.planifiees.map((p) => p.id);
    if (JSON.stringify(ids) !== JSON.stringify(plan)) e.push(`plan ${JSON.stringify(ids)} ≠ ${JSON.stringify(plan)}`);
    if (JSON.stringify(r.reportees.map((x) => x.id)) !== JSON.stringify(rep)) e.push('tâches reportées ≠ attendues');
    for (const id of ids) if (!taches.some((t) => t.id === id)) e.push(`tâche inventée : ${id}`);
    for (const p of r.planifiees) {
      const t = fiche.get(p.id); if (!t) continue;
      if (p.score !== t.s) e.push(`${p.id} : score ${p.score} ≠ ${t.s}`);
      if (p.duree_min !== t.duree_min) e.push(`${p.id} : durée ${p.duree_min} ≠ ${t.duree_min}`);
      if (p.echeance !== t.echeance) e.push(`${p.id} : échéance ≠ source`);
      const titreAttendu = String(p.id).startsWith('VAL-') ? `Valider : ${String(missionsEnAttente.find((m) => `VAL-${m.id}` === p.id)?.demande ?? '').slice(0, 60)}` : t.titre;
      if (p.titre !== titreAttendu) e.push(`${p.id} : titre ≠ source`);
    }
    if (r.capacite_min !== w.capacite_min) e.push(`capacité ${r.capacite_min} ≠ règle ${w.capacite_min}`);
    if (r.reportees.some((x) => x.motif !== 'CAPACITE_INSUFFISANTE')) e.push('motif de report inattendu');
    if (r.prochaine_action && r.prochaine_action.titre !== fiche.get(plan[0])?.titre && !String(plan[0]).startsWith('VAL-')) e.push('titre de la prochaine action ≠ source');
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
