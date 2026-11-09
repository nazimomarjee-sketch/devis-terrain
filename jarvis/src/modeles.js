// Point d'extension IA HYBRIDE. Fournisseurs interchangeables (en ligne, local…), essayés dans l'ordre configuré.
// Règles non négociables :
//  - un modèle ne fait que PROPOSER une reformulation d'une demande incomprise : il n'exécute rien, ne calcule aucun montant ;
//  - il ne reçoit QUE le texte de la demande de l'utilisateur (données personnelles masquées), jamais les jeux de données ;
//  - sa sortie est validée (agent connu de l'espace, longueur bornée, aucune instruction suspecte) puis présentée à l'humain ;
//  - chaque appel est facturé au budget ; budget atteint ou fournisseur en panne → JARVIS continue en mode déterministe ;
//  - aucun fournisseur réel n'est branché dans ce dépôt : ce module définit l'interface et les garde-fous.
import { journaliser } from './db.js';
import { autorise } from './regles.js';
import { horloge } from './horloge.js';
import { enregistrerDepense, budgetAtteint } from './moteur.js';
import { detecterInjection, detecterSecrets, masquer } from './confiance.js';

export class Interpreteur {
  /**
   * @param fournisseurs  { nom: { appeler: async ({ demande, agents }) => ({ agent, reformulation }), coutCents } }
   * @param ordre         ordre d'essai, ex. ['local', 'en_ligne'] (le local d'abord : gratuit et privé ; l'en ligne en secours)
   */
  constructor({ fournisseurs, ordre, seuilDisjoncteur = 3, pauseDisjoncteurMs = 60_000 }) {
    this.fournisseurs = fournisseurs; this.ordre = ordre ?? Object.keys(fournisseurs);
    this.seuil = seuilDisjoncteur; this.pause = pauseDisjoncteurMs; this.sante = {}; // nom -> { echecs, ouvertJusqua, dernierSucces }
  }

  /** État pour le tableau de bord : les fonctions locales ne dépendent JAMAIS de ces fournisseurs. */
  etat(db) {
    const fournisseurs = this.ordre.map((nom) => {
      const f = this.fournisseurs[nom]; const s = this.sante[nom] ?? {};
      const statut = f?.enLigne && !autorise(db, 'ia_en_ligne') ? 'non_autorise' : s.ouvertJusqua > horloge.maintenant() ? 'hors_ligne' : s.dernierSucces ? 'ok' : 'jamais_utilise';
      return { nom, en_ligne: !!f?.enLigne, statut };
    });
    return { fournisseurs, fonctions_locales: 'ok' };
  }

  async proposer(db, missionId, demande, agentsActifs) {
    if (budgetAtteint(db)) { journaliser(db, { missionId, acteur: 'interpreteur', evenement: 'IA_IGNOREE_BUDGET', detail: {} }); return null; }
    const entree = { demande: masquer(String(demande)).slice(0, 500), agents: agentsActifs };
    for (const nom of this.ordre) {
      const f = this.fournisseurs[nom]; if (!f) continue;
      const sante = (this.sante[nom] ??= { echecs: 0, ouvertJusqua: 0, dernierSucces: 0 });
      if (f.enLigne && !autorise(db, 'ia_en_ligne')) { journaliser(db, { missionId, acteur: 'interpreteur', evenement: 'IA_EN_LIGNE_NON_AUTORISEE', detail: { fournisseur: nom } }); continue; }
      if (sante.ouvertJusqua > horloge.maintenant()) continue; // disjoncteur ouvert : Internet en panne, on ne fait PAS attendre les missions
      try {
        const sortie = await f.appeler(entree);
        sante.echecs = 0; sante.dernierSucces = horloge.maintenant();
        enregistrerDepense(db, { missionId, fournisseur: nom, cents: sortie?.coutCents ?? f.coutCents ?? 0 });
        const refus = this.#valider(sortie, agentsActifs);
        if (refus) { journaliser(db, { missionId, acteur: 'interpreteur', evenement: 'IA_SORTIE_REFUSEE', detail: { fournisseur: nom, motif: refus } }); continue; }
        journaliser(db, { missionId, acteur: 'interpreteur', evenement: 'IA_PROPOSITION', detail: { fournisseur: nom, agent: sortie.agent } });
        return { fournisseur: nom, agent: sortie.agent, reformulation: sortie.reformulation };
      } catch (e) {
        sante.echecs++; if (sante.echecs >= this.seuil) { sante.ouvertJusqua = horloge.maintenant() + this.pause; journaliser(db, { missionId, acteur: 'interpreteur', evenement: 'IA_DISJONCTEUR_OUVERT', detail: { fournisseur: nom, pause_s: this.pause / 1000 } }); }
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
