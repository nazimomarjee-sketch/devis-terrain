// JARVIS — orchestrateur. Seul à attribuer les missions. Chaîne : DEMANDE → PLAN → EXÉCUTION (agent isolé) →
// CONTRÔLE INDÉPENDANT → CORRECTION (3 max) → VALIDATION HUMAINE ou ESCALADE → ARCHIVAGE.
// Le statut vient de l'auditeur, jamais de la déclaration de l'agent. L'orchestrateur ne se donne AUCUN droit :
// droits des agents, règles et autorisations ne sont modifiables que par l'administrateur via l'API.
import { join } from 'node:path';
import { rmSync, readFileSync } from 'node:fs';
import { transaction, journaliser, param, definirParam, sha256 } from './db.js';
import { horloge } from './horloge.js';
import { deposer as deposerMission, reclamer, recupererBaux, terminerSiBail, arretUrgence, budgetAtteint, enregistrerDepense, MAX_CORRECTIONS } from './moteur.js';
import { chargerJeux } from './donnees.js';
import { amorcerRegles, reglesEnDict, autorise, listerAutorisations, AutorisationRequise } from './regles.js';
import { FABRIQUES, NOMS_AGENTS } from './agents/index.js';
import { AUDITEURS, auditerUnBlocage } from './auditeurs/index.js';
import { SENSIBLE_PAR_TYPE } from './auditeurs/commun.js';
import { executerDirect, executerIsole } from './executeur.js';
import { attester, enregistrerAttestation, confinementSuffisantPourReel } from './confinement.js';
import { autotestAuditeurs } from './autotest.js';
import { validerJeux } from './validation.js';
import { enfiler } from './outbox.js';
import { router } from './routage.js';

export class Jarvis {
  /**
   * @param espace   configuration d'espace (voir espaces.js) : dossier, dossierJeu, dossierSorties, agents…
   * @param agents   [{ nom, options }] — options = erreurs volontaires pour les tests ; défaut : agents de l'espace
   * @param isolation true = chaque agent dans un processus restreint (production) ; false = direct (tests rapides)
   */
  constructor({ db, espace, agents = null, isolation = false, racineCode, ouvrier = 'jarvis-1', interpreteur = null, confinement = { backend: 'permission' } }) {
    this.interpreteur = interpreteur;
    this.confinement = confinement;
    this.auditeurSain = null; // null = pas encore testé ; true/false après l'auto-test
    this.db = db;
    this.espace = espace;
    this.dossierDonnees = espace.dossier;
    this.dossierJeu = espace.dossierJeu;
    this.dossierSorties = espace.dossierSorties;
    this.isolation = isolation;
    this.racineCode = racineCode;
    this.ouvrier = ouvrier;
    const demandes = agents ?? espace.agents.map((nom) => ({ nom }));
    this.options = {};
    this.agents = {};
    for (const { nom, options } of demandes) {
      if (!espace.agents.includes(nom)) throw new Error(`L'agent « ${nom} » n'est pas autorisé dans l'espace « ${espace.id} »`);
      this.options[nom] = options ?? {};
      this.agents[nom] = FABRIQUES[nom](options ?? {});
    }
    amorcerRegles(db, espace.dossierJeu);
  }

  /** Description publique des agents (rôle, droits, critères) pour le tableau de bord. */
  descriptionAgents() {
    return NOMS_AGENTS.map((nom) => {
      const a = FABRIQUES[nom]();
      const actif = !!this.agents[nom];
      return { nom, role: a.role, description: a.description, droits: a.droits, criteres: a.criteres, etat: actif ? 'actif' : 'non disponible dans cet espace' };
    }).concat([{ nom: 'auditeur', role: 'Auditeur indépendant', description: 'Contrôle chaque résultat par recalcul depuis les sources ; n’importe aucun code d’agent.', droits: { lire: ['sources en lecture seule'], ecrire: ['rapport d’audit'], reseau: false, envoyer: false }, criteres: ['Détecte toute erreur introduite volontairement', 'Ne se fie jamais au rapport de l’agent'], etat: 'actif' }]);
  }

  /** Attestation du confinement par sondes d'accès interdits ; le résultat conditionne le traitement de données réelles. */
  async attester() { const att = await attester({ backend: this.confinement.backend, utilisateurAgent: this.confinement.utilisateurAgent, lanceur: this.confinement.lanceur, dossierEchange: this.confinement.dossierEchange ? `${this.confinement.dossierEchange}-attestation` : null, dossierSortieAttestation: this.confinement.dossierSortieAttestation ?? null }); enregistrerAttestation(this.db, att); return att; }

  /** Auto-test de l'auditeur sur le jeu canari. Défaillance ⇒ échec fermé (plus de validation ni d'approbation). */
  async autotester() {
    const r = await autotestAuditeurs({ agents: Object.keys(this.agents) });
    const avant = this.auditeurSain; this.auditeurSain = r.ok;
    definirParam(this.db, 'autotest_auditeur', JSON.stringify({ ok: r.ok, date: horloge.iso(), echecs: r.echecs, verifies: r.verifies }));
    if (avant !== r.ok) journaliser(this.db, { acteur: 'autotest', evenement: r.ok ? 'AUDITEUR_SAIN' : 'AUDITEUR_DEFAILLANT', detail: { echecs: r.echecs.slice(0, 5) } });
    return r;
  }

  deposer(demande, { projet = 'demo', source, cle = null } = {}) { return deposerMission(this.db, { demande, projet, source, cle }); }
  deposerParUtilisateur(demande, { projet = 'demo', cle = null } = {}) { return this.deposer(demande, { projet, source: 'canal_utilisateur', cle }); }

  #autorisationsActives() { return listerAutorisations(this.db).filter((a) => autorise(this.db, a.type)).map((a) => a.type); }
  #enAttente() { return this.db.prepare(`SELECT id, demande FROM missions WHERE statut='EN_ATTENTE_APPROBATION' ORDER BY rowid`).all().map((m) => ({ id: m.id, demande: m.demande })); }

  async tick() {
    const { db } = this;
    if (arretUrgence(db, this.dossierDonnees)) return { action: 'arret_urgence' };
    definirParam(db, 'battement', horloge.maintenant());
    if (this.auditeurSain === false) return { action: 'auditeur_defaillant' }; // échec fermé : aucune mission n'est prise sans auditeur fiable
    recupererBaux(db);
    const delai = Number(param(db, 'delai_mission_ms', '30000'));
    const m = reclamer(db, this.ouvrier, delai + Number(param(db, 'marge_bail_ms', '30000')));
    if (!m) return { action: 'rien' };

    // Attribution
    const r = router(m.demande, Object.keys(this.agents));
    if (!r.agent) {
      const motifs = { AUCUN_AGENT: ['Aucun agent compétent pour cette demande.', 'Reformulez ou précisez le type de mission (devis, catalogue, prospects, dossier client, relances, commande, finance, planning).'],
        AMBIGU: [`Demande ambiguë entre plusieurs agents : ${r.candidats?.join(', ')}.`, `Lequel voulez-vous : ${r.candidats?.join(' ou ')} ?`],
        AGENT_NON_DISPONIBLE: [`L’agent « ${r.candidats?.[0]} » n’est pas disponible dans l’espace « ${this.espace.id} ».`, 'Cette demande relève d’un autre espace (cloisonnement).'] }[r.raison];
      let question = motifs[1];
      if (r.raison === 'AUCUN_AGENT' && this.interpreteur) {
        // Le modèle ne fait que PROPOSER : la proposition est soumise à l'humain, jamais exécutée.
        const prop = await this.interpreteur.proposer(db, m.id, m.demande, Object.keys(this.agents));
        if (prop) question = `${motifs[1]} Proposition de reformulation (${prop.fournisseur}, agent ${prop.agent}) : « ${prop.reformulation} » — à confirmer par vous.`;
      }
      this.#finir(m, { statut: 'BLOQUE', raison: motifs[0], question });
      return { action: 'bloque', id: m.id, code: r.raison };
    }
    const agent = this.agents[r.agent];
    if (!m.plan) {
      const plan = agent.plan(m);
      db.prepare('UPDATE missions SET type=?, agent=?, plan=? WHERE id=?').run(r.agent, r.agent, JSON.stringify(plan), m.id);
      journaliser(db, { missionId: m.id, acteur: 'jarvis', evenement: 'PLAN', detail: { agent: r.agent, etapes: plan.length, droits_lecture: agent.droits.lire } });
    }
    if (budgetAtteint(db)) {
      this.#finir(m, { statut: 'BLOQUE', raison: 'Budget journalier atteint.', question: 'Relancer la mission demain ou augmenter le budget ?' });
      journaliser(db, { missionId: m.id, acteur: 'jarvis', evenement: 'BUDGET_ATTEINT', detail: {} });
      return { action: 'bloque_budget', id: m.id };
    }

    // Données : UNIQUEMENT les jeux déclarés par l'agent (+ règles). Connecteur cockpit : seulement si autorisé.
    const noms = agent.droits.lire.filter((n) => !['regles', 'missions_en_attente'].includes(n) && (n !== 'ordres_atelier' || autorise(db, 'connecteur:cockpit')));
    let jeux;
    try { jeux = chargerJeux(this.dossierJeu, noms, { db }); } catch (e) {
      if (e instanceof AutorisationRequise) {
        this.#finir(m, { statut: 'BLOQUE', raison: 'Données réelles non autorisées dans cet espace.', question: `Un administrateur doit accorder l’autorisation « ${e.type} » (avec sa portée) pour traiter des données réelles.` });
        return { action: 'bloque_autorisation', id: m.id };
      }
      throw e;
    }
    const v = validerJeux(jeux.donnees);
    if (!v.ok) {
      this.#finir(m, { statut: 'BLOQUE', raison: `Données incohérentes : ${v.erreurs.length} erreur(s) de structure (ex. ${v.erreurs[0]}).`, question: 'Corriger la source de données (aucun calcul n’est fait sur des données douteuses).' });
      journaliser(db, { missionId: m.id, acteur: 'validation', evenement: 'DONNEES_REFUSEES', detail: { erreurs: v.erreurs.slice(0, 5), total: v.erreurs.length } });
      return { action: 'bloque_donnees', id: m.id };
    }
    if (!jeux.fictif && !confinementSuffisantPourReel(db, { backend: this.confinement.backend, isolation: this.isolation })) {
      this.#finir(m, { statut: 'BLOQUE', raison: 'Confinement des agents insuffisant pour des données réelles.', question: 'Aucune attestation récente de niveau « os » (compte distinct, réseau coupé, ressources limitées) : exécuter l’attestation sur la machine cible, ou rester en mode démonstration.' });
      journaliser(db, { missionId: m.id, acteur: 'securite', evenement: 'REEL_REFUSE_CONFINEMENT_INSUFFISANT', detail: {} });
      return { action: 'bloque_confinement', id: m.id };
    }
    if (agent.droits.lire.includes('missions_en_attente')) jeux.donnees.missions_en_attente = this.#enAttente();
    const ctx = { donnees: jeux.donnees, regles: reglesEnDict(db), fictif: jeux.fictif, retours: m.retours ? JSON.parse(m.retours) : [], aujourdhui: horloge.aujourdhui(), dossierSortie: join(this.dossierSorties, m.id) };
    const mission = { id: m.id, demande: m.demande, corrections: m.corrections };

    let sortie; let depenses;
    try { ({ sortie, depenses } = await this.#executerAgent(r.agent, mission, ctx, delai, ctx.dossierSortie)); } catch (e) {
      journaliser(db, { missionId: m.id, acteur: agent.nom, evenement: 'AGENT_ERREUR', detail: { message: e.message } });
      // Erreur de TAILLE = déterministe : la rejouer ne change rien. Blocage immédiat avec explication (pas de 3 corrections inutiles).
      if (/trop volumineuse|quota disque|quota dépassé|trop de fichiers/i.test(e.message)) { // couvre le contrôle périodique ET le contrôle final de la sortie
        this.#finir(m, { statut: 'BLOQUE', raison: 'Résultat trop volumineux pour être traité en une fois.', question: 'Réduire le périmètre de la demande (période, client, famille) : le volume dépasse les limites de sécurité de l’exécution.' });
        journaliser(db, { missionId: m.id, acteur: 'jarvis', evenement: 'RESULTAT_TROP_VOLUMINEUX', detail: {} });
        return { action: 'bloque', id: m.id, code: 'RESULTAT_TROP_VOLUMINEUX' };
      }
      return this.#echecOuCorrection(m, [`exécution : ${e.message}`]);
    }
    for (const c of depenses) enregistrerDepense(db, { missionId: m.id, fournisseur: agent.nom, cents: c });

    // Contrôle indépendant
    if (sortie.statut === 'BLOQUE') {
      const rap = auditerUnBlocage(sortie, this.dossierJeu);
      journaliser(db, { missionId: m.id, acteur: 'auditeur', evenement: 'AUDIT', detail: { verdict: rap.verdict, echecs: rap.echecs } });
      if (rap.verdict === 'A_CORRIGER') return this.#echecOuCorrection(m, rap.echecs, rap);
      this.#finir(m, { statut: 'BLOQUE', raison: sortie.raison, question: sortie.question, rapport_audit: JSON.stringify(rap) });
      return { action: 'bloque', id: m.id, code: sortie.code };
    }
    const resultat = sortie.resultat;
    const rap = this.#auditer(r.agent, m, resultat);
    journaliser(db, { missionId: m.id, acteur: 'auditeur', evenement: 'AUDIT', detail: { verdict: rap.verdict, echecs: rap.echecs } });
    if (rap.verdict !== 'VALIDE') return this.#echecOuCorrection(m, rap.echecs, rap);

    // Double exécution de contrôle : deux exécutions identiques d'un agent déterministe DOIVENT donner le même résultat.
    // Détecte ce que l'auditeur ne voit pas (champs libres, code d'agent altéré, non-déterminisme).
    const mode = param(db, 'double_execution', 'non');
    if (mode === 'toutes' || (mode === 'sensibles' && SENSIBLE_PAR_TYPE[resultat.type])) {
      let seconde;
      try { seconde = await this.#executerAgent(r.agent, mission, ctx, delai, `${ctx.dossierSortie}.verif`); } catch (e) { journaliser(db, { missionId: m.id, acteur: agent.nom, evenement: 'AGENT_ERREUR', detail: { message: `double exécution : ${e.message}` } }); return this.#echecOuCorrection(m, [`double exécution : ${e.message}`]); }
      try { rmSync(`${ctx.dossierSortie}.verif`, { recursive: true, force: true }); } catch { /* ignoré */ }
      for (const c of seconde.depenses) enregistrerDepense(db, { missionId: m.id, fournisseur: agent.nom, cents: c });
      const norm = (x) => JSON.stringify({ ...x, fichiers: undefined });
      if (seconde.sortie.statut !== 'OK' || norm(seconde.sortie.resultat) !== norm(resultat)) {
        journaliser(db, { missionId: m.id, acteur: 'jarvis', evenement: 'RESULTATS_CONTRADICTOIRES', detail: { agent: r.agent } });
        return this.#echecOuCorrection(m, ['résultats contradictoires entre deux exécutions identiques de l’agent']);
      }
    }
    const json = JSON.stringify(resultat);
    const statut = SENSIBLE_PAR_TYPE[resultat.type] ? 'EN_ATTENTE_APPROBATION' : 'VALIDE'; // décidé par la table de l'auditeur, pas par l'agent
    this.#finir(m, { statut, resultat: json, resultat_hash: sha256(json), rapport_audit: JSON.stringify(rap), retours: null }, { executions: m.executions, type: resultat.type });
    return { action: 'termine', id: m.id, statut };
  }

  async #executerAgent(nomAgent, mission, ctx, delai, dossierSortie) {
    const c = { ...ctx, dossierSortie };
    return this.isolation
      ? executerIsole({ nomAgent, options: this.options[nomAgent], mission, ctx: c, dossierSortie, racineCode: this.racineCode, delaiMs: delai, confinement: this.confinement, dossierEspace: this.dossierDonnees })
      : executerDirect({ nomAgent, options: this.options[nomAgent], mission, ctx: c, delaiMs: delai });
  }

  /** Missions sensibles arrivées au stade d'approbation, retrouvées par identifiant (pour vérifier un instantané déclaré). */
  #validationsDeclarees(resultat) {
    const ids = Array.isArray(resultat?.validations_prises_en_compte) ? resultat.validations_prises_en_compte.filter((x) => /^M-\d{8}-[0-9a-f]{6}$/.test(x)) : [];
    return ids.map((id) => this.db.prepare(`SELECT id, demande, resultat_hash, statut FROM missions WHERE id=? AND statut IN ('EN_ATTENTE_APPROBATION','VALIDE','REFUSE') AND resultat_hash IS NOT NULL`).get(id)).filter(Boolean).map((r) => ({ id: r.id, demande: r.demande }));
  }

  #auditer(nomAgent, m, resultat) {
    return AUDITEURS[nomAgent]({
      mission: { id: m.id, demande: m.demande }, resultat, regles: reglesEnDict(this.db), aujourdhui: horloge.aujourdhui(),
      dossierSorties: this.dossierSorties, dossierJeu: this.dossierJeu, missionsEnAttente: this.#validationsDeclarees(resultat), autorisations: this.#autorisationsActives(),
    });
  }

  #finir(m, champs, detail = {}) {
    const ok = terminerSiBail(this.db, m.id, this.ouvrier, champs);
    if (ok && champs.statut) journaliser(this.db, { missionId: m.id, acteur: 'jarvis', evenement: champs.statut, detail: { raison: champs.raison ?? null, ...detail } });
    return ok;
  }

  #echecOuCorrection(m, echecs, rapport = null) {
    const rap = rapport ? JSON.stringify(rapport) : null;
    if (m.corrections >= MAX_CORRECTIONS) {
      this.#finir(m, { statut: 'ECHEC', raison: `Échec après ${MAX_CORRECTIONS} corrections : intervention humaine requise. Dernières erreurs : ${echecs.slice(0, 3).join(' | ')}`, rapport_audit: rap });
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

  /** Décision humaine sur une action sensible : intégrité, nouvel audit, puis ENVOI SIMULÉ tracé. */
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
      if (this.auditeurSain === false) throw new Error('Auditeur défaillant (auto-test négatif) : approbation refusée par sécurité');
      if (sha256(m.resultat) !== m.resultat_hash) {
        journaliser(db, { missionId: id, acteur: 'securite', evenement: 'APPROBATION_REFUSEE_RESULTAT_MODIFIE', detail: {} });
        throw new Error('Le résultat a été modifié depuis l’audit : approbation refusée.');
      }
      const resultat = JSON.parse(m.resultat);
      const rap = this.#auditer(m.agent, m, resultat);
      if (rap.verdict !== 'VALIDE') {
        journaliser(db, { missionId: id, acteur: 'auditeur', evenement: 'REAUDIT_ECHEC_AVANT_ENVOI', detail: { echecs: rap.echecs } });
        throw new Error(`Nouvel audit négatif, envoi refusé : ${rap.echecs[0]}`);
      }
      // Aucun envoi réel n'existe dans ce système : même avec l'autorisation « envoi_reel », l'envoi reste simulé tant qu'un connecteur n'est pas développé.
      const sortie = { devis: ['MAIL_ENVOI_SIMULE', { vers: resultat.client?.email, piece_jointe: resultat.fichiers?.pdf?.chemin }],
        relances: ['RELANCES_ENVOI_SIMULE', { nombre: resultat.brouillons?.length }], commande_brouillon: ['COMMANDE_ENVOI_SIMULE', { devis: resultat.devis_ref, total_ht_cents: resultat.total_ht_cents }] }[resultat.type];
      db.prepare('INSERT INTO sorties(ts, mission_id, type, simule, contenu) VALUES (?,?,?,1,?)').run(horloge.iso(), id, sortie[0], JSON.stringify(sortie[1]));
      db.prepare(`UPDATE missions SET statut='VALIDE', decide_par=?, maj_le=? WHERE id=?`).run(par, horloge.iso(), id);
      journaliser(db, { missionId: id, acteur: par, evenement: 'APPROUVE_ENVOI_SIMULE', detail: { type: resultat.type } });
      // Action externe : enfilée dans l'outbox DANS LA MÊME TRANSACTION que la décision (jamais d'appel externe direct).
      if (resultat.type === 'devis' && param(db, 'connecteur_gmail', 'desactive') === 'synthetique') {
        const eml = readFileSync(join(this.dossierSorties, resultat.fichiers.eml.chemin));
        enfiler(db, { missionId: id, connecteur: 'gmail', action: 'CREER_BROUILLON', cle: `brouillon-${id}`, charge: { vers: resultat.client.email, eml_base64: eml.toString('base64') } });
      }
      return { statut: 'VALIDE', envoi: 'SIMULE' };
    });
  }

  relancer(id, par = 'utilisateur') {
    const r = this.db.prepare(`UPDATE missions SET statut='EN_FILE', reprises=0, corrections=0, raison=NULL, question=NULL, maj_le=? WHERE id=? AND statut IN ('BLOQUE','ECHEC')`).run(horloge.iso(), id);
    if (r.changes !== 1) throw new Error('Relance impossible (statut non bloqué ou échec)');
    journaliser(this.db, { missionId: id, acteur: par, evenement: 'RELANCE_HUMAINE', detail: {} });
    return { statut: 'EN_FILE' };
  }

  arreterTout(par = 'utilisateur') { definirParam(this.db, 'arret_urgence', '1'); journaliser(this.db, { acteur: par, evenement: 'ARRET_URGENCE', detail: {} }); }
  reprendre(par = 'utilisateur') { definirParam(this.db, 'arret_urgence', '0'); journaliser(this.db, { acteur: par, evenement: 'REPRISE_APRES_ARRET', detail: {} }); }
  fichierMission(id, nom) { return join(this.dossierSorties, id, nom); }

  /** Détail d'une décision : plan, droits, contrôles de l'auditeur, correctifs, chronologie (journal masqué). */
  detailDecision(id) {
    const m = this.db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
    if (!m) return null;
    const agent = m.agent ? this.agents[m.agent] : null;
    const rap = m.rapport_audit ? JSON.parse(m.rapport_audit) : null;
    const journal = this.db.prepare('SELECT ts, acteur, evenement, detail FROM journal WHERE mission_id = ? ORDER BY seq').all(id).map((l) => ({ ts: l.ts, acteur: l.acteur, evenement: l.evenement, detail: JSON.parse(l.detail) }));
    return {
      id: m.id, demande: m.demande, statut: m.statut, agent: m.agent, raison: m.raison, question: m.question, executions: m.executions, corrections: m.corrections, reprises: m.reprises, cout_cents: m.cout_cents,
      plan: m.plan ? JSON.parse(m.plan) : null, droits_agent: agent?.droits ?? null, criteres_reussite: agent?.criteres ?? null,
      controles: rap?.controles ?? null, echecs_audit: rap?.echecs ?? null, regles_utilisees: m.resultat ? JSON.parse(m.resultat).regles_utilisees ?? null : null,
      type_resultat: m.resultat ? JSON.parse(m.resultat).type : null, chronologie: journal,
    };
  }
}
