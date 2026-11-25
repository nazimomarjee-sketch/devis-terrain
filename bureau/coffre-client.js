/* ODICOLOR Bureau — liaison avec le coffre de l'application locale (local/serveur.js).
   Actif seulement si la page est servie par l'application locale ODICOLOR (127.0.0.1). Ouvert autrement
   (double-clic, tests, autre serveur) : ne fait rien, le Bureau fonctionne comme avant.
   - À l'ouverture : retrouve l'état enregistré dans le coffre (garages, imports EBP, date d'export).
   - Après chaque import : enregistre l'état dans le coffre (jamais la démo).
   - Coffre verrouillé (inactivité) : retour à l'écran de mot de passe.
   Le mot de passe n'est jamais connu de cette page : la session est un cookie inaccessible au JavaScript. */
(function () {
  'use strict';
  if (location.protocol !== 'http:' || !/^(127\.0\.0\.1|localhost)$/.test(location.hostname) || !window.OdicolorBureau) return;
  const ENTETES = { 'X-ODICOLOR': '1' };
  // État du coffre, lu par le Bureau avant toute décision de compte (data-coffre) :
  //   pret / enregistre = le coffre répond ; erreur = un enregistrement a échoué ; inaccessible = le programme local ne répond plus ;
  //   verrouille = retour à l'écran de mot de passe. Hors de ces états, AUCUNE décision ne peut être enregistrée.
  const etat = (e, texte) => { document.documentElement.dataset.coffre = e; if (texte !== undefined) document.documentElement.dataset.coffreMessage = texte; };
  const ouvrir = raison => { etat('verrouille'); location.replace('/ouvrir.html' + (raison ? '?raison=' + raison : '')); };
  let actif = false, enCours = Promise.resolve(), minuteur = null, relance = null;
  // Après un échec, on guette le retour du coffre (toutes les 3 s) : les décisions redeviennent possibles seulement s'il répond.
  function guetter() {
    if (relance) return;
    relance = setInterval(async () => {
      try { const r = await fetch('/api/statut', { headers: ENTETES, credentials: 'same-origin' }); if (!r.ok) return; const s = await r.json();
        if (s && s.application === 'odicolor-local' && s.session) { clearInterval(relance); relance = null; etat('pret', ''); bandeau(''); window.dispatchEvent(new Event('odicolor-coffre-retabli')); } } catch { /* toujours inaccessible */ }
    }, 3000);
  }
  function echec(texte) { etat('erreur', texte); bandeau(texte); window.dispatchEvent(new CustomEvent('odicolor-coffre-echec', { detail: texte })); guetter(); }

  function bandeau(texte) { // seulement en cas d'échec d'enregistrement : rien ne doit passer inaperçu
    let b = document.getElementById('coffre-alerte');
    if (!b) { b = document.createElement('div'); b.id = 'coffre-alerte'; b.setAttribute('role', 'alert');
      b.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;padding:12px 16px;border-radius:10px;background:#3a0d12;color:#F4F2EF;border:1px solid #D41F2B;font:14px system-ui'; document.body.append(b); }
    b.textContent = texte; b.hidden = !texte;
  }

  async function enregistrer() {
    if (!actif) return;
    if (document.documentElement.dataset.coffre === 'erreur' || document.documentElement.dataset.coffre === 'inaccessible') { /* on retente quand même : un succès rétablit l'état */ }
    const corps = JSON.stringify(window.OdicolorBureau.exporter());
    try {
      const r = await fetch('/api/etat', { method: 'PUT', headers: { ...ENTETES, 'Content-Type': 'application/json' }, body: corps, credentials: 'same-origin' });
      if (r.status === 401) return ouvrir('verrouille');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || 'HTTP ' + r.status);
      const d = await r.json();
      bandeau('');
      etat('enregistre', ''); // repères pour les essais automatiques
      document.documentElement.dataset.coffreGeneration = d.generation;
      if (relance) { clearInterval(relance); relance = null; }
      window.dispatchEvent(new Event('odicolor-coffre-ok'));
    } catch (e) { echec('Enregistrement dans le coffre impossible : ' + e.message + '. Les décisions de compte sont suspendues tant que le coffre ne répond pas. Tes données affichées ne sont pas perdues ; réessaie l’import.'); }
  }

  async function demarrer() {
    let s;
    try { const r = await fetch('/api/statut', { headers: ENTETES, credentials: 'same-origin' }); if (!r.ok) return; s = await r.json(); } catch { return; }
    if (!s || s.application !== 'odicolor-local') return; // pas l'application locale : rien à faire
    if (!s.session) return ouvrir(s.coffreExiste ? '' : 'creer');
    const r = await fetch('/api/etat', { headers: ENTETES, credentials: 'same-origin' });
    if (r.status === 401) return ouvrir('verrouille');
    const d = await r.json();
    if (d.etat) window.OdicolorBureau.restaurer(d.etat, d.enregistreLe);
    if (d.alerte) bandeau(d.alerte);
    actif = true; etat('pret', '');
    window.addEventListener('odicolor-change', () => { clearTimeout(minuteur); minuteur = setTimeout(() => { enCours = enCours.then(enregistrer); }, 150); });
    setInterval(async () => { // verrouillage automatique du coffre : retour à l'écran de mot de passe
      try { const x = await (await fetch('/api/statut', { headers: ENTETES, credentials: 'same-origin' })).json(); if (!x.session) ouvrir('verrouille');
        else if (document.documentElement.dataset.coffre === 'inaccessible') { etat('pret', ''); window.dispatchEvent(new Event('odicolor-coffre-retabli')); } }
      catch { etat('inaccessible', 'Le programme local ODICOLOR ne répond plus : le coffre est inaccessible. Les décisions de compte sont suspendues.'); window.dispatchEvent(new CustomEvent('odicolor-coffre-echec', { detail: 'inaccessible' })); } // l'écran reste, rien n'est perdu
    }, Math.max(1000, Number(s.controleMs) || 30000));
  }
  demarrer();
})();
