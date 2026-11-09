// TRAÇABILITÉ de bout en bout : l'état d'une mission doit être EXPLIQUÉ par son journal. Un statut sans les événements qui
// l'ont produit (même avec une chaîne de hachage intacte) trahit une modification hors circuit.
export function verifierTracabilite(db, limite = 2000) {
  const problemes = [];
  const missions = db.prepare('SELECT id, statut, executions, corrections, decide_par, cout_cents, agent FROM missions ORDER BY rowid DESC LIMIT ?').all(limite);
  const evs = db.prepare('SELECT mission_id, evenement, detail FROM journal WHERE mission_id IS NOT NULL').all();
  const par = new Map(); for (const e of evs) { if (!par.has(e.mission_id)) par.set(e.mission_id, []); par.get(e.mission_id).push(e); }
  const depenses = new Map(db.prepare('SELECT mission_id, SUM(cents) AS s FROM depenses GROUP BY mission_id').all().map((r) => [r.mission_id, r.s]));
  const sorties = new Map(db.prepare('SELECT mission_id, COUNT(*) AS n FROM sorties GROUP BY mission_id').all().map((r) => [r.mission_id, r.n]));
  for (const m of missions) {
    const E = par.get(m.id) ?? []; const n = (nom) => E.filter((x) => x.evenement === nom).length; const p = (msg) => problemes.push(`${m.id} (${m.statut}) : ${msg}`);
    if (n('DEPOT') !== 1) p(`événement DEPOT absent ou multiple (${n('DEPOT')})`);
    if (n('PRISE_EN_CHARGE') !== m.executions) p(`${m.executions} exécutions mais ${n('PRISE_EN_CHARGE')} prises en charge tracées`);
    if (n('CORRECTION_DEMANDEE') !== m.corrections) p(`${m.corrections} corrections mais ${n('CORRECTION_DEMANDEE')} tracées`);
    if (['VALIDE', 'EN_ATTENTE_APPROBATION'].includes(m.statut)) {
      const audits = E.filter((x) => x.evenement === 'AUDIT').map((x) => JSON.parse(x.detail).verdict);
      if (!audits.length || audits.at(-1) !== 'VALIDE') p('aucun audit VALIDE tracé');
      if (!E.some((x) => x.evenement === 'PLAN')) p('plan absent');
    }
    if (m.statut === 'VALIDE' && m.decide_par && n('APPROUVE_ENVOI_SIMULE') !== 1) p('validation humaine sans trace d’approbation unique');
    if (m.statut === 'REFUSE' && n('REFUSE_PAR_HUMAIN') !== 1) p('refus sans trace');
    if (m.statut === 'ECHEC' && !n('ESCALADE_HUMAINE') && !n('ECHEC_REPRISES_EPUISEES')) p('échec sans escalade tracée');
    if (m.statut === 'BLOQUE' && !n('BLOQUE')) p('blocage sans trace');
    if (m.statut === 'EN_ATTENTE_APPROBATION' && n('EN_ATTENTE_APPROBATION') < 1) p('mise en attente sans trace');
    if ((sorties.get(m.id) ?? 0) > 0 && n('APPROUVE_ENVOI_SIMULE') < 1) p('ENVOI enregistré sans approbation tracée');
    if ((depenses.get(m.id) ?? 0) !== (m.cout_cents ?? 0)) p(`coût ${m.cout_cents} ≠ dépenses enregistrées ${depenses.get(m.id) ?? 0}`);
  }
  // Orphelines : contrôlées contre TOUTES les missions (pas seulement la fenêtre examinée — défaut révélé par l'essai d'endurance : au-delà de `limite` missions, les envois des plus anciennes étaient pris à tort pour des orphelins).
  const toutes = new Set(db.prepare('SELECT id FROM missions').all().map((r) => r.id));
  const orphelines = [...sorties.keys()].filter((id) => !toutes.has(id));
  for (const id of orphelines) problemes.push(`envoi pour une mission inconnue : ${id}`);
  return { ok: problemes.length === 0, problemes, missions: missions.length };
}
