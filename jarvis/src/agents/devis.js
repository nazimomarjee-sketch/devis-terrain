// AGENT 02 — Devis. Prépare un BROUILLON de devis (PDF + mail). N'envoie rien, n'écrit pas dans EBP.
// Tous les montants sont calculés en entiers (centimes) : aucun calcul d'argent n'est confié à un modèle IA.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { genererPdf } from '../pdf.js';
import { horloge } from '../horloge.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const GENERIQUES = new Set(['garage', 'carrosserie', 'ets', 'etablissements', 'sarl', 'sas', 'atelier']);
const cleNom = (s) => norm(s).split(' ').filter((t) => t && !GENERIQUES.has(t)).join(' ');
const singulier = (t) => t.replace(/s$/, '');

export function decimalVersEntier(str, facteur = 100) {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(str));
  if (!m) throw new Error(`Valeur décimale invalide : ${str}`);
  return Number(m[1]) * facteur + Number((m[2] ?? '').padEnd(2, '0') || '0') * (facteur / 100);
}

const arrondi = (num, den) => Math.floor((2 * num + den) / (2 * den)); // arrondi « demi supérieur », entiers positifs

export function formaterCentimes(c) {
  const signe = c < 0 ? '-' : '';
  const v = Math.abs(c);
  const entier = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${signe}${entier},${String(v % 100).padStart(2, '0')}`;
}

function parserDemande(texte) {
  const m = texte.match(/devis\s+(?:pour|au|à|a)\s+(?:le\s+|la\s+|l['’]\s*)?(.+?)\s*:\s*(.+)$/is);
  if (!m) return null;
  const items = m[2]
    .replace(/[.\s]+$/, '')
    .split(/\s*(?:,|;|\bet\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const q = p.match(/^(\d{1,5})\s*(?:x\s+)?(.+)$/i);
      return q ? { qte: Number(q[1]), terme: q[2].trim() } : { qte: null, terme: p };
    });
  return { client: m[1].trim(), items };
}

const bloque = (code, raison, question, extra = {}) => ({ statut: 'BLOQUE', code, raison, question, ...extra });

function resoudreClient(nomDemande, clients) {
  // Seule une correspondance EXACTE du nom complet (ou de l'identifiant) désigne un client.
  // Un nom partiel (« Martin ») peut viser plusieurs clients : on demande, on ne devine jamais.
  const exacts = clients.filter((c) => norm(c.nom) === norm(nomDemande) || c.id.toLowerCase() === nomDemande.toLowerCase());
  if (exacts.length === 1) return { client: exacts[0] };
  const jetons = cleNom(nomDemande).split(' ').filter(Boolean);
  const proches = clients.filter((c) => jetons.length && jetons.every((j) => cleNom(c.nom).split(' ').includes(j)));
  if (proches.length === 0) {
    return { blocage: bloque('CLIENT_INCONNU', `Aucun client ne correspond à « ${nomDemande} ».`, 'Quel est le client exact (nom ou identifiant) ?') };
  }
  return {
    blocage: bloque('CLIENT_AMBIGU', `« ${nomDemande} » n’est pas le nom exact d’un client. Je ne devine pas une identité.`,
      `Lequel voulez-vous : ${proches.map((c) => `${c.nom} (${c.id})`).join(' ou ')} ?`, { candidats: proches.map((c) => c.id) }),
  };
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
  return {
    blocage: bloque('REFERENCE_AMBIGUE', `« ${item.terme} » correspond à plusieurs articles.`,
      `Lequel : ${trouvees.map((r) => `${r.ref} (${r.designation})`).join(' ou ')} ?`, { candidats: trouvees.map((r) => r.ref) }),
  };
}

function ageJours(datePrix, aujourdhui) {
  return Math.floor((Date.parse(aujourdhui) - Date.parse(datePrix)) / 86400000);
}

function texteMail(res) {
  return [
    'Bonjour,',
    '',
    `Veuillez trouver ci-joint le devis provisoire ${res.numero_provisoire} d'un montant de ${formaterCentimes(res.total_ttc_cents)} EUR TTC.`,
    '',
    'Ce document est un brouillon préparé par JARVIS : il n’est pas enregistré dans EBP et n’a pas valeur de devis officiel tant qu’il n’est pas confirmé.',
    '',
    'Cordialement,',
  ].join('\n');
}

function lignesPdf(res, fictif) {
  const L = [];
  L.push('BROUILLON — NON ENREGISTRÉ DANS EBP');
  if (fictif) L.push('DONNEES FICTIVES — DEMONSTRATION');
  L.push('', `Devis provisoire : ${res.numero_provisoire}`, `Date : ${res.date}`, `Client : ${res.client.nom} (${res.client.id})`, '');
  L.push('REF       DESIGNATION                     QTE      PU HT   REMISE    NET HT');
  for (const l of res.lignes) {
    L.push(`${l.ref.padEnd(9)} ${l.designation.slice(0, 30).padEnd(30)} ${String(l.qte).padStart(5)} ${formaterCentimes(l.pu_ht_cents).padStart(8)} ${formaterCentimes(l.remise_cents).padStart(8)} ${formaterCentimes(l.net_cents).padStart(9)}`);
  }
  L.push('', `Remise client appliquée : ${res.remise_pct} %`, `TOTAL HT : ${formaterCentimes(res.total_ht_cents)} EUR`,
    `TVA ${res.tva_pct} % : ${formaterCentimes(res.tva_cents)} EUR`, `TOTAL TTC : ${formaterCentimes(res.total_ttc_cents)} EUR`);
  if (res.avertissements.length) {
    L.push('', 'AVERTISSEMENTS');
    for (const a of res.avertissements) L.push(`- ${a.message}`);
  }
  return L;
}

function construireEml(res, corps, pdf) {
  const b64 = (buf) => buf.toString('base64').replace(/(.{76})/g, '$1\r\n');
  const sujet = `=?UTF-8?B?${Buffer.from(`Devis provisoire ${res.numero_provisoire}`).toString('base64')}?=`;
  return [
    'From: Jarvis Demo <demo@jarvis.invalid>',
    `To: ${res.client.email}`,
    `Subject: ${sujet}`,
    `Date: ${new Date(horloge.maintenant()).toUTCString()}`,
    'MIME-Version: 1.0',
    'X-Jarvis-Statut: BROUILLON',
    `X-Jarvis-Mission: ${res.mission_id}`,
    'Content-Type: multipart/mixed; boundary="JARVISBOUNDARY"',
    '',
    '--JARVISBOUNDARY',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(Buffer.from(corps, 'utf8')),
    '--JARVISBOUNDARY',
    'Content-Type: application/pdf; name="devis.pdf"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="devis.pdf"',
    '',
    b64(pdf),
    '--JARVISBOUNDARY--',
    '',
  ].join('\r\n');
}

/**
 * @param defaut  Injection d'erreur VOLONTAIRE pour les tests : { mode, jusqua } — fautif tant que mission.corrections < jusqua.
 */
export function creerAgentDevis({ defaut = null } = {}) {
  return {
    nom: 'devis',
    role: 'Agent 02 — Devis',
    sensible: true, // un devis préparé exige toujours l'approbation humaine avant envoi
    plan() {
      return [
        { etape: 'identifier le client', critere: 'client trouvé sans ambiguïté dans la base' },
        { etape: 'retrouver les références', critere: 'chaque article correspond à une référence unique du catalogue' },
        { etape: 'vérifier conditionnements et tarifs', critere: 'quantités valides, tarifs présents, datés et signalés si anciens' },
        { etape: 'calculer les montants', critere: 'calcul en entiers, remise et TVA autorisées' },
        { etape: 'contrôle indépendant', critere: 'auditeur déterministe : recalcul, provenance, fichiers' },
        { etape: 'préparer PDF et brouillon de mail', critere: 'fichiers conformes, mention « non enregistré dans EBP »' },
        { etape: 'attendre l’approbation humaine', critere: 'aucun envoi avant validation' },
      ];
    },

    async executer(mission, ctx) {
      const faute = defaut && mission.corrections < (defaut.jusqua ?? 1) ? defaut.mode : null;
      if (faute === 'exception') throw new Error('Panne volontaire de l’agent (test)');
      if (faute === 'lent') await new Promise((ok, ko) => { const t = setTimeout(ok, 60000); ctx.signal?.addEventListener('abort', () => { clearTimeout(t); ko(new Error('annulé')); }); });
      if (faute === 'depense') ctx.depenser(defaut.cents ?? 1000);

      const demande = parserDemande(mission.demande);
      if (!demande || demande.items.length === 0) {
        return bloque('DEMANDE_INCOMPRISE', 'Je ne retrouve pas le client et les articles dans la demande.',
          'Reformulez : « devis pour <client> : <quantité> <article>, … »');
      }
      const { clients } = ctx.donnees.clients;
      const { references } = ctx.donnees.catalogue;

      const rc = resoudreClient(demande.client, clients);
      if (rc.blocage) return rc.blocage;
      const client = { ...rc.client };

      const bpRemise = decimalVersEntier(client.remise_pct);
      if (bpRemise > decimalVersEntier(ctx.params.remise_max_pct)) {
        return bloque('REMISE_HORS_PLAFOND', `La remise du client (${client.remise_pct} %) dépasse le plafond autorisé (${ctx.params.remise_max_pct} %).`,
          'Faut-il corriger la fiche client ou valider une dérogation ?');
      }

      const lignes = [];
      const avertissements = [];
      for (const it of demande.items) {
        if (!Number.isInteger(it.qte) || it.qte < 1 || it.qte > 10000) {
          return bloque('QUANTITE_INVALIDE', `Quantité invalide pour « ${it.terme} ».`, 'Quelle quantité (entier entre 1 et 10 000) ?');
        }
        const rr = resoudreReference(it, references);
        if (rr.blocage) return rr.blocage;
        const ref = rr.ref;
        if (it.qte % ref.multiple !== 0) {
          return bloque('CONDITIONNEMENT', `${ref.ref} se vend par multiples de ${ref.multiple} : ${it.qte} n’est pas possible.`,
            `Quelle quantité (multiple de ${ref.multiple}) pour ${ref.ref} ?`);
        }
        if (ref.prix_ht == null) {
          return bloque('TARIF_MANQUANT', `Aucun tarif de vente pour ${ref.ref}. Je n’invente jamais un prix.`, `Quel est le tarif de vente valide pour ${ref.ref} ?`);
        }
        const age = ageJours(ref.date_prix, ctx.aujourdhui);
        if (age > ctx.params.anciennete_tarif_jours) {
          avertissements.push({ code: 'TARIF_ANCIEN', ref: ref.ref, age_jours: age, date_prix: ref.date_prix,
            message: `Tarif de ${ref.ref} daté du ${ref.date_prix} (${age} jours) : à vérifier avant envoi.` });
        }
        lignes.push({ ref: ref.ref, designation: ref.designation, qte: it.qte, pu_ht_cents: decimalVersEntier(ref.prix_ht), date_prix: ref.date_prix });
      }

      if (faute === 'prix_faux') lignes[0].pu_ht_cents += 100;
      if (faute === 'ligne_omise' && lignes.length > 1) lignes.pop();
      if (faute === 'avertissement_masque') avertissements.length = 0;

      const bp = faute === 'remise_ignoree' ? 0 : bpRemise;
      let totalHt = 0;
      for (const l of lignes) {
        l.brut_cents = l.qte * l.pu_ht_cents;
        l.remise_cents = arrondi(l.brut_cents * bp, 10000);
        l.net_cents = l.brut_cents - l.remise_cents;
        totalHt += l.net_cents;
      }
      const tva = arrondi(totalHt * decimalVersEntier(ctx.params.tva_pct), 10000);

      const res = {
        type: 'devis',
        version: 1,
        mission_id: mission.id,
        statut_document: 'BROUILLON_NON_ENREGISTRE_EBP',
        ebp_enregistre: false,
        donnees_fictives: ctx.donnees.fictif,
        numero_provisoire: `DRAFT-${mission.id}`,
        date: ctx.aujourdhui,
        client: { id: faute === 'client_invente' ? 'C999' : client.id, nom: client.nom, email: client.email },
        remise_pct: client.remise_pct,
        tva_pct: ctx.params.tva_pct,
        lignes,
        total_ht_cents: totalHt,
        tva_cents: tva,
        total_ttc_cents: totalHt + tva + (faute === 'total_faux' ? 1 : 0),
        avertissements,
      };

      let corps = texteMail(res);
      if (faute === 'copie_notes') corps += `\n\nNote client : ${client.notes}`;
      const pdf = genererPdf(lignesPdf(res, ctx.donnees.fictif));
      const eml = Buffer.from(construireEml(res, corps, pdf), 'utf8');

      mkdirSync(join(ctx.dossierSorties, mission.id), { recursive: true });
      writeFileSync(join(ctx.dossierSorties, mission.id, 'devis.pdf'), pdf);
      writeFileSync(join(ctx.dossierSorties, mission.id, 'devis.eml'), eml);
      res.fichiers = {
        pdf: { chemin: `${mission.id}/devis.pdf`, sha256: sha(pdf) },
        eml: { chemin: `${mission.id}/devis.eml`, sha256: sha(eml) },
      };
      return { statut: 'OK', resultat: res };
    },
  };
}
