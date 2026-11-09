// AGENT — Devis. Prépare un BROUILLON de devis (PDF + mail). N'envoie rien, n'écrit pas dans EBP.
// Calculs en entiers (centimes). TVA, remise et marge dépendent de RÈGLES justifiées et validées (jamais codées en dur).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { genererPdf } from '../pdf.js';
import { horloge } from '../horloge.js';
import { norm, singulier, decimalVersEntier, arrondi, formaterCentimes, joursEntre, bloque, regleActive, citerRegle, resoudreClient, fautesGenerales } from './commun.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');

function parserDemande(texte) {
  const m = texte.match(/devis(?:\s+(export|autoliquidation))?\s+(?:pour|au|à|a)\s+(?:le\s+|la\s+|l['’]\s*)?(.+?)\s*:\s*(.+)$/is);
  if (!m) return null;
  const items = m[3].replace(/[.\s]+$/, '').split(/\s*(?:,|;|\bet\b)\s*/i).map((p) => p.trim()).filter(Boolean).map((p) => {
    const q = p.match(/^(\d{1,5})\s*(?:x\s+)?(.+)$/i);
    return q ? { qte: Number(q[1]), terme: q[2].trim() } : { qte: null, terme: p };
  });
  return { operation: (m[1] ?? 'vente_locale').toLowerCase(), client: m[2].trim(), items };
}

function resoudreReference(item, references) {
  if (/^[A-Za-z]{3}-[A-Za-z0-9]{3,6}$/.test(item.terme)) {
    const r = references.find((x) => x.ref.toLowerCase() === item.terme.toLowerCase());
    return r ? { ref: r } : { blocage: bloque('REFERENCE_INCONNUE', `Référence « ${item.terme} » introuvable.`, 'Quelle est la bonne référence ?') };
  }
  const t = singulier(norm(item.terme));
  const trouvees = references.filter((r) => r.mots.some((m) => singulier(norm(m)) === t));
  if (trouvees.length === 1) return { ref: trouvees[0] };
  if (trouvees.length === 0) return { blocage: bloque('REFERENCE_INCONNUE', `Aucun article ne correspond à « ${item.terme} ».`, 'Quelle référence voulez-vous ?') };
  return { blocage: bloque('REFERENCE_AMBIGUE', `« ${item.terme} » correspond à plusieurs articles.`,
    `Lequel : ${trouvees.map((r) => `${r.ref} (${r.designation})`).join(' ou ')} ?`, { candidats: trouvees.map((r) => r.ref) }) };
}

function lignesPdf(res) {
  const L = ['BROUILLON — NON ENREGISTRÉ DANS EBP'];
  if (res.donnees_fictives) L.push('PRIX ET DONNEES FICTIFS — DEMONSTRATION : ce document n’est PAS un tarif réel');
  if (res.tva_regle.statut !== 'VALIDE') L.push('TVA : règle de démonstration NON VALIDÉE');
  L.push('', `Devis provisoire : ${res.numero_provisoire}`, `Date : ${res.date}`, `Client : ${res.client.nom} (${res.client.id})`, `Territoire : ${res.territoire} — opération : ${res.operation}`, '');
  L.push('REF       DESIGNATION                     QTE      PU HT   REMISE    NET HT');
  for (const l of res.lignes) {
    L.push(`${l.ref.padEnd(9)} ${l.designation.slice(0, 30).padEnd(30)} ${String(l.qte).padStart(5)} ${formaterCentimes(l.pu_ht_cents).padStart(8)} ${formaterCentimes(l.remise_cents).padStart(8)} ${formaterCentimes(l.net_cents).padStart(9)}`);
  }
  L.push('', `Remise client : ${res.remise_pct} % (${res.remise_justification || 'aucune'})`, `TOTAL HT : ${formaterCentimes(res.total_ht_cents)} EUR`,
    `TVA ${res.tva_pct} % : ${formaterCentimes(res.tva_cents)} EUR`, `TOTAL TTC : ${formaterCentimes(res.total_ttc_cents)} EUR`);
  if (res.avertissements.length) { L.push('', 'AVERTISSEMENTS'); for (const a of res.avertissements) L.push(`- ${a.message}`); }
  return L;
}

function construireEml(res, corps, pdf) {
  const b64 = (buf) => buf.toString('base64').replace(/(.{76})/g, '$1\r\n');
  const sujet = `=?UTF-8?B?${Buffer.from(`Devis provisoire ${res.numero_provisoire}`).toString('base64')}?=`;
  return ['From: Jarvis Demo <demo@jarvis.invalid>', `To: ${res.client.email}`, `Subject: ${sujet}`, `Date: ${new Date(horloge.maintenant()).toUTCString()}`,
    'MIME-Version: 1.0', 'X-Jarvis-Statut: BROUILLON', `X-Jarvis-Mission: ${res.mission_id}`, 'Content-Type: multipart/mixed; boundary="JARVISBOUNDARY"', '',
    '--JARVISBOUNDARY', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(Buffer.from(corps, 'utf8')),
    '--JARVISBOUNDARY', 'Content-Type: application/pdf; name="devis.pdf"', 'Content-Transfer-Encoding: base64', 'Content-Disposition: attachment; filename="devis.pdf"', '', b64(pdf),
    '--JARVISBOUNDARY--', ''].join('\r\n');
}

export function creerAgentDevis({ defaut = null } = {}) {
  return {
    nom: 'devis',
    role: 'Devis',
    description: 'Prépare, vérifie et présente les devis (brouillon PDF + mail), sans jamais envoyer.',
    droits: { lire: ['catalogue', 'clients', 'regles'], ecrire: ['sortie_mission'], reseau: false, envoyer: false },
    criteres: ['Montants identiques au recalcul indépendant (0 écart)', 'Aucun client ni référence ni prix inventé', 'Tarifs anciens toujours signalés', 'TVA, remise et marge issues de règles validées', 'Aucun envoi sans validation humaine'],
    plan() {
      return [
        { etape: 'identifier le client', critere: 'nom exact dans la base, sans ambiguïté' },
        { etape: 'vérifier les règles (TVA, remise, marge)', critere: 'règles existantes, justifiées et utilisables' },
        { etape: 'retrouver les références', critere: 'référence unique, conditionnement valide, tarif présent' },
        { etape: 'calculer les montants', critere: 'entiers, marge au-dessus du seuil' },
        { etape: 'contrôle indépendant', critere: 'recalcul, provenance, fichiers' },
        { etape: 'préparer PDF et brouillon de mail', critere: 'mentions « non enregistré dans EBP » et « fictif » si besoin' },
        { etape: 'attendre l’approbation humaine', critere: 'aucun envoi avant validation' },
      ];
    },

    async executer(mission, ctx) {
      const faute = await fautesGenerales(defaut, mission, ctx);
      if (faute && typeof faute === 'object') return faute;
      const { clients, catalogue: references } = ctx.donnees;

      const demande = parserDemande(mission.demande);
      if (!demande || demande.items.length === 0) {
        return bloque('DEMANDE_INCOMPRISE', 'Je ne retrouve pas le client et les articles dans la demande.', 'Reformulez : « devis pour <client> : <quantité> <article>, … »');
      }
      const rc = resoudreClient(demande.client, clients);
      if (rc.blocage) return rc.blocage;
      const client = { ...rc.client };

      // Règles : aucune valeur n'est supposée.
      const cleTva = `${client.territoire}|${demande.operation}`;
      const rTva = ctx.regles[`tva|${cleTva}`];
      if (!rTva) return bloque('TVA_REGLE_ABSENTE', `Aucune règle de TVA pour le territoire « ${client.territoire} » et l’opération « ${demande.operation} ». Je ne devine pas un taux.`, `Quelle règle de TVA pour « ${cleTva} » ? (à définir et valider par un administrateur)`);
      if (!(rTva.statut === 'VALIDE' || (rTva.statut === 'FICTIF_DEMO' && ctx.fictif))) return bloque('TVA_REGLE_NON_VALIDEE', `La règle de TVA « ${cleTva} » n’est pas validée.`, 'Un administrateur doit valider cette règle avant tout devis sur des données réelles.');
      const rRemise = regleActive(ctx, 'remise_max_pct', '*'); if (rRemise.blocage) return rRemise.blocage;
      const rMarge = regleActive(ctx, 'marge_min_pct', '*'); if (rMarge.blocage) return rMarge.blocage;
      const rAnc = regleActive(ctx, 'tarif_ancien_jours', '*'); if (rAnc.blocage) return rAnc.blocage;

      const bpRemise = decimalVersEntier(client.remise_pct);
      if (bpRemise > decimalVersEntier(rRemise.regle.valeur.pct)) return bloque('REMISE_HORS_PLAFOND', `La remise du client (${client.remise_pct} %) dépasse le plafond configuré (${rRemise.regle.valeur.pct} %).`, 'Faut-il corriger la fiche client ou valider une dérogation ?');
      if (bpRemise > 0 && !String(client.remise_justification ?? '').trim()) return bloque('REMISE_NON_JUSTIFIEE', `Le client a une remise de ${client.remise_pct} % sans justification enregistrée.`, 'Quelle est la justification de cette remise (accord cadre, volume…) ?');

      const lignes = []; const avertissements = [];
      for (const it of demande.items) {
        if (!Number.isInteger(it.qte) || it.qte < 1 || it.qte > 10000) return bloque('QUANTITE_INVALIDE', `Quantité invalide pour « ${it.terme} ».`, 'Quelle quantité (entier entre 1 et 10 000) ?');
        const rr = resoudreReference(it, references); if (rr.blocage) return rr.blocage;
        const ref = rr.ref;
        if (it.qte % ref.multiple !== 0) return bloque('CONDITIONNEMENT', `${ref.ref} se vend par multiples de ${ref.multiple} : ${it.qte} n’est pas possible.`, `Quelle quantité (multiple de ${ref.multiple}) pour ${ref.ref} ?`);
        if (ref.prix_ht == null) return bloque('TARIF_MANQUANT', `Aucun tarif de vente pour ${ref.ref}. Je n’invente jamais un prix.`, `Quel est le tarif de vente valide pour ${ref.ref} ?`);
        if (ref.prix_achat_ht == null) return bloque('PRIX_ACHAT_ABSENT', `Prix d’achat inconnu pour ${ref.ref} : la marge ne peut pas être vérifiée.`, `Quel est le prix d’achat de ${ref.ref} ?`);
        const age = joursEntre(ref.date_prix, ctx.aujourdhui);
        if (age > rAnc.regle.valeur.jours) avertissements.push({ code: 'TARIF_ANCIEN', ref: ref.ref, age_jours: age, date_prix: ref.date_prix, message: `Tarif de ${ref.ref} daté du ${ref.date_prix} (${age} jours) : à vérifier avant envoi.` });
        lignes.push({ ref: ref.ref, designation: ref.designation, qte: it.qte, pu_ht_cents: decimalVersEntier(ref.prix_ht), achat_cents: decimalVersEntier(ref.prix_achat_ht), date_prix: ref.date_prix });
      }
      if (faute === 'prix_faux') lignes[0].pu_ht_cents += 100;
      if (faute === 'ligne_omise' && lignes.length > 1) lignes.pop();
      if (faute === 'avertissement_masque') avertissements.length = 0;

      const bp = faute === 'remise_ignoree' ? 0 : bpRemise;
      const seuilBp = decimalVersEntier(rMarge.regle.valeur.pct);
      let totalHt = 0;
      for (const l of lignes) {
        l.brut_cents = l.qte * l.pu_ht_cents;
        l.remise_cents = arrondi(l.brut_cents * bp, 10000);
        l.net_cents = l.brut_cents - l.remise_cents;
        const marge = l.net_cents - l.qte * l.achat_cents;
        if (faute !== 'marge_ignoree' && Math.trunc((marge * 10000) / l.net_cents) < seuilBp) {
          return bloque('MARGE_SOUS_SEUIL', `La marge de ${l.ref} après remise est sous le seuil configuré (${rMarge.regle.valeur.pct} %).`, 'Valider une dérogation de marge, ou changer la remise ou l’article ?');
        }
        totalHt += l.net_cents;
      }
      const tauxBp = decimalVersEntier(rTva.valeur.taux_pct);
      const tva = arrondi(totalHt * tauxBp, 10000);
      const lignesSortie = lignes.map(({ achat_cents, ...l }) => l); // le prix d'achat ne figure jamais sur un devis

      const res = {
        type: 'devis', version: 2, mission_id: mission.id, statut_document: 'BROUILLON_NON_ENREGISTRE_EBP', ebp_enregistre: false, action_sensible: true,
        donnees_fictives: ctx.fictif, numero_provisoire: `DRAFT-${mission.id}`, date: ctx.aujourdhui,
        client: { id: faute === 'client_invente' ? 'C999' : client.id, nom: client.nom, email: client.email },
        territoire: client.territoire, operation: demande.operation,
        remise_pct: client.remise_pct, remise_justification: client.remise_justification ?? '',
        tva_pct: rTva.valeur.taux_pct, tva_regle: { ...citerRegle(rTva), justification: rTva.justification },
        regles_utilisees: [citerRegle(rTva), citerRegle(rRemise.regle), citerRegle(rMarge.regle), citerRegle(rAnc.regle)],
        lignes: lignesSortie, total_ht_cents: totalHt, tva_cents: tva, total_ttc_cents: totalHt + tva + (faute === 'total_faux' ? 1 : 0), avertissements,
      };
      let corps = ['Bonjour,', '', `Veuillez trouver ci-joint le devis provisoire ${res.numero_provisoire} d'un montant de ${formaterCentimes(res.total_ttc_cents)} EUR TTC.`, '',
        'Ce document est un brouillon préparé par JARVIS : il n’est pas enregistré dans EBP et n’a pas valeur de devis officiel tant qu’il n’est pas confirmé.', '', 'Cordialement,'].join('\n');
      if (faute === 'copie_notes') corps += `\n\nNote client : ${client.notes}`;
      const pdf = genererPdf(lignesPdf(res));
      const eml = Buffer.from(construireEml(res, corps, pdf), 'utf8');
      mkdirSync(ctx.dossierSortie, { recursive: true });
      writeFileSync(join(ctx.dossierSortie, 'devis.pdf'), pdf);
      writeFileSync(join(ctx.dossierSortie, 'devis.eml'), eml);
      res.fichiers = { pdf: { chemin: `${mission.id}/devis.pdf`, sha256: sha(pdf) }, eml: { chemin: `${mission.id}/devis.eml`, sha256: sha(eml) } };
      return { statut: 'OK', resultat: res };
    },
  };
}
