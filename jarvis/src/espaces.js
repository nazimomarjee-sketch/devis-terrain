// Cloisonnement : trois espaces, chacun avec SON dossier, SA base, SES sorties, SES sauvegardes,
// SON jeton, SON jeton administrateur, SA clé de sauvegarde et SON port. En production, chaque espace
// est un SERVICE distinct (compte Windows distinct) : aucun processus ne voit deux espaces.
import { join, resolve, sep } from 'node:path';

const TOUS_AGENTS = ['devis', 'produits', 'prospection', 'clients', 'relances', 'commandes', 'finance', 'planification'];

export const PROFILS = {
  perso: {
    libelle: 'JARVIS personnel',
    jeu: 'perso',
    agents: ['planification'],
    portDefaut: 8170,
    description: 'Environnement privé : ses propres fichiers et missions, aucun lien avec ODICOLOR.',
  },
  odicolor: {
    libelle: 'ODICOLOR (professionnel)',
    jeu: 'odicolor',
    agents: TOUS_AGENTS,
    portDefaut: 8160,
    description: 'Environnement professionnel isolé. Données et intégrations réelles DÉSACTIVÉES sans autorisation.',
  },
  cockpit: {
    libelle: 'Cockpit carrosserie',
    jeu: 'cockpit',
    agents: ['planification'],
    portDefaut: 8180,
    description: 'Projet indépendant. Connecteur facultatif, actif uniquement sur autorisation explicite.',
  },
};

export function configurerEspace(id, { racineDonnees, racineCode, env = process.env }) {
  const profil = PROFILS[id];
  if (!profil) throw new Error(`Espace inconnu : ${id}`);
  const ID = id.toUpperCase();
  const base = resolve(racineDonnees, id);
  return {
    id,
    ...profil,
    dossier: base,
    dbChemin: join(base, 'jarvis.sqlite'),
    dossierSorties: join(base, 'sorties'),
    dossierSauvegardes: join(base, 'sauvegardes'),
    dossierJeu: join(racineCode, 'data', 'fictif', profil.jeu),
    jeton: env[`JARVIS_${ID}_TOKEN`],
    jetonAdmin: env[`JARVIS_${ID}_ADMIN_TOKEN`],
    cleSauvegarde: env[`JARVIS_${ID}_CLE_SAUVEGARDE`],
    port: Number(env[`JARVIS_${ID}_PORT`] ?? profil.portDefaut),
  };
}

/** Refuse toute configuration où deux espaces partageraient un dossier, un port, un jeton ou une clé. */
export function verifierCloisonnement(configs) {
  const erreurs = [];
  const vus = { port: new Map(), jeton: new Map(), cle: new Map(), db: new Map() };
  for (const c of configs) {
    for (const champ of ['jeton', 'jetonAdmin']) {
      if (!c[champ] || c[champ].length < 24) erreurs.push(`${c.id} : ${champ} absent ou trop court (24 caractères minimum)`);
    }
    if (c.jeton && c.jeton === c.jetonAdmin) erreurs.push(`${c.id} : le jeton utilisateur et le jeton administrateur doivent différer`);
    if (!c.cleSauvegarde || c.cleSauvegarde.length < 12) erreurs.push(`${c.id} : clé de sauvegarde absente ou trop courte (12 caractères minimum)`);
    const note = (map, valeur, nom) => {
      if (valeur === undefined) return;
      if (map.has(valeur)) erreurs.push(`${c.id} et ${map.get(valeur)} partagent le même ${nom}`);
      else map.set(valeur, c.id);
    };
    note(vus.port, c.port, 'port');
    note(vus.db, c.dbChemin, 'fichier de base');
    note(vus.jeton, c.jeton, 'jeton'); note(vus.jeton, c.jetonAdmin, 'jeton');
    note(vus.cle, c.cleSauvegarde, 'clé de sauvegarde');
  }
  for (const a of configs) for (const b of configs) {
    if (a.id !== b.id && (a.dossier === b.dossier || a.dossier.startsWith(b.dossier + sep))) erreurs.push(`${a.id} est à l'intérieur de ${b.id} (ou identique)`);
  }
  if (erreurs.length) throw new Error(`Cloisonnement invalide :\n- ${erreurs.join('\n- ')}`);
  return true;
}
