'use strict';
/* ODICOLOR v26 : apparence choisie par le vendeur.
 * Préférence de présentation locale, sans modification des données EBP, devis ou clients. */
(function () {
  const CLE = 'odicolor.apparence';
  const MODES = ['light','dark','auto'];
  const NOMS = {light:'Clair',dark:'Sombre',auto:'Auto'};
  const ICONES = {light:'☀',dark:'☾',auto:'◐'};
  let mode = 'light'; // Lisibilité de jour par défaut ; le choix de l’utilisateur prévaut.

  try {
    const p = localStorage.getItem(CLE);
    if (MODES.includes(p)) mode = p;
  } catch (_) { /* Accès localStorage parfois désactivé : préférence de session. */ }

  function appliquer(n) {
    if (!MODES.includes(n)) return;
    mode = n;
    if (n === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', n);
    try { localStorage.setItem(CLE, n); } catch (_) {}
    document.dispatchEvent(new CustomEvent('odicolor-apparence', {detail:{mode:n}}));
  }
  appliquer(mode);

  function etiquette() { return ICONES[mode] + ' ' + NOMS[mode]; }

  function afficheurRapide() {
    const b = h('button', {
      type:'button',
      class:'v26-switch',
      title:'Changer le thème visuel',
      'aria-label':'Thème : ' + NOMS[mode] + '. Appuyer pour changer.',
      onclick: () => {
        appliquer(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
        actualiser();
      }
    }, etiquette());

    function actualiser() {
      b.textContent = etiquette();
      b.setAttribute('aria-label','Thème : ' + NOMS[mode] + '. Appuyer pour changer.');
      b.setAttribute('title',mode==='auto'?'Apparence selon les réglages du téléphone':'Apparence '+NOMS[mode].toLowerCase());
    }
    actualiser();
    return b;
  }

  const accueilAvant = pageAccueil;
  pageAccueil = async function () {
    await accueilAvant();
    if ((location.hash || '#/') !== '#/') return;
    const sous = $('#sous');
    if (sous) {
      const n = new Date();
      sous.textContent = n.toLocaleDateString('fr-FR', {
        weekday:'long',day:'numeric',month:'long',year:'numeric'
      }) + ' · Commercial carrosserie';
    }
    const entete = app.querySelector('.v23-surtitre');
    if (entete && !app.querySelector('.v26-affichage')) {
      const barre = h('div',{class:'v26-affichage'},
        h('span',{class:'mut'},'Pour travailler au garage'),
        afficheurRapide());
      entete.after(barre);
    }
  };

  const reglagesAvant = pageReglages;
  pageReglages = async function () {
    await reglagesAvant();

    // Un indicateur clair de la version de l'interface, et pas une succession
    // d'anciens numéros affichés comme si plusieurs applications coexistaient.
    const titre = app.querySelector('.v25-etat .v25-etat-titre strong');
    if (titre) titre.textContent = 'ODICOLOR Solution · v26';
    const detail = app.querySelector('.v25-etat small.mut');
    if (detail) detail.textContent =
      'Interface v26 · moteur de devis v21 et modules commerciaux conservés.';

    const selection = h('div',{class:'v26-theme-choices',role:'group',
      'aria-label':'Choisir le thème de l’application'});
    const boutons = [];
    function actualiser() {
      boutons.forEach(({n,b})=>{
        b.classList.toggle('on',n===mode);
        b.setAttribute('aria-pressed',String(n===mode));
      });
    }
    MODES.forEach(n=>{
      const b=h('button',{type:'button',class:'v26-theme-button',
        'aria-pressed':String(n===mode),
        onclick:()=>{appliquer(n);actualiser();}},
        ICONES[n]+' '+NOMS[n]);
      selection.append(b);
      boutons.push({n,b});
    });
    actualiser();

    const panel = h('section',{class:'carte v26-prefs'},
      h('strong',{},'Apparence de l’application'),
      h('p',{class:'mut'},'Clair : conseillé pour les visites et le travail en journée. Sombre : confortable le soir. Auto : suit ton Samsung.'),
      selection,
      h('small',{class:'mut'},'Préférence enregistrée sur ce téléphone. Aucun impact sur les données clients et les devis.'));

    const sauvegarde=Array.from(app.querySelectorAll('h2'))
      .find(x=>/Sauvegarde/i.test(x.textContent||''));
    if (sauvegarde) sauvegarde.before(panel);
    else app.prepend(panel);
  };
  window.__odicolorV26 = {getMode:()=>mode,choisir:appliquer};
})();
