// Règles de confiance : seules les instructions venues du canal authentifié de l'utilisateur
// sont des ordres. Tout le reste (mails, PDF, sites, notes clients) est une DONNÉE.

export const SOURCES_DE_CONFIANCE = new Set(['canal_utilisateur']);

export function sourceAutorisee(source) {
  return SOURCES_DE_CONFIANCE.has(source);
}

const MOTIFS_INJECTION = [
  [/ignore[zr]?\s+(?:tes|vos|les|toutes?\s+les)?\s*(?:consignes|instructions|règles|regles)/i, 'ignore-consignes'],
  [/ignore\s+(?:(?:all|any|previous|prior|the above|your)\s+)+(?:instructions|rules|prompts?)/i, 'ignore-instructions-en'],
  [/(?:oublie|oubliez)\s+(?:tout|tes|vos)\b/i, 'oublie-tout'],
  [/system\s*prompt|prompt\s*syst[eè]me/i, 'prompt-systeme'],
  [/(?:envoie|envoyez|transf[eè]re|transmets|exporte)[^.\n]{0,60}(?:liste|base|fichier|mot de passe|donn[ée]es)/i, 'exfiltration'],
  [/(?:send|forward|export|email)[^.\n]{0,60}(?:list|database|passwords?|credentials)/i, 'exfiltration-en'],
  [/nouvelles?\s+(?:consignes?|instructions?)/i, 'nouvelles-consignes'],
];

/** Retourne la liste des motifs d'injection détectés dans un texte (vide si rien). */
export function detecterInjection(texte) {
  const t = String(texte ?? '');
  return MOTIFS_INJECTION.filter(([re]) => re.test(t)).map(([, nom]) => nom);
}

const MOTIFS_SECRETS = [
  [/\bsk-[A-Za-z0-9_-]{16,}/, 'cle-api'],
  [/\bAKIA[0-9A-Z]{12,}/, 'cle-aws'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'cle-privee'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}/, 'jeton-bearer'],
  [/(?:password|mot de passe|mdp)\s*[:=]\s*\S{4,}/i, 'mot-de-passe'],
];

export function detecterSecrets(texte) {
  const t = String(texte ?? '');
  return MOTIFS_SECRETS.filter(([re]) => re.test(t)).map(([, nom]) => nom);
}

const MASQUES = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, '[iban]'],
  [/(?:\+|00)\d[\d .-]{8,}\d|\b0\d(?:[ .-]?\d{2}){4}\b/g, '[tel]'],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, '[secret]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}/g, 'Bearer [secret]'],
];

/** Masque les données personnelles et secrets avant écriture dans les journaux. */
export function masquer(valeur) {
  if (typeof valeur === 'string') {
    return MASQUES.reduce((s, [re, rempl]) => s.replace(re, rempl), valeur);
  }
  if (Array.isArray(valeur)) return valeur.map(masquer);
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, masquer(v)]));
  }
  return valeur;
}
