'use strict';
/* ODICOLOR v48 — « Ma tournée CHARLIE » (Samsung). Interface compacte, gros boutons, dernière tournée consultable hors ligne.
 * La tournée historique (#/tournee) n'est JAMAIS remplacée : si ce module ou le moteur tombe, elle fonctionne comme avant.
 * Une seule source de données : IndexedDB (meta.charlieTournee) + clients/tournées existants de l'application.
 * Aucune donnée ne quitte le téléphone sans action explicite (moteur routier configuré, vérification d'adresses confirmée).
 */
(function () {
  if (typeof TourneeOpt === 'undefined' || typeof h !== 'function' || typeof montrer !== 'function') return;
  const T = TourneeOpt, CLE_LOCALE = 'odicolor.charlie.derniere';
  const ls = { lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, ecrire(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* mode privé */ } } };
  const secDuJour = (d = new Date()) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  const lireMeta = async (k, defaut) => { try { const v = await get('meta', k); return v == null ? defaut : v; } catch (e) { return defaut; } };
  const ecrireMeta = (k, v) => put('meta', v, k);
  const REGL_DEF = { debut: '08:00', fin: '17:00', pauseDebut: '12:00', pauseFin: '14:00', pauseMin: 45, osrm: '', vroom: '', appli: 'waze' };

  // ----- état persistant (une tournée du jour + dernière tournée pour l'hors-ligne) -----
  async function chargerEtat() {
    let e = await lireMeta('charlieTournee', null);
    if (!e) { try { e = JSON.parse(ls.lire(CLE_LOCALE) || 'null'); } catch (x) { e = null; } }
    return e && typeof e === 'object' ? e : null;
  }
  async function sauverEtat(e) { e.maj = new Date().toISOString(); try { await ecrireMeta('charlieTournee', e); } catch (x) { /* IndexedDB indisponible */ } ls.ecrire(CLE_LOCALE, JSON.stringify(e)); }
  const reglages = async () => ({ ...REGL_DEF, ...(await lireMeta('charlieReglages', {})) });

  // ----- données de l'application → entrées du moteur -----
  async function contexte() {
    const [clients, devis, appris, R] = [await getAll('clients'), await getAll('devis'), await lireMeta('charlieAppris', null), await reglages()];
    const now = new Date(), auj = jourLocal(now);
    // Feuille de route de Laurent = plan du jour de la page « Feuille de route » (visites, étapes, visites reportées sur ce jour).
    const P = typeof planSemaine === 'function' ? planSemaine(devis, clients, now) : { plan: {} };
    const items = (P.plan && P.plan[auj]) || [], laurent = [], vus = new Set();
    for (const it of items) {
      const m = /^#\/client\/(\d+)$/.exec(it.href || ''); if (!m || !['Visite', 'Étape'].includes(it.tag) || vus.has(m[1])) continue;
      vus.add(m[1]); const c = clients.find((x) => String(x.id) === m[1]), l = { id: m[1] };
      if (c && c.rdv && c.rdv.date === auj && T.hms(c.rdv.heure) != null) l.heure = c.rdv.heure;
      laurent.push(l);
    }
    const ctxFns = { echeance: (c) => (typeof echeance === 'function' ? echeance(c, now.getTime()) : null), relanceDue: (d, ms) => relanceDue(d, ms), montantHt: (d) => totaux(d).ht / 100 };
    const plage = [T.hms(R.debut) ?? T.DEFAUTS.plage[0], T.hms(R.fin) ?? T.DEFAUTS.plage[1]];
    const pauses = T.hms(R.pauseDebut) != null && T.hms(R.pauseFin) != null && R.pauseMin > 0 ? [{ creneau: [T.hms(R.pauseDebut), T.hms(R.pauseFin)], duree: R.pauseMin * 60 }] : [];
    return { clients, devis, appris, R, now, auj, laurent, ctxFns, plage, pauses, maintenant: now.getTime() };
  }
  const positionActuelle = () => new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, source: 'GPS du téléphone' }), () => ok(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
  function moteurs(R) {
    const out = {};
    if (R.osrm) out.fetchOSRM = (pts) => T.matriceOSRM(pts, { base: R.osrm, fetchImpl: (u, o) => fetch(u, o) });
    if (R.vroom) out.solveur = async (req) => { const r = await fetch(R.vroom, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), credentials: 'omit', referrerPolicy: 'no-referrer' }); if (!r.ok) throw new Error('VROOM ' + r.status); return r.json(); };
    return out;
  }

  // ----- actions -----
  async function optimiser(etat0) {
    const C = await contexte(); let depart = await positionActuelle();
    if (!depart) { const d = await lireMeta('charlieDepart', null); if (d && T.posOk(d)) depart = { ...d, source: 'dernier départ mémorisé' }; }
    if (!depart) { toast('Position de départ introuvable : active la localisation du téléphone.', true); return null; }
    await ecrireMeta('charlieDepart', { lat: depart.lat, lng: depart.lng });
    const r = await T.organiserJournee({ clients: C.clients, devis: C.devis, laurent: C.laurent, depart, plage: C.plage, pauses: C.pauses, appris: C.appris, maintenant: C.maintenant, ctxFns: C.ctxFns, ...moteurs(C.R) });
    const etat = etat0 && etat0.jour === C.auj ? etat0 : { jour: C.auj, plan: null, curseur: 0, reel: [], faits: [], retires: [] };
    etat.proposition = { plan: r.plan || null, statut: r.statut, trace: r.trace.map((t) => ({ agent: t.agent, statut: t.statut, resume: t.resume })), exclus: r.exclus || [], erreur: r.erreur || null, audit: r.audit || null, genereLe: new Date().toISOString(), departSource: depart.source, laurent: C.laurent.map((l) => l.id) };
    etat.depart = { lat: depart.lat, lng: depart.lng };
    await sauverEtat(etat); return etat;
  }
  async function valider(etat) {
    const p = etat.proposition && etat.proposition.plan; if (!p || (etat.proposition.audit && !etat.proposition.audit.ok)) return;
    etat.plan = { ...p, requete: undefined, valideLe: new Date().toISOString() }; etat.curseur = 0; delete etat.proposition;
    const T0 = await lireTournees(); T0[etat.jour] = { ids: p.ordre.map((o) => Number(o.garageId)), res: T0[etat.jour] && T0[etat.jour].res || {}, debut: new Date().toISOString(), termine: false, charlie: true };
    await ecrireTournees(T0); await sauverEtat(etat);
  }
  const prochain = (etat) => etat.plan && etat.plan.ordre.filter((o) => !etat.faits.includes(o.garageId) && !etat.retires.includes(o.garageId))[etat.curseur || 0] || null;
  const restants = (etat) => etat.plan ? etat.plan.ordre.filter((o) => !etat.faits.includes(o.garageId) && !etat.retires.includes(o.garageId)) : [];
  async function enregistrerSortie(etat, o, resultat, dureeS, note) {
    const c = await get('clients', Number(o.garageId)), now = new Date();
    if (c) { if (typeof marquerVisite === 'function') await marquerVisite(c, resultat === 'vu' ? 'vu' : 'absent'); if (note) { const cc = await get('clients', c.id); const v = cc.visites && cc.visites[cc.visites.length - 1]; if (v && v.date === jourLocal(now)) { v.note = String(note).slice(0, 2000); await putMany('clients', [cc]); } } }
    const fin = secDuJour(now); etat.reel.push({ garageId: o.garageId, arriveeS: resultat === 'vu' ? fin - dureeS : fin, finS: fin, resultat });
    etat.faits.push(o.garageId); etat.curseur = 0;
    const T0 = await lireTournees(); if (T0[etat.jour]) { T0[etat.jour].res[o.garageId] = resultat === 'vu' ? 'vu' : 'absent'; await ecrireTournees(T0); }
    const A = T.apprendre(await lireMeta('charlieAppris', null), { garageId: o.garageId, resultat, dureeS, jour: now.getDay(), debutS: resultat === 'vu' ? fin - dureeS : fin, finS: fin });
    await ecrireMeta('charlieAppris', A); await sauverEtat(etat);
  }
  async function recalculer(etat, evenement) {
    const C = await contexte(), { candidats } = T.construireCandidats({ clients: C.clients, devis: C.devis, laurent: C.laurent, appris: C.appris, plage: C.plage, maintenant: C.maintenant, ctxFns: C.ctxFns });
    let pos = await positionActuelle(); const dernier = etat.reel.length ? etat.plan.ordre.find((o) => o.garageId === etat.reel[etat.reel.length - 1].garageId) : null;
    if (!pos && dernier) pos = { ...dernier.pos, source: 'dernier garage visité' }; if (!pos) pos = etat.depart;
    const rec = await T.recalculer({ candidats, tous: candidats, faits: etat.faits, retires: etat.retires, planPrecedent: etat.plan, positionActuelle: pos, depart: etat.depart, maintenantS: secDuJour(), plage: C.plage, pauses: C.pauses, pauseFaite: secDuJour() > (C.pauses[0] ? C.pauses[0].creneau[1] : 0), laurent: C.laurent.map((l) => l.id), ...moteurs(C.R) }, evenement);
    etat.proposition = { plan: rec, statut: rec.statut, modifications: rec.modifications, proches: rec.propositionsProches, evenement: rec.evenement, audit: T.auditerProposition(rec, { candidats, clients: C.clients, laurent: C.laurent }), trace: [{ agent: 'optimiseur', statut: rec.repli ? 'REPLI' : 'OK', resume: 'Recalcul : ' + rec.moteur }], exclus: [], genereLe: new Date().toISOString() };
    await sauverEtat(etat); return etat;
  }
  async function validerRecalcul(etat) {
    const p = etat.proposition.plan, deja = etat.plan.ordre.filter((o) => etat.faits.includes(o.garageId));
    etat.plan = { ...p, requete: undefined, ordre: deja.concat(p.ordre.map((o, i) => ({ ...o, rang: deja.length + i + 1 }))), valideLe: new Date().toISOString() };
    const T0 = await lireTournees(); if (T0[etat.jour]) { T0[etat.jour].ids = etat.plan.ordre.map((o) => Number(o.garageId)); await ecrireTournees(T0); }
    delete etat.proposition; etat.curseur = 0; await sauverEtat(etat);
  }

  // ----- dictée -----
  function dicter(zone, bouton) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { zone.focus(); toast('Dictée vocale non disponible ici : utilise le micro du clavier Samsung.'); return; }
    const r = new SR(); r.lang = 'fr-FR'; r.interimResults = false; r.continuous = true; bouton.textContent = '■ ARRÊTER LA DICTÉE';
    r.onresult = (ev) => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) zone.value = (zone.value ? zone.value + ' ' : '') + ev.results[i][0].transcript.trim(); };
    r.onend = r.onerror = () => { bouton.textContent = '🎤 DICTER MON RAPPORT'; bouton._r = null; };
    bouton._r = r; try { r.start(); } catch (e) { bouton._r = null; }
  }

  // ----- vérification des adresses (BAN, gratuit) : uniquement après confirmation, adresse seule sans nom -----
  async function verifierAdresses() {
    const cl = (await getAll('clients')).filter((c) => !(c.ent && T.posOk({ lat: c.ent.lat, lng: c.ent.lng })) && ((c.ent && c.ent.adresse) || c.ville || c.villeProspection));
    if (!cl.length) { toast('Toutes les adresses connues ont déjà une position.'); return; }
    if (!navigator.onLine) { toast('Pas de réseau : vérification impossible hors ligne.', true); return; }
    if (!confirm('Vérifier ' + cl.length + ' adresse(s) ?\nSeul le texte de l’adresse est envoyé à api-adresse.data.gouv.fr (service public gratuit). Aucun nom de garage, aucun téléphone.')) return;
    let ok = 0, doute = 0;
    for (const c of cl.slice(0, 60)) {
      const q = ((c.ent && c.ent.adresse) || '') + ' ' + (c.villeProspection || c.ville || '');
      try {
        const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(q.trim()), { credentials: 'omit', referrerPolicy: 'no-referrer' }), j = await r.json(), f = j.features && j.features[0];
        if (f && f.properties && f.properties.score >= 0.8 && f.properties.type !== 'municipality') {
          const [lng, lat] = f.geometry.coordinates; if (!T.posOk({ lat, lng })) { doute++; continue; }
          c.ent = { ...(c.ent || {}), lat, lng, geo: { source: 'BAN', score: Math.round(f.properties.score * 100) / 100, libelle: String(f.properties.label || '').slice(0, 160), verifieLe: new Date().toISOString() } };
          await putMany('clients', [c]); ok++;
        } else doute++;
      } catch (e) { doute++; }
    }
    toast(ok + ' position(s) vérifiée(s), ' + doute + ' adresse(s) à contrôler à la main.', doute > 0 && !ok);
  }

  // ----- affichage -----
  const fmtMin = (m) => (m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : m + ' min');
  const gros = (txt, fn, cls) => h('button', { class: 'btn charlie-b ' + (cls || ''), type: 'button', onclick: fn }, txt);
  async function pageCharlie() {
    let etat = await chargerEtat(); const auj = jourLocal(new Date()), hier = etat && etat.jour !== auj;
    const redessiner = () => pageCharlie();
    const R = await reglages();
    const cible = etat && !hier ? prochain(etat) : null, rests = etat && !hier ? restants(etat) : [];
    const encart = [];
    if (hier) encart.push(h('div', { class: 'carte alerte' }, 'Dernière tournée enregistrée : ' + dateFr(etat.jour + 'T12:00:00') + ' (consultation hors ligne). Appuie sur OPTIMISER pour préparer aujourd’hui.'));
    // --- carte « prochain garage »
    const entete = h('div', { class: 'carte obj charlie-prochain' });
    if (cible) {
      const lien = T.lienNavigation(cible.pos, R.appli);
      entete.append(h('small', { class: 'etiq' }, 'PROCHAIN · ' + (rests.length) + ' restant(s)'), h('div', { class: 'charlie-nom' }, cible.nom),
        h('div', { class: 'charlie-ligne' }, cible.debut + ' · ' + cible.duree / 60 + ' min · trajet ' + cible.trajetMin + ' min / ' + cible.trajetKm + ' km'),
        h('small', { class: 'mut' }, (cible.laurent ? 'Feuille de Laurent' : 'Ajout CHARLIE') + ' · ' + (cible.type || '').replace(/_/g, ' ') + ' · score ' + cible.score + (cible.rdv ? ' · RDV fixé' : '') + (cible.dureeSource.startsWith('HYP') ? ' · durée = hypothèse' : '')),
        lien ? null : h('small', { class: 'mut' }, 'Position inconnue : navigation impossible.'));
    } else if (etat && etat.plan && !hier) entete.append(h('strong', {}, rests.length ? 'Aucune visite sélectionnée' : '✅ Tournée terminée'), h('div', { class: 'charlie-ligne' }, etat.faits.length + ' garage(s) traité(s)'));
    else entete.append(h('strong', {}, hier ? 'Tournée du ' + dateFr(etat.jour + 'T12:00:00') : 'Pas de tournée validée'), h('small', { class: 'mut' }, hier ? 'Lecture seule (hors ligne)' : 'Appuie sur OPTIMISER ou dis « Charlie, organise ma journée commerciale ».'));
    // --- boutons
    const zoneRapport = h('textarea', { rows: 3, maxlength: 2000, placeholder: 'Rapport de visite (dicté ou saisi)…', 'aria-label': 'Rapport de visite', style: 'display:none;width:100%' });
    const bDicter = h('button', { class: 'btn charlie-b sec', type: 'button' }, '🎤 DICTER MON RAPPORT');
    bDicter.onclick = () => { zoneRapport.style.display = 'block'; if (bDicter._r) { bDicter._r.stop(); return; } dicter(zoneRapport, bDicter); };
    const occupe = async (fn) => { try { await fn(); } catch (e) { toast('CHARLIE : ' + e.message + ' — la tournée habituelle reste disponible.', true); } redessiner(); };
    const aller = (res, f) => async () => occupe(async () => {
      if (!etat || !cible) { toast('Aucune visite en cours.', true); return; }
      await f(res);
    });
    const gps = () => { if (!cible) { toast('Aucun garage suivant.', true); return; } etat.gpsA = Date.now(); etat.gpsId = cible.garageId; sauverEtat(etat); const u = T.lienNavigation(cible.pos, R.appli); if (u) window.open(u, '_blank', 'noopener'); };
    const terminee = aller('vu', async () => {
      const estim = etat.gpsId === cible.garageId && etat.gpsA ? Math.round((Date.now() - etat.gpsA) / 60000 - cible.trajetMin) : cible.duree / 60;
      const saisie = prompt('Durée réelle de la visite chez ' + cible.nom + ' (minutes) :', String(Math.max(5, Math.min(180, estim))));
      if (saisie === null) return; const d = Math.round(Number(saisie.replace(',', '.')));
      if (!(d >= 1 && d <= 480)) { toast('Durée invalide.', true); return; }
      await enregistrerSortie(etat, cible, 'vu', d * 60, zoneRapport.value.trim()); toast('Visite enregistrée : ' + cible.nom);
    });
    const absent = aller('absent', async () => {
      await enregistrerSortie(etat, cible, 'absent', 0, ''); etat.retires.push(cible.garageId); await sauverEtat(etat);
      await recalculer(etat, { type: 'absent', id: cible.garageId }); toast('Absent noté. Nouvelle organisation proposée : à valider.');
    });
    const annule = aller('annule', async () => { etat.retires.push(cible.garageId); await sauverEtat(etat); await recalculer(etat, { type: 'annule', id: cible.garageId }); toast('Rendez-vous annulé. Nouvelle organisation proposée : à valider.'); });
    const suivant = () => { if (!etat || rests.length < 2) { toast('Pas d’autre garage dans la tournée.', true); return; } etat.curseur = ((etat.curseur || 0) + 1) % rests.length; sauverEtat(etat); redessiner(); };
    const recalc = () => occupe(async () => { if (!etat || !etat.plan) { toast('Valide d’abord une tournée.', true); return; } const m = prompt('Retard éventuel en minutes (0 si aucun) :', '0'); if (m === null) return; await recalculer(etat, Number(m) > 0 ? { type: 'retard', minutes: Number(m) } : { type: 'ajout' }); });
    const optim = () => occupe(async () => { toast('CHARLIE prépare la journée…'); const e = await optimiser(etat && !hier ? etat : null); if (e) etat = e; });
    const grille = h('div', { class: 'charlie-grille' }, gros('🗺 MA TOURNÉE', redessiner, 'sec'), gros('⚡ OPTIMISER', optim), gros('📍 GPS', gps), gros('➡ CLIENT SUIVANT', suivant, 'sec'),
      gros('✅ VISITE TERMINÉE', terminee, 'vert'), gros('🚪 CLIENT ABSENT', absent, 'ambre'), gros('🔄 RECALCULER', recalc, 'sec'), bDicter);
    // --- champ de commande
    const champ = h('input', { type: 'text', placeholder: '« Charlie, le client est absent »', 'aria-label': 'Commande à Charlie', style: 'flex:1 1 200px' });
    const cmd = async () => {
      const c = T.interpreterCommande(champ.value); champ.value = '';
      if (!c) { toast('Commande non comprise : je ne devine pas.', true); return; }
      ({ organiser: optim, absent, annule, recalculer: recalc, retard: recalc, suivant, termine: terminee, gps, dicter: () => bDicter.onclick() })[c.action]();
    };
    const barre = h('div', { class: 'actions' }, champ, h('button', { class: 'btn sec', type: 'button', onclick: cmd }, 'Envoyer'));
    // --- proposition en attente (écarts avec Laurent et agents)
    const prop = etat && etat.proposition ? bloc_proposition(etat, redessiner) : null;
    // --- liste compacte + bilan
    const liste = rests.length ? h('div', { class: 'carte' }, h('small', { class: 'etiq' }, 'À VENIR'), rests.map((o, i) => h('div', { class: 'ligne charlie-lg' }, h('span', { class: 'g' }, h('strong', {}, o.debut + ' ' + o.nom), h('br'), h('small', {}, (o.laurent ? 'Laurent' : 'Ajout CHARLIE') + ' · ' + o.duree / 60 + ' min · ' + o.trajetKm + ' km')), h('a', { class: 'btn sec', href: '#/client/' + o.garageId }, 'Fiche')))) : null;
    const bilan = etat && etat.plan && etat.reel && etat.reel.length ? bloc_bilan(etat) : null;
    const reglages_ = bloc_reglages(R, redessiner);
    const tot = etat && etat.plan && !hier ? h('p', { class: 'mut' }, etat.plan.totaux.visites + ' visites · ' + etat.plan.totaux.km + ' km · conduite ' + fmtMin(etat.plan.totaux.conduiteMin) + ' · clients ' + fmtMin(etat.plan.totaux.clientMin) + ' · ' + etat.plan.source) : null;
    montrer('Ma tournée', encart, entete, prop, grille, zoneRapport, barre, liste, tot, bilan, reglages_, h('a', { class: 'btn sec', href: '#/tournee' }, 'Tournée habituelle (inchangée)'));
  }
  function bloc_proposition(etat, redessiner) {
    const p = etat.proposition;
    if (p.erreur || !p.plan) return h('div', { class: 'carte erreur', role: 'alert' }, h('strong', {}, 'CHARLIE n’a pas pu optimiser : '), p.erreur || 'aucun résultat', h('br'), h('small', {}, 'Ta tournée habituelle et la feuille de Laurent restent utilisables.'), (p.exclus || []).length ? h('p', { class: 'mut' }, 'À corriger : ' + p.exclus.map((e) => (e.nom || 'garage #' + e.id) + ' (' + e.raison + ')').join(', ')) : null);
    const auditKo = p.audit && !p.audit.ok, pl = p.plan, ecarts = pl.ecartsLaurent || [], mods = p.modifications || [];
    return h('div', { class: 'carte ' + (auditKo || p.statut === 'CONFLIT_A_RESOUDRE' ? 'alerte' : 'obj') },
      h('div', { class: 'elan-tete' }, h('strong', {}, p.evenement ? 'Nouvelle organisation proposée' : 'Proposition de CHARLIE'), h('span', { class: 'tag warn' }, 'À VALIDER')),
      auditKo ? h('p', {}, '⛔ Audit refusé : ' + p.audit.violations.map((v) => v.code).join(', ') + '. Rien n’est appliqué.') : null,
      p.statut === 'CONFLIT_A_RESOUDRE' ? h('p', {}, '⚠ Une visite obligatoire de Laurent ne tient pas : ' + pl.nonPlanifies.filter((n) => n.obligatoire).map((n) => n.nom + ' (' + n.raison + ')').join(' ; ')) : null,
      h('p', { class: 'mut' }, pl.ordre.length + ' visite(s) · ' + pl.totaux.km + ' km · conduite ' + fmtMin(pl.totaux.conduiteMin) + ' · fin ' + (pl.ordre.length ? pl.ordre[pl.ordre.length - 1].fin : '—') + ' · moteur ' + pl.moteur + (pl.referenceLaurent && pl.referenceLaurent.faisable ? ' · ordre de Laurent : ' + pl.referenceLaurent.km + ' km' : pl.referenceLaurent ? ' · ordre de Laurent infaisable tel quel' : '')),
      (pl.alertes || []).map((a) => h('small', { class: 'mut', style: 'display:block' }, 'ℹ ' + a)),
      ecarts.length || mods.length ? h('div', {}, h('small', { class: 'etiq' }, 'ÉCARTS À VALIDER'), ecarts.concat(mods).map((e) => h('div', {}, '• ' + libEcart(e)))) : h('p', { class: 'mut' }, 'Aucun écart avec la feuille de Laurent.'),
      (p.proches || []).length ? h('div', {}, h('small', { class: 'etiq' }, 'À PROXIMITÉ (vol d’oiseau)'), p.proches.map((x) => h('div', {}, '• ' + x.nom + ' · ' + x.distanceKm + ' km · score ' + x.score + ' (' + x.type.replace(/_/g, ' ') + ')'))) : null,
      h('details', {}, h('summary', {}, 'Détail des agents'), (p.trace || []).map((t) => h('div', {}, h('small', {}, t.agent + ' · ' + t.statut + ' · ' + t.resume)))),
      h('div', { class: 'actions' }, auditKo ? null : h('button', { class: 'btn gros vert', type: 'button', onclick: async () => { try { p.evenement ? await validerRecalcul(etat) : await valider(etat); toast('Tournée validée.'); } catch (e) { toast(e.message, true); } redessiner(); } }, '✔ VALIDER'),
        h('button', { class: 'btn sec', type: 'button', onclick: async () => { delete etat.proposition; await sauverEtat(etat); toast('Proposition refusée : programme inchangé.'); redessiner(); } }, 'Refuser')));
  }
  const libEcart = (e) => ({ LAURENT_RETIRE: () => '⚠ Visite de Laurent non planifiable : ' + (e.nom || e.garageId), AJOUT_CHARLIE: () => 'Ajout CHARLIE : ' + (e.nom || e.garageId), ORDRE_MODIFIE: () => 'Ordre de Laurent modifié pour réduire les trajets',
    RETIRE: () => 'Retiré (' + e.raison + ') : #' + e.garageId, ABANDONNE: () => 'Abandonné, ne tient plus : #' + e.garageId, AJOUTE: () => 'Ajouté : #' + e.garageId, REORDONNE: () => 'Ordre des visites restantes modifié' }[e.code] || (() => e.code))();
  function bloc_bilan(etat) {
    const c = T.comparerPrevuReel(etat.plan, etat.reel);
    return h('details', { class: 'carte' }, h('summary', {}, 'Prévu / réalisé : ' + c.vus + ' vu(s), ' + c.absents + ' absent(s) sur ' + c.prevus + ' prévus'),
      c.lignes.map((l) => h('div', { class: 'charlie-lg' }, h('small', {}, (l.nom || '#' + l.garageId) + ' · ' + l.resultat + (l.ecartArriveeMin != null ? ' · écart ' + (l.ecartArriveeMin > 0 ? '+' : '') + l.ecartArriveeMin + ' min' : '') + (l.dureeReelleMin != null && l.resultat === 'vu' ? ' · ' + l.dureeReelleMin + ' min (prévu ' + l.dureePrevueMin + ')' : '') + (l.horsPlan ? ' · hors plan' : '')))),
      h('small', { class: 'mut' }, c.ordreRespecte ? 'Ordre respecté.' : 'Ordre différent du plan.'), c.nonFaits.length ? h('small', { class: 'mut', style: 'display:block' }, 'Non faits : ' + c.nonFaits.map((n) => n.nom).join(', ')) : null);
  }
  function bloc_reglages(R, redessiner) {
    const champ = (cle, lib, type = 'text') => { const i = h('input', { type, value: R[cle], 'aria-label': lib, style: 'width:100%' }); i.onchange = async () => { const v = type === 'number' ? Number(i.value) : i.value.trim(); await ecrireMeta('charlieReglages', { ...(await lireMeta('charlieReglages', {})), [cle]: v }); toast('Enregistré.'); }; return h('label', {}, lib, i); };
    const appli = h('select', { 'aria-label': 'Navigation' }, [['waze', 'Waze'], ['google', 'Google Maps']].map(([v, l]) => h('option', { value: v, selected: R.appli === v }, l)));
    appli.onchange = async () => { await ecrireMeta('charlieReglages', { ...(await lireMeta('charlieReglages', {})), appli: appli.value }); redessiner(); };
    return h('details', { class: 'carte' }, h('summary', {}, 'Réglages CHARLIE'),
      h('small', { class: 'mut' }, 'Horaires et pause = hypothèses de départ, à ajuster. Moteur routier vide = temps estimés, signalés comme tels.'),
      champ('debut', 'Début de journée (HH:MM)'), champ('fin', 'Fin de journée (HH:MM)'), champ('pauseDebut', 'Pause : au plus tôt'), champ('pauseFin', 'Pause : au plus tard'), champ('pauseMin', 'Durée de pause (min)', 'number'),
      champ('osrm', 'Moteur routier OSRM (URL, optionnel)'), champ('vroom', 'Moteur VROOM (URL, optionnel)'), h('label', {}, 'Navigation', appli),
      h('button', { class: 'btn sec', type: 'button', onclick: verifierAdresses }, 'Vérifier les adresses (confirmation demandée)'),
      h('button', { class: 'btn sec', type: 'button', onclick: exporterBureau }, 'Exporter la tournée pour le Bureau (fichier)'));
  }

  // Export vers le cockpit Bureau : fichier local choisi par l'utilisateur (même canal que « Lien avec le PC »), aucun envoi réseau.
  async function exporterBureau() {
    const etat = await chargerEtat(); if (!etat || !etat.plan) { toast('Aucune tournée validée à exporter.', true); return; }
    const o = { schema: 'charlie-tournee/v1', jour: etat.jour, exporteLe: new Date().toISOString(), plan: { ...etat.plan, requete: undefined }, reel: etat.reel || [], faits: etat.faits || [], retires: etat.retires || [], depart: etat.depart || null };
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(o)], { type: 'application/json' })), download: 'charlie-tournee-' + etat.jour + '.json' }); document.body.appendChild(a); a.click(); a.remove(); toast('Fichier prêt : à ouvrir dans le cockpit Bureau.');
  }

  // ----- accroche dans le routeur (la route habituelle reste appelée en dernier recours) -----
  const routeAvant = route;
  route = async function () {
    const p = (location.hash || '#/').slice(2).split('/');
    if (p[0] === 'charlie') {
      document.querySelectorAll('.onglets a').forEach((x) => x.classList.toggle('on', x.dataset.p === 'tournee'));
      try { await pageCharlie(); } catch (e) { montrer('Ma tournée', h('div', { class: 'carte erreur', role: 'alert' }, 'CHARLIE est indisponible : ' + e.message), h('a', { class: 'btn gros', href: '#/tournee' }, 'Ouvrir la tournée habituelle')); }
      return;
    }
    await routeAvant();
    if (p[0] === 'tournee' && typeof app !== 'undefined' && app.firstChild) app.insertBefore(h('a', { class: 'btn gros charlie-entree', href: '#/charlie' }, '🧭 Tournée optimisée CHARLIE'), app.firstChild);
  };
  // app.js démarre sa première route et branche `hashchange` AVANT le chargement de ce module (scripts suivants) :
  // l'écouteur d'origine garde l'ancienne fonction. On intercepte donc nos deux routes et on rejoue la route au chargement.
  const NOS_ROUTES = /^#\/(charlie|tournee)(\/|$)/;
  addEventListener('hashchange', (ev) => { if (NOS_ROUTES.test(location.hash)) { ev.stopImmediatePropagation(); route(); } }, true);
  if (document.readyState !== 'complete') addEventListener('load', () => { if (NOS_ROUTES.test(location.hash)) route(); });
  window.__charlie = { pageCharlie, contexte, optimiser, recalculer, verifierAdresses };
})();
