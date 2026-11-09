// AGENT — Planification. Organise la journée (priorités, échéances) et, si le connecteur cockpit est AUTORISÉ, la charge d'atelier.
import { bloque, regleActive, citerRegle, joursEntre, fautesGenerales } from './commun.js';

const POSTES = ['reception', 'demontage', 'tolerie', 'preparation', 'peinture', 'remontage', 'controle'];

function scoreTache(t, aujourdhui) {
  const j = joursEntre(aujourdhui, t.echeance); // négatif = en retard
  let s = j < 0 ? 1000 + 10 * -j : j === 0 ? 500 : j <= 3 ? 200 : j <= 14 ? 50 : 0;
  s += Math.floor((t.valeur_eur ?? 0) / 10);
  return s;
}

function joursOuvres(debut, fin) {
  let n = 0;
  for (let d = Date.parse(debut); d <= Date.parse(fin); d += 86400000) { const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export function creerAgentPlanification({ defaut = null } = {}) {
  return {
    nom: 'planification',
    role: 'Planification',
    description: 'Organise missions, priorités et échéances (une prochaine action, trois priorités maximum) ; charge d’atelier si le connecteur est autorisé.',
    droits: { lire: ['taches', 'missions_en_attente', 'ordres_atelier', 'regles'], ecrire: ['aucun'], reseau: false, envoyer: false },
    criteres: ['Plan identique au recalcul indépendant (ordre, capacité)', 'Aucune tâche inventée', 'Trois priorités maximum', 'Aucune tâche en retard oubliée sans signalement', 'Capacité de la journée jamais dépassée'],
    plan() { return [{ etape: 'rassembler les tâches et validations en attente', critere: 'sources déclarées' }, { etape: 'scorer et ordonner', critere: 'échéance puis valeur' }, { etape: 'remplir la journée', critere: 'capacité respectée' }, { etape: 'contrôle indépendant', critere: 'recalcul du plan' }]; },

    async executer(mission, ctx) {
      const faute = await fautesGenerales(defaut, mission, ctx);
      if (faute && typeof faute === 'object') return faute;
      const rp = regleActive(ctx, 'planning', '*'); if (rp.blocage) return rp.blocage;

      if (/atelier|charge|ordres/i.test(mission.demande)) {
        if (!ctx.donnees.ordres_atelier) return bloque('CONNECTEUR_NON_AUTORISE', 'Le connecteur cockpit (ordres d’atelier) n’est pas autorisé dans cet espace.', 'Un administrateur doit accorder l’autorisation « connecteur:cockpit » pour lire les ordres d’atelier.');
        const rc = regleActive(ctx, 'cockpit_capacite_h_par_jour', '*'); if (rc.blocage) return rc.blocage;
        const ordres = ctx.donnees.ordres_atelier;
        const debut = ordres.map((o) => o.entree).sort()[0]; const fin = ordres.map((o) => o.restitution).sort().slice(-1)[0];
        const jo = joursOuvres(debut, fin);
        const charge = {}; const capacite = {}; const anomalies = [];
        for (const p of POSTES) {
          charge[p] = ordres.reduce((s, o) => s + Math.round((o.heures[p] ?? 0) * 60), 0);
          capacite[p] = Math.round(rc.regle.valeur[p] * 60) * jo;
          if (charge[p] > capacite[p]) anomalies.push({ code: 'SURCHARGE_POSTE', poste: p, charge_min: charge[p], capacite_min: capacite[p] });
        }
        if (faute === 'charge_faussee') charge.peinture -= 120;
        return { statut: 'OK', resultat: { type: 'charge_atelier', action_sensible: false, donnees_fictives: ctx.fictif, date: ctx.aujourdhui, regles_utilisees: [citerRegle(rp.regle), citerRegle(rc.regle)], periode: { debut, fin, jours_ouvres: jo }, nb_ordres: ordres.length, charge_min_par_poste: charge, capacite_min_par_poste: capacite, anomalies } };
      }

      const w = rp.regle.valeur;
      const taches = [...ctx.donnees.taches];
      const validations = (ctx.donnees.missions_en_attente ?? []).map((m) => m.id); // instantané DÉCLARÉ : l'auditeur le vérifie, il ne relit pas un état qui a pu changer
      for (const m of ctx.donnees.missions_en_attente ?? []) taches.push({ id: `VAL-${m.id}`, titre: `Valider : ${String(m.demande).slice(0, 60)}`, type: 'validation', echeance: ctx.aujourdhui, duree_min: 5, valeur_eur: 0 });
      let classes = taches.map((t) => ({ ...t, score: scoreTache(t, ctx.aujourdhui) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      if (faute === 'ordre_inverse' && classes.length > 1) [classes[0], classes[1]] = [classes[1], classes[0]];
      const planifiees = []; const reportees = []; let minutes = 0;
      const capacite = faute === 'capacite_depassee' ? 10 ** 6 : w.capacite_min;
      for (const t of classes) {
        if (faute === 'retard_ignore' && t.id === 'T003') continue;
        if (minutes + t.duree_min <= capacite) { planifiees.push({ id: t.id, titre: t.titre, duree_min: t.duree_min, score: t.score, echeance: t.echeance }); minutes += t.duree_min; }
        else reportees.push({ id: t.id, motif: 'CAPACITE_INSUFFISANTE' });
      }
      if (faute === 'tache_inventee') planifiees.push({ id: 'T999', titre: 'Tâche inventée', duree_min: 5, score: 1, echeance: ctx.aujourdhui });
      const nbPrio = faute === 'trop_de_priorites' ? w.max_priorites + 1 : w.max_priorites;
      const priorites = planifiees.slice(0, nbPrio).map((p) => p.id);
      const enRetardNon = reportees.filter((r) => taches.find((t) => t.id === r.id && t.echeance < ctx.aujourdhui)).map((r) => r.id);
      return { statut: 'OK', resultat: { type: 'plan_journee', action_sensible: false, donnees_fictives: ctx.fictif, date: ctx.aujourdhui, regles_utilisees: [citerRegle(rp.regle)], validations_prises_en_compte: validations, capacite_min: w.capacite_min, priorites, planifiees, reportees, minutes_planifiees: minutes,
        prochaine_action: planifiees[0] ? { id: planifiees[0].id, titre: planifiees[0].titre } : null, en_retard_non_planifiees: enRetardNon } };
    },
  };
}
