'use strict';
/* Devis terrain : tout reste sur le téléphone (IndexedDB). Seule exception : le bouton « Fiche officielle » d'un client envoie son NOM au registre public (recherche-entreprises.api.gouv.fr), à la demande. */
const VERSION = 'v3';

// ---------- utilitaires ----------
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clean = v => (v == null ? '' : String(v)).replace(/[  ]/g, ' ').trim();
let toastT;
function toast(msg, ko) {
  const t = $('#toast'); t.textContent = msg; t.style.background = ko ? 'var(--ko)' : ''; t.style.color = ko ? '#fff' : '';
  t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ko ? 4500 : 2200);
}

// ---------- dictée / liste : texte -> lignes (règles locales, aucune IA ni réseau) ----------
// Exemple : « 18 ROB62694 remise 55, 144 masking tape 18mm ». Se dicte avec le micro du clavier Samsung.
function analyserTexte(txt) {
  return String(txt || '').split(/\n|;|,|\bet\b|\bpuis\b/i).map(x => x.trim()).filter(Boolean).slice(0, 60).map(brut => {
    let seg = brut, r = '0', q = '1';
    const mr = seg.match(/(?:remise|rem\.?|moins|-)\s*(\d+(?:[.,]\d+)?)\s*(?:%|pour ?cent)?/i);
    if (mr) { r = mr[1]; seg = seg.replace(mr[0], ' '); }
    let m;
    if ((m = seg.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:x|fois)?\s+(?=\S)/i))) { q = m[1]; seg = seg.slice(m[0].length); }
    else if ((m = seg.match(/\bx\s*(\d+(?:[.,]\d+)?)\b/i))) { q = m[1]; seg = seg.replace(m[0], ' '); }
    else if ((m = seg.match(/\b(\d+(?:[.,]\d+)?)\s*x\b/i))) { q = m[1]; seg = seg.replace(m[0], ' '); }
    const requete = seg.replace(/^\s*(de|du|des|d')\s*/i, '').replace(/\s+/g, ' ').trim();
    let cands = chercher(requete, 6), t = requete.split(' ');
    while (!cands.length && t.length > 1) { t.pop(); cands = chercher(t.join(' '), 6); } // on retire les mots en trop de la fin
    return { brut, q, r, requete, cands };
  });
}

// ---------- argent : tout en entiers (centimes), jamais de flottants ----------
// Montant texte -> centimes entiers. Accepte « 11,80 », « 1 200,00 », « 7.50 », « 1.200,50 », « 1,200.50 », nombres Excel.
function parseCents(v) {
  if (v == null) return null;
  if (typeof v === 'number') { if (!isFinite(v)) throw new Error('montant illisible'); v = String(v); if (/e/i.test(v)) v = Number(v).toFixed(4); }
  let s = String(v).replace(/[\s  €]/g, '');
  if (!s) return null;
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c >= 0 && d >= 0) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('montant illisible : « ' + clean(v) + ' »');
  const neg = s[0] === '-'; if (neg) s = s.slice(1);
  const [w, f = ''] = s.split('.');
  if (w.length > 12) throw new Error('montant trop grand');
  let n = Number(BigInt(w) * 100n + BigInt((f + '00').slice(0, 2)));
  if (f.length > 2 && f[2] >= '5') n += 1; // arrondi comptable (demi vers le haut)
  return neg ? -n : n;
}
const QTE_MAX = 99999999; // 999 999,99
function parseQte(v) { // -> centièmes, ou null si invalide
  try { const n = parseCents(v); return (n != null && n > 0 && n <= QTE_MAX) ? n : null; } catch (e) { return null; }
}
function parseRemise(v) { // -> centièmes de %, ou null
  try { const n = parseCents(v === '' ? '0' : v); return (n != null && n >= 0 && n <= S.remiseMax100) ? n : null; } catch (e) { return null; }
}
const hup = (n, d) => Number((n * 2n + d) / (2n * d)); // n/d arrondi demi vers le haut (n, d positifs)
function ligneTotal(l) { return hup(BigInt(l.q) * BigInt(l.pu) * BigInt(10000 - l.r), 1000000n); }
function totaux(d) {
  const ht = d.lignes.reduce((a, l) => a + ligneTotal(l), 0);
  const tva = hup(BigInt(ht) * BigInt(S.tva100), 10000n);
  return { ht, tva, ttc: ht + tva };
}
const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ') + ' €';
const num2 = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, '');
const qtxt = q => (q / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/[  ]/g, ' ');
const pct = c => (c / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

// ---------- base locale ----------
const DB = { db: null };
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const st = (n, m = 'readonly') => DB.db.transaction(n, m).objectStore(n);
const getAll = n => rq(st(n).getAll());
const get = (n, k) => rq(st(n).get(k));
const put = (n, v, k) => rq(st(n, 'readwrite').put(v, k));
const del = (n, k) => rq(st(n, 'readwrite').delete(k));
function putMany(n, items) {
  return new Promise((res, rej) => {
    const t = DB.db.transaction(n, 'readwrite'), s = t.objectStore(n);
    items.forEach(i => s.put(i));
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('devis-terrain', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('articles', { keyPath: 'code' });
      d.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('devis', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('meta');
    };
    r.onsuccess = () => { DB.db = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}

const SET_DEF = { tva100: 850, remiseMax100: 6000, indicatif: '262', societe: 'Odicolor', vendeur: '' };
const nouvelUid = () => (crypto.randomUUID ? crypto.randomUUID() : 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
let S = { ...SET_DEF };
let CAT = [];
async function chargerBase() {
  S = { ...SET_DEF, ...((await get('meta', 'settings')) || {}) };
  CAT = await getAll('articles');
  CAT.forEach(a => { a._n = norm(a.code + ' ' + a.des); });
}
function chercher(q, max = 15) {
  const toks = norm(q).split(/\s+/).filter(Boolean).slice(0, 5);
  if (!toks.length) return [];
  const nq = norm(q).trim();
  return CAT.filter(a => toks.every(t => a._n.includes(t)))
    .sort((a, b) => (norm(b.code).startsWith(nq) - norm(a.code).startsWith(nq)) || a.code.localeCompare(b.code)).slice(0, max);
}

// ---------- lecture de fichiers (xlsx / csv) ----------
const MAX_OCTETS = 10 * 1024 * 1024, MAX_LIGNES = 50000;
function chargerXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => { const s = h('script', { src: 'lib/xlsx.mini.min.js' }); s.onload = res; s.onerror = () => rej(new Error('Lecteur Excel introuvable')); document.head.append(s); });
}
function parseCSV(text) {
  const first = text.split(/\r?\n/, 1)[0];
  const delim = [';', '\t', '|', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function lireFichier(file) {
  if (file.size > MAX_OCTETS) throw new Error('Fichier trop gros (10 Mo maximum).');
  const buf = await file.arrayBuffer();
  const nom = file.name.toLowerCase();
  let feuilles; // [{nom, rows: tableau de tableaux, la ligne i = ligne Excel i+1}]
  if (/\.(xlsx|xlsm)$/.test(nom)) {
    await chargerXlsx();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    feuilles = wb.SheetNames.map(n => ({ nom: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: true, defval: null, raw: true }) }));
  } else {
    let txt;
    try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder('windows-1252').decode(buf); }
    feuilles = [{ nom: 'CSV', rows: parseCSV(txt.replace(/^﻿/, '')) }];
  }
  feuilles.forEach(f => { if (f.rows.length > MAX_LIGNES + 1) throw new Error('Plus de ' + MAX_LIGNES + ' lignes : découpe le fichier.'); });
  return feuilles;
}
function ligneEntete(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) if ((rows[i] || []).filter(c => clean(c) !== '').length >= 2) return i;
  return 0;
}

// ---------- imports ----------
const CHAMPS = {
  articles: [
    ['code', 'Code article', true, [/^(code|codearticle|reference|ref|refarticle|article)$/, /^(code|ref)/]],
    ['des', 'Désignation', true, [/designation|libelle|description/, /^nom/]],
    ['prix', 'Prix de vente HT', true, [/tarif.*france/, /tarif/, /prixvente|pvht|prix.*ht/, /prix|pv/]],
  ],
  clients: [
    ['nom', 'Nom du client', true, [/^(nom|raison|client|societe|entreprise|designation)/]],
    ['tel', 'Téléphone (facultatif)', false, [/tel|phone|mobile|portable/]],
  ],
};
function devinerColonnes(kind, entetes) {
  const ne = entetes.map(e => norm(e).replace(/[^a-z0-9]/g, ''));
  const map = {};
  for (const [cle, , , regs] of CHAMPS[kind]) {
    for (const re of regs) { const i = ne.findIndex((n, k) => n && re.test(n) && !Object.values(map).includes(k)); if (i >= 0) { map[cle] = i; break; } }
  }
  return map;
}
function nouveauRapport() { return { lues: 0, crees: 0, maj: 0, ignorees: 0, erreurs: [], avertissements: [] }; }
const err = (r, ligne, msg) => r.erreurs.push({ ligne, msg });

function importerArticles(rows, debut, map, existants) {
  const rep = nouveauRapport(), out = [];
  const lignes = [];
  for (let i = debut + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every(c => clean(c) === '')) continue; // ligne totalement vide : on saute sans compter
    lignes.push({ n: i + 1, code: clean(r[map.code]), brut: r[map.code], des: clean(r[map.des]), prixBrut: r[map.prix] });
  }
  let espaces = 0;
  const vus = new Map();
  for (const l of lignes) {
    if (l.brut != null && String(l.brut) !== l.code && l.code) espaces++;
    if (!l.code) continue;
    let p = null; try { p = parseCents(l.prixBrut); } catch (e) { p = null; }
    if (!vus.has(l.code)) vus.set(l.code, []);
    vus.get(l.code).push({ n: l.n, p });
  }
  const conflits = new Set();
  for (const [c, v] of vus) if (new Set(v.map(x => x.p)).size > 1) {
    conflits.add(c);
    err(rep, 0, 'Code ' + c + ' en double avec des prix différents (' + v.map(x => 'ligne ' + x.n + ' : ' + (x.p == null ? 'vide' : num2(x.p))).join(' / ') + ') : aucune des lignes importée, à trancher dans EBP.');
  }
  if (espaces) rep.avertissements.push(espaces + ' code(s) avec des espaces parasites : nettoyés.');
  const deja = new Set();
  for (const l of lignes) {
    rep.lues++;
    if (!l.code) { rep.ignorees++; err(rep, l.n, 'ligne sans code (désignation : ' + (l.des || 'vide') + ' ; prix : ' + (clean(l.prixBrut) || 'vide') + ')'); continue; }
    if (!l.des) { rep.ignorees++; err(rep, l.n, 'code ' + l.code + ' sans désignation'); continue; }
    if (conflits.has(l.code)) { rep.ignorees++; continue; }
    if (deja.has(l.code)) { rep.ignorees++; rep.avertissements.push('ligne ' + l.n + ' : code ' + l.code + ' en double avec le même prix, ignoré'); continue; }
    deja.add(l.code);
    const txt = clean(l.prixBrut).replace(/\s/g, '');
    if (/^\d{1,3}\.\d{3}$/.test(txt)) { rep.ignorees++; err(rep, l.n, l.code + ' : prix ambigu (« ' + txt + ' » : 1,2 € ou 1 200 € ?), à vérifier'); continue; }
    let p;
    try { p = parseCents(l.prixBrut); } catch (e) { rep.ignorees++; err(rep, l.n, l.code + ' : ' + e.message); continue; }
    if (p == null) { rep.ignorees++; err(rep, l.n, l.code + ' : prix de vente manquant'); continue; }
    if (p <= 0) { rep.ignorees++; err(rep, l.n, l.code + ' : prix de vente nul ou négatif (' + num2(p) + ')'); continue; }
    if (l.code.length > 60 || l.des.length > 200) rep.avertissements.push('ligne ' + l.n + ' : texte tronqué pour ' + l.code);
    out.push({ code: l.code.slice(0, 60), des: l.des.replace(/\s+/g, ' ').slice(0, 200), pu: p });
    existants.has(l.code.slice(0, 60)) ? rep.maj++ : rep.crees++;
  }
  return { rep, items: out };
}
function importerClients(rows, debut, map, existants) {
  const rep = nouveauRapport(), out = [], vusN = new Set();
  for (let i = debut + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every(c => clean(c) === '')) continue;
    rep.lues++;
    const nom = clean(r[map.nom]).replace(/\s+/g, ' ');
    if (!nom) { rep.ignorees++; err(rep, i + 1, 'ligne sans nom'); continue; }
    const k = norm(nom);
    if (vusN.has(k)) { rep.ignorees++; rep.avertissements.push('ligne ' + (i + 1) + ' : « ' + nom + ' » en double, ignoré'); continue; }
    vusN.add(k);
    const tel = map.tel != null ? clean(r[map.tel]).slice(0, 30) : '';
    const ex = existants.get(k);
    if (ex) { rep.maj++; out.push({ ...ex, tel: tel || ex.tel }); } else { rep.crees++; out.push({ nom: nom.slice(0, 120), tel }); }
  }
  return { rep, items: out };
}

// ---------- routage ----------
const app = $('#app');
function montrer(titre, ...nodes) { $('#titre').textContent = titre; app.replaceChildren(...nodes.flat(Infinity).filter(Boolean)); window.scrollTo(0, 0); }
function nonTrouve() { montrer('Introuvable', h('p', { class: 'vide' }, 'Cette page n’existe pas. '), h('a', { class: 'btn', href: '#/' }, 'Retour')); }
async function route() {
  const p = (location.hash || '#/').slice(2).split('/');
  document.querySelectorAll('.onglets a').forEach(a => a.classList.toggle('on', a.dataset.p === (p[0] || 'accueil') || (p[0] === 'devis' || p[0] === 'nouveau') && a.dataset.p === 'accueil'));
  try {
    if (p[0] === '' || p[0] === undefined) await pageAccueil();
    else if (p[0] === 'nouveau') await pageChoixClient();
    else if (p[0] === 'devis' && /^\d+$/.test(p[1] || '')) await pageDevis(Number(p[1]));
    else if (p[0] === 'clients') await pageClients();
    else if (p[0] === 'client' && /^\d+$/.test(p[1] || '')) await pageClient(Number(p[1]));
    else if (p[0] === 'catalogue') await pageCatalogue();
    else if (p[0] === 'reglages') await pageReglages();
    else nonTrouve();
  } catch (e) { console.error(e); toast('Erreur : ' + e.message, true); }
}

// ---------- accueil ----------
const numero = d => 'D' + String(new Date(d.creeLe).getFullYear()).slice(2) + '-' + String(d.id).padStart(5, '0');
const dateFr = iso => new Date(iso).toLocaleDateString('fr-FR');
// Mesure du poste (méthodes) : durée création -> 1re sortie. Au-delà de 2 h = devis interrompu, exclu de la médiane.
function statsDevis(dv) {
  const mesures = dv.filter(d => d.t2).map(d => ({ min: (new Date(d.t2) - new Date(d.creeLe)) / 60000, lignes: d.lignes.length, taps: d.lignes.length }));
  const ok = mesures.filter(m => m.min >= 0 && m.min <= 120).sort((a, b) => a.min - b.min);
  const med = ok.length ? ok[Math.floor((ok.length - 1) / 2)].min : null;
  return { n: dv.length, mesures: mesures.length, exclus: mesures.length - ok.length, med, semaine: dv.filter(d => Date.now() - new Date(d.creeLe).getTime() < 7 * 864e5).length };
}
async function pageAccueil() {
  const [dv, cl] = [await getAll('devis'), await getAll('clients')];
  dv.sort((a, b) => b.id - a.id);
  montrer('Devis',
    CAT.length ? null : h('div', { class: 'carte alerte' }, h('strong', {}, 'Catalogue vide. '), 'Importe ton fichier de tarifs pour pouvoir faire des devis. ', h('a', { href: '#/catalogue' }, 'Aller au catalogue')),
    h('a', { class: 'btn gros', href: '#/nouveau' }, '➕ Nouveau devis'),
    (() => { const sem = dv.filter(d => d.lignes.length && Date.now() - new Date(d.creeLe).getTime() < 7 * 864e5); return sem.length ? h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: () => envoyerDevis(sem, 'recap-devis-' + new Date().toISOString().slice(0, 10) + '.json') }, 'Envoyer le récap : ' + sem.length + ' devis de la semaine')) : null; })(),
    (() => { const x = statsDevis(dv); return x.n ? h('div', { class: 'carte', role: 'status' }, h('strong', {}, 'Mon poste'), h('br'), h('small', {}, x.semaine + ' devis cette semaine · ' + (x.med == null ? 'temps par devis : pas encore mesuré' : 'temps médian par devis : ' + (x.med < 1 ? 'moins d’1 min' : Math.round(x.med) + ' min') + ' (sur ' + (x.mesures - x.exclus) + ' devis' + (x.exclus ? ', ' + x.exclus + ' interrompu(s) exclu(s)' : '') + ')'))) : null; })(),
    h('h2', {}, 'Derniers devis'),
    dv.length ? dv.slice(0, 30).map(d => h('a', { class: 'ligne', href: '#/devis/' + d.id, style: 'color:inherit;text-decoration:none' },
      h('span', { class: 'g' }, h('strong', {}, d.clientNom), h('br'), h('small', {}, numero(d) + ' · ' + dateFr(d.creeLe))),
      h('span', { class: 'prix' }, eur(totaux(d).ht), h('br'), h('span', { class: 'tag ' + (d.statut === 'envoye' ? 'ok' : 'warn') }, d.statut === 'envoye' ? 'Envoyé' : 'Brouillon')))) : h('p', { class: 'vide' }, 'Aucun devis pour l’instant.'),
    cl.length ? null : h('p', { class: 'mut' }, 'Astuce : tu peux aussi importer ta liste de clients (onglet Clients).'));
}

// ---------- clients ----------
async function creerDevis(client) {
  const d = { uid: nouvelUid(), clientId: client.id, clientNom: client.nom, creeLe: new Date().toISOString(), statut: 'brouillon', lignes: [], notes: '' };
  const id = await rq(st('devis', 'readwrite').add(d));
  location.hash = '#/devis/' + id;
}
async function pageChoixClient() {
  const cl = (await getAll('clients')).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const liste = h('div');
  const q = h('input', { type: 'search', placeholder: 'Chercher un client…', 'aria-label': 'Chercher un client', autocomplete: 'off' });
  const dessiner = () => {
    const t = norm(q.value).trim();
    const f = cl.filter(c => !t || norm(c.nom).includes(t)).slice(0, 40);
    liste.replaceChildren(...(f.length ? f.map(c => h('button', { class: 'ligne', style: 'width:100%;background:none;border:0;border-bottom:1px solid var(--line);color:inherit;font:inherit;text-align:left;min-height:56px;cursor:pointer', onclick: () => creerDevis(c) },
      h('span', { class: 'g' }, h('strong', {}, c.nom), c.tel ? h('br') : null, c.tel ? h('small', {}, c.tel) : null))) : [h('p', { class: 'vide' }, 'Aucun client trouvé.')]));
  };
  q.addEventListener('input', dessiner); dessiner();
  const nom = h('input', { placeholder: 'Nom du nouveau client', 'aria-label': 'Nom du nouveau client' });
  const tel = h('input', { type: 'tel', placeholder: 'Téléphone (facultatif)', 'aria-label': 'Téléphone' });
  montrer('Pour quel client ?', q, liste,
    h('h2', {}, 'Nouveau client'),
    h('div', { class: 'carte' }, nom, h('div', { style: 'height:8px' }), tel, h('div', { style: 'height:8px' }),
      h('button', { class: 'btn', style: 'width:100%', onclick: async () => {
        const n = clean(nom.value).replace(/\s+/g, ' ');
        if (!n) { toast('Donne un nom au client.', true); nom.focus(); return; }
        const id = await rq(st('clients', 'readwrite').add({ nom: n.slice(0, 120), tel: clean(tel.value).slice(0, 30) }));
        await creerDevis({ id, nom: n });
      } }, 'Créer et commencer le devis')));
}
// ---------- fiche prospect : registre officiel (réseau, à la demande) + questions terrain + avis par règles ----------
const TRANCHES = { '00': '0 salarié', '01': '1-2', '02': '3-5', '03': '6-9', '11': '10-19', '12': '20-49', '21': '50-99', '22': '100-199', '31': '200-249', '32': '250-499', '41': '500-999', '42': '1000-1999', '51': '2000-4999', '52': '5000-9999', '53': '10000+' };
const NAF_PEINTURE = { '45.20B': 'carrosserie (probable peinture)', '45.20A': 'mécanique / entretien (peinture à vérifier)', '45.11Z': 'vente de voitures (peinture à vérifier)', '45.19Z': 'vente d’autres véhicules (peinture à vérifier)' };
const nb = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const tx = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);
function lireEntreprise(r) {
  const s = r.siege || {};
  const ans = Object.keys(r.finances || {}).sort().pop();
  const f = ans ? (r.finances[ans] || {}) : {};
  const d = (Array.isArray(r.dirigeants) ? r.dirigeants : []).find(x => x && x.type_dirigeant === 'personne physique');
  return {
    siren: tx(r.siren, 9), nom: tx(r.nom_complet, 120), adresse: tx(s.adresse, 160), naf: tx(r.activite_principale, 8),
    tranche: tx(r.tranche_effectif_salarie, 2), anneeEff: nb(r.annee_tranche_effectif_salarie), etat: tx(r.etat_administratif, 1),
    creation: tx(r.date_creation, 10), ouverts: nb(r.nombre_etablissements_ouverts), annee: ans ? tx(ans, 4) : '', ca: nb(f.ca), resultat: nb(f.resultat_net),
    dirigeant: d ? (tx(d.prenoms, 40).split(' ')[0] + ' ' + tx(d.nom, 60) + (d.qualite ? ' (' + tx(d.qualite, 40) + ')' : '')).trim() : '', lu: new Date().toISOString()
  };
}
async function chercherEntreprise(q) {
  if (!navigator.onLine) throw new Error('Pas de réseau. Réessaie quand tu as du réseau : la fiche officielle ne marche qu’en ligne.');
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 9000);
  try {
    const rep = await fetch('https://recherche-entreprises.api.gouv.fr/search?per_page=5&q=' + encodeURIComponent(q), { signal: ac.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!rep.ok) throw new Error('Le registre a répondu ' + rep.status + '.');
    const j = await rep.json();
    return (Array.isArray(j.results) ? j.results : []).slice(0, 5).map(lireEntreprise).filter(e => /^\d{9}$/.test(e.siren));
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Le registre ne répond pas (9 s). Réessaie plus tard.' : (e.message === 'Failed to fetch' ? 'Registre injoignable (réseau ou blocage navigateur).' : e.message));
  } finally { clearTimeout(t); }
}
// Avis = règles simples et lisibles, PAS de l'IA. Seuils non validés : à ajuster avec ton terrain.
function avisProspect(c) {
  const e = c.ent, raisons = [], manque = [];
  if (e && e.etat && e.etat !== 'A') return { n: 'ko', titre: 'À abandonner', raisons: ['Entreprise cessée selon le registre officiel.'] };
  if (c.cabine === 'non') return { n: 'ko', titre: 'À abandonner', raisons: ['Pas de cabine de peinture : il n’achète pas de peinture.'] };
  let warn = false;
  if (e) {
    if (e.ca != null && e.resultat != null && e.ca > 0) {
      const m = e.resultat / e.ca * 100;
      raisons.push('Résultat net ' + e.annee + ' : ' + m.toFixed(1).replace('.', ',') + ' % du CA.');
      if (e.resultat < 0) { warn = true; raisons.push('Résultat négatif : prudence sur le paiement (délai / acompte).'); }
    } else manque.push('comptes publiés');
    if (e.tranche === '00' || e.tranche === '01') { warn = true; raisons.push('Très petite structure (' + TRANCHES[e.tranche] + ' salarié) : volume de peinture probablement faible.'); }
    if (e.naf && NAF_PEINTURE[e.naf]) raisons.push('Activité déclarée ' + e.naf + ' : ' + NAF_PEINTURE[e.naf] + '.');
  } else manque.push('fiche officielle');
  if (c.cabine !== 'oui') manque.push('cabine de peinture (oui/non)');
  if (!clean(c.fournisseur)) manque.push('fournisseur actuel');
  if (!(Number(c.volume) > 0)) manque.push('achat peinture €/mois');
  if (c.cabine === 'oui' && !warn && manque.length === 0) return { n: 'ok', titre: 'Prospect à visiter', raisons };
  if (c.cabine === 'oui' && !warn) return { n: 'ok', titre: 'Prospect à visiter (infos incomplètes)', raisons: raisons.concat(['À demander : ' + manque.join(', ') + '.']) };
  if (warn) return { n: 'warn', titre: 'À vérifier avant de se déplacer', raisons: raisons.concat(manque.length ? ['À demander : ' + manque.join(', ') + '.'] : []) };
  return { n: '?', titre: 'Pas assez d’infos', raisons: raisons.concat(['À demander : ' + manque.join(', ') + '.']) };
}
async function pageClient(id) {
  const c = await get('clients', id);
  if (!c) return nonTrouve();
  const eurK = v => v == null ? '—' : Math.round(v).toLocaleString('fr-FR') + ' €';
  const verdict = h('div'), fiche = h('div'), zoneRech = h('div');
  const cabine = h('select', { 'aria-label': 'Cabine de peinture' }, ['', 'oui', 'non'].map(v => h('option', { value: v, selected: c.cabine === v }, v === '' ? 'Je ne sais pas encore' : v === 'oui' ? 'Oui, il peint chez lui' : 'Non, il ne peint pas')));
  const fourn = h('input', { value: c.fournisseur || '', placeholder: 'Ex. Roberlo, Sherwin, autre…', maxlength: 60, 'aria-label': 'Fournisseur actuel' });
  const vol = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 1000000, value: c.volume || '', placeholder: 'Estimation, en € par mois', 'aria-label': 'Achat de peinture par mois' });
  const stat = h('select', { 'aria-label': 'Statut' }, [['prospect', 'Prospect'], ['client', 'Client']].map(([v, l]) => h('option', { value: v, selected: (c.statutCrm || 'prospect') === v }, l)));
  const notes = h('textarea', { rows: 3, maxlength: 500, placeholder: 'Contact, visite, ce qu’il a dit…', 'aria-label': 'Notes' }, c.notes || '');
  const lire = () => { c.cabine = cabine.value; c.fournisseur = clean(fourn.value).slice(0, 60); c.volume = Math.max(0, Math.min(1e6, Number(vol.value) || 0)) || ''; c.statutCrm = stat.value; c.notes = notes.value.slice(0, 500); };
  const dessinerVerdict = () => {
    lire(); const a = avisProspect(c);
    verdict.replaceChildren(h('div', { class: 'carte ' + (a.n === 'ko' ? 'erreur' : a.n === 'ok' ? 'reussi' : 'alerte'), role: 'status' },
      h('strong', {}, a.titre), h('br'), a.raisons.map(x => h('div', {}, x)), h('small', { class: 'mut' }, 'Avis par règles simples, pas de l’IA. À toi de décider.')));
  };
  const dessinerFiche = () => {
    const e = c.ent;
    fiche.replaceChildren(...[e ? h('div', { class: 'carte' },
      h('strong', {}, e.nom), h('br'), h('small', {}, 'SIREN ' + e.siren + ' · ' + e.adresse), h('br'),
      h('small', {}, 'Créé : ' + (e.creation ? dateFr(e.creation) : '—') + ' · NAF ' + (e.naf || '—') + ' · ' + (e.etat === 'A' ? 'Actif' : 'CESSÉ')), h('br'),
      h('small', {}, 'Effectif : ' + (TRANCHES[e.tranche] || 'non renseigné') + (e.anneeEff ? ' (' + e.anneeEff + ')' : '')), h('br'),
      h('small', {}, 'CA ' + (e.annee || '') + ' : ' + eurK(e.ca) + ' · résultat net : ' + eurK(e.resultat)), e.dirigeant ? h('br') : null,
      e.dirigeant ? h('small', {}, 'Dirigeant : ' + e.dirigeant) : null, h('br'),
      h('small', { class: 'mut' }, 'Source : registre officiel (data.gouv), lu le ' + dateFr(e.lu) + '. Peut être en retard sur la réalité.')) : null].filter(Boolean));
  };
  const rechercher = async (btn) => {
    btn.disabled = true; zoneRech.replaceChildren(h('p', { class: 'mut' }, 'Recherche en cours…'));
    try {
      const res = await chercherEntreprise(c.nom);
      zoneRech.replaceChildren(...[res.length ? [h('p', { class: 'mut' }, 'Choisis le bon (attention aux homonymes) :'), res.map(e => h('div', { class: 'ligne' },
        h('span', { class: 'g' }, h('strong', {}, e.nom), h('br'), h('small', {}, e.adresse + ' · ' + (e.etat === 'A' ? 'actif' : 'cessé') + ' · ' + (TRANCHES[e.tranche] || 'effectif ?'))),
        h('button', { class: 'btn sec', onclick: async () => { lire(); c.ent = e; await putMany('clients', [c]); dessinerFiche(); dessinerVerdict(); zoneRech.replaceChildren(); toast('Fiche enregistrée.'); } }, 'C’est lui')))] : h('p', { class: 'vide' }, 'Aucune entreprise trouvée. Essaie avec le nom complet ou la ville.')].flat(Infinity));
    } catch (err) { zoneRech.replaceChildren(h('div', { class: 'carte erreur' }, err.message)); }
    btn.disabled = false;
  };
  [cabine, fourn, vol, stat].forEach(x => x.addEventListener('input', dessinerVerdict));
  const bRech = h('button', { class: 'btn', onclick: () => rechercher(bRech) }, c.ent ? '🔎 Relire le registre' : '🔎 Fiche officielle (réseau)');
  montrer(c.nom,
    h('p', { class: 'mut' }, c.tel || 'Pas de téléphone'),
    h('div', { class: 'actions' }, bRech, h('button', { class: 'btn sec', onclick: () => creerDevis(c) }, 'Nouveau devis')),
    zoneRech, fiche, verdict,
    h('h2', {}, 'Questions terrain'),
    h('label', {}, 'A-t-il une cabine de peinture ?'), cabine,
    h('label', {}, 'Fournisseur actuel'), fourn,
    h('label', {}, 'Achat de peinture par mois (€)'), vol,
    h('label', {}, 'Statut'), stat,
    h('label', {}, 'Notes'), notes,
    h('div', { style: 'height:10px' }),
    h('button', { class: 'btn gros', onclick: async () => { lire(); await putMany('clients', [c]); toast('Enregistré.'); } }, 'Enregistrer'),
    h('p', { class: 'mut' }, 'Seul le nom du client est envoyé au registre public quand tu appuies sur « Fiche officielle ». Rien d’autre ne quitte le téléphone.'));
  dessinerFiche(); dessinerVerdict();
}
async function pageClients() {
  const cl = (await getAll('clients')).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const zone = h('div');
  montrer('Clients',
    h('p', { class: 'mut' }, cl.length + ' client(s) sur ce téléphone.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => importUI('clients', zone) }, 'Importer une liste (Excel / CSV)')),
    zone,
    cl.map(c => h('div', { class: 'ligne' }, h('span', { class: 'g' }, h('strong', {}, c.nom), c.tel ? h('br') : null, c.tel ? h('small', {}, c.tel) : null),
      h('span', { class: 'rapide' },
        h('a', { class: 'btn sec', href: '#/client/' + c.id }, 'Fiche'),
        h('button', { class: 'btn sec', onclick: () => creerDevis(c) }, 'Devis'),
        h('button', { class: 'btn danger', 'aria-label': 'Supprimer ' + c.nom, onclick: async () => { if (confirm('Supprimer le client « ' + c.nom + ' » ? Ses devis sont conservés.')) { await del('clients', c.id); pageClients(); } } }, '🗑')))));
}

// ---------- catalogue ----------
function rapportNode(titre, rep) {
  const ok = rep.crees + rep.maj;
  const cls = rep.erreurs.length ? (ok ? 'alerte' : 'erreur') : 'reussi';
  return h('div', { class: 'carte ' + cls, role: 'status' },
    h('strong', {}, titre), h('p', {}, rep.lues + ' ligne(s) lue(s) · ' + rep.crees + ' créée(s) · ' + rep.maj + ' mise(s) à jour · ' + rep.ignorees + ' refusée(s)'),
    rep.erreurs.length ? h('details', { open: rep.erreurs.length <= 15 }, h('summary', {}, 'Refusées et pourquoi (' + rep.erreurs.length + ' motif(s))'),
      h('ul', { class: 'liste-rapport' }, rep.erreurs.slice(0, 200).map(e => h('li', {}, (e.ligne ? 'Ligne ' + e.ligne + ' : ' : '') + e.msg)), rep.erreurs.length > 200 ? h('li', {}, '… et ' + (rep.erreurs.length - 200) + ' autre(s).') : null)) : null,
    rep.avertissements.length ? h('details', {}, h('summary', {}, 'Avertissements (' + rep.avertissements.length + ')'),
      h('ul', { class: 'liste-rapport' }, rep.avertissements.slice(0, 100).map(a => h('li', {}, a)))) : null);
}
async function pageCatalogue() {
  const rapport = await get('meta', 'rapport_articles');
  const zone = h('div');
  const res = h('div');
  const q = h('input', { type: 'search', placeholder: 'Chercher : code ou désignation…', 'aria-label': 'Chercher dans le catalogue', autocomplete: 'off' });
  q.addEventListener('input', () => {
    const r = chercher(q.value, 30);
    res.replaceChildren(...(q.value.trim() ? (r.length ? r.map(a => h('div', { class: 'ligne' }, h('span', { class: 'g' }, h('strong', {}, a.des), h('br'), h('small', {}, a.code)), h('span', { class: 'prix' }, eur(a.pu)))) : [h('p', { class: 'vide' }, 'Aucun article trouvé.')]) : []));
  });
  montrer('Catalogue',
    h('p', { class: 'mut' }, CAT.length + ' article(s). Pas de gestion de stock. Pas de prix d’achat ni de marge sur ce téléphone.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => importUI('articles', zone) }, 'Importer un export EBP (Excel / CSV)')),
    zone, q, res,
    rapport ? [h('h2', {}, 'Dernier import · ' + new Date(rapport.date).toLocaleString('fr-FR')), rapportNode(rapport.fichier, rapport.rep)] : null);
}
function importUI(kind, zone) {
  const titre = kind === 'articles' ? 'catalogue' : 'clients';
  const file = h('input', { type: 'file', accept: '.xlsx,.xlsm,.csv,.txt', 'aria-label': 'Choisir le fichier', id: 'fichier-import' });
  zone.replaceChildren(h('div', { class: 'carte' }, h('label', { for: 'fichier-import' }, 'Fichier à importer'), file));
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try {
      const f = file.files[0], feuilles = await lireFichier(f);
      const bloc = h('div');
      zone.replaceChildren(h('div', { class: 'carte' }, h('strong', {}, f.name), bloc));
      const choixFeuille = h('select', { 'aria-label': 'Onglet' }, feuilles.map((fe, i) => h('option', { value: i }, fe.nom)));
      const iEbp = feuilles.findIndex(fe => /ebp/i.test(fe.nom)); if (iEbp >= 0) choixFeuille.value = iEbp;
      const dessiner = () => {
        const fe = feuilles[Number(choixFeuille.value)], debut = ligneEntete(fe.rows), ent = (fe.rows[debut] || []).map(clean);
        const map = devinerColonnes(kind, ent), sels = {};
        const champs = CHAMPS[kind].map(([cle, lib, obl]) => {
          sels[cle] = h('select', { 'aria-label': lib }, !obl ? h('option', { value: '' }, '— aucune —') : null, ent.map((e, i) => e ? h('option', { value: i }, e) : null));
          if (map[cle] != null) sels[cle].value = map[cle];
          return h('div', {}, h('label', {}, lib + (obl ? ' *' : '')), sels[cle]);
        });
        const nb = fe.rows.slice(debut + 1).filter(r => (r || []).some(c => clean(c) !== '')).length;
        bloc.replaceChildren(...[feuilles.length > 1 ? [h('label', {}, 'Onglet'), choixFeuille] : null, champs,
          h('p', { class: 'mut' }, nb + ' ligne(s) à lire. Vérifie les colonnes ci-dessus.'),
          h('button', { class: 'btn', style: 'width:100%', onclick: async () => {
            const m = {}; for (const [cle, , obl] of CHAMPS[kind]) { const v = sels[cle].value; if (v === '' && obl) { toast('Choisis la colonne « ' + cle + ' ».', true); return; } m[cle] = v === '' ? null : Number(v); }
            const t = new Set(Object.values(m).filter(v => v != null)); if (t.size < Object.values(m).filter(v => v != null).length) { toast('Deux champs utilisent la même colonne.', true); return; }
            await lancer(kind, fe.rows, debut, m, f.name);
          } }, 'Importer')].flat(Infinity).filter(Boolean));
      };
      choixFeuille.addEventListener('change', dessiner); dessiner();
    } catch (e) { zone.replaceChildren(h('div', { class: 'carte erreur', role: 'alert' }, 'Import impossible : ' + e.message)); }
  });
}
async function lancer(kind, rows, debut, map, nomFichier) {
  let r;
  if (kind === 'articles') {
    r = importerArticles(rows, debut, map, new Set(CAT.map(a => a.code)));
    if (r.rep.crees + r.rep.maj === 0 && r.rep.lues > 0) { /* on affiche le rapport sans rien écrire */ }
    else await putMany('articles', r.items);
    await put('meta', { date: new Date().toISOString(), fichier: nomFichier, rep: r.rep }, 'rapport_articles');
    await chargerBase();
    toast(r.rep.crees + r.rep.maj + ' article(s) importé(s), ' + r.rep.ignorees + ' refusé(s).', r.rep.erreurs.length > 0 && !(r.rep.crees + r.rep.maj));
    await pageCatalogue();
  } else {
    const ex = new Map((await getAll('clients')).map(c => [norm(c.nom), c]));
    r = importerClients(rows, debut, map, ex);
    await putMany('clients', r.items);
    await pageClients();
    app.prepend(rapportNode('Import clients : ' + nomFichier, r.rep));
  }
}

// ---------- devis ----------
const tel2wa = t => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0') && d.length === 10) d = (S.indicatif || '262') + d.slice(1); return d; };
const csvSur = v => { v = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };
function texteDevis(d) {
  const t = totaux(d);
  return 'Devis ' + numero(d) + ' - ' + d.clientNom + '\n' + d.lignes.map(l => qtxt(l.q) + ' x ' + l.des + (l.r ? ' (-' + pct(l.r) + ' %)' : '') + ' : ' + eur(ligneTotal(l)) + ' HT').join('\n') +
    '\nTotal HT : ' + eur(t.ht) + ' / TVA ' + pct(S.tva100) + ' % : ' + eur(t.tva) + ' / TTC : ' + eur(t.ttc);
}
function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = h('a', { href: url, download: nom }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function csvDevis(d) {
  const L = [['Code article', 'Désignation', 'Quantité', 'PU HT', 'Remise %', 'Total HT']];
  d.lignes.forEach(l => L.push([csvSur(l.code), csvSur(l.des), num2(l.q), num2(l.pu), num2(l.r), num2(ligneTotal(l))]));
  return '﻿' + L.map(r => r.map(c => /[;"\n]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(';')).join('\r\n') + '\r\n';
}
// Envoi au responsable : un fichier JSON (aucun serveur). Chaque devis a un identifiant unique : pas de doublon à l'import.
async function envoyerDevis(liste, nomFichier) {
  for (const d of liste) if (!d.uid) { d.uid = nouvelUid(); await put('devis', d); }
  const clients = new Map((await getAll('clients')).map(c => [c.id, c]));
  const o = { appli: 'devis-terrain', type: 'envoi-devis', version: 1, vendeur: S.vendeur || '', date: new Date().toISOString(),
    devis: liste.map(d => ({ uid: d.uid, date: d.creeLe, t1: d.t1 || null, t2: d.t2 || null, statut: d.statut, notes: d.notes || '', client: { nom: d.clientNom, tel: (clients.get(d.clientId) || {}).tel || '' },
      lignes: d.lignes.map(l => ({ code: l.code, des: l.des, q: l.q, pu: l.pu, r: l.r })) })) };
  const contenu = JSON.stringify(o);
  const f = new File([contenu], nomFichier, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: 'Devis ' + (S.vendeur || '') }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  telecharger(nomFichier, contenu, 'application/json'); toast('Fichier téléchargé : envoie-le à ton responsable.');
}
async function dupliquer(d) {
  const par = new Map(CAT.map(a => [a.code, a]));
  const n = { uid: nouvelUid(), clientId: d.clientId, clientNom: d.clientNom, creeLe: new Date().toISOString(), statut: 'brouillon', notes: '',
    lignes: d.lignes.map(l => ({ ...l, pu: par.has(l.code) ? par.get(l.code).pu : l.pu })) }; // prix du jour si l'article existe encore
  const id = await rq(st('devis', 'readwrite').add(n));
  location.hash = '#/devis/' + id;
}
async function pageDevis(id) {
  const d = await get('devis', id);
  if (!d) return nonTrouve();
  const verrou = d.statut !== 'brouillon';
  const client = d.clientId ? await get('clients', d.clientId) : null;
  const sauver = () => put('devis', d);
  const fini = () => { if (!d.t2 && d.lignes.length) { d.t2 = new Date().toISOString(); sauver(); } }; // chronomètre : 1re sortie du devis
  const boite = h('div'), totBox = h('div'), resBox = h('div'), feuille = h('div', { class: 'feuille' });
  const dessiner = () => {
    boite.replaceChildren(...(d.lignes.length ? d.lignes.map((l, i) => {
      if (verrou) return h('div', { class: 'ligne' }, h('span', { class: 'g' }, h('strong', {}, l.des), h('br'), h('small', {}, l.code + ' · ' + eur(l.pu) + ' HT · ' + qtxt(l.q) + (l.r ? ' · -' + pct(l.r) + ' %' : ''))), h('span', { class: 'prix' }, eur(ligneTotal(l))));
      const q = h('input', { class: 'qte', value: qtxt(l.q).replace(/\s/g, ''), inputmode: 'decimal', 'aria-label': 'Quantité de ' + l.des }),
        r = h('input', { class: 'qte', value: l.r ? pct(l.r) : '', placeholder: '0', inputmode: 'decimal', 'aria-label': 'Remise % de ' + l.des });
      const maj = async () => {
        const nq = parseQte(q.value), nr = parseRemise(r.value);
        if (nq == null) toast('Quantité invalide (entre 0,01 et 999 999,99).', true); else l.q = nq;
        if (nr == null) toast('Remise invalide (0 à ' + pct(S.remiseMax100) + ' %).', true); else l.r = nr;
        await sauver(); dessiner(); totaliser();
      };
      q.addEventListener('change', maj); r.addEventListener('change', maj);
      return h('div', { class: 'ligne' }, h('span', { class: 'g' }, h('strong', {}, l.des), h('br'), h('small', {}, l.code + ' · ' + eur(l.pu) + ' HT'),
        h('div', { class: 'rapide', style: 'margin-top:6px' }, h('label', { style: 'margin:0' }, 'Qté'), q, h('label', { style: 'margin:0' }, 'Remise %'), r)),
        h('span', { class: 'rapide' }, h('span', { class: 'prix' }, eur(ligneTotal(l))), h('button', { class: 'btn danger', 'aria-label': 'Supprimer la ligne', onclick: async () => { d.lignes.splice(i, 1); await sauver(); dessiner(); totaliser(); } }, '🗑')));
    }) : [h('p', { class: 'vide' }, 'Aucune ligne. Cherche un article ci-dessus.')]));
  };
  const totaliser = () => {
    actBox.replaceChildren(faireActions());
    const t = totaux(d);
    totBox.replaceChildren(h('div', { class: 'carte tot' }, h('p', {}, 'Total HT', h('strong', {}, eur(t.ht))), h('p', { class: 'mut' }, 'TVA ' + pct(S.tva100) + ' % (réglage)', h('span', {}, eur(t.tva))), h('p', {}, 'Total TTC', h('strong', {}, eur(t.ttc)))));
    feuille.replaceChildren(h('h1', {}, S.societe + ' — Devis ' + numero(d)), h('p', {}, 'Client : ' + d.clientNom + ' · ' + dateFr(d.creeLe)),
      h('table', {}, h('thead', {}, h('tr', {}, ['Référence', 'Désignation'].map(x => h('th', {}, x)), ['Qté', 'Remise', 'P.U. HT', 'Montant HT'].map(x => h('th', { class: 'n' }, x)))),
        h('tbody', {}, d.lignes.map(l => h('tr', {}, h('td', {}, l.code), h('td', {}, l.des), h('td', { class: 'n' }, qtxt(l.q)), h('td', { class: 'n' }, l.r ? pct(l.r) + ' %' : ''), h('td', { class: 'n' }, num2(l.pu)), h('td', { class: 'n' }, num2(ligneTotal(l))))))),
      h('p', {}, 'Total HT : ' + eur(t.ht) + ' — TVA ' + pct(S.tva100) + ' % : ' + eur(t.tva) + ' — Total TTC : ' + eur(t.ttc)),
      h('p', {}, h('small', {}, 'Devis indicatif établi hors EBP : il ne remplace pas le devis EBP. Prix HT.')));
  };
  const ajouter = async (a, qs) => {
    const q = parseQte(qs);
    if (q == null) { toast('Quantité invalide (entre 0,01 et 999 999,99).', true); return; }
    const ex = d.lignes.find(l => l.code === a.code && l.r === 0);
    if (ex) { if (ex.q + q > QTE_MAX) { toast('Quantité trop grande.', true); return; } ex.q += q; } else d.lignes.push({ code: a.code, des: a.des, q, pu: a.pu, r: 0 });
    if (!d.t1) d.t1 = new Date().toISOString();
    await sauver(); dessiner(); totaliser(); toast('Ajouté : ' + a.des);
  };
  const ligneRes = a => {
    const qi = h('input', { class: 'qte', value: '1', inputmode: 'decimal', 'aria-label': 'Quantité' });
    return h('div', { class: 'ligne' }, h('span', { class: 'g' }, h('strong', {}, a.des), h('br'), h('small', {}, a.code + ' · ' + eur(a.pu) + ' HT')),
      h('span', { class: 'rapide' }, qi, h('button', { class: 'btn', onclick: () => ajouter(a, qi.value) }, 'Ajouter')));
  };
  // « Habituels » du client : articles les plus présents dans ses autres devis
  let habituels = [];
  if (!verrou) {
    const cnt = new Map();
    (await getAll('devis')).filter(x => x.clientId === d.clientId && x.id !== d.id).forEach(x => x.lignes.forEach(l => cnt.set(l.code, (cnt.get(l.code) || 0) + 1)));
    const par = new Map(CAT.map(a => [a.code, a]));
    habituels = [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => par.get(c)).filter(Boolean).slice(0, 8);
  }
  const rech = h('input', { type: 'search', placeholder: 'Ajouter un article : code ou désignation…', 'aria-label': 'Chercher un article', autocomplete: 'off', enterkeyhint: 'search' });
  let tm;
  const lancerRech = () => {
    const r = chercher(rech.value);
    resBox.replaceChildren(...(rech.value.trim() ? (r.length ? r.map(ligneRes) : [h('p', { class: 'vide' }, CAT.length ? 'Aucun article trouvé.' : 'Catalogue vide : importe-le d’abord.')]) :
      (habituels.length ? [h('h2', {}, 'Habituels de ce client'), ...habituels.map(ligneRes)] : [])));
  };
  rech.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(lancerRech, 120); });
  const dictee = h('div');
  const ouvrirDictee = () => {
    const ta = h('textarea', { rows: 4, placeholder: 'Ex : 18 ROB62694 remise 55, 144 masking tape 18mm\nTouche le micro de ton clavier pour dicter.', 'aria-label': 'Liste à dicter ou coller' });
    const aper = h('div');
    const analyser = () => {
      const L = analyserTexte(ta.value);
      if (!L.length) { toast('Écris ou dicte au moins une ligne.', true); return; }
      const sels = L.map(x => {
        const sel = h('select', { 'aria-label': 'Article pour : ' + x.brut }, h('option', { value: '' }, x.cands.length ? '— ne pas ajouter —' : '— aucun article trouvé —'), x.cands.map(a => h('option', { value: a.code }, a.code + ' · ' + a.des.slice(0, 40) + ' · ' + eur(a.pu))));
        if (x.cands.length) sel.value = x.cands[0].code;
        return sel;
      });
      const qi = L.map(x => h('input', { class: 'qte', value: x.q, inputmode: 'decimal', 'aria-label': 'Quantité' })), ri = L.map(x => h('input', { class: 'qte', value: x.r === '0' ? '' : x.r, placeholder: '0', inputmode: 'decimal', 'aria-label': 'Remise %' }));
      aper.replaceChildren(...[h('h2', {}, 'Vérifie puis ajoute'), L.map((x, i) => h('div', { class: 'carte' }, h('small', {}, '« ' + x.brut + ' »'), sels[i],
        h('div', { class: 'rapide', style: 'margin-top:6px' }, h('label', { style: 'margin:0' }, 'Qté'), qi[i], h('label', { style: 'margin:0' }, 'Remise %'), ri[i]))),
        h('button', { class: 'btn', style: 'width:100%', onclick: async () => {
          let n = 0;
          for (let i = 0; i < L.length; i++) {
            const code = sels[i].value; if (!code) continue;
            const a = CAT.find(c => c.code === code), q = parseQte(qi[i].value), r = parseRemise(ri[i].value);
            if (!a || q == null || r == null) { toast('Ligne ' + (i + 1) + ' : quantité ou remise invalide.', true); return; }
          }
          for (let i = 0; i < L.length; i++) {
            const code = sels[i].value; if (!code) continue;
            const a = CAT.find(c => c.code === code), q = parseQte(qi[i].value), r = parseRemise(ri[i].value);
            const ex = d.lignes.find(l => l.code === a.code && l.r === r);
            if (ex) { if (ex.q + q > QTE_MAX) { toast('Quantité trop grande.', true); return; } ex.q += q; } else d.lignes.push({ code: a.code, des: a.des, q, pu: a.pu, r });
            n++;
          }
          if (n && !d.t1) d.t1 = new Date().toISOString();
          await sauver(); dessiner(); totaliser(); dictee.replaceChildren(); toast(n + ' ligne(s) ajoutée(s).');
        } }, 'Ajouter les lignes')].flat(Infinity));
    };
    dictee.replaceChildren(h('div', { class: 'carte' }, ta, h('div', { style: 'height:8px' }), h('button', { class: 'btn', style: 'width:100%', onclick: analyser }, 'Analyser'), aper));
    setTimeout(() => ta.focus(), 50);
  };
  const notes = h('textarea', { rows: 2, 'aria-label': 'Notes', placeholder: 'Notes (facultatif)', value: d.notes || '', disabled: false });
  notes.addEventListener('change', () => { d.notes = notes.value.slice(0, 2000); sauver(); });
  const tel = tel2wa(client && client.tel);
  const actBox = h('div');
  const faireActions = () => h('div', { class: 'actions' },
    d.lignes.length ? [
      h('button', { class: 'btn', onclick: () => { fini(); window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(texteDevis(d)), '_blank', 'noopener'); } }, 'WhatsApp'),
      navigator.share ? h('button', { class: 'btn sec', onclick: () => { fini(); navigator.share({ title: 'Devis ' + numero(d), text: texteDevis(d) }).catch(() => {}); } }, 'Partager…') : null,
      h('button', { class: 'btn sec', onclick: () => { fini(); window.print(); } }, 'PDF / Imprimer'),
      h('button', { class: 'btn sec', onclick: () => { fini(); telecharger(numero(d) + '.csv', csvDevis(d), 'text/csv;charset=utf-8'); } }, 'CSV pour EBP'),
      h('button', { class: 'btn', onclick: () => { fini(); envoyerDevis([d], 'devis-' + numero(d) + '.json'); } }, 'Envoyer à mon responsable')] : null,
    h('button', { class: 'btn sec', onclick: () => dupliquer(d) }, 'Dupliquer (prix du jour)'),
    h('button', { class: 'btn ' + (verrou ? 'sec' : ''), onclick: async () => { if (!verrou) fini(); d.statut = verrou ? 'brouillon' : 'envoye'; await sauver(); pageDevis(id); } }, verrou ? 'Rouvrir pour modifier' : 'Marquer comme envoyé'),
    h('button', { class: 'btn danger', onclick: async () => { if (confirm('Supprimer ce devis ?')) { await del('devis', id); location.hash = '#/'; } } }, 'Supprimer'));
  montrer(numero(d),
    h('div', { class: 'ecran' },
      h('div', { class: 'carte' }, h('strong', {}, d.clientNom), h('br'), h('small', {}, dateFr(d.creeLe) + ' · '), h('span', { class: 'tag ' + (verrou ? 'ok' : 'warn') }, verrou ? 'Envoyé' : 'Brouillon')),
      verrou ? null : [rech, h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: ouvrirDictee }, '🎤 Dicter / coller une liste')), dictee, resBox],
      h('h2', {}, 'Lignes'), boite, totBox, notes, actBox),
    feuille);
  dessiner(); totaliser(); lancerRech();
  if (!verrou && !d.lignes.length) setTimeout(() => rech.focus(), 50);
}

// ---------- réglages ----------
async function pageReglages() {
  const tva = h('input', { value: pct(S.tva100), inputmode: 'decimal', 'aria-label': 'TVA %' }),
    rem = h('input', { value: pct(S.remiseMax100), inputmode: 'decimal', 'aria-label': 'Remise maximale %' }),
    ind = h('input', { value: S.indicatif, inputmode: 'numeric', 'aria-label': 'Indicatif' }),
    soc = h('input', { value: S.societe, 'aria-label': 'Nom sur le devis' }),
    ven = h('input', { value: S.vendeur, 'aria-label': 'Ton nom', autocomplete: 'name' });
  const stock = h('p', { class: 'mut' }, 'Stockage : vérification…');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => { stock.textContent = p ? 'Stockage protégé : le navigateur ne l’effacera pas tout seul.' : 'Stockage non protégé : fais une sauvegarde régulièrement.'; });
  const fich = h('input', { type: 'file', accept: '.json', 'aria-label': 'Fichier de sauvegarde' });
  montrer('Réglages',
    h('div', { class: 'carte alerte' }, 'Valeurs par défaut non confirmées : TVA 8,5 % et remise maximale 60 % sont des hypothèses. Vérifie-les avant usage réel.'),
    h('label', {}, 'TVA (%)'), tva, h('label', {}, 'Remise maximale (%)'), rem, h('label', {}, 'Indicatif WhatsApp (262 = La Réunion, 33 = France)'), ind, h('label', {}, 'Nom sur le devis'), soc, h('label', {}, 'Ton nom (joint aux devis envoyés)'), ven,
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
      let a, b;
      try { a = parseCents(tva.value); b = parseCents(rem.value); } catch (e) { a = b = null; }
      if (a == null || a < 0 || a > 10000 || b == null || b < 0 || b > 10000) { toast('TVA et remise doivent être entre 0 et 100.', true); return; }
      S = { ...S, tva100: a, remiseMax100: b, indicatif: clean(ind.value).replace(/\D/g, '') || '262', societe: clean(soc.value).slice(0, 60) || 'Odicolor', vendeur: clean(ven.value).slice(0, 60) };
      await put('meta', S, 'settings'); toast('Réglages enregistrés.');
    } }, 'Enregistrer')),
    h('h2', {}, 'Sauvegarde'),
    h('p', { class: 'mut' }, 'Tes devis et clients ne sont QUE sur ce téléphone. Si tu perds le téléphone ou effaces les données du navigateur, ils sont perdus. Sauvegarde régulièrement, puis envoie le fichier où tu veux.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
      const o = { appli: 'devis-terrain', version: 1, date: new Date().toISOString(), reglages: S, clients: await getAll('clients'), devis: await getAll('devis') };
      telecharger('sauvegarde-devis-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(o), 'application/json'); toast('Sauvegarde téléchargée.');
    } }, 'Télécharger une sauvegarde')),
    h('label', {}, 'Restaurer une sauvegarde (remplace clients et devis actuels)'), fich,
    h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: async () => {
      try {
        const f = fich.files[0]; if (!f) { toast('Choisis un fichier de sauvegarde.', true); return; }
        const o = JSON.parse(await f.text());
        if (o.appli !== 'devis-terrain' || !Array.isArray(o.clients) || !Array.isArray(o.devis)) throw new Error('Ce fichier n’est pas une sauvegarde de cette appli.');
        if (!confirm('Remplacer tes ' + (await getAll('devis')).length + ' devis actuels par les ' + o.devis.length + ' de la sauvegarde ?')) return;
        await rq(st('clients', 'readwrite').clear()); await rq(st('devis', 'readwrite').clear());
        await putMany('clients', o.clients); await putMany('devis', o.devis);
        if (o.reglages) { S = { ...SET_DEF, ...o.reglages }; await put('meta', S, 'settings'); }
        toast('Sauvegarde restaurée.'); pageReglages();
      } catch (e) { toast('Restauration impossible : ' + e.message, true); }
    } }, 'Restaurer')),
    stock,
    h('h2', {}, 'Données'),
    h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: async () => {
      if (!confirm('Tout effacer sur ce téléphone (catalogue, clients, devis) ? Irréversible.')) return;
      for (const n of ['articles', 'clients', 'devis', 'meta']) await rq(st(n, 'readwrite').clear());
      await chargerBase(); toast('Tout est effacé.'); location.hash = '#/';
    } }, 'Tout effacer')),
    h('p', { class: 'mut' }, 'Version ' + VERSION + ' · Fonctionne sans réseau · Aucune donnée n’est envoyée.'));
}

// ---------- démarrage ----------
(async () => {
  const etat = $('#etat');
  const maj = () => { etat.textContent = navigator.onLine ? '' : 'Hors ligne'; };
  addEventListener('online', maj); addEventListener('offline', maj); maj();
  try {
    await openDB(); await chargerBase();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    addEventListener('hashchange', route); await route();
  } catch (e) {
    montrer('Erreur', h('div', { class: 'carte erreur', role: 'alert' }, 'Le stockage du navigateur est indisponible (mode privé ?). ' + e.message));
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
window.__t = { analyserTexte, statsDevis, envoyerDevis, parseCents, parseQte, ligneTotal, totaux, importerArticles, importerClients, csvDevis, devinerColonnes, ligneEntete, tel2wa };
