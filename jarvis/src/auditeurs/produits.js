import { charger, centimes, jours, conclure, ctrl, controlesGeneraux, norm } from './commun.js';

const margeBp = (p, a) => ((p - a) * 10000n) / p;

export function attendusProduits(cat, regles, aujourdhui) {
  const set = new Set(); const seuil = centimes(regles['marge_min_pct|*'].valeur.pct); const maxJ = regles['tarif_ancien_jours|*'].valeur.jours;
  const groupes = new Map();
  for (const r of cat) {
    const p = r.prix_ht == null ? null : centimes(r.prix_ht); const a = r.prix_achat_ht == null ? null : centimes(r.prix_achat_ht);
    if (!Number.isInteger(r.multiple) || r.multiple < 1) set.add(`CONDITIONNEMENT_INVALIDE|${r.ref}`);
    if (p == null) set.add(`PRIX_MANQUANT|${r.ref}`);
    else {
      if (!r.date_prix) set.add(`DATE_TARIF_ABSENTE|${r.ref}`); else if (jours(r.date_prix, aujourdhui) > maxJ) set.add(`TARIF_ANCIEN|${r.ref}`);
      if (a == null) set.add(`PRIX_ACHAT_ABSENT|${r.ref}`); else if (p < a) set.add(`MARGE_NEGATIVE|${r.ref}`); else if (p > 0n && margeBp(p, a) < seuil) set.add(`MARGE_SOUS_SEUIL|${r.ref}`);
    }
    groupes.set(norm(r.designation), [...(groupes.get(norm(r.designation)) ?? []), r.ref]);
    if (r.compatible_avec.some((c) => !cat.some((x) => x.ref === c))) set.add(`COMPATIBILITE_REF_INCONNUE|${r.ref}`);
    if (r.compatible_avec.some((c) => { const o = cat.find((x) => x.ref === c); return o && !o.compatible_avec.includes(r.ref); })) set.add(`COMPATIBILITE_ASYMETRIQUE|${r.ref}`);
  }
  for (const g of groupes.values()) [...g].sort().slice(1).forEach((r) => set.add(`DOUBLON_DESIGNATION|${r}`));
  return set;
}

export function auditerProduits({ mission, resultat: r, regles, aujourdhui, dossierJeu }) {
  const C = []; const cat = charger(dossierJeu, 'catalogue').lignes;
  controlesGeneraux(C, { resultat: r, regles, datasets: ['catalogue'], dossierJeu, typeAttendu: 'rapport_produits' });
  const e = [];
  if (r.mode === 'controle_catalogue') {
    const att = attendusProduits(cat, regles, aujourdhui); const obt = new Set(r.anomalies.map((a) => `${a.code}|${a.ref}`));
    for (const x of att) if (!obt.has(x)) e.push(`anomalie omise : ${x}`);
    for (const x of obt) if (!att.has(x)) e.push(`anomalie inventée : ${x}`);
    if (r.anomalies.length !== obt.size) e.push('anomalies en double'); if (r.nb_references !== cat.length) e.push('nombre de références faux');
  } else if (r.mode === 'fiche') {
    const ref = /\b([A-Za-z]{3}-[A-Za-z0-9]{3,6})\b/.exec(mission.demande)?.[1]; const c = cat.find((x) => x.ref.toLowerCase() === ref?.toLowerCase());
    if (!c) e.push('référence de la fiche inexistante'); else {
      const f = r.fiche;
      if (f.ref !== c.ref || f.designation !== c.designation) e.push('fiche ≠ catalogue');
      if ((c.prix_ht == null ? null : Number(centimes(c.prix_ht))) !== f.prix_ht_cents) e.push(`prix de la fiche ${f.prix_ht_cents} ≠ catalogue`);
      if (c.prix_ht != null && c.prix_achat_ht != null && f.marge_bp !== Number(margeBp(centimes(c.prix_ht), centimes(c.prix_achat_ht)))) e.push('marge de la fiche fausse');
      if (JSON.stringify(f.compatibles.map((x) => x.ref)) !== JSON.stringify(c.compatible_avec)) e.push('compatibilités ≠ catalogue');
      if (JSON.stringify(f).includes('achat')) e.push('prix d’achat exposé dans la fiche');
    }
  } else e.push(`mode inconnu ${r.mode}`);
  ctrl(C, 'recalcul_catalogue', e);
  return conclure(C);
}
