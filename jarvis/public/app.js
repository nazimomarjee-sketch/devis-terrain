'use strict';
// Tout le texte dynamique passe par textContent (jamais innerHTML) : aucune injection HTML possible.
const $ = (id) => document.getElementById(id);
let jeton = '';
try { jeton = localStorage.getItem('jarvis_jeton') || ''; } catch { /* stockage indisponible */ }
const el = (tag, props = {}, ...enfants) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'onclick') n.onclick = v; else n.setAttribute(k, v); }
  for (const e of enfants) if (e !== null && e !== undefined) n.append(e);
  return n;
};
const eur = (c) => `${(c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, ' ')} €`;
const LIBELLES = { VALIDE: 'Validée', EN_ATTENTE_APPROBATION: 'À valider', BLOQUE: 'Bloquée', A_CORRIGER: 'Correction', ECHEC: 'Échec', REFUSE: 'Refusée', EN_FILE: 'En file', EN_COURS: 'En cours' };
const IDEES = { planification: ['Planifier ma journée', 'planifie ma journée'], produits: ['Contrôler le catalogue', 'contrôle du catalogue produits'], relances: ['Préparer les relances', 'prépare les relances'],
  commandes: ['Suivi des commandes', 'suivi des commandes'], finance: ['Analyse financière', 'analyse financière : marge, encours et anomalies'], prospection: ['Prioriser les prospects', 'priorise les prospects top 5'],
  devis: ['Exemple de devis', 'prépare un devis pour le garage Martin : 3 vernis, 2 durcisseurs et 10 abrasifs'], clients: ['Dossier d’un client', 'dossier du client Garage Martin'] };

async function api(chemin, options = {}) {
  const r = await fetch(chemin, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' } });
  if (r.status === 401) { $('connexion').hidden = false; throw new Error('non authentifié'); }
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corps.erreur || `Erreur ${r.status}`);
  return corps;
}
async function ouvrirPdf(id) {
  const r = await fetch(`/api/fichiers/${id}/devis.pdf`, { headers: { Authorization: `Bearer ${jeton}` } });
  if (!r.ok) return alert('PDF indisponible');
  window.open(URL.createObjectURL(await r.blob()), '_blank');
}
async function decider(id, decision) {
  if (decision === 'approuver' && !confirm('Approuver ? (Aucun envoi réel n’existe : l’envoi est simulé.)')) return;
  try { await api(`/api/missions/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) }); } catch (e) { alert(e.message); }
  rafraichir();
}

async function voirDetail(id) {
  let d; try { d = await api(`/api/missions/${id}/decision-detail`); } catch (e) { return alert(e.message); }
  const c = $('detail-corps'); c.replaceChildren();
  const bloc = (titre, ...contenu) => c.append(el('h3', {}, titre), ...contenu.filter((x) => x !== null && x !== undefined));
  bloc('Demande', el('p', {}, d.demande));
  bloc('Statut', el('p', {}, `${LIBELLES[d.statut] || d.statut}${d.raison ? ` — ${d.raison}` : ''}`), d.question ? el('p', { class: 'aide' }, `❓ ${d.question}`) : null,
    el('p', { class: 'aide' }, `Agent : ${d.agent || '—'} · exécutions : ${d.executions} · corrections : ${d.corrections} · reprises : ${d.reprises} · coût : ${(d.cout_cents / 100).toFixed(2)} €`));
  if (d.droits_agent) bloc('Droits de l’agent', el('p', {}, `Lecture : ${d.droits_agent.lire.join(', ')}`), el('p', { class: 'aide' }, `Réseau : ${d.droits_agent.reseau ? 'oui' : 'non'} · Envoi : ${d.droits_agent.envoyer ? 'oui' : 'non'}`));
  if (d.plan) bloc('Plan', el('ol', { class: 'compact' }, ...d.plan.map((p) => el('li', {}, `${p.etape} — ${p.critere}`))));
  if (d.controles) bloc('Contrôles de l’auditeur indépendant', el('ul', { class: 'compact' }, ...d.controles.map((k) => el('li', { class: k.ok ? 'ok' : 'ko' }, `${k.ok ? '✔' : '✘'} ${k.nom}${k.ok ? '' : ` : ${k.detail.join(' ; ')}`}`))));
  if (d.echecs_audit?.length) bloc('Erreurs détectées', el('ul', { class: 'compact' }, ...d.echecs_audit.map((x) => el('li', { class: 'ko' }, x))));
  if (d.regles_utilisees?.length) bloc('Règles appliquées', el('ul', { class: 'compact' }, ...d.regles_utilisees.map((r) => el('li', {}, `${r.type} · ${r.cle} — ${r.statut === 'VALIDE' ? 'validée' : r.statut === 'FICTIF_DEMO' ? 'DÉMO, non validée' : 'non validée'}`))));
  if (d.criteres_reussite) bloc('Critères de réussite', el('ul', { class: 'compact' }, ...d.criteres_reussite.map((x) => el('li', {}, x))));
  bloc('Chronologie', el('ul', { class: 'compact' }, ...d.chronologie.map((j) => el('li', {}, `${j.ts.slice(11, 19)} · ${j.acteur} · ${j.evenement}`))));
  $('detail').showModal();
}

function carteValidation(v, grande) {
  const c = el('div', { class: grande ? 'carte priorite' : 'carte' });
  c.append(el('h3', {}, v.titre), el('div', {}, v.detail));
  if (v.fictif) c.append(el('div', { class: 'aide' }, 'Données fictives — démonstration'));
  for (const a of v.avertissements) c.append(el('div', { class: 'aide' }, `⚠ ${a}`));
  c.append(el('div', { class: 'aide' }, 'Brouillon : rien n’est parti, rien n’est enregistré dans EBP.'));
  const rang = el('div', { class: 'rang' });
  if (v.type === 'devis') rang.append(el('button', { onclick: () => ouvrirPdf(v.id) }, 'PDF'));
  rang.append(el('button', { onclick: () => voirDetail(v.id) }, 'Détail'));
  c.append(rang, el('div', { class: 'rang' }, el('button', { class: 'ok', onclick: () => decider(v.id, 'approuver') }, 'Approuver'), el('button', { onclick: () => decider(v.id, 'refuser') }, 'Refuser')));
  return c;
}

function rendre(e) {
  $('connexion').hidden = true;
  $('espace').textContent = e.espace.libelle;
  const arret = e.alertes.some((a) => a.code === 'ARRET_URGENCE');
  $('bandeau').className = `bandeau ${arret ? 'arret' : e.mode === 'demo-donnees-fictives' ? 'demo' : 'reel'}`;
  $('bandeau').textContent = arret ? 'ARRÊT D’URGENCE ACTIF — rien n’est traité' : e.mode === 'demo-donnees-fictives' ? 'MODE DÉMO — données et prix fictifs uniquement' : 'DONNÉES RÉELLES AUTORISÉES — validation humaine obligatoire';
  $('liens').replaceChildren(...(e.espace.liens || []).filter((l) => /^https?:\/\//.test(l.url)).map((l) => el('a', { href: l.url, class: 'lien' }, l.nom)));

  const zone = $('carte-prochaine'); zone.replaceChildren();
  const p = e.prochaine_action; const premiere = e.a_valider[0];
  if (premiere) { zone.append(carteValidation(premiere, true)); $('prochaine').hidden = false; }
  else if (p) {
    const c = el('div', { class: 'carte priorite' }, el('h3', {}, p.origine === 'question' ? 'JARVIS a besoin de toi' : p.origine === 'echec' ? 'Échec à traiter' : 'À faire maintenant'), el('div', {}, p.texte || ''));
    const rang = el('div', { class: 'rang' }, el('button', { onclick: () => voirDetail(p.id) }, 'Détail'));
    if (p.origine === 'question' || p.origine === 'echec') rang.append(el('button', { onclick: async () => { try { await api(`/api/missions/${p.id}/relancer`, { method: 'POST', body: '{}' }); } catch (x) { alert(x.message); } rafraichir(); } }, 'Relancer'));
    c.append(rang); zone.append(c); $('prochaine').hidden = false;
  } else $('prochaine').hidden = true;

  $('validations').hidden = e.a_valider.length < 2;
  $('liste-validations').replaceChildren(...e.a_valider.slice(1).map((v) => el('li', {}, carteValidation(v, false))));

  $('idees').replaceChildren(...e.agents.filter((a) => a.etat === 'actif' && IDEES[a.nom]).map((a) => el('button', { class: 'puce', onclick: () => { $('demande').value = IDEES[a.nom][1]; } }, IDEES[a.nom][0])));

  const enCours = e.missions.filter((m) => ['EN_FILE', 'EN_COURS', 'A_CORRIGER'].includes(m.statut));
  $('en-cours').replaceChildren(...(enCours.length ? enCours.map((m) => el('li', {}, el('span', { class: `pastille s-${m.statut}` }, LIBELLES[m.statut]), `${m.agent ? `[${m.agent}] ` : ''}${m.demande.slice(0, 80)}`)) : [el('li', {}, 'Aucune mission en cours.')]));

  const lignes = [];
  for (const a of e.alertes) lignes.push(el('li', { class: `n-${a.niveau}` }, `${a.code} — ${a.message}`));
  for (const a of e.anomalies) lignes.push(el('li', { class: a.nombre ? 'n-avertissement' : '' }, el('span', {}, `${a.nombre} anomalie(s) — ${a.source} `), el('button', { class: 'petit', onclick: () => voirDetail(a.mission_id) }, 'Détail')));
  $('alertes').replaceChildren(...(lignes.length ? lignes : [el('li', {}, 'Aucune anomalie ni alerte.')]));

  const termines = e.missions.filter((m) => ['VALIDE', 'REFUSE', 'ECHEC', 'BLOQUE'].includes(m.statut)).slice(0, 8);
  $('resultats').replaceChildren(...(termines.length ? termines.map((m) => { const li = el('li', {}, el('span', { class: `pastille s-${m.statut}` }, LIBELLES[m.statut]), `${m.agent ? `[${m.agent}] ` : ''}${m.demande.slice(0, 70)}`); if (m.question) li.append(el('div', { class: 'aide' }, `❓ ${m.question}`)); li.append(el('button', { class: 'petit', onclick: () => voirDetail(m.id) }, 'Détail')); return li; }) : [el('li', {}, 'Aucun résultat.')]));

  const m = e.metriques;
  const tuiles = [[e.agents.filter((a) => a.etat === 'actif').length, 'agents actifs'], [enCours.length, 'missions en cours'], [m.par_statut.VALIDE || 0, 'terminées et vérifiées'], [m.missions_bloquees, 'bloquées'], [e.a_valider.length, 'à valider'],
    [`${(m.depense_jour_cents / 100).toFixed(2)} / ${(m.budget_jour_cents / 100).toFixed(2)} €`, 'dépense IA du jour'], [e.derniere_sauvegarde_verifiee ? new Date(e.derniere_sauvegarde_verifiee).toLocaleString('fr-FR') : 'aucune', 'dernière sauvegarde vérifiée'], [m.taux_reussite == null ? '—' : `${Math.round(m.taux_reussite * 100)} %`, 'taux de réussite']];
  $('tuiles').replaceChildren(...tuiles.map(([v, l]) => el('div', { class: 'tuile' }, el('b', {}, String(v)), el('span', {}, l))));

  $('agents').replaceChildren(...e.agents.map((a) => el('li', { class: a.etat === 'actif' ? '' : 'prevu' }, el('details', {}, el('summary', {}, `${a.role} — ${a.etat}`), el('p', {}, a.description),
    el('p', { class: 'aide' }, `Lit : ${a.droits.lire.join(', ')} · réseau : ${a.droits.reseau ? 'oui' : 'non'} · envoi : ${a.droits.envoyer ? 'oui' : 'non'}`), el('ul', { class: 'compact' }, ...a.criteres.map((x) => el('li', {}, x)))))));

  const aut = e.autorisations.filter((a) => !a.revoque_le).map((a) => el('li', {}, `✔ ${a.type} — ${a.portee}${a.expire_le ? ` (jusqu’au ${a.expire_le.slice(0, 10)})` : ''}`));
  const integ = e.integrations.map((i) => el('li', { class: 'prevu' }, `${i.nom.toUpperCase()} : ${i.autorisee ? 'autorisée mais non développée' : 'désactivée'}`));
  $('autorisations').replaceChildren(el('li', {}, e.espace.donnees_reelles_autorisees ? 'Données réelles : AUTORISÉES' : 'Données réelles : désactivées'), ...aut, ...integ);
}

async function rafraichir() { try { rendre(await api('/api/etat')); } catch { /* connexion ou réseau */ } }
$('ok-jeton').onclick = () => { jeton = $('jeton').value.trim(); try { localStorage.setItem('jarvis_jeton', jeton); } catch { /* ignoré */ } $('jeton').value = ''; rafraichir(); };
$('deconnexion').onclick = () => { jeton = ''; try { localStorage.removeItem('jarvis_jeton'); } catch { /* ignoré */ } $('connexion').hidden = false; };
$('envoyer').onclick = async () => { const demande = $('demande').value.trim(); if (!demande) return; try { await api('/api/missions', { method: 'POST', body: JSON.stringify({ demande, cle: `ui-${Date.now()}` }) }); $('demande').value = ''; } catch (e) { alert(e.message); } rafraichir(); };
$('arret').onclick = async () => { if (confirm('Arrêter immédiatement tout traitement dans cet espace ?')) { await api('/api/arret', { method: 'POST', body: '{}' }); rafraichir(); } };
$('reprise').onclick = async () => { await api('/api/reprise', { method: 'POST', body: '{}' }); rafraichir(); };
$('fermer-detail').onclick = () => $('detail').close();

if (!jeton) $('connexion').hidden = false; else rafraichir();
setInterval(() => { if (jeton && !document.hidden) rafraichir(); }, 5000);
