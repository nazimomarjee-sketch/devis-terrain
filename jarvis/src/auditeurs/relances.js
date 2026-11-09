import { charger, eur, jours, conclure, ctrl, controlesGeneraux } from './commun.js';

export function auditerRelances({ resultat: r, regles, aujourdhui, dossierJeu }) {
  const C = [];
  const ds = ['factures', 'paiements', 'clients', 'devis_historique'];
  controlesGeneraux(C, { resultat: r, regles, datasets: ds, dossierJeu, aujourdhui, typeAttendu: 'relances' });
  const L = Object.fromEntries(ds.map((n) => [n, charger(dossierJeu, n).lignes]));
  const w = regles['relance|*']?.valeur; const e = [];
  if (!w) e.push('règle de relance absente'); else {
    const att = new Map(); const ign = new Set(); const vus = new Set();
    const nomClient = (id) => L.clients.find((c) => c.id === id)?.nom ?? '(client inconnu)';
    const recente = (d) => d && jours(d, aujourdhui) < w.delai_entre_relances_jours;
    for (const f of L.factures) {
      if (vus.has(f.id)) continue; vus.add(f.id);
      const solde = BigInt(f.ttc_cents) - L.paiements.filter((p) => p.facture_id === f.id).reduce((s, p) => s + BigInt(p.montant_cents), 0n);
      if (solde <= 0n || f.echeance >= aujourdhui) continue;
      if (recente(f.derniere_relance)) { ign.add(f.id); continue; }
      const retard = jours(f.echeance, aujourdhui);
      att.set(f.id, { objet: `Rappel facture ${f.id}`, nom: nomClient(f.client_id), type: 'facture', niveau: retard >= w.niveau3_jours ? 3 : retard >= w.niveau2_jours ? 2 : 1, montant: solde, client_id: f.client_id, retard, echeance: f.echeance });
    }
    for (const d of L.devis_historique) {
      if (d.statut !== 'envoye' || jours(d.date, aujourdhui) < w.devis_sans_reponse_jours) continue;
      if (recente(d.derniere_relance)) { ign.add(d.id); continue; }
      att.set(d.id, { objet: `Suite à notre devis ${d.id}`, nom: nomClient(d.client_id), date: d.date, type: 'devis', niveau: 1, montant: d.lignes.reduce((s, l) => s + BigInt(l.qte) * BigInt(l.pu_ht_cents), 0n), client_id: d.client_id, retard: jours(d.date, aujourdhui), echeance: null });
    }
    const obtenus = new Map();
    for (const b of r.brouillons) { if (obtenus.has(b.ref)) e.push(`relance en double : ${b.ref}`); obtenus.set(b.ref, b); }
    for (const [ref, a] of att) {
      const b = obtenus.get(ref);
      if (!b) { e.push(`relance omise : ${ref}`); continue; }
      if (b.type !== a.type || b.niveau !== a.niveau) e.push(`${ref} : type/niveau ${b.type}/${b.niveau} ≠ ${a.type}/${a.niveau}`);
      if (BigInt(b.montant_cents) !== a.montant) e.push(`${ref} : montant ${b.montant_cents} ≠ ${a.montant}`);
      if (b.client_id !== a.client_id || b.retard_jours !== a.retard) e.push(`${ref} : client ou retard faux`);
      if (b.client_nom !== a.nom) e.push(`${ref} : nom du client ≠ base`);
      if (b.objet !== a.objet) e.push(`${ref} : objet ≠ attendu`);
      if (a.type === 'facture' && b.echeance !== a.echeance) e.push(`${ref} : échéance ≠ base`);
      if (a.type === 'devis' && b.date !== a.date) e.push(`${ref} : date du devis ≠ base`);
      if (!String(b.texte).includes(ref) || !String(b.texte).includes(eur(a.montant))) e.push(`${ref} : le texte ne cite pas la référence ou le montant`);
      if (b.envoi !== 'NON_ENVOYE') e.push(`${ref} : présenté comme envoyé`);
    }
    for (const ref of obtenus.keys()) if (!att.has(ref)) e.push(`relance injustifiée (soldée, non échue, récente ou inexistante) : ${ref}`);
    const ob = new Set(r.ignorees.map((x) => x.ref));
    for (const i of ign) if (!ob.has(i)) e.push(`relance récente non signalée : ${i}`);
    for (const i of ob) if (!ign.has(i)) e.push(`ignorée à tort : ${i}`);
    if (r.ignorees.some((x) => x.motif !== 'RELANCE_RECENTE')) e.push('motif d’ignorance inattendu');
    if (r.avertissement !== 'Brouillons uniquement : aucun message n’a été envoyé.') e.push('avertissement ≠ texte attendu');
  }
  ctrl(C, 'recalcul_relances', e);
  return conclure(C);
}
