/* ODICOLOR Bureau — logique pure (aucun accès au DOM, aucune écriture).
   Testée par tests/bureau-lot1.test.cjs. Ne modifie jamais les données reçues.
   Classement géographique : code postal et commune, vérifiés contre la liste officielle
   des communes d'Île-de-France (communes-idf.js). Aucune coordonnée GPS n'est créée. */
(function (racine) {
  'use strict';
  const COMMUNES = (typeof module === 'object' && module.exports) ? require('./communes-idf.js') : racine.COMMUNES_IDF;
  if (!Array.isArray(COMMUNES)) throw new Error('communes-idf.js doit être chargé avant bureau-logique.js');

  // Départements d'Île-de-France. centre = commune préfecture (vue de la carte uniquement).
  const DEPARTEMENTS = Object.freeze([
    { dep: '75', nom: 'Paris', centre: [48.8566, 2.3522], zoom: 12 },
    { dep: '77', nom: 'Seine-et-Marne', centre: [48.5421, 2.6554], zoom: 9 },
    { dep: '78', nom: 'Yvelines', centre: [48.8049, 2.1204], zoom: 10 },
    { dep: '91', nom: 'Essonne', centre: [48.6291, 2.4405], zoom: 10 },
    { dep: '92', nom: 'Hauts-de-Seine', centre: [48.8924, 2.2069], zoom: 11 },
    { dep: '93', nom: 'Seine-Saint-Denis', centre: [48.9077, 2.4397], zoom: 11 },
    { dep: '94', nom: 'Val-de-Marne', centre: [48.7904, 2.4556], zoom: 11 },
    { dep: '95', nom: "Val-d'Oise", centre: [49.0364, 2.0761], zoom: 10 }
  ]);
  const depInfo = d => DEPARTEMENTS.find(x => x.dep === d) || null;

  // Les 8 villes de la maquette = portes d'entrée vers leur département.
  // lat/lng = centre de la commune (donnée publique), PAS un garage.
  const TERRITOIRES = Object.freeze([
    { id: 'goussainville', nom: 'Goussainville', insee: '95280', dep: '95', lat: 49.0325, lng: 2.4747, grille: [6, 0] },
    { id: 'nanterre', nom: 'Nanterre', insee: '92050', dep: '92', lat: 48.8924, lng: 2.2069, grille: [1, 1] },
    { id: 'paris', nom: 'Paris', insee: '75056', dep: '75', lat: 48.8566, lng: 2.3522, grille: [4, 1] },
    { id: 'versailles', nom: 'Versailles', insee: '78646', dep: '78', lat: 48.8049, lng: 2.1204, grille: [0, 4] },
    { id: 'creteil', nom: 'Créteil', insee: '94028', dep: '94', lat: 48.7904, lng: 2.4556, grille: [7, 3] },
    { id: 'massy', nom: 'Massy', insee: '91377', dep: '91', lat: 48.7309, lng: 2.2713, grille: [4, 6] },
    { id: 'palaiseau', nom: 'Palaiseau', insee: '91477', dep: '91', lat: 48.7146, lng: 2.2457, grille: [2, 7] },
    { id: 'evry', nom: 'Évry-Courcouronnes', insee: '91228', dep: '91', lat: 48.6291, lng: 2.4405, grille: [7, 7] }
  ].map(t => Object.assign(t, { depNom: depInfo(t.dep).nom })));
  const DEPOT = Object.freeze({ grille: [4, 4], note: 'Position symbolique : adresse du dépôt non renseignée' });

  const STATUTS = Object.freeze({
    actif: { libelle: 'Client actif', couleur: '#2FA866' },
    prospect: { libelle: 'Prospect', couleur: '#3E7BE0' },
    dormant: { libelle: 'Dormant / à relancer', couleur: '#E8922B' },
    risque: { libelle: 'Risque de règlement', couleur: '#E5333F' },
    perdu: { libelle: 'Client perdu', couleur: '#7C8088' },
    inconnu: { libelle: 'Statut non renseigné', couleur: '#5A5E66' },
    // Ma Ville : 4 segments (couleur du personnage). Les statuts ci-dessus restent ceux des alertes (risque, dormant…).
    'client-carrosserie': { libelle: 'Client ODICOLOR carrosserie', couleur: '#D41F2B' },
    'client-mecanique': { libelle: 'Client ODICOLOR Mécan', couleur: '#0B0B0D', lisere: true },
    'prospect-carrosserie': { libelle: 'Prospect carrosserie', couleur: '#F0952B' },
    'prospect-mecanique': { libelle: 'Prospect mécanique', couleur: '#3E86F0' },
    'client-a_qualifier': { libelle: 'Client, activité à qualifier', couleur: '#6E737B' },
    'prospect-a_qualifier': { libelle: 'Prospect, activité à qualifier', couleur: '#6E737B' }
  });
  const SEGMENTS = Object.freeze(['client-carrosserie', 'client-mecanique', 'prospect-carrosserie', 'prospect-mecanique']);
  // Clé de couleur d'un garage : son segment s'il est connu, sinon son statut (comportement d'origine).
  const teinte = g => (g && g.segment && STATUTS[g.segment] ? g.segment : g.statut);

  // Qualité du classement, du plus sûr au moins sûr.
  const CLASSEMENTS = Object.freeze({
    sur: 'Commune et code postal concordants',
    cp: 'Classé par le code postal',
    commune: 'Classé par le nom de commune',
    a_verifier: 'À vérifier',
    hors_idf: 'Hors Île-de-France',
    non_classe: 'Non classé'
  });

  const normNom = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const texte = (v, n = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

  // Nom de commune saisi → forme comparable (St → Saint, s/ → sur, sans CEDEX ni chiffres).
  function normCommune(s) {
    let v = String(s == null ? '' : s).replace(/\bs\/\s*/gi, 'sur ');
    v = normNom(v).replace(/\bcedex\b.*$/, '').replace(/\b\d+\b/g, ' ')
      .replace(/\b(er|e|eme|arrondissement|arr)\b/g, ' ')
      .replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint').replace(/\s+/g, ' ').trim();
    if (/^paris\b/.test(v)) return 'paris';
    return v;
  }

  // Index construit une fois : nom normalisé → communes ; code postal → communes.
  const parNom = new Map(), parCp = new Map();
  COMMUNES.forEach(([nom, dep, cps, insee, parent]) => {
    const e = { nom: parent || nom, nomSaisi: nom, dep, cps: cps ? cps.split(' ') : [], insee };
    const k = normCommune(nom);
    if (!parNom.has(k)) parNom.set(k, []);
    parNom.get(k).push(e);
    if (!parent) e.cps.forEach(cp => { if (!parCp.has(cp)) parCp.set(cp, []); parCp.get(cp).push(e); });
  });

  const DEPS_IDF = DEPARTEMENTS.map(d => d.dep);
  function extraireCp(...champs) {
    for (const c of champs) {
      const m = String(c == null ? '' : c).match(/\b\d{5}\b/g);
      if (m) return m[m.length - 1];
    }
    return '';
  }

  // Classement d'un garage. Retourne { dep, commune, insee, cp, niveau, motif }.
  function classer({ cp, commune, adresse }) {
    const code = /^\d{5}$/.test(String(cp || '').trim()) ? String(cp).trim() : extraireCp(adresse, commune);
    const nomBrut = texte(commune, 80);
    const k = normCommune(nomBrut);
    const candidats = k ? (parNom.get(k) || []) : [];
    const base = { dep: '', commune: '', insee: '', cp: code, saisi: nomBrut };

    if (code) {
      const depCp = code.slice(0, 2);
      if (!DEPS_IDF.includes(depCp)) return Object.assign(base, { niveau: 'hors_idf', motif: 'Code postal ' + code + ' hors Île-de-France' });
      const parCode = parCp.get(code) || [];
      const accord = candidats.find(c => c.cps.includes(code));
      if (accord) return Object.assign(base, { dep: accord.dep, commune: accord.nom, insee: accord.insee, niveau: 'sur', motif: CLASSEMENTS.sur });
      if (candidats.length) {
        return Object.assign(base, { dep: depCp, commune: '', niveau: 'a_verifier',
          motif: 'Le code postal ' + code + ' ne correspond pas à « ' + nomBrut + ' » (' + candidats.map(c => c.cps.join('/')).join(', ') + ')' });
      }
      if (!parCode.length) return Object.assign(base, { dep: depCp, niveau: 'a_verifier', motif: 'Code postal ' + code + ' inconnu dans la liste officielle' });
      if (parCode.length === 1) return Object.assign(base, { dep: depCp, commune: parCode[0].nom, insee: parCode[0].insee, niveau: 'cp',
        motif: nomBrut ? 'Commune « ' + nomBrut + ' » non reconnue ; classée par le code postal' : 'Classé par le code postal (une seule commune)' });
      return Object.assign(base, { dep: depCp, niveau: 'cp',
        motif: 'Code postal partagé par ' + parCode.length + ' communes (' + parCode.map(c => c.nom).join(', ') + ') : commune à préciser' });
    }

    if (!k) return Object.assign(base, { niveau: 'non_classe', motif: 'Ni commune ni code postal' });
    const deps = [...new Set(candidats.map(c => c.dep))];
    if (candidats.length && deps.length === 1) {
      const c = candidats[0];
      return Object.assign(base, { dep: c.dep, commune: c.nom, insee: c.insee, niveau: 'commune', motif: 'Classé par le nom de commune (pas de code postal)' });
    }
    if (deps.length > 1) return Object.assign(base, { niveau: 'a_verifier', motif: '« ' + nomBrut + ' » existe dans plusieurs départements (' + deps.join(', ') + ') : code postal nécessaire' });
    return Object.assign(base, { niveau: 'non_classe', motif: '« ' + nomBrut + ' » n’est pas une commune d’Île-de-France reconnue' });
  }

  function statutGarage(c) {
    const compte = normNom(c.compteStatut || c.statutCompte || (c.reglement && c.reglement.statut) || '');
    if (/bloque|impaye|retard|litige/.test(compte)) return 'risque';
    const s = normNom(c.statutCrm || c.statut || '');
    if (/perdu/.test(s)) return 'perdu';
    if (/dormant|relancer/.test(s)) return 'dormant';
    if (s === 'client' || /client actif/.test(s)) return 'actif';
    if (/prospect/.test(s)) return 'prospect';
    return s ? 'inconnu' : 'prospect';
  }

  const nombreOuNull = v => (typeof v === 'number' && isFinite(v) ? v : null);
  function rattacher(g) { // ajoute dep, commune, porte (ville de la maquette) au garage
    const cl = classer({ cp: g.cp, commune: g.ville, adresse: g.adresse });
    g.classement = cl; g.dep = cl.dep; g.commune = cl.commune;
    const porte = cl.insee && TERRITOIRES.find(t => t.insee === cl.insee);
    g.territoire = porte ? porte.id : null;
    return g;
  }

  // Lit une ancienne sauvegarde JSON (V47) du téléphone. Lecture seule : on copie.
  // Le format complet .odicolor est lu par lecture-sauvegarde.js, qui appelle ensuite lireClients.
  function lireSauvegarde(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Fichier illisible : ce n’est pas une sauvegarde JSON.');
    if (obj.appli === 'plan-pc') throw new Error('Ce fichier est un plan PC, pas une sauvegarde du téléphone.');
    if (obj.appli !== 'devis-terrain') throw new Error('Ce fichier ne vient pas de l’appli téléphone (champ « appli » absent).');
    if (obj.type === 'envoi-devis') throw new Error('Ce fichier est un envoi de devis au responsable, pas une sauvegarde complète des garages.');
    if (obj.version === 2) throw new Error('Sauvegarde complète enregistrée en JSON : charge le fichier .odicolor d’origine.');
    if (obj.version != null && obj.version !== 1) throw new Error('Version de sauvegarde inconnue (' + texte(obj.version, 10) + ') : mets le Bureau à jour.');
    if (!Array.isArray(obj.clients)) throw new Error('Sauvegarde sans liste de garages.');
    return lireClients(obj.clients, texte(obj.date, 30));
  }

  // Convertit les fiches garages du téléphone (mêmes champs en V47 et en .odicolor) en garages du Bureau.
  // Ne modifie jamais la liste reçue.
  function lireClients(clients, date) {
    if (!Array.isArray(clients)) throw new Error('Sauvegarde sans liste de garages.');
    const garages = [];
    clients.slice(0, 5000).forEach((c, i) => {
      if (!c || typeof c !== 'object') return;
      const lat = nombreOuNull(c.lat), lng = nombreOuNull(c.lng != null ? c.lng : c.lon);
      garages.push(rattacher({
        id: 'r' + i, source: 'reel',
        nom: texte(c.nom, 120) || 'Sans nom',
        ville: texte(c.villeProspection || c.ville, 70),
        cp: texte(c.cp || c.codePostal, 10),
        adresse: texte(c.adresse, 160),
        tel: texte(c.tel, 30),
        decideur: texte(c.contactNom, 60),
        fournisseur: texte(c.fournisseur, 60),
        etape: texte(c.etape, 100),
        etapeDate: /^\d{4}-\d\d-\d\d$/.test(c.etapeDate || '') ? c.etapeDate : '',
        notes: texte(c.notes, 500),
        exRoberlo: c.exRoberlo === true,
        statut: statutGarage(c),
        position: lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null,
        caMois: null, potentiel: null
      }));
    });
    return { garages, rapport: rapportClassement(garages, clients.length, texte(date, 30)) };
  }

  function rapportClassement(garages, lus, date) {
    const n = k => garages.filter(g => g.classement.niveau === k).length;
    return { lus: lus == null ? garages.length : lus, date: date || '',
      classes: garages.filter(g => DEPS_IDF.includes(g.dep) && g.classement.niveau !== 'a_verifier').length,
      sur: n('sur'), cp: n('cp'), commune: n('commune'), aVerifier: n('a_verifier'), hors: n('hors_idf'), nonClasses: n('non_classe') };
  }

  function compter(g) {
    const n = k => g.filter(x => x.statut === k).length;
    const s = { total: g.length, actif: n('actif'), prospect: n('prospect'), dormant: n('dormant'), risque: n('risque'), perdu: n('perdu'), inconnu: n('inconnu') };
    const ca = g.map(x => x.caMois).filter(v => typeof v === 'number');
    const pot = g.map(x => x.potentiel).filter(v => typeof v === 'number');
    s.caMois = ca.length ? ca.reduce((a, b) => a + b, 0) : null;
    s.potentiel = pot.length ? pot.reduce((a, b) => a + b, 0) : null;
    s.alertes = s.risque + s.dormant;
    s.niveau = s.actif >= 6 ? 4 : s.actif >= 3 ? 3 : s.actif >= 1 ? 2 : s.total > 0 ? 1 : 0;
    s.communes = [...new Set(g.map(x => x.commune).filter(Boolean))].length;
    return s;
  }
  // Un département contient TOUS ses garages classés, y compris les « à vérifier » dont le code postal donne le département.
  const garagesDuDepartement = (garages, dep) => garages.filter(x => x.dep === dep);
  const statsDepartement = (garages, dep) => compter(garagesDuDepartement(garages, dep));
  const statsTerritoire = (garages, id) => compter(garages.filter(x => x.territoire === id));
  const aClasser = garages => garages.filter(x => !DEPS_IDF.includes(x.dep));

  // Liste des communes d'un département ayant au moins un garage, triée par nombre.
  function communesDuDepartement(garages, dep) {
    const m = new Map();
    garagesDuDepartement(garages, dep).forEach(g => { const k = g.commune || '— commune à préciser'; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Démo 100 % fictive : noms inventés, communes réelles, aucune position.
  // [commune, code postal saisi, clients, prospects] — inclut des communes sans « porte » et 3 cas à contrôler.
  const PLAN_DEMO = [
    ['Palaiseau', '91120', 3, 2], ['Massy', '91300', 4, 2], ['Orsay', '91400', 1, 2], ['Gif-sur-Yvette', '91190', 0, 2],
    ['Les Ulis', '91940', 1, 1], ['Évry-Courcouronnes', '91000', 0, 1], ['Corbeil-Essonnes', '91100', 1, 1],
    ['Paris 15e', '75015', 2, 3], ['Paris', '75011', 1, 2],
    ['Nanterre', '92000', 1, 2], ['Gennevilliers', '92230', 1, 1], ['Antony', '92160', 0, 2],
    ['Versailles', '78000', 0, 2], ['Trappes', '78190', 1, 1],
    ['Créteil', '94000', 1, 1], ['Vitry-sur-Seine', '94400', 1, 2], ['Rungis', '', 0, 1],
    ['Goussainville', '95190', 1, 1], ['Argenteuil', '95100', 0, 2],
    ['Bobigny', '93000', 1, 1], ['Aulnay-sous-Bois', '93600', 0, 2],
    ['Meaux', '77100', 0, 1],
    ['Saclay', '91190', 0, 1],          // code postal faux (Saclay = 91400) → à vérifier
    ['Marolles-en-Brie', '', 0, 1],     // homonyme 77 / 94 sans code postal → à vérifier
    ['Chartres', '28000', 0, 1]         // hors Île-de-France
  ];
  function garagesDemo(graine = 2026) {
    const r = mulberry32(graine), ra = mulberry32(graine + 1); // ra : activité fictive, sans changer le tirage d'origine
    const fourn = ['Concurrent A', 'Concurrent B', 'Concurrent C', 'Non renseigné'];
    const out = []; let n = 0;
    PLAN_DEMO.forEach(([ville, cp, clients, prospects]) => {
      for (let i = 0; i < clients + prospects; i++) {
        let statut = i < clients ? 'actif' : 'prospect';
        if (statut === 'actif') { const x = r(); if (x < 0.15) statut = 'dormant'; else if (x < 0.22) statut = 'risque'; }
        n++;
        out.push(rattacher({
          id: 'd' + n, source: 'demo', nom: 'Carrosserie démo ' + String(n).padStart(3, '0'),
          ville, cp, adresse: '', tel: '', decideur: '', etape: '', etapeDate: '', notes: '',
          fournisseur: fourn[Math.floor(r() * fourn.length)], exRoberlo: r() < 0.4, statut, position: null,
          caMois: statut === 'prospect' ? null : Math.round((300 + r() * 2200) / 10) * 10,
          potentiel: Math.round((800 + r() * 3200) / 10) * 10,
          segment: (statut === 'prospect' ? 'prospect' : 'client') + (ra() < 0.6 ? '-carrosserie' : '-mecanique')
        }));
      }
    });
    return out;
  }

  // ---------- Apparence des personnages (déterministe : même garage = même visage) ----------
  function graineTexte(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const PEAUX = ['#F3D5B5', '#E8B98F', '#C98E5F', '#A86B43', '#7A4A2B', '#5A3520'];
  const CHEVEUX = ['#1B1B1E', '#3B2A20', '#6B4426', '#A8742F', '#C9C2B8', '#7A2E1F'];
  const TENUES = ['#2E3A4F', '#3E4A3A', '#4A3A46', '#2F4550', '#50463A', '#3A3A44'];
  const COUPES = ['courte', 'rase', 'longue', 'chignon', 'casquette', 'boucles'];
  function apparence(id) {
    const r = mulberry32(graineTexte(id));
    const pick = a => a[Math.floor(r() * a.length)];
    const coupe = pick(COUPES);
    const role = pick(['peintre', 'peintre', 'responsable', 'gerant']);
    return { role, peau: pick(PEAUX), cheveux: pick(CHEVEUX), coupe, tenue: pick(TENUES),
      barbe: !['longue', 'chignon'].includes(coupe) && r() < 0.35, lunettes: r() < 0.3, outil: pick(['aucun', 'pistolet', 'bloc', 'aucun']) };
  }

  // ---------- Agents de SIMULATION (fictifs, valeurs = hypothèses de départ) ----------
  // Chaque famille fixe des fourchettes ; le tirage reste reproductible avec la graine.
  const FAMILLES = [
    { id: 'fidele', libelle: 'Client fidèle', nb: 6, statut: 'actif', budget: [900, 2500], prix: [1, 2], fidelite: [4, 5], reglement: 'Virement à 30 jours, à l’heure',
      besoins: ['Vernis', 'Apprêts', 'Abrasifs', 'Masquage'], declencheurs: ['Disponibilité le lendemain', 'Suivi technique régulier'], departs: ['Rupture répétée', 'Changement de peintre'],
      comportement: 'Commande chaque semaine. Réagit peu aux prix, beaucoup au service. Tolère une hausse modérée si la qualité suit.' },
    { id: 'gros', libelle: 'Gros compte', nb: 4, statut: 'actif', budget: [3000, 7000], prix: [3, 4], fidelite: [3, 4], reglement: ['Selon accord : LCR à 45 jours', 'Selon accord : virement à 30 jours', 'Selon accord : virement à 60 jours fin de mois'],
      besoins: ['Vernis', 'Teintes', 'Apprêts', 'Consommables'], declencheurs: ['Conditions annuelles', 'Formation des peintres'], departs: ['Offre groupée concurrente', 'Remise refusée'],
      comportement: 'Négocie à l’année. Compare avec un concurrent avant chaque renouvellement. Un geste ciblé pèse plus qu’une baisse générale.' },
    { id: 'prix', libelle: 'Sensible au prix', nb: 5, statut: 'actif', budget: [400, 1500], prix: [4, 5], fidelite: [1, 2], reglement: 'Carte ou virement, variable',
      besoins: ['Abrasifs', 'Masquage', 'Mastics'], declencheurs: ['Promotion', 'Prix d’appel sur un produit visible'], departs: ['Prix plus bas ailleurs'],
      comportement: 'Commande régulièrement mais compare chaque prix avec d’autres fournisseurs. Peut basculer sur une promotion concurrente. Surveiller la marge, pas seulement le volume.' },
    { id: 'retard', libelle: 'Payeur difficile', nb: 3, statut: 'risque', budget: [600, 2000], prix: [3, 4], fidelite: [2, 3], reglement: 'Chèque, souvent en retard',
      besoins: ['Vernis', 'Apprêts', 'Consommables'], declencheurs: ['Délai de paiement allongé'], departs: ['Compte bloqué', 'Relance trop dure'],
      comportement: 'Commande volontiers mais paie tard. Chaque vente augmente le risque. Chèque de caution ou paiement à la commande à tester.' },
    { id: 'dormant', libelle: 'Client dormant', nb: 4, statut: 'dormant', budget: [300, 1200], prix: [2, 4], fidelite: [2, 3], reglement: 'Virement à 30 jours',
      besoins: ['Vernis', 'Abrasifs'], declencheurs: ['Visite avec un motif', 'Essai d’un nouveau produit'], departs: ['Oubli', 'Ancien fournisseur Roberlo non remplacé'],
      comportement: 'N’a pas commandé depuis longtemps. Se réveille avec une visite qui apporte quelque chose de concret.' },
    { id: 'prospect', libelle: 'Prospect carrosserie', nb: 5, statut: 'prospect', budget: [500, 2500], prix: [2, 4], fidelite: [1, 3], reglement: 'Inconnu avant ouverture de compte',
      besoins: ['Vernis', 'Apprêts', 'Masquage', 'Teintes'], declencheurs: ['Essai gratuit', 'Comparatif de coût', 'Recommandation d’un confrère'], departs: ['Pas de suivi après l’essai'],
      comportement: 'A déjà un fournisseur. Ne change qu’après un essai réussi et deux ou trois visites.' },
    { id: 'industriel', libelle: 'Prospect semi-industriel', nb: 3, statut: 'prospect', budget: [1500, 6000], prix: [3, 5], fidelite: [2, 4], reglement: 'Virement à 60 jours',
      besoins: ['Peinture semi-industrielle', 'Apprêts', 'Matériel'], declencheurs: ['Fiche technique', 'Tenue des délais'], departs: ['Délai non tenu'],
      comportement: 'Cycle de décision long, volumes plus gros, exigences techniques fortes. Délais de paiement plus longs.' }
  ];
  const NOMS = ['Laval', 'Moreau', 'Benali', 'Da Silva', 'Nguyen', 'Petit', 'Haddad', 'Lemoine', 'Traoré', 'Garnier', 'Rossi', 'Kaya', 'Fontaine', 'Diallo', 'Marchand',
    'Ferreira', 'Roux', 'Mansour', 'Bertin', 'Chevalier', 'Ouali', 'Perrin', 'Costa', 'Lambert', 'Sarr', 'Renaud', 'Aubert', 'Meyer', 'Bouzid', 'Colin'];
  const ENSEIGNES = ['Carrosserie', 'Garage', 'Atelier', 'Auto Carrosserie', 'Peinture Auto'];
  function agentsSimulation(graine = 2026) {
    const r = mulberry32(graine), entre = (a, b) => a + Math.floor(r() * (b - a + 1));
    const portes = TERRITOIRES.map(t => t.nom), out = []; let n = 0;
    FAMILLES.forEach(f => {
      for (let i = 0; i < f.nb; i++) {
        const nom = NOMS[n % NOMS.length], b0 = Math.round(entre(f.budget[0], f.budget[1]) / 50) * 50;
        out.push({
          id: 'sim-' + String(n + 1).padStart(2, '0'), source: 'simulation', famille: f.id, famille_libelle: f.libelle, statut: f.statut,
          nom: ENSEIGNES[entre(0, ENSEIGNES.length - 1)] + ' ' + nom, contact: (r() < 0.5 ? 'M. ' : 'Mme ') + nom,
          secteur: portes[entre(0, portes.length - 1)],
          budget: { min: Math.max(100, b0 - 300), max: b0 + 300, unite: '€ HT / mois', nature: 'hypothese' },
          sensibilitePrix: entre(f.prix[0], f.prix[1]), fidelite: entre(f.fidelite[0], f.fidelite[1]),
          reglement: Array.isArray(f.reglement) ? f.reglement[entre(0, f.reglement.length - 1)] : f.reglement, besoins: f.besoins.slice(), declencheurs: f.declencheurs.slice(), departs: f.departs.slice(),
          fournisseur: ['Concurrent A', 'Concurrent B', 'Concurrent C'][entre(0, 2)], comportement: f.comportement,
          apparence: apparence('sim-' + n)
        });
        n++;
      }
    });
    return out;
  }
  const ROLE_ACTEUR = { 'act-moi': 'commercial', 'act-faizal': 'direction', 'act-mohamed': 'magasin', 'act-laurent': 'peintre', 'act-com1': 'commercial', 'act-com2': 'commercial', 'act-fournisseur': 'commercial', 'act-concurrent': 'commercial' };
  // 8 acteurs. Les personnes réelles ne sont que des rôles simulés ; les autres sont fictifs.
  const ACTEURS = Object.freeze([
    { id: 'act-moi', nom: 'Toi (copie)', role: 'Commercial terrain', nature: 'Rôle simulé', detail: 'Ta capacité de visites, tes tournées, tes relances. Les réglages viendront de tes vrais chiffres (Lot 3).' },
    { id: 'act-faizal', nom: 'Faizal', role: 'Direction', nature: 'Rôle simulé', detail: 'Valide les prix, les remises et les ouvertures de compte.' },
    { id: 'act-mohamed', nom: 'Mohamed', role: 'Magasin, commandes et préparation', nature: 'Rôle simulé', detail: 'Capacité de préparation, ruptures, délais fournisseurs.' },
    { id: 'act-laurent', nom: 'Laurent', role: 'Formation (rôle à confirmer)', nature: 'Rôle simulé', detail: 'Démonstrations et formations des peintres. Rôle exact à préciser.' },
    { id: 'act-com1', nom: 'Commercial B', role: 'Commercial fictif', nature: 'Fictif', detail: 'Sert à tester « recruter un commercial ». N’existe pas.' },
    { id: 'act-com2', nom: 'Commercial C', role: 'Commercial fictif', nature: 'Fictif', detail: 'Second profil de test, plus junior. N’existe pas.' },
    { id: 'act-fournisseur', nom: 'Fournisseur', role: 'Gamme Carsystem', nature: 'Fictif', detail: 'Délais, disponibilité et conditions d’achat (hypothèses).' },
    { id: 'act-concurrent', nom: 'Concurrent', role: 'Distributeur concurrent', nature: 'Fictif', detail: 'Réagit aux baisses de prix et démarche tes clients.' }
  ].map(a => Object.assign({}, a, { apparence: Object.assign(apparence(a.id), { role: ROLE_ACTEUR[a.id] }) })));

  const api = { apparence, agentsSimulation, FAMILLES, ACTEURS, DEPARTEMENTS, depInfo, TERRITOIRES, DEPOT, STATUTS, CLASSEMENTS, normNom, normCommune, classer, statutGarage,
    lireSauvegarde, lireClients, rapportClassement, statsTerritoire, statsDepartement, garagesDuDepartement, communesDuDepartement, aClasser,
    garagesDemo, mulberry32, SEGMENTS, teinte, nbCommunes: COMMUNES.length };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.BureauLogique = api;
})(typeof self !== 'undefined' ? self : this);
