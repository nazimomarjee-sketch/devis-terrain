// AGENT 08 — AUDITEUR QUALITÉ. Indépendant des exécutants : il n'importe AUCUN code d'agent.
// Contrôles déterministes uniquement (recalcul en BigInt, rapprochement de sources, lecture des fichiers).
// Un contrôle critique ne repose jamais sur la seule réponse d'un modèle IA.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { horloge } from './horloge.js';
import { detecterInjection, detecterSecrets } from './confiance.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const CODES_BLOCAGE = new Set(['CLIENT_INCONNU', 'CLIENT_AMBIGU', 'REFERENCE_INCONNUE', 'REFERENCE_AMBIGUE', 'CONDITIONNEMENT',
  'TARIF_MANQUANT', 'QUANTITE_INVALIDE', 'REMISE_HORS_PLAFOND', 'DEMANDE_INCOMPRISE']);

// --- Arithmétique décimale exacte (BigInt), écrite indépendamment de l'agent ---
function centimes(txt) {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(txt));
  if (!m) throw new Error(`décimal invalide : ${txt}`);
  return BigInt(m[1]) * 100n + BigInt(((m[2] ?? '') + '00').slice(0, 2));
}
const demiSuperieur = (n, d) => (2n * n + d) / (2n * d);

function eur(c) {
  const v = c < 0 ? -c : c;
  const s = String(v);
  const e = s.length > 2 ? s.slice(0, -2) : '0';
  const dec = s.padStart(3, '0').slice(-2);
  return `${c < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec}`;
}

function cheminSur(base, relatif) {
  if (!/^M-\d{8}-[0-9a-f]{6}\/devis\.(pdf|eml)$/.test(relatif)) return null;
  const complet = resolve(base, relatif);
  return complet.startsWith(resolve(base) + sep) ? complet : null;
}

function textesPdf(buf) {
  const s = buf.toString('latin1');
  const out = [];
  const re = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1].replace(/\\([()\\])/g, '$1'));
  return out;
}

function corpsMail(buf) {
  const t = buf.toString('utf8');
  const m = /Content-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+?)\r?\n--JARVISBOUNDARY/.exec(t);
  return { entetes: t.split(/\r?\n\r?\n/)[0], corps: m ? Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8') : null, brut: t };
}

const estEntier = (n) => Number.isSafeInteger(n);
const estTexte = (s) => typeof s === 'string' && s.length > 0;

function verifierStructure(r) {
  const e = [];
  if (!r || typeof r !== 'object') return ['résultat absent ou illisible'];
  if (r.type !== 'devis') e.push('type attendu : devis');
  for (const k of ['numero_provisoire', 'date', 'remise_pct', 'tva_pct', 'statut_document']) if (!estTexte(r[k])) e.push(`champ texte manquant : ${k}`);
  for (const k of ['total_ht_cents', 'tva_cents', 'total_ttc_cents']) if (!estEntier(r[k])) e.push(`montant non entier : ${k}`);
  if (!r.client || !estTexte(r.client.id) || !estTexte(r.client.nom)) e.push('client incomplet');
  if (!Array.isArray(r.lignes) || r.lignes.length === 0) e.push('aucune ligne');
  else {
    r.lignes.forEach((l, i) => {
      for (const k of ['qte', 'pu_ht_cents', 'brut_cents', 'remise_cents', 'net_cents']) if (!estEntier(l?.[k])) e.push(`ligne ${i + 1} : ${k} non entier`);
      if (!estTexte(l?.ref)) e.push(`ligne ${i + 1} : référence manquante`);
    });
  }
  if (!Array.isArray(r.avertissements)) e.push('avertissements absents');
  if (!r.fichiers?.pdf?.chemin || !r.fichiers?.eml?.chemin) e.push('fichiers PDF/mail absents');
  return e;
}

/** Contrôle d'un devis. Retourne { verdict, controles[], echecs[] }. */
export function auditerDevis({ mission, resultat: r, donnees, params, dossierSorties }) {
  const controles = [];
  const ajouter = (nom, erreurs) => controles.push({ nom, ok: erreurs.length === 0, detail: erreurs });

  const errStruct = verifierStructure(r);
  ajouter('structure', errStruct);
  if (errStruct.length) return conclure(controles);

  // Provenance du client : doit exister dans la base, nom identique (aucune identité inventée).
  const cl = donnees.clients.clients.find((c) => c.id === r.client.id);
  ajouter('provenance_client', !cl ? [`client ${r.client.id} inexistant dans la base`] : cl.nom !== r.client.nom ? ['nom du client différent de la base'] : cl.email !== r.client.email ? ['email du client différent de la base'] : []);

  // Provenance des références et des prix.
  const errRef = [];
  const refs = new Map(donnees.catalogue.references.map((x) => [x.ref, x]));
  for (const l of r.lignes) {
    const c = refs.get(l.ref);
    if (!c) { errRef.push(`référence ${l.ref} inexistante`); continue; }
    if (c.prix_ht == null) errRef.push(`${l.ref} : aucun tarif en base, prix inventé`);
    else if (BigInt(l.pu_ht_cents) !== centimes(c.prix_ht)) errRef.push(`${l.ref} : prix ${l.pu_ht_cents} ≠ base ${centimes(c.prix_ht)}`);
    if (c.date_prix !== l.date_prix) errRef.push(`${l.ref} : date de tarif différente de la base`);
    if (c.designation !== l.designation) errRef.push(`${l.ref} : désignation différente de la base`);
  }
  ajouter('provenance_references', errRef);

  // Conditionnements et quantités.
  const errCond = [];
  for (const l of r.lignes) {
    const c = refs.get(l.ref);
    if (l.qte < 1 || l.qte > 10000) errCond.push(`${l.ref} : quantité hors limites`);
    if (c && l.qte % c.multiple !== 0) errCond.push(`${l.ref} : ${l.qte} n’est pas un multiple de ${c.multiple}`);
  }
  ajouter('conditionnements', errCond);

  // Tarifs anciens : chaque tarif trop ancien doit être signalé (et seulement ceux-là).
  const errAnc = [];
  const aujourdhui = horloge.iso().slice(0, 10);
  const attendus = new Set();
  for (const l of r.lignes) {
    const age = Math.floor((Date.parse(aujourdhui) - Date.parse(l.date_prix)) / 86400000);
    if (age > params.anciennete_tarif_jours) attendus.add(l.ref);
  }
  const signales = new Set(r.avertissements.filter((a) => a.code === 'TARIF_ANCIEN').map((a) => a.ref));
  for (const x of attendus) if (!signales.has(x)) errAnc.push(`tarif ancien non signalé pour ${x}`);
  for (const x of signales) if (!attendus.has(x)) errAnc.push(`avertissement injustifié pour ${x}`);
  ajouter('tarifs_et_anciennete', errAnc);

  // Calcul indépendant en BigInt.
  const errCalc = [];
  try {
    const bp = centimes(r.remise_pct);
    const bpTva = centimes(r.tva_pct);
    let ht = 0n;
    r.lignes.forEach((l, i) => {
      const brut = BigInt(l.qte) * BigInt(l.pu_ht_cents);
      const rem = demiSuperieur(brut * bp, 10000n);
      if (BigInt(l.brut_cents) !== brut) errCalc.push(`ligne ${i + 1} : brut ${l.brut_cents} ≠ ${brut}`);
      if (BigInt(l.remise_cents) !== rem) errCalc.push(`ligne ${i + 1} : remise ${l.remise_cents} ≠ ${rem}`);
      if (BigInt(l.net_cents) !== brut - rem) errCalc.push(`ligne ${i + 1} : net ${l.net_cents} ≠ ${brut - rem}`);
      ht += brut - rem;
    });
    const tva = demiSuperieur(ht * bpTva, 10000n);
    if (BigInt(r.total_ht_cents) !== ht) errCalc.push(`total HT ${r.total_ht_cents} ≠ ${ht}`);
    if (BigInt(r.tva_cents) !== tva) errCalc.push(`TVA ${r.tva_cents} ≠ ${tva}`);
    if (BigInt(r.total_ttc_cents) !== ht + tva) errCalc.push(`total TTC ${r.total_ttc_cents} ≠ ${ht + tva}`);
  } catch (e) {
    errCalc.push(`calcul impossible : ${e.message}`);
  }
  ajouter('calculs', errCalc);

  // Règles métier : remise = celle de la fiche client, sous le plafond ; TVA = paramètre autorisé.
  const errRegle = [];
  if (cl && r.remise_pct !== cl.remise_pct) errRegle.push(`remise appliquée ${r.remise_pct} % ≠ fiche client ${cl.remise_pct} %`);
  try { if (centimes(r.remise_pct) > centimes(params.remise_max_pct)) errRegle.push('remise au-dessus du plafond autorisé'); } catch { errRegle.push('remise illisible'); }
  if (r.tva_pct !== params.tva_pct) errRegle.push(`TVA ${r.tva_pct} % ≠ paramètre autorisé ${params.tva_pct} %`);
  ajouter('regles_metier', errRegle);

  // Couverture de la demande : mêmes quantités demandées et facturées (aucune ligne omise ni inventée).
  const partieArticles = mission.demande.split(':').slice(1).join(':');
  const demandees = [...partieArticles.matchAll(/(?<![\w-])(\d+)\s*(?:x\s+)?(?=[A-Za-zÀ-ÿ])/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
  const facturees = r.lignes.map((l) => l.qte).sort((a, b) => a - b);
  ajouter('couverture_demande', JSON.stringify(demandees) === JSON.stringify(facturees) ? [] : [`quantités demandées ${JSON.stringify(demandees)} ≠ facturées ${JSON.stringify(facturees)}`]);

  // Mentions : jamais présenté comme enregistré dans EBP.
  const errEbp = [];
  if (r.ebp_enregistre !== false) errEbp.push('le devis est présenté comme enregistré dans EBP');
  if (r.statut_document !== 'BROUILLON_NON_ENREGISTRE_EBP') errEbp.push('statut du document inattendu');
  ajouter('mentions_ebp', errEbp);

  // Fichiers réels : existence, empreinte, contenu cohérent avec le résultat.
  const errFic = [];
  let texteSortie = JSON.stringify({ avertissements: r.avertissements });
  try {
    const cp = cheminSur(dossierSorties, r.fichiers.pdf.chemin);
    const ce = cheminSur(dossierSorties, r.fichiers.eml.chemin);
    if (!cp || !ce || !r.fichiers.pdf.chemin.startsWith(`${mission.id}/`) || !r.fichiers.eml.chemin.startsWith(`${mission.id}/`)) errFic.push('chemin de fichier invalide');
    else if (!existsSync(cp) || !existsSync(ce)) errFic.push('fichier PDF ou mail introuvable');
    else {
      const pdf = readFileSync(cp);
      const eml = readFileSync(ce);
      if (sha(pdf) !== r.fichiers.pdf.sha256) errFic.push('empreinte PDF modifiée');
      if (sha(eml) !== r.fichiers.eml.sha256) errFic.push('empreinte mail modifiée');
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-')) || !pdf.toString('latin1').trimEnd().endsWith('%%EOF')) errFic.push('PDF invalide');
      const tp = textesPdf(pdf).join('\n');
      texteSortie += `\n${tp}`;
      if (!tp.includes('NON ENREGISTR')) errFic.push('PDF sans la mention « NON ENREGISTRÉ DANS EBP »');
      if (!tp.includes(`TOTAL TTC : ${eur(BigInt(r.total_ttc_cents))} EUR`)) errFic.push('total TTC du PDF différent du résultat');
      if (!tp.includes(r.client.nom)) errFic.push('client du PDF différent du résultat');
      const m = corpsMail(eml);
      if (!/X-Jarvis-Statut: BROUILLON/.test(m.entetes)) errFic.push('mail non marqué BROUILLON');
      if (!m.corps) errFic.push('corps du mail illisible');
      else {
        texteSortie += `\n${m.corps}`;
        if (!m.corps.includes(eur(BigInt(r.total_ttc_cents)))) errFic.push('montant du mail différent du résultat');
        if (cl?.notes && cl.notes.length > 10 && m.corps.includes(cl.notes)) errFic.push('notes internes du client recopiées dans le mail');
      }
      if (!new RegExp(`^To: ${r.client.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(m.entetes)) errFic.push('destinataire du mail différent du client');
    }
  } catch (e) {
    errFic.push(`lecture des fichiers impossible : ${e.message}`);
  }
  ajouter('fichiers', errFic);

  // Aucun ordre injecté ni secret dans ce qui sera envoyé.
  const inj = detecterInjection(texteSortie);
  const sec = detecterSecrets(texteSortie);
  ajouter('injection_secrets', [...inj.map((x) => `instruction suspecte dans la sortie (${x})`), ...sec.map((x) => `secret dans la sortie (${x})`)]);

  return conclure(controles);
}

/** Un blocage de l'agent n'est accepté que s'il est motivé, connu et interroge l'humain. */
export function auditerBlocage({ blocage, donnees }) {
  const erreurs = [];
  if (!CODES_BLOCAGE.has(blocage.code)) erreurs.push(`code de blocage inconnu : ${blocage.code}`);
  if (!estTexte(blocage.raison)) erreurs.push('raison manquante');
  if (!estTexte(blocage.question)) erreurs.push('question à l’humain manquante');
  if (blocage.candidats) {
    const ids = new Set([...donnees.clients.clients.map((c) => c.id), ...donnees.catalogue.references.map((x) => x.ref)]);
    for (const c of blocage.candidats) if (!ids.has(c)) erreurs.push(`candidat inventé : ${c}`);
  }
  return conclure([{ nom: 'blocage_justifie', ok: erreurs.length === 0, detail: erreurs }], 'BLOQUE');
}

function conclure(controles, verdictSiOk = 'VALIDE') {
  const echecs = controles.filter((c) => !c.ok).flatMap((c) => c.detail.map((d) => `${c.nom} : ${d}`));
  return { verdict: echecs.length ? 'A_CORRIGER' : verdictSiOk, controles, echecs, horodatage: horloge.iso() };
}
