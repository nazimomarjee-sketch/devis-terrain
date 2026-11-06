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
  const ouvrir = raison => location.replace('/ouvrir.html' + (raison ? '?raison=' + raison : ''));
  let actif = false, enCours = Promise.resolve(), minuteur = null;

  function bandeau(texte) { // seulement en cas d'échec d'enregistrement : rien ne doit passer inaperçu
    let b = document.getElementById('coffre-alerte');
    if (!b) { b = document.createElement('div'); b.id = 'coffre-alerte'; b.setAttribute('role', 'alert');
      b.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;padding:12px 16px;border-radius:10px;background:#3a0d12;color:#F4F2EF;border:1px solid #D41F2B;font:14px system-ui'; document.body.append(b); }
    b.textContent = texte; b.hidden = !texte;
  }

  async function enregistrer() {
    if (!actif) return;
    const corps = JSON.stringify(window.OdicolorBureau.exporter());
    try {
      const r = await fetch('/api/etat', { method: 'PUT', headers: { ...ENTETES, 'Content-Type': 'application/json' }, body: corps, credentials: 'same-origin' });
      if (r.status === 401) return ouvrir('verrouille');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || 'HTTP ' + r.status);
      const d = await r.json();
      bandeau('');
      document.documentElement.dataset.coffre = 'enregistre'; // repères pour les essais automatiques
      document.documentElement.dataset.coffreGeneration = d.generation;
    } catch (e) { bandeau('Enregistrement dans le coffre impossible : ' + e.message + '. Tes données affichées ne sont pas perdues ; réessaie l’import.'); }
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
    actif = true; document.documentElement.dataset.coffre = 'pret';
    window.addEventListener('odicolor-change', () => { clearTimeout(minuteur); minuteur = setTimeout(() => { enCours = enCours.then(enregistrer); }, 150); });
    setInterval(async () => { // verrouillage automatique du coffre : retour à l'écran de mot de passe
      try { const x = await (await fetch('/api/statut', { headers: ENTETES, credentials: 'same-origin' })).json(); if (!x.session) ouvrir('verrouille'); } catch { /* programme arrêté : l'écran reste, rien n'est perdu */ }
    }, Math.max(1000, Number(s.controleMs) || 30000));
  }
  demarrer();
})();
