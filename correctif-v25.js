'use strict';
/* ODICOLOR v25 — affichage de version cohérent, et mises à jour PWA sans suppression de données.
   Pas de lecture ni modification des clients, devis ou autres données IndexedDB. */
(function () {
  const ancienneRoute = route;
  route = async function () {
    const page = (location.hash || '#/').slice(2).split('/')[0];
    document.body.classList.toggle('v25-reglages', page === 'reglages');
    return ancienneRoute();
  };

  const anciennePageReglages = pageReglages;
  pageReglages = async function () {
    await anciennePageReglages();
    const regles = [
      /^Version v21\s*·/,
      /^Module commercial v22\s*·/,
      /^Accueil commercial v23\s*·/,
      /^Suivi commercial produits v24\s*·/
    ];
    for (const el of app.querySelectorAll('p')) {
      if (regles.some(re => re.test((el.textContent || '').trim()))) el.remove();
    }
    const ok24 = !!window.__suiviProduitsV24;
    const zone = h('section', { class:'carte v25-etat', role:'status' },
      h('div', {class:'v25-etat-titre'}, h('strong', {}, 'ODICOLOR Solution · v25'),
        h('span', {class:'tag '+(ok24?'ok':'warn')}, ok24?'Modules chargés':'Module à vérifier')),
      h('p', {}, ok24
        ? 'Accueil commercial, opportunités et suivi des besoins produits disponibles.'
        : 'Le module produits n’est pas chargé. Rouvre l’application en étant connecté.'),
      h('small', {class:'mut'}, 'Noyau devis v21 conservé. Modules commerciaux v22 à v24 et correctifs v25.'),
      h('p', {class:'mut'}, 'Les données clients et devis restent sur ce téléphone. Certaines fonctions peuvent transmettre des informations uniquement lorsque tu le demandes explicitement.'),
      h('a', {class:'btn sec',href:'#/besoins'}, 'Ouvrir le suivi produits'));
    app.append(zone);
  };

  function banniererMiseAJour() {
    if (document.getElementById('v25-maj')) return;
    const info = h('div', {id:'v25-maj',class:'v25-maj',role:'status'},
      h('strong', {}, 'Mise à jour de l’application prête'),
      h('p', {}, 'Tes clients et devis restent enregistrés. Sauvegarde tout travail en cours avant d’actualiser.'),
      h('div', {class:'actions'},
        h('button', {class:'btn',onclick:()=>location.reload()}, 'Actualiser'),
        h('button', {class:'btn sec',onclick:()=>info.remove()}, 'Plus tard')));
    document.body.append(info);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', banniererMiseAJour);
    navigator.serviceWorker.ready.then(reg => {
      if (reg && typeof reg.update === 'function' && navigator.onLine) reg.update().catch(() => {});
    }).catch(() => {});
  }
})();
