// Outils partagés par les agents. Les AUDITEURS n'importent jamais ce fichier (indépendance, vérifiée par un test).
import { readFileSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

export const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const GENERIQUES = new Set(['garage', 'carrosserie', 'ets', 'etablissements', 'sarl', 'sas', 'atelier']);
export const cleNom = (s) => norm(s).split(' ').filter((t) => t && !GENERIQUES.has(t)).join(' ');
export const singulier = (t) => t.replace(/s$/, '');

export function decimalVersEntier(str, facteur = 100) {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(str));
  if (!m) throw new Error(`Valeur décimale invalide : ${str}`);
  return Number(m[1]) * facteur + Number((m[2] ?? '').padEnd(2, '0') || '0') * (facteur / 100);
}
export const arrondi = (num, den) => Math.floor((2 * num + den) / (2 * den)); // demi supérieur, entiers positifs

export function formaterCentimes(c) {
  const signe = c < 0 ? '-' : '';
  const v = Math.abs(c);
  return `${signe}${String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(v % 100).padStart(2, '0')}`;
}

export const joursEntre = (de, a) => Math.floor((Date.parse(a) - Date.parse(de)) / 86400000);
export const bloque = (code, raison, question, extra = {}) => ({ statut: 'BLOQUE', code, raison, question, ...extra });

/** Règle utilisable ? VALIDE toujours ; FICTIF_DEMO seulement avec des données 100 % fictives. */
export function regleActive(ctx, type, cle) {
  const r = ctx.regles[`${type}|${cle}`] ?? ctx.regles[`${type}|*`];
  if (!r) return { blocage: bloque('REGLE_ABSENTE', `Aucune règle « ${type} » définie pour « ${cle} ».`, `Quelle règle « ${type} » appliquer pour « ${cle} » ? (à définir par l’administrateur)`) };
  if (r.statut === 'VALIDE' || (r.statut === 'FICTIF_DEMO' && ctx.fictif)) return { regle: r };
  return { blocage: bloque('REGLE_NON_VALIDEE', `La règle « ${type}|${r.cle} » n’est pas validée (statut ${r.statut}) : elle ne peut pas servir avec des données réelles.`, 'Un administrateur doit valider cette règle (justification et source).') };
}

export const citerRegle = (r) => ({ type: r.type, cle: r.cle, statut: r.statut });

export function resoudreClient(nomDemande, clients) {
  // Seule une correspondance EXACTE du nom complet (ou de l'identifiant) désigne un client : on ne devine jamais.
  const exacts = clients.filter((c) => norm(c.nom) === norm(nomDemande) || c.id.toLowerCase() === nomDemande.toLowerCase());
  if (exacts.length === 1) return { client: exacts[0] };
  const jetons = cleNom(nomDemande).split(' ').filter(Boolean);
  const proches = clients.filter((c) => jetons.length && jetons.every((j) => cleNom(c.nom).split(' ').includes(j)));
  if (proches.length === 0) return { blocage: bloque('CLIENT_INCONNU', `Aucun client ne correspond à « ${nomDemande} ».`, 'Quel est le client exact (nom ou identifiant) ?') };
  return { blocage: bloque('CLIENT_AMBIGU', `« ${nomDemande} » n’est pas le nom exact d’un client. Je ne devine pas une identité.`,
    `Lequel voulez-vous : ${proches.map((c) => `${c.nom} (${c.id})`).join(' ou ')} ?`, { candidats: proches.map((c) => c.id) }) };
}

/**
 * Erreurs volontaires GÉNÉRALES (tests de supervision). `defaut` = { mode, jusqua, ... } ; fautif tant que mission.corrections < jusqua.
 * Retourne le mode fautif actif (pour les fautes propres à l'agent) ou null.
 */
export async function fautesGenerales(defaut, mission, ctx) {
  const faute = defaut && mission.corrections < (defaut.jusqua ?? 1) ? defaut.mode : null;
  if (faute === 'exception') throw new Error('Panne volontaire de l’agent (test)');
  if (faute === 'lent') await new Promise((ok, ko) => { const t = setTimeout(ok, 60000); ctx.signal?.addEventListener('abort', () => { clearTimeout(t); ko(new Error('annulé')); }); });
  if (faute === 'depense') ctx.depenser(defaut.cents ?? 1000);
  if (faute === 'sortie_geante') return Object.assign(bloque('DEMANDE_INCOMPRISE', 'x'.repeat(3_000_000), 'x'), { _geant: true });
  if (faute === 'symlink_sortie') { mkdirSync(ctx.dossierSortie, { recursive: true }); symlinkSync(defaut.chemin, `${ctx.dossierSortie}/lien`); return null; }
  if (faute === 'remplir_disque') { mkdirSync(ctx.dossierSortie, { recursive: true }); for (let i = 0; i < 6; i++) writeFileSync(`${ctx.dossierSortie}/gros${i}`, Buffer.alloc(8 * 1024 * 1024, 1)); return null; }
  if (faute === 'tuer_processus') { try { process.kill(defaut.pid, 'SIGKILL'); } catch (e) { throw new Error(`kill refusé : ${e.code ?? e.message}`); } throw new Error('FUITE : kill réussi'); }
  if (faute === 'memoire') { try { Buffer.alloc(1.5 * 1024 ** 3, 1); } catch (e) { throw new Error(`mémoire refusée : ${String(e.message).slice(0, 40)}`); } throw new Error('FUITE : 1,5 Go alloués'); }
  if (faute === 'espionner_donnees') throw new Error(`DONNEES:${Object.keys(ctx.donnees).sort().join(',')}`);
  if (faute === 'espionner_env') throw new Error(`ENV:${Object.keys(process.env).sort().join(',')}`);
  if (faute === 'ecriture_interdite') {
    try { writeFileSync(defaut.chemin, 'x'); } catch (e) { throw new Error(`écriture refusée : ${e.code ?? e.message}`); }
    throw new Error('FUITE : l’écriture hors périmètre a réussi');
  }
  if (faute === 'processus_enfant') {
    try { execSync('id'); } catch (e) { throw new Error(`processus refusé : ${e.code ?? e.message.slice(0, 40)}`); }
    throw new Error('FUITE : un processus enfant a été lancé');
  }
  if (faute === 'reseau') {
    try { await fetch(defaut.url); } catch (e) { throw new Error(`réseau : ${e.cause?.code ?? e.code ?? e.message}`); }
    throw new Error('RESEAU_JOIGNABLE');
  }
  if (faute === 'lecture_interdite') {
    try { readFileSync(defaut.chemin, 'utf8'); } catch (e) { throw new Error(`lecture refusée : ${e.code ?? e.message}`); }
    throw new Error('FUITE : la lecture hors périmètre a réussi');
  }
  return faute;
}
