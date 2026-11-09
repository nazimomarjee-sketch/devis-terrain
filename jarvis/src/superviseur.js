// SUPERVISEUR EXTERNE. Processus distinct des services ; il ne voit AUCUNE donnée (uniquement la sonde de vie /api/sante).
// Il décide : sain / dégradé / silencieux / mort, redémarre quand c'est SÛR, limite les redémarrages (protection contre les boucles
// de crash) et escalade à l'humain. Pourquoi le redémarrage est sûr : les missions sont à bail (reprise automatique après expiration),
// les envois sont idempotents (index unique) et l'approbation est transactionnelle — vérifié par tests (aucun double envoi).
export const POLITIQUE_DEFAUT = { silenceMaxS: 30, echecsAvantRedemarrage: 2, redemarragesMax: 3, fenetreS: 600, delaiApresRedemarrageS: 5 };

export class Superviseur {
  /**
   * @param services  [{ id, sonder(): Promise<{ok, battement_age_s, critiques}|null>, redemarrer(): Promise<void>, peutRedemarrer?(): Promise<boolean> }]
   * @param alerter   (alerte: {niveau, service, code, message}) => void
   */
  constructor({ services, politique = {}, maintenant = () => Date.now(), alerter = () => {} }) {
    this.services = services; this.p = { ...POLITIQUE_DEFAUT, ...politique }; this.maintenant = maintenant; this.alerter = alerter;
    this.etat = Object.fromEntries(services.map((s) => [s.id, { etat: 'inconnu', echecs: 0, redemarrages: [], escalade: false, derniereReponse: null }]));
  }

  async cycle() {
    const bilan = {};
    for (const s of this.services) bilan[s.id] = await this.#traiter(s);
    return bilan;
  }

  /** Après escalade, seul un humain peut relancer la supervision d'un service. */
  reprendre(id) { Object.assign(this.etat[id], { escalade: false, echecs: 0, redemarrages: [] }); }

  async #traiter(s) {
    const e = this.etat[s.id]; const now = this.maintenant();
    if (e.escalade) return { etat: 'escalade' };
    let r = null; try { r = await s.sonder(); } catch { r = null; }
    let probleme = null;
    if (!r) probleme = 'mort';
    else if (r.battement_age_s === null || r.battement_age_s > this.p.silenceMaxS) probleme = 'silencieux';
    if (!probleme) {
      e.echecs = 0; e.derniereReponse = now;
      if (r.critiques > 0) { e.etat = 'degrade'; this.alerter({ niveau: 'critique', service: s.id, code: 'ALERTES_CRITIQUES', message: `${r.critiques} alerte(s) critique(s) : un redémarrage ne les résoudrait pas, intervention requise.` }); } else e.etat = 'sain';
      return { etat: e.etat };
    }
    e.echecs++; e.etat = probleme;
    if (e.echecs < this.p.echecsAvantRedemarrage) return { etat: probleme, attente: true }; // confirmation : pas de redémarrage sur un raté isolé
    e.redemarrages = e.redemarrages.filter((t) => now - t < this.p.fenetreS * 1000);
    if (e.redemarrages.length >= this.p.redemarragesMax) {
      e.escalade = true; e.etat = 'escalade';
      this.alerter({ niveau: 'critique', service: s.id, code: 'BOUCLE_DE_CRASH', message: `${e.redemarrages.length} redémarrages en ${this.p.fenetreS} s : supervision suspendue, intervention humaine requise.` });
      return { etat: 'escalade' };
    }
    if (s.peutRedemarrer && !(await s.peutRedemarrer())) { this.alerter({ niveau: 'avertissement', service: s.id, code: 'REDEMARRAGE_DIFFERE', message: 'Redémarrage différé : condition de sûreté non remplie.' }); return { etat: probleme, differe: true }; }
    this.alerter({ niveau: 'avertissement', service: s.id, code: probleme === 'mort' ? 'SERVICE_MORT' : 'SERVICE_SILENCIEUX', message: `Service ${probleme} : redémarrage automatique.` });
    e.redemarrages.push(now); e.echecs = 0;
    try { await s.redemarrer(); } catch (err) { this.alerter({ niveau: 'critique', service: s.id, code: 'REDEMARRAGE_ECHEC', message: err.message }); }
    return { etat: 'redemarre' };
  }
}
