'use strict';
/* ODICOLOR v28 — apparence sombre permanente, accueil épuré.
 * Aucun sélecteur de couleur ni préférence stockée.
 * Aucune donnée client, devis ou EBP modifiée. */
(function () {
  document.documentElement.setAttribute('data-theme','dark');

  const accueilPrecedent = pageAccueil;
  pageAccueil = async function () {
    await accueilPrecedent();
    if ((location.hash || '#/') !== '#/') return;
    const sous = $('#sous');
    if (sous) {
      const maintenant = new Date();
      sous.textContent = 'Terrain · ' + maintenant.toLocaleDateString('fr-FR', {
        weekday:'long',day:'numeric',month:'long'
      });
    }
    // En cas de navigation depuis une version précédente, enlever l'ancien bandeau.
    const ancienChoix = app.querySelector('.v26-affichage');
    if (ancienChoix) ancienChoix.remove();
  };

  const reglagesPrecedents = pageReglages;
  pageReglages = async function () {
    await reglagesPrecedents();
    const ancienPanel = app.querySelector('.v26-prefs');
    if (ancienPanel) ancienPanel.remove();
    const titre = app.querySelector('.v25-etat .v25-etat-titre strong');
    if (titre) titre.textContent = 'ODICOLOR Solution · v28';
    const detail = app.querySelector('.v25-etat small.mut');
    if (detail) detail.textContent =
      'Thème sombre permanent · devis et suivi commercial conservés.';
  };
})();