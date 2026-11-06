'use strict';
// Écran d'ouverture du coffre ODICOLOR. Le mot de passe ne part que dans le corps d'une requête POST vers ce PC
// (127.0.0.1), jamais dans l'adresse ; les champs sont vidés aussitôt après l'envoi.
(function () {
  const $ = s => document.querySelector(s), H = { 'X-ODICOLOR': '1', 'Content-Type': 'application/json' };
  const BUREAU = '/bureau/index.html#bureau';
  const message = (t, ok) => { const m = $('#message'); m.textContent = t || ''; m.className = t ? (ok ? 'ok' : 'erreur') : ''; };
  const montrer = id => { for (const x of ['#f-ouvrir', '#f-creer', '#s-secours-cle', '#f-secours']) $(x).hidden = x !== id; const i = $(id).querySelector('input'); if (i) i.focus(); };
  async function appel(chemin, corps) {
    const r = await fetch(chemin, { method: 'POST', headers: H, body: JSON.stringify(corps), credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erreur || 'Refusé.');
    return d;
  }
  const vider = (...ids) => ids.forEach(i => { $(i).value = ''; });

  $('#f-ouvrir').addEventListener('submit', async e => {
    e.preventDefault(); const mdp = $('#mdp').value; vider('#mdp'); message('Ouverture…', true); $('#valider').disabled = true;
    try { await appel('/api/deverrouiller', { motDePasse: mdp }); location.replace(BUREAU); }
    catch (x) { message(x.message); $('#mdp').focus(); } finally { $('#valider').disabled = false; }
  });
  $('#f-creer').addEventListener('submit', async e => {
    e.preventDefault(); const a = $('#nouveau-mdp').value, b = $('#nouveau-mdp2').value; vider('#nouveau-mdp', '#nouveau-mdp2');
    if (a !== b) return message('Les deux mots de passe sont différents.');
    message('Création du coffre…', true);
    try { const d = await appel('/api/creer', { motDePasse: a }); $('#cle-secours').textContent = d.cleSecours; montrer('#s-secours-cle'); message(''); }
    catch (x) { message(x.message); }
  });
  $('#note').addEventListener('change', () => { $('#continuer').disabled = !$('#note').checked; });
  $('#continuer').addEventListener('click', () => { $('#cle-secours').textContent = ''; location.replace(BUREAU); });
  $('#oubli').addEventListener('click', () => { message(''); montrer('#f-secours'); });
  $('#retour').addEventListener('click', () => { message(''); montrer('#f-ouvrir'); });
  $('#f-secours').addEventListener('submit', async e => {
    e.preventDefault(); const cle = $('#cle').value, a = $('#nouveau').value, b = $('#nouveau2').value; vider('#cle', '#nouveau', '#nouveau2');
    if (a !== b) return message('Les deux mots de passe sont différents.');
    try { await appel('/api/secours', { cleSecours: cle, nouveauMotDePasse: a }); location.replace(BUREAU); } catch (x) { message(x.message); }
  });

  fetch('/api/statut', { headers: { 'X-ODICOLOR': '1' }, credentials: 'same-origin' }).then(r => r.json()).then(s => {
    if (s.session) return location.replace(BUREAU);
    montrer(s.coffreExiste ? '#f-ouvrir' : '#f-creer');
    if (/raison=verrouille/.test(location.search)) message('Coffre verrouillé (inactivité ou fermeture). Saisis ton mot de passe.', true);
  }).catch(() => message('Application locale ODICOLOR injoignable : relance-la.'));
})();
