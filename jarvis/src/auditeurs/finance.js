import { charger, centimes, demiSup, jours, conclure, ctrl, controlesGeneraux } from './commun.js';

export function auditerFinance({ resultat: r, regles, aujourdhui, dossierJeu }) {
  const C = [];
  const ds = ['factures', 'paiements', 'commandes', 'clients', 'catalogue'];
  const fictif = controlesGeneraux(C, { resultat: r, regles, datasets: ds, dossierJeu, typeAttendu: 'analyse_finance' });
  const L = Object.fromEntries(ds.map((n) => [n, charger(dossierJeu, n).lignes]));
  const e = []; const att = new Set(); const vus = new Set(); const uniq = [];
  for (const f of L.factures) { if (vus.has(f.id)) att.add(`NUMERO_EN_DOUBLE|${f.id}`); else { vus.add(f.id); uniq.push(f); } }
  const pay = (id) => L.paiements.filter((p) => p.facture_id === id).reduce((s, p) => s + BigInt(p.montant_cents), 0n);
  let ca = 0n, ttc = 0n, enc = 0n, ech = 0n, marge = 0n, base = 0n, sansL = 0;
  for (const f of uniq) {
    ca += BigInt(f.ht_cents); ttc += BigInt(f.ttc_cents);
    const p = pay(f.id); const solde = BigInt(f.ttc_cents) > p ? BigInt(f.ttc_cents) - p : 0n;
    enc += solde; if (f.echeance < aujourdhui) ech += solde;
    if (p > BigInt(f.ttc_cents)) att.add(`SURPAIEMENT|${f.id}`);
    if (!f.commande_id || !L.commandes.some((c) => c.id === f.commande_id)) att.add(`FACTURE_SANS_COMMANDE|${f.id}`);
    const somme = f.lignes.reduce((s, l) => s + BigInt(l.qte) * BigInt(l.pu_ht_cents), 0n);
    if (BigInt(f.ht_cents) + BigInt(f.tva_cents) !== BigInt(f.ttc_cents) || (f.lignes.length && somme !== BigInt(f.ht_cents))) att.add(`TOTAL_INCOHERENT|${f.id}`);
    const cl = L.clients.find((c) => c.id === f.client_id); const rg = regles[`tva|${cl?.territoire}|vente_locale`];
    if (rg && (rg.statut === 'VALIDE' || (rg.statut === 'FICTIF_DEMO' && fictif))) { if (demiSup(BigInt(f.ht_cents) * centimes(rg.valeur.taux_pct), 10000n) !== BigInt(f.tva_cents)) att.add(`TVA_INCOHERENTE|${f.id}`); }
    else att.add(`REGLE_TVA_INDISPONIBLE|${f.id}`);
    if (!f.lignes.length) sansL++;
    for (const l of f.lignes) { const c = L.catalogue.find((x) => x.ref === l.ref); if (!c || c.prix_achat_ht == null) continue; const a = centimes(c.prix_achat_ht); marge += (BigInt(l.pu_ht_cents) - a) * BigInt(l.qte); base += BigInt(l.pu_ht_cents) * BigInt(l.qte); if (BigInt(l.pu_ht_cents) < a) att.add(`MARGE_NEGATIVE_LIGNE|${f.id}/${l.ref}`); }
  }
  for (const p of L.paiements) if (!vus.has(p.facture_id)) att.add(`PAIEMENT_ORPHELIN|${p.id}`);
  const cmd = {}; for (const c of L.commandes) cmd[c.statut] = (cmd[c.statut] ?? 0n) + c.lignes.reduce((s, l) => s + BigInt(l.qte) * BigInt(l.pu_ht_cents), 0n);
  const I = r.indicateurs;
  const cmp = (nom, obt, exp) => { if (BigInt(obt) !== BigInt(exp)) e.push(`${nom} : ${obt} ≠ ${exp}`); };
  cmp('CA HT facturé', I.ca_ht_facture_cents, ca); cmp('CA TTC facturé', I.ca_ttc_facture_cents, ttc); cmp('paiements reçus', I.paiements_recus_cents, L.paiements.reduce((s, p) => s + BigInt(p.montant_cents), 0n));
  cmp('encours', I.encours_cents, enc); cmp('encours échu', I.encours_echu_cents, ech); cmp('marge brute', I.marge_brute_cents, marge); cmp('base de marge', I.base_marge_ht_cents, base);
  for (const k of new Set([...Object.keys(cmd), ...Object.keys(I.commandes_ht_par_statut_cents)])) cmp(`commandes ${k}`, I.commandes_ht_par_statut_cents[k] ?? 0, cmd[k] ?? 0n);
  if (I.marge_brute_bp !== (base > 0n ? Number((marge * 10000n) / base) : null)) e.push(`marge en pb ${I.marge_brute_bp} fausse`);
  if (I.factures_sans_lignes_exclues_de_la_marge !== sansL) e.push('factures sans lignes mal comptées');
  if (r.nb_factures_uniques !== uniq.length) e.push('nombre de factures uniques faux');
  const ob = new Set(r.anomalies.map((a) => `${a.code}|${a.ref}`));
  for (const x of att) if (!ob.has(x)) e.push(`anomalie omise : ${x}`);
  for (const x of ob) if (!att.has(x)) e.push(`anomalie inventée : ${x}`);
  if (!r.definitions?.ca_ht_facture || !r.definitions?.encours) e.push('définitions des indicateurs absentes (risque de confusion)');
  ctrl(C, 'recalcul_finance', e);
  return conclure(C);
}
