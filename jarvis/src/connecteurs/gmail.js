// Connecteur Gmail — BROUILLONS UNIQUEMENT. L'interface N'A PAS de méthode d'envoi (absence testée) : un brouillon est créé dans une boîte
// SYNTHÉTIQUE locale (fichiers .eml), jamais envoyé. Idempotent par clé : le fichier porte le nom de la clé.
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { exiger } from '../regles.js';
import { IntegrationNonDeveloppee } from '../integrations.js';

export function connecteurGmail({ db, mode = 'synthetique', dossierBoite }) {
  if (mode === 'reel') { exiger(db, 'integration:gmail'); throw new IntegrationNonDeveloppee('gmail'); }
  const dossier = join(dossierBoite, 'brouillons'); mkdirSync(dossier, { recursive: true });
  return {
    nom: 'gmail', mode,
    async executer(action, charge, cle) {
      if (action !== 'CREER_BROUILLON') throw new Error(`Action non autorisée pour ce connecteur : ${action}`); // aucune autre action n'existe (pas d'envoi)
      if (!/^[A-Za-z0-9._-]{8,80}$/.test(cle)) throw new Error('clé d’idempotence invalide');
      if (!/^[^@\s]+@[^@\s]+\.invalid$/.test(String(charge.vers))) throw new Error('destinataire non synthétique refusé (.invalid exigé en mode synthétique)');
      const eml = Buffer.from(String(charge.eml_base64), 'base64').toString('utf8');
      if (!/^X-Jarvis-Statut: BROUILLON/m.test(eml)) throw new Error('le message n’est pas marqué BROUILLON');
      writeFileSync(join(dossier, `${cle}.eml`), eml, { flag: 'w' }); // même clé → même fichier : rejouer ne duplique rien
    },
    lireBrouillons: () => readdirSync(dossier).filter((f) => f.endsWith('.eml')).map((f) => ({ fichier: f, contenu: readFileSync(join(dossier, f), 'utf8') })),
    existe: (cle) => existsSync(join(dossier, `${cle}.eml`)),
  };
}
