// VALIDATION DES DONNÉES avant tout calcul (échec fermé). Structure et types uniquement : les incohérences MÉTIER entre jeux
// (facture sans commande, doublon de facture, paiement orphelin…) sont le travail des agents, pas un motif de blocage.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateValide = (d) => typeof d === 'string' && DATE.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const entier = (n) => Number.isSafeInteger(n);
const entierPos = (n) => entier(n) && n >= 0;
const texte = (s, max = 500) => typeof s === 'string' && s.length > 0 && s.length <= max;
const decimal = (s) => s === null || (typeof s === 'string' && /^\d+(\.\d{1,2})?$/.test(s));
const MAX_LIGNES = 100_000;

const lignesOk = (lignes, e, ctx) => {
  if (!Array.isArray(lignes)) { e.push(`${ctx} : lignes absentes`); return; }
  lignes.forEach((l, i) => { if (!texte(l?.ref, 20)) e.push(`${ctx} ligne ${i + 1} : référence invalide`); if (!entier(l?.qte) || l.qte < 1) e.push(`${ctx} ligne ${i + 1} : quantité invalide`); if (!entierPos(l?.pu_ht_cents)) e.push(`${ctx} ligne ${i + 1} : prix unitaire invalide`); });
};
const uniques = (liste, cle, e, nom) => { const vus = new Set(); for (const x of liste) { if (vus.has(x[cle])) e.push(`${nom} : identifiant en double « ${x[cle]} »`); vus.add(x[cle]); } };

const VALIDATEURS = {
  catalogue: (L, e) => {
    uniques(L, 'ref', e, 'catalogue');
    L.forEach((r, i) => { const c = `catalogue[${i}]`; if (!texte(r.ref, 20)) e.push(`${c} : ref invalide`); if (!texte(r.designation)) e.push(`${c} : désignation invalide`); if (!entier(r.multiple) || r.multiple < 1) e.push(`${c} : conditionnement invalide`);
      if (!decimal(r.prix_ht) || !decimal(r.prix_achat_ht)) e.push(`${c} : prix invalide`); if (r.date_prix !== null && !dateValide(r.date_prix)) e.push(`${c} : date de tarif invalide`); if (!Array.isArray(r.mots) || !r.mots.every((m) => texte(m, 40))) e.push(`${c} : mots-clés invalides`); if (!Array.isArray(r.compatible_avec)) e.push(`${c} : compatibilités invalides`); });
  },
  clients: (L, e) => { uniques(L, 'id', e, 'clients'); L.forEach((c, i) => { if (!texte(c.id, 20) || !texte(c.nom) || !texte(c.territoire, 40)) e.push(`clients[${i}] : champs obligatoires invalides`); if (!decimal(c.remise_pct) || c.remise_pct === null) e.push(`clients[${i}] : remise invalide`); }); },
  devis_historique: (L, e) => { uniques(L, 'id', e, 'devis'); L.forEach((d, i) => { if (!texte(d.id, 20) || !texte(d.client_id, 20) || !dateValide(d.date) || !['envoye', 'accepte', 'refuse'].includes(d.statut)) e.push(`devis[${i}] : champs invalides`); if (d.derniere_relance !== null && !dateValide(d.derniere_relance)) e.push(`devis[${i}] : date de relance invalide`); lignesOk(d.lignes, e, `devis[${i}]`); }); },
  commandes: (L, e) => { uniques(L, 'id', e, 'commandes'); L.forEach((c, i) => { if (!texte(c.id, 20) || !texte(c.client_id, 20) || !dateValide(c.date) || !dateValide(c.statut_le) || !['preparee', 'envoyee', 'enregistree_ebp'].includes(c.statut)) e.push(`commandes[${i}] : champs invalides`); lignesOk(c.lignes, e, `commandes[${i}]`); }); },
  factures: (L, e) => { L.forEach((f, i) => { const c = `factures[${i}]`; if (!texte(f.id, 30) || !texte(f.client_id, 20) || !dateValide(f.date) || !dateValide(f.echeance)) e.push(`${c} : champs invalides`); for (const k of ['ht_cents', 'tva_cents', 'ttc_cents']) if (!entierPos(f[k])) e.push(`${c} : ${k} invalide`); if (f.derniere_relance !== null && !dateValide(f.derniere_relance)) e.push(`${c} : date de relance invalide`); lignesOk(f.lignes, e, c); }); }, // doublons d'identifiant : anomalie MÉTIER signalée par Finance
  paiements: (L, e) => { uniques(L, 'id', e, 'paiements'); L.forEach((p, i) => { if (!texte(p.id, 20) || !texte(p.facture_id, 30) || !dateValide(p.date) || !entier(p.montant_cents) || p.montant_cents <= 0) e.push(`paiements[${i}] : champs invalides`); }); },
  prospects: (L, e) => { uniques(L, 'id', e, 'prospects'); L.forEach((p, i) => { if (!texte(p.id, 20) || !texte(p.nom) || !entierPos(p.techniciens)) e.push(`prospects[${i}] : champs invalides`); if (p.dernier_contact !== null && !dateValide(p.dernier_contact)) e.push(`prospects[${i}] : date de contact invalide`); if (p.potentiel_mensuel_eur !== null && !entierPos(p.potentiel_mensuel_eur)) e.push(`prospects[${i}] : potentiel invalide`); }); },
  taches: (L, e) => { uniques(L, 'id', e, 'tâches'); L.forEach((t, i) => { if (!texte(t.id, 20) || !texte(t.titre) || !dateValide(t.echeance) || !entier(t.duree_min) || t.duree_min < 1 || t.duree_min > 1440 || !entierPos(t.valeur_eur ?? 0)) e.push(`tâches[${i}] : champs invalides`); }); },
  ordres_atelier: (L, e) => { uniques(L, 'ref', e, 'ordres'); L.forEach((o, i) => { if (!texte(o.ref, 20) || !dateValide(o.entree) || !dateValide(o.restitution) || o.restitution < o.entree) e.push(`ordres[${i}] : dates invalides`); if (typeof o.heures !== 'object' || Object.values(o.heures ?? {}).some((h) => typeof h !== 'number' || h < 0 || h > 1000)) e.push(`ordres[${i}] : heures invalides`); }); },
};

/** Retourne { ok, erreurs[] }. Un jeu invalide BLOQUE la mission (jamais de calcul sur des données douteuses). */
export function validerJeux(donnees) {
  const erreurs = [];
  for (const [nom, lignes] of Object.entries(donnees)) {
    const v = VALIDATEURS[nom]; if (!v) continue;
    if (!Array.isArray(lignes)) { erreurs.push(`${nom} : tableau attendu`); continue; }
    if (lignes.length > MAX_LIGNES) { erreurs.push(`${nom} : trop de lignes (${lignes.length})`); continue; }
    if (lignes.some((l) => l === null || typeof l !== 'object')) { erreurs.push(`${nom} : ligne non objet`); continue; }
    v(lignes, erreurs);
  }
  return { ok: erreurs.length === 0, erreurs };
}
