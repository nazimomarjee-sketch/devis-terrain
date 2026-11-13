'use strict';
/* Banque locale — interface. Tout est stocké dans IndexedDB sur cet appareil.
 * Cette page ne fait aucune requête réseau (voir la règle connect-src 'none' dans index.html).
 * Les libellés bancaires sont des données non fiables : ils ne sont jamais insérés en HTML, uniquement en texte.
 */
(function () {
  const C = window.BanqueCoeur;
  const etat = { ops: [], regles: [], vue: 'synthese', mois: null, filtre: { texte: '', cat: '', mois: true }, limite: 200, apercu: null, nbMoisClaude: 6 };

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
  const euros = c => fmt.format(c / 100);
  const signe = c => (c > 0 ? '+' : '') + euros(c);
  const nomMois = m => new Date(m + '-01T00:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const jour = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  let minuterie;
  function toast(message) {
    const t = document.getElementById('toast');
    t.textContent = message; t.classList.add('visible');
    clearTimeout(minuterie); minuterie = setTimeout(() => t.classList.remove('visible'), 3500);
  }

  /* ---------- Stockage local ---------- */
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
    const lu = await transaction('readonly', (ops, divers) => Promise.all([demande(ops.getAll()), demande(divers.get('regles'))]));
    return { ops: lu[0], regles: lu[1] || [] };
  }

  /* Mode bureau : l'appli est servie par bureau.cjs sur ce PC et les données vivent dans un fichier du PC,
   * ce qui permet à un assistant local de les piloter. Le jeton est injecté par ce serveur, jamais par le site public. */
  const meta = document.querySelector('meta[name="banque-jeton"]');
  const BUREAU = meta ? meta.content : null;
  const bureau = { rev: 0, config: { detailPourAssistant: false }, dossier: '', dossierImport: '', journal: [] };
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
    etat.ops = d.ops.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    etat.regles = d.regles;
  }
  const ecrireOps = liste => BUREAU ? api('ops', { ops: liste }) : transaction('readwrite', ops => { liste.forEach(o => ops.put(o)); });
  const ecrireRegles = () => BUREAU ? api('regles', { regles: etat.regles }) : transaction('readwrite', (ops, divers) => { divers.put(etat.regles, 'regles'); });
  const toutRemplacer = (liste, regles) => BUREAU ? api('remplacer', { ops: liste, regles }) : transaction('readwrite', (ops, divers) => {
    ops.clear(); liste.forEach(o => ops.put(o)); divers.put(regles, 'regles');
  });

  /* ---------- Navigation ---------- */
  function aller(vue) { etat.vue = vue; etat.limite = 200; afficher(); window.scrollTo(0, 0); }
  function afficher() {
    document.querySelectorAll('.onglets button').forEach(b => {
      if (b.dataset.vue === etat.vue) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const mois = C.listeMois(etat.ops);
    if (!etat.mois || !mois.includes(etat.mois)) etat.mois = mois[mois.length - 1] || null;
    const app = document.getElementById('app');
    app.replaceChildren(...[VUES[etat.vue]()].flat(Infinity).filter(Boolean));
  }
  const vide = () => h('div', { class: 'carte' },
    h('p', null, 'Aucune opération pour l\'instant.'),
    h('p', { class: 'doux' }, 'Commencez par importer un relevé téléchargé depuis le site de votre banque.'),
    h('button', { class: 'bouton principal', type: 'button', onclick: () => aller('importer') }, 'Importer un relevé'));

  /* ---------- Synthèse ---------- */
  function vueSynthese() {
    if (!etat.ops.length) return vide();
    const mois = C.listeMois(etat.ops), i = mois.indexOf(etat.mois);
    const s = C.syntheseMois(etat.ops, etat.regles, etat.mois);
    const precedents = mois.slice(Math.max(0, i - 3), i).map(m => C.syntheseMois(etat.ops, etat.regles, m));
    const dernier = etat.ops[0].date, age = Math.floor((Date.now() - Date.parse(dernier)) / 864e5);
    const blocs = [];
    blocs.push(h('div', { class: 'mois' },
      h('button', { class: 'bouton', type: 'button', disabled: i <= 0, 'aria-label': 'Mois précédent', onclick: () => { etat.mois = mois[i - 1]; afficher(); } }, '‹'),
      h('strong', null, nomMois(etat.mois)),
      h('button', { class: 'bouton', type: 'button', disabled: i >= mois.length - 1, 'aria-label': 'Mois suivant', onclick: () => { etat.mois = mois[i + 1]; afficher(); } }, '›')));
    if (s.aClasser) blocs.push(h('div', { class: 'alerte' },
      h('span', null, s.aClasser + ' opération' + (s.aClasser > 1 ? 's' : '') + ' à classer ce mois-ci.'),
      h('button', { class: 'bouton', type: 'button', onclick: () => { etat.filtre = { texte: '', cat: C.A_CLASSER, mois: true }; aller('operations'); } }, 'Classer')));
    else if (i === mois.length - 1 && age > 10) blocs.push(h('div', { class: 'alerte' },
      h('span', null, 'Dernière opération connue il y a ' + age + ' jours (' + jour(dernier) + ').'),
      h('button', { class: 'bouton', type: 'button', onclick: () => aller('importer') }, 'Importer')));
    blocs.push(h('div', { class: 'tuiles' },
      h('div', { class: 'tuile' }, h('span', null, 'Entrées'), h('b', { class: 'plus' }, euros(s.entrees))),
      h('div', { class: 'tuile' }, h('span', null, 'Sorties'), h('b', { class: 'moins' }, euros(s.sorties))),
      h('div', { class: 'tuile' }, h('span', null, 'Solde du mois'), h('b', { class: s.solde >= 0 ? 'plus' : 'moins' }, signe(s.solde)))));
    if (i === mois.length - 1) blocs.push(h('p', { class: 'doux' }, 'Mois en cours possiblement incomplet : dernière opération le ' + jour(dernier) + '.'));

    const depenses = Object.entries(s.parCat).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
    const max = depenses.length ? -depenses[0][1] : 1;
    blocs.push(h('h2', null, 'Où part l\'argent'));
    blocs.push(h('div', { class: 'carte' }, depenses.length ? depenses.map(([cat, v]) => {
      const barre = h('i'); barre.style.width = Math.max(2, Math.round(-v / max * 100)) + '%';
      let ecart = null;
      if (precedents.length) {
        const moy = Math.round(precedents.reduce((a, p) => a + (p.parCat[cat] || 0), 0) / precedents.length);
        const d = v - moy;
        ecart = h('div', { class: 'ecart' }, 'Moyenne des ' + precedents.length + ' mois précédents : ' + euros(0 - moy)
          + (Math.abs(d) >= 100 ? ' (' + (d < 0 ? '+' : '−') + euros(Math.abs(d)).replace('-', '') + ')' : ''));
      }
      return h('button', { class: 'ligne-cat', type: 'button', onclick: () => { etat.filtre = { texte: '', cat, mois: true }; aller('operations'); } },
        h('div', { class: 'haut' }, h('span', null, cat), h('b', null, euros(-v))), h('div', { class: 'jauge' }, barre), ecart);
    }) : h('p', { class: 'doux' }, 'Aucune dépense ce mois-ci.')));
    if (s.neutre) blocs.push(h('p', { class: 'doux' }, 'Épargne et virements internes, exclus des totaux : ' + signe(s.neutre) + '.'));

    const rec = C.recurrentes(etat.ops, etat.regles);
    blocs.push(h('h2', null, 'Charges qui reviennent chaque mois'));
    blocs.push(h('div', { class: 'carte' }, rec.length ? [
      rec.map(r => h('div', { class: 'rangee' }, h('span', null, r.marchand, h('div', { class: 'doux' }, r.cat + ' · vu ' + r.nbMois + ' mois')), h('b', null, euros(r.montant)))),
      h('div', { class: 'rangee' }, h('strong', null, 'Total estimé par mois'), h('b', null, euros(rec.reduce((a, r) => a + r.montant, 0))))
    ] : h('p', { class: 'doux' }, 'Rien de détecté. Il faut au moins trois mois de relevés.')));
    return blocs;
  }

  /* ---------- Opérations ---------- */
  function opsFiltrees() {
    const f = etat.filtre, t = C.normaliser(f.texte);
    return etat.ops.filter(o => (!f.mois || o.date.slice(0, 7) === etat.mois)
      && (!f.cat || C.categorie(o, etat.regles) === f.cat)
      && (!t || C.normaliser(o.libelle).includes(t)));
  }
  async function changerCategorie(op, cat) {
    op.catManuelle = cat;
    const aEcrire = [op];
    const saisie = prompt('Catégorie « ' + cat + ' » enregistrée pour cette opération.\n\nPour classer de la même façon les opérations semblables (déjà importées et à venir), validez ce mot-clé ou raccourcissez-le. Annuler = cette opération seulement.', C.marchand(op.libelle));
    const motif = saisie ? C.normaliser(saisie) : '';
    if (motif.length >= 3) {
      etat.regles = etat.regles.filter(r => r.motif !== motif).concat({ motif, cat });
      for (const o of etat.ops) if (o !== op && o.catManuelle && (' ' + C.normaliser(o.libelle) + ' ').includes(' ' + motif + ' ')) { delete o.catManuelle; aEcrire.push(o); }
      await ecrireRegles();
    }
    await ecrireOps(aEcrire);
    toast('Catégorie enregistrée.');
    afficher();
  }
  function vueOperations() {
    if (!etat.ops.length) return vide();
    const f = etat.filtre;
    const recherche = h('input', { type: 'search', placeholder: 'Rechercher un libellé', value: f.texte, 'aria-label': 'Rechercher',
      oninput: e => { f.texte = e.target.value; rendreListe(); } });
    const cats = h('select', { 'aria-label': 'Catégorie', onchange: e => { f.cat = e.target.value; afficher(); } },
      h('option', { value: '' }, 'Toutes les catégories'), C.CATEGORIES.map(c => h('option', { value: c, selected: c === f.cat }, c)));
    const periode = h('select', { 'aria-label': 'Période', onchange: e => { f.mois = e.target.value === 'mois'; afficher(); } },
      h('option', { value: 'mois', selected: f.mois }, nomMois(etat.mois)), h('option', { value: 'tout', selected: !f.mois }, 'Toutes les dates'));
    const zone = h('div', { class: 'carte' }), resume = h('p', { class: 'doux' });
    function rendreListe() {
      const l = opsFiltrees();
      resume.textContent = l.length + ' opération' + (l.length > 1 ? 's' : '') + ' · total ' + signe(l.reduce((a, o) => a + o.montant, 0));
      zone.replaceChildren(...(l.length ? l.slice(0, etat.limite).map(o => {
        const cat = C.categorie(o, etat.regles);
        return h('div', { class: 'op' },
          h('div', { class: 'haut' }, h('span', { class: 'lib' }, o.libelle), h('b', { class: o.montant > 0 ? 'plus' : '' }, signe(o.montant))),
          h('div', { class: 'bas' }, h('span', null, jour(o.date) + ' · ' + o.compte),
            h('select', { 'aria-label': 'Catégorie de l\'opération', onchange: e => changerCategorie(o, e.target.value) },
              C.CATEGORIES.map(c => h('option', { value: c, selected: c === cat }, c)))));
      }) : [h('p', { class: 'doux' }, 'Aucune opération ne correspond.')]));
      if (l.length > etat.limite) zone.append(h('div', { class: 'actions' },
        h('button', { class: 'bouton', type: 'button', onclick: () => { etat.limite += 200; rendreListe(); } }, 'Afficher plus (' + (l.length - etat.limite) + ' restantes)')));
    }
    rendreListe();
    return [h('div', { class: 'filtres' }, recherche, cats, periode), resume, zone];
  }

  /* ---------- Import ---------- */
  async function lireFichier(fichier) {
    const octets = await fichier.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(octets); }
    catch (e) { return new TextDecoder('windows-1252').decode(octets); }
  }
  async function preparerImport(fichiers, compte) {
    const ids = new Set(etat.ops.map(o => o.id));
    const apercu = { compte, fichiers: [], ajouts: [], doublons: 0, refus: [] };
    for (const f of fichiers) {
      if (f.size > 20 * 1024 * 1024) { apercu.fichiers.push({ nom: f.name, erreur: 'Fichier trop volumineux (plus de 20 Mo).' }); continue; }
      const r = C.lireReleve(await lireFichier(f));
      const fusion = C.fusionner(ids, C.identifier(r.ops, compte));
      fusion.ajouts.forEach(o => ids.add(o.id));
      apercu.ajouts.push(...fusion.ajouts); apercu.doublons += fusion.doublons.length;
      r.refus.forEach(x => apercu.refus.push(f.name + ', ligne ' + x.ligne + ' : ' + x.motif));
      apercu.fichiers.push({ nom: f.name, format: r.format, lues: r.ops.length, erreur: r.erreur });
    }
    etat.apercu = apercu; afficher();
  }
  async function validerImport() {
    const a = etat.apercu;
    await ecrireOps(a.ajouts);
    etat.apercu = null; await charger();
    etat.mois = null; etat.filtre = { texte: '', cat: '', mois: true };
    toast(a.ajouts.length + ' opération(s) ajoutée(s).');
    aller('synthese');
  }
  function vueImporter() {
    const comptes = [...new Set(etat.ops.map(o => o.compte))];
    const compte = h('input', { type: 'text', id: 'compte', maxLength: 40, value: (etat.apercu && etat.apercu.compte) || comptes[0] || 'Compte courant', list: 'comptes' });
    const fichier = h('input', { type: 'file', id: 'fichier', multiple: true, accept: '.csv,.ofx,.qfx,.txt,text/csv' });
    const blocs = [
      h('div', { class: 'carte' },
        h('p', null, 'Sur le site de votre banque, téléchargez vos opérations au format CSV ou OFX, puis choisissez le fichier ici.'),
        h('p', { class: 'doux' }, 'Le fichier est lu sur cet appareil. Rien n\'est envoyé. Vous pouvez réimporter un relevé qui chevauche le précédent : les opérations déjà présentes sont ignorées.'),
        h('label', { for: 'compte' }, 'Nom du compte (libre, sans numéro)'), compte,
        h('datalist', { id: 'comptes' }, comptes.map(c => h('option', { value: c }))),
        h('label', { for: 'fichier' }, 'Relevé(s) à importer'), fichier,
        h('div', { class: 'actions' }, h('button', { class: 'bouton principal', type: 'button', onclick: () => {
          const nom = compte.value.trim().replace(/\|/g, ' ');
          if (!nom) return toast('Donnez un nom au compte.');
          if (!fichier.files.length) return toast('Choisissez un fichier.');
          preparerImport([...fichier.files], nom).catch(e => toast('Lecture impossible : ' + e.message));
        } }, 'Analyser le fichier')))];
    const a = etat.apercu;
    if (a) {
      const entrees = a.ajouts.filter(o => o.montant > 0).reduce((s, o) => s + o.montant, 0);
      const sorties = a.ajouts.filter(o => o.montant < 0).reduce((s, o) => s + o.montant, 0);
      const dates = a.ajouts.map(o => o.date).sort();
      blocs.push(h('h2', null, 'Vérifiez avant d\'enregistrer'));
      blocs.push(h('div', { class: 'carte' },
        a.fichiers.map(f => h('div', { class: 'rangee' }, h('span', null, f.nom), h('b', null, f.erreur ? 'Refusé' : f.lues + ' lues (' + f.format + ')'))),
        a.fichiers.filter(f => f.erreur).map(f => h('p', { class: 'moins' }, f.nom + ' : ' + f.erreur)),
        h('div', { class: 'rangee' }, h('span', null, 'Nouvelles opérations'), h('b', null, String(a.ajouts.length))),
        h('div', { class: 'rangee' }, h('span', null, 'Déjà présentes, ignorées'), h('b', null, String(a.doublons))),
        h('div', { class: 'rangee' }, h('span', null, 'Lignes refusées'), h('b', null, String(a.refus.length))),
        a.ajouts.length ? [
          h('div', { class: 'rangee' }, h('span', null, 'Période'), h('b', null, jour(dates[0]) + ' → ' + jour(dates[dates.length - 1]))),
          h('div', { class: 'rangee' }, h('span', null, 'Total des entrées'), h('b', { class: 'plus' }, euros(entrees))),
          h('div', { class: 'rangee' }, h('span', null, 'Total des sorties'), h('b', { class: 'moins' }, euros(sorties)))] : null,
        h('p', { class: 'doux' }, 'Comparez ces totaux avec ceux de votre banque. Si les montants ou les dates sont faux, n\'enregistrez pas.'),
        a.refus.length ? h('details', null, h('summary', null, 'Voir les lignes refusées'), h('ul', null, a.refus.slice(0, 50).map(r => h('li', null, r)))) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'bouton principal', type: 'button', disabled: !a.ajouts.length, onclick: () => validerImport().catch(e => toast('Enregistrement impossible : ' + e.message)) }, 'Enregistrer ' + a.ajouts.length + ' opération(s)'),
          h('button', { class: 'bouton', type: 'button', onclick: () => { etat.apercu = null; afficher(); } }, 'Annuler'))));
    }
    return blocs;
  }

  /* ---------- Claude ---------- */
  function vueClaude() {
    if (!etat.ops.length) return vide();
    const texte = C.resumePourClaude(etat.ops, etat.regles, etat.nbMoisClaude);
    const zone = h('textarea', { readOnly: true, value: texte, 'aria-label': 'Résumé à copier' });
    return [
      h('div', { class: 'carte' },
        h('p', null, 'Ce résumé ne contient que des totaux par catégorie. Aucun libellé, aucun commerçant, aucun nom de compte.'),
        h('p', { class: 'doux' }, 'Rien n\'est envoyé automatiquement : vous copiez le texte ci-dessous, puis vous le collez vous-même dans Claude. Relisez-le avant.'),
        h('label', { for: 'duree' }, 'Période couverte'),
        h('select', { id: 'duree', onchange: e => { etat.nbMoisClaude = Number(e.target.value); afficher(); } },
          [3, 6, 12].map(n => h('option', { value: n, selected: n === etat.nbMoisClaude }, n + ' derniers mois')))),
      zone,
      h('div', { class: 'actions' }, h('button', { class: 'bouton principal', type: 'button', onclick: async () => {
        try { await navigator.clipboard.writeText(texte); toast('Résumé copié. Collez-le dans Claude.'); }
        catch (e) { zone.focus(); zone.select(); toast('Copie automatique impossible : le texte est sélectionné, copiez-le à la main.'); }
      } }, 'Copier le résumé'))];
  }

  /* ---------- Réglages ---------- */
  function telecharger(nom, contenu) {
    const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    const a = h('a', { href: url, download: nom }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function vueReglages() {
    const restaurer = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Fichier de sauvegarde', onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const v = C.validerSauvegarde(JSON.parse(await f.text()));
        if (!confirm('Remplacer les ' + etat.ops.length + ' opération(s) actuelles par les ' + v.ops.length + ' de la sauvegarde ?')) return;
        await toutRemplacer(v.ops, v.regles); await charger(); etat.mois = null;
        toast('Sauvegarde restaurée.'); aller('synthese');
      } catch (err) { toast(err.message || 'Fichier illisible.'); e.target.value = ''; }
    } });
    const assistant = BUREAU ? [
      h('h2', null, 'Assistant'),
      h('div', { class: 'carte' },
        h('p', null, 'Votre assistant peut lire les totaux, importer les relevés déposés dans le dossier d\'import et préparer un résumé. Il ne peut ni effacer ni restaurer vos données.'),
        h('p', { class: 'doux' }, 'Dossier d\'import : ' + bureau.dossierImport),
        h('label', { class: 'case' },
          h('input', { type: 'checkbox', checked: bureau.config.detailPourAssistant, onchange: async e => {
            try { bureau.config = (await api('config', { detailPourAssistant: e.target.checked })).config; toast(bureau.config.detailPourAssistant ? 'L\'assistant voit maintenant les libellés.' : 'Libellés masqués pour l\'assistant.'); }
            catch (err) { toast(err.message); }
            afficher();
          } }),
          h('span', null, 'Autoriser l\'assistant à voir les libellés et à classer les opérations')),
        h('p', { class: 'doux' }, 'Décoché : il ne voit que des totaux par catégorie. Coché : chaque libellé qu\'il lit peut partir chez le fournisseur de son intelligence artificielle si celle-ci n\'est pas locale.'),
        h('details', null, h('summary', null, 'Dernières actions de l\'assistant'),
          bureau.journal.length ? h('ul', null, bureau.journal.map(l => { const c = l.split('\t'); return h('li', null, new Date(c[0]).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + c[1] + ' · ' + c[2] + (c[3] ? ' · ' + c[3] : '')); }))
            : h('p', { class: 'doux' }, 'Aucune action enregistrée.')))] : null;
    return [
      assistant,
      h('h2', null, 'Sauvegarde'),
      h('div', { class: 'carte' },
        h('p', null, etat.ops.length + ' opération(s) sur cet appareil, ' + etat.regles.length + ' règle(s) personnelle(s).'),
        h('p', { class: 'doux' }, BUREAU
          ? 'Les données sont dans le dossier ' + bureau.dossier + ' de ce PC. Une copie datée est gardée chaque jour de modification dans son sous-dossier « sauvegardes » (30 jours). Ces fichiers ne sont pas chiffrés.'
          : 'Les données n\'existent que dans ce navigateur. Si vous videz ses données ou changez d\'appareil, elles sont perdues sans sauvegarde. Le fichier de sauvegarde n\'est pas chiffré : rangez-le en lieu sûr.'),
        h('div', { class: 'actions' }, h('button', { class: 'bouton principal', type: 'button', disabled: !etat.ops.length, onclick: () => {
          telecharger('banque-locale-' + new Date().toISOString().slice(0, 10) + '.json',
            JSON.stringify({ format: 'banque-locale', version: 1, exporteLe: new Date().toISOString(), ops: etat.ops, regles: etat.regles }));
        } }, 'Télécharger une sauvegarde')),
        h('label', null, 'Restaurer une sauvegarde (remplace tout)'), restaurer),
      h('h2', null, 'Mes règles de catégorie'),
      h('div', { class: 'carte' }, etat.regles.length ? etat.regles.map(r => h('div', { class: 'rangee' },
        h('span', null, r.motif, h('div', { class: 'doux' }, r.cat)),
        h('button', { class: 'bouton', type: 'button', onclick: async () => { etat.regles = etat.regles.filter(x => x !== r); await ecrireRegles(); afficher(); } }, 'Supprimer')))
        : h('p', { class: 'doux' }, 'Aucune. Une règle se crée quand vous changez la catégorie d\'une opération et acceptez de l\'appliquer aux opérations semblables.')),
      h('h2', null, 'Tout effacer'),
      h('div', { class: 'carte' },
        h('p', { class: 'doux' }, 'Supprime toutes les opérations et toutes les règles de cet appareil. Irréversible sans sauvegarde.'),
        h('button', { class: 'bouton danger', type: 'button', disabled: !etat.ops.length && !etat.regles.length, onclick: async () => {
          if (prompt('Pour tout effacer, tapez EFFACER') !== 'EFFACER') return toast('Rien n\'a été effacé.');
          await toutRemplacer([], []); await charger(); etat.mois = null; toast('Tout est effacé.'); afficher();
        } }, 'Effacer toutes les données'))];
  }

  const VUES = { synthese: vueSynthese, operations: vueOperations, importer: vueImporter, claude: vueClaude, reglages: vueReglages };

  /* ---------- Démarrage ---------- */
  document.querySelectorAll('.onglets button').forEach(b => b.addEventListener('click', () => aller(b.dataset.vue)));
  charger().then(afficher).catch(e => {
    document.getElementById('app').replaceChildren(h('div', { class: 'alerte' }, (BUREAU ? 'Le programme local ne répond pas : ' : 'Stockage local indisponible : ') + (e && e.message || 'erreur inconnue') + '. La navigation privée peut en être la cause.'));
  });
  if (BUREAU) {
    document.getElementById('etat').textContent = 'Mode bureau : données dans un fichier de ce PC';
    /* Si l'assistant modifie les données, l'écran se met à jour tout seul (sauf pendant un import en cours). */
    setInterval(async () => {
      if (document.hidden || etat.apercu) return;
      const connue = bureau.rev;
      try { const d = await api('rev'); if (d.rev !== connue) {
          const tous = C.listeMois(etat.ops), surDernier = etat.mois === tous[tous.length - 1];
          await charger(); if (surDernier) etat.mois = null;
          afficher(); toast('Données mises à jour.');
        } } catch (e) { /* programme arrêté : on réessaie au prochain tour */ }
    }, 3000);
  } else {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
      navigator.serviceWorker.register('sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
})();
