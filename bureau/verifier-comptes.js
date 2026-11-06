/* ODICOLOR 2.0 — Lot B : écran « Vérifier les comptes » (Bureau, PC et tactile).
   Trois décisions humaines, mémorisées dans le coffre par bureau/decisions-comptes.js :
   « C'est ce client EBP » · « Aucun compte ODICOLOR vérifié » · « Je ne sais pas » (rien n'est enregistré).
   Règles : une suggestion EBP n'est JAMAIS validée seule ; l'auteur est DÉCLARÉ (texte libre), jamais présenté comme authentifié ;
   déclaration groupée « sans compte » = confirmation explicite, garages à risque exclus ; corriger = nouvelle décision, l'historique reste ;
   une ressemblance de nom n'annule jamais une décision : elle est affichée comme alerte à examiner. */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const L0 = node ? require('./bureau-logique.js') : racine.BureauLogique;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fr = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
  // Mots sans valeur pour comparer deux noms de garage.
  const VIDES = new Set('sarl sas sasu eurl sa sci snc ets etablissements etablissement garage garages carrosserie carrosseries auto autos automobile automobiles mecanique meca services service de du des la le les et l d au aux fictif fictive fictifs fictives test'.split(' '));
  const mots = s => L0.normNom(s).split(' ').filter(w => w.length > 1 && !VIDES.has(w));

  // Correspondances EBP POSSIBLES pour un garage du téléphone : même code postal ou même ville, et au moins un mot significatif commun
  // (ou nom identique). Ce sont des suggestions : rien n'est jamais relié sans clic humain.
  function suggestions(g, clientsEbp, liesA = new Map(), max = 4) {
    const mg = new Set(mots(g.nom)), cp = String(g.cp || '').trim(), ville = L0.normNom(g.ville || g.villeProspection || '');
    const out = [];
    for (const c of clientsEbp || []) {
      const code = String(c.code || '').trim(); if (!code) continue;
      const memeNom = L0.normNom(c.nom) === L0.normNom(g.nom), communs = mots(c.nom).filter(w => mg.has(w));
      const memeCp = !!cp && String(c.cp || '').trim() === cp, memeVille = !!ville && L0.normNom(c.ville) === ville;
      if (!memeNom && !communs.length) continue;
      if (!memeNom && !memeCp && !memeVille) continue;
      const score = (memeNom ? 10 : 0) + communs.length * 3 + (memeCp ? 2 : 0) + (memeVille ? 1 : 0);
      const pourquoi = [memeNom ? 'nom identique' : 'mot(s) commun(s) : ' + communs.join(', ').toUpperCase(), memeCp ? 'même code postal' : memeVille ? 'même ville' : null].filter(Boolean).join(' · ');
      out.push({ code, nom: c.nom, ville: c.ville || '', cp: c.cp || '', statut: c.statut || '', score, memeNom, pourquoi, dejaRelieA: liesA.get(code) || null });
    }
    return out.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, max);
  }

  const ETAT_LIB = { appliquee: 'Appliquée', remplacee: 'Remplacée', annulee: 'Annulée', a_reverifier: 'À revérifier', conflit: 'Conflit', orpheline: 'Garage absent', en_attente: 'En attente' };
  const TYPE_LIB = { liaison: 'C’est ce client EBP', absence: 'Aucun compte ODICOLOR vérifié', annulation: 'Annulation' };
  const COMPTE_LIB = { en_compte: 'En compte', sans_compte: 'Sans compte', a_verifier: 'À vérifier' };

  // ctx : { donnees(), appliquer(), modele(applique), decider(e), auteur(), definirAuteur(t), enregistrement(), rafraichir() }
  function monter(conteneur, ctx, etatVue) {
    const S = etatVue || {}; S.onglet = S.onglet || 'a_verifier'; S.passes = S.passes || new Set(); S.coches = S.coches || new Set(); S.filtre = S.filtre || '';
    const D = ctx.donnees(), A = ctx.appliquer(), m = ctx.modele(A);
    const tous = [...m.communes.values()].flatMap(c => c.etablissements).concat(m.aClasser).filter(e => e.portee === 'mes_garages'); // le marché à prospecter n'entre pas dans cet écran
    const garages = new Map(); // n° téléphone → { g (fiche téléphone), e (établissement du modèle) }
    for (const g of D.terrain) garages.set(g.id, { g, e: tous.find(x => x.sources.some(s => s.ref === 'tel:' + g.id)) });
    const parTel = new Map(); A.etats.filter(x => x.decision.cible && x.decision.cible.tel != null).forEach(x => { if (!parTel.has(x.decision.cible.tel)) parTel.set(x.decision.cible.tel, []); parTel.get(x.decision.cible.tel).push(x); });
    const liesA = new Map(A.liaisonsValidees.map(l => [l.b.slice(4), Number(l.a.slice(4))]));
    const nomTel = id => garages.has(id) ? garages.get(id).g.nom : 'garage n° ' + id;
    const sug = new Map([...garages.values()].map(({ g }) => [g.id, suggestions(g, D.clientsEbp, new Map([...liesA].map(([c, id]) => [c, id === g.id ? null : nomTel(id)])))]));
    const statut = id => { const x = garages.get(id); return x && x.e ? x.e.compte.statut : 'a_verifier'; };
    // File « à vérifier » : déclarés clients, décisions à revoir, ressemblances, puis le reste.
    const rang = id => { const x = garages.get(id), ets = parTel.get(id) || [];
      return ets.some(t => ['a_reverifier', 'conflit'].includes(t.etat)) ? 0 : x.e && x.e.categorie === 'client' ? 1 : (sug.get(id) || []).length ? 2 : 3; };
    const ids = [...garages.keys()];
    const aVerifier = ids.filter(id => statut(id) === 'a_verifier').sort((a, b) => rang(a) - rang(b) || nomTel(a).localeCompare(nomTel(b)));
    const alertes = A.etats.filter(x => x.alerte || ['a_reverifier', 'conflit', 'orpheline', 'en_attente'].includes(x.etat));
    const decides = ids.filter(id => (parTel.get(id) || []).some(t => t.etat === 'appliquee'));
    const k = (() => { const n = s => tous.filter(e => e.compte.statut === s).length; return { en_compte: n('en_compte'), sans_compte: n('sans_compte'), a_verifier: n('a_verifier'), total: tous.length }; })();
    if (S.choisi == null || !garages.has(S.choisi)) S.choisi = aVerifier.find(id => !S.passes.has(id)) ?? aVerifier[0] ?? ids[0] ?? null;
    const q = L0.normNom(S.filtre);
    const filtrer = l => q ? l.filter(id => L0.normNom(nomTel(id) + ' ' + (garages.get(id).g.ville || '') + ' ' + (garages.get(id).g.cp || '') + ' ' + id).includes(q)) : l;
    const auteur = ctx.auteur(), enreg = ctx.enregistrement();
    const peut = ctx.peutDecider ? ctx.peutDecider() : { ok: true }, bloque = peut.ok ? '' : ' disabled aria-disabled="true"'; // coffre inaccessible : aucune décision
    const msgDec = ctx.message ? ctx.message() : '';

    const ligne = id => { const { g, e } = garages.get(id), s = sug.get(id) || [], st = statut(id);
      return `<li class="vf-item${id === S.choisi ? ' vf-actif' : ''}"><label class="vf-coche" title="Sélectionner pour une déclaration groupée"><input type="checkbox" data-coche="${id}"${S.coches.has(id) ? ' checked' : ''}${S.onglet !== 'a_verifier' ? ' hidden' : ''}></label>
        <button type="button" class="vf-ligne" data-choisir="${id}"><b>${esc(g.nom)}</b><small>${esc(g.ville || 'Commune inconnue')} · ${esc(g.cp || '')} · n° ${id}</small>
        <span class="vf-tags"><i class="vf-b vf-c-${st}">${COMPTE_LIB[st]}</i>${s.length ? `<i class="vf-b vf-sug">${s.length} fiche(s) EBP proche(s)</i>` : ''}${g.statutCrm === 'client' && st === 'a_verifier' ? '<i class="vf-b vf-alerte">Déclaré client au téléphone</i>' : ''}${S.passes.has(id) ? '<i class="vf-b vf-passe">Passé</i>' : ''}</span></button></li>`; };
    const ligneAlerte = x => { const id = x.decision.cible && x.decision.cible.tel;
      return `<li class="vf-item vf-item-seul"><button type="button" class="vf-ligne" ${garages.has(id) ? `data-choisir="${id}"` : 'disabled'}><b>${esc(x.decision.cible ? x.decision.cible.nom : x.decision.id)}</b>
        <small>${esc(x.alerte || x.motif)}</small><span class="vf-tags"><i class="vf-b vf-alerte">${x.alerte ? 'Alerte à examiner' : ETAT_LIB[x.etat]}</i><i class="vf-b">${x.decision.id} · ${fr(x.decision.date)}</i></span></button></li>`; };
    const liste = S.onglet === 'alertes' ? alertes.map(ligneAlerte) : filtrer(S.onglet === 'decides' ? decides : aVerifier).map(ligne);

    // Adresse de la fiche EBP reliée (peut différer de celle saisie au téléphone : les deux restent visibles, rien n'est réécrit).
    const ficheEbp = e => { if (!e || !e.codesEbp.length) return null; const c = D.clientsEbp.find(x => e.codesEbp.includes(String(x.code).trim())); return c ? 'code ' + c.code + ' · ' + c.nom + ' · ' + (c.ville || '?') + ' ' + (c.cp || '') : 'code ' + e.codesEbp.join(', '); };
    const carte = () => {
      if (S.choisi == null) return '<div class="vf-vide"><h3>Aucun garage à vérifier</h3><p>Charge ta sauvegarde du téléphone et l’export clients EBP.</p></div>';
      const { g, e } = garages.get(S.choisi), s = sug.get(S.choisi) || [], st = statut(S.choisi), hist = parTel.get(S.choisi) || [];
      const active = hist.find(t => ['appliquee', 'a_reverifier', 'conflit', 'en_attente'].includes(t.etat) && t.decision.type !== 'annulation');
      const alerteGar = hist.find(t => t.alerte) || null, revoir = hist.find(t => ['a_reverifier', 'conflit', 'en_attente'].includes(t.etat));
      return `<div class="vf-fiche" data-garage="${S.choisi}">
        <div class="vf-fiche-tete"><div><h2>${esc(g.nom)}</h2><p>${esc(g.ville || 'Commune inconnue')} (${esc(g.cp || '?')}) · n° ${S.choisi} au téléphone · déclaré <b>${g.statutCrm === 'client' ? 'client' : 'prospect'}</b> au téléphone</p>
          ${ficheEbp(e) ? `<p>Fiche EBP reliée : ${esc(ficheEbp(e))}</p>` : ''}</div>
          <span class="vf-statut vf-c-${st}">${COMPTE_LIB[st]}</span></div>
        <p class="vf-motif">${esc(e ? e.compte.motif : '')}</p>
        ${alerteGar ? `<div class="vf-boite vf-boite-alerte" role="alert"><b>⚠ Alerte à examiner</b><p>${esc(alerteGar.alerte)}</p><p>La décision reste en vigueur. Corrige-la si besoin, ou écarte cette fiche.</p></div>` : ''}
        ${revoir ? `<div class="vf-boite vf-boite-alerte" role="alert"><b>⚠ ${ETAT_LIB[revoir.etat]}</b><p>${esc(revoir.motif)}</p></div>` : ''}
        <h3>Correspondances EBP possibles <small>suggestions, jamais validées seules</small></h3>
        ${s.length ? `<div class="vf-sugs" role="radiogroup" aria-label="Fiche EBP correspondante">${s.map(c => `<label class="vf-sug${c.dejaRelieA ? ' vf-prise' : ''}"><input type="radio" name="vf-code" value="${esc(c.code)}"${c.dejaRelieA ? ' disabled' : ''}>
          <span><b>${esc(c.nom)}</b><small>Code ${esc(c.code)} · ${esc(c.ville)} ${esc(c.cp)}${c.statut ? ' · ' + esc(c.statut) : ''}</small><small class="vf-pourquoi">${esc(c.pourquoi)}${c.dejaRelieA ? ' · déjà relié à ' + esc(c.dejaRelieA) : ''}</small></span></label>`).join('')}</div>`
          : `<p class="vf-motif">Aucune fiche proche dans l’export clients EBP${D.exportClientsDu ? ' du ' + fr(D.exportClientsDu) : ''}. Cela ne prouve pas l’absence de compte : vérifie dans EBP.</p>`}
        <label class="vf-autre">Autre code client EBP <input type="text" id="vf-code-libre" autocomplete="off" placeholder="ex. C1234" list="vf-codes"></label>
        <datalist id="vf-codes">${D.clientsEbp.slice(0, 2000).map(c => `<option value="${esc(c.code)}">${esc(c.nom)}</option>`).join('')}</datalist>
        <div class="vf-actions">
          <button type="button" class="vf-btn vf-oui" data-decision="liaison" disabled><kbd>1</kbd> C’est ce client EBP</button>
          <button type="button" class="vf-btn vf-non" data-decision="absence"${bloque}><kbd>2</kbd> Aucun compte ODICOLOR vérifié</button>
          <button type="button" class="vf-btn vf-nsp" data-decision="nsp"><kbd>3</kbd> Je ne sais pas</button>
        </div>
        ${active && active.decision.type !== 'annulation' ? `<p class="vf-motif">Une décision est déjà en vigueur (${active.decision.id}) : une nouvelle décision la <b>remplace</b>, sans l’effacer. <button type="button" class="vf-lien" data-annuler="${active.decision.id}"${bloque}>Annuler cette décision</button></p>` : ''}
        <h3>Historique des décisions</h3>
        ${hist.length ? `<ol class="vf-hist">${hist.map(t => `<li><b>${fr(t.decision.date)}</b> · ${TYPE_LIB[t.decision.type]}${t.decision.codeEbp ? ' (code ' + esc(t.decision.codeEbp) + ')' : ''}${t.decision.ecarte ? ' · fiche(s) écartée(s) : ' + esc(t.decision.ecarte.join(', ')) : ''} · auteur déclaré : ${esc(t.decision.auteur)} · <i class="vf-b vf-e-${t.etat}">${ETAT_LIB[t.etat]}${t.alerte ? ' · alerte' : ''}</i></li>`).join('')}</ol>` : '<p class="vf-motif">Aucune décision pour ce garage.</p>'}
      </div>`;
    };

    conteneur.classList.add('vf');
    conteneur.innerHTML = `
      <div class="vf-entete"><div><h1>Vérifier les comptes ODICOLOR</h1>
        <p>Export clients EBP ${D.exportClientsDu ? 'du ' + fr(D.exportClientsDu) : 'non chargé'} · l’absence d’un garage dans un export ne prouve jamais qu’il est sans compte.</p></div>
        <div class="vf-auteur">${auteur ? `Auteur déclaré : <b>${esc(auteur)}</b> <small>(non authentifié)</small> <button type="button" class="vf-lien" data-auteur>Changer</button>` : '<button type="button" class="vf-btn vf-petit" data-auteur>Déclarer l’auteur</button>'}</div></div>
      <div class="vf-compteurs" aria-label="Comptes ODICOLOR, chaque garage compté une fois">
        <div class="vf-cpt vf-c-en_compte"><span>En compte</span><b data-vf="en_compte">${k.en_compte}</b></div>
        <div class="vf-cpt vf-c-sans_compte"><span>Sans compte</span><b data-vf="sans_compte">${k.sans_compte}</b></div>
        <div class="vf-cpt vf-c-a_verifier"><span>À vérifier</span><b data-vf="a_verifier">${k.a_verifier}</b></div>
        <div class="vf-cpt"><span>Total</span><b data-vf="total">${k.total}</b></div></div>
      <p class="vf-enreg vf-enreg-${enreg.ok ? 'ok' : 'non'}" role="${enreg.ok ? 'status' : 'alert'}">${esc(enreg.texte)}</p>
      ${msgDec ? `<p class="vf-boite vf-boite-alerte" role="alert" data-vf-msg>${esc(msgDec)}</p>` : ''}
      <div class="vf-corps">
        <section class="vf-carte" aria-label="Garage à vérifier">${carte()}</section>
        <aside class="vf-file">
          <div class="vf-onglets" role="tablist">${[['a_verifier', 'À vérifier', aVerifier.length], ['alertes', 'Alertes', alertes.length], ['decides', 'Décidés', decides.length]].map(([o, l, n]) =>
            `<button type="button" role="tab" data-onglet="${o}" aria-selected="${S.onglet === o}">${l} <b>${n}</b></button>`).join('')}</div>
          ${S.onglet !== 'alertes' ? `<input type="search" class="vf-chercher" value="${esc(S.filtre)}" placeholder="Chercher (nom, ville, code postal, n°)" aria-label="Chercher un garage">` : ''}
          ${S.onglet === 'a_verifier' && S.coches.size ? `<div class="vf-groupe"><b>${S.coches.size} sélectionné(s)</b><button type="button" class="vf-btn vf-non vf-petit" data-groupe${bloque}>Déclarer « Aucun compte ODICOLOR vérifié »…</button><button type="button" class="vf-lien" data-vider>Tout désélectionner</button></div>` : ''}
          <ul class="vf-liste">${liste.join('') || '<li class="vf-vide">Rien ici.</li>'}</ul>
        </aside></div>
      <div class="vf-couche" hidden></div>`;

    const $ = s => conteneur.querySelector(s), couche = $('.vf-couche');
    const relancer = () => { monter(conteneur, ctx, S); };
    const fermerModale = () => { couche.hidden = true; couche.innerHTML = ''; };
    function modale(html, surOk) {
      couche.innerHTML = `<div class="vf-voile"><div class="vf-modale" role="dialog" aria-modal="true">${html}</div></div>`; couche.hidden = false;
      const ok = couche.querySelector('[data-ok]'), chk = couche.querySelector('[data-requis]');
      if (chk) { ok.disabled = true; chk.addEventListener('change', () => { ok.disabled = !chk.checked; }); }
      couche.querySelector('[data-annuler-modale]').onclick = fermerModale;
      ok.onclick = () => { const r = surOk(couche); if (r !== false) fermerModale(); };
      (couche.querySelector('input') || ok).focus();
    }
    function avecAuteur(suite) {
      if (ctx.auteur()) return suite();
      modale(`<h2>Qui vérifie ?</h2><p>Ton nom sera <b>déclaré</b> sur chaque décision. Il n’est pas vérifié : ce n’est pas une identité authentifiée.</p>
        <label class="vf-autre">Auteur déclaré <input type="text" id="vf-auteur" maxlength="60" autocomplete="name"></label>
        <div class="vf-actions"><button type="button" class="vf-btn vf-oui" data-ok>Continuer</button><button type="button" class="vf-btn vf-nsp" data-annuler-modale>Annuler</button></div>`,
        c => { const t = c.querySelector('#vf-auteur').value.trim(); if (!t) return false; ctx.definirAuteur(t); setTimeout(suite); });
    }
    const suivant = () => { const l = aVerifier.filter(id => id !== S.choisi && !S.passes.has(id)); S.choisi = l.length ? l[0] : S.choisi; };
    function decider(e, apres) {
      try { ctx.decider(Object.assign({ auteur: ctx.auteur() }, e)); } catch (err) { S.erreur = err.message; ctx.rafraichir(S); return; }
      S.erreur = null; if (apres) apres(); ctx.rafraichir(S);
    }
    const cible = id => { const g = garages.get(id).g; return { tel: id, nom: g.nom, cp: String(g.cp || '').trim() }; };
    const codeChoisi = () => { const r = conteneur.querySelector('input[name="vf-code"]:checked'), libre = ($('#vf-code-libre') || {}).value; return (r && r.value) || (libre && libre.trim()) || ''; };
    const majOui = () => { const b = conteneur.querySelector('[data-decision="liaison"]'); if (b) b.disabled = !codeChoisi() || !peut.ok; };

    function liaison() {
      const code = codeChoisi(); if (!code) return;
      const connu = D.clientsEbp.some(c => String(c.code).trim() === code);
      const fiche = D.clientsEbp.find(c => String(c.code).trim() === code);
      modale(`<h2>Relier à ce client EBP ?</h2><p><b>${esc(garages.get(S.choisi).g.nom)}</b> (téléphone) = <b>${esc(fiche ? fiche.nom : 'code ' + code)}</b> (EBP, code ${esc(code)}).</p>
        ${connu ? '' : '<p class="vf-boite vf-boite-alerte">Ce code ne figure pas dans l’export clients chargé : la liaison restera « en attente » tant qu’il n’y apparaît pas.</p>'}
        <p class="vf-motif">Décision enregistrée avec ton nom déclaré, la date du jour et la source « Liaison EBP validée par une personne ».</p>
        <div class="vf-actions"><button type="button" class="vf-btn vf-oui" data-ok>Confirmer la liaison</button><button type="button" class="vf-btn vf-nsp" data-annuler-modale>Annuler</button></div>`,
        () => { decider({ type: 'liaison', cible: cible(S.choisi), codeEbp: code }, suivant); });
    }
    function absence() {
      const s = (sug.get(S.choisi) || []).filter(c => !c.dejaRelieA), g = garages.get(S.choisi);
      const declareClient = g.e && g.e.categorie === 'client';
      modale(`<h2>Aucun compte ODICOLOR vérifié ?</h2><p>Tu déclares avoir cherché <b>${esc(g.g.nom)}</b> dans EBP sans trouver de compte.</p>
        ${declareClient ? '<p class="vf-boite vf-boite-alerte">Ce garage est déclaré <b>client</b> au téléphone : la contradiction restera « à vérifier » tant que les deux informations s’opposent.</p>' : ''}
        ${s.length ? `<div class="vf-boite vf-boite-alerte"><b>Ces fiches EBP lui ressemblent :</b><ul>${s.map(c => `<li>${esc(c.nom)} (code ${esc(c.code)}, ${esc(c.cp)}) · ${esc(c.pourquoi)}</li>`).join('')}</ul></div>
          <label class="vf-choix"><input type="checkbox" data-requis> Aucune de ces fiches n’est ce garage (elles seront notées « écartées » dans la décision)</label>` : '<label class="vf-choix"><input type="checkbox" data-requis> J’ai vérifié dans EBP</label>'}
        <div class="vf-actions"><button type="button" class="vf-btn vf-non" data-ok>Confirmer : aucun compte</button><button type="button" class="vf-btn vf-nsp" data-annuler-modale>Annuler</button></div>`,
        () => { decider({ type: 'absence', cible: cible(S.choisi), ecarte: s.map(c => c.code) }, suivant); });
    }
    function groupe() {
      const l = [...S.coches].filter(id => garages.has(id));
      const exclus = l.filter(id => (sug.get(id) || []).some(c => !c.dejaRelieA) || (garages.get(id).e && garages.get(id).e.categorie === 'client'));
      const ok = l.filter(id => !exclus.includes(id));
      modale(`<h2>Déclaration groupée : aucun compte ODICOLOR</h2>
        ${ok.length ? `<p><b>${ok.length} garage(s)</b> seront déclarés « Aucun compte ODICOLOR vérifié », avec ton nom déclaré et la date du jour :</p><ul class="vf-mini">${ok.map(id => '<li>' + esc(nomTel(id)) + '</li>').join('')}</ul>` : '<p>Aucun garage ne peut être déclaré en groupe.</p>'}
        ${exclus.length ? `<div class="vf-boite vf-boite-alerte"><b>${exclus.length} exclu(s), à traiter un par un</b> (fiche EBP proche ou déclaré client au téléphone) :<ul class="vf-mini">${exclus.map(id => '<li>' + esc(nomTel(id)) + '</li>').join('')}</ul></div>` : ''}
        ${ok.length ? `<label class="vf-choix"><input type="checkbox" data-requis> J’ai vérifié dans EBP, un par un, que ces ${ok.length} garage(s) n’ont aucun compte ODICOLOR</label>` : ''}
        <div class="vf-actions">${ok.length ? `<button type="button" class="vf-btn vf-non" data-ok>Confirmer ${ok.length} déclaration(s)</button>` : '<button type="button" class="vf-btn vf-nsp" data-ok>Fermer</button>'}<button type="button" class="vf-btn vf-nsp" data-annuler-modale>Annuler</button></div>`,
        () => { if (!ok.length) return; for (const id of ok) { try { ctx.decider({ type: 'absence', cible: cible(id), auteur: ctx.auteur() }); } catch (err) { S.erreur = err.message; break; } }
          S.coches = new Set(exclus); ctx.rafraichir(S); });
    }

    conteneur.onclick = ev => {
      const t = ev.target.closest('button, input'); if (!t) return;
      if (t.dataset.choisir) { S.choisi = Number(t.dataset.choisir); return relancer(); }
      if (t.dataset.onglet) { S.onglet = t.dataset.onglet; return relancer(); }
      if (t.dataset.coche) { const id = Number(t.dataset.coche); t.checked ? S.coches.add(id) : S.coches.delete(id); return relancer(); }
      if (t.hasAttribute('data-vider')) { S.coches.clear(); return relancer(); }
      if (t.hasAttribute('data-auteur')) { ctx.definirAuteur(''); return avecAuteur(relancer); }
      if (t.hasAttribute('data-groupe')) return avecAuteur(groupe);
      if (t.dataset.annuler) { const id = t.dataset.annuler; return avecAuteur(() => modale(`<h2>Annuler la décision ${esc(id)} ?</h2><p>Elle reste dans l’historique, marquée « annulée ». Le garage redevient « à vérifier ».</p>
          <div class="vf-actions"><button type="button" class="vf-btn vf-non" data-ok>Annuler la décision</button><button type="button" class="vf-btn vf-nsp" data-annuler-modale>Garder</button></div>`,
          () => decider({ type: 'annulation', annule: id }))); }
      if (t.dataset.decision === 'liaison') return avecAuteur(liaison);
      if (t.dataset.decision === 'absence') return avecAuteur(absence);
      if (t.dataset.decision === 'nsp') { S.passes.add(S.choisi); suivant(); return relancer(); } // rien n'est enregistré
      if (t.name === 'vf-code') return majOui();
    };
    conteneur.oninput = ev => { if (ev.target.id === 'vf-code-libre') majOui();
      if (ev.target.classList.contains('vf-chercher')) { S.filtre = ev.target.value; const pos = ev.target.selectionStart; relancer(); const c = conteneur.querySelector('.vf-chercher'); c.focus(); c.setSelectionRange(pos, pos); } };
    // Raccourcis 1, 2, 3 (hors champ de saisie et hors fenêtre de confirmation).
    const doc = conteneur.ownerDocument;
    if (conteneur._vfTouches) doc.removeEventListener('keydown', conteneur._vfTouches);
    conteneur._vfTouches = ev => {
      if (!conteneur.isConnected || !couche.hidden || /^(INPUT|TEXTAREA|SELECT)$/.test((ev.target.tagName || ''))) return;
      const b = { '1': 'liaison', '2': 'absence', '3': 'nsp' }[ev.key]; if (!b) return;
      const el = conteneur.querySelector(`[data-decision="${b}"]`); if (el && !el.disabled) { ev.preventDefault(); el.click(); }
    };
    doc.addEventListener('keydown', conteneur._vfTouches);
    if (S.erreur) $('.vf-enreg').insertAdjacentHTML('afterend', `<p class="vf-boite vf-boite-alerte" role="alert">Décision refusée : ${esc(S.erreur)}</p>`);
    return { compteurs: k, file: aVerifier, alertes: alertes.length };
  }

  const api = { suggestions, monter, mots };
  if (node) module.exports = api; else racine.VerifierComptes = api;
})(typeof self !== 'undefined' ? self : this);
