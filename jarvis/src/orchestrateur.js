// JARVIS — agent directeur. Seul coordinateur des missions.
// Chaîne : DEMANDE → PLANIFICATION → EXÉCUTION → CONTRÔLE INDÉPENDANT → CORRECTION → VALIDATION/ESCALADE → ARCHIVAGE.
// Aucune mission n'est « terminée » sur la seule déclaration d'un agent : c'est l'auditeur qui conclut.
import { join } from 'node:path';
import { transaction, journaliser, param, definirParam, sha256 } from './db.js';
import { horloge } from './horloge.js';
import {
  deposer as deposerMission, reclamer, recupererBaux, terminerSiBail, arretUrgence,
  budgetAtteint, enregistrerDepense, MAX_CORRECTIONS,
} from './moteur.js';
import { chargerDonnees, chargerParametres } from './donnees.js';
import { auditerDevis, auditerBlocage } from './auditeur.js';

const AUDITEURS = { devis: auditerDevis };

/** Agents prévus par l'architecture. Seuls ceux marqués « implemente » existent réellement. */
export const AGENTS_PREVUS = [
  { nom: 'commercial', role: 'Agent 01 — Commercial', etat: 'prevu' },
  { nom: 'devis', role: 'Agent 02 — Devis', etat: 'implemente' },
  { nom: 'finance', role: 'Agent 03 — Finance commerciale', etat: 'prevu' },
  { nom: 'produits', role: 'Agent 04 — Produits', etat: 'prevu' },
  { nom: 'developpeur', role: 'Agent 05 — Développeur', etat: 'prevu' },
  { nom: 'analyste', role: 'Agent 06 — Analyste', etat: 'prevu' },
  { nom: 'infrastructure', role: 'Agent 07 — Infrastructure et sécurité', etat: 'prevu' },
  { nom: 'auditeur', role: 'Agent 08 — Auditeur qualité', etat: 'implemente' },
];

function avecDelai(promesseFn, ms) {
  const ctrl = new AbortController();
  let timer;
  const limite = new Promise((_, ko) => {
    timer = setTimeout(() => { ctrl.abort(); ko(new Error(`Délai dépassé (${ms} ms)`)); }, ms);
  });
  return Promise.race([promesseFn(ctrl.signal), limite]).finally(() => clearTimeout(timer));
}

export class Jarvis {
  constructor({ db, agents, dossierDonnees, dossierFictif, dossierSorties, ouvrier = 'jarvis-1' }) {
    this.db = db;
    this.agents = Object.fromEntries(agents.map((a) => [a.nom, a]));
    this.dossierDonnees = dossierDonnees; // contient éventuellement le fichier ARRET
    this.dossierFictif = dossierFictif;
    this.dossierSorties = dossierSorties;
    this.ouvrier = ouvrier;
  }

  /** Dépôt générique : la SOURCE est obligatoire et refusée si elle n'est pas de confiance (échec fermé). */
  deposer(demande, { projet = 'demo', source, cle = null } = {}) {
    return deposerMission(this.db, { demande, projet, source, cle });
  }

  /** Dépôt depuis le canal authentifié de l'utilisateur (le seul qui peut donner des ordres). */
  deposerParUtilisateur(demande, { projet = 'demo', cle = null } = {}) {
    return this.deposer(demande, { projet, source: 'canal_utilisateur', cle });
  }

  choisirAgent(demande) {
    return /\bdevis\b/i.test(demande) ? 'devis' : null;
  }

  /** Une itération : récupère les missions orphelines, prend une mission, la fait exécuter puis auditer. */
  async tick() {
    const { db } = this;
    if (arretUrgence(db, this.dossierDonnees)) return { action: 'arret_urgence' };
    definirParam(db, 'battement', horloge.maintenant());
    recupererBaux(db);

    const delai = Number(param(db, 'delai_mission_ms', '30000'));
    const m = reclamer(db, this.ouvrier, delai + 30000);
    if (!m) return { action: 'rien' };

    // Planification
    const nomAgent = this.choisirAgent(m.demande);
    const agent = nomAgent ? this.agents[nomAgent] : null;
    if (!agent) {
      this.#finir(m, { statut: 'BLOQUE', raison: 'Aucun agent compétent pour cette demande.', question: 'Reformulez ou précisez le type de mission (ex. « devis pour … »).' });
      return { action: 'bloque', id: m.id };
    }
    if (!m.plan) {
      const plan = agent.plan(m);
      db.prepare('UPDATE missions SET type=?, agent=?, plan=? WHERE id=?').run(nomAgent, nomAgent, JSON.stringify(plan), m.id);
      journaliser(db, { missionId: m.id, acteur: 'jarvis', evenement: 'PLAN', detail: { agent: nomAgent, etapes: plan.length } });
    }

    // Garde-fou budgétaire AVANT tout travail.
    if (budgetAtteint(db)) {
      this.#finir(m, { statut: 'BLOQUE', raison: 'Budget journalier atteint.', question: 'Relancer la mission demain ou augmenter le budget ?' });
      journaliser(db, { missionId: m.id, acteur: 'jarvis', evenement: 'BUDGET_ATTEINT', detail: {} });
      return { action: 'bloque_budget', id: m.id };
    }

    // Exécution (délai maximum, journalisation, aucune exception ne sort).
    const donnees = chargerDonnees(this.dossierFictif);
    const params = chargerParametres(db);
    const retours = m.retours ? JSON.parse(m.retours) : [];
    let sortie;
    try {
      sortie = await avecDelai((signal) => agent.executer({ ...m, corrections: m.corrections }, {
        donnees, params, retours, signal,
        dossierSorties: this.dossierSorties,
        aujourdhui: horloge.iso().slice(0, 10),
        depenser: (cents) => enregistrerDepense(db, { missionId: m.id, fournisseur: agent.nom, cents }),
      }), delai);
    } catch (e) {
      journaliser(db, { missionId: m.id, acteur: agent.nom, evenement: 'AGENT_ERREUR', detail: { message: e.message } });
      return this.#echecOuCorrection(m, [`exécution : ${e.message}`]);
    }

    // Contrôle indépendant
    if (sortie.statut === 'BLOQUE') {
      const rap = auditerBlocage({ blocage: sortie, donnees });
      journaliser(db, { missionId: m.id, acteur: 'auditeur', evenement: 'AUDIT', detail: { verdict: rap.verdict, echecs: rap.echecs } });
      if (rap.verdict === 'A_CORRIGER') return this.#echecOuCorrection(m, rap.echecs, rap);
      this.#finir(m, { statut: 'BLOQUE', raison: sortie.raison, question: sortie.question, rapport_audit: JSON.stringify(rap) });
      return { action: 'bloque', id: m.id, code: sortie.code };
    }

    const resultat = sortie.resultat;
    const rap = AUDITEURS[agent.nom]({ mission: m, resultat, donnees, params, dossierSorties: this.dossierSorties });
    journaliser(db, { missionId: m.id, acteur: 'auditeur', evenement: 'AUDIT', detail: { verdict: rap.verdict, echecs: rap.echecs } });
    if (rap.verdict !== 'VALIDE') return this.#echecOuCorrection(m, rap.echecs, rap);

    const json = JSON.stringify(resultat);
    const statut = agent.sensible ? 'EN_ATTENTE_APPROBATION' : 'VALIDE';
    this.#finir(m, { statut, resultat: json, resultat_hash: sha256(json), rapport_audit: JSON.stringify(rap), retours: null });
    journaliser(db, { missionId: m.id, acteur: 'jarvis', evenement: statut, detail: { executions: m.executions } });
    return { action: 'termine', id: m.id, statut };
  }

  #finir(m, champs) {
    const ok = terminerSiBail(this.db, m.id, this.ouvrier, champs);
    if (ok && champs.statut) journaliser(this.db, { missionId: m.id, acteur: 'jarvis', evenement: champs.statut, detail: { raison: champs.raison ?? null } });
    return ok;
  }

  #echecOuCorrection(m, echecs, rapport = null) {
    const rap = rapport ? JSON.stringify(rapport) : null;
    if (m.corrections >= MAX_CORRECTIONS) {
      this.#finir(m, {
        statut: 'ECHEC',
        raison: `Échec après ${MAX_CORRECTIONS} corrections : intervention humaine requise. Dernières erreurs : ${echecs.slice(0, 3).join(' | ')}`,
        rapport_audit: rap,
      });
      journaliser(this.db, { missionId: m.id, acteur: 'jarvis', evenement: 'ESCALADE_HUMAINE', detail: { echecs: echecs.slice(0, 5) } });
      return { action: 'echec', id: m.id };
    }
    this.#finir(m, { statut: 'A_CORRIGER', corrections: m.corrections + 1, retours: JSON.stringify(echecs), rapport_audit: rap });
    journaliser(this.db, { missionId: m.id, acteur: 'jarvis', evenement: 'CORRECTION_DEMANDEE', detail: { correction: m.corrections + 1, echecs: echecs.slice(0, 5) } });
    return { action: 'correction', id: m.id };
  }

  async executerJusquaVide(max = 50) {
    const actions = [];
    for (let i = 0; i < max; i++) {
      const r = await this.tick();
      if (r.action === 'rien' || r.action === 'arret_urgence') break;
      actions.push(r);
    }
    return actions;
  }

  /** Décision humaine sur une action sensible. Revérifie l'intégrité et relance l'audit avant tout envoi. */
  approuver(id, decision, par = 'utilisateur') {
    const { db } = this;
    return transaction(db, () => {
      const m = db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
      if (!m) throw new Error('Mission introuvable');
      if (m.statut !== 'EN_ATTENTE_APPROBATION') throw new Error(`Décision impossible : statut ${m.statut}`);
      if (decision === 'refuser') {
        db.prepare(`UPDATE missions SET statut='REFUSE', decide_par=?, maj_le=? WHERE id=?`).run(par, horloge.iso(), id);
        journaliser(db, { missionId: id, acteur: par, evenement: 'REFUSE_PAR_HUMAIN', detail: {} });
        return { statut: 'REFUSE' };
      }
      if (decision !== 'approuver') throw new Error('Décision inconnue');
      if (sha256(m.resultat) !== m.resultat_hash) {
        journaliser(db, { missionId: id, acteur: 'securite', evenement: 'APPROBATION_REFUSEE_RESULTAT_MODIFIE', detail: {} });
        throw new Error('Le résultat a été modifié depuis l’audit : approbation refusée.');
      }
      const resultat = JSON.parse(m.resultat);
      const rap = AUDITEURS[m.agent]({
        mission: m, resultat, donnees: chargerDonnees(this.dossierFictif), params: chargerParametres(db), dossierSorties: this.dossierSorties,
      });
      if (rap.verdict !== 'VALIDE') {
        journaliser(db, { missionId: id, acteur: 'auditeur', evenement: 'REAUDIT_ECHEC_AVANT_ENVOI', detail: { echecs: rap.echecs } });
        throw new Error(`Nouvel audit négatif, envoi refusé : ${rap.echecs[0]}`);
      }
      // Le prototype N'ENVOIE JAMAIS de vrai mail : l'envoi est simulé et tracé.
      db.prepare('INSERT INTO sorties(ts, mission_id, type, simule, contenu) VALUES (?,?,?,1,?)').run(
        horloge.iso(), id, 'MAIL_ENVOI_SIMULE', JSON.stringify({ vers: resultat.client.email, piece_jointe: resultat.fichiers.pdf.chemin }),
      );
      db.prepare(`UPDATE missions SET statut='VALIDE', decide_par=?, maj_le=? WHERE id=?`).run(par, horloge.iso(), id);
      journaliser(db, { missionId: id, acteur: par, evenement: 'APPROUVE_ENVOI_SIMULE', detail: {} });
      return { statut: 'VALIDE', envoi: 'SIMULE' };
    });
  }

  relancer(id, par = 'utilisateur') {
    const r = this.db.prepare(`UPDATE missions SET statut='EN_FILE', reprises=0, corrections=0, raison=NULL, question=NULL, maj_le=? WHERE id=? AND statut IN ('BLOQUE','ECHEC')`).run(horloge.iso(), id);
    if (r.changes !== 1) throw new Error('Relance impossible (statut non bloqué ou échec)');
    journaliser(this.db, { missionId: id, acteur: par, evenement: 'RELANCE_HUMAINE', detail: {} });
    return { statut: 'EN_FILE' };
  }

  arreterTout(par = 'utilisateur') {
    definirParam(this.db, 'arret_urgence', '1');
    journaliser(this.db, { acteur: par, evenement: 'ARRET_URGENCE', detail: {} });
  }

  reprendre(par = 'utilisateur') {
    definirParam(this.db, 'arret_urgence', '0');
    journaliser(this.db, { acteur: par, evenement: 'REPRISE_APRES_ARRET', detail: {} });
  }

  fichierMission(id, nom) {
    return join(this.dossierSorties, id, nom);
  }
}
