import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { charger, centimes, demiSup, eur, jours, estEntier, estTexte, conclure, ctrl, controlesGeneraux } from './commun.js';
import { detecterInjection, detecterSecrets } from '../confiance.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const cheminSur = (base, rel) => (/^M-\d{8}-[0-9a-f]{6}\/devis\.(pdf|eml)$/.test(rel) && resolve(base, rel).startsWith(resolve(base) + sep) ? resolve(base, rel) : null);
function textesPdf(buf) { const out = []; const re = /\(((?:\\.|[^\\)])*)\)\s*Tj/g; let m; const s = buf.toString('latin1'); while ((m = re.exec(s))) out.push(m[1].replace(/\\([()\\])/g, '$1')); return out; }
function corpsMail(buf) { const t = buf.toString('utf8'); const m = /Content-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+?)\r?\n--JARVISBOUNDARY/.exec(t); return { entetes: t.split(/\r?\n\r?\n/)[0], corps: m ? Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8') : null }; }

function structure(r) {
  const e = [];
  if (!r || typeof r !== 'object') return ['résultat illisible'];
  for (const k of ['numero_provisoire', 'date', 'remise_pct', 'tva_pct', 'statut_document', 'territoire', 'operation']) if (!estTexte(r[k])) e.push(`champ texte manquant : ${k}`);
  for (const k of ['total_ht_cents', 'tva_cents', 'total_ttc_cents']) if (!estEntier(r[k])) e.push(`montant non entier : ${k}`);
  if (!r.client || !estTexte(r.client.id) || !estTexte(r.client.nom)) e.push('client incomplet');
  if (!Array.isArray(r.lignes) || !r.lignes.length) e.push('aucune ligne');
  else r.lignes.forEach((l, i) => { for (const k of ['qte', 'pu_ht_cents', 'brut_cents', 'remise_cents', 'net_cents']) if (!estEntier(l?.[k])) e.push(`ligne ${i + 1} : ${k} non entier`); if ('achat_cents' in l) e.push(`ligne ${i + 1} : prix d’achat exposé`); });
  if (!Array.isArray(r.avertissements)) e.push('avertissements absents');
  if (!r.fichiers?.pdf?.chemin || !r.fichiers?.eml?.chemin) e.push('fichiers absents');
  return e;
}

export function auditerDevis({ mission, resultat: r, regles, aujourdhui, dossierSorties, dossierJeu }) {
  const C = [];
  const es = structure(r); ctrl(C, 'structure', es); if (es.length) return conclure(C);
  const cat = charger(dossierJeu, 'catalogue').lignes; const clients = charger(dossierJeu, 'clients').lignes;
  const fictif = controlesGeneraux(C, { resultat: r, regles, datasets: ['catalogue', 'clients'], dossierJeu, aujourdhui, typeAttendu: 'devis' });

  const idErr = [];
  if (r.version !== 2) idErr.push(`version ${r.version}`);
  if (r.mission_id !== mission.id) idErr.push('mission_id ≠ mission');
  if (r.numero_provisoire !== `DRAFT-${mission.id}`) idErr.push('numéro provisoire ≠ DRAFT-<mission>');
  ctrl(C, 'identifiants', idErr);
  const cl = clients.find((c) => c.id === r.client.id);
  ctrl(C, 'provenance_client', !cl ? [`client ${r.client.id} inexistant`] : [cl.nom !== r.client.nom && 'nom différent', cl.email !== r.client.email && 'email différent', cl.territoire !== r.territoire && 'territoire différent'].filter(Boolean));
  const refs = new Map(cat.map((x) => [x.ref, x]));
  const eR = []; const eC = [];
  for (const l of r.lignes) {
    const c = refs.get(l.ref);
    if (!c) { eR.push(`référence ${l.ref} inexistante`); continue; }
    if (c.prix_ht == null) eR.push(`${l.ref} : aucun tarif en base`); else if (BigInt(l.pu_ht_cents) !== centimes(c.prix_ht)) eR.push(`${l.ref} : prix ${l.pu_ht_cents} ≠ base ${centimes(c.prix_ht)}`);
    if (c.date_prix !== l.date_prix) eR.push(`${l.ref} : date de tarif différente`); if (c.designation !== l.designation) eR.push(`${l.ref} : désignation différente`);
    if (l.qte < 1 || l.qte > 10000) eC.push(`${l.ref} : quantité hors limites`); if (l.qte % c.multiple !== 0) eC.push(`${l.ref} : ${l.qte} non multiple de ${c.multiple}`);
  }
  ctrl(C, 'provenance_references', eR); ctrl(C, 'conditionnements', eC);

  // Règles : TVA du territoire/opération, remise, marge, ancienneté.
  const eRg = [];
  const opAttendue = (/devis\s+(export|autoliquidation)\b/i.exec(mission.demande)?.[1] ?? 'vente_locale').toLowerCase();
  if (r.operation !== opAttendue) eRg.push(`opération ${r.operation} ≠ ${opAttendue} (demande)`);
  const rTva = regles[`tva|${cl?.territoire}|${opAttendue}`];
  if (!rTva) eRg.push('aucune règle de TVA pour ce territoire/opération');
  else { if (r.tva_pct !== rTva.valeur.taux_pct) eRg.push(`TVA ${r.tva_pct} % ≠ règle ${rTva.valeur.taux_pct} %`); if (r.tva_regle?.statut !== rTva.statut) eRg.push('statut de règle TVA différent'); if (r.tva_regle?.type !== 'tva' || r.tva_regle?.cle !== rTva.cle) eRg.push('règle TVA citée ≠ règle appliquée'); if (r.tva_regle?.justification !== rTva.justification) eRg.push('justification de la règle TVA ≠ base'); }
  const rRem = regles['remise_max_pct|*']; const rMg = regles['marge_min_pct|*']; const rAnc = regles['tarif_ancien_jours|*'];
  if (!rRem || !rMg || !rAnc) eRg.push('règles remise/marge/ancienneté absentes');
  if (cl && r.remise_pct !== cl.remise_pct) eRg.push(`remise ${r.remise_pct} % ≠ fiche client ${cl.remise_pct} %`);
  if (cl && r.remise_justification !== (cl.remise_justification ?? '')) eRg.push('justification de remise différente');
  if (cl && centimes(cl.remise_pct) > 0n && !String(cl.remise_justification ?? '').trim()) eRg.push('remise sans justification');
  if (rRem && cl && centimes(cl.remise_pct) > centimes(rRem.valeur.pct)) eRg.push('remise au-dessus du plafond');
  ctrl(C, 'regles_metier', eRg);

  const eAnc = []; const attendus = new Set();
  if (rAnc) for (const l of r.lignes) if (jours(l.date_prix, aujourdhui) > rAnc.valeur.jours) attendus.add(l.ref);
  const signales = new Set(r.avertissements.filter((a) => a.code === 'TARIF_ANCIEN').map((a) => a.ref));
  for (const x of attendus) if (!signales.has(x)) eAnc.push(`tarif ancien non signalé : ${x}`);
  for (const x of signales) if (!attendus.has(x)) eAnc.push(`avertissement injustifié : ${x}`);
  ctrl(C, 'tarifs_et_anciennete', eAnc);

  const eCalc = [];
  try {
    const bp = centimes(r.remise_pct); let ht = 0n;
    r.lignes.forEach((l, i) => {
      const brut = BigInt(l.qte) * BigInt(l.pu_ht_cents); const rem = demiSup(brut * bp, 10000n);
      if (BigInt(l.brut_cents) !== brut) eCalc.push(`ligne ${i + 1} : brut`); if (BigInt(l.remise_cents) !== rem) eCalc.push(`ligne ${i + 1} : remise ${l.remise_cents} ≠ ${rem}`); if (BigInt(l.net_cents) !== brut - rem) eCalc.push(`ligne ${i + 1} : net`);
      ht += brut - rem;
      const c = refs.get(l.ref);
      if (c?.prix_achat_ht == null) eCalc.push(`${l.ref} : prix d’achat inconnu, marge invérifiable`);
      else if (rMg && ((brut - rem - BigInt(l.qte) * centimes(c.prix_achat_ht)) * 10000n) / (brut - rem) < centimes(rMg.valeur.pct)) eCalc.push(`${l.ref} : marge sous le seuil`);
    });
    const tva = demiSup(ht * centimes(r.tva_pct), 10000n);
    if (BigInt(r.total_ht_cents) !== ht) eCalc.push(`total HT ${r.total_ht_cents} ≠ ${ht}`); if (BigInt(r.tva_cents) !== tva) eCalc.push(`TVA ${r.tva_cents} ≠ ${tva}`); if (BigInt(r.total_ttc_cents) !== ht + tva) eCalc.push(`TTC ${r.total_ttc_cents} ≠ ${ht + tva}`);
  } catch (e) { eCalc.push(`calcul impossible : ${e.message}`); }
  ctrl(C, 'calculs', eCalc);

  const demandees = [...mission.demande.split(':').slice(1).join(':').matchAll(/(?<![\w-])(\d+)\s*(?:x\s+)?(?=[A-Za-zÀ-ÿ])/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
  const facturees = r.lignes.map((l) => l.qte).sort((a, b) => a - b);
  ctrl(C, 'couverture_demande', JSON.stringify(demandees) === JSON.stringify(facturees) ? [] : [`demandé ${JSON.stringify(demandees)} ≠ facturé ${JSON.stringify(facturees)}`]);
  ctrl(C, 'mentions_ebp', [r.ebp_enregistre !== false && 'présenté comme enregistré dans EBP', r.statut_document !== 'BROUILLON_NON_ENREGISTRE_EBP' && 'statut du document inattendu'].filter(Boolean));

  const eF = [];
  try {
    const cp = cheminSur(dossierSorties, r.fichiers.pdf.chemin); const ce = cheminSur(dossierSorties, r.fichiers.eml.chemin);
    if (!cp || !ce || !r.fichiers.pdf.chemin.startsWith(`${mission.id}/`) || !r.fichiers.eml.chemin.startsWith(`${mission.id}/`)) eF.push('chemin de fichier invalide');
    else if (!existsSync(cp) || !existsSync(ce)) eF.push('fichier introuvable');
    else {
      const pdf = readFileSync(cp); const eml = readFileSync(ce);
      if (sha(pdf) !== r.fichiers.pdf.sha256) eF.push('empreinte PDF modifiée'); if (sha(eml) !== r.fichiers.eml.sha256) eF.push('empreinte mail modifiée');
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-')) || !pdf.toString('latin1').trimEnd().endsWith('%%EOF')) eF.push('PDF invalide');
      const tp = textesPdf(pdf).join('\n');
      if (!tp.includes('NON ENREGISTR')) eF.push('PDF sans la mention « NON ENREGISTRÉ DANS EBP »');
      if (fictif && !tp.includes('FICTIFS')) eF.push('PDF sans la mention « PRIX FICTIFS »');
      if (!fictif && tp.includes('FICTIFS')) eF.push('mention fictive sur des données réelles');
      if (rTva && rTva.statut !== 'VALIDE' && !tp.includes('NON VALID')) eF.push('PDF sans la mention « TVA non validée »');
      if (!tp.includes(`TOTAL TTC : ${eur(r.total_ttc_cents)} EUR`)) eF.push('total TTC du PDF différent'); if (!tp.includes(r.client.nom)) eF.push('client du PDF différent');
      const m = corpsMail(eml);
      if (!/X-Jarvis-Statut: BROUILLON/.test(m.entetes)) eF.push('mail non marqué BROUILLON');
      if (!m.corps) eF.push('corps du mail illisible'); else {
        if (!m.corps.includes(eur(r.total_ttc_cents))) eF.push('montant du mail différent');
        if (cl?.notes && cl.notes.length > 10 && m.corps.includes(cl.notes)) eF.push('notes internes du client recopiées dans le mail');
        for (const x of detecterInjection(m.corps + tp)) eF.push(`instruction suspecte dans le document (${x})`); for (const x of detecterSecrets(m.corps + tp)) eF.push(`secret dans le document (${x})`);
      }
      if (!new RegExp(`^To: ${r.client.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(m.entetes)) eF.push('destinataire différent du client');
    }
  } catch (e) { eF.push(`lecture des fichiers impossible : ${e.message}`); }
  ctrl(C, 'fichiers', eF);
  return conclure(C);
}
