'use strict';
// Tableau de bord : tout le texte dynamique passe par textContent (jamais innerHTML) → pas d'injection HTML.
const $ = (id) => document.getElementById(id);
let jeton = '';
try { jeton = localStorage.getItem('jarvis_jeton') || ''; } catch { /* stockage indisponible */ }

const el = (tag, props = {}, ...enfants) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'onclick') n.onclick = v; else n.setAttribute(k, v); }
  for (const e of enfants) n.append(e);
  return n;
};
const eur = (c) => `${(c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, ' ')} €`;
const LIBELLES = { VALIDE: 'Validée', EN_ATTENTE_APPROBATION: 'À valider', BLOQUE: 'Bloquée', A_CORRIGER: 'Correction', ECHEC: 'Échec', REFUSE: 'Refusée', EN_FILE: 'En file', EN_COURS: 'En cours' };

async function api(chemin, options = {}) {
  const r = await fetch(chemin, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' } });
  if (r.status === 401) { afficherConnexion(); throw new Error('non authentifié'); }
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corps.erreur || `Erreur ${r.status}`);
  return corps;
}

function afficherConnexion() { $('connexion').hidden = false; }

async function ouvrirPdf(id) {
  const r = await fetch(`/api/fichiers/${id}/devis.pdf`, { headers: { Authorization: `Bearer ${jeton}` } });
  if (!r.ok) return alert('PDF indisponible');
  window.open(URL.createObjectURL(await r.blob()), '_blank');
}

async function decider(id, decision) {
  if (decision === 'approuver' && !confirm('Approuver ? (Dans cette démo, l’envoi est simulé.)')) return;
  try { await api(`/api/missions/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) }); } catch (e) { alert(e.message); }
  rafraichir();
}

function carte(v) {
  const c = el('div', { class: 'carte priorite' });
  c.append(el('h3', {}, `Devis ${v.client}`), el('div', {}, `Total TTC : ${eur(v.total_ttc_cents)}`));
  if (v.fictif) c.append(el('div', { class: 'aide' }, 'Données fictives — démonstration'));
  for (const a of v.avertissements) c.append(el('div', { class: 'aide' }, `⚠ ${a}`));
  c.append(el('div', { class: 'aide' }, 'Brouillon non enregistré dans EBP. Rien n’est parti.'));
  c.append(el('button', { onclick: () => ouvrirPdf(v.id) }, 'Voir le PDF'));
  c.append(el('div', { class: 'rang' }, el('button', { class: 'ok', onclick: () => decider(v.id, 'approuver') }, 'Approuver'), el('button', { onclick: () => decider(v.id, 'refuser') }, 'Refuser')));
  return c;
}

function rendre(e) {
  $('connexion').hidden = true;
  const arret = e.alertes.some((a) => a.code === 'ARRET_URGENCE');
  $('bandeau').className = `bandeau ${arret ? 'arret' : 'demo'}`;
  $('bandeau').textContent = arret ? 'ARRÊT D’URGENCE ACTIF' : 'MODE DÉMO — données fictives uniquement';

  // Une seule priorité à la fois : d'abord une validation, sinon une mission bloquée.
  const bloquee = e.missions.find((m) => m.statut === 'BLOQUE' || m.statut === 'ECHEC');
  const zone = $('carte-priorite');
  zone.replaceChildren();
  if (e.a_valider.length) {
    zone.append(carte(e.a_valider[0]));
    if (e.a_valider.length > 1) zone.append(el('p', { class: 'aide' }, `${e.a_valider.length - 1} autre(s) validation(s) ensuite.`));
    $('priorite').hidden = false;
  } else if (bloquee) {
    const c = el('div', { class: 'carte priorite' }, el('h3', {}, bloquee.statut === 'ECHEC' ? 'Échec à traiter' : 'JARVIS a besoin de toi'),
      el('div', {}, bloquee.question || bloquee.raison || ''));
    c.append(el('button', { onclick: async () => { try { await api(`/api/missions/${bloquee.id}/relancer`, { method: 'POST', body: '{}' }); } catch (x) { alert(x.message); } rafraichir(); } }, 'Relancer'));
    zone.append(c);
    $('priorite').hidden = false;
  } else { $('priorite').hidden = true; }

  const m = e.metriques;
  const tuiles = [
    [e.agents.filter((a) => a.etat === 'implemente').length, 'agents actifs'],
    [(m.par_statut.EN_FILE || 0) + (m.par_statut.EN_COURS || 0) + (m.par_statut.A_CORRIGER || 0), 'missions en cours'],
    [m.par_statut.VALIDE || 0, 'terminées et vérifiées'],
    [m.missions_bloquees, 'bloquées'],
    [e.a_valider.length, 'à valider'],
    [`${(m.depense_jour_cents / 100).toFixed(2)} / ${(m.budget_jour_cents / 100).toFixed(2)} €`, 'dépense IA du jour'],
    [e.derniere_sauvegarde_verifiee ? new Date(e.derniere_sauvegarde_verifiee).toLocaleString('fr-FR') : 'aucune', 'dernière sauvegarde vérifiée'],
    [m.taux_reussite == null ? '—' : `${Math.round(m.taux_reussite * 100)} %`, 'taux de réussite'],
  ];
  $('tuiles').replaceChildren(...tuiles.map(([v, l]) => el('div', { class: 'tuile' }, el('b', {}, String(v)), el('span', {}, l))));

  $('alertes').replaceChildren(...(e.alertes.length ? e.alertes.map((a) => el('li', { class: `n-${a.niveau}` }, `${a.code} — ${a.message}`)) : [el('li', {}, 'Aucune alerte.')]));
  $('agents').replaceChildren(...e.agents.map((a) => el('li', { class: a.etat === 'prevu' ? 'prevu' : '' }, `${a.role} — ${a.etat === 'prevu' ? 'prévu, pas encore développé' : 'implémenté'}`)));
  $('missions').replaceChildren(...(e.missions.length ? e.missions.slice(0, 15).map((x) => {
    const li = el('li', {}, el('span', { class: `pastille s-${x.statut}` }, LIBELLES[x.statut] || x.statut), x.demande.slice(0, 90));
    if (x.question) li.append(el('div', { class: 'aide' }, `❓ ${x.question}`));
    return li;
  }) : [el('li', {}, 'Aucune mission.')]));
}

async function rafraichir() { try { rendre(await api('/api/etat')); } catch { /* connexion ou réseau */ } }

$('ok-jeton').onclick = () => { jeton = $('jeton').value.trim(); try { localStorage.setItem('jarvis_jeton', jeton); } catch { /* ignoré */ } $('jeton').value = ''; rafraichir(); };
$('deconnexion').onclick = () => { jeton = ''; try { localStorage.removeItem('jarvis_jeton'); } catch { /* ignoré */ } afficherConnexion(); };
$('envoyer').onclick = async () => {
  const demande = $('demande').value.trim();
  if (!demande) return;
  try { await api('/api/missions', { method: 'POST', body: JSON.stringify({ demande, cle: `ui-${Date.now()}` }) }); $('demande').value = ''; } catch (e) { alert(e.message); }
  rafraichir();
};
$('arret').onclick = async () => { if (confirm('Arrêter immédiatement tout traitement ?')) { await api('/api/arret', { method: 'POST', body: '{}' }); rafraichir(); } };
$('reprise').onclick = async () => { await api('/api/reprise', { method: 'POST', body: '{}' }); rafraichir(); };

if (!jeton) afficherConnexion(); else rafraichir();
setInterval(() => { if (jeton && !document.hidden) rafraichir(); }, 5000);
