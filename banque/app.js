'use strict';
/* Banque locale — interface. Finances personnelles, sans connexion à une banque.
 * Mode navigateur : tout est dans IndexedDB sur cet appareil et la page n'a le droit d'envoyer aucune donnée
 * (règle connect-src 'none' dans index.html). Mode bureau : voir bureau.cjs.
 * Les libellés bancaires sont des données non fiables : jamais insérés en HTML, uniquement en texte.
 */
(function () {
  const C = window.BanqueCoeur;
  const etat = { ops: [], regles: [], comptes: [], echeances: [], budgets: {}, seuil: 0,
    vue: 'aujourdhui', mois: null, filtre: { texte: '', cat: '', mois: true }, limite: 200, apercu: null, nbMoisClaude: 6 };
  const donnees = () => ({ ops: etat.ops, regles: etat.regles, comptes: etat.comptes, echeances: etat.echeances, budgets: etat.budgets, seuil: etat.seuil });

  /* ---------- Petits outils d'affichage ---------- */
  function h(balise, attrs, ...enfants) {
    const el = document.createElement(balise);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const e of enfants.flat(Infinity)) if (e != null && e !== false) el.append(e);
    return el;
  }
  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const euros = c => fmt.format((c || 0) / 100);
  const signe = c => (c > 0 ? '+' : '') + euros(c);
  const saisie = c => (c / 100).toFixed(2).replace('.', ',');
  const nomMois = m => new Date(m + '-01T00:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const jour = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const jourCourt = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  function auj() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const bouton = (texte, action, classe, extra) => h('button', Object.assign({ class: 'bouton' + (classe ? ' ' + classe : ''), type: 'button', onclick: action }, extra || {}), texte);
  const rangee = (gauche, droite, classe) => h('div', { class: 'rangee' }, h('span', null, gauche), h('b', { class: classe || '' }, droite));
  let minuterie;
  function toast(message) {
    const t = document.getElementById('toast');
    t.textContent = message; t.classList.add('visible');
    clearTimeout(minuterie); minuterie = setTimeout(() => t.classList.remove('visible'), 3500);
  }
  const echec = e => toast((e && e.message) || 'Action impossible.');

  /** Fenêtre de saisie. champs : { nom, label, type: texte|montant|date|nombre|choix|case|mois|secret, valeur, options, aide, facultatif, relatif }. */
  function formulaire({ titre, intro, champs, valider, libelleValider, libelleAnnuler, supprimer }) {
    const fenetre = h('dialog', { class: 'fenetre' }), ctl = {}, erreur = h('p', { class: 'moins', role: 'alert' });
    const fermer = () => { fenetre.close(); fenetre.remove(); };
    const lignes = champs.map(c => {
      const id = 'f-' + c.nom;
      let el;
      if (c.type === 'choix') el = h('select', { id }, c.options.map(o => h('option', { value: o[0], selected: String(o[0]) === String(c.valeur) }, o[1])));
      else if (c.type === 'case') el = h('input', { id, type: 'checkbox', checked: !!c.valeur });
      else el = h('input', { id, value: c.valeur == null ? '' : c.valeur,
        type: ({ date: 'date', mois: 'month', secret: 'password', nombre: 'number' })[c.type] || 'text',
        inputMode: c.type === 'montant' ? 'decimal' : null, min: c.min, max: c.max, maxLength: c.type === 'texte' ? 60 : null,
        autocomplete: c.type === 'secret' ? 'new-password' : 'off', placeholder: c.type === 'montant' ? '0,00' : null });
      ctl[c.nom] = el;
      return c.type === 'case'
        ? h('label', { class: 'case' }, el, h('span', null, c.label))
        : [h('label', { for: id }, c.label + (c.facultatif ? ' (facultatif)' : '')), el, c.aide ? h('p', { class: 'doux' }, c.aide) : null];
    });
    const form = h('form', { onsubmit: async e => {
      e.preventDefault(); erreur.textContent = '';
      const v = {};
      try {
        for (const c of champs) {
          const el = ctl[c.nom], brut = c.type === 'case' ? el.checked : el.value.trim();
          if (c.type === 'case') { v[c.nom] = brut; continue; }
          if (c.type === 'choix') { v[c.nom] = brut; continue; }
          if (brut === '') { if (c.facultatif) { v[c.nom] = null; continue; } throw new Error('Champ à remplir : ' + c.label + '.'); }
          if (c.type === 'montant') {
            const m = C.parseMontant(brut);
            if (m === null || (!c.relatif && m <= 0)) throw new Error(c.label + ' : montant non reconnu' + (c.relatif ? '.' : ' (un nombre positif, par exemple 12,50).'));
            v[c.nom] = m;
          } else if (c.type === 'nombre') {
            const n = Number(brut);
            if (!Number.isInteger(n) || n < c.min || n > c.max) throw new Error(c.label + ' : un nombre entre ' + c.min + ' et ' + c.max + '.');
            v[c.nom] = n;
          } else if (c.type === 'date') { if (C.parseDate(brut) !== brut) throw new Error(c.label + ' : date invalide.'); v[c.nom] = brut; }
          else v[c.nom] = brut;
        }
        await valider(v);
        fermer(); afficher();
      } catch (err) { erreur.textContent = (err && err.message) || 'Enregistrement impossible.'; }
    } },
      h('h2', null, titre), intro ? h('p', { class: 'doux' }, intro) : null, lignes, erreur,
      h('div', { class: 'actions' },
        h('button', { class: 'bouton principal', type: 'submit' }, libelleValider || 'Enregistrer'),
        bouton(libelleAnnuler || 'Annuler', fermer),
        supprimer ? bouton('Supprimer', async () => { try { await supprimer(); fermer(); afficher(); } catch (err) { erreur.textContent = err.message; } }, 'danger') : null));
    fenetre.append(form);
    fenetre.addEventListener('cancel', () => fenetre.remove());
    document.body.append(fenetre); fenetre.showModal();
  }

  /* ---------- Stockage ---------- */
  const DIVERS = ['regles', 'comptes', 'echeances', 'budgets', 'seuil'];
  let base;
  function ouvrir() {
    return new Promise((ok, ko) => {
      const r = indexedDB.open('banque-locale', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('ops', { keyPath: 'id' }); r.result.createObjectStore('divers'); };
      r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
    });
  }
  function transaction(mode, action) {
    return new Promise((ok, ko) => {
      const t = base.transaction(['ops', 'divers'], mode);
      let resultat;
      t.oncomplete = () => ok(resultat); t.onerror = t.onabort = () => ko(t.error || new Error('Écriture impossible'));
      resultat = action(t.objectStore('ops'), t.objectStore('divers'));
    });
  }
  const demande = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  async function chargerNavigateur() {
    base = base || await ouvrir();
    const lu = await transaction('readonly', (ops, divers) => Promise.all([demande(ops.getAll()), ...DIVERS.map(k => demande(divers.get(k)))]));
    const d = { ops: lu[0] };
    DIVERS.forEach((k, i) => { d[k] = lu[i + 1]; });
    return d;
  }

  /* Mode bureau : l'appli est servie par bureau.cjs sur ce PC et les données vivent dans un fichier du PC.
   * Le jeton est injecté par ce programme local, jamais par le site public. */
  const meta = document.querySelector('meta[name="banque-jeton"]');
  const BUREAU = meta ? meta.content : null;
  const bureau = { rev: 0, config: { assistant: 'aucun' }, dossier: '', dossierImport: '', journal: [] };
  async function api(chemin, corps) {
    const rep = await fetch('api/' + chemin, {
      method: corps ? 'POST' : 'GET', cache: 'no-store',
      headers: Object.assign({ Authorization: 'Bearer ' + BUREAU }, corps ? { 'Content-Type': 'application/json' } : {}),
      body: corps ? JSON.stringify(corps) : undefined
    });
    const d = await rep.json().catch(() => ({}));
    if (!rep.ok) throw new Error(d.erreur || 'Le programme local ne répond pas.');
    if (Number.isInteger(d.rev)) bureau.rev = d.rev;
    return d;
  }

  async function charger() {
    let d;
    if (BUREAU) { d = await api('donnees'); Object.assign(bureau, { config: d.config, dossier: d.dossier, dossierImport: d.dossierImport, journal: d.journal }); }
    else d = await chargerNavigateur();
    etat.ops = (d.ops || []).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    etat.regles = d.regles || []; etat.comptes = d.comptes || []; etat.echeances = d.echeances || [];
    etat.budgets = d.budgets || {}; etat.seuil = Number.isInteger(d.seuil) ? d.seuil : 0;
  }
  async function ecrireOps(liste, supprimer) {
    if (BUREAU) await api('ops', { ops: liste, supprimer: supprimer || [] });
    else await transaction('readwrite', ops => { (supprimer || []).forEach(id => ops.delete(id)); liste.forEach(o => ops.put(o)); });
    const retirer = new Set(supprimer || []), parId = new Map(etat.ops.filter(o => !retirer.has(o.id)).map(o => [o.id, o]));
    liste.forEach(o => parId.set(o.id, o));
    etat.ops = [...parId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  function ecrireDivers() {
    const d = donnees();
    if (BUREAU) return api('divers', Object.fromEntries(DIVERS.map(k => [k, d[k]])));
    return transaction('readwrite', (ops, divers) => { DIVERS.forEach(k => divers.put(d[k], k)); });
  }
  async function toutRemplacer(v) {
    if (BUREAU) await api('remplacer', v);
    else await transaction('readwrite', (ops, divers) => { ops.clear(); v.ops.forEach(o => ops.put(o)); DIVERS.forEach(k => divers.put(v[k], k)); });
    await charger();
  }

  /* ---------- Navigation ---------- */
  const SOUS_PLUS = ['plus', 'importer', 'claude'];
  function aller(vue) { etat.vue = vue; etat.limite = 200; afficher(); window.scrollTo(0, 0); }
  function afficher() {
    document.querySelectorAll('.onglets button').forEach(b => {
      const actif = b.dataset.vue === etat.vue || (b.dataset.vue === 'plus' && SOUS_PLUS.includes(etat.vue));
      if (actif) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const mois = C.listeMois(etat.ops);
    if (etat.vue !== 'budget' && (!etat.mois || !mois.includes(etat.mois))) etat.mois = mois[mois.length - 1] || null;
    document.getElementById('app').replaceChildren(...[VUES[etat.vue]()].flat(Infinity).filter(Boolean));
  }
  const nomsComptes = () => [...new Set([...etat.comptes.map(c => c.nom), ...etat.ops.map(o => o.compte)])];

  /* ---------- Comptes ---------- */
  function formulaireCompte(nom) {
    const c = etat.comptes.find(x => x.nom === nom), s = nom ? C.soldes(etat.comptes, etat.ops).parCompte.find(x => x.nom === nom) : null;
    formulaire({
      titre: nom ? 'Solde de « ' + nom + ' »' : 'Ajouter un compte',
      intro: 'Indiquez le solde affiché par votre banque en ce moment. L\'appli ajoutera ensuite les opérations saisies ou importées après aujourd\'hui. Refaites-le dès que le chiffre dérive : c\'est le recalage le plus simple.',
      champs: [
        nom ? null : { nom: 'nom', label: 'Nom du compte (libre, sans numéro)', type: 'texte', valeur: etat.comptes.length ? '' : 'Compte courant' },
        { nom: 'solde', label: 'Solde actuel', type: 'montant', relatif: true, valeur: s && s.solde !== null ? saisie(s.solde) : '' },
        { nom: 'epargne', label: 'Compte d\'épargne (exclu de l\'argent disponible)', type: 'case', valeur: c && c.epargne }
      ].filter(Boolean),
      async valider(v) {
        const cible = nom || v.nom.replace(/\|/g, ' ').slice(0, 40);
        if (!nom && nomsComptes().includes(cible)) throw new Error('Un compte porte déjà ce nom.');
        etat.comptes = etat.comptes.filter(x => x.nom !== cible).concat({ nom: cible, soldeRef: v.solde, dateRef: auj(), refLe: Date.now(), epargne: v.epargne });
        await ecrireDivers(); toast('Solde enregistré.');
      },
      supprimer: nom && c && !etat.ops.some(o => o.compte === nom) ? async () => { etat.comptes = etat.comptes.filter(x => x.nom !== nom); await ecrireDivers(); } : null
    });
  }

  /* ---------- Saisie manuelle d'une opération ---------- */
  function formulaireOperation(sens, op) {
    const comptes = nomsComptes();
    formulaire({
      titre: op ? 'Modifier la saisie' : sens > 0 ? 'Ajouter un revenu' : 'Ajouter une dépense',
      champs: [
        { nom: 'montant', label: 'Montant', type: 'montant', valeur: op ? saisie(Math.abs(op.montant)) : '' },
        { nom: 'libelle', label: 'Quoi', type: 'texte', valeur: op ? op.libelle : '' },
        { nom: 'date', label: 'Date', type: 'date', valeur: op ? op.date : auj() },
        { nom: 'cat', label: 'Catégorie', type: 'choix', valeur: op ? op.catManuelle || '' : '', options: [['', 'Automatique']].concat(C.CATEGORIES.map(c => [c, c])) },
        { nom: 'compte', label: 'Compte', type: 'choix', valeur: op ? op.compte : comptes[0], options: (comptes.length ? comptes : ['Compte courant']).map(c => [c, c]) }
      ],
      async valider(v) {
        const n = { id: op ? op.id : 'M|' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), date: v.date, libelle: v.libelle.slice(0, 60), montant: sens * v.montant, compte: v.compte, saisieLe: op ? op.saisieLe : Date.now() };
        if (!n.saisieLe) delete n.saisieLe;
        if (v.cat) n.catManuelle = v.cat;
        await ecrireOps([n]); toast('Enregistré.');
      },
      supprimer: op ? () => ecrireOps([], [op.id]) : null
    });
  }

  /* ---------- Aujourd'hui ---------- */
  function vueAujourdhui() {
    const d = donnees(), jourJ = auj(), s = C.soldes(etat.comptes, etat.ops), p = C.prevision(d, jourJ), al = C.alertes(d, jourJ);
    const blocs = [];
    const etapes = [
      ['Indiquer le solde de mon compte', s.connus > 0, () => formulaireCompte(s.inconnus[0] || null)],
      ['Déclarer mes revenus, charges fixes et crédits', etat.echeances.length > 0, () => aller('echeances')],
      ['Importer un relevé ou saisir une première dépense', etat.ops.length > 0, () => aller('importer')]
    ];
    if (etapes.some(e => !e[1])) blocs.push(h('div', { class: 'carte' },
      h('h2', null, 'Mise en route'),
      h('p', { class: 'doux' }, 'Trois étapes, dans l\'ordre que vous voulez. La prévision de fin de mois apparaît dès la première.'),
      etapes.map(e => h('div', { class: 'rangee' }, h('span', { class: e[1] ? 'fait' : '' }, (e[1] ? '✓ ' : '○ ') + e[0]), e[1] ? null : bouton('Faire', e[2])))));

    blocs.push(h('div', { class: 'carte' },
      h('span', { class: 'doux' }, 'Argent disponible'),
      h('div', { class: 'grand ' + (s.disponible < 0 ? 'moins' : '') }, s.parCompte.some(c => c.solde !== null && !c.epargne) ? euros(s.disponible) : '—'),
      s.parCompte.map(c => h('div', { class: 'rangee' },
        h('span', null, c.nom + (c.epargne ? ' (épargne)' : ''),
          h('div', { class: 'doux' }, c.solde === null ? 'Solde non renseigné' : 'Relevé le ' + jourCourt(c.dateRef) + (c.opsDepuis ? ' + ' + c.opsDepuis + ' opération' + (c.opsDepuis > 1 ? 's' : '') : ''))),
        h('span', { class: 'droite' }, c.solde === null ? null : h('b', null, euros(c.solde)), bouton(c.solde === null ? 'Renseigner' : 'Mettre à jour', () => formulaireCompte(c.nom), 'petit')))),
      h('div', { class: 'actions' }, bouton('− Dépense', () => formulaireOperation(-1), 'principal'), bouton('+ Revenu', () => formulaireOperation(1)), bouton('Ajouter un compte', () => formulaireCompte(null)))));

    if (al.length) blocs.push(
      al.slice(0, 3).map(a => h('div', { class: 'alerte ' + a.niveau }, a.texte)),
      al.length > 3 ? h('details', null, h('summary', null, (al.length - 3) + ' autre(s) alerte(s)'), al.slice(3).map(a => h('div', { class: 'alerte ' + a.niveau }, a.texte))) : null);

    if (!p.inconnu) blocs.push(h('h2', null, 'Fin du mois'), h('div', { class: 'carte' },
      h('span', { class: 'doux' }, 'Solde prévu au ' + C.dateEcheance({ jour: 31 }, p.mois).slice(8) + '/' + p.mois.slice(5)),
      h('div', { class: 'grand ' + (p.soldeFin < 0 ? 'moins' : 'plus') }, euros(p.soldeFin)),
      rangee('Disponible aujourd\'hui', euros(p.disponible)),
      rangee('Revenus attendus', signe(p.revenusAttendus), 'plus'),
      rangee('Charges et crédits à venir', euros(p.chargesAVenir)),
      rangee(h('span', null, 'Dépenses courantes estimées', h('div', { class: 'doux' }, euros(p.parJour) + ' par jour × ' + p.joursRestants + ' jours, d\'après ' + p.base)), euros(p.variablesRestantes)),
      rangee('Point le plus bas', euros(p.pointBas.montant) + ' le ' + jourCourt(p.pointBas.date), p.pointBas.montant < 0 ? 'moins' : ''),
      h('p', { class: 'doux' }, 'C\'est une estimation : elle vaut ce que valent votre solde, vos échéances et vos opérations. Mettez le solde à jour si elle vous semble fausse.')));

    const ech = C.etatEcheances(etat.echeances, etat.ops, jourJ.slice(0, 7));
    if (ech.length) blocs.push(h('h2', null, 'Échéances de ' + nomMois(jourJ.slice(0, 7))), h('div', { class: 'carte' },
      ech.map(x => h('div', { class: 'rangee' },
        h('span', null, jourCourt(x.date) + ' · ' + x.echeance.libelle,
          h('div', { class: 'doux ' + (!x.reglee && x.date < jourJ ? 'moins' : '') }, x.reglee ? '✓ Vue dans vos opérations' : x.date < jourJ ? 'Pas encore vue' : 'À venir')),
        h('b', { class: x.echeance.montant > 0 ? 'plus' : '' }, signe(x.echeance.montant)))),
      h('div', { class: 'actions' }, bouton('Gérer les échéances', () => aller('echeances')))));
    return blocs;
  }

  /* ---------- Échéances ---------- */
  const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const TITRES = { charge: 'Charges fixes', credit: 'Crédits', revenu: 'Revenus réguliers' };
  function formulaireEcheance(type, e, modele) {
    const src = e || modele || {}, freq = !src.mois || !src.mois.length ? '1' : src.mois.length === 1 ? '12' : '3';
    formulaire({
      titre: e ? 'Modifier « ' + e.libelle + ' »' : ({ charge: 'Ajouter une charge fixe', credit: 'Ajouter un crédit', revenu: 'Ajouter un revenu régulier' })[type],
      champs: [
        { nom: 'libelle', label: 'Nom', type: 'texte', valeur: src.libelle || '' },
        { nom: 'montant', label: type === 'credit' ? 'Mensualité' : 'Montant', type: 'montant', valeur: src.montant ? saisie(Math.abs(src.montant)) : '' },
        { nom: 'jour', label: 'Jour du mois (1 à 31)', type: 'nombre', min: 1, max: 31, valeur: src.jour || '' },
        { nom: 'freq', label: 'Fréquence', type: 'choix', valeur: freq, options: [['1', 'Chaque mois'], ['3', 'Tous les 3 mois'], ['12', 'Une fois par an']] },
        { nom: 'mois', label: 'Mois de l\'échéance (annuelle) ou premier mois (trimestrielle)', type: 'choix', valeur: src.mois && src.mois.length ? src.mois[0] : new Date().getMonth() + 1, options: NOMS_MOIS.map((n, i) => [i + 1, n]), aide: 'Ignoré si la fréquence est « Chaque mois ».' },
        type === 'revenu' ? null : { nom: 'cat', label: 'Catégorie', type: 'choix', valeur: src.cat && src.cat !== C.A_CLASSER ? src.cat : 'Logement', options: C.CATEGORIES.filter(c => !['Revenus', 'Entrées diverses', C.A_CLASSER].includes(c)).map(c => [c, c]) },
        type === 'credit' ? { nom: 'fin', label: 'Dernière mensualité', type: 'mois', valeur: src.fin || '', facultatif: true } : null,
        { nom: 'motif', label: 'Mot-clé du relevé', type: 'texte', valeur: src.motif || '', facultatif: true, aide: 'Un mot du libellé bancaire (par exemple le nom de l\'organisme). Il permet de reconnaître le paiement quand le montant varie.' }
      ].filter(Boolean),
      async valider(v) {
        const n = { id: e ? e.id : 'E' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), libelle: v.libelle, montant: (type === 'revenu' ? 1 : -1) * v.montant, jour: v.jour, cat: type === 'revenu' ? 'Revenus' : v.cat, type };
        const m = Number(v.mois);
        if (v.freq === '12') n.mois = [m];
        if (v.freq === '3') n.mois = [0, 3, 6, 9].map(k => (m - 1 + k) % 12 + 1).sort((a, b) => a - b);
        if (v.fin) { if (!/^\d{4}-\d{2}$/.test(v.fin)) throw new Error('Dernière mensualité : choisissez un mois.'); n.fin = v.fin; }
        if (v.motif && C.normaliser(v.motif).length >= 3) n.motif = C.normaliser(v.motif);
        etat.echeances = etat.echeances.filter(x => x.id !== n.id).concat(n);
        await ecrireDivers(); toast('Échéance enregistrée.');
      },
      supprimer: e ? async () => { etat.echeances = etat.echeances.filter(x => x.id !== e.id); await ecrireDivers(); } : null
    });
  }
  function vueEcheances() {
    const moisJ = auj().slice(0, 7);
    const rev = C.totalMensuel(etat.echeances, 'revenu'), ch = C.totalMensuel(etat.echeances, 'charge'), cr = C.totalMensuel(etat.echeances, 'credit');
    const blocs = [h('div', { class: 'carte' },
      h('span', { class: 'doux' }, 'Reste pour vivre chaque mois, une fois le fixe payé'),
      h('div', { class: 'grand ' + (rev + ch + cr < 0 ? 'moins' : '') }, etat.echeances.length ? euros(rev + ch + cr) : '—'),
      rangee('Revenus réguliers', signe(rev), 'plus'), rangee('Charges fixes', euros(ch)), rangee('Crédits', euros(cr)),
      h('p', { class: 'doux' }, 'Montants lissés : une échéance annuelle compte pour un douzième.'))];
    const sugg = C.suggestionsEcheances(etat.ops, etat.regles, etat.echeances);
    if (sugg.length) blocs.push(h('h2', null, 'Repérées dans vos relevés'), h('div', { class: 'carte' },
      h('p', { class: 'doux' }, 'Ces mouvements reviennent chaque mois. Ajoutez ceux qui sont de vraies échéances ; vous pourrez corriger le nom et le montant.'),
      sugg.map(x => h('div', { class: 'rangee' },
        h('span', null, x.libelle, h('div', { class: 'doux' }, 'vers le ' + x.jour + ' · vu ' + x.nbMois + ' mois · ' + x.cat)),
        h('span', { class: 'droite' }, h('b', { class: x.montant > 0 ? 'plus' : '' }, signe(x.montant)), bouton('Ajouter', () => formulaireEcheance(x.type, null, x), 'petit'))))));
    for (const type of ['revenu', 'charge', 'credit']) {
      const liste = etat.echeances.filter(e => e.type === type).sort((a, b) => a.jour - b.jour);
      blocs.push(h('h2', null, TITRES[type]), h('div', { class: 'carte' },
        liste.length ? liste.map(e => {
          let detail = 'le ' + e.jour + (e.mois && e.mois.length ? ' · ' + e.mois.map(m => NOMS_MOIS[m - 1]).join(', ') : ' de chaque mois');
          if (e.fin) {
            let n = 0; for (let m = moisJ; m <= e.fin && n < 600; m = C.moisSuivant(m)) if (C.echeanceDue(e, m)) n++;
            detail += n ? ' · encore ' + n + ' mensualité' + (n > 1 ? 's' : '') + ', soit ' + euros(-e.montant * n) + ' (fin ' + nomMois(e.fin) + ')' : ' · terminé';
          }
          return h('button', { class: 'ligne-cat', type: 'button', onclick: () => formulaireEcheance(type, e) },
            h('div', { class: 'haut' }, h('span', null, e.libelle), h('b', { class: e.montant > 0 ? 'plus' : '' }, signe(e.montant))), h('div', { class: 'ecart' }, detail));
        }) : h('p', { class: 'doux' }, 'Aucune pour l\'instant.'),
        h('div', { class: 'actions' }, bouton('Ajouter', () => formulaireEcheance(type), liste.length ? '' : 'principal'))));
    }
    return blocs;
  }

  /* ---------- Budget (synthèse du mois) ---------- */
  function vueBudget() {
    const moisJ = auj().slice(0, 7);
    const mois = [...new Set([...C.listeMois(etat.ops), moisJ])].sort();
    if (!etat.mois || !mois.includes(etat.mois)) etat.mois = moisJ;
    const i = mois.indexOf(etat.mois), d = donnees();
    const s = C.syntheseMois(etat.ops, etat.regles, etat.mois);
    const precedents = mois.slice(Math.max(0, i - 3), i).map(m => C.syntheseMois(etat.ops, etat.regles, m));
    const blocs = [h('div', { class: 'mois' },
      bouton('‹', () => { etat.mois = mois[i - 1]; afficher(); }, '', { disabled: i <= 0, 'aria-label': 'Mois précédent' }),
      h('strong', null, nomMois(etat.mois)),
      bouton('›', () => { etat.mois = mois[i + 1]; afficher(); }, '', { disabled: i >= mois.length - 1, 'aria-label': 'Mois suivant' }))];
    if (s.aClasser) blocs.push(h('div', { class: 'alerte orange' },
      h('span', null, s.aClasser + ' opération' + (s.aClasser > 1 ? 's' : '') + ' à classer ce mois-ci.'),
      bouton('Classer', () => { etat.filtre = { texte: '', cat: C.A_CLASSER, mois: true }; aller('operations'); })));
    blocs.push(h('div', { class: 'tuiles' },
      h('div', { class: 'tuile' }, h('span', null, 'Entrées'), h('b', { class: 'plus' }, euros(s.entrees))),
      h('div', { class: 'tuile' }, h('span', null, 'Sorties'), h('b', { class: 'moins' }, euros(s.sorties))),
      h('div', { class: 'tuile' }, h('span', null, 'Solde du mois'), h('b', { class: s.solde >= 0 ? 'plus' : 'moins' }, signe(s.solde)))));

    const cats = [...new Set([...Object.entries(s.parCat).filter(([, v]) => v < 0).map(([c]) => c), ...Object.keys(etat.budgets)])]
      .map(c => ({ cat: c, depense: Math.max(0, -(s.parCat[c] || 0)), budget: etat.budgets[c] || 0 })).sort((a, b) => b.depense - a.depense);
    const max = Math.max(1, ...cats.map(c => c.depense));
    const totalBudget = cats.reduce((a, c) => a + c.budget, 0);
    blocs.push(h('h2', null, 'Dépenses et budget'));
    blocs.push(h('div', { class: 'carte' },
      cats.length ? cats.map(c => {
        const barre = h('i', { class: c.budget && c.depense > c.budget ? 'depasse' : '' });
        barre.style.width = Math.min(100, Math.max(2, Math.round(c.depense / (c.budget || max) * 100))) + '%';
        let ecart = null;
        if (c.budget) ecart = c.depense > c.budget ? 'Dépassé de ' + euros(c.depense - c.budget) : 'Reste ' + euros(c.budget - c.depense) + ' sur ' + euros(c.budget);
        else if (precedents.length) ecart = 'Moyenne des ' + precedents.length + ' mois précédents : ' + euros(0 - Math.round(precedents.reduce((a, p) => a + (p.parCat[c.cat] || 0), 0) / precedents.length)) + ' · pas de budget';
        return h('button', { class: 'ligne-cat', type: 'button', onclick: () => formulaire({
          titre: c.cat, intro: 'Dépensé en ' + nomMois(etat.mois) + ' : ' + euros(c.depense) + '.',
          champs: [{ nom: 'budget', label: 'Budget mensuel', type: 'montant', valeur: c.budget ? saisie(c.budget) : '', facultatif: true, aide: 'Laissez vide pour ne pas fixer de budget.' }],
          async valider(v) { if (v.budget) etat.budgets[c.cat] = v.budget; else delete etat.budgets[c.cat]; await ecrireDivers(); },
          libelleAnnuler: 'Fermer'
        }) },
          h('div', { class: 'haut' }, h('span', null, c.cat), h('b', null, euros(c.depense))), h('div', { class: 'jauge' }, barre), ecart ? h('div', { class: 'ecart ' + (c.budget && c.depense > c.budget ? 'moins' : '') }, ecart) : null);
      }) : h('p', { class: 'doux' }, 'Aucune dépense ce mois-ci.'),
      totalBudget ? rangee('Total des budgets', euros(totalBudget)) : null,
      cats.length ? h('p', { class: 'doux' }, 'Touchez une catégorie pour fixer ou modifier son budget.') : null,
      (() => {
        const prop = C.budgetsProposes(d, auj()), n = Object.keys(prop).length;
        return n ? h('div', { class: 'actions' }, bouton('Proposer ' + n + ' budget' + (n > 1 ? 's' : '') + ' d\'après mes 3 derniers mois', async () => {
          Object.assign(etat.budgets, prop);
          try { await ecrireDivers(); toast(n + ' budget(s) ajouté(s). Modifiez-les en touchant une catégorie.'); } catch (e) { echec(e); }
          afficher();
        })) : null;
      })()));
    if (s.neutre) blocs.push(h('p', { class: 'doux' }, 'Épargne et virements internes, exclus des totaux : ' + signe(s.neutre) + '.'));

    const pistes = C.pistes(d, auj());
    blocs.push(h('h2', null, 'Où économiser'));
    blocs.push(h('div', { class: 'carte' }, pistes.length
      ? [pistes.map(p => h('div', { class: 'rangee' }, h('span', null, p.titre, h('div', { class: 'doux' }, p.detail)))),
        h('p', { class: 'doux' }, 'Ce sont des constats tirés de vos opérations. C\'est vous qui décidez ce qui est inutile.')]
      : h('p', { class: 'doux' }, 'Rien à signaler pour l\'instant. Les constats apparaissent avec au moins un mois complet d\'opérations (trois pour les abonnements).')));
    return blocs;
  }

  /* ---------- Opérations ---------- */
  function opsFiltrees() {
    const f = etat.filtre, t = C.normaliser(f.texte);
    return etat.ops.filter(o => (!f.mois || !etat.mois || o.date.slice(0, 7) === etat.mois)
      && (!f.cat || C.categorie(o, etat.regles) === f.cat)
      && (!t || C.normaliser(o.libelle).includes(t)));
  }
  async function changerCategorie(op, cat) {
    op.catManuelle = cat;
    await ecrireOps([op]);
    afficher();
    formulaire({
      titre: 'Classer aussi les opérations semblables ?',
      intro: '« ' + cat + ' » est enregistré pour cette opération. Avec un mot-clé, les opérations qui le contiennent seront classées de la même façon, y compris les prochaines.',
      champs: [{ nom: 'motif', label: 'Mot-clé', type: 'texte', valeur: C.marchand(op.libelle), aide: 'Raccourcissez-le pour élargir (par exemple un seul nom de commerçant).' }],
      libelleValider: 'Créer la règle', libelleAnnuler: 'Cette opération seulement',
      async valider(v) {
        const motif = C.normaliser(v.motif);
        if (motif.length < 3) throw new Error('Mot-clé trop court (3 caractères au moins).');
        etat.regles = etat.regles.filter(r => r.motif !== motif).concat({ motif, cat });
        const aNettoyer = etat.ops.filter(o => o !== op && o.catManuelle && (' ' + C.normaliser(o.libelle) + ' ').includes(' ' + motif + ' '));
        aNettoyer.forEach(o => { delete o.catManuelle; });
        await ecrireDivers(); if (aNettoyer.length) await ecrireOps(aNettoyer);
        toast('Règle créée.');
      }
    });
  }
  function vueOperations() {
    const tete = h('div', { class: 'actions' }, bouton('− Dépense', () => formulaireOperation(-1), 'principal'), bouton('+ Revenu', () => formulaireOperation(1)), bouton('Importer un relevé', () => aller('importer')));
    if (!etat.ops.length) return [tete, h('div', { class: 'carte' }, h('p', { class: 'doux' }, 'Aucune opération pour l\'instant. Saisissez-en une, ou importez un relevé téléchargé depuis le site de votre banque.'))];
    const f = etat.filtre;
    const recherche = h('input', { type: 'search', placeholder: 'Rechercher un libellé', value: f.texte, 'aria-label': 'Rechercher', oninput: e => { f.texte = e.target.value; rendreListe(); } });
    const cats = h('select', { 'aria-label': 'Catégorie', onchange: e => { f.cat = e.target.value; afficher(); } },
      h('option', { value: '' }, 'Toutes les catégories'), C.CATEGORIES.map(c => h('option', { value: c, selected: c === f.cat }, c)));
    const periode = h('select', { 'aria-label': 'Période', onchange: e => { f.mois = e.target.value === 'mois'; afficher(); } },
      h('option', { value: 'mois', selected: f.mois }, nomMois(etat.mois)), h('option', { value: 'tout', selected: !f.mois }, 'Toutes les dates'));
    const zone = h('div', { class: 'carte' }), resume = h('p', { class: 'doux' });
    function rendreListe() {
      const l = opsFiltrees();
      resume.textContent = l.length + ' opération' + (l.length > 1 ? 's' : '') + ' · total ' + signe(l.reduce((a, o) => a + o.montant, 0));
      zone.replaceChildren(...(l.length ? l.slice(0, etat.limite).map(o => {
        const cat = C.categorie(o, etat.regles), manuelle = C.estManuelle(o);
        return h('div', { class: 'op' },
          h('div', { class: 'haut' }, h('span', { class: 'lib' }, o.libelle), h('b', { class: o.montant > 0 ? 'plus' : '' }, signe(o.montant))),
          h('div', { class: 'bas' }, h('span', null, jour(o.date) + ' · ' + o.compte + (manuelle ? ' · saisie' : '')),
            h('span', { class: 'droite' },
              manuelle ? bouton('Modifier', () => formulaireOperation(Math.sign(o.montant), o), 'petit') : null,
              h('select', { 'aria-label': 'Catégorie de l\'opération', onchange: e => changerCategorie(o, e.target.value).catch(echec) },
                C.CATEGORIES.map(c => h('option', { value: c, selected: c === cat }, c))))));
      }) : [h('p', { class: 'doux' }, 'Aucune opération ne correspond.')]));
      if (l.length > etat.limite) zone.append(h('div', { class: 'actions' }, bouton('Afficher plus (' + (l.length - etat.limite) + ' restantes)', () => { etat.limite += 200; rendreListe(); })));
    }
    rendreListe();
    return [tete, h('div', { class: 'filtres' }, recherche, cats, periode), resume, zone];
  }

  /* ---------- Import ---------- */
  async function lireFichier(fichier) {
    const octets = await fichier.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(octets); }
    catch (e) { return new TextDecoder('windows-1252').decode(octets); }
  }
  async function preparerImport(fichiers, compte) {
    const ids = new Set(etat.ops.map(o => o.id));
    const apercu = { compte, fichiers: [], ajouts: [], doublons: 0, refus: [], paires: [] };
    for (const f of fichiers) {
      if (f.size > 20 * 1024 * 1024) { apercu.fichiers.push({ nom: f.name, erreur: 'Fichier trop volumineux (plus de 20 Mo).' }); continue; }
      const r = C.lireReleve(await lireFichier(f));
      const fusion = C.fusionner(ids, C.identifier(r.ops, compte));
      fusion.ajouts.forEach(o => ids.add(o.id));
      apercu.ajouts.push(...fusion.ajouts); apercu.doublons += fusion.doublons.length;
      r.refus.forEach(x => apercu.refus.push(f.name + ', ligne ' + x.ligne + ' : ' + x.motif));
      apercu.fichiers.push({ nom: f.name, format: r.format, lues: r.ops.length, erreur: r.erreur });
    }
    apercu.paires = C.rapprocher(etat.ops, apercu.ajouts);
    etat.apercu = apercu; afficher();
  }
  async function validerImport() {
    const a = etat.apercu;
    await ecrireOps(a.ajouts, a.paires.map(p => p.manuelle.id));
    etat.apercu = null; etat.mois = null; etat.filtre = { texte: '', cat: '', mois: true };
    toast(a.ajouts.length + ' opération(s) ajoutée(s).');
    aller('aujourdhui');
  }
  function vueImporter() {
    const comptes = nomsComptes();
    const compte = h('input', { type: 'text', id: 'compte', maxLength: 40, value: (etat.apercu && etat.apercu.compte) || comptes[0] || 'Compte courant', list: 'comptes' });
    const fichier = h('input', { type: 'file', id: 'fichier', multiple: true, accept: '.csv,.ofx,.qfx,.txt,text/csv' });
    const blocs = [
      h('div', { class: 'carte' },
        h('p', null, 'Sur le site de votre banque, téléchargez vos opérations au format CSV ou OFX, puis choisissez le fichier ici.'),
        h('p', { class: 'doux' }, 'Le fichier est lu sur cet appareil. Rien n\'est envoyé et aucune connexion à la banque n\'est faite. Vous pouvez réimporter un relevé qui chevauche le précédent : les opérations déjà présentes sont ignorées.'),
        h('label', { for: 'compte' }, 'Nom du compte (libre, sans numéro)'), compte,
        h('datalist', { id: 'comptes' }, comptes.map(c => h('option', { value: c }))),
        h('label', { for: 'fichier' }, 'Relevé(s) à importer'), fichier,
        h('div', { class: 'actions' }, bouton('Analyser le fichier', () => {
          const nom = compte.value.trim().replace(/\|/g, ' ');
          if (!nom) return toast('Donnez un nom au compte.');
          if (!fichier.files.length) return toast('Choisissez un fichier.');
          preparerImport([...fichier.files], nom).catch(e => toast('Lecture impossible : ' + e.message));
        }, 'principal'), bouton('Retour', () => aller('plus'))))];
    const a = etat.apercu;
    if (a) {
      const entrees = a.ajouts.filter(o => o.montant > 0).reduce((s, o) => s + o.montant, 0);
      const sorties = a.ajouts.filter(o => o.montant < 0).reduce((s, o) => s + o.montant, 0);
      const dates = a.ajouts.map(o => o.date).sort();
      blocs.push(h('h2', null, 'Vérifiez avant d\'enregistrer'));
      blocs.push(h('div', { class: 'carte' },
        a.fichiers.map(f => rangee(f.nom, f.erreur ? 'Refusé' : f.lues + ' lues (' + f.format + ')')),
        a.fichiers.filter(f => f.erreur).map(f => h('p', { class: 'moins' }, f.nom + ' : ' + f.erreur)),
        rangee('Nouvelles opérations', String(a.ajouts.length)),
        rangee('Déjà présentes, ignorées', String(a.doublons)),
        a.paires.length ? rangee('Saisies manuelles retrouvées, remplacées', String(a.paires.length)) : null,
        rangee('Lignes refusées', String(a.refus.length)),
        a.ajouts.length ? [
          rangee('Période', jour(dates[0]) + ' → ' + jour(dates[dates.length - 1])),
          rangee('Total des entrées', euros(entrees), 'plus'),
          rangee('Total des sorties', euros(sorties), 'moins')] : null,
        h('p', { class: 'doux' }, 'Comparez ces totaux avec ceux de votre banque. Si les montants ou les dates sont faux, n\'enregistrez pas.'),
        a.refus.length ? h('details', null, h('summary', null, 'Voir les lignes refusées'), h('ul', null, a.refus.slice(0, 50).map(r => h('li', null, r)))) : null,
        h('div', { class: 'actions' },
          bouton('Enregistrer ' + a.ajouts.length + ' opération(s)', () => validerImport().catch(e => toast('Enregistrement impossible : ' + e.message)), 'principal', { disabled: !a.ajouts.length }),
          bouton('Annuler', () => { etat.apercu = null; afficher(); }))));
    }
    return blocs;
  }

  /* ---------- Résumé pour Claude ---------- */
  function vueClaude() {
    const texte = C.resumeComplet(donnees(), etat.nbMoisClaude, auj());
    if (!texte) return h('div', { class: 'carte' }, h('p', { class: 'doux' }, 'Le résumé se construit à partir de vos opérations. Importez un relevé d\'abord.'), bouton('Retour', () => aller('plus')));
    const zone = h('textarea', { readOnly: true, value: texte, 'aria-label': 'Résumé à copier' });
    return [
      h('div', { class: 'carte' },
        h('p', null, 'Ce résumé ne contient que des totaux. Aucun libellé, aucun commerçant, aucun nom de compte ni d\'échéance.'),
        h('p', { class: 'doux' }, 'Rien n\'est envoyé automatiquement : vous copiez le texte, puis vous le collez vous-même dans Claude. Relisez-le avant.'),
        h('label', { for: 'duree' }, 'Période couverte'),
        h('select', { id: 'duree', onchange: e => { etat.nbMoisClaude = Number(e.target.value); afficher(); } },
          [3, 6, 12].map(n => h('option', { value: n, selected: n === etat.nbMoisClaude }, n + ' derniers mois')))),
      zone,
      h('div', { class: 'actions' }, bouton('Copier le résumé', async () => {
        try { await navigator.clipboard.writeText(texte); toast('Résumé copié. Collez-le dans Claude.'); }
        catch (e) { zone.focus(); zone.select(); toast('Copie automatique impossible : le texte est sélectionné, copiez-le à la main.'); }
      }, 'principal'), bouton('Retour', () => aller('plus')))];
  }

  /* ---------- Sauvegarde chiffrée ---------- */
  const b64 = octets => btoa(String.fromCharCode(...new Uint8Array(octets)));
  const deb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  async function cleDepuis(motDePasse, sel) {
    const brut = await crypto.subtle.importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations: 600000 }, brut, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function chiffrer(texte, motDePasse) {
    const sel = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const octets = new TextEncoder().encode(texte), morceaux = [];
    const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cleDepuis(motDePasse, sel), octets));
    for (let i = 0; i < chiffre.length; i += 30000) morceaux.push(b64(chiffre.subarray(i, i + 30000)));
    return JSON.stringify({ format: 'banque-locale-chiffree', version: 1, sel: b64(sel), iv: b64(iv), donnees: morceaux });
  }
  async function dechiffrer(d, motDePasse) {
    const parties = d.donnees.map(deb64), total = new Uint8Array(parties.reduce((a, p) => a + p.length, 0));
    let pos = 0; for (const p of parties) { total.set(p, pos); pos += p.length; }
    try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(d.iv) }, await cleDepuis(motDePasse, deb64(d.sel)), total)); }
    catch (e) { throw new Error('Mot de passe incorrect ou fichier abîmé.'); }
  }
  function telecharger(nom, contenu) {
    const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    const a = h('a', { href: url, download: nom }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function exporter() {
    formulaire({
      titre: 'Télécharger une sauvegarde',
      intro: 'Avec un mot de passe, le fichier est chiffré : illisible sans lui, même s\'il traîne dans vos téléchargements ou une messagerie. Sans mot de passe, il est lisible par quiconque l\'ouvre.',
      champs: [
        { nom: 'mdp', label: 'Mot de passe', type: 'secret', facultatif: true, aide: 'Attention : un mot de passe oublié rend la sauvegarde irrécupérable. Personne ne peut le retrouver.' },
        { nom: 'mdp2', label: 'Mot de passe, à nouveau', type: 'secret', facultatif: true }],
      libelleValider: 'Télécharger',
      async valider(v) {
        if ((v.mdp || '') !== (v.mdp2 || '')) throw new Error('Les deux mots de passe sont différents.');
        if (v.mdp && v.mdp.length < 8) throw new Error('Mot de passe trop court : 8 caractères au moins.');
        const clair = JSON.stringify(Object.assign({ format: 'banque-locale', version: 2, exporteLe: new Date().toISOString() }, donnees()));
        telecharger('banque-locale-' + auj() + (v.mdp ? '-chiffree' : '') + '.json', v.mdp ? await chiffrer(clair, v.mdp) : clair);
      }
    });
  }
  async function restaurer(fichier) {
    const lu = JSON.parse(await fichier.text());
    const appliquer = async d => {
      const v = C.validerSauvegarde(d);
      if (!confirm('Remplacer toutes les données actuelles (' + etat.ops.length + ' opération(s)) par celles de la sauvegarde (' + v.ops.length + ' opération(s)) ?')) return;
      await toutRemplacer(v); etat.mois = null; etat.vue = 'aujourdhui'; toast('Sauvegarde restaurée.'); afficher();
    };
    if (lu && lu.format === 'banque-locale-chiffree' && Array.isArray(lu.donnees)) {
      formulaire({ titre: 'Sauvegarde chiffrée', champs: [{ nom: 'mdp', label: 'Mot de passe', type: 'secret' }], libelleValider: 'Ouvrir',
        async valider(v) { await appliquer(JSON.parse(await dechiffrer(lu, v.mdp))); } });
    } else await appliquer(lu);
  }

  /* ---------- Plus ---------- */
  const NIVEAUX = [['aucun', 'Aucun accès (recommandé tant que vous n\'en avez pas besoin)'], ['totaux', 'Totaux seulement : montants par catégorie, solde, prévision — aucun libellé'], ['detail', 'Détail : libellés des opérations, classement, règles']];
  function vuePlus() {
    const entree = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Fichier de sauvegarde', onchange: e => {
      const f = e.target.files[0]; if (!f) return;
      restaurer(f).catch(err => { toast(err.message && !/JSON/.test(err.message) ? err.message : 'Fichier illisible.'); }).finally(() => { e.target.value = ''; });
    } });
    const assistant = BUREAU ? [
      h('h2', null, 'Assistant (JARVIS ou autre)'),
      h('div', { class: 'carte' },
        h('p', null, 'Par défaut, aucun assistant ne peut lire ni modifier ces données. Vous seul pouvez ouvrir cet accès, ici, et le refermer à tout moment.'),
        h('label', { for: 'niveau' }, 'Accès accordé'),
        h('select', { id: 'niveau', onchange: async e => {
          try { bureau.config = (await api('config', { assistant: e.target.value })).config; toast('Accès de l\'assistant : ' + bureau.config.assistant + '.'); } catch (err) { echec(err); }
          afficher();
        } }, NIVEAUX.map(n => h('option', { value: n[0], selected: n[0] === bureau.config.assistant }, n[1]))),
        h('p', { class: 'doux' }, 'Même autorisé, un assistant ne peut ni effacer ni restaurer vos données, et ne lit que les relevés déposés dans ' + bureau.dossierImport + '. Tout ce qu\'il lit peut partir chez le fournisseur de son intelligence artificielle si celle-ci n\'est pas locale.'),
        h('details', null, h('summary', null, 'Dernières actions demandées par un assistant'),
          bureau.journal.length ? h('ul', null, bureau.journal.map(l => { const c = l.split('\t'); return h('li', null, new Date(c[0]).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + c[1] + ' · ' + c[2] + (c[3] ? ' · ' + c[3] : '')); }))
            : h('p', { class: 'doux' }, 'Aucune.')))] : null;
    return [
      h('div', { class: 'carte' }, h('div', { class: 'actions' }, bouton('Importer un relevé', () => aller('importer'), 'principal'), bouton('Résumé pour Claude', () => aller('claude')))),
      assistant,
      h('h2', null, 'Sauvegarde'),
      h('div', { class: 'carte' },
        h('p', null, etat.ops.length + ' opération(s), ' + etat.echeances.length + ' échéance(s), ' + etat.comptes.length + ' compte(s).'),
        h('p', { class: 'doux' }, BUREAU
          ? 'Les données sont dans le dossier ' + bureau.dossier + ' de ce PC, non chiffrées : protégez votre session Windows par un mot de passe. Une copie datée est gardée chaque jour de modification (30 jours).'
          : 'Les données n\'existent que dans ce navigateur, sur cet appareil. Si vous videz ses données ou changez d\'appareil, elles sont perdues sans sauvegarde. Verrouillez votre téléphone : l\'appli n\'a pas de code à elle.'),
        h('div', { class: 'actions' }, bouton('Télécharger une sauvegarde', exporter, 'principal')),
        h('label', null, 'Restaurer une sauvegarde (remplace tout)'), entree),
      h('h2', null, 'Seuil d\'alerte'),
      h('div', { class: 'carte' },
        rangee('M\'alerter si le solde prévu en fin de mois passe sous', euros(etat.seuil)),
        h('div', { class: 'actions' }, bouton('Modifier', () => formulaire({ titre: 'Seuil d\'alerte', intro: 'Votre matelas de sécurité : en dessous, l\'appli vous prévient.',
          champs: [{ nom: 'seuil', label: 'Montant', type: 'montant', relatif: true, valeur: saisie(etat.seuil) }],
          async valider(v) { etat.seuil = v.seuil; await ecrireDivers(); } })))),
      h('h2', null, 'Mes règles de catégorie'),
      h('div', { class: 'carte' }, etat.regles.length ? etat.regles.map(r => h('div', { class: 'rangee' },
        h('span', null, r.motif, h('div', { class: 'doux' }, r.cat)),
        bouton('Supprimer', async () => { etat.regles = etat.regles.filter(x => x !== r); try { await ecrireDivers(); } catch (e) { echec(e); } afficher(); }, 'petit')))
        : h('p', { class: 'doux' }, 'Aucune. Une règle se crée quand vous changez la catégorie d\'une opération et acceptez de l\'appliquer aux opérations semblables.')),
      h('h2', null, 'Tout effacer'),
      h('div', { class: 'carte' },
        h('p', { class: 'doux' }, 'Supprime opérations, comptes, échéances, budgets et règles de cet appareil. Irréversible sans sauvegarde.'),
        bouton('Effacer toutes les données', () => formulaire({ titre: 'Tout effacer ?', intro: 'Pour confirmer, tapez EFFACER en majuscules.',
          champs: [{ nom: 'mot', label: 'Confirmation', type: 'texte' }], libelleValider: 'Effacer définitivement',
          async valider(v) {
            if (v.mot !== 'EFFACER') throw new Error('Le mot ne correspond pas. Rien n\'a été effacé.');
            await toutRemplacer({ ops: [], regles: [], comptes: [], echeances: [], budgets: {}, seuil: 0 }); etat.mois = null; toast('Tout est effacé.');
          } }), 'danger'))];
  }

  const VUES = { aujourdhui: vueAujourdhui, operations: vueOperations, echeances: vueEcheances, budget: vueBudget, plus: vuePlus, importer: vueImporter, claude: vueClaude };

  /* ---------- Démarrage ---------- */
  document.querySelectorAll('.onglets button').forEach(b => b.addEventListener('click', () => aller(b.dataset.vue)));
  charger().then(afficher).catch(e => {
    document.getElementById('app').replaceChildren(h('div', { class: 'alerte rouge' }, (BUREAU ? 'Le programme local ne répond pas : ' : 'Stockage local indisponible (la navigation privée peut en être la cause) : ') + (e && e.message || 'erreur inconnue')));
  });
  if (BUREAU) {
    document.getElementById('etat').textContent = 'Mode bureau : données dans un fichier de ce PC';
    /* Si les données changent ailleurs (import par un assistant autorisé), l'écran se met à jour, sauf pendant une saisie. */
    setInterval(async () => {
      if (document.hidden || etat.apercu || document.querySelector('dialog[open]')) return;
      const connue = bureau.rev;
      try {
        const d = await api('rev');
        if (d.rev !== connue) { const tous = C.listeMois(etat.ops), surDernier = etat.mois === tous[tous.length - 1]; await charger(); if (surDernier) etat.mois = null; afficher(); toast('Données mises à jour.'); }
      } catch (e) { /* programme arrêté : nouvel essai au prochain tour */ }
    }, 3000);
  } else {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
      navigator.serviceWorker.register('sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
})();
