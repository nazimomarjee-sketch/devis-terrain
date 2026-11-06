/* ODICOLOR 2.0 — Recensement, étape 1 : COMPTAGE des établissements ACTIFS de code 45.20A par département.
   Source : API officielle « Recherche d'entreprises » (DINUM), qui republie la base SIRENE de l'INSEE.
   Ce module ne contient AUCUNE donnée : seulement la méthode de comptage. Il ne stocke aucun établissement ; il renvoie des NOMBRES.

   Pourquoi une méthode et pas un simple « total » (vérifié le 07/11/2026 dans la documentation de l'API et par des essais) :
   - le filtre `activite_principale` ne s'applique qu'à l'UNITÉ LÉGALE (l'entreprise), pas à ses établissements ;
   - le filtre `etat_administratif` ne vise que l'entreprise ; `departement` et `code_postal` filtrent les établissements ;
   - `total_results` compte donc des ENTREPRISES, y compris des établissements fermés ou d'un autre code (exemple relevé : un établissement fermé en 68.20B).
   On compte donc, un par un, les établissements de chaque entreprise trouvée : code 45.20A, état actif (A), commune du département, SIRET unique.

   Limites assumées (affichées avec chaque résultat) :
   - une entreprise dont le code principal n'est ni 45.20A ni l'un des codes voisins interrogés n'est pas vue : le chiffre est un MINIMUM ;
   - les établissements « non diffusibles » n'apparaissent pas dans la source ;
   - 45.20A = entretien et réparation de véhicules légers : mécanique ET carrosserie. Ce n'est PAS une preuve d'activité de peinture ;
   - la source est mise à jour par l'INSEE avec un délai : la date des données est celle de la mise à jour la plus récente observée.
   Règle : si un appel échoue ou si le nombre d'entreprises lues ne correspond pas au total annoncé, le résultat est « incomplet » et AUCUN nombre n'est donné. */
(function (racine) {
  'use strict';
  const API = 'https://recherche-entreprises.api.gouv.fr/search';
  const NAF = '45.20A';
  // Départements demandés, dans l'ordre où ils ont été cités. Cet ordre n'est PAS un classement : jamais trié par nombre.
  const DEPARTEMENTS = Object.freeze(['95', '94', '91', '77', '93']);
  // Codes principaux voisins (réseaux et concessions qui exploitent des ateliers 45.20A) : contrôle complémentaire, chiffré à part.
  const CODES_VOISINS = Object.freeze(['45.11Z', '45.19Z', '45.20B', '45.31Z', '45.32Z', '45.40Z']);
  const PAR_PAGE = 25, LIMITE_ETAB = 100, PAUSE_MS = 250, ESSAIS = 6;
  const AVERTISSEMENT = '45.20A = entretien et réparation de véhicules légers (mécanique ET carrosserie) : ce n’est pas une confirmation d’activité de peinture.';
  const LIMITES = Object.freeze([
    'Nombre minimal : une entreprise dont le code principal est un autre code que ceux interrogés n’est pas vue, même si l’un de ses établissements est en 45.20A.',
    'Les établissements non diffusibles n’apparaissent pas dans la source.',
    AVERTISSEMENT,
    'La source republie SIRENE avec un délai : la date des données est celle de la mise à jour la plus récente observée.'
  ]);

  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const dateDe = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;

  function url(dep, codes, page, extra = {}) {
    const p = new URLSearchParams({ activite_principale: codes.join(','), departement: dep, etat_administratif: 'A', minimal: 'true', include: 'matching_etablissements',
      limite_matching_etablissements: String(LIMITE_ETAB), per_page: String(PAR_PAGE), page: String(page) });
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return API + '?' + p.toString();
  }

  // Établissement à compter : code 45.20A, actif, dans le département (code commune INSEE, sinon code postal), SIRET à 14 chiffres.
  function estCompte(e, dep) {
    if (!e || typeof e !== 'object') return false;
    if (String(e.activite_principale || '').replace(/\s/g, '') !== NAF) return false;
    if (e.etat_administratif !== 'A') return false;
    if (!/^\d{14}$/.test(String(e.siret || ''))) return false;
    const commune = String(e.commune || '');
    return commune ? commune.startsWith(dep) : String(e.code_postal || '').startsWith(dep);
  }

  // Lecture d'une URL avec reprises. Toute réponse inattendue est une ERREUR : jamais un chiffre deviné.
  async function lire(f, u, signal, base = 1000) {
    let derniere = '';
    for (let i = 0; i < ESSAIS; i++) {
      if (signal && signal.aborted) throw new Error('Comptage arrêté.');
      try {
        const r = await f(u, { signal, headers: { Accept: 'application/json' } });
        if (r.status === 429 || r.status >= 500) { derniere = 'HTTP ' + r.status; await attendre(base * (i + 1)); continue; }
        if (!r.ok) throw Object.assign(new Error('La source a répondu HTTP ' + r.status + '.'), { definitif: true });
        const j = await r.json();
        if (!j || !Array.isArray(j.results) || !Number.isInteger(j.total_results) || !Number.isInteger(j.total_pages)) throw Object.assign(new Error('Réponse de la source au format inattendu.'), { definitif: true });
        return j;
      } catch (e) { if (e.definitif) throw e; derniere = e.message || String(e); await attendre(base * (i + 1)); }
    }
    throw new Error('Source injoignable après ' + ESSAIS + ' essais (' + derniere + ').');
  }

  // Compte les établissements d'un département pour une liste de codes principaux d'entreprise. Renvoie des nombres, ou « incomplet » sans nombre.
  async function compterGroupe(dep, codes, opts = {}) {
    const f = opts.fetch, pause = opts.pause ?? PAUSE_MS, base = opts.reprise ?? 1000, sirets = new Set();
    const vus = { entreprises: 0, etabs: 0, fermes: 0, autreCode: 0, horsDepartement: 0, tronques: 0, majInsee: null };
    const premiere = await lire(f, url(dep, codes, 1), opts.signal, base), total = premiere.total_results, pages = premiere.total_pages;
    const traiter = async j => {
      for (const ent of j.results) {
        vus.entreprises++;
        const maj = dateDe(ent.date_mise_a_jour_insee); if (maj && (!vus.majInsee || maj > vus.majInsee)) vus.majInsee = maj;
        let liste = Array.isArray(ent.matching_etablissements) ? ent.matching_etablissements.slice() : [];
        // Plus de 100 établissements dans le département pour une même entreprise : on lit les pages suivantes, sinon on le signale.
        for (let pe = 2; liste.length && liste.length % LIMITE_ETAB === 0 && pe <= 20; pe++) {
          await attendre(pause);
          const suite = await lire(f, url(dep, codes, 1, { q: ent.siren, page_etablissements: pe }), opts.signal, base);
          const e2 = (suite.results.find(x => x.siren === ent.siren) || {}).matching_etablissements || [];
          liste = liste.concat(e2); if (e2.length < LIMITE_ETAB) break;
          if (pe === 20) vus.tronques++;
        }
        for (const e of liste) {
          vus.etabs++;
          if (estCompte(e, dep)) sirets.add(String(e.siret));
          else if (e && e.etat_administratif !== 'A') vus.fermes++;
          else if (e && String(e.activite_principale || '').replace(/\s/g, '') !== NAF) vus.autreCode++;
          else vus.horsDepartement++;
        }
      }
    };
    await traiter(premiere);
    for (let p = 2; p <= pages; p++) { await attendre(pause); await traiter(await lire(f, url(dep, codes, p), opts.signal, base)); if (opts.progression) opts.progression(dep, p, pages); }
    // Contrôle de complétude : toutes les entreprises annoncées ont été lues (une page manquante ou un décalage = résultat incomplet).
    if (vus.entreprises !== total) throw new Error('Entreprises lues (' + vus.entreprises + ') différentes du total annoncé (' + total + ') : comptage incomplet.');
    return { sirets, totalEntreprises: total, pages, vus };
  }

  // Comptage d'un département : établissements 45.20A actifs trouvés via (A) les entreprises de code principal 45.20A, (B) les codes voisins.
  async function compterDepartement(dep, opts = {}) {
    const debut = new Date().toISOString();
    try {
      const A = await compterGroupe(dep, [NAF], opts);
      const B = opts.sansCodesVoisins ? null : await compterGroupe(dep, CODES_VOISINS.slice(), opts);
      const dansB = B ? [...B.sirets].filter(s => !A.sirets.has(s)).length : 0;
      return { departement: dep, statut: 'complet', debut, fin: new Date().toISOString(), source: 'API Recherche d’entreprises (DINUM) · base SIRENE (INSEE)', naf: NAF,
        etablissementsActifs: A.sirets.size + dansB, dontEntreprisesCode452A: A.sirets.size, dontEntreprisesCodesVoisins: B ? dansB : null, codesVoisinsInterroges: B ? CODES_VOISINS.slice() : [],
        entreprisesLues: A.vus.entreprises + (B ? B.vus.entreprises : 0), etablissementsExamines: A.vus.etabs + (B ? B.vus.etabs : 0),
        ecartes: { fermes: A.vus.fermes + (B ? B.vus.fermes : 0), autreCode: A.vus.autreCode + (B ? B.vus.autreCode : 0), horsDepartement: A.vus.horsDepartement + (B ? B.vus.horsDepartement : 0) },
        troncatures: A.vus.tronques + (B ? B.vus.tronques : 0), donneesInseeAuPlusTard: [A.vus.majInsee, B && B.vus.majInsee].filter(Boolean).sort().pop() || null,
        limites: LIMITES, avertissement: AVERTISSEMENT };
    } catch (e) {
      // Blocage : AUCUN nombre. Jamais un total partiel présenté comme un résultat.
      return { departement: dep, statut: 'incomplet', debut, fin: new Date().toISOString(), source: 'API Recherche d’entreprises (DINUM) · base SIRENE (INSEE)', naf: NAF,
        etablissementsActifs: null, motif: e && e.message ? e.message : String(e), limites: LIMITES, avertissement: AVERTISSEMENT };
    }
  }

  // Les cinq départements, dans l'ordre demandé, chacun indépendant : aucun classement, aucune somme si l'un d'eux est incomplet.
  async function compterTous(opts = {}) {
    const liste = [];
    for (const d of opts.departements || DEPARTEMENTS) liste.push(await compterDepartement(d, opts));
    const complets = liste.every(x => x.statut === 'complet');
    return { departements: liste, total: complets ? liste.reduce((s, x) => s + x.etablissementsActifs, 0) : null, complet: complets };
  }

  const api = { API, NAF, DEPARTEMENTS, CODES_VOISINS, LIMITES, AVERTISSEMENT, url, estCompte, compterGroupe, compterDepartement, compterTous };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.ComptageSirene = api;
})(typeof self !== 'undefined' ? self : this);
