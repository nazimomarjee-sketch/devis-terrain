// Point d'extension IA HYBRIDE. Fournisseurs interchangeables (en ligne, local…), essayés dans l'ordre configuré.
// Règles non négociables :
//  - un modèle ne fait que PROPOSER une reformulation d'une demande incomprise : il n'exécute rien, ne calcule aucun montant ;
//  - il ne reçoit QUE le texte de la demande de l'utilisateur (données personnelles masquées), jamais les jeux de données ;
//  - sa sortie est validée (agent connu de l'espace, longueur bornée, aucune instruction suspecte) puis présentée à l'humain ;
//  - chaque appel est facturé au budget ; budget atteint ou fournisseur en panne → JARVIS continue en mode déterministe ;
//  - aucun fournisseur réel n'est branché dans ce dépôt : ce module définit l'interface et les garde-fous.
import { journaliser } from './db.js';
import { enregistrerDepense, budgetAtteint } from './moteur.js';
import { detecterInjection, detecterSecrets, masquer } from './confiance.js';

export class Interpreteur {
  /**
   * @param fournisseurs  { nom: { appeler: async ({ demande, agents }) => ({ agent, reformulation }), coutCents } }
   * @param ordre         ordre d'essai, ex. ['local', 'en_ligne'] (le local d'abord : gratuit et privé ; l'en ligne en secours)
   */
  constructor({ fournisseurs, ordre }) { this.fournisseurs = fournisseurs; this.ordre = ordre ?? Object.keys(fournisseurs); }

  async proposer(db, missionId, demande, agentsActifs) {
    if (budgetAtteint(db)) { journaliser(db, { missionId, acteur: 'interpreteur', evenement: 'IA_IGNOREE_BUDGET', detail: {} }); return null; }
    const entree = { demande: masquer(String(demande)).slice(0, 500), agents: agentsActifs };
    for (const nom of this.ordre) {
      const f = this.fournisseurs[nom]; if (!f) continue;
      try {
        const sortie = await f.appeler(entree);
        enregistrerDepense(db, { missionId, fournisseur: nom, cents: f.coutCents ?? 0 });
        const refus = this.#valider(sortie, agentsActifs);
        if (refus) { journaliser(db, { missionId, acteur: 'interpreteur', evenement: 'IA_SORTIE_REFUSEE', detail: { fournisseur: nom, motif: refus } }); continue; }
        journaliser(db, { missionId, acteur: 'interpreteur', evenement: 'IA_PROPOSITION', detail: { fournisseur: nom, agent: sortie.agent } });
        return { fournisseur: nom, agent: sortie.agent, reformulation: sortie.reformulation };
      } catch (e) {
        journaliser(db, { missionId, acteur: 'interpreteur', evenement: 'IA_FOURNISSEUR_INDISPONIBLE', detail: { fournisseur: nom, message: String(e.message).slice(0, 120) } });
      }
    }
    return null;
  }

  #valider(s, agentsActifs) {
    if (!s || typeof s !== 'object') return 'sortie illisible';
    if (!agentsActifs.includes(s.agent)) return `agent « ${s.agent} » inconnu ou indisponible dans cet espace`;
    if (typeof s.reformulation !== 'string' || s.reformulation.length < 5 || s.reformulation.length > 300) return 'reformulation absente ou hors limites';
    if (detecterInjection(s.reformulation).length || detecterSecrets(s.reformulation).length) return 'instruction ou secret détecté dans la sortie du modèle';
    return null;
  }
}
