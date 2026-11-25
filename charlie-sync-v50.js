'use strict';
/* CHARLIE — synchronisation automatique Samsung ↔ CHARLIE (↔ Bureau). Module pur : réseau, stockage et horloge sont INJECTÉS.
 * Principes : hors ligne d'abord (file d'attente persistante, une seule entrée par jour = le dernier état), aucune perte
 * (fusion déterministe en cas de conflit 409 : les résultats de visite des deux côtés sont conservés), jeton uniquement en en-tête,
 * HTTPS obligatoire (sauf boucle locale), délai maximal par requête. L'export de fichier reste une solution de secours.
 * Contrat d'API : docs/CHARLIE_TOURNEE_API.md du dépôt cockpit-carrosserie (GET/PUT /api/tournee/jour/{date}, POST /api/tournee/{observation,memoire,evenement,organiser}). */
(function (racine) {
  const URL_OK = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(x.hostname)); } catch (e) { return false; } };
  const copie = (o) => JSON.parse(JSON.stringify(o));
  const cleReel = (r) => r.garageId + '|' + (r.finS == null ? '' : r.finS) + '|' + r.resultat;
  // Fusion sans perte de deux états du même jour (local + serveur).
  function fusionnerEtats(a, b) {
    if (!a) return copie(b); if (!b) return copie(a);
    const out = copie(a), plus = (x, y) => (String(x || '') >= String(y || '') ? x : y);
    const vus = new Map(); [...(a.reel || []), ...(b.reel || [])].forEach((r) => { if (!vus.has(cleReel(r))) vus.set(cleReel(r), r); });
    out.reel = [...vus.values()].sort((x, y) => (x.finS || 0) - (y.finS || 0));
    out.faits = [...new Set([...(a.faits || []), ...(b.faits || [])])]; out.retires = [...new Set([...(a.retires || []), ...(b.retires || [])])];
    const pa = a.plan && a.plan.valideLe, pb = b.plan && b.plan.valideLe;
    out.plan = pa || pb ? (plus(pa, pb) === pa ? a.plan : b.plan) : (a.plan || b.plan || null);
    const qa = a.proposition && a.proposition.genereLe, qb = b.proposition && b.proposition.genereLe;
    const prop = qa || qb ? (plus(qa, qb) === qa ? a.proposition : b.proposition) : null;
    // une proposition plus ancienne que le plan validé est caduque
    const valide = out.plan && out.plan.valideLe; if (prop && !(valide && prop.genereLe < valide)) out.proposition = prop; else delete out.proposition;
    out.jour = a.jour || b.jour; out.maj = plus(a.maj, b.maj);
    return out;
  }
  function creer({ config, stockage, fetchImpl, maintenant = () => new Date().toISOString(), delaiMs = 8000 }) {
    const FILE = 'charlieSyncFile', META = 'charlieSyncMeta';
    async function cfg() { const c = await config(); return c && c.url && c.jeton && URL_OK(c.url) ? { url: String(c.url).replace(/\/$/, ''), jeton: c.jeton, appareil: c.appareil || 'samsung' } : null; }
    async function appel(c, methode, chemin, corps) {
      const ac = typeof AbortController === 'function' ? new AbortController() : null, t = ac && setTimeout(() => ac.abort(), delaiMs);
      try {
        const r = await fetchImpl(c.url + chemin, { method: methode, headers: { Authorization: 'Bearer ' + c.jeton, 'content-type': 'application/json' }, body: corps === undefined ? undefined : JSON.stringify(corps), credentials: 'omit', referrerPolicy: 'no-referrer', signal: ac ? ac.signal : undefined });
        let j = null; try { j = await r.json(); } catch (e) { /* corps vide */ }
        return { statut: r.status, ok: r.ok, corps: j };
      } finally { if (t) clearTimeout(t); }
    }
    const lireFile = async () => (await stockage.get(FILE)) || [];
    const lireMeta = async () => (await stockage.get(META)) || { versions: {}, derniereSync: null, conflits: [] };
    const ecrireMeta = (m) => stockage.put(META, m);
    // Mise en file : un seul état en attente par jour (le dernier) ; les observations/mémoire s'accumulent.
    async function enfiler(item) { let f = await lireFile(); if (item.type === 'etat') f = f.filter((x) => !(x.type === 'etat' && x.jour === item.jour)); f.push({ ...item, t: maintenant() }); await stockage.put(FILE, f.slice(-500)); }
    async function envoyer(c, it, meta) {
      if (it.type === 'etat') {
        const base = meta.versions[it.jour] || 0, r = await appel(c, 'PUT', '/api/tournee/jour/' + it.jour, { baseVersion: base, appareil: c.appareil, etat: it.etat });
        if (r.ok) { meta.versions[it.jour] = r.corps.version; return { ok: true }; }
        if (r.statut === 409 && r.corps) { const fusion = fusionnerEtats(it.etat, r.corps.etat); meta.versions[it.jour] = r.corps.version; meta.conflits.push({ jour: it.jour, le: maintenant(), resolu: 'fusion sans perte' });
          const r2 = await appel(c, 'PUT', '/api/tournee/jour/' + it.jour, { baseVersion: r.corps.version, appareil: c.appareil, etat: fusion }); if (r2.ok) { meta.versions[it.jour] = r2.corps.version; return { ok: true, fusion }; } return { ok: false, rejet: r2.statut }; }
        return { ok: false, rejet: r.statut };
      }
      const chemin = { observation: '/api/tournee/observation', memoire: '/api/tournee/memoire' }[it.type];
      if (!chemin) return { ok: true }; // type inconnu : abandonné sans bloquer la file
      const r = await appel(c, 'POST', chemin, it.corps); return { ok: r.ok, rejet: r.ok ? undefined : r.statut };
    }
    // Vide la file dans l'ordre. Erreur réseau/5xx → on s'arrête (reprise plus tard) ; 4xx (hors 409 géré) → l'entrée est mise de côté et signalée.
    async function vider() {
      const c = await cfg(); if (!c) return { statut: 'non_configure', restant: (await lireFile()).length };
      const meta = await lireMeta(); let f = await lireFile(), fusions = [];
      while (f.length) {
        let r; try { r = await envoyer(c, f[0], meta); } catch (e) { await ecrireMeta(meta); await stockage.put(FILE, f); return { statut: 'hors_ligne', restant: f.length, fusions }; }
        if (!r.ok && (r.rejet == null || r.rejet >= 500)) { await ecrireMeta(meta); await stockage.put(FILE, f); return { statut: 'hors_ligne', restant: f.length, fusions }; }
        if (!r.ok) meta.conflits.push({ jour: f[0].jour || null, le: maintenant(), resolu: 'REJETÉ par le serveur (HTTP ' + r.rejet + ') : mis de côté' });
        if (r.fusion) fusions.push({ jour: f[0].jour, etat: r.fusion });
        f = f.slice(1);
      }
      meta.derniereSync = maintenant(); await ecrireMeta(meta); await stockage.put(FILE, f);
      return { statut: 'synchronise', restant: 0, fusions };
    }
    return {
      async pousser(jour, etat) { await enfiler({ type: 'etat', jour, etat: copie(etat) }); return vider(); },
      async observation(corps) { await enfiler({ type: 'observation', corps }); return vider(); },
      async memoire(corps) { await enfiler({ type: 'memoire', corps }); return vider(); },
      async tirer(jour) {
        const c = await cfg(); if (!c) return { statut: 'non_configure' };
        try { const r = await appel(c, 'GET', '/api/tournee/jour/' + jour); if (!r.ok) return { statut: 'erreur', http: r.statut };
          const meta = await lireMeta(); meta.versions[jour] = r.corps.version; meta.derniereSync = maintenant(); await ecrireMeta(meta); return { statut: 'ok', version: r.corps.version, etat: r.corps.etat, majLe: r.corps.majLe }; }
        catch (e) { return { statut: 'hors_ligne' }; }
      },
      // Feuille de Laurent du jour telle que la connaît CHARLIE (cockpit/Airtable) : { date, zone, semaine, garages:[noms], heures?:{nom:'HH:MM'} }
      async laurent(jour) { const c = await cfg(); if (!c) return { statut: 'non_configure' }; try { const r = await appel(c, 'GET', '/api/tournee/laurent/' + jour); return r.ok ? { statut: 'ok', laurent: r.corps && r.corps.garages ? r.corps : null } : { statut: 'erreur', http: r.statut }; } catch (e) { return { statut: 'hors_ligne' }; } },
      vider,
      async statut() { const c = await cfg(), f = await lireFile(), m = await lireMeta(); return { configure: !!c, enAttente: f.length, derniereSync: m.derniereSync, conflits: m.conflits.length, etat: !c ? 'non_configure' : f.length ? 'en_attente' : 'synchronise' }; }
    };
  }
  const API = { creer, fusionnerEtats, urlAutorisee: URL_OK };
  if (typeof module === 'object' && module.exports) module.exports = API; else racine.CharlieSync = API;
})(typeof window !== 'undefined' ? window : globalThis);
