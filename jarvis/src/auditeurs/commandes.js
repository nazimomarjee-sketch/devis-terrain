import { charger, jours, centimes, conclure, ctrl, controlesGeneraux } from './commun.js';

const total = (c) => c.lignes.reduce((s, l) => s + BigInt(l.qte) * BigInt(l.pu_ht_cents), 0n);

export function auditerCommandes({ mission, resultat: r, regles, aujourdhui, dossierJeu }) {
  const C = [];
  const ds = ['devis_historique', 'commandes', 'clients', 'catalogue'];
  controlesGeneraux(C, { resultat: r, regles, datasets: ds, dossierJeu, aujourdhui, typeAttendu: ['suivi_commandes', 'commande_brouillon'].includes(r.type) ? r.type : 'commande_brouillon' });
  const L = Object.fromEntries(ds.map((n) => [n, charger(dossierJeu, n).lignes]));
  const w = regles['commande|*']?.valeur; const e = [];
  if (!w) e.push('règle de commande absente');
  else if (r.type === 'suivi_commandes') {
    const par = {}; const tot = {}; const an = new Set();
    for (const c of L.commandes) {
      par[c.statut] = (par[c.statut] ?? 0) + 1; tot[c.statut] = (tot[c.statut] ?? 0n) + total(c);
      const age = jours(c.statut_le, aujourdhui);
      if (c.statut === 'envoyee' && age >= w.envoyee_non_enregistree_jours) an.add(`ENVOYEE_NON_ENREGISTREE|${c.id}`);
      if (c.statut === 'preparee' && age >= w.preparee_non_envoyee_jours) an.add(`PREPAREE_NON_ENVOYEE|${c.id}`);
    }
    if (JSON.stringify(Object.entries(par).sort()) !== JSON.stringify(Object.entries(r.par_statut).sort())) e.push(`comptes par statut ${JSON.stringify(r.par_statut)} ≠ ${JSON.stringify(par)}`);
    for (const k of new Set([...Object.keys(tot), ...Object.keys(r.total_ht_par_statut_cents)])) if (BigInt(r.total_ht_par_statut_cents[k] ?? 0) !== (tot[k] ?? 0n)) e.push(`total ${k} faux`);
    const ob = new Set(r.anomalies.map((a) => `${a.code}|${a.commande_id}`));
    for (const x of an) if (!ob.has(x)) e.push(`anomalie omise : ${x}`);
    for (const x of ob) if (!an.has(x)) e.push(`anomalie inventée : ${x}`);
    if (r.nb_commandes !== L.commandes.length) e.push('nombre de commandes faux');
  } else {
    const id = /\b(DEV-\d{4}-\d{3})\b/i.exec(mission.demande)?.[1]; const d = L.devis_historique.find((x) => x.id.toLowerCase() === id?.toLowerCase());
    if (!d) e.push('devis source introuvable'); else {
      if (d.statut !== 'accepte') e.push(`le devis source n’est pas accepté (${d.statut}) : aucune commande ne devait être préparée`);
      if (r.devis_ref !== d.id || r.client.id !== d.client_id) e.push('devis ou client différent de la source');
      if (r.lignes.length !== d.lignes.length || r.lignes.some((l, i) => l.ref !== d.lignes[i].ref || l.qte !== d.lignes[i].qte || l.pu_ht_cents !== d.lignes[i].pu_ht_cents)) e.push('lignes ≠ devis source');
      if (BigInt(r.total_ht_cents) !== total(d)) e.push(`total ${r.total_ht_cents} ≠ ${total(d)}`);
      for (const l of r.lignes) { const c = L.catalogue.find((x) => x.ref === l.ref); if (!c) e.push(`${l.ref} inexistante`); else if (l.qte % c.multiple !== 0) e.push(`${l.ref} : conditionnement`); }
      const diffs = new Set(); for (const l of d.lignes) { const c = L.catalogue.find((x) => x.ref === l.ref); if (c?.prix_ht != null && centimes(c.prix_ht) !== BigInt(l.pu_ht_cents)) diffs.add(l.ref); }
      const sig = new Set(r.avertissements.filter((a) => a.code === 'PRIX_DIFFERENT_CATALOGUE').map((a) => a.ref));
      for (const x of diffs) if (!sig.has(x)) e.push(`écart de prix non signalé : ${x}`);
    }
    if (r.numero_provisoire !== `CMD-DRAFT-${mission.id}`) e.push('numéro provisoire ≠ CMD-DRAFT-<mission>');
    if (d && r.client.nom !== L.clients.find((c) => c.id === d.client_id)?.nom) e.push('nom du client ≠ base');
    if (r.statut_commande !== 'PREPAREE_NON_ENVOYEE' || r.envoyee !== false || r.enregistree_ebp !== false) e.push('statut présenté comme envoyé ou enregistré');
  }
  ctrl(C, 'recalcul_commandes', e);
  return conclure(C);
}
