'use strict';
/* Devis terrain : tout reste sur le téléphone (IndexedDB). Seule exception : le bouton « Fiche officielle » d'un client envoie son NOM au registre public (recherche-entreprises.api.gouv.fr), à la demande. */
const VERSION = 'v21';

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
const DB = { db: null, maintenance: false };
// Une session ouverte partage ce verrou ; une restauration attend son exclusivité.
// Un onglet rendu obsolète ferme sa connexion et doit être rechargé avant écriture.
const VERROU_STOCKAGE = 'odicolor-portefeuille-local';
let libererSessionStockage = null;
const canalStockage = typeof BroadcastChannel === 'function' ? new BroadcastChannel(VERROU_STOCKAGE) : null;
if (canalStockage) canalStockage.onmessage = event => {
  if (event.data !== 'restauration' || !DB.db) return;
  DB.maintenance = true; DB.db.close();
  if (libererSessionStockage) { libererSessionStockage(); libererSessionStockage=null; }
  toast('Une restauration est en cours dans un autre onglet. Recharge cet onglet avant de travailler.', true);
};
function tenirSessionStockage() {
  if (!navigator.locks) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    navigator.locks.request(VERROU_STOCKAGE,{mode:'shared'},()=>new Promise(release=>{
      libererSessionStockage=release;resolve();
    })).catch(reject);
  });
}
async function avecRestaurationExclusive(action) {
  if (!navigator.locks) throw new Error('Restauration indisponible : utilise une version récente de Chrome sur une adresse HTTPS. La sauvegarde reste accessible.');
  if (libererSessionStockage) { libererSessionStockage(); libererSessionStockage=null; }
  if (canalStockage) canalStockage.postMessage('restauration');
  toast('Restauration : les autres onglets doivent fermer leur accès aux données.');
  try { return await navigator.locks.request(VERROU_STOCKAGE,{mode:'exclusive'},action); }
  finally { await tenirSessionStockage(); }
}
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const st = (n, m = 'readonly') => {
  if (m === 'readwrite' && DB.maintenance) throw new Error('Restauration en cours : écriture suspendue.');
  return DB.db.transaction(n, m).objectStore(n);
};
const getAll = n => rq(st(n).getAll());
const get = (n, k) => rq(st(n).get(k));
const put = (n, v, k) => rq(st(n, 'readwrite').put(v, k));
const del = (n, k) => rq(st(n, 'readwrite').delete(k));
function putMany(n, items) {
  return new Promise((res, rej) => {
    if (DB.maintenance) { rej(new Error('Restauration en cours : écriture suspendue.')); return; }
    const t = DB.db.transaction(n, 'readwrite'), s = t.objectStore(n);
    items.forEach(i => s.put(i));
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
async function openDB() {
  await tenirSessionStockage();
  return new Promise((res, rej) => {
    const r = indexedDB.open('devis-terrain', 2);
    r.onupgradeneeded = () => {
      ODICOLOR_BACKUP.schema(r.result);
    };
    r.onsuccess = () => {
      DB.db = r.result;
      DB.db.onversionchange = () => { DB.db.close(); DB.maintenance=true; toast('Ferme puis rouvre l’application pour terminer la mise à jour.', true); };
      res();
    };
    r.onblocked = () => toast('Ferme les autres onglets ODICOLOR puis réessaie : ils bloquent l’ouverture du stockage.', true);
    r.onerror = () => rej(r.error);
  });
}

const SET_DEF = { tva100: 850, remiseMax100: 6000, indicatif: '33', societe: 'Odicolor', vendeur: '', objDepart: '', objectifs: [0, 0, 0], respNom: 'Mohamed', respTel: '', relanceJours: 3, delaiUrgentH: 4, delaiNormalH: 48, depart: {} };
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
// Exports EBP (pièces ligne par ligne d'article) : bien plus gros qu'un tarif ; lus en mémoire sur le téléphone, d'où une borne explicite.
const LIMITES_EBP = { octets: 40 * 1024 * 1024, lignes: 300000 };
function chargerXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => { const s = h('script', { src: window.ODICOLOR_PWA.asset('xlsx.mini.min.js'), integrity:window.ODICOLOR_PWA.integrity('xlsx.mini.min.js'), crossorigin:'anonymous' }); s.onload = res; s.onerror = () => rej(new Error('Lecteur Excel introuvable')); document.head.append(s); });
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
async function lireFichier(file, limites = {}) {
  const maxOctets = limites.octets || MAX_OCTETS, maxLignes = limites.lignes || MAX_LIGNES;
  if (file.size > maxOctets) throw new Error('Fichier trop gros (' + Math.round(maxOctets / 1048576) + ' Mo maximum). Exporte une période plus courte.');
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
  feuilles.forEach(f => { if (f.rows.length > maxLignes + 1) throw new Error('Plus de ' + maxLignes + ' lignes : exporte une période plus courte.'); });
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
    ['ville', 'Ville (facultatif)', false, [/^(ville|city|commune|localite)$/, /ville|commune|localite/]],
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
// Rapprochement commun à la création terrain et aux imports EBP : ne jamais
// fusionner deux établissements d'une même enseigne situés dans des villes différentes.
function numeroGarage(v) {
  let n=String(v||'').replace(/\D/g,'');
  if(n.startsWith('0033')&&n.length===13)n='0'+n.slice(4);
  else if(n.startsWith('33')&&n.length===11)n='0'+n.slice(2);
  return n;
}
function doublonsGarages(clients,nom,tel='',ville='') {
  const name=normNom(nom), city=normNom(ville), phone=numeroGarage(tel);
  if(!name)return [];
  return (Array.isArray(clients)?clients:[]).filter(c=>{
    const previousCity=normNom(c.villeProspection||c.ville||'');
    if(city&&previousCity&&city!==previousCity)return false;
    const sameName=normNom(c.nom)===name;
    const samePhone=phone.length>=9&&numeroGarage(c.tel)===phone;
    return sameName||samePhone;
  });
}
function importerClients(rows, debut, map, existants) {
  const rep=nouveauRapport(),out=[],vus=[];
  const base=existants instanceof Map?Array.from(existants.values()):
    Array.isArray(existants)?existants:[];
  for(let i=debut+1;i<rows.length;i++){
    const r=rows[i]||[];
    if(r.every(c=>clean(c)===''))continue;
    rep.lues++;
    const nom=clean(r[map.nom]).replace(/\s+/g,' ');
    if(!nom){rep.ignorees++;err(rep,i+1,'ligne sans nom');continue;}
    const tel=map.tel!=null?clean(r[map.tel]).slice(0,30):'';
    const ville=map.ville!=null?clean(r[map.ville]).slice(0,70):'';
    const ligne='ligne '+(i+1)+' : « '+nom+' »';
    if(doublonsGarages(vus,nom,tel,ville).length){
      rep.ignorees++;rep.avertissements.push(ligne+' présent plusieurs fois dans le fichier : doublon ignoré.');continue;
    }
    const correspondances=doublonsGarages(base,nom,tel,ville);
    if(correspondances.length>1){
      rep.ignorees++;rep.avertissements.push(ligne+' : plusieurs fiches possibles. Aucune fusion : vérifier manuellement la ville et le téléphone.');continue;
    }
    if(correspondances.length===1){
      const ex=correspondances[0];
      if(normNom(ex.nom)!==normNom(nom)){
        rep.ignorees++;rep.avertissements.push(ligne+' : téléphone déjà associé à « '+ex.nom+' ». Rapprochement manuel nécessaire.');continue;
      }
      const ancienTel=numeroGarage(ex.tel),nouveauTel=numeroGarage(tel);
      // Un homonyme sans preuve d'identité ne doit jamais écraser sa fiche.
      // On exige le téléphone identique OU le nom + la même ville connue.
      const memeTelephone=ancienTel.length>=9&&nouveauTel.length>=9&&ancienTel===nouveauTel;
      const memeVille=Boolean(ville&&normNom(ex.villeProspection||ex.ville)===normNom(ville));
      if(!memeTelephone&&!memeVille){
        rep.ignorees++;rep.avertissements.push(ligne+
          ' : rapprochement impossible sans téléphone identique ou ville connue. Aucune fiche modifiée ; vérification manuelle.');
        continue;
      }
      const telDivergent=ancienTel.length>=9&&nouveauTel.length>=9&&ancienTel!==nouveauTel;
      if(telDivergent&&!(ville&&normNom(ex.villeProspection||ex.ville)===normNom(ville))){
        rep.ignorees++;rep.avertissements.push(ligne+' : même nom, téléphone différent et ville non confirmée. Fiche existante conservée.');continue;
      }
      if(telDivergent)rep.avertissements.push(ligne+' : téléphone différent ; numéro existant conservé pour vérification.');
      const maj={...ex,tel:ex.tel||tel,villeProspection:ex.villeProspection||ville};
      out.push(maj);rep.maj++;vus.push({nom,tel,villeProspection:ville});
    }else{
      out.push({nom:nom.slice(0,120),tel,villeProspection:ville});
      rep.crees++;vus.push({nom,tel,villeProspection:ville});
    }
  }
  return {rep,items:out};
}

// ---------- routage ----------
const app = $('#app');
function montrer(titre, ...nodes) { $('#titre').textContent = titre; { const t2 = $('#titre2'); if (t2) t2.textContent = titre; } { const sv = $('#sous'); if (sv) sv.textContent = ''; } app.replaceChildren(...nodes.flat(Infinity).filter(Boolean)); window.scrollTo(0, 0); apparition(); }
const calmes = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let obsApparition = null;
function apparition() {
  if (calmes() || !('IntersectionObserver' in window)) return;
  obsApparition = obsApparition || new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vu'); obsApparition.unobserve(e.target); } }), { rootMargin: '0px 0px -20px 0px' });
  app.querySelectorAll(':scope > .carte, :scope > .kpis, :scope > h2, :scope > .actions').forEach((el, i) => { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('apparait'); obsApparition.observe(el); } });
}
addEventListener('scroll', () => { const on = scrollY > 110; document.body.classList.toggle('defile', on); }, { passive: true });
function nonTrouve() { montrer('Introuvable', h('p', { class: 'vide' }, 'Cette page n’existe pas. '), h('a', { class: 'btn', href: '#/' }, 'Retour')); }
// Origine dédiée au terrain : stockage navigateur distinct de la démonstration.
const HOTE_TERRAIN = 'terrain-odicolor-production.up.railway.app';
const espaceTerrain = () => location.hostname === HOTE_TERRAIN;
async function marquerDemo() { try { document.body.toggleAttribute('data-demo', !!(await get('meta', 'demo'))); document.body.toggleAttribute('data-test-env', /\.up\.railway\.app$/.test(location.hostname) && !espaceTerrain()); } catch (e) { /* sans effet */ } }
async function route() {
  marquerDemo();
  const p = (location.hash || '#/').slice(2).split('?')[0].split('/');
  { const q = p[0] || 'accueil', tab = q === 'accueil' ? 'accueil' : q === 'tournee' ? 'tournee' : (q === 'clients' || q === 'client') ? 'clients' : (q === 'devis' || q === 'nouveau') ? 'devis' : (q === 'catalogue' || q === 'article' || q === 'catalogues-pdf') ? 'catalogue' : 'plus'; document.querySelectorAll('.onglets a').forEach(x => x.classList.toggle('on', x.dataset.p === tab)); }
  try {
    if (p[0] === '' || p[0] === undefined) await pageAccueil();
    else if (p[0] === 'nouveau') await pageChoixClient();
    else if (p[0] === 'devis' && /^\d+$/.test(p[1] || '')) await pageDevis(Number(p[1]));
    else if (p[0] === 'devis') await pageDevisListe(p[1]);
    else if (p[0] === 'feuille') await pageFeuille();
    else if (p[0] === 'tournee') await pageTournee();
    else if (p[0] === 'clients') await pageClients();
    else if (p[0] === 'client' && /^\d+$/.test(p[1] || '')) await pageClient(Number(p[1]));
    else if (p[0] === 'article' && p[1]) await pageArticle(p.slice(1).join('/'));
    else if (p[0] === 'catalogue') await pageCatalogue();
    else if (p[0] === 'reglages') await pageReglages();
    else if (p[0] === 'pc') await pagePC();
    else if (p[0] === 'plus') pagePlus();
    else if (p[0] === 'signaler') await pageSignaler(/^\d+$/.test(p[1] || '') ? Number(p[1]) : null);
    else if (p[0] === 'signalements') await pageSignalements();
    else if (p[0] === 'point') await pagePoint(p[1]);
    else if (p[0] === 'comparateur') await pageComparateur();
    else if (p[0] === 'evolution') await pageEvolution();
    else if (p[0] === 'travail') await pageTravail(p[1]);
    else if (p[0] === 'ca' && p[1] === 'import') await pageCAImport();
    else if (p[0] === 'clients-ebp') await pageClientsEbp();
    else if (p[0] === 'ca') await pageCA();
    else if (p[0] === 'cockpit') await pageCockpit();
    else if (p[0] === 'carte') await pageCarte();
    else if (p[0] === 'autotest') await pageAutotest();
    else if (p[0] === 'demo') await pageDemo();
    else if (p[0] === 'agenda') await pageAgenda(p[1] === 'nouveau' ? Number(p[2]) || null : null);
    else if (p[0] === 'secteurs') await pageSecteurs(p[1]);
    else if (p[0] === 'proposition') await pageProposition();
    else if (p[0] === 'ville') await pageVille(p[1]);
    else if (p[0] === 'visite' && /^\d+$/.test(p[1] || '')) await pageVisite(Number(p[1]));
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
  return { n: dv.length, mesures: mesures.length, exclus: mesures.length - ok.length, med, semaine: dv.filter(d => jourLocal(d.creeLe) >= lundiDe(new Date())).length };
}

// ---------- tableau de bord (accueil) : uniquement des données du téléphone ----------
// ---------- LOT v8 : tableau de bord, élan, essais, signalements, point, comparateur ----------
const cleMois = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
const jourLocal = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const joursDepuis = (iso, now = Date.now()) => Math.floor((now - new Date(iso).getTime()) / JOUR);
const ST_DEVIS = { brouillon: ['Brouillon', 'warn'], envoye: ['Envoyé', 'ok'], accepte: ['Accepté', 'ok'], refuse: ['Refusé', 'ko'] };
const etiquetteDevis = d => ST_DEVIS[d.statut] || ST_DEVIS.brouillon;
const envoiDe = d => d.t2 || d.creeLe;
const relanceDue = (d, now = Date.now()) => {
  if (d.statut !== 'envoye' || !d.lignes.length) return null;
  const j = ecartJours(jourLocal(d.relanceLe || envoiDe(d)), now);
  return j >= (S.relanceJours || 3) ? j : null;
};
const CRITERES = [['', 'À définir'], ['prix', 'Le prix'], ['service', 'Le service'], ['delai', 'Le délai de livraison'], ['teinte', 'La qualité de teinte'], ['credit', 'Les conditions de paiement'], ['relation', 'La confiance, la relation']];
const CONV = [['', 'Pas défini'], ['cible', 'À contacter'], ['contacte', 'Contacté'], ['essai', 'En essai'], ['converti', 'Converti'], ['refus', 'Refus']];
const ESSAI_ST = [['encours', 'En cours'], ['concluant', 'Concluant'], ['non', 'Non concluant'], ['commande', 'Commande passée']];
const SIGNAL_TYPES = [['produit', 'Produit défectueux'], ['teinte', 'Teinte qui ne correspond pas'], ['livraison', 'Livraison (retard, erreur)'], ['objection', 'Objection ou refus du garagiste'], ['prix', 'Prix'], ['demande', 'Demande particulière'], ['concurrent', 'Concurrent']];
const SIGNAL_ST = { nouveau: ['Non envoyé', 'warn'], envoye: ['Envoyé', 'warn'], pris: ['Pris en charge', 'ok'], resolu: ['Résolu', 'ok'] };
const libelle = (liste, v) => ((liste.find(x => x[0] === v) || [])[1]) || '';
const lireSig = async () => { const v = await get('meta', 'signalements'); return Array.isArray(v) ? v : []; };
const ecrireSig = async arr => { arr.forEach((s, i) => { if (i >= 60) delete s.photo; }); await put('meta', arr, 'signalements'); };
const sigEnRetard = (s, now = Date.now()) => s.statut === 'envoye' && s.envoyeLe && (now - new Date(s.envoyeLe).getTime()) / 36e5 >= (s.urgence === 'urgente' ? (S.delaiUrgentH || 4) : (S.delaiNormalH || 48));

// ----- points d'activité (visites, devis, essais) -----
const PTS = { vu: 10, absent: 3, rappeler: 3 }, PTS_DEVIS = 20, PTS_ACCEPTE = 40, PTS_ESSAI = 15, DEFI = 50, PALIER = 200;
function activite(dv, cl) {
  const m = {}, add = (j, p, k) => { (m[j] = m[j] || { pts: 0, vu: 0, devis: 0, effort: 0 }); m[j].pts += p; m[j][k]++; };
  cl.forEach(c => {
    (Array.isArray(c.visites) ? c.visites : []).forEach(v => {
      if (v && typeof v.date === 'string' && /^\d{4}-\d\d-\d\d$/.test(v.date) && Object.prototype.hasOwnProperty.call(PTS, v.res)) add(v.date, PTS[v.res], v.res === 'vu' ? 'vu' : 'effort');
    });
    (Array.isArray(c.essais) ? c.essais : []).forEach(e => { if (e && typeof e.date === 'string' && /^\d{4}-\d\d-\d\d$/.test(e.date)) add(e.date, PTS_ESSAI, 'effort'); });
  });
  dv.filter(d => d.lignes.length && d.statut !== 'brouillon').forEach(d => add(jourLocal(envoiDe(d)), PTS_DEVIS, 'devis'));
  dv.filter(d => d.statut === 'accepte' && d.reponseLe).forEach(d => add(jourLocal(d.reponseLe), PTS_ACCEPTE, 'devis'));
  return m;
}
// Jours ouvrés d'affilée avec au moins une action. Le week-end ne casse pas la série. Aujourd'hui sans action ne la casse pas encore.
function serie(m, now = new Date()) {
  const d = new Date(now); d.setHours(12, 0, 0, 0);
  const actif = j => m[j] && m[j].pts > 0;
  if (!actif(jourLocal(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const a = actif(jourLocal(d));
    if (a) n++;
    else if (estOuvre(d)) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function fete() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { toast('Défi du jour réussi !'); return; }
  const box = h('div', { class: 'confettis', 'aria-hidden': 'true' }), cols = ['#D41F2B', '#1d1d1f', '#e6b24d', '#58c77f', '#ffffff'];
  for (let i = 0; i < 36; i++) box.append(h('i', { style: 'left:' + (Math.random() * 100).toFixed(1) + '%;background:' + cols[i % 5] + ';animation-delay:' + (Math.random() * .6).toFixed(2) + 's;animation-duration:' + (1.6 + Math.random() * 1.2).toFixed(2) + 's' }));
  document.body.append(box); toast('Défi du jour réussi ! 🎉'); setTimeout(() => box.remove(), 3400);
}

// ----- objectifs -----
function objectifDuMois(now = new Date()) {
  const o = Array.isArray(S.objectifs) ? S.objectifs : [];
  if (!/^\d{4}-\d\d$/.test(S.objDepart || '') || !o.some(v => v > 0)) return null;
  const [y, m] = S.objDepart.split('-').map(Number);
  const idx = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (idx < 0) return null;
  const k = Math.min(idx, o.length - 1);
  return o[k] > 0 ? { cents: o[k], rang: k + 1 } : null;
}
const FERIES = {};
function feries(y) { // jours fériés nationaux (métropole) : fixes + Pâques (algorithme de Meeus)
  if (FERIES[y]) return FERIES[y];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mois = Math.floor((hh + l - 7 * m + 114) / 31), jour = ((hh + l - 7 * m + 114) % 31) + 1, paques = new Date(y, mois - 1, jour, 12);
  const plus = n => { const x = new Date(paques); x.setDate(x.getDate() + n); return jourLocal(x); };
  return (FERIES[y] = new Set([y + '-01-01', plus(1), y + '-05-01', y + '-05-08', plus(39), plus(50), y + '-07-14', y + '-08-15', y + '-11-01', y + '-11-11', y + '-12-25']));
}
const estOuvre = d => { const x = new Date(d), w = x.getDay(); return w !== 0 && w !== 6 && !feries(x.getFullYear()).has(jourLocal(x)); };
function joursOuvres(from, to) { let n = 0; const d = new Date(from); d.setHours(12, 0, 0, 0); while (d <= to) { if (estOuvre(d)) n++; d.setDate(d.getDate() + 1); } return n; }
const ecartJours = (jour, now = Date.now()) => Math.round((Date.parse(jourLocal(now) + 'T12:00:00') - Date.parse(jour + 'T12:00:00')) / JOUR);

// ----- les 4 mesures du test réel -----
function mesures(dv, cl, now = new Date()) {
  const mk = cleMois(now);
  const essais = cl.flatMap(c => (Array.isArray(c.essais) ? c.essais : []));
  const repondus = dv.filter(d => (d.statut === 'accepte' || d.statut === 'refuse') && d.reponseLe);
  const delais = repondus.map(d => Math.max(0, (new Date(d.reponseLe) - new Date(envoiDe(d))) / JOUR));
  return {
    essaisMois: essais.filter(e => typeof e.date === 'string' && e.date.slice(0, 7) === mk).length, essaisTotal: essais.length,
    transf: essais.filter(e => e.statut === 'commande').length,
    delaiMoy: delais.length ? delais.reduce((a, b) => a + b, 0) / delais.length : null, nbRep: repondus.length,
    sansRelance: dv.filter(d => d.statut === 'envoye' && d.lignes.length && !d.relanceLe && ecartJours(jourLocal(envoiDe(d))) >= (S.relanceJours || 3)).length
  };
}

// ----- v9 : semaine, appels vers le responsable -----
const lundiDe = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return jourLocal(x); };
const MOTIFS = [['prix', 'Prix'], ['stock', 'Stock'], ['suivi', 'Suivi de commande'], ['teinte', 'Teinte'], ['autre', 'Autre']];
const lireAppels = async () => { const v = await get('meta', 'appels'); return Array.isArray(v) ? v : []; };
const appelsSemaine = (ap, now = new Date()) => { const l = lundiDe(now); return ap.filter(a => a && typeof a.date === 'string' && a.date.slice(0, 10) >= l); };
function semaineObj(dv, now = new Date()) {
  const l = lundiDe(now), lun = new Date(l + 'T12:00:00'), ven = new Date(lun); ven.setDate(ven.getDate() + 4);
  const ouv = Math.max(1, joursOuvres(lun, ven)), fin = new Date(now); fin.setHours(23, 59, 0, 0); const j = Math.max(1, Math.min(ouv, joursOuvres(lun, fin)));
  const veille = new Date(now); veille.setDate(veille.getDate() - 1); veille.setHours(23, 59, 0, 0); const fait = Math.max(0, Math.min(ouv, joursOuvres(lun, veille))); // jours déjà terminés (aujourd'hui ne compte pas)
  const ca = dv.filter(d => d.commandeLe && jourLocal(d.commandeLe) >= l && jourLocal(d.commandeLe) <= jourLocal(now)).reduce((a, d) => a + totaux(d).ht, 0);
  const c = cibleSemaineDe(now);
  return { ca, cible: c.cible, derive: c.derive, j, ouv, fait, attendu: Math.round(c.cible * fait / ouv), l };
}
// ----- ce qu'il y a à faire, par ordre de priorité (l'argent en jeu d'abord) -----
function taches(dv, cl, sigs, now = Date.now(), ext = {}) {
  const T = [];
  { const nd = new Date(now), pd = ((nd.getDay() + 6) % 7); if (pd <= 1 && nd.getDay() !== 0) { const prec = new Date(nd); prec.setDate(prec.getDate() - 7); const k = lundiDe(prec); if (!((ext.point && ext.point.faits) || {})[k]) T.push({ p: 0, o: 0, t: 'Faire le Point de la semaine écoulée', d: 'Lundi matin : 15 minutes, un seul changement à décider', href: '#/point', tag: 'Point' }); } }
  dv.forEach(d => { const j = relanceDue(d, now); if (j != null) T.push({ p: 1, o: j, t: 'Relancer le devis de ' + d.clientNom, titre: d.clientNom, m: totaux(d).ht, d: eur(totaux(d).ht) + ' HT, sans réponse depuis ' + j + ' j', d2: ' · sans réponse depuis ' + j + ' j', b: 'Ouvrir le devis', href: '#/devis/' + d.id, tag: 'Relance' }); });
  cl.forEach(c => (Array.isArray(c.essais) ? c.essais : []).forEach(e => {
    if (!e || e.statut !== 'encours') return;
    const j = ecartJours(e.date, now), sv = Array.isArray(e.suivis) ? e.suivis : [];
    if (j >= 7 && !sv.includes('J7')) T.push({ p: 2, o: j, t: 'Faire le point sur l’essai chez ' + c.nom, d: 'Essai de ' + (e.produit || 'produit') + ' depuis ' + j + ' j (J+7)', href: '#/client/' + c.id, tag: 'Essai' });
    else if (j >= 2 && !sv.includes('J2')) T.push({ p: 2, o: j, t: 'Appeler pour l’essai chez ' + c.nom, d: 'Essai de ' + (e.produit || 'produit') + ' depuis ' + j + ' j (J+2)', href: '#/client/' + c.id, tag: 'Essai' });
  }));
  sigs.forEach(s => {
    if (sigEnRetard(s, now)) T.push({ p: 3, o: 0, t: 'Relancer ' + (S.respNom || 'ton responsable') + ' : ' + libelle(SIGNAL_TYPES, s.type), d: (s.clientNom ? s.clientNom + ' · ' : '') + 'sans prise en charge', href: '#/signalements', tag: 'Signalement' });
    if (s.statut === 'resolu' && !s.clientPrevenu) T.push({ p: 3, o: 0, t: 'Prévenir le client : problème résolu', d: (s.clientNom || 'Client') + ' · ' + libelle(SIGNAL_TYPES, s.type), href: '#/signalements', tag: 'Client' });
  });
  factures(cl).forEach(f => {
    if (f.regleLe) return; const auj = jourLocal(now);
    if (f.promesse && f.promesse === auj) T.push({ p: 1, o: 900, t: 'Promesse de paiement aujourd’hui · ' + f.client.nom, titre: f.client.nom, m: f.montant || 0, d: eur(f.montant || 0) + ' promis aujourd’hui', d2: ' promis aujourd’hui (facture ' + (f.num || '—') + ')', b: 'Ouvrir la fiche', href: '#/client/' + f.client.id, tag: 'Règlement' });
    else if (enRetard(f, now) && !(f.promesse && f.promesse > auj)) { const j = ecartJours(f.echeance, now); T.push({ p: 1, o: 1000 + j, t: 'Relancer le règlement · ' + f.client.nom, titre: f.client.nom, m: f.montant || 0, d: eur(f.montant || 0) + ' en retard de ' + j + ' j', d2: ' en retard de ' + j + ' j (facture ' + (f.num || '—') + ')', b: 'Ouvrir la fiche', href: '#/client/' + f.client.id, tag: 'Règlement' }); }
  });
  cl.forEach(c => { if ((Number(c.reports) || 0) >= 3) T.push({ p: 3, o: Number(c.reports), t: 'Décider pour ' + c.nom, d: 'Reporté ' + c.reports + ' fois : visiter vraiment ou baisser la priorité', href: '#/client/' + c.id, tag: 'Reports' }); });
  cl.forEach(c => { if (c.etape && /^\d{4}-\d\d-\d\d$/.test(c.etapeDate || '') && c.etapeDate <= jourLocal(now)) T.push({ p: 2, o: Math.floor((now - Date.parse(c.etapeDate + 'T12:00:00')) / JOUR), t: c.etape + ' · ' + c.nom, d: 'Prévu le ' + dateFr(c.etapeDate), href: '#/client/' + c.id, tag: 'Étape' }); });
  cl.map(c => ({ c, e: echeance(c, now) })).filter(x => x.e && x.e.du).sort((a, b) => (b.e.rappel - a.e.rappel) || (b.e.pct - a.e.pct)).forEach(({ c, e }) =>
    T.push({ p: 4, o: e.pct, t: 'Visiter ' + c.nom, d: e.rappel ? 'Tu avais prévu de le rappeler.' : e.jours == null ? 'Jamais visité : premier contact.' : 'Dernière visite il y a ' + e.jours + ' j (rythme ' + e.r + ' j)', href: '#/client/' + c.id, tag: 'Visite' }));
  dv.filter(d => d.statut === 'brouillon' && d.lignes.length).forEach(d => T.push({ p: 5, o: 0, t: 'Finir le devis de ' + d.clientNom, d: eur(totaux(d).ht) + ' HT en attente d’envoi', href: '#/devis/' + d.id, tag: 'Brouillon' }));
  return T.sort((a, b) => a.p - b.p || b.o - a.o);
}

// ----- v20 : ma prochaine action = le prochain garage de la tournée du jour -----
function pourquoiVisite(c, dv, cl, now) {
  const R = [], j = jourLocal(now), F = factures(cl).filter(f => f.client.id === c.id && !f.regleLe);
  F.forEach(f => { if (f.promesse && f.promesse === j) R.push('Promesse de paiement aujourd’hui : ' + eur(f.montant || 0)); else if (enRetard(f, now)) R.push('Facture de ' + eur(f.montant || 0) + ' en retard de ' + ecartJours(f.echeance, now) + ' j : en parler'); });
  dv.filter(d => d.clientId === c.id).forEach(d => {
    if (d.statut === 'accepte' && !d.commandeLe) R.push('Devis accepté (' + eur(totaux(d).ht) + ' HT) : la commande n’est pas partie');
    else if (d.statut === 'envoye' && d.lignes.length) { const n = ecartJours(jourLocal(envoiDe(d)), now); if (n >= (S.relanceJours || 3)) R.push('Devis de ' + eur(totaux(d).ht) + ' HT sans réponse depuis ' + n + ' j'); }
  });
  (Array.isArray(c.essais) ? c.essais : []).forEach(e => { if (e && e.statut === 'encours') R.push('Essai de ' + (e.produit || 'produit') + ' en cours depuis ' + ecartJours(jourLocal(e.date), now) + ' j'); });
  if (c.etape) R.push('Étape prévue : ' + c.etape);
  if (!R.length) { const e = echeance(c, now); R.push(e && e.jours != null ? 'Dernière visite il y a ' + e.jours + ' j' : 'Jamais visité : premier contact'); }
  return R.slice(0, 3);
}
function prochaineTournee(cl, dv, ext, now = Date.now()) {
  const t = (ext.tournees || {})[jourLocal(now)]; if (!t || !Array.isArray(t.ids) || t.termine) return null;
  const r = t.res || {}, parId = new Map(cl.map(c => [c.id, c])), rest = t.ids.filter(i => !r[i] && parId.has(i)); if (!rest.length) return null;
  const c = parId.get(rest[0]);
  return { c, rang: t.ids.length - rest.length + 1, total: t.ids.length, pourquoi: pourquoiVisite(c, dv, cl, now) };
}
function carteProchaineTournee(pt) {
  const c = pt.c, st = c.compte && c.compte.statut, pastille = st === 'ouvert' ? ['Compte vert', 'ok'] : st === 'bloque' ? ['Compte bloqué', 'ko'] : st ? ['Compte à surveiller', 'warn'] : null;
  const tel = String(c.tel || '').replace(/[^\d+]/g, ''), u = urlItineraire([c]);
  return h('div', { class: 'carte prochaine' },
    h('div', { class: 'elan-tete' }, h('small', { class: 'etiq' }, 'MA PROCHAINE ACTION · TOURNÉE'), pastille ? h('span', { class: 'tag ' + pastille[1] }, pastille[0]) : null),
    h('div', { class: 'gros-chiffre' }, c.nom),
    h('div', { style: 'margin:4px 0 8px' }, pt.pourquoi.map(x => h('p', { class: 'mut', style: 'font-size:15px;margin:2px 0' }, '• ' + x))),
    st === 'bloque' ? h('p', { class: 'mut' }, 'Compte bloqué : pas de vente tant que ce n’est pas réglé.') : null,
    h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/client/' + c.id }, 'Ouvrir la fiche'), tel ? h('a', { class: 'btn sec', href: 'tel:' + tel }, 'Appeler') : null, u ? h('a', { class: 'btn sec', href: u, target: '_blank', rel: 'noopener' }, 'Itinéraire') : null, h('a', { class: 'btn sec', href: '#/tournee' }, 'Tournée')),
    h('p', { class: 'mut', style: 'margin:6px 0 0' }, 'Garage ' + pt.rang + ' sur ' + pt.total + ' aujourd’hui'));
}

function carteElan(dv, cl, T, pt) {
  const m = activite(dv, cl), auj = jourLocal(new Date()), t = m[auj] || { pts: 0, vu: 0, devis: 0, effort: 0 };
  const total = Object.values(m).reduce((a, x) => a + x.pts, 0), niv = Math.floor(total / PALIER) + 1, reste = PALIER - total % PALIER;
  const record = Math.max(0, ...Object.entries(m).filter(([j]) => j !== auj).map(([, x]) => x.pts));
  const sr = serie(m), fait = t.pts >= DEFI;
  if (fait && S.fete !== auj) { S.fete = auj; put('meta', S, 'settings').catch(() => {}); fete(); }
  const x = T[0], proch = x ? { t: x.titre || x.t, d: x.m != null ? [x.tag === 'Règlement' ? 'Facture de ' : 'Devis de ', h('strong', {}, eur(x.m) + (x.tag === 'Règlement' ? '' : ' HT')), x.d2] : x.d, href: x.href, tag: x.tag, b: x.b || (x.href.startsWith('#/devis') ? 'Ouvrir le devis' : x.href.startsWith('#/client') ? 'Ouvrir la fiche' : x.href === '#/point' ? 'Faire le Point' : 'Ouvrir') } : { t: 'Rien d’urgent', d: 'Bonne occasion de repérer un garage à contacter.', href: '#/clients', b: 'Voir les clients' };
  const tuile = (v, l, s) => h('div', { class: 'kpi' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l), s ? h('div', { class: 'l' }, s) : null);
  return [
    pt ? carteProchaineTournee(pt) : h('div', { class: 'carte prochaine' },
      h('div', { class: 'elan-tete' }, h('small', { class: 'etiq' }, 'TA PROCHAINE ACTION'), proch.tag ? h('span', { class: 'tag' }, proch.tag) : null),
      h('div', { class: 'gros-chiffre' }, proch.t), h('p', { class: 'mut', style: 'font-size:15px' }, proch.d),
      h('div', { class: 'elan-tete' }, h('span', { class: 'mut' }, x ? 'À traiter en priorité' : ''), h('a', { class: 'btn', href: proch.href }, proch.b))),
    h('div', { class: 'kpis' },
      tuile(sr, sr > 1 ? 'jours ouvrés de suite' : 'jour ouvré de suite'),
      tuile([String(t.pts), h('small', {}, '/' + DEFI)], 'défi du jour', fait ? 'réussi' : 'en cours'),
      tuile('Niv. ' + niv, 'niveau', (total % PALIER) + '/' + PALIER + ' pts')),
    h('details', { class: 'carte' }, h('summary', {}, 'Comment ça compte'),
      h('p', { class: 'mut' }, (record ? (t.pts > record ? 'Nouveau record du jour (ancien : ' + record + ' pts). ' : 'Meilleur jour : ' + record + ' pts. ') : '') + 'Prochain niveau dans ' + reste + ' points. Visite faite : 10 points. Garage absent ou à rappeler : 3. Essai lancé : 15. Devis envoyé : 20. Devis accepté : 40. Défi du jour : ' + DEFI + ' points. La série compte les jours ouvrés d’affilée avec au moins une action ; le week-end ne la casse pas. Ces points mesurent ton activité, pas tes ventes : seules les ventes comptent vraiment.'))
  ];
}

function tableauDeBord(dv, cl, sigs, ext = {}) {
  const now = new Date(), mk = cleMois(now), T = taches(dv, cl, sigs, now.getTime(), ext), SW = semaineObj(dv, now), apS = appelsSemaine(ext.appels || [], now);
  const envoyes = dv.filter(d => d.lignes.length && d.statut !== 'brouillon');
  const duMois = envoyes.filter(d => cleMois(envoiDe(d)) === mk);
  const acceptesMois = dv.filter(d => d.statut === 'accepte' && d.reponseLe && cleMois(d.reponseLe) === mk);
  // CA = FACTURES HT (avoirs déduits) saisies dans l'appli ; commandes et encaissements sont des indicateurs SÉPARÉS (jamais additionnés au CA).
  const cmdMois = dv.filter(d => d.commandeLe && cleMois(d.commandeLe) === mk).reduce((a, d) => a + totaux(d).ht, 0);
  const caRenseigne = ODICOLOR_CA.aDesPieces(ext.caFacture), caMois = ODICOLOR_CA.calculerMois(ext.caFacture, mk), ca = caRenseigne ? caMois.totalCents : 0;
  const encMois = cl.reduce((a, c) => a + (Array.isArray(c.factures) ? c.factures : []).filter(f => f && f.regleLe && String(f.regleLe).slice(0, 7) === mk).reduce((b, f) => b + (f.montant || 0), 0), 0);
  const attente = dv.filter(d => d.statut === 'envoye' && d.lignes.length), attHt = attente.reduce((a, d) => a + totaux(d).ht, 0);
  const visitesMois = cl.reduce((a, c) => a + (Array.isArray(c.visites) ? c.visites : []).filter(v => v && v.res === 'vu' && typeof v.date === 'string' && v.date.slice(0, 7) === mk).length, 0);
  const obj = objectifDuMois(now), jr = joursOuvres(now, new Date(now.getFullYear(), now.getMonth() + 1, 0, 23));
  { const w = ODICOLOR_CA.calculer(ext.caFacture, SW.l, jourLocal(now)); SW.ca = caRenseigne ? w.totalCents : 0; }
  const bloc = (titre, ca, cible) => h('div', { class: 'colobj' }, h('div', { class: 'mut' }, titre), h('div', { class: 'gros-chiffre' }, eur(ca)),
    h('div', { class: 'piste', role: 'img', 'aria-label': Math.round(ca / cible * 100) + ' % de l’objectif ' + titre }, h('div', { class: 'rempli', style: 'width:' + Math.min(100, Math.round(ca / cible * 100)) + '%' })),
    h('div', { class: 'mut' }, 'sur ' + eur(cible) + ' · ' + Math.round(ca / cible * 100) + ' %'));
  const JNOM = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const carteObj = (obj || SW.cible) ? (() => {
    const reste = obj ? Math.max(0, obj.cents - ca) : 0, pcM = obj ? Math.min(100, Math.round(ca / obj.cents * 100)) : 0, pcS = SW.cible ? Math.min(100, Math.round(SW.ca / SW.cible * 100)) : 0;
    return h('div', { class: 'carte obj hero' }, h('div', { class: 'elan-tete' }, h('strong', {}, obj ? 'Objectif du mois (' + obj.rang + '/' + S.objectifs.length + ')' : 'Objectif de la semaine'), h('small', {}, 'CA facturé HT')),
      caRenseigne ? null : h('p', { class: 'mut' }, h('strong', {}, 'CA facturé non renseigné. '), 'Saisis tes factures et avoirs HT pour suivre ton objectif. ', h('a', { href: '#/ca' }, 'Saisir mon CA facturé')),
      obj ? [h('div', { class: 'gros-chiffre' }, eur(ca), h('span', {}, ' sur ' + eur(obj.cents))),
        h('div', { class: 'piste', role: 'img', 'aria-label': pcM + ' % de l’objectif du mois' }, h('div', { class: 'rempli', style: 'width:' + pcM + '%' })),
        h('div', { class: 'lh' }, h('span', {}, pcM + ' %'), h('span', {}, reste ? 'reste ' + eur(reste) : 'objectif du mois atteint')),
        reste && jr ? h('p', { class: 'mut' }, eur(Math.ceil(reste / jr)) + ' par jour ouvré (' + jr + ' restants, aujourd’hui compris, fériés déduits)') : null] : null,
      SW.cible ? h('div', { class: 'semaine' },
        h('div', { class: 'lh' }, h('strong', {}, 'Cette semaine : ' + eur(SW.ca) + ' sur ' + eur(SW.cible)), h('span', {}, pcS + ' %')),
        h('p', { class: 'mut' }, JNOM[now.getDay()] + ' · jour ' + SW.j + '/' + SW.ouv + (SW.fait ? ' · attendu ce soir pour tenir le rythme : ' + eur(SW.attendu) + ' ' : ' · la semaine commence : rien à rattraper '), SW.fait ? h('strong', { class: 'pastille ' + (SW.ca >= SW.attendu ? 'ok' : 'ko') }, (SW.ca >= SW.attendu ? '+' : '−') + eur(Math.abs(SW.ca - SW.attendu))) : null, SW.ca >= SW.cible ? ' · objectif de la semaine atteint' : ''),
        SW.derive ? h('p', { class: 'mut' }, 'Cible de la semaine déduite du mois (jours ouvrés), à valider : tu peux la fixer dans Réglages.') : null) : null,
      h('p', { class: 'mut' }, 'Autres indicateurs (ils ne comptent pas dans le CA) : commandes envoyées ce mois ' + eur(cmdMois) + ' HT · encaissé ce mois ' + eur(encMois) + ' · en attente de réponse ' + eur(attHt) + ' (' + attente.length + ' devis).'),
      h('p', { class: 'mut' }, caRenseigne ? 'CA facturé du mois : ' + caMois.nFactures + ' facture(s)' + (caMois.nAvoirs ? ', ' + caMois.nAvoirs + ' avoir(s) déduit(s)' : '') + ', saisi(es) par toi. ' : '', h('a', { href: '#/ca' }, 'Voir / saisir le CA facturé')));
  })() : h('div', { class: 'carte' }, h('strong', {}, 'Pas d’objectif réglé. '), 'Entre ton objectif mensuel dans ', h('a', { href: '#/reglages' }, 'Réglages'), '.');
  const nbBloques = cl.filter(c => c.compte && c.compte.statut === 'bloque').length, nbAccSansCmd = dv.filter(d => d.statut === 'accepte' && !d.commandeLe).length, nbRel = dv.filter(d => relanceDue(d, now.getTime()) != null).length, nbRep = cl.filter(c => (Number(c.reports) || 0) >= 3).length;
  const tAl = (n, l, href, ko) => h('a', { class: 'alt' + (n && ko ? ' ko' : ''), href }, h('strong', {}, n), h('span', {}, l));
  const carteAlertes = h('div', { class: 'carte alertes' }, h('div', { class: 'elan-tete' }, h('strong', {}, 'Alertes utiles'), h('small', { class: 'mut' }, 'saisies par toi')),
    h('div', { class: 'grille-al' }, tAl(nbBloques, nbBloques > 1 ? 'comptes bloqués' : 'compte bloqué', '#/clients', true), tAl(nbAccSansCmd, 'devis acceptés non commandés', '#/devis/acceptes', true), tAl(nbRel, nbRel > 1 ? 'relances dues' : 'relance due', '#/devis/relancer', true), tAl(nbRep, '3 reports ou plus à traiter', '#/clients', true)));
  const kpi = (v, l) => h('div', { class: 'kpi' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
  const lien = x => h('a', { class: 'ligne', href: x.href, style: 'color:inherit;text-decoration:none' }, h('span', { class: 'g' }, h('strong', {}, x.t), h('br'), h('small', {}, x.d)), h('span', { class: 'tag warn' }, x.tag));
  const lundi = lundiDe;
  const semaines = []; { const x = new Date(now); x.setDate(x.getDate() - 49); for (let i = 0; i < 8; i++) { semaines.push(lundi(x)); x.setDate(x.getDate() + 7); } }
  const parSem = semaines.map(w => dv.filter(d => d.commandeLe && lundi(d.commandeLe) === w).reduce((a, d) => a + totaux(d).ht, 0));
  const mx = Math.max(...parSem, 1), M = mesures(dv, cl, now);
  const conv = {}; cl.forEach(c => { if (c.conv) conv[c.conv] = (conv[c.conv] || 0) + 1; });
  const dep = S.depart || {};
  const EL = carteElan(dv, cl, T, prochaineTournee(cl, dv, ext, now.getTime()));
  const auj = jourLocal(now), ageExport=ext.pc&&ext.pc.arrete?ecartJours(ext.pc.arrete,now.getTime()):Infinity;
  const pcUtilisable=ageExport>=0&&ageExport<=7;
  const actionsPC = pcUtilisable&&ext.pc&&Array.isArray(ext.pc.actions) ? ext.pc.actions : [];
  const duesPC = actionsPC.filter(a=>a.statut!=='fait'&&a.statut!=='bloque'&&(!a.jourPrevu||a.jourPrevu<=auj)&&(!a.jour||a.jour<=auj||!!a.jourPrevu));
  duesPC.sort((a,b)=>a.prio-b.prio||(a.jourPrevu||a.jour||'').localeCompare(b.jourPrevu||b.jour||''));
  const actPC = duesPC[0]||null;
  const prioriteUnique = actPC ? h('a',{class:'carte prochaine',href:'#/pc',style:'display:block;color:inherit;text-decoration:none'},
    h('small',{class:'etiq'},'TA PROCHAINE ACTION · PLAN PC'),h('div',{class:'gros-chiffre'},actPC.t),
    h('p',{class:'mut'},(actPC.d||'')+' · P'+actPC.prio+(actPC.statut==='bloque'?' · en attente d’un tiers':'')),h('span',{class:'btn'},'Gérer cette action')) : EL[0];
  return [
    carteObj,
    prioriteUnique,
    carteAlertes,
    ext.pc && !actPC ? cartePC(ext.pc) : null,
    h('details', { class: 'carte' }, h('summary', {}, 'Mon élan : série, défi, niveau'), EL[1], EL[2]),
    h('a', { class: 'carte', href: '#/travail', style: 'display:block;color:inherit;text-decoration:none' }, h('div', { class: 'elan-tete' }, h('span', {}, h('strong', {}, 'Mon travail'), h('br'), h('small', { class: 'mut' }, 'Clients visités, devis, commandes, factures, impayés : le point en un coup d’œil')), h('span', { class: 'btn sec' }, 'Ouvrir'))),
    (() => { const t = (ext.tournees || {})[jourLocal(now)]; if (!t || !Array.isArray(t.ids) || !t.ids.length) return null; const x = statsTournee(t), pc = Math.round((x.prevus - x.restants) / x.prevus * 100);
      return h('a', { class: 'carte', href: '#/tournee', style: 'display:block;color:inherit;text-decoration:none' }, h('div', { class: 'elan-tete' }, h('span', {}, h('strong', {}, 'Ma tournée'), h('br'), h('small', { class: 'mut' }, (x.prevus - x.restants) + '/' + x.prevus + ' garages traités · ' + x.restants + ' restant' + (x.restants > 1 ? 's' : ''))), h('span', { class: 'tag ' + (t.termine ? 'ok' : 'warn') }, t.termine ? 'Terminée' : 'En cours')), h('div', { class: 'piste', style: 'margin-top:8px' }, h('div', { class: 'rempli', style: 'width:' + pc + '%' }))); })(),
    h('h2', {}, 'À faire aujourd’hui'),
    T.length ? h('div', { class: 'carte' }, T.slice(0, 6).map(lien), (T.length > 6 ? h('p', { class: 'mut' }, '+ ' + (T.length - 6) + ' autre(s) : Tournée, Signalements, Clients') : null)) : h('p', { class: 'vide' }, 'Rien d’urgent.'),
    h('h2', {}, 'Joindre ' + (S.respNom || 'ton responsable')),
    S.respTel ? h('div', { class: 'actions' }, h('a', { class: 'btn', href: 'tel:+' + tel2wa(S.respTel) }, 'Appeler'), h('a', { class: 'btn sec', href: 'https://wa.me/' + tel2wa(S.respTel), target: '_blank', rel: 'noopener' }, 'WhatsApp')) : h('p', { class: 'mut' }, 'Numéro non réglé. ', h('a', { href: '#/reglages' }, 'Le renseigner dans Réglages')),
    h('div', { class: 'actions' }, h('a', { class: 'btn sec', href: '#/travail' }, 'Mon travail')),
  ];
}

async function pageAccueil() {
  const [dv, cl, sigs] = [await getAll('devis'), await getAll('clients'), await lireSig()];
  const ext = { point: await get('meta', 'point'), appels: await lireAppels(), tournees: await lireTournees(), sigs, pc: await lirePC(), caFacture: await get('meta', 'caFacture') };
  dv.sort((a, b) => b.id - a.id);
  const prenom = (S.vendeur || '').trim().split(' ')[0], JN = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  montrer('Bonjour, ' + (S.accueilNom || 'Mr Omarjee'),
    CAT.length ? null : h('div', { class: 'carte alerte' }, h('strong', {}, 'Catalogue vide. '), 'Importe ton fichier de tarifs pour pouvoir faire des devis. ', h('a', { href: '#/catalogue' }, 'Aller au catalogue')),
    prenom ? null : (() => { const i = h('input', { placeholder: 'Ton prénom', maxlength: 40, autocomplete: 'given-name', 'aria-label': 'Ton prénom' }); return h('div', { class: 'carte' }, h('strong', {}, 'Comment t’appelles-tu ?'), h('p', { class: 'mut' }, 'Il sert de signature sur les devis et dans les messages.'), h('div', { class: 'actions' }, i, h('button', { class: 'btn', onclick: async () => { const v = clean(i.value).slice(0, 40); if (!v) return; S = { ...S, vendeur: v }; await put('meta', S, 'settings'); pageAccueil(); } }, 'OK'))); })(),
    tableauDeBord(dv, cl, sigs, ext),
    h('div', { class: 'actions' }, h('a', { class: 'btn sec', href: '#/point' }, 'Point du lundi'), h('a', { class: 'btn sec', href: '#/feuille' }, 'Feuille de route'), h('a', { class: 'btn sec', href: '#/signaler' }, 'Signaler un problème')),
    h('div', { class: 'fab noprint' }, h('a', { class: 'btn gros noir', href: '#/nouveau' }, '+ Nouveau devis')), h('div', { style: 'height:84px' }),
    (() => { const sem = dv.filter(d => d.lignes.length && Date.now() - new Date(d.creeLe).getTime() < 7 * 864e5); return sem.length ? h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: () => envoyerDevis(sem, 'recap-devis-' + new Date().toISOString().slice(0, 10) + '.json') }, 'Envoyer le récap : ' + sem.length + ' devis des 7 derniers jours')) : null; })(),
    h('h2', {}, 'Derniers devis'),
    dv.length ? dv.slice(0, 30).map(d => { const [lib, cls] = etiquetteDevis(d); return h('a', { class: 'ligne', href: '#/devis/' + d.id, style: 'color:inherit;text-decoration:none' },
      h('span', { class: 'g' }, h('strong', {}, d.clientNom), h('br'), h('small', {}, numero(d) + ' · ' + dateFr(d.creeLe))),
      h('span', { class: 'prix' }, eur(totaux(d).ht), h('br'), h('span', { class: 'tag ' + cls }, lib))); }) : h('p', { class: 'vide' }, 'Aucun devis pour l’instant.'),
    cl.length ? null : h('p', { class: 'mut' }, 'Astuce : les imports de clients sont dans Réglages → Imports.'));
  { const n = new Date(); $('#sous').textContent = JN[n.getDay()] + ' ' + n.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · Accueil commercial'; }
}

// ----- commande pour le responsable (WhatsApp) -----
function texteCommande(d, o = {}) {
  const t = totaux(d);
  const L = ['COMMANDE ' + (S.societe || 'Odicolor') + (o.urgence === 'urgente' ? ' — URGENT' : ''),
    'Client : ' + d.clientNom + (o.tel ? ' · ' + o.tel : ''),
    'Date : ' + dateFr(new Date().toISOString()) + ' · Devis ' + numero(d),
    (o.mode === 'livraison' ? 'Livraison chez le client' : 'Retrait au magasin') + ' · ' + (o.urgence === 'urgente' ? 'Urgent' : 'Normal'), '---'];
  d.lignes.forEach(l => L.push(l.code + ' — ' + l.des + ' × ' + qtxt(l.q) + (o.prix ? ' (' + eur(l.pu) + (l.r ? ' -' + pct(l.r) + ' %' : '') + ' → ' + eur(ligneTotal(l)) + ' HT)' : '')));
  if (o.prix) L.push('---', 'Total HT : ' + eur(t.ht));
  if (o.note) L.push('Note : ' + o.note);
  L.push('Règlement : ' + (o.bloque ? 'COMPTE BLOQUÉ, réglé au comptant confirmé par le vendeur' : o.compte === 'ouvert' ? 'compte ouvert' : o.compte === 'comptant' ? 'comptant uniquement' : 'à vérifier'));
  if (o.tard && o.urgence !== 'urgente') L.push('Après l’heure limite : préparation pour demain');
  L.push(o.stock ? 'Stock vérifié' : 'Stock à vérifier');
  L.push('Vendeur : ' + (S.vendeur || '—'));
  return L.join('\n');
}
function blocCommande(d, client, fini, sauver, apres) {
  const mode = h('select', { 'aria-label': 'Livraison ou retrait' }, [['retrait', 'Retrait au magasin'], ['livraison', 'Livraison chez le client']].map(([v, l]) => h('option', { value: v, selected: (d.cmdMode || 'retrait') === v }, l)));
  const urg = h('select', { 'aria-label': 'Urgence' }, [['normale', 'Normal'], ['urgente', 'Urgent']].map(([v, l]) => h('option', { value: v, selected: (d.cmdUrgence || 'normale') === v }, l)));
  const note = h('textarea', { rows: 2, maxlength: 300, placeholder: 'Note pour la préparation (facultatif)', 'aria-label': 'Note pour la préparation' }, d.cmdNote || '');
  const prix = h('input', { type: 'checkbox', style: 'width:24px;min-height:24px', 'aria-label': 'Joindre les prix' });
  const stockOk = h('input', { type: 'checkbox', style: 'width:24px;min-height:24px', 'aria-label': 'Stock vérifié' });
  const hl = /^\d\d:\d\d$/.test(S.heureLimite || '') ? S.heureLimite : '', tard = hl && new Date().toTimeString().slice(0, 5) > hl;
  return h('div', { class: 'carte' }, h('strong', {}, 'Commande pour ' + (S.respNom || 'le responsable')),
    d.cmdPrepaLe&&!d.commandeLe ? h('div',{class:'carte alerte'},h('strong',{},'Message préparé, envoi NON confirmé'),h('p',{class:'mut'},'Ouvrir WhatsApp ne prouve pas que Mohamed a reçu la commande.'),
      h('button',{class:'btn',onclick:async()=>{if(!confirm('As-tu réellement envoyé la commande à Mohamed ? Cette validation reste ta déclaration, pas un accusé de réception.'))return;
        d.commandeLe=new Date().toISOString();if(d.statut!=='accepte'){d.statut='accepte';d.reponseLe=d.reponseLe||d.commandeLe;}
        if(client&&client.conv&&client.conv!=='converti'){client.conv='converti';await putMany('clients',[client]);}
        await sauver();toast('Envoi déclaré par toi. Confirmation EBP à vérifier.');apres();}},'J’ai réellement envoyé la commande')):null,
    h('label', {}, 'Mode'), mode, h('label', {}, 'Urgence'), urg, h('label', {}, 'Note'), note,
    h('label', { style: 'display:flex;gap:10px;align-items:center' }, prix, 'Joindre les prix au message'),
    h('label', { style: 'display:flex;gap:10px;align-items:center' }, stockOk, 'Stock vérifié avec ' + (S.respNom || 'le responsable')),
    tard ? h('p', { class: 'mut' }, 'Il est après ' + hl + ' : cette commande sera préparée pour le lendemain, sauf si elle est urgente.') : null,
    S.respTel ? null : h('p', { class: 'mut' }, 'Numéro du responsable non réglé : WhatsApp te laissera choisir le contact (Réglages).'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
      if (!d.lignes.length) { toast('Le devis est vide.', true); return; }
      const bloque = client && client.compte && client.compte.statut === 'bloque';
      if (bloque && !confirm('Compte BLOQUÉ. Le client règle-t-il au comptant ?')) return;
      fini(); d.cmdMode = mode.value; d.cmdUrgence = urg.value; d.cmdNote = clean(note.value).slice(0, 300);
      const texte = texteCommande(d, { mode: d.cmdMode, urgence: d.cmdUrgence, note: d.cmdNote, prix: prix.checked, tel: client && client.tel, stock: stockOk.checked, tard, bloque: client && client.compte && client.compte.statut === 'bloque', compte: client && client.compte && client.compte.statut });
      window.open('https://wa.me/' + tel2wa(S.respTel) + '?text=' + encodeURIComponent(texte), '_blank', 'noopener');
      d.cmdPrepaLe = new Date().toISOString();
      await sauver(); toast('Message ouvert : confirme l’envoi réel en revenant ici.'); apres();
    } }, 'Préparer le message pour ' + (S.respNom || 'le responsable'))));
}

// ----- signalements (photo + note), envoyés au responsable -----
function reduirePhoto(file) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(new Error('Ce fichier n’est pas une image.'));
    if (file.size > 30e6) return rej(new Error('Image trop lourde.'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      res(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible.')); };
    img.src = url;
  });
}
function dataVersFile(data, nom) {
  const [meta, b64] = data.split(','), bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new File([u], nom, { type: (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' });
}
function texteSignalement(s) {
  return ['SIGNALEMENT' + (s.urgence === 'urgente' ? ' — URGENT' : ''), 'Type : ' + libelle(SIGNAL_TYPES, s.type), 'Client : ' + (s.clientNom || '—'),
    'Produit : ' + (s.produit || '—'), 'Date : ' + dateFr(s.date), 'Note : ' + (s.note || '—'), 'Vendeur : ' + (S.vendeur || '—')].join('\n');
}
async function envoyerSignalement(s) {
  const texte = texteSignalement(s);
  if (s.photo && navigator.canShare) {
    const f = dataVersFile(s.photo, 'signalement-' + s.id.slice(0, 8) + '.jpg');
    if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: texte, title: 'Signalement' }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; } }
  }
  window.open('https://wa.me/' + tel2wa(S.respTel) + '?text=' + encodeURIComponent(texte), '_blank', 'noopener');
  if (s.photo) toast('La photo ne part pas toute seule : enregistre-la depuis « Signalements » et joins-la dans WhatsApp.');
  return true;
}
async function pageSignaler(clientId) {
  const cl = (await getAll('clients')).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const type = h('select', { 'aria-label': 'Type de problème' }, SIGNAL_TYPES.map(([v, l]) => h('option', { value: v }, l)));
  const cli = h('select', { 'aria-label': 'Client' }, [h('option', { value: '' }, 'Pas de client précis'), ...cl.map(c => h('option', { value: String(c.id), selected: c.id === clientId }, c.nom))]);
  const prod = h('input', { maxlength: 80, placeholder: 'Produit ou référence (facultatif)', 'aria-label': 'Produit' });
  const urg = h('select', { 'aria-label': 'Urgence' }, [['normale', 'Normale'], ['urgente', 'Urgente']].map(([v, l]) => h('option', { value: v }, l)));
  const note = h('textarea', { rows: 4, maxlength: 600, placeholder: 'Ce qui se passe, ce que dit le client… (le micro du clavier marche)', 'aria-label': 'Note' });
  const photo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', 'aria-label': 'Photo' });
  const aper = h('div');
  let data = '';
  photo.addEventListener('change', async () => {
    if (!photo.files[0]) return;
    try { data = await reduirePhoto(photo.files[0]); aper.replaceChildren(h('img', { src: data, alt: 'Aperçu de la photo', style: 'max-width:100%;border-radius:10px' })); } catch (e) { data = ''; toast(e.message, true); }
  });
  const sauver = async (envoyer) => {
    if (!clean(note.value) && !data) { toast('Ajoute une note ou une photo.', true); return; }
    const c = cl.find(x => String(x.id) === cli.value);
    const s = { id: nouvelUid(), date: new Date().toISOString(), type: type.value, clientId: c ? c.id : null, clientNom: c ? c.nom : '', produit: clean(prod.value).slice(0, 80), urgence: urg.value, note: clean(note.value).slice(0, 600), photo: data, statut: 'nouveau' };
    if (envoyer) { const ok = await envoyerSignalement(s); if (!ok) return; s.statut = 'envoye'; s.envoyeLe = new Date().toISOString(); }
    const arr = await lireSig(); arr.unshift(s); await ecrireSig(arr);
    toast(envoyer ? 'Signalement envoyé et enregistré.' : 'Signalement enregistré.'); location.hash = '#/signalements';
  };
  montrer('Signaler',
    h('p', { class: 'mut' }, 'Photo + note, envoyés à ' + (S.respNom || 'ton responsable') + ' par WhatsApp. Évite de cadrer les plaques d’immatriculation et les visages.'),
    h('label', {}, 'Type'), type, h('label', {}, 'Client'), cli, h('label', {}, 'Produit'), prod, h('label', {}, 'Urgence'), urg,
    h('label', {}, 'Photo'), photo, aper, h('label', {}, 'Note'), note,
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => sauver(true) }, 'Envoyer à ' + (S.respNom || 'mon responsable')), h('button', { class: 'btn sec', onclick: () => sauver(false) }, 'Enregistrer sans envoyer')));
}
async function pageSignalements() {
  const sigs = await lireSig();
  let ouverts = true;
  const liste = h('div');
  const dessiner = () => {
    const vus = sigs.filter(s => !ouverts || s.statut !== 'resolu' || !s.clientPrevenu);
    liste.replaceChildren(...(vus.length ? vus.map(s => {
      const [lib, cls] = SIGNAL_ST[s.statut] || SIGNAL_ST.nouveau, retard = sigEnRetard(s);
      const maj = async (fn) => { fn(); await ecrireSig(sigs); dessiner(); };
      return h('div', { class: 'carte' },
        h('div', { class: 'elan-tete' }, h('strong', {}, libelle(SIGNAL_TYPES, s.type)), h('span', { class: 'tag ' + cls }, lib)),
        h('small', { class: 'mut' }, dateFr(s.date) + (s.clientNom ? ' · ' + s.clientNom : '') + (s.produit ? ' · ' + s.produit : '') + (s.urgence === 'urgente' ? ' · URGENT' : '')),
        s.note ? h('p', {}, s.note) : null,
        s.photo ? h('img', { src: s.photo, alt: 'Photo du signalement', style: 'max-width:100%;max-height:220px;border-radius:10px' }) : null,
        retard ? h('p', { class: 'mut' }, '⏰ Pas de prise en charge dans le délai : relance ' + (S.respNom || 'ton responsable') + '.') : null,
        s.statut === 'resolu' && !s.clientPrevenu ? h('p', { class: 'mut' }, 'Pense à prévenir le client que c’est résolu.') : null,
        h('div', { class: 'actions' },
          s.statut === 'nouveau' || retard ? h('button', { class: 'btn', onclick: async () => { if (await envoyerSignalement(s)) maj(() => { s.statut = 'envoye'; s.envoyeLe = new Date().toISOString(); }); } }, s.statut === 'nouveau' ? 'Envoyer' : 'Relancer') : null,
          s.statut === 'envoye' ? h('button', { class: 'btn sec', onclick: () => maj(() => { s.statut = 'pris'; s.priseLe = new Date().toISOString(); }) }, 'Pris en charge') : null,
          s.statut === 'envoye' || s.statut === 'pris' ? h('button', { class: 'btn sec', onclick: () => maj(() => { s.statut = 'resolu'; s.resoluLe = new Date().toISOString(); }) }, 'Résolu') : null,
          s.statut === 'resolu' && !s.clientPrevenu ? h('button', { class: 'btn', onclick: () => maj(() => { s.clientPrevenu = true; }) }, 'Client prévenu') : null,
          s.photo ? h('a', { class: 'btn sec', href: s.photo, download: 'signalement.jpg' }, 'Enregistrer la photo') : null,
          h('button', { class: 'btn danger', 'aria-label': 'Supprimer', onclick: async () => { if (confirm('Supprimer ce signalement ?')) { sigs.splice(sigs.indexOf(s), 1); await ecrireSig(sigs); dessiner(); } } }, '🗑')));
    }) : [h('p', { class: 'vide' }, 'Aucun signalement.')]));
  };
  const bascule = h('button', { class: 'btn sec', onclick: () => { ouverts = !ouverts; bascule.textContent = ouverts ? 'Voir aussi les clôturés' : 'Masquer les clôturés'; dessiner(); } }, 'Voir aussi les clôturés');
  const lot = sigs.filter(x => x.statut === 'nouveau' && x.urgence !== 'urgente');
  const grouper = lot.length > 1 ? h('button', { class: 'btn', onclick: async () => {
    const texte = 'SIGNALEMENTS DU JOUR (' + lot.length + ') — ' + (S.vendeur || '') + '\n' + lot.map((x, i) => (i + 1) + '. ' + libelle(SIGNAL_TYPES, x.type) + ' · ' + (x.clientNom || '—') + (x.produit ? ' · ' + x.produit : '') + ' : ' + (x.note || '—') + (x.photo ? ' [photo]' : '')).join('\n');
    window.open('https://wa.me/' + tel2wa(S.respTel) + '?text=' + encodeURIComponent(texte), '_blank', 'noopener');
    lot.forEach(x => { x.statut = 'envoye'; x.envoyeLe = new Date().toISOString(); }); await ecrireSig(sigs); toast('Lot envoyé. Les photos restent à joindre à la main.'); dessiner();
  } }, 'Envoyer le lot du jour (' + lot.length + ')') : null;
  montrer('Signalements', h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/signaler' }, '⚠ Nouveau signalement'), grouper, bascule), liste,
    h('p', { class: 'mut' }, 'Sans serveur, l’appli ne sait pas si ton responsable a lu le message : « Pris en charge » et « Résolu » se règlent à la main.'));
  dessiner();
}

// ----- le Point avec le responsable -----
function periodePoint(mode, now = new Date()) {
  if (mode === 'mois') return { debut: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01', fin: jourLocal(now), lib: 'le mois en cours' };
  const l = new Date(lundiDe(now) + 'T12:00:00'); l.setDate(l.getDate() - 7); const f = new Date(l); f.setDate(f.getDate() + 6);
  return { debut: jourLocal(l), fin: jourLocal(f), lib: 'la semaine dernière (lundi au dimanche)' };
}
function calculPoint(dv, cl, sigs, per, appels = [], tournees = {}) {
  const tour = { prevus: 0, faits: 0, reportes: 0 }; Object.entries(tournees || {}).forEach(([j, t]) => { if (j >= per.debut && j <= per.fin) { const x = statsTournee(t); tour.prevus += x.prevus; tour.faits += x.faits; tour.reportes += x.reportes; } });
  const dans = iso => { if (!iso) return false; const j = /^\d{4}-\d\d-\d\d$/.test(iso) ? iso : jourLocal(iso); return j >= per.debut && j <= per.fin; };
  const sent = dv.filter(d => d.lignes.length && d.statut !== 'brouillon' && dans(envoiDe(d)));
  const acc = dv.filter(d => d.statut === 'accepte' && dans(d.reponseLe)), ref = dv.filter(d => d.statut === 'refuse' && dans(d.reponseLe));
  const essais = cl.flatMap(c => (Array.isArray(c.essais) ? c.essais : []).map(e => ({ ...e, nom: c.nom }))).filter(e => dans(e.date));
  const visites = cl.reduce((a, c) => a + (Array.isArray(c.visites) ? c.visites : []).filter(v => v && v.res === 'vu' && dans(v.date)).length, 0);
  const sig = sigs.filter(s => dans(s.date)), ouverts = sigs.filter(s => s.statut !== 'resolu');
  const res = sigs.filter(s => s.resoluLe && s.envoyeLe).map(s => (new Date(s.resoluLe) - new Date(s.envoyeLe)) / 36e5);
  const types = {}; sig.forEach(s => { types[s.type] = (types[s.type] || 0) + 1; });
  return { sent, acc, ref, essais, visites, sig, ouverts, types, resolMoyH: res.length ? res.reduce((a, b) => a + b, 0) / res.length : null,
    caAcc: dv.filter(d => d.commandeLe && dans(d.commandeLe)).reduce((a, d) => a + totaux(d).ht, 0), attente: dv.filter(d => d.statut === 'envoye' && d.lignes.length),
    enc: factures(cl).length || cl.some(c => c.compte && c.compte.statut === 'bloque') ? (() => { const F = factures(cl), ouv = F.filter(f => !f.regleLe); return { aEnc: ouv.reduce((a, f) => a + (f.montant || 0), 0), retard: ouv.filter(f => f.echeance && f.echeance < per.fin).reduce((a, f) => a + (f.montant || 0), 0), encaisse: F.filter(f => f.regleLe && jourLocal(f.regleLe) >= per.debut && jourLocal(f.regleLe) <= per.fin).reduce((a, f) => a + (f.montant || 0), 0), bloques: cl.filter(c => c.compte && c.compte.statut === 'bloque').length }; })() : null,
    tour, repetes: cl.filter(c => (Number(c.reports) || 0) >= 3), objections: sig.filter(s => s.type === 'objection'), appels: appels.filter(a => a && typeof a.date === 'string' && a.date.slice(0, 10) >= per.debut && a.date.slice(0, 10) <= per.fin) };
}
const CHANGEMENTS = [
  ['relance', 'Relancer chaque devis à J+3, sans exception'],
  ['visites', 'Faire plus de visites par jour'],
  ['mohamed', 'Regrouper mes demandes à ' + 'Mohamed'.replace('Mohamed', '{resp}') + ' pour moins le solliciter'],
  ['essais', 'Lancer plus d’essais chez les garages'],
  ['priorites', 'Baisser la priorité des garages reportés plusieurs fois'],
  ['etapes', 'Noter une prochaine étape pour chaque garage visité'],
  ['autre', 'Autre (je précise)']];
const libChangement = k => (libelle(CHANGEMENTS, k) || '').replace('{resp}', S.respNom || 'mon responsable');
function carteClesPoint(dv, cl, ext, per) {
  return h('a', { class: 'carte', href: '#/travail/passee', style: 'display:block;color:inherit;text-decoration:none' }, h('div', { class: 'elan-tete' }, h('span', {}, h('strong', {}, 'Mes 6 chiffres de la semaine'), h('br'), h('small', { class: 'mut' }, 'Clients visités, devis, commandes, factures, impayés, avec la source de chaque chiffre')), h('span', { class: 'btn sec' }, 'Ouvrir')));
}
function cibleSemaineDe(d) {
  if (S.objSemaine > 0) return { cible: S.objSemaine, derive: false };
  const lun = new Date(lundiDe(d) + 'T12:00:00'), ven = new Date(lun); ven.setDate(ven.getDate() + 4);
  const o = objectifDuMois(d), n = joursOuvres(new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0, 23));
  return o && n ? { cible: Math.round(o.cents * joursOuvres(lun, ven) / n), derive: true } : { cible: 0, derive: false };
}
function texteDuPoint(P, per, bloc, engagements, chg) {
  const L = ['POINT — ' + (S.vendeur || 'vendeur') + ' — ' + per.lib + ' (' + dateFr(per.debut) + ' au ' + dateFr(per.fin) + ')', '',
    '1. MESURER',
    'Commandes envoyées : ' + eur(P.caAcc) + ' HT' + (P.cible ? ' sur ' + eur(P.cible) + ' (' + Math.round(P.caAcc / P.cible * 100) + ' %, écart ' + (P.caAcc >= P.cible ? '+' : '−') + eur(Math.abs(P.caAcc - P.cible)) + ')' : ''),
    P.visites + ' visites · ' + P.sent.length + ' devis envoyés · ' + P.acc.length + ' acceptés · ' + P.ref.length + ' refusés · ' + P.attente.length + ' en attente',
    'Tournée : ' + (P.tour.prevus ? P.tour.faits + '/' + P.tour.prevus + ' garages traités (' + Math.round(P.tour.faits / P.tour.prevus * 100) + ' %), ' + P.tour.reportes + ' reportés' : 'pas de tournée démarrée'),
    'Essais : ' + P.essais.length + ' lancés, ' + P.essais.filter(e => e.statut === 'concluant' || e.statut === 'commande').length + ' concluants',
    'Signalements : ' + P.sig.length + ', dont ' + P.ouverts.length + ' encore ouverts'];
  if (P.enc) L.push('Encaissement : ' + eur(P.enc.aEnc) + ' à encaisser, dont ' + eur(P.enc.retard) + ' en retard · ' + eur(P.enc.encaisse) + ' encaissés · ' + P.enc.bloques + ' compte(s) bloqué(s)');
  if (P.objections.length) L.push('Objections : ' + P.objections.map(s => (s.clientNom || '?') + ' : ' + s.note).join(' | '));
  L.push('', '2. LE CHANGEMENT DE LA SEMAINE', chg || 'non choisi');
  L.push('', '3. ENGAGEMENTS');
  if (bloc) L.push('Blocages : ' + bloc);
  L.push(engagements.length ? engagements.map(e => (e.fait ? '[fait] ' : '[à faire] ') + e.txt).join(' ; ') : 'aucun');
  L.push('', 'Chiffres basés sur l’activité saisie dans l’appli, pas sur le CA facturé.');
  return L.join('\n');
}
async function pagePoint(mode) {
  mode = mode === 'mois' ? 'mois' : 'semaine';
  const [dv, cl, sigs, pt, apl, tr] = [await getAll('devis'), await getAll('clients'), await lireSig(), await get('meta', 'point'), await lireAppels(), await lireTournees()];
  const donnees = pt && typeof pt === 'object' ? pt : {};
  donnees.faits = donnees.faits || {}; donnees.blocages = donnees.blocages || {}; donnees.changements = donnees.changements || {}; donnees.engagements = Array.isArray(donnees.engagements) ? donnees.engagements : [];
  const per = periodePoint(mode), P = calculPoint(dv, cl, sigs, per, apl, tr), cle = mode + ':' + per.fin.slice(0, mode === 'mois' ? 7 : 10);
  if (mode === 'semaine') { const c = cibleSemaineDe(new Date(per.debut + 'T12:00:00')); P.cible = c.cible; P.derive = c.derive; }
  else { const o = objectifDuMois(new Date(per.debut + 'T12:00:00')); P.cible = o ? o.cents : 0; }
  const sauve = () => put('meta', donnees, 'point');
  const fait = !!donnees.faits[per.debut];
  // 1. mesurer
  const stat = (v, l) => h('div', { class: 'kpi' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
  const pc = P.cible ? Math.round(P.caAcc / P.cible * 100) : null;
  const types = Object.entries(P.types).sort((a, b) => b[1] - a[1]);
  // 2. choisir
  const ch = donnees.changements[cle] || {};
  const autre = h('input', { maxlength: 120, value: ch.autre || '', placeholder: 'Ton changement en une phrase', 'aria-label': 'Autre changement' });
  const radios = CHANGEMENTS.map(([k]) => h('input', { type: 'radio', name: 'chg', value: k, checked: ch.k === k, style: 'width:24px;min-height:24px;flex:none', 'aria-label': libChangement(k) }));
  const lireChg = () => { const r = radios.find(x => x.checked); return r ? { k: r.value, autre: clean(autre.value).slice(0, 120) } : {}; };
  const texteChg = () => { const c = lireChg(); return c.k ? (c.k === 'autre' ? (c.autre || 'Autre') : libChangement(c.k)) : ''; };
  const majAutre = () => { autre.style.display = (radios.find(x => x.checked) || {}).value === 'autre' ? '' : 'none'; };
  [...radios, autre].forEach(x => x.addEventListener('change', async () => { donnees.changements[cle] = lireChg(); majAutre(); await sauve(); }));
  // 3. s'engager
  const bloc = h('textarea', { rows: 3, maxlength: 600, placeholder: 'Ce qui te freine : prix, stock, délais, prospect injoignable…', 'aria-label': 'Blocages' }, donnees.blocages[cle] || '');
  bloc.addEventListener('change', async () => { donnees.blocages[cle] = bloc.value.slice(0, 600); await sauve(); });
  const engBox = h('div');
  const dessinerEng = () => engBox.replaceChildren(...(donnees.engagements.length ? donnees.engagements.slice(-12).reverse().map(e => h('label', { class: 'ligne', style: 'display:flex;gap:10px;align-items:center;margin:0;color:inherit;font-size:inherit' },
    h('input', { type: 'checkbox', checked: e.fait, style: 'width:26px;min-height:26px;flex:none', 'aria-label': e.txt, onchange: async (ev) => { e.fait = ev.target.checked; await sauve(); } }), h('span', { class: 'g' }, e.txt, h('br'), h('small', {}, 'Pris le ' + dateFr(e.creeLe))))) : [h('p', { class: 'vide' }, 'Aucun engagement noté.')]));
  const nouv = h('input', { maxlength: 120, placeholder: 'Nouvel engagement (ex. appeler 5 garages dormants)', 'aria-label': 'Nouvel engagement' });
  const bascule = h('div', { class: 'actions' }, h('a', { class: 'btn ' + (mode === 'semaine' ? '' : 'sec'), href: '#/point' }, 'Semaine'), h('a', { class: 'btn ' + (mode === 'mois' ? '' : 'sec'), href: '#/point/mois' }, 'Mois'));
  montrer('Point du lundi',
    h('div', { class: 'elan-tete' }, h('span', { class: 'mut' }, 'Bilan du ' + dateFr(per.debut) + ' au ' + dateFr(per.fin)), mode === 'semaine' ? h('span', { class: 'tag ' + (fait ? 'ok' : 'warn') }, fait ? 'Fait' : 'À effectuer') : null),
    bascule,
    h('h3', { class: 'etape' }, h('span', {}, '1'), 'Mesurer'),
    h('div', { class: 'carte obj' }, h('div', { class: 'elan-tete' }, h('strong', {}, 'Résultats commerciaux'), h('small', { class: 'mut' }, 'Devis acceptés HT')),
      h('div', { class: 'gros-chiffre' }, eur(P.caAcc), P.cible ? h('span', {}, ' / ' + eur(P.cible)) : null),
      P.cible ? [h('div', { class: 'piste', role: 'img', 'aria-label': pc + ' % de l’objectif' }, h('div', { class: 'rempli' + (pc >= 100 ? ' ok' : ''), style: 'width:' + Math.min(100, pc) + '%' })),
        h('p', {}, pc + ' % · écart ', h('strong', { style: 'color:' + (P.caAcc >= P.cible ? 'var(--ok)' : 'var(--ko)') }, (P.caAcc >= P.cible ? '+' : '−') + eur(Math.abs(P.caAcc - P.cible))))] : h('p', { class: 'mut' }, 'Pas d’objectif réglé pour cette période (Réglages).'),
      P.derive ? h('p', { class: 'mut' }, 'Objectif de la semaine déduit de l’objectif mensuel.') : null,
      h('p', { class: 'mut' }, 'Devis acceptés saisis dans l’appli, pas le CA facturé par EBP.')),
    mode === 'semaine' ? carteClesPoint(dv, cl, { sigs, appels: apl, tournees: tr }, per) : h('div', { class: 'kpis' }, stat(P.visites, 'visites'), stat(P.sent.length, 'devis envoyés'), stat(P.acc.length, 'devis acceptés')),
    h('div', { class: 'actions' }, h('a', { class: 'btn sec', href: '#/evolution' }, 'Voir toute l’évolution')),
    h('div', { class: 'kpis' }, stat(P.tour.prevus ? Math.round(P.tour.faits / P.tour.prevus * 100) + ' %' : '—', 'tournée réalisée'), stat(P.tour.reportes, 'garages reportés'), stat(P.appels.length, 'appels vers ' + (S.respNom || 'le responsable'))),
    h('div', { class: 'carte' },
      h('p', {}, '✅ Victoires : ' + (P.acc.length ? P.acc.slice(0, 3).map(d => d.clientNom + ' (' + eur(totaux(d).ht) + ')').join(', ') : 'aucun devis accepté')),
      h('p', {}, '🧪 Essais : ' + P.essais.length + ' lancé(s), ' + P.essais.filter(e => e.statut === 'concluant' || e.statut === 'commande').length + ' concluant(s)'),
      h('p', {}, '⚠ Signalements : ' + P.sig.length + ' · ' + P.ouverts.length + ' ouvert(s)' + (types.length ? ' · surtout ' + types.slice(0, 2).map(([k, n]) => libelle(SIGNAL_TYPES, k) + ' (' + n + ')').join(', ') : '')),
      P.enc ? h('p', {}, '💶 Encaissement : ' + eur(P.enc.aEnc) + ' à encaisser, dont ' + eur(P.enc.retard) + ' en retard · ' + eur(P.enc.encaisse) + ' encaissés · ' + P.enc.bloques + ' compte(s) bloqué(s)') : null,
      P.repetes.length ? h('p', {}, '🔁 Reportés 3 fois ou plus : ' + P.repetes.map(c => c.nom).join(', ') + '. À visiter vraiment, ou à baisser en priorité.') : null,
      P.objections.length ? h('p', {}, '💬 Objections : ' + P.objections.slice(0, 4).map(s => '« ' + s.note + ' »' + (s.clientNom ? ' (' + s.clientNom + ')' : '')).join(' · ')) : null),
    h('h3', { class: 'etape' }, h('span', {}, '2'), 'Choisir UN changement'),
    h('div', { class: 'carte' }, CHANGEMENTS.map(([k], i) => h('label', { class: 'ligne', style: 'display:flex;gap:10px;align-items:center;margin:0;color:inherit;font-size:inherit' }, radios[i], h('span', { class: 'g' }, libChangement(k)))), autre,
      h('p', { class: 'mut' }, 'Un seul : sinon, la semaine prochaine, tu ne sauras pas ce qui a joué.')),
    h('h3', { class: 'etape' }, h('span', {}, '3'), 'S’engager'),
    h('label', {}, 'Blocages'), bloc,
    h('label', {}, 'Engagements'), engBox,
    h('div', { class: 'actions' }, nouv, h('button', { class: 'btn', onclick: async () => { const t = clean(nouv.value); if (!t) return; donnees.engagements.push({ id: nouvelUid(), txt: t.slice(0, 120), fait: false, creeLe: new Date().toISOString() }); await sauve(); nouv.value = ''; dessinerEng(); } }, 'Ajouter')),
    h('div', { class: 'actions' }, h('button', { class: 'btn gros', onclick: async () => {
      if (!texteChg()) { toast('Choisis d’abord UN changement (étape 2).', true); return; }
      const texte = texteDuPoint(P, per, bloc.value, donnees.engagements.slice(-12), texteChg());
      window.open('https://wa.me/' + tel2wa(S.respTel) + '?text=' + encodeURIComponent(texte), '_blank', 'noopener');
      donnees.faits[per.debut] = true; await sauve(); toast('Point envoyé et noté comme fait.'); pagePoint(mode);
    } }, 'Envoyer le Point par WhatsApp')));
  majAutre(); dessinerEng();
}

// ----- v13 : évolution des indicateurs (semaine par semaine) -----
function semainesJusqua(n = 8, now = new Date()) { const out = []; const l = new Date(lundiDe(now) + 'T12:00:00'); for (let i = n - 1; i >= 0; i--) { const d = new Date(l); d.setDate(d.getDate() - 7 * i); const f = new Date(d); f.setDate(f.getDate() + 6); out.push({ debut: jourLocal(d), fin: jourLocal(f) }); } return out; }
const dansSem = (iso, w) => { if (!iso) return false; const j = /^\d{4}-\d\d-\d\d$/.test(iso) ? iso : jourLocal(iso); return j >= w.debut && j <= w.fin; };
const avantFin = (iso, w) => iso && (/^\d{4}-\d\d-\d\d$/.test(iso) ? iso : jourLocal(iso)) <= w.fin;
const factures = cl => cl.flatMap(c => (Array.isArray(c.factures) ? c.factures : []).map(f => ({ ...f, client: c })));
const COMPTE_ST = [['', 'Non renseigné'], ['ouvert', 'Ouvert'], ['encours', 'Dossier en cours'], ['comptant', 'Comptant uniquement'], ['bloque', 'Bloqué']];
const MODES_PAI = [['', 'Non renseigné'], ['comptant', 'Comptant'], ['cheque', 'Chèque'], ['virement', 'Virement'], ['lcr', 'LCR'], ['prelevement', 'Prélèvement']];
const MOTIFS_REFUS = [['', 'Motif non noté'], ['prix', 'Prix'], ['delai', 'Délai'], ['teinte', 'Teinte / qualité'], ['concurrent', 'Fidèle à un concurrent'], ['besoin', 'Pas de besoin'], ['autre', 'Autre']];
// Indicateurs : id, angle, libellé, format, sens (+1 : plus c'est haut mieux c'est ; -1 : l'inverse), calcul(w) pour une semaine
function indicateurs(dv, cl, ext = {}) {
  const env = dv.filter(d => d.lignes.length && d.statut !== 'brouillon');
  const acc = w => dv.filter(d => d.statut === 'accepte' && dansSem(d.reponseLe, w));
  const ref = w => dv.filter(d => d.statut === 'refuse' && dansSem(d.reponseLe, w));
  const essais = cl.flatMap(c => (Array.isArray(c.essais) ? c.essais : []));
  const F = factures(cl), aFact = F.length > 0;
  const nonRegleeA = (f, w) => avantFin(f.date || f.echeance, w) && !(f.regleLe && avantFin(f.regleLe, w));
  const L = [
    ['acc', 'Résultat', 'Devis acceptés HT', 'eur', 1, w => acc(w).reduce((a, d) => a + totaux(d).ht, 0)],
    ['panier', 'Résultat', 'Panier moyen (devis accepté)', 'eur', 1, w => { const x = acc(w); return x.length ? Math.round(x.reduce((a, d) => a + totaux(d).ht, 0) / x.length) : null; }],
    ['actifs', 'Résultat', 'Clients actifs (devis accepté sur 60 jours)', 'n', 1, w => { const f = Date.parse(w.fin + 'T23:59:59'); return new Set(dv.filter(d => d.statut === 'accepte' && d.reponseLe && Date.parse(d.reponseLe) <= f && f - Date.parse(d.reponseLe) <= 60 * JOUR).map(d => d.clientId || d.clientNom)).size; }],
    ['attente', 'Portefeuille', 'Montant en attente de réponse (fin de semaine)', 'eur', 1, w => env.filter(d => avantFin(envoiDe(d), w) && (d.statut === 'envoye' || (d.reponseLe && !avantFin(d.reponseLe, w)))).reduce((a, d) => a + totaux(d).ht, 0)],
    ['refus', 'Portefeuille', 'Devis refusés', 'n', -1, w => ref(w).length],
    ['visites', 'Activité', 'Visites faites', 'n', 1, w => cl.reduce((a, c) => a + (Array.isArray(c.visites) ? c.visites : []).filter(v => v && v.res === 'vu' && dansSem(v.date, w)).length, 0)],
    ['envoyes', 'Activité', 'Devis envoyés', 'n', 1, w => env.filter(d => dansSem(envoiDe(d), w)).length],
    ['tournee', 'Activité', 'Tournée réalisée', 'pct', 1, w => { let p = 0, f = 0; Object.entries(ext.tournees || {}).forEach(([j, t]) => { if (j >= w.debut && j <= w.fin) { const x = statsTournee(t); p += x.prevus; f += x.faits; } }); return p ? Math.round(f / p * 100) : null; }],
    ['taux', 'Conversion', 'Taux de transformation (acceptés sur devis répondus)', 'pct', 1, w => { const a = acc(w).length, r = ref(w).length; return a + r ? Math.round(a / (a + r) * 100) : null; }],
    ['essais', 'Conversion', 'Essais lancés', 'n', 1, w => essais.filter(e => dansSem(e.date, w)).length],
    ['essaisOk', 'Conversion', 'Essais transformés en commande', 'n', 1, w => essais.filter(e => e.statut === 'commande' && dansSem(e.commandeLe, w)).length],
    ['delai', 'Conversion', 'Délai moyen de réponse à un devis (jours)', 'j', -1, w => { const x = [...acc(w), ...ref(w)].map(d => Math.max(0, (Date.parse(d.reponseLe) - Date.parse(envoiDe(d))) / JOUR)); return x.length ? Math.round(x.reduce((a, b) => a + b, 0) / x.length * 10) / 10 : null; }],
    ['appels', 'Organisation', 'Appels et messages à ' + (S.respNom || 'ton responsable'), 'n', -1, w => (ext.appels || []).filter(a => a && dansSem(a.date, w)).length],
    ['sig', 'Organisation', 'Signalements', 'n', -1, w => (ext.sigs || []).filter(s => dansSem(s.date, w)).length]];
  if (aFact) L.push(
    ['aEnc', 'Encaissement', 'À encaisser (fin de semaine)', 'eur', -1, w => F.filter(f => nonRegleeA(f, w)).reduce((a, f) => a + (f.montant || 0), 0)],
    ['retard', 'Encaissement', 'En retard de paiement (fin de semaine)', 'eur', -1, w => F.filter(f => nonRegleeA(f, w) && f.echeance && f.echeance < w.fin).reduce((a, f) => a + (f.montant || 0), 0)],
    ['encaisse', 'Encaissement', 'Encaissé dans la semaine', 'eur', 1, w => F.filter(f => f.regleLe && dansSem(f.regleLe, w)).reduce((a, f) => a + (f.montant || 0), 0)]);
  return L.map(([id, angle, lib, fmt, sens, f]) => ({ id, angle, lib, fmt, sens, f }));
}
const CLES = dv_cl_has => ['acc', 'taux', 'panier', 'attente', 'essaisOk', dv_cl_has ? 'retard' : 'actifs'];
const fmtInd = (v, fmt) => v == null ? '—' : fmt === 'eur' ? eur(v) : fmt === 'pct' ? v + ' %' : fmt === 'j' ? String(v).replace('.', ',') + ' j' : String(v);
function serieInd(ind, sem) { return sem.map(w => ind.f(w)); }
const SVGNS = 'http://www.w3.org/2000/svg';
function sparkline(vals, sens) {
  const W = 96, H = 28, pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null);
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('aria-hidden', 'true');
  if (pts.length < 2) return svg;
  const mx = Math.max(...pts.map(p => p[1])), mn = Math.min(...pts.map(p => p[1])), rg = mx - mn || 1;
  const xy = pts.map(([i, v]) => [(i / (vals.length - 1)) * (W - 6) + 3, H - 4 - ((v - mn) / rg) * (H - 8)]);
  const pl = document.createElementNS(SVGNS, 'polyline'); pl.setAttribute('points', xy.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', 'currentColor'); pl.setAttribute('stroke-width', '2'); pl.setAttribute('stroke-linejoin', 'round');
  const dot = document.createElementNS(SVGNS, 'circle'); const last = xy[xy.length - 1]; dot.setAttribute('cx', last[0]); dot.setAttribute('cy', last[1]); dot.setAttribute('r', '3'); dot.setAttribute('fill', 'currentColor');
  svg.append(pl, dot); return svg;
}
function tendance(cur, prev, sens) {
  if (cur == null || prev == null) return { cls: '', txt: 'pas de comparaison' };
  if (cur === prev) return { cls: '', txt: '= semaine dernière' };
  const mieux = (cur > prev) === (sens > 0);
  return { cls: mieux ? 'ok' : 'ko', txt: (cur > prev ? '▲ ' : '▼ ') + (prev ? Math.abs(Math.round((cur - prev) / Math.abs(prev) * 100)) + ' %' : 'nouveau') + ' vs semaine dernière' };
}
function ligneInd(ind, vals, opts = {}) {
  const cur = vals[vals.length - 1], prev = vals[vals.length - 2], t = tendance(cur, prev, ind.sens);
  return h('div', { class: 'ind' + (opts.compact ? ' compact' : '') },
    h('div', { class: 'ind-g' }, h('small', { class: 'mut' }, ind.lib), h('strong', {}, fmtInd(cur, ind.fmt)), h('small', { class: 'tend ' + t.cls }, t.txt)),
    h('div', { class: 'ind-d ' + t.cls, role: 'img', 'aria-label': ind.lib + ' sur 8 semaines : ' + vals.map(v => fmtInd(v, ind.fmt)).join(', ') }, sparkline(vals, ind.sens)));
}
function carteCles(dv, cl, ext, titre = 'Mes 6 indicateurs · cette semaine') {
  const I = indicateurs(dv, cl, ext), sem = semainesJusqua(8), ids = CLES(factures(cl).length > 0);
  return h('div', { class: 'carte' }, h('div', { class: 'elan-tete' }, h('strong', {}, titre), h('a', { href: '#/evolution', class: 'mut' }, 'Tout voir')),
    ids.map(id => { const ind = I.find(x => x.id === id); return ind ? ligneInd(ind, serieInd(ind, sem), { compact: true }) : null; }));
}
// ----- v20 : « Mon travail » — 6 chiffres lisibles (MOI = ce que tu notes, EBP = export), chacun avec son action -----
function periodeTravail(k, now = new Date()) {
  const lun = new Date(lundiDe(now) + 'T12:00:00'), pl = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  if (k === 'mois') {
    const y = now.getFullYear(), m = now.getMonth();
    return { k, lib: 'Ce mois', debut: jourLocal(new Date(y, m, 1, 12)), fin: jourLocal(new Date(y, m + 1, 0, 12)), pdebut: jourLocal(new Date(y, m - 1, 1, 12)), pfin: jourLocal(new Date(y, m, 0, 12)), plib: 'le mois dernier', kc: 'mois', kp: 'moisPrec', ref: now };
  }
  if (k === 'passee') { const a = pl(lun, -7); return { k, lib: 'Semaine passée', debut: jourLocal(a), fin: jourLocal(pl(a, 6)), pdebut: jourLocal(pl(a, -7)), pfin: jourLocal(pl(a, -1)), plib: 'la semaine d’avant', kc: 'passee', kp: 'avant', ref: a }; }
  return { k: 'semaine', lib: 'Cette semaine', debut: jourLocal(lun), fin: jourLocal(pl(lun, 6)), pdebut: jourLocal(pl(lun, -7)), pfin: jourLocal(pl(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12), -7)), plib: 'la semaine dernière au même jour', kc: 'semaine', kp: 'passee', ref: now };
}
function mesuresMoi(dv, cl, w) {
  const vus = []; cl.forEach(c => (Array.isArray(c.visites) ? c.visites : []).forEach(v => { if (v && v.res === 'vu' && dansSem(v.date, w)) vus.push(c.id); }));
  const env = dv.filter(d => d.lignes.length && d.statut !== 'brouillon' && dansSem(envoiDe(d), w)), cmd = dv.filter(d => d.commandeLe && dansSem(d.commandeLe, w)), ht = a => a.reduce((s, d) => s + totaux(d).ht, 0);
  return { visites: vus.length, clients: new Set(vus).size, devis: env.length, devisHt: ht(env), cmd: cmd.length, cmdHt: ht(cmd) };
}
function ebpTravail(pc, per) {
  const k = pc && pc.kpi && pc.kpi[per.kc]; if (!k || k.debut !== per.debut) return null;
  const p = pc.kpi[per.kp]; return { cur: k, prev: p && p.debut === per.pdebut ? p : null, echu: pc.kpi.echu || null };
}
const deltaTxt = (cur, prev, fmt, plib) => {
  if (prev == null) return h('small', { class: 'mut' }, 'pas de comparaison');
  const d = cur - prev, bon = d > 0, txt = d === 0 ? '= ' + plib : (d > 0 ? '+' : '−') + (fmt ? fmt(Math.abs(d)) : Math.abs(d)) + ' vs ' + plib;
  return h('small', { class: 'tend ' + (d === 0 ? '' : bon ? 'ok' : 'ko') }, txt);
};
async function pageTravail(k) {
  const [dv, cl, pc] = [await getAll('devis'), await getAll('clients'), await lirePC()], now = new Date(), per = periodeTravail(['semaine', 'passee', 'mois'].includes(k) ? k : 'semaine', now);
  const w = { debut: per.debut, fin: per.fin }, pw = { debut: per.pdebut, fin: per.pfin };
  const M = mesuresMoi(dv, cl, w), P = mesuresMoi(dv, cl, pw), E = ebpTravail(pc, per); if (E && per.k === 'semaine') E.prev = null; // semaine en cours : pas de comparaison EBP (période incomplète)
  const cible = per.k === 'mois' ? ((objectifDuMois(now) || {}).cents || 0) : (cibleSemaineDe(per.ref).cible || 0);
  const nb = (n, un, plur) => n + ' ' + (n > 1 ? plur : un);
  const source = (t, ok = true) => h('span', { class: 'tag ' + (ok ? '' : 'warn'), style: 'font-size:11px' }, t);
  const dateExp = pc && pc.arrete ? dateFr(pc.arrete + 'T12:00:00') : '?';
  const ligne = (lib, src, gros, sous, delta, action) => h('div', { class: 'carte' },
    h('div', { class: 'elan-tete' }, h('small', { class: 'etiq' }, lib), src),
    h('div', { class: 'gros-chiffre', style: 'font-size:32px;font-weight:700;line-height:1.1;margin:4px 0' }, gros), sous ? h('p', { class: 'mut', style: 'margin:2px 0' }, sous) : null, delta || null,
    action ? h('div', { class: 'actions' }, action) : null);
  const pasExport = (lib) => h('div', { class: 'carte' }, h('div', { class: 'elan-tete' }, h('small', { class: 'etiq' }, lib), source(pc ? 'EBP : export trop ancien' : 'EBP : pas d’export', false)),
    h('div', { class: 'gros-chiffre' }, '—'), h('p', { class: 'mut', style: 'margin:2px 0' }, pc ? 'Le plan reçu du PC ne couvre pas cette période.' : 'Charge un export EBP sur le PC, puis importe le plan (Plus, Lien avec le PC).'),
    h('div', { class: 'actions' }, h('a', { class: 'btn sec', href: '#/pc' }, 'Lien avec le PC')));
  const vertsAVoir = cl.filter(c => c.compte && c.compte.statut === 'ouvert').filter(c => { const vs = (Array.isArray(c.visites) ? c.visites : []).filter(v => v && v.res === 'vu').map(v => jourLocal(v.date)).sort(); return !vs.length || ecartJours(vs[vs.length - 1], now.getTime()) > 30; });
  const relances = dv.filter(d => relanceDue(d, now.getTime()) != null), sansCmd = dv.filter(d => d.statut === 'accepte' && !d.commandeLe);
  const nAct = tag => pc ? pc.actions.filter(a => a.tag === tag && a.statut !== 'fait' && (tag !== 'Commande' || a.responsable !== 'Toi')).length : 0;
  const caStore = await get('meta', 'caFacture'), caPer = { renseigne: ODICOLOR_CA.aDesPieces(caStore), r: ODICOLOR_CA.calculer(caStore, per.debut, per.fin) };
  const fil = [nb(M.clients, 'client visité', 'clients visités'), nb(M.devis, 'devis', 'devis'), nb(M.cmd, 'commande', 'commandes')].concat(E ? [nb(E.cur.facN, 'facture (EBP)', 'factures (EBP)')] : []).join('  →  ');
  // Conversion par cohorte : suivre les MÊMES devis, et non deux flux de semaines différentes.
  const cohorte = dv.filter(d=>d.lignes&&d.lignes.length&&d.statut!=='brouillon'&&
    jourLocal(envoiDe(d))>=per.debut&&jourLocal(envoiDe(d))<=per.fin);
  const commandesCohorte = cohorte.filter(d=>!!d.commandeLe).length;
  const taux = cohorte.length ? Math.round(commandesCohorte/cohorte.length*100) : null;
  const bascule = h('div', { class: 'actions' }, [['semaine', 'Cette semaine'], ['passee', 'Semaine passée'], ['mois', 'Ce mois']].map(([id, l]) => h('a', { class: 'btn ' + (per.k === id ? '' : 'sec'), href: '#/travail/' + id }, l)));
  montrer('Mon travail', bascule,
    h('p', { class: 'mut' }, per.lib + ' · du ' + dateFr(per.debut) + ' au ' + dateFr(per.fin) + '. MOI = ce que tu notes dans l’appli. EBP = export du PC (' + (pc ? 'export du ' + dateExp : 'aucun plan reçu') + ').'),
    ligne('1 · Clients visités', source('MOI'), nb(M.clients, 'client', 'clients'), nb(M.visites, 'visite', 'visites'), deltaTxt(M.clients, P.clients, null, per.plib),
      vertsAVoir.length ? h('a', { class: 'btn sec', href: '#/tournee' }, vertsAVoir.length + ' client' + (vertsAVoir.length > 1 ? 's' : '') + ' vert' + (vertsAVoir.length > 1 ? 's' : '') + ' pas vu' + (vertsAVoir.length > 1 ? 's' : '') + ' depuis 30 j : préparer la tournée') : null),
    ligne('2 · Devis envoyés', source('MOI'), nb(M.devis, 'devis', 'devis'), eur(M.devisHt) + ' HT', deltaTxt(M.devis, P.devis, null, per.plib),
      relances.length ? h('a', { class: 'btn sec', href: '#/devis/' + relances[0].id }, 'Relancer ' + nb(relances.length, 'devis', 'devis') + ' sans réponse') : null),
    ligne('2b · CA facturé HT (saisi)', source('MOI'), caPer.renseigne ? eur(caPer.r.totalCents) : 'Non renseigné', caPer.renseigne ? caPer.r.nFactures + ' facture(s)' + (caPer.r.nAvoirs ? ' − ' + caPer.r.nAvoirs + ' avoir(s)' : '') + (cible ? ' · objectif ' + eur(cible) + (cible - caPer.r.totalCents > 0 ? ' · il manque ' + eur(cible - caPer.r.totalCents) : ' · atteint') : '') : 'Aucune facture saisie : le CA n’est pas deviné à partir des commandes.', null,
      h('a', { class: 'btn sec', href: '#/ca' }, 'Saisir / voir le CA facturé')),
    ligne('3 · Commandes envoyées (≠ CA)', source('MOI'), nb(M.cmd, 'commande', 'commandes'), eur(M.cmdHt) + ' HT · indicateur d’activité, distinct du CA facturé', deltaTxt(M.cmdHt, P.cmdHt, eur, per.plib),
      sansCmd.length ? h('a', { class: 'btn sec', href: '#/devis/' + sansCmd[0].id }, nb(sansCmd.length, 'devis accepté', 'devis acceptés') + ' sans commande : envoyer') : null),
    E ? ligne('4 · Commandes retrouvées dans EBP', source('EBP du ' + dateExp), nb(E.cur.cmdN, 'commande', 'commandes'), eur(Math.round(E.cur.cmdHt * 100)) + ' HT' + (M.cmdHt > Math.round(E.cur.cmdHt * 100) ? ' · ' + eur(M.cmdHt - Math.round(E.cur.cmdHt * 100)) + ' déclarés mais pas encore dans EBP' : ''), E.prev ? deltaTxt(E.cur.cmdN, E.prev.cmdN, null, per.plib) : null,
      nAct('Commande') ? h('a', { class: 'btn sec', href: '#/pc' }, nb(nAct('Commande'), 'commande à vérifier', 'commandes à vérifier') + ' avec ' + (S.respNom || 'ton responsable')) : null) : pasExport('4 · Commandes retrouvées dans EBP'),
    E ? ligne('5 · Factures émises', source('EBP du ' + dateExp), nb(E.cur.facN, 'facture', 'factures'), eur(Math.round(E.cur.facHt * 100)) + ' HT', E.prev ? deltaTxt(E.cur.facN, E.prev.facN, null, per.plib) : null,
      nAct('Facture') ? h('a', { class: 'btn sec', href: '#/pc' }, nb(nAct('Facture'), 'livraison à faire facturer', 'livraisons à faire facturer')) : null) : pasExport('5 · Factures émises'),
    E && E.echu ? ligne('6 · Impayés échus', source('EBP du ' + dateExp), nb(E.echu.n, 'facture', 'factures'), E.echu.reste == null ? 'aucun montant échu vérifié' + (E.echu.aVerifier?' · '+E.echu.aVerifier+' facture(s) à vérifier':'') : eur(Math.round(E.echu.reste * 100)) + ' de reste vérifié' + (E.echu.aVerifier?' · '+E.echu.aVerifier+' facture(s) à vérifier':''), null,
      nAct('Règlement') ? h('a', { class: 'btn sec', href: '#/pc' }, 'Relancer ' + nb(nAct('Règlement'), 'paiement', 'paiements')) : null) : pasExport('6 · Impayés échus'),
    h('div', { class: 'carte' }, h('small', { class: 'etiq' }, 'Le fil de ton travail'), h('p', { style: 'font-size:17px;margin:6px 0' }, fil),
      taux == null ? h('p', { class: 'mut' }, 'Pas encore de devis envoyé sur la période.') : h('p', { class: 'mut' }, commandesCohorte + ' commande' + (commandesCohorte > 1 ? 's' : '') + ' issue' + (commandesCohorte > 1 ? 's' : '') + ' de ' + cohorte.length + ' devis envoyés dans la période (' + taux + ' %). Ce taux évolue lorsque des devis anciens deviennent des commandes.')),
    h('p', { class: 'mut' }, 'Les chiffres MOI ne comptent que ce que tu notes. Les chiffres EBP datent du dernier export : jamais « 0 » sans export, un tiret.'));
}

async function pageEvolution() {
  const [dv, cl, sigs, apl, tr] = [await getAll('devis'), await getAll('clients'), await lireSig(), await lireAppels(), await lireTournees()];
  const ext = { sigs, appels: apl, tournees: tr }, I = indicateurs(dv, cl, ext).filter(x => x.id !== 'appels'), sem = semainesJusqua(8);
  const angles = [...new Set(I.map(x => x.angle))];
  const refus = {}; dv.filter(d => d.statut === 'refuse').forEach(d => { const k = d.motifRefus || ''; refus[k] = (refus[k] || 0) + 1; });
  const conv = {}; cl.forEach(c => { if (c.conv) conv[c.conv] = (conv[c.conv] || 0) + 1; });
  montrer('Évolution',
    h('p', { class: 'mut' }, 'Semaine en cours (du ' + dateFr(sem[7].debut) + ') comparée à la semaine dernière ; courbe sur 8 semaines. L’historique commence quand tu utilises l’appli : il faut environ 4 semaines pour une vraie tendance.'),
    angles.map(a => [h('h2', {}, a), h('div', { class: 'carte' }, I.filter(x => x.angle === a).map(ind => ligneInd(ind, serieInd(ind, sem))))]),
    Object.keys(refus).length ? [h('h2', {}, 'Pourquoi on perd (devis refusés)'), h('div', { class: 'carte' }, Object.entries(refus).sort((x, y) => y[1] - x[1]).map(([k, n]) => h('div', { class: 'ligne' }, h('span', { class: 'g' }, libelle(MOTIFS_REFUS, k)), h('span', { class: 'prix' }, n))))] : null,
    Object.keys(conv).length ? [h('h2', {}, 'Avancement des garages'), h('div', { class: 'carte' }, h('div', { class: 'entonnoir' }, CONV.filter(x => x[0]).map(([k, l]) => h('div', { class: 'etape' }, h('div', { class: 'v' }, conv[k] || 0), h('small', {}, l)))))] : null,
    !factures(cl).length ? h('p', { class: 'mut' }, 'Encaissement : ajoute les factures à encaisser sur la fiche des garages pour suivre cet angle.') : null,
    h('p', { class: 'mut' }, 'Chiffres tirés de ce que tu notes dans l’appli, pas d’EBP. Une semaine sans saisie ressemble à une semaine sans travail.'));
}

// ----- règlements : compte client et factures à encaisser -----
const enRetard = (f, now = Date.now()) => !f.regleLe && f.echeance && f.echeance < jourLocal(now);
function blocCompte(c, sauver) {
  const co = c.compte || (c.compte = {});
  if (!Array.isArray(c.factures)) c.factures = [];
  const st = h('select', { 'aria-label': 'Statut du compte' }, COMPTE_ST.map(([v, l]) => h('option', { value: v, selected: (co.statut || '') === v }, l)));
  const mo = h('select', { 'aria-label': 'Mode de paiement' }, MODES_PAI.map(([v, l]) => h('option', { value: v, selected: (co.mode || '') === v }, l)));
  const de = h('input', { value: co.delai || '', maxlength: 40, placeholder: 'Ex. 30 jours fin de mois', 'aria-label': 'Délai de paiement' });
  const pl = h('input', { value: co.plafond ? String(co.plafond / 100) : '', inputmode: 'decimal', placeholder: 'Facultatif (€)', 'aria-label': 'Plafond d’encours' });
  const liste = h('div'), resume = h('div');
  const majCompte = async () => { co.statut = st.value; co.mode = mo.value; co.delai = clean(de.value).slice(0, 40); let p = 0; try { p = pl.value.trim() ? parseCents(pl.value) : 0; } catch (e) { p = 0; } co.plafond = p > 0 && p < 1e10 ? p : 0; await sauver(); dessiner(); };
  [st, mo, de, pl].forEach(x => x.addEventListener('change', majCompte));
  const num = h('input', { maxlength: 30, placeholder: 'N° de facture', 'aria-label': 'Numéro de facture' });
  const mt = h('input', { inputmode: 'decimal', placeholder: 'Montant TTC (€)', 'aria-label': 'Montant de la facture' });
  const ech = h('input', { type: 'date', 'aria-label': 'Échéance de la facture' });
  const dessiner = () => {
    const ouvertes = c.factures.filter(f => !f.regleLe), du = ouvertes.reduce((a, f) => a + (f.montant || 0), 0), ret = ouvertes.filter(f => enRetard(f)).reduce((a, f) => a + (f.montant || 0), 0);
    resume.replaceChildren(...[
      co.statut === 'bloque' ? h('div', { class: 'bandeau-ko' }, 'COMPTE BLOQUÉ : pas de commande sans règlement au comptant.') : null,
      co.statut === 'encours' ? h('p', { class: 'mut' }, 'Ouverture en cours : récupère Kbis, RIB et conditions signées.') : null,
      h('div', { class: 'quatre trois' }, h('div', {}, h('strong', {}, eur(du)), h('small', { class: 'mut' }, 'à encaisser')), h('div', {}, h('strong', { class: ret ? 'ko' : '' }, eur(ret)), h('small', { class: 'mut' }, 'en retard')), h('div', {}, h('strong', {}, co.plafond ? Math.round(du / co.plafond * 100) + ' %' : '—'), h('small', { class: 'mut' }, 'du plafond')))].filter(Boolean));
    liste.replaceChildren(...(c.factures.length ? c.factures.slice().sort((a, b) => (a.regleLe ? 1 : 0) - (b.regleLe ? 1 : 0) || String(a.echeance).localeCompare(String(b.echeance))).map(f => {
      const r = enRetard(f), jr = r ? ecartJours(f.echeance) : 0;
      const pr = h('input', { type: 'date', value: f.promesse || '', 'aria-label': 'Promesse de paiement le' });
      pr.addEventListener('change', async () => { f.promesse = /^\d{4}-\d\d-\d\d$/.test(pr.value) ? pr.value : ''; await sauver(); toast('Promesse notée.'); });
      return h('div', { class: 'facture' },
        h('div', { class: 'elan-tete' }, h('span', {}, h('strong', {}, (f.num || 'Facture') + ' · ' + eur(f.montant || 0)), h('br'), h('small', { class: 'mut' }, 'Échéance ' + (f.echeance ? dateFr(f.echeance) : '—') + ((f.relances || []).length ? ' · ' + f.relances.length + ' relance(s)' : ''))),
          h('span', { class: 'tag ' + (f.regleLe ? 'ok' : r ? 'ko' : 'warn') }, f.regleLe ? 'Réglée' : r ? 'Retard ' + jr + ' j' : 'À échoir')),
        f.regleLe ? null : [h('label', { class: 'rang' }, h('span', { class: 'mut' }, 'Promesse le'), pr),
          h('div', { class: 'trio' }, h('button', { class: 'btn sec', onclick: async () => { (f.relances = f.relances || []).push(jourLocal(new Date())); await sauver(); dessiner(); toast('Relance notée.'); } }, 'Relancé'),
            h('button', { class: 'btn vert', onclick: async () => { f.regleLe = new Date().toISOString(); await sauver(); dessiner(); toast('Réglée : ' + eur(f.montant || 0) + '.'); } }, 'Réglée'),
            h('button', { class: 'btn danger', 'aria-label': 'Supprimer la facture', onclick: async () => { if (confirm('Supprimer cette facture ?')) { c.factures.splice(c.factures.indexOf(f), 1); await sauver(); dessiner(); } } }, 'Suppr.'))]);
    }) : [h('p', { class: 'vide' }, 'Aucune facture à suivre.')]));
  };
  const node = h('div', { class: 'carte' }, h('small', { class: 'etiq' }, 'COMPTE ET RÈGLEMENTS'), resume,
    h('label', {}, 'Statut du compte'), st, h('label', {}, 'Mode de paiement'), mo, h('label', {}, 'Délai de paiement'), de, h('label', {}, 'Plafond d’encours (€)'), pl,
    h('h3', { style: 'margin:16px 0 4px' }, 'Factures à encaisser'), liste,
    h('label', {}, 'Ajouter une facture'), num, mt, ech,
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
      let m = null; try { m = parseCents(mt.value); } catch (e) { m = null; }
      if (!m || m <= 0 || m > 1e10) { toast('Montant invalide.', true); return; }
      if (!/^\d{4}-\d\d-\d\d$/.test(ech.value)) { toast('Indique la date d’échéance.', true); return; }
      c.factures.push({ id: nouvelUid(), num: clean(num.value).slice(0, 30), montant: m, echeance: ech.value, date: jourLocal(new Date()), relances: [] });
      await sauver(); num.value = mt.value = ech.value = ''; dessiner(); toast('Facture ajoutée.');
    } }, 'Ajouter la facture')),
    h('p', { class: 'mut' }, 'Saisie à la main en attendant l’export EBP des factures non réglées. Vérifie avec la comptabilité avant de relancer un client.'));
  dessiner();
  return node;
}

// ----- comparateur de coût prêt à l'emploi (valeurs saisies à la main) -----
function coutPae(o) { // o : { pPeint, kPeint, pDur, kDur, pDil, kDil, rend } en centimes/litre et parts ; -> { litre, m2 } en centimes
  const parts = o.kPeint + o.kDur + o.kDil;
  if (!(parts > 0) || !(o.rend > 0)) return null;
  const litre = (o.pPeint * o.kPeint + o.pDur * o.kDur + o.pDil * o.kDil) / parts;
  return { litre, m2: litre / o.rend };
}
function lireNb(v) { const s = String(v == null ? '' : v).replace(',', '.').replace(/\s/g, ''); if (!s) return 0; const n = Number(s); return isFinite(n) && n >= 0 && n < 1e6 ? n : NaN; }
async function pageComparateur() {
  const sauve = (await get('meta', 'comparateur')) || {};
  const champs = [['nom', 'Nom du produit'], ['pPeint', 'Prix de la peinture (€/L)'], ['kPeint', 'Parts de peinture'], ['pDur', 'Prix du durcisseur (€/L)'], ['kDur', 'Parts de durcisseur'], ['pDil', 'Prix du diluant (€/L)'], ['kDil', 'Parts de diluant'], ['rend', 'Rendement prêt à l’emploi (m² par litre)'], ['seche', 'Temps de séchage (note)']];
  const mk = (cote, titre) => {
    const ins = {}; champs.forEach(([k, l]) => { ins[k] = h('input', { value: (sauve[cote] || {})[k] || '', inputmode: k === 'nom' || k === 'seche' ? 'text' : 'decimal', 'aria-label': titre + ' : ' + l, placeholder: l }); });
    return { cote, ins, node: h('div', { class: 'carte' }, h('strong', {}, titre), ...champs.map(([k, l]) => [h('label', {}, l), ins[k]])) };
  };
  const A = mk('a', 'Produit actuel'), B = mk('b', 'Produit proposé');
  const res = h('div', { role: 'status' });
  const val = X => { const g = k => lireNb(X.ins[k].value); return { pPeint: g('pPeint'), kPeint: g('kPeint'), pDur: g('pDur'), kDur: g('kDur'), pDil: g('pDil'), kDil: g('kDil'), rend: g('rend') }; };
  const calc = async () => {
    const a = val(A), b = val(B);
    const sv = { a: {}, b: {} }; [A, B].forEach(X => champs.forEach(([k]) => { sv[X.cote][k] = X.ins[k].value; })); await put('meta', sv, 'comparateur');
    if ([a, b].some(o => Object.values(o).some(Number.isNaN))) { res.replaceChildren(h('div', { class: 'carte erreur' }, 'Un nombre est invalide.')); return; }
    const ca = coutPae(a), cb = coutPae(b);
    if (!ca || !cb) { res.replaceChildren(h('p', { class: 'mut' }, 'Remplis les parts et le rendement des deux produits pour voir la comparaison.')); return; }
    const ecart = (cb.m2 - ca.m2) / ca.m2 * 100, m = c => c.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    res.replaceChildren(h('div', { class: 'carte ' + (ecart <= 0 ? 'reussi' : 'alerte') },
      h('strong', {}, 'Coût au m² : ' + m(ca.m2) + ' (actuel) contre ' + m(cb.m2) + ' (proposé)'),
      h('p', {}, 'Litre prêt à l’emploi : ' + m(ca.litre) + ' contre ' + m(cb.litre) + '.'),
      h('p', {}, Math.abs(ecart) < 0.05 ? 'Même coût au m².' : 'Le produit proposé coûte ' + Math.abs(ecart).toFixed(1).replace('.', ',') + ' % ' + (ecart < 0 ? 'de moins' : 'de plus') + ' au m².'),
      h('p', { class: 'mut' }, 'Pour 100 m² : ' + m(ca.m2 * 100) + ' contre ' + m(cb.m2 * 100) + '.')),
      h('p', { class: 'mut' }, 'Chiffres saisis par toi : vérifie-les avec les fiches techniques. Le coût ne dit rien de la qualité de teinte ni du temps gagné : compare aussi ces points avec le garagiste.'));
  };
  [A, B].forEach(X => Object.values(X.ins).forEach(i => i.addEventListener('input', calc)));
  montrer('Comparateur', h('p', { class: 'mut' }, 'Compare le coût réel au m² (peinture + durcisseur + diluant, rapporté au rendement), pas seulement la remise. Un exemple de mélange : 4 parts de peinture, 1 de durcisseur, 1 de diluant.'), A.node, B.node, res);
  calc();
}
function pagePlus() {
  const L = (href, t, d) => h('a', { class: 'ligne', href, style: 'color:inherit;text-decoration:none' }, h('span', { class: 'g' }, h('strong', {}, t), h('br'), h('small', {}, d)), h('span', {}, '›'));
  montrer('Plus', L('#/autotest', 'Autotest du téléphone', 'Vérifie automatiquement stockage, chiffrement, hors ligne, vitesse : un seul rapport à copier'), espaceTerrain() ? null : L('#/demo', 'Démonstration (données fictives)', 'Charger un jeu 100 % fictif sur un téléphone vide, fichiers d’essai EBP'), L('#/agenda', 'Rendez-vous', 'Ton agenda avec heures ; intégré à la tournée du jour'), L('#/secteurs', 'Secteurs', 'CA, clients actifs/dormants, prospects et priorités par département et commune'), L('#/clients-ebp', 'Clients EBP', 'Relier les codes clients EBP à tes garages (tu valides chaque lien)'), L('#/ville', 'Ma Ville', 'Tes garages commune par commune, en vue LEGO tactile'), L('#/carte', 'Carte commerciale', 'Tous tes garages sur la carte, regroupés, hors ligne'), L('#/cockpit', 'Cockpit', 'Tes priorités du jour : CA, relances, devis, prospects, clients à voir'), L('#/ca', 'CA facturé HT', 'Tes factures et avoirs HT : le chiffre d’affaires, sans doublon'), L('#/travail', 'Mon travail', 'Tes 6 chiffres : visites, devis, commandes, factures, impayés'), L('#/point', 'Point du lundi', 'Le récap de la semaine écoulée : bilan, UN changement, engagements'), L('#/feuille', 'Feuille de route', 'Le plan de la semaine qui commence, jour par jour'), L('#/pc', 'Lien avec le PC', 'Envoyer ta sauvegarde au PC, recevoir le plan de la semaine'), L('#/evolution', 'Évolution', 'Tous les indicateurs, semaine par semaine, avec leur courbe'), L('#/signalements', 'Signalements', 'Problèmes remontés avec photo et leur suivi'), L('#/signaler', 'Signaler un problème', 'Photo + note envoyées à ton responsable'),
    L('#/comparateur', 'Comparateur de coût', 'Coût réel au m² : produit actuel contre produit proposé'), L('#/reglages', 'Réglages', 'Objectifs, responsable, TVA, sauvegarde'));
}


// ---------- liste des devis ----------
async function pageDevisListe(filtre) {
  const dv = (await getAll('devis')).sort((a, b) => b.id - a.id), now = Date.now();
  const F = [['', 'Tous', () => true], ['relancer', 'À relancer', d => relanceDue(d, now) != null], ['acceptes', 'Acceptés', d => d.statut === 'accepte'], ['envoyes', 'Envoyés', d => d.statut === 'envoye'], ['refuses', 'Refusés', d => d.statut === 'refuse']];
  const f = F.find(x => x[0] === (filtre || '')) || F[0], liste = dv.filter(d => d.lignes.length || d.statut === 'brouillon').filter(f[2]);
  montrer('Devis', h('div', { class: 'puces' }, F.map(x => h('a', { class: 'puce' + (x[0] === f[0] ? ' on' : ''), href: '#/devis' + (x[0] ? '/' + x[0] : ''), style: 'display:inline-flex;align-items:center;text-decoration:none' }, x[1] + ' ' + dv.filter(x[2]).length))),
    h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/nouveau' }, '+ Nouveau devis')),
    liste.length ? h('div', { class: 'carte' }, liste.slice(0, 60).map(d => { const [lib, cls] = etiquetteDevis(d); return h('a', { class: 'ligne', href: '#/devis/' + d.id, style: 'color:inherit;text-decoration:none' },
      h('span', { class: 'g' }, h('strong', {}, d.clientNom), h('br'), h('small', {}, numero(d) + ' · ' + dateFr(d.creeLe) + (d.statut === 'accepte' && !d.commandeLe ? ' · pas encore commandé' : ''))),
      h('span', { class: 'prix' }, eur(totaux(d).ht), h('br'), h('span', { class: 'tag ' + cls }, lib))); })) : h('p', { class: 'vide' }, 'Aucun devis dans cette liste.'));
}

// ---------- feuille de route de la semaine ----------
function planSemaine(dv, cl, now = new Date()) {
  const lun = lundiDe(now), jours = [];
  for (let i = 0; i < 5; i++) { const x = new Date(lun + 'T12:00:00'); x.setDate(x.getDate() + i); if (estOuvre(x)) jours.push(jourLocal(x)); }
  const plan = {}; jours.forEach(j => { plan[j] = []; });
  if (!jours.length) return { jours, plan, reserve: [] };
  const premier = jours[0], dernier = jours[jours.length - 1], ms = now.getTime();
  const place = (j, it) => { const k = j < premier ? premier : j; if (k > dernier) return false; const g = jours.find(x => x >= k) || dernier; plan[g].push(it); return true; };
  const plus = (iso, n) => jourLocal(Date.parse(iso + 'T12:00:00') + n * JOUR);
  dv.forEach(d => {
    if (d.statut !== 'envoye' || !d.lignes.length) return;
    if (relanceDue(d, ms) != null) place(premier, { t: 'Relancer le devis de ' + d.clientNom, d: eur(totaux(d).ht) + ' HT', href: '#/devis/' + d.id, tag: 'Relance' });
    else if (!d.relanceLe) { const du = plus(jourLocal(envoiDe(d)), S.relanceJours || 3); if (du >= premier && du <= dernier) place(du, { t: 'Relancer le devis de ' + d.clientNom, d: eur(totaux(d).ht) + ' HT (3 jours après l’envoi : hypothèse)', href: '#/devis/' + d.id, tag: 'Relance' }); }
  });
  factures(cl).forEach(f => {
    if (f.regleLe) return;
    if (f.promesse && f.promesse >= premier && f.promesse <= dernier) place(f.promesse, { t: 'Paiement promis · ' + f.client.nom, d: eur(f.montant || 0) + ' à vérifier', href: '#/client/' + f.client.id, tag: 'Règlement' });
    else if (enRetard(f, ms) && !(f.promesse && f.promesse > jourLocal(ms))) place(premier, { t: 'Relancer le règlement · ' + f.client.nom, d: eur(f.montant || 0) + ' en retard', href: '#/client/' + f.client.id, tag: 'Règlement' });
  });
  const vus = new Set();
  cl.forEach(c => {
    (Array.isArray(c.essais) ? c.essais : []).forEach(e => {
      if (!e || e.statut !== 'encours' || !/^\d{4}-\d\d-\d\d$/.test(e.date || '')) return;
      const sv = Array.isArray(e.suivis) ? e.suivis : [];
      [['J2', 2, 'Appeler pour l’essai'], ['J7', 7, 'Faire le point sur l’essai']].forEach(([k, n, t]) => { if (!sv.includes(k) && place(plus(e.date, n), { t: t + ' chez ' + c.nom, d: (e.produit || 'produit') + ' · J+' + n, href: '#/client/' + c.id, tag: 'Essai' })) vus.add(c.id); });
    });
    if (c.etape && /^\d{4}-\d\d-\d\d$/.test(c.etapeDate || '') && place(c.etapeDate, { t: c.etape + ' · ' + c.nom, d: 'Étape prévue le ' + dateFr(c.etapeDate), href: '#/client/' + c.id, tag: 'Étape' })) vus.add(c.id);
    if (typeof c.reporteAu === 'string' && /^\d{4}-\d\d-\d\d$/.test(c.reporteAu) && c.reporteAu > jourLocal(ms) && place(c.reporteAu, { t: 'Visite reportée · ' + c.nom, d: 'Reportée ' + (c.reports || 1) + ' fois', href: '#/client/' + c.id, tag: 'Visite' })) vus.add(c.id);
  });
  const dus = cl.filter(c => !vus.has(c.id)).map(c => ({ c, e: echeance(c, ms) })).filter(x => x.e && x.e.du).sort((a, b) => (b.e.rappel - a.e.rappel) || (b.e.pct - a.e.pct));
  const PAR_JOUR = 4, reserve = [];
  dus.forEach(({ c, e }) => {
    const it = { t: 'Visiter ' + c.nom, d: e.rappel ? 'Tu avais prévu de le rappeler' : e.jours == null ? 'Jamais visité : premier contact' : 'Dernière visite il y a ' + e.jours + ' j', href: '#/client/' + c.id, tag: 'Visite' };
    const g = jours.find(j => plan[j].filter(x => x.tag === 'Visite').length < PAR_JOUR); if (g) plan[g].push(it); else reserve.push(it);
  });
  return { jours, plan, reserve, nbPar: PAR_JOUR };
}
async function pageFeuille() {
  const [dv, cl, pt] = [await getAll('devis'), await getAll('clients'), await get('meta', 'point')], now = new Date(), pc = await lirePC();
  const P = planSemaine(dv, cl, now), SW = semaineObj(dv, now), obj = objectifDuMois(now), per = periodePoint('semaine', now);
  const chg = pt && pt.changements && pt.changements['semaine:' + per.fin], libChg = chg && chg.k ? (chg.k === 'autre' ? (chg.autre || 'Autre') : libChangement(chg.k)) : '';
  const NJ = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], lab = j => { const x = new Date(j + 'T12:00:00'); return NJ[x.getDay()][0].toUpperCase() + NJ[x.getDay()].slice(1) + ' ' + String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0'); };
  const texte = () => ['FEUILLE DE ROUTE · semaine du ' + dateFr(P.jours[0] + 'T12:00:00'), SW.cible ? 'Objectif de la semaine : ' + eur(SW.cible) + (obj ? ' (mois : ' + eur(obj.cents) + ')' : '') : '', libChg ? 'Mon changement : ' + libChg : '', ...P.jours.flatMap(j => ['', lab(j).toUpperCase(), ...(P.plan[j].length ? P.plan[j].map(x => '- ' + x.t) : ['- (libre)'])]), P.reserve.length ? '\nEN RÉSERVE : ' + P.reserve.map(x => x.t.replace('Visiter ', '')).join(', ') : ''].filter(x => x !== '').join('\n');
  montrer('Feuille de route', h('div', { class: 'carte obj hero' }, h('strong', {}, 'Semaine du ' + dateFr(P.jours[0] + 'T12:00:00')),
      SW.cible ? h('div', { class: 'gros-chiffre' }, eur(SW.cible), h('span', {}, ' à faire cette semaine' + (SW.derive ? ' (déduit du mois)' : ''))) : h('p', {}, 'Aucune cible : règle ton objectif dans Réglages.'),
      libChg ? h('p', {}, 'Mon changement de la semaine : ', h('strong', {}, libChg)) : h('p', { class: 'mut' }, 'Pas de changement choisi au Point. ', h('a', { href: '#/point' }, 'Faire le Point'))),
    pc ? h('div', { class: 'carte' }, h('strong', {}, 'Envoyé par le PC (plan reçu le ' + dateFr(pc.recuLe || pc.date) + ')'), pc.changement ? h('p', {}, 'Changement proposé : ', h('strong', {}, pc.changement.texte)) : null,
      pc.actions.length ? pc.actions.slice(0, 40).map(x => h('a', { class: 'ligne', href: x.client ? '#/clients' : '#/pc', style: 'color:inherit;text-decoration:none' }, h('span', { class: 'g' }, h('strong', {}, x.t), h('br'), h('small', {}, (/^\d{4}-\d\d-\d\d$/.test(x.jour || '') ? lab(x.jour) + ' · ' : '') + (x.d || ''))), h('span', { class: 'tag' }, x.tag || 'PC'))) : h('p', { class: 'mut' }, 'Aucune action.'),
      h('p', { class: 'mut' }, 'Ce plan croise ta sauvegarde et l’export EBP du ' + (/^\d{4}-\d\d-\d\d$/.test(pc.arrete || '') ? dateFr(pc.arrete + 'T12:00:00') : '?') + '. Il n’est pas en direct.')) : null,
    P.jours.map(j => h('div', { class: 'carte' }, h('strong', {}, lab(j) + (j === jourLocal(now) ? ' · aujourd’hui' : '')),
      P.plan[j].length ? P.plan[j].map(x => h('a', { class: 'ligne', href: x.href, style: 'color:inherit;text-decoration:none' }, h('span', { class: 'g' }, h('strong', {}, x.t), h('br'), h('small', {}, x.d)), h('span', { class: 'tag' }, x.tag))) : h('p', { class: 'mut' }, 'Rien de prévu : place un garage à prospecter.'))),
    P.reserve.length ? h('div', { class: 'carte' }, h('strong', {}, 'En réserve (' + P.reserve.length + ')'), h('p', { class: 'mut' }, 'Garages dus mais qui ne tiennent pas dans la semaine (' + P.nbPar + ' visites par jour max : hypothèse à valider).'), P.reserve.slice(0, 15).map(x => h('a', { class: 'ligne', href: x.href, style: 'color:inherit;text-decoration:none' }, h('span', { class: 'g' }, h('strong', {}, x.t.replace('Visiter ', ''))), h('span', {}, '›')))) : null,
    h('p', { class: 'mut' }, 'À valider : le rythme de visite (14/30/90 jours) et le nombre de visites par jour sont des hypothèses. Le plan répartit par urgence, pas par trajet : l’appli ne connaît pas les distances.'),
    h('div', { class: 'actions' }, h('a', { class: 'btn', href: 'https://wa.me/?text=' + encodeURIComponent(texte()), target: '_blank', rel: 'noopener' }, 'Envoyer par WhatsApp'), h('button', { class: 'btn sec', onclick: () => window.print() }, 'Imprimer')));
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
const coord = (v, max) => { const x = parseFloat(v); return isFinite(x) && Math.abs(x) <= max ? x : null; };
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
    lat: coord(s.latitude, 90), lng: coord(s.longitude, 180),
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
// ---------- plan d'action : rythme de visite, échéance, tournée du jour ----------
const RYTHMES = { A: 14, B: 30, C: 90 };
const JOUR = 864e5;
const aujourdhui = () => jourLocal(new Date());
const rythmeJours = c => (Number(c.rythme) > 0 ? Math.min(365, Math.round(Number(c.rythme))) : (RYTHMES[c.priorite] || 0));
const derniereVisite = c => (Array.isArray(c.visites) ? c.visites : []).reduce((m, v) => (v && v.res === 'vu' && typeof v.date === 'string' && v.date > m ? v.date : m), '');
// pct = jours écoulés depuis la dernière visite / rythme. Jamais visité = 999 (à faire en premier).
function echeance(c, now = Date.now()) {
  const r = rythmeJours(c);
  if (!r) return null;
  const dv = derniereVisite(c);
  const rappel = typeof c.rappel === 'string' && /^\d{4}-\d\d-\d\d$/.test(c.rappel) && c.rappel <= jourLocal(now);
  const jours = dv ? Math.max(0, ecartJours(dv, now)) : null;
  const pct = dv ? Math.round(jours / r * 100) : 999;
  const reporte = typeof c.reporteAu === 'string' && /^\d{4}-\d\d-\d\d$/.test(c.reporteAu) && c.reporteAu > jourLocal(now);
  return { r, jours, pct, rappel, reporte, du: !reporte && (rappel || pct >= 100) };
}
const km = (a, b) => {
  const R = 6371, rad = x => x * Math.PI / 180, dLa = rad(b.lat - a.lat), dLo = rad(b.lng - a.lng);
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const posClient = c => (c.ent && c.ent.lat != null && c.ent.lng != null) ? { lat: c.ent.lat, lng: c.ent.lng } : null;
// Plus proche voisin depuis l'origine : simple, pas optimal, mais lisible. Sans position : à la fin.
function ordonner(liste, origine) {
  const avec = liste.filter(posClient), sans = liste.filter(c => !posClient(c)), out = [];
  let cur = origine || (avec[0] && posClient(avec[0]));
  const reste = avec.slice();
  while (reste.length) {
    let bi = 0, bd = Infinity;
    reste.forEach((c, i) => { const d = km(cur, posClient(c)); if (d < bd) { bd = d; bi = i; } });
    const c = reste.splice(bi, 1)[0]; out.push(c); cur = posClient(c);
  }
  return out.concat(sans);
}
function urlItineraire(liste) {
  const pts = liste.map(posClient).filter(Boolean).slice(0, 10);
  if (!pts.length) return null;
  const f = p => p.lat.toFixed(6) + ',' + p.lng.toFixed(6);
  const dest = pts[pts.length - 1], via = pts.slice(0, -1);
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + f(dest) + (via.length ? '&waypoints=' + via.map(f).join('%7C') : '');
}
// ----- tournée suivie : plan du jour, résultat par garage, reports -----
const lireTournees = async () => { const v = await get('meta', 'tournees'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const ecrireTournees = async t => { const k = Object.keys(t).sort(); k.slice(0, Math.max(0, k.length - 120)).forEach(x => delete t[x]); await put('meta', t, 'tournees'); };
function prochainOuvre(d = new Date()) { const x = new Date(d); x.setHours(12, 0, 0, 0); do { x.setDate(x.getDate() + 1); } while (!estOuvre(x)); return jourLocal(x); }
const statsTournee = t => { const ids = Array.isArray(t && t.ids) ? t.ids : [], r = (t && t.res) || {}; const n = k => ids.filter(i => r[i] === k).length;
  return { prevus: ids.length, vus: n('vu'), absents: n('absent'), reportes: n('reporte') + n('auto'), faits: n('vu') + n('absent'), restants: ids.filter(i => !r[i]).length }; };
async function marquerVisite(c, res, dateReport) {
  if (!Array.isArray(c.visites)) c.visites = [];
  const jour = aujourdhui();
  if (res === 'vu' || res === 'absent') {
    c.visites.push({ date: jour, res, note: '' }); if (c.visites.length > 100) c.visites = c.visites.slice(-100);
    if (res === 'vu') { c.rappel = ''; c.reporteAu = ''; c.reports = 0; } else { c.rappel = jourLocal(Date.now() + 2 * JOUR); }
  } else { c.reporteAu = dateReport || prochainOuvre(); c.reports = (Number(c.reports) || 0) + 1; }
  await putMany('clients', [c]);
}
async function pageTournee() {
  const cl = await getAll('clients'), parId = new Map(cl.map(c => [c.id, c]));
  const T = await lireTournees(), auj = jourLocal(new Date()), plan = T[auj];
  const repetes = cl.filter(c => (Number(c.reports) || 0) >= 3);
  const alerteRep = repetes.length ? h('div', { class: 'carte alerte' }, h('strong', {}, '🔁 Reportés 3 fois ou plus : '), repetes.map(c => c.nom).join(', '), h('br'), h('small', {}, 'Souhaites-tu les voir en priorité, ou baisser leur priorité sur la fiche ?')) : null;
  if (plan && Array.isArray(plan.ids) && plan.ids.length) {
    const st = statsTournee(plan), r = plan.res || (plan.res = {});
    const sauver = async () => { T[auj] = plan; await ecrireTournees(T); };
    const tags = { vu: ['Vu', 'ok'], absent: ['Absent', 'warn'], reporte: ['Reporté', 'warn'], auto: ['Reporté (fin de journée)', 'warn'] };
    // Une ligne compacte par garage : nom, commune, heure si rendez-vous, bouton Visite ; le détail s'ouvre au toucher du nom.
    const ligne = id => {
      const c = parId.get(id); if (!c) return null;
      const etat = r[id], heure = plan.rdv && plan.rdv[id], dateR = h('input', { type: 'date', value: prochainOuvre(), 'aria-label': 'Reporter ' + c.nom + ' au' });
      const agir = async (res) => { await marquerVisite(c, res, res === 'reporte' ? dateR.value : ''); r[id] = res; await sauver(); toast(res === 'vu' ? 'Visite notée : ' + c.nom : res === 'absent' ? 'Noté absent : rappel dans 2 jours.' : 'Reporté au ' + dateFr(c.reporteAu) + '.'); pageTournee(); };
      const detail = h('div', { class: 't-detail', hidden: true },
        c.etape ? h('p', { class: 'mut' }, 'Étape prévue : ' + c.etape) : null, c.rappel ? h('p', { class: 'mut' }, 'Rappel prévu le ' + dateFr(c.rappel + 'T12:00:00')) : null,
        etat ? h('div', { class: 'actions' }, h('a', { class: 'btn sec', href: '#/client/' + c.id }, 'Fiche'), h('button', { class: 'btn sec', type: 'button', onclick: async () => { delete r[id]; await sauver(); pageTournee(); } }, 'Corriger : remettre dans la tournée'))
          : [h('div', { class: 'trio' }, h('button', { class: 'btn vert', type: 'button', onclick: () => agir('vu') }, 'Vu'), h('button', { class: 'btn ambre', type: 'button', onclick: () => agir('absent') }, 'Absent'), h('button', { class: 'btn gris', type: 'button', onclick: () => agir('reporte') }, 'Reporter')),
            h('label', { class: 'rang' }, h('span', { class: 'mut' }, 'Reporter au'), dateR), h('div', { class: 'actions' }, h('a', { class: 'btn sec', href: '#/client/' + c.id }, 'Fiche'))]);
      const nom = h('button', { class: 't-nom', type: 'button', 'aria-expanded': 'false', 'aria-label': (heure ? 'Rendez-vous ' + heure + ' · ' : '') + c.nom + ', détails', onclick: () => { const o = detail.hidden; detail.hidden = !o; nom.setAttribute('aria-expanded', String(o)); } },
        h('strong', {}, (heure ? '⏰ ' + heure + ' · ' : '') + c.nom), h('small', { class: 'mut' }, [c.ville || c.villeProspection || '', etat ? tags[etat][0] : ''].filter(Boolean).join(' · ') || ' '));
      return h('div', { class: 't-ligne' + (etat ? ' t-fait' : '') }, h('div', { class: 't-rang' }, nom, etat ? h('span', { class: 'tag ' + tags[etat][1] }, tags[etat][0]) : h('a', { class: 'btn t-visite', href: '#/visite/' + c.id + '?t=1', 'aria-label': 'Visite chez ' + c.nom }, 'Visite')), detail);
    };
    const aFaire = plan.ids.filter(id => !r[id]).map(ligne).filter(Boolean), faits = plan.ids.filter(id => r[id]).map(ligne).filter(Boolean);
    const restants = plan.ids.filter(i => !r[i]).map(i => parId.get(i)).filter(Boolean), u = urlItineraire(restants);
    const pc = Math.round((st.prevus - st.restants) / st.prevus * 100);
    montrer('Tournée',
      h('div', { class: 'carte t-resume' }, h('div', { class: 'elan-tete' }, h('strong', {}, 'Tournée du ' + dateFr(auj) + ' · ' + (st.prevus - st.restants) + '/' + st.prevus + ' traités'), h('span', { class: 'tag ' + (plan.termine ? 'ok' : 'warn') }, plan.termine ? 'Terminée' : 'En cours')),
        h('div', { class: 'piste t-piste', role: 'img', 'aria-label': pc + ' % de la tournée traitée' }, h('div', { class: 'rempli' + (st.restants ? '' : ' ok'), style: 'width:' + pc + '%' })),
        h('small', { class: 'mut' }, 'Vus ' + st.vus + ' · Absents ' + st.absents + ' · Reportés ' + st.reportes + ' · Restants ' + st.restants)),
      h('div', { class: 't-liste' }, aFaire.length ? aFaire : h('p', { class: 'vide' }, 'Tous les garages sont traités. Bravo !')),
      faits.length ? h('details', { class: 't-faits' }, h('summary', {}, 'Déjà traités (' + faits.length + ')'), faits) : null,
      h('div', { class: 'actions t-actions' }, u && restants.length ? h('a', { class: 'btn', href: u, target: '_blank', rel: 'noopener' }, '🗺 Itinéraire (' + Math.min(10, restants.filter(posClient).length) + ' arrêts)') : null,
        plan.termine ? null : h('button', { class: 'btn noir', type: 'button', onclick: async () => {
          const nd = prochainOuvre();
          for (const id of plan.ids) if (!r[id]) { const c = parId.get(id); if (c) { await marquerVisite(c, 'reporte', nd); r[id] = 'auto'; } }
          plan.termine = true; await sauver(); const s2 = statsTournee(plan);
          toast('Journée terminée : ' + s2.vus + ' vus, ' + s2.absents + ' absents, ' + s2.reportes + ' reportés au ' + dateFr(nd) + '.'); pageTournee();
        } }, 'Terminer la journée')),
      alerteRep,
      st.restants === st.prevus ? h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: async () => { delete T[auj]; await ecrireTournees(T); pageTournee(); } }, 'Refaire la sélection')) : null,
      h('p', { class: 'mut' }, '« Terminer la journée » reporte les garages restants au prochain jour ouvré ; tu pourras les corriger ensuite.'), h('div', { style: 'height:84px' }));
    return;
  }
  const dues = cl.map(c => ({ c, e: echeance(c) })).filter(x => x.e && x.e.du).sort((a, b) => (b.e.rappel - a.e.rappel) || (b.e.pct - a.e.pct));
  const sansRythme = cl.filter(c => !rythmeJours(c)).length;
  let ordre = dues.map(x => x.c), coches = new Set(ordre.slice(0, 8).map(c => c.id)), origine = null;
  const zone = h('div'), itin = h('div');
  const dessiner = () => {
    zone.replaceChildren(...ordre.map(c => {
      const e = echeance(c), pos = !!posClient(c);
      const cb = h('input', { type: 'checkbox', checked: coches.has(c.id), 'aria-label': 'Visiter ' + c.nom, style: 'width:28px;min-height:28px;flex:none', onchange: () => { cb.checked ? coches.add(c.id) : coches.delete(c.id); majItin(); } });
      return h('label', { class: 'ligne', style: 'display:flex;gap:12px;align-items:center;margin:0;color:inherit;font-size:inherit' }, cb,
        h('span', { class: 'g' }, h('strong', {}, c.nom), h('br'),
          h('small', {}, (e.rappel ? 'À rappeler · ' : '') + (e.jours == null ? 'jamais visité' : 'dernière visite il y a ' + e.jours + ' j') + ' · échéance ' + (e.pct >= 999 ? '—' : e.pct + ' %') + ((Number(c.reports) || 0) ? ' · reporté ' + c.reports + ' fois' : '') + (pos ? '' : ' · sans position'))),
        h('a', { href: '#/client/' + c.id, class: 'btn sec', 'aria-label': 'Fiche de ' + c.nom }, 'Fiche'));
    }));
    majItin();
  };
  const majItin = () => {
    const sel = ordre.filter(c => coches.has(c.id));
    itin.replaceChildren(...[sel.length ? h('button', { class: 'btn gros', onclick: async () => {
      T[auj] = { ids: ordre.filter(c => coches.has(c.id)).map(c => c.id), res: {}, debut: new Date().toISOString(), termine: false }; await ecrireTournees(T); toast('Tournée démarrée : ' + T[auj].ids.length + ' garages.'); pageTournee();
    } }, '▶ Démarrer ma tournée (' + sel.length + ')') : h('p', { class: 'mut' }, 'Coche au moins un garage.'),
      sel.length > 10 ? h('p', { class: 'mut' }, 'Google Maps accepte 10 arrêts maximum : l’itinéraire prendra les 10 premiers.') : null].filter(Boolean));
  };
  const bPos = h('button', { class: 'btn sec', onclick: () => {
    if (!navigator.geolocation) { toast('Position indisponible sur ce navigateur.', true); return; }
    bPos.disabled = true;
    navigator.geolocation.getCurrentPosition(p => {
      origine = { lat: p.coords.latitude, lng: p.coords.longitude };
      ordre = ordonner(ordre, origine); coches = new Set(ordre.slice(0, 8).map(c => c.id)); dessiner(); bPos.disabled = false; toast('Rangés du plus proche au plus loin.');
    }, () => { bPos.disabled = false; toast('Position refusée : ordre par urgence conservé.', true); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  } }, '📍 Ranger depuis ma position');
  const hier = Object.keys(T).filter(k => k < auj).sort().pop(), bilanHier = hier ? statsTournee(T[hier]) : null;
  montrer('Tournée',
    bilanHier ? h('p', { class: 'mut' }, 'Dernière tournée (' + dateFr(hier) + ') : ' + (bilanHier.faits) + '/' + bilanHier.prevus + ' traités, ' + bilanHier.reportes + ' reporté(s).') : null,
    alerteRep,
    h('p', { class: 'mut' }, dues.length ? dues.length + ' à visiter ou à relancer. Les 8 plus urgents sont cochés : ajuste, puis démarre.' : 'Rien à faire aujourd’hui.'),
    sansRythme ? h('div', { class: 'carte alerte' }, sansRythme + ' client(s) sans priorité A/B/C : ils n’apparaissent jamais ici. Ouvre leur fiche pour fixer le rythme.') : null,
    dues.length ? h('div', { class: 'actions' }, bPos) : null, zone, itin,
    h('p', { class: 'mut' }, 'Rythme par défaut : A = 14 jours, B = 30 jours, C = 90 jours (hypothèses, à ajuster). Ta position n’est ni enregistrée ni envoyée : elle sert seulement à classer la liste.'));
  dessiner();
}
// ----- Lot 3 (14/11/2026) : WhatsApp commercial manuel depuis la fiche garage -----
// Aucun envoi automatique : le lien ouvre WhatsApp avec le message prérempli, l'envoi reste un geste du commercial.
// Le journal du garage (c.contacts) ne note que « WhatsApp ouvert » ; la relance programmée devient le rappel du garage
// (actions du jour, tournée) sans jamais avancer un rappel déjà prévu plus tôt.
function carteWhatsApp(c, pack) {
  const W = ODICOLOR_WA, num = W.normaliser(c.tel, S.indicatif), auj = aujourdhui();
  const histo = h('div', { class: 'wa-histo' }), editeur = h('div', { class: 'wa-editeur', hidden: true });
  const dessinerHisto = () => {
    const l = (Array.isArray(c.contacts) ? c.contacts : []).filter(x => x && x.canal === 'whatsapp').slice(-3).reverse();
    histo.replaceChildren(...l.map(x => h('small', { class: 'mut', style: 'display:block' }, dateFr(x.jour + 'T12:00:00') + ' · ' + W.libelleStatut(x.statut) + (x.relance ? ' · relance le ' + dateFr(x.relance + 'T12:00:00') : ''))));
  };
  if (!num.ok) return h('section', { class: 'carte v49-wa' }, h('button', { class: 'btn sec', disabled: true, style: 'min-height:72px;width:100%' }, 'WhatsApp'), h('small', { class: 'mut' }, num.motif + ' — corrige le téléphone dans « Profil ».'), histo);
  const vals = { contact: c.contactNom || '', garage: c.nom, vendeur: S.vendeur || '', societe: S.societe || 'Odicolor' };
  let modele = (Array.isArray(c.contacts) && c.contacts.some(x => x && x.canal === 'whatsapp')) ? 'relance' : 'presentation';
  const texte = h('textarea', { rows: 4, maxlength: 1500, 'aria-label': 'Message WhatsApp' }, W.rediger(modele, vals));
  const choix = h('div', { class: 'trio wa-modeles' }, Object.entries(W.MODELES).map(([k, m]) => h('button', { class: 'btn sec', type: 'button', 'aria-pressed': String(k === modele), 'data-modele': k,
    onclick: ev => { modele = k; texte.value = W.rediger(k, vals); [...choix.children].forEach(b => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); } }, m.libelle)));
  const avecRelance = h('input', { type: 'checkbox', checked: true, style: 'width:24px;min-height:24px', 'aria-label': 'Programmer une relance' });
  const dateRel = h('input', { type: 'date', value: W.relanceProposee(auj), min: auj, 'aria-label': 'Date de relance' });
  const ouvrir = async () => {
    const t = clean(texte.value).slice(0, 1500); if (!t) { toast('Message vide.'); return; }
    window.open(W.lien(num.intl, t), '_blank', 'noopener');
    const rel = avecRelance.checked && /^\d{4}-\d\d-\d\d$/.test(dateRel.value) ? dateRel.value : '';
    const r = W.noterOuverture(c.contacts, { maintenant: new Date().toISOString(), jour: auj, texte: t, modele: modele, intl: num.intl, relance: rel });
    c.contacts = r.contacts;
    if (rel && (!c.rappel || c.rappel > rel || c.rappel < auj)) c.rappel = rel;
    await putMany('clients', [c]); dessinerHisto();
    toast(r.doublon ? 'WhatsApp rouvert (déjà noté aujourd’hui). L’envoi n’est pas confirmé.' : 'WhatsApp ouvert : relis et envoie toi-même.' + (rel ? ' Relance le ' + dateFr(rel + 'T12:00:00') + '.' : ''));
  };
  // Lot 4 : contenus validés dans le Studio du Bureau (importés dans Réglages → Imports), proposés selon la cible du garage.
  const contenus = W.contenusPour(c, pack);
  const choixContenu = contenus.length ? h('select', { 'aria-label': 'Contenu validé', 'data-wa': 'contenu', onchange: ev => { const x = contenus.find(y => y.id === ev.target.value); if (!x) return; modele = 'contenu:' + x.id; texte.value = x.texte; [...choix.children].forEach(b => b.setAttribute('aria-pressed', 'false')); } },
    h('option', { value: '' }, 'Contenus validés (' + contenus.length + ')'), contenus.map(x => h('option', { value: x.id }, x.marque + ' · ' + x.titre))) : null;
  editeur.append(choix, choixContenu, texte, h('label', { class: 'rang' }, avecRelance, h('span', {}, 'Relance le'), dateRel),
    h('button', { class: 'btn vert', type: 'button', style: 'min-height:72px;width:100%;font-size:1.1em', 'data-wa': 'ouvrir', onclick: ouvrir }, 'Ouvrir WhatsApp'),
    h('small', { class: 'mut' }, 'Ouvrir WhatsApp ne prouve pas l’envoi : seul « WhatsApp ouvert » est noté.'));
  dessinerHisto();
  return h('section', { class: 'carte v49-wa' },
    h('button', { class: 'btn vert', type: 'button', style: 'min-height:72px;width:100%;font-size:1.1em', 'data-wa': 'preparer', 'aria-expanded': 'false',
      onclick: ev => { editeur.hidden = !editeur.hidden; ev.currentTarget.setAttribute('aria-expanded', String(!editeur.hidden)); } }, 'WhatsApp · ' + num.affichage),
    num.avertissement ? h('small', { class: 'mut' }, num.avertissement) : null, editeur, histo);
}
async function pageClient(id) {
  const c = await get('clients', id), contenusWa = await get('meta', 'contenusWa');
  if (!c) return nonTrouve();
  const eurK = v => v == null ? '—' : Math.round(v).toLocaleString('fr-FR') + ' €';
  const verdict = h('div'), fiche = h('div'), zoneRech = h('div');
  const cabine = h('select', { 'aria-label': 'Cabine de peinture' }, ['', 'oui', 'non'].map(v => h('option', { value: v, selected: c.cabine === v }, v === '' ? 'Je ne sais pas encore' : v === 'oui' ? 'Oui, il peint chez lui' : 'Non, il ne peint pas')));
  const fourn = h('input', { value: c.fournisseur || '', placeholder: 'Ex. Roberlo, Sherwin, autre…', maxlength: 60, 'aria-label': 'Fournisseur actuel' });
  const vol = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 1000000, value: c.volume || '', placeholder: 'Estimation, en € par mois', 'aria-label': 'Achat de peinture par mois' });
  const stat = h('select', { 'aria-label': 'Statut' }, [['prospect', 'Prospect'], ['client', 'Client']].map(([v, l]) => h('option', { value: v, selected: (c.statutCrm || 'prospect') === v }, l)));
  const prio = h('select', { 'aria-label': 'Priorité' }, [['', 'Pas de plan'], ['A', 'A : à voir souvent'], ['B', 'B : mensuel'], ['C', 'C : trimestriel']].map(([v, l]) => h('option', { value: v, selected: (c.priorite || '') === v }, l)));
  const rythme = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 365, value: c.rythme || '', placeholder: 'Facultatif : tous les … jours', 'aria-label': 'Rythme en jours' });
  const cNom = h('input', { value: c.contactNom || '', maxlength: 60, placeholder: 'Gérant ou chef d’atelier', 'aria-label': 'Contact décideur' });
  const pNom = h('input', { value: c.peintreNom || '', maxlength: 60, placeholder: 'Peintre qui utilisera le produit', 'aria-label': 'Contact peintre' });
  const etape = h('input', { value: c.etape || '', maxlength: 100, placeholder: 'Ex. rappeler vendredi, apporter un échantillon', 'aria-label': 'Prochaine étape' });
  const etapeD = h('input', { type: 'date', value: /^\d{4}-\d\d-\d\d$/.test(c.etapeDate || '') ? c.etapeDate : jourLocal(new Date()), 'aria-label': 'Date de la prochaine étape' });
  const conv = h('select', { 'aria-label': 'Étape commerciale' }, CONV.map(([v, l]) => h('option', { value: v, selected: (c.conv || '') === v }, l)));
  const exRob = h('input', { type: 'checkbox', checked: !!c.exRoberlo, style: 'width:24px;min-height:24px', 'aria-label': 'Ancien client Roberlo' });
  const forma = h('input', { type: 'checkbox', checked: !!c.formation, style: 'width:24px;min-height:24px', 'aria-label': 'Démo ou formation proposée' });
  const essaisBox = h('div'), devisBox = h('div');
  const bloc = h('div');
  const dessinerEssais = () => {
    const es = Array.isArray(c.essais) ? c.essais : [];
    essaisBox.replaceChildren(...(es.length ? es.slice().reverse().map(e => {
      const st2 = h('select', { 'aria-label': 'Résultat de l’essai' }, ESSAI_ST.map(([v, l]) => h('option', { value: v, selected: e.statut === v }, l)));
      st2.addEventListener('change', async () => { e.statut = st2.value; if (e.statut === 'commande') { c.conv = 'converti'; e.commandeLe = e.commandeLe || new Date().toISOString(); } await putMany('clients', [c]); toast('Essai mis à jour.'); });
      const sv = Array.isArray(e.suivis) ? e.suivis : (e.suivis = []);
      const suiv = k => h('button', { class: 'btn sec', disabled: sv.includes(k), onclick: async () => { sv.push(k); await putMany('clients', [c]); dessinerEssais(); } }, sv.includes(k) ? k + ' fait' : 'Appel ' + k + ' fait');
      return h('div', { class: 'carte' }, h('strong', {}, (e.produit || 'Produit') + ' · ' + dateFr(e.date)), st2, h('div', { class: 'actions' }, suiv('J2'), suiv('J7')));
    }) : [h('p', { class: 'vide' }, 'Aucun essai.')]));
  };
  const prodEssai = h('input', { maxlength: 60, placeholder: 'Produit testé (ex. vernis, apprêt)', 'aria-label': 'Produit de l’essai' });
  const dessinerVisites = () => {
    const e = echeance(c), vs = (Array.isArray(c.visites) ? c.visites : []).slice(-5).reverse();
    bloc.replaceChildren(h('div', { class: 'carte' }, e ? h('div', {}, h('strong', {}, 'Rythme ' + e.r + ' j'), ' · ', e.jours == null ? 'jamais visité' : 'vu il y a ' + e.jours + ' j (' + e.pct + ' %)', e.du ? h('span', { class: 'tag warn', style: 'margin-left:8px' }, 'À faire') : null) : h('small', { class: 'mut' }, 'Pas de plan : choisis une priorité pour qu’il apparaisse dans la Tournée.'),
      c.rappel ? h('div', {}, h('small', {}, 'Rappel prévu : ' + dateFr(c.rappel))) : null,
      vs.length ? vs.map(v => h('div', {}, h('small', {}, dateFr(v.date) + ' · ' + ({ vu: 'Vu', absent: 'Absent', rappeler: 'À rappeler' }[v.res] || '?') + (v.note ? ' · ' + v.note : '')))) : null));
  };
  const noterVisite = async (res) => {
    lire(); if (!Array.isArray(c.visites)) c.visites = [];
    const note = clean(notes.value).slice(0, 80);
    const jour = aujourdhui();
    c.visites.push({ date: jour, res, note });
    if (c.visites.length > 100) c.visites = c.visites.slice(-100);
    if (res === 'vu') { c.rappel = ''; c.reporteAu = ''; c.reports = 0; }
    else { const d = new Date(Date.now() + (res === 'absent' ? 2 : 7) * JOUR); c.rappel = jourLocal(d); }
    await putMany('clients', [c]); dessinerVisites(); toast(res === 'vu' ? 'Visite notée.' : 'Noté. Rappel le ' + dateFr(c.rappel) + '.');
  };
  const notes = h('textarea', { rows: 3, maxlength: 500, placeholder: 'Contact, visite, ce qu’il a dit…', 'aria-label': 'Notes' }, c.notes || '');
  const lire = () => { c.cabine = cabine.value; c.fournisseur = clean(fourn.value).slice(0, 60); c.volume = Math.max(0, Math.min(1e6, Number(vol.value) || 0)) || ''; c.statutCrm = stat.value; c.priorite = prio.value; c.rythme = Math.max(0, Math.min(365, Math.round(Number(rythme.value) || 0))) || ''; c.notes = notes.value.slice(0, 500); c.contactNom = clean(cNom.value).slice(0, 60); c.peintreNom = clean(pNom.value).slice(0, 60); c.etape = clean(etape.value).slice(0, 100); c.etapeDate = c.etape && /^\d{4}-\d\d-\d\d$/.test(etapeD.value) ? etapeD.value : ''; c.conv = conv.value; c.exRoberlo = exRob.checked; c.formation = forma.checked; };
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
  getAll('devis').then(ds => { const mine = ds.filter(d => d.clientId === c.id).sort((a, b) => b.id - a.id); devisBox.replaceChildren(...(mine.length ? mine.map(d => { const [lib, cls] = etiquetteDevis(d); return h('a', { class: 'ligne', href: '#/devis/' + d.id, style: 'color:inherit;text-decoration:none' }, h('span', { class: 'g' }, numero(d) + ' · ' + dateFr(d.creeLe)), h('span', { class: 'prix' }, eur(totaux(d).ht), h('br'), h('span', { class: 'tag ' + cls }, lib))); }) : [h('p', { class: 'vide' }, 'Aucun devis.')])); });
  [prio, rythme].forEach(x => x.addEventListener('input', () => { lire(); dessinerVisites(); }));
  const bRech = h('button', { class: 'btn', onclick: () => rechercher(bRech) }, c.ent ? '🔎 Relire le registre' : '🔎 Fiche officielle (réseau)');
  const vuPC = await blocPCClient(c);
  // Fiche de visite v36 : actions visibles, détails conservés dans des panneaux.
  // Aucune suppression des données existantes (y compris l'ancien critère c.critere).
  const facturesOuvertes=Array.isArray(c.factures)?c.factures.filter(x=>!x.regleLe):[];
  const retard= facturesOuvertes.filter(x=>enRetard(x)).length;
  const etatCompte=(c.compte&&c.compte.statut)||'non renseigné';
  const attentionCompte=etatCompte==='bloque'||retard>0;
  const panneau=(nom,contenu,initial=false)=>h('details',{
    class:'v36-details',open:initial
  },h('summary',{},nom),h('div',{class:'v36-details-corps'},contenu));
  const boutonSauver=h('button',{class:'btn',onclick:async()=>{
    lire();await putMany('clients',[c]);toast('Fiche client enregistrée.');
  }},'Enregistrer les informations');
  const boutonPlan=h('button',{class:'btn',onclick:async()=>{
    lire();await putMany('clients',[c]);dessinerVisites();toast('Plan de visites enregistré.');
  }},'Enregistrer le rythme');
  const boutonAction=h('button',{class:'btn vert',onclick:async()=>{
    lire();await putMany('clients',[c]);toast('Prochaine action enregistrée.');
  }},'Enregistrer l’action');
  const boutonEtapeFaite=h('button',{class:'btn sec',onclick:async()=>{
    c.etape='';c.etapeDate='';etape.value='';etapeD.value=jourLocal(new Date());
    await putMany('clients',[c]);toast('Action terminée.');
  }},'Action terminée');
  const groupeCompte=panneau('Compte et règlements'+
    (etatCompte!=='non renseigné'?' · '+etatCompte:'')+
    (retard?' · '+retard+' à vérifier':''),
    blocCompte(c,()=>putMany('clients',[c])),attentionCompte);
  // Le dossier N+1 est le parcours unique de vérification d'un nouveau prospect.
  // Garder ici l'avis commercial, sans présenter deux recherches officielles identiques.
  const groupeEntreprise=c.statutCrm==='prospect'
    ? panneau('Analyse commerciale du prospect',[
      h('p',{class:'mut'},'Vérification SIREN, état officiel et ouverture de compte : dans le dossier N+1 du prospect.'),
      verdict
    ])
    : panneau('Identité officielle et analyse commerciale',[
      h('div',{class:'actions'},bRech),zoneRech,fiche,verdict,
      h('p',{class:'mut'},'La recherche au registre public n’est effectuée qu’à ta demande.')
    ]);
  const groupeProfil=panneau('Profil, contacts et qualification',[
    h('label',{},'A-t-il une cabine de peinture ?'),cabine,
    h('label',{},'Fournisseur actuel'),fourn,
    h('label',{},'Achat de peinture par mois (€) · estimation'),vol,
    h('label',{},'Statut du garage'),stat,
    h('label',{},'Décideur (gérant ou chef d’atelier)'),cNom,
    h('label',{},'Peintre'),pNom,
    h('label',{style:'display:flex;gap:10px;align-items:center'},forma,'Démo ou formation proposée'),
    h('label',{style:'display:flex;gap:10px;align-items:center'},exRob,'Ancien client Roberlo'),
    h('label',{},'Étape de conversion'),conv,
    h('label',{},'Notes générales'),notes,
    boutonSauver
  ]);
  const groupeEssais=panneau('Essais produits',[
    essaisBox,
    h('div',{class:'actions'},prodEssai,
      h('button',{class:'btn',onclick:async()=>{
        lire();
        if(!Array.isArray(c.essais))c.essais=[];
        c.essais.push({id:nouvelUid(),date:aujourdhui(),
          produit:clean(prodEssai.value).slice(0,60),
          statut:'encours',suivis:[]});
        if(!c.conv||c.conv==='cible'||c.conv==='contacte')c.conv='essai';
        await putMany('clients',[c]);
        prodEssai.value='';conv.value=c.conv;dessinerEssais();
        toast('Essai lancé : rappels à J+2 et J+7.');
      }},'Lancer un essai')),
    h('p',{class:'mut'},'Les rappels d’essai sont indicatifs. Vérifie le résultat avec le peintre.')
  ]);
  const groupeVisites=panneau('Historique et fréquence des visites',[
    h('label',{},'Priorité du garage'),prio,
    h('label',{},'Rythme personnalisé (jours)'),rythme,
    bloc,boutonPlan
  ]);
  const groupeDevis=panneau('Historique des devis',devisBox);
  montrer(c.nom,
    h('p',{class:'mut v36-contact'},c.tel||'Téléphone non renseigné'),
    c.compte&&c.compte.statut==='bloque'?
      h('div',{class:'bandeau-ko'},'COMPTE BLOQUÉ · vérifier avant toute commande'):null,
    h('div',{class:'trio v36-rapide'},
      h('button',{class:'btn v36-devis',onclick:()=>creerDevis(c)},'+ Devis'),
      c.tel?h('a',{class:'btn sec',href:'tel:'+String(c.tel).replace(/[^0-9+]/g,'')},'Appeler'):
        h('button',{class:'btn sec',disabled:true},'Appeler'),
      h('a',{class:'btn sec',href:'#/signaler/'+c.id},'Incident')),
    carteWhatsApp(c, contenusWa),
    h('section',{class:'carte v36-prochaine'},
      h('strong',{},'Prochaine action'),
      h('label',{},'À faire'),etape,
      h('label',{},'Quand ?'),etapeD,
      h('div',{class:'actions'},boutonAction,boutonEtapeFaite)),
    h('section',{class:'carte v36-visite'},
      h('strong',{},'Terminer la visite'),
      h('div',{class:'actions'},
        h('button',{class:'btn',onclick:()=>noterVisite('vu')},'Vu aujourd’hui'),
        h('button',{class:'btn sec',onclick:()=>noterVisite('absent')},'Absent'),
        h('button',{class:'btn sec',onclick:()=>noterVisite('rappeler')},'À rappeler'))),
    groupeCompte,
    vuPC?panneau('Opportunités · analyse EBP',vuPC):null,
    groupeDevis,
    groupeEntreprise,
    groupeProfil,
    groupeEssais,
    groupeVisites);

  dessinerFiche(); dessinerVerdict(); dessinerVisites(); dessinerEssais();
}
async function pageClients() {
  const cl = (await getAll('clients')).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  montrer('Clients',
    h('p', { class: 'mut' }, cl.length + ' client(s) sur ce téléphone.'),
    cl.map(c => h('div', { class: 'ligne' }, h('span', { class: 'g' }, h('strong', {}, c.nom), c.tel ? h('br') : null, c.tel ? h('small', {}, c.tel) : null),
      h('span', { class: 'rapide' },
        h('a', { class: 'btn sec', href: '#/client/' + c.id }, 'Fiche'),
        h('button', { class: 'btn sec', onclick: () => creerDevis(c) }, 'Devis')))));
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
async function pageArticle(codeBrut) {
  let code; try { code = decodeURIComponent(codeBrut); } catch (e) { return nonTrouve(); }
  const a = CAT.find(x => x.code === code);
  if (!a) return nonTrouve();
  const ttc = ht => ht + hup(BigInt(ht) * BigInt(S.tva100), 10000n);
  const rems = [0, 10, 20, 30, 40, 50, 55, 60].filter(r => r * 100 <= S.remiseMax100);
  montrer('Article',
    h('div', { class: 'carte' }, h('strong', {}, a.des), h('br'), h('small', {}, 'Code ' + a.code)),
    h('div', { class: 'carte' }, h('div', { class: 'ligne' }, h('span', { class: 'g' }, 'Prix HT'), h('span', { class: 'prix' }, eur(a.pu))),
      h('div', { class: 'ligne' }, h('span', { class: 'g' }, 'Prix TTC (TVA ' + pct(S.tva100) + ' %)'), h('span', { class: 'prix' }, eur(ttc(a.pu))))),
    h('h2', {}, 'Prix après remise (1 unité)'),
    rems.map(r => { const ht = r ? ligneTotal({ q: 100, pu: a.pu, r: r * 100 }) : a.pu; return h('div', { class: 'ligne' }, h('span', { class: 'g' }, r ? '- ' + r + ' %' : 'Sans remise'), h('span', { class: 'prix' }, eur(ht) + ' HT')); }),
    h('p', { class: 'mut' }, 'Calcul : arrondi au centime, TVA réglable dans Réglages. Pas de prix d’achat ni de marge sur ce téléphone.'),
    h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/nouveau' }, 'Nouveau devis'), h('button', { class: 'btn sec', onclick: () => history.back() }, 'Retour')));
}
async function pageCatalogue() {
  const rapport = await get('meta', 'rapport_articles');
  const res = h('div');
  const q = h('input', { type: 'search', placeholder: 'Chercher : code ou désignation…', 'aria-label': 'Chercher dans le catalogue', autocomplete: 'off' });
  q.addEventListener('input', () => {
    const r = chercher(q.value, 30);
    res.replaceChildren(...(q.value.trim() ? (r.length ? r.map(a => h('a', { class: 'ligne', href: '#/article/' + encodeURIComponent(a.code), style: 'color:inherit;text-decoration:none' }, h('span', { class: 'g' }, h('strong', {}, a.des), h('br'), h('small', {}, a.code)), h('span', { class: 'prix' }, eur(a.pu)))) : [h('p', { class: 'vide' }, 'Aucun article trouvé.')]) : []));
  });
  montrer('Catalogue',
    h('p', { class: 'mut' }, CAT.length + ' article(s). Pas de gestion de stock. Pas de prix d’achat ni de marge sur ce téléphone.'),
    q, res,
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
    if(location.hash==='#/reglages')location.hash='#/catalogue';
    await pageCatalogue();
  } else {
    const ex = await getAll('clients'); // Conserver tous les établissements homonymes.
    r = importerClients(rows, debut, map, ex);
    await putMany('clients', r.items);
    if(location.hash==='#/reglages')location.hash='#/clients';
    await pageClients();
    app.prepend(rapportNode('Import clients : ' + nomFichier, r.rep));
  }
}

// ---------- devis ----------
const tel2wa = t => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0') && d.length === 10) d = (S.indicatif || '33') + d.slice(1); return d; };
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
    devis: liste.map(d => ({ uid: d.uid, date: d.creeLe, t1: d.t1 || null, t2: d.t2 || null, statut: (d.statut === 'accepte' || d.statut === 'refuse') ? 'envoye' : d.statut, reponse: d.statut, notes: d.notes || '', client: { nom: d.clientNom, tel: (clients.get(d.clientId) || {}).tel || '' },
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
    h('details', { class: 'v32-options-devis' },
      h('summary', {}, 'Options du devis'),
      h('p', { class: 'mut' }, 'Un nouveau brouillon reprend articles, quantités et remises. Les prix sont actualisés uniquement pour les références encore présentes dans le catalogue.'),
      h('button', { class: 'btn sec', onclick: () => {
        if(!d.lignes.length){toast('Ce devis est vide : rien à réutiliser.',true);return;}
        const absents=d.lignes.filter(l=>!CAT.some(a=>a.code===l.code));
        const precision=absents.length
          ? ' ATTENTION : '+absents.length+' référence(s) absente(s) du catalogue : leurs anciens prix seront conservés et devront être vérifiés.'
          : '';
        if (confirm('Créer un nouveau brouillon avec les mêmes articles et quantités ?'+precision)) dupliquer(d);
      } }, 'Réutiliser ce devis')),
    d.statut === 'envoye' && d.lignes.length ? h('div', { class: 'trio' },
      h('button', { class: 'btn vert', onclick: async () => { d.statut = 'accepte'; d.reponseLe = new Date().toISOString(); if (client && client.conv && client.conv !== 'converti') { client.conv = 'converti'; await putMany('clients', [client]); } await sauver(); toast('Devis accepté.'); pageDevis(id); } }, 'Accepté'),
      h('button', { class: 'btn ambre', onclick: async () => { d.relanceLe = new Date().toISOString(); await sauver(); window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent('Bonjour, avez-vous pu regarder le devis ' + numero(d) + ' (' + eur(totaux(d).ht) + ' HT) ? Je reste à votre disposition.'), '_blank', 'noopener'); pageDevis(id); } }, 'À relancer'),
      h('button', { class: 'btn gris', onclick: async () => { d.statut = 'refuse'; d.reponseLe = new Date().toISOString(); await sauver(); toast('Devis noté refusé.'); pageDevis(id); } }, 'Refusé')) : null,
    h('button', { class: 'btn ' + (verrou ? 'sec' : ''), disabled: !verrou && !d.lignes.length, onclick: async () => { if (!verrou) fini(); if (verrou) { d.statut = 'brouillon'; delete d.reponseLe; } else d.statut = 'envoye'; await sauver(); pageDevis(id); } }, verrou ? 'Rouvrir pour modifier' : 'Marquer comme envoyé'),
    h('button', { class: 'btn danger', onclick: async () => { if (confirm('Supprimer ce devis ?')) { await del('devis', id); location.hash = '#/'; } } }, 'Supprimer'));
  montrer(numero(d),
    h('div', { class: 'ecran' },
      client && client.compte && client.compte.statut === 'bloque' ? h('div', { class: 'bandeau-ko' }, 'COMPTE BLOQUÉ : commande seulement contre règlement au comptant.') : null,
      d.statut === 'refuse' ? (() => { const m = h('select', { 'aria-label': 'Motif du refus' }, MOTIFS_REFUS.map(([v, l]) => h('option', { value: v, selected: (d.motifRefus || '') === v }, l))); m.addEventListener('change', async () => { d.motifRefus = m.value; await sauver(); toast('Motif noté.'); }); return h('div', { class: 'carte' }, h('label', {}, 'Pourquoi le client a refusé ?'), m); })() : null,
      h('div', { class: 'carte' }, h('strong', {}, d.clientNom), h('br'), h('small', {}, dateFr(d.creeLe) + ' · '), h('span', { class: 'tag ' + etiquetteDevis(d)[1] }, etiquetteDevis(d)[0])),
      verrou ? null : [rech, h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: ouvrirDictee }, '🎤 Dicter / coller une liste')), dictee, resBox],
      h('h2', {}, 'Lignes'), boite, totBox, notes, actBox,
      d.lignes.length && d.statut !== 'refuse' ? blocCommande(d, client, fini, sauver, () => pageDevis(id)) : null),
    feuille);
  dessiner(); totaliser(); lancerRech();
  if (!verrou && !d.lignes.length) setTimeout(() => rech.focus(), 50);
}

// ---------- réglages ----------
// ---------- CA facturé HT : saisie contrôlée (factures et avoirs), historique conservé ----------
async function pageCA() {
  const [magasin, cl] = [await get('meta', 'caFacture'), (await getAll('clients')).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'))];
  const auj = jourLocal(new Date()), mois = auj.slice(0, 7), m = ODICOLOR_CA.calculerMois(magasin, mois), obj = objectifDuMois(new Date());
  const type = h('select', { 'aria-label': 'Type de pièce' }, h('option', { value: 'facture' }, 'Facture'), h('option', { value: 'avoir' }, 'Avoir (déduit du CA)'));
  const num = h('input', { maxlength: 40, placeholder: 'N° de la pièce (obligatoire)', autocapitalize: 'characters', 'aria-label': 'Numéro de la pièce' });
  const dt = h('input', { type: 'date', value: auj, max: auj, 'aria-label': 'Date de la pièce' });
  const mt = h('input', { inputmode: 'decimal', placeholder: 'Montant HT en € (pas TTC)', 'aria-label': 'Montant hors taxes' });
  const cli = h('select', { 'aria-label': 'Garage (facultatif)' }, h('option', { value: '' }, 'Garage : non précisé'), cl.map(c => h('option', { value: c.id }, c.nom)));
  const msg = h('p', { class: 'mut', role: 'status' });
  const enregistrer = async confirme => {
    let cents; try { cents = parseCents(mt.value); } catch (e) { cents = null; }
    const c = cli.value ? cl.find(x => x.id === Number(cli.value)) : null;
    try {
      const nouveau = ODICOLOR_CA.ajouter(await get('meta', 'caFacture'), { type: type.value, numero: num.value, date: dt.value, montantHt: cents, clientId: c ? c.id : null, clientNom: c ? c.nom : '' }, { id: nouvelUid(), maintenant: new Date().toISOString(), auj, confirme });
      await put('meta', nouveau, 'caFacture'); toast('Pièce enregistrée.'); pageCA();
    } catch (e) {
      if (e.confirmation) { msg.textContent = ''; if (confirm(e.controle.avertissements.join('\n') + '\n\nEnregistrer quand même ?')) await enregistrer(true); }
      else { msg.textContent = e.message; msg.style.color = 'var(--ko)'; }
    }
  };
  const lignes = (magasin && magasin.entrees ? magasin.entrees : []).slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.saisiLe).localeCompare(String(a.saisiLe))).slice(0, 60).map(e =>
    h('div', { class: 'carte', style: e.annule ? 'opacity:.55' : '' },
      h('div', { class: 'elan-tete' }, h('strong', {}, (e.type === 'avoir' ? 'Avoir ' : 'Facture ') + e.numero + (e.annule ? ' · annulé(e)' : '')), h('span', {}, (e.type === 'avoir' ? '− ' : '') + eur(e.montantHt) + ' HT')),
      h('p', { class: 'mut' }, dateFr(e.date + 'T12:00:00') + (e.clientNom ? ' · ' + e.clientNom : '') + ' · saisi' + (e.type === 'avoir' ? 'e' : 'e') + ' ' + new Date(e.saisiLe).toLocaleDateString('fr-FR') + (e.annule ? ' · motif : ' + e.annule.motif : '')),
      e.annule ? null : h('button', { class: 'btn sec', type: 'button', onclick: async () => {
        const motif = prompt('Motif de l’annulation (la pièce reste dans l’historique) :'); if (!motif || !motif.trim()) return;
        try { await put('meta', ODICOLOR_CA.annuler(await get('meta', 'caFacture'), e.id, motif, { maintenant: new Date().toISOString() }), 'caFacture'); toast('Pièce annulée.'); pageCA(); } catch (er) { toast(er.message, true); }
      } }, 'Annuler cette pièce')));
  // Rattachement EXPLICITE code client EBP → garage du téléphone (jamais par le nom) : permet CA par garage et alerte de réachat.
  const codes = [...ODICOLOR_CA.parCode(magasin, '0000-01-01', '9999-12-31').values()], liesA = new Map(cl.filter(c => c.codeEbp).map(c => [c.codeEbp, c]));
  const nonLies = codes.filter(x => !liesA.has(x.code)).sort((a, b) => b.periodeCents - a.periodeCents);
  const liaisons = codes.length ? h('details', { class: 'carte', open: nonLies.length > 0 }, h('summary', {}, 'Codes clients EBP : ' + (codes.length - nonLies.length) + ' rattaché(s), ' + nonLies.length + ' à rattacher'),
    h('p', { class: 'mut' }, 'Choisis toi-même le garage : aucun rapprochement automatique par le nom.'),
    nonLies.slice(0, 40).map(x => { const sel = h('select', { 'aria-label': 'Garage pour le code ' + x.code }, h('option', { value: '' }, 'Garage…'), cl.map(c => h('option', { value: c.id }, c.nom)));
      return h('div', { class: 'carte' }, h('strong', {}, x.code + (x.nom ? ' · ' + x.nom : '')), h('p', { class: 'mut' }, x.nPieces + ' pièce(s)' + (x.derniereFacture ? ' · dernière facture ' + x.derniereFacture : '')), sel,
        h('button', { class: 'btn sec', type: 'button', onclick: async () => { const c = cl.find(y => y.id === Number(sel.value)); if (!c) { toast('Choisis un garage.', true); return; } if (c.codeEbp && c.codeEbp !== x.code && !confirm(c.nom + ' est déjà rattaché au code ' + c.codeEbp + '. Le remplacer ?')) return; c.codeEbp = x.code; await putMany('clients', [c]); toast(x.code + ' rattaché à ' + c.nom + '.'); pageCA(); } }, 'Rattacher')); }),
    [...liesA.values()].length ? h('details', {}, h('summary', {}, 'Déjà rattachés'), [...liesA.entries()].map(([code, c]) => h('p', { class: 'mut' }, code + ' → ' + c.nom))) : null) : null;
  montrer('CA facturé HT',
    h('div', { class: 'carte obj hero' }, h('small', { class: 'etiq' }, 'CA facturé HT · ' + mois), h('div', { class: 'gros-chiffre' }, ODICOLOR_CA.aDesPieces(magasin) ? eur(m.totalCents) : 'Non renseigné'),
      h('p', { class: 'mut' }, ODICOLOR_CA.aDesPieces(magasin) ? m.nFactures + ' facture(s) − ' + m.nAvoirs + ' avoir(s)' + (obj ? ' · objectif ' + eur(obj.cents) : '') : 'Aucune pièce saisie ce mois : le CA n’est pas estimé à partir des commandes.')),
    h('p', { class: 'mut' }, 'Le CA = factures HT émises moins avoirs, à leur date. Les commandes et les encaissements sont suivis à part. Un futur import EBP utilisera les mêmes règles (le numéro évite les doublons).'),
    h('div', { class: 'actions' }, h('a', { class: 'btn sec', href: '#/ca/import' }, 'Importer un export EBP (factures et avoirs HT)'), h('a', { class: 'btn sec', href: '#/clients-ebp' }, 'Importer les clients EBP (codes)')),
    h('h2', {}, 'Ajouter une pièce'), type, num, dt, mt, cli, msg,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => enregistrer(false) }, 'Enregistrer')),
    (magasin && magasin.imports && magasin.imports.length ? [h('h2', {}, 'Imports EBP'), magasin.imports.slice().reverse().map(ev => h('div', { class: 'carte', style: ev.annule ? 'opacity:.55' : '' },
      h('strong', {}, ev.fichier + (ev.annule ? ' · annulé' : '')), h('p', { class: 'mut' }, new Date(ev.le).toLocaleString('fr-FR') + ' · ' + ev.ajoutees + ' ajoutée(s), ' + ev.identiques + ' déjà présente(s), ' + ev.conflits + ' conflit(s), ' + ev.ignorees + ' ignorée(s)' + (ev.annule ? ' · motif : ' + ev.annule.motif : '')),
      ev.annule ? null : h('button', { class: 'btn sec', type: 'button', onclick: async () => {
        const motif = prompt('Motif de l’annulation de cet import (les pièces restent dans l’historique) :'); if (!motif || !motif.trim()) return;
        try { await put('meta', ODICOLOR_CA_EBP.annulerImport(await get('meta', 'caFacture'), ev.id, motif, { maintenant: new Date().toISOString() }), 'caFacture'); toast('Import annulé.'); pageCA(); } catch (er) { toast(er.message, true); }
      } }, 'Annuler cet import')))] : null),
    liaisons,
    h('h2', {}, 'Historique'), lignes.length ? lignes : h('p', { class: 'vide' }, 'Aucune pièce.'));
}

// ---------- Cockpit : priorités commerciales du jour, sur le téléphone, sans PC ----------
async function pageCockpit() {
  const [dv, cl, caStore] = [await getAll('devis'), await getAll('clients'), await get('meta', 'caFacture')];
  const now = new Date(), auj = jourLocal(now), mk = auj.slice(0, 7), om = objectifDuMois(now);
  const m = ODICOLOR_CA.calculerMois(caStore, mk), debut = new Date(now.getFullYear(), now.getMonth(), 1), fin = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23);
  const veille = new Date(now); veille.setDate(veille.getDate() - 1); veille.setHours(23, 59, 0, 0);
  const parCode = ODICOLOR_CA.parCode(caStore, mk + '-01', ODICOLOR_CA.finDeMois(mk)), facturation = {};
  for (const c of cl) if (c.codeEbp && parCode.has(c.codeEbp)) { const x = parCode.get(c.codeEbp); facturation[c.id] = { derniere: x.derniereFacture, moisCents: x.periodeCents }; }
  const K = ODICOLOR_COCKPIT.calculer({ auj, facturation, clients: cl, devis: dv, relanceJours: S.relanceJours || 3, totalDevis: d => totaux(d).ht,
    ca: { renseigne: ODICOLOR_CA.aDesPieces(caStore), moisCents: m.totalCents, nFactures: m.nFactures, nAvoirs: m.nAvoirs }, objectifMoisCents: om ? om.cents : 0,
    jours: { ouvresTotal: joursOuvres(debut, fin), ouvresFaits: veille >= debut ? joursOuvres(debut, veille) : 0 } });
  const agenda = await get('meta', 'agenda'), rdvJour = ODICOLOR_RDV.duJour(agenda, auj);
  const carteRdv = rdvJour.length ? h('div', { class: 'carte' }, h('div', { class: 'elan-tete' }, h('strong', {}, 'Rendez-vous aujourd’hui'), h('small', { class: 'mut' }, String(rdvJour.length))), rdvJour.map(x => h('a', { class: 'ligne', href: '#/visite/' + x.clientId, style: 'color:inherit;text-decoration:none;display:block;min-height:48px', 'aria-label': 'Rendez-vous ' + x.heure + ' ' + x.clientNom }, h('strong', {}, x.heure + ' · ' + x.clientNom), h('br'), h('small', { class: 'mut' }, x.duree + ' min' + (x.objet ? ' · ' + x.objet : ''))))) : null;
  const r = K.rythme, carteCA = h('div', { class: 'carte obj hero' }, h('small', { class: 'etiq' }, 'CA facturé HT · ' + mk),
    h('div', { class: 'gros-chiffre' }, K.ca.renseigne ? eur(K.ca.moisCents) : 'Non renseigné'), om ? h('p', { class: 'mut ck-objectif' }, 'Objectif du mois : ' + eur(om.cents)) : null,
    r.calculable ? [h('div', { class: 'piste', role: 'img', 'aria-label': r.pct + ' % de l’objectif du mois' }, h('div', { class: 'rempli', style: 'width:' + Math.max(0, Math.min(100, r.pct)) + '%' })),
      h('p', { class: r.ecartCents >= 0 ? '' : 'mut' }, (r.ecartCents >= 0 ? 'En avance de ' : 'En retard de ') + eur(Math.abs(r.ecartCents)) + ' sur le rythme des jours ouvrés' + (r.resteParJourOuvre ? ' · ' + eur(r.resteParJourOuvre) + ' à facturer par jour ouvré restant' : ''))]
      : h('p', { class: 'mut' }, 'Rythme non calculable : ' + r.motif + '. ', h('a', { class: 'btn sec ck-lien', href: K.ca.renseigne ? '#/reglages' : '#/ca' }, K.ca.renseigne ? 'Régler l’objectif' : 'Saisir le CA facturé')));
  const visitable = new Set(['rappels', 'prospects', 'risque', 'reachat']);
  const ligne = (sec, x) => h('div', { class: 'ligne', style: 'display:flex;align-items:center;gap:8px' },
    h('a', { href: visitable.has(sec.id) ? '#/visite/' + x.id : sec.lien(x), style: 'color:inherit;text-decoration:none;flex:1;min-height:48px', 'aria-label': (visitable.has(sec.id) ? 'Visiter ' : 'Ouvrir ') + (x.nom || '') }, h('span', { class: 'g' }, h('strong', {}, x.nom || '—'), h('br'), h('small', {}, x.raison + (x.montant ? ' · ' + eur(x.montant) : '') + (x.ville ? ' · ' + x.ville : '')))),
    visitable.has(sec.id) ? h('a', { class: 'btn sec', href: '#/client/' + x.id, style: 'min-height:44px' }, 'Fiche') : h('span', {}, '›'));
  const cartes = K.sections.filter(sec => sec.total).map(sec => h('div', { class: 'carte' }, h('div', { class: 'elan-tete' }, h('strong', {}, sec.titre), h('small', { class: 'mut' }, sec.total + (sec.montant ? ' · ' + eur(sec.montant) : ''))),
    sec.lignes.map(x => ligne(sec, x)), sec.total > sec.lignes.length ? h('p', { class: 'mut' }, '+ ' + (sec.total - sec.lignes.length) + ' autre(s)') : null));
  montrer('Cockpit', carteCA, carteRdv,
    h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/proposition' }, 'Proposer ma tournée du jour'), h('a', { class: 'btn sec', href: '#/tournee' }, 'Ma tournée'), h('a', { class: 'btn sec', href: '#/carte' }, 'Carte'), h('a', { class: 'btn sec', href: '#/secteurs' }, 'Secteurs'), h('a', { class: 'btn sec', href: '#/ca' }, 'CA facturé'), h('a', { class: 'btn sec', href: '#/feuille' }, 'Plan de la semaine')),
    cartes.length ? h('div', { class: 'cg-grille' }, cartes) : h('p', { class: 'vide' }, 'Rien d’urgent d’après tes données : ' + cl.length + ' garage(s), ' + dv.length + ' devis. Ajoute des rappels et des priorités sur les fiches pour alimenter le cockpit.'),
    h('p', { class: 'mut' }, 'Chaque ligne vient de ce que tu as saisi (visites, rappels, devis, factures). Rien n’est deviné.'));
}

// ---------- Imports EBP : choix manuel des colonnes (les titres seulement, jamais les données) ----------
function colonnesEbpUI(an, carte, appliquer, ouvert) {
  if (!an || !an.ok) return null;
  const sels = {}, ent = an.entetes;
  const champs = an.champs.map(c => { sels[c.cle] = h('select', { 'aria-label': 'Colonne pour ' + c.libelle }, h('option', { value: '' }, c.obligatoire ? 'Choisir…' : '— aucune —'), ent.map((e, i) => e ? h('option', { value: i, selected: carte && carte[c.cle] === i }, e) : null));
    return h('label', {}, c.libelle + (c.obligatoire ? ' *' : ''), sels[c.cle]); });
  const titres = 'Titres de colonnes (ligne ' + (an.debut + 1) + ') : ' + ent.filter(Boolean).join(' | ');
  return h('details', { class: 'carte', open: !!ouvert }, h('summary', {}, 'Colonnes du fichier (à corriger si besoin)'),
    h('p', { class: 'mut' }, 'Vérifie que chaque information vient de la bonne colonne. Le montant doit être le HT, jamais le TTC.'), champs,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { const c = {}; for (const k of Object.keys(sels)) if (sels[k].value !== '') c[k] = Number(sels[k].value); appliquer({ debut: an.debut, carte: c }); } }, 'Utiliser ces colonnes'),
      h('button', { class: 'btn sec', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(titres); toast('Titres copiés (aucune donnée de client).'); } catch (e) { toast(titres, true); } } }, 'Copier les titres de colonnes')),
    h('p', { class: 'mut' }, 'En cas de doute, copie les titres et envoie-les : ils ne contiennent aucune donnée de client.'));
}
// ---------- Import EBP du CA facturé : aperçu obligatoire avant écriture ----------
async function pageCAImport() {
  const file = h('input', { type: 'file', accept: '.xlsx,.xlsm,.csv,.txt', 'aria-label': 'Export EBP des pièces' }), zone = h('div');
  montrer('Importer le CA depuis EBP',
    h('a', { class: 'btn sec', href: '#/ca' }, '‹ CA facturé'),
    h('p', { class: 'mut' }, 'Choisis l’export EBP des pièces (factures et avoirs). Seuls les montants HT des factures et avoirs comptent ; devis, commandes et bons de livraison sont ignorés. Un aperçu s’affiche : rien n’est enregistré avant ta confirmation. Réimporter le même fichier ne crée aucun doublon.'),
    file, zone);
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    try {
      const feuilles = await lireFichier(f, LIMITES_EBP), magasin = await get('meta', 'caFacture'), auj = jourLocal(new Date());
      let fe = feuilles.find(x => ODICOLOR_CA_EBP.associer(x.rows).ok) || feuilles[0];
      let colonnes = null, typeDefaut = '';
      const afficher = async () => {
      const ap = ODICOLOR_CA_EBP.apercu(fe.rows, { auj, existantes: magasin ? magasin.entrees : [], colonnes, typeDefaut });
      const an = ap.analyse || ODICOLOR_CA_EBP.analyser(fe.rows), panneau = colonnesEbpUI(an, ap.carte || (colonnes && colonnes.carte) || (an.ok ? an.carte : null), c => { colonnes = c; afficher(); }, !ap.ok);
      if (!ap.ok) { zone.replaceChildren(h('div', { class: 'carte erreur', role: 'alert' }, 'Import à compléter : ' + ap.erreur), panneau); return; }
      const sansTypeBloc = ap.sansType && !typeDefaut ? h('div', { class: 'carte alerte', role: 'alert' }, h('strong', {}, ap.sansType + ' ligne(s) sans type de pièce reconnaissable. '), 'Si ce fichier ne contient QUE des factures et des avoirs, tu peux les compter (un montant négatif = avoir).',
        h('div', { class: 'actions' }, h('button', { class: 'btn sec', type: 'button', onclick: () => { if (confirm('Confirmes-tu que ce fichier ne contient que des factures et des avoirs (aucun devis, commande ou bon de livraison) ?')) { typeDefaut = 'facture'; afficher(); } } }, 'Ce fichier ne contient que des factures et avoirs'))) : null;
      const liste = (titre, arr, f2) => arr.length ? h('details', { class: 'carte' }, h('summary', {}, titre + ' · ' + arr.length), arr.slice(0, 30).map(x => h('p', { class: 'mut' }, f2(x))), arr.length > 30 ? h('p', { class: 'mut' }, '+ ' + (arr.length - 30) + ' autre(s)') : null) : null;
      const hc = Object.entries(ap.horsCa).map(([k, n]) => n + ' ' + k).join(', ');
      zone.replaceChildren(
        h('div', { class: 'carte' }, h('strong', {}, f.name), h('p', { class: 'mut' }, 'Colonnes retenues : ' + ap.correspondance.map(c => c.libelle + ' ← « ' + c.colonne + ' »').join(' · ')),
          h('div', { class: 'gros-chiffre' }, ap.nouvelles.length + ' pièce(s) à ajouter'), h('p', {}, 'Effet sur le CA : ' + (ap.totaux.nouvellesCents < 0 ? '− ' : '') + eur(Math.abs(ap.totaux.nouvellesCents)) + ' HT (factures − avoirs)'),
          h('p', { class: 'mut' }, ap.identiques.length + ' déjà présente(s) · ' + ap.conflits.length + ' conflit(s) non importé(s) · ' + ap.ignorees.length + ' ligne(s) ignorée(s)' + (hc ? ' · hors CA : ' + hc : '') + (ap.lignesTotal ? ' · ' + ap.lignesTotal + ' ligne(s) de total écartée(s)' : ''))),
        ap.multiLignes.length ? h('div', { class: 'carte alerte', role: 'alert' }, h('strong', {}, ap.multiLignes.length + ' pièce(s) totalisée(s) sur plusieurs lignes : '), 'vérifie que l’export n’est pas dupliqué (' + ap.multiLignes.slice(0, 8).join(', ') + (ap.multiLignes.length > 8 ? '…' : '') + ').') : null,
        sansTypeBloc, panneau,
        liste('Conflits (même numéro, montant ou date différents : à vérifier à la main, rien n’est écrasé)', ap.conflits, x => x.numero + ' : export ' + eur(x.montantHt) + ' le ' + x.date + ' ≠ enregistré ' + eur(x.existant.montantHt) + ' le ' + x.existant.date),
        liste('Lignes ignorées', ap.ignorees, x => 'Ligne ' + x.ligne + ' : ' + x.motif),
        liste('Pièces à ajouter', ap.nouvelles, x => (x.type === 'avoir' ? 'Avoir ' : 'Facture ') + x.numero + ' · ' + x.date + ' · ' + eur(x.montantHt) + (x.clientNom ? ' · ' + x.clientNom : '')),
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', disabled: ap.nouvelles.length === 0, onclick: async ev => {
          ev.currentTarget.disabled = true;
          try { const maintenant = new Date().toISOString(), m2 = ODICOLOR_CA_EBP.appliquer(await get('meta', 'caFacture'), ap, { idImport: nouvelUid(), nouvelId: nouvelUid, maintenant, fichier: f.name, auj }); await put('meta', m2, 'caFacture'); toast(ap.nouvelles.length + ' pièce(s) importée(s).'); location.hash = '#/ca'; }
          catch (e) { toast('Import annulé : ' + e.message, true); ev.currentTarget.disabled = false; }
        } }, ap.nouvelles.length ? 'Importer ces ' + ap.nouvelles.length + ' pièces' : 'Rien à importer'), h('a', { class: 'btn sec', href: '#/ca' }, 'Annuler')));
      };
      await afficher();
    } catch (e) { zone.replaceChildren(h('div', { class: 'carte erreur', role: 'alert' }, 'Import impossible : ' + e.message)); }
  });
}

// ---------- Visite terrain en 4 touches maximum ----------
async function pageVisite(id) {
  const c = await get('clients', id); if (!c) return nonTrouve();
  let agendaAvant = null, enCours = false; const V = ODICOLOR_VISITE, choix = {}, avant = JSON.stringify(c), deTournee = /[?&]t=1/.test(location.hash);
  const noteIn = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Note (facultatif)', 'aria-label': 'Note de visite', autocomplete: 'off' });
  const gros = (label, sous, fn, cls) => h('button', { class: 'btn gros ' + (cls || ''), type: 'button', style: 'min-height:68px;text-align:left;display:block;width:100%;margin:8px 0', onclick: fn }, h('strong', {}, label), sous ? h('br') : null, sous ? h('small', {}, sous) : null);
  const entete = (n, total, titre) => [h('div', { class: 'mut' }, 'Étape ' + n + ' sur ' + total + ' · ' + c.nom), h('h2', { style: 'margin:6px 0' }, titre)];
  const total = () => V.etapes(choix.resultat).length;
  const enregistrer = async () => {
    if (enCours) return;
    enCours = true;
    try {
      choix.note = noteIn.value;
      const r = V.appliquer(c, choix, { auj: aujourdhui(), nouvelId: nouvelUid, prochainOuvre: j => estOuvre(new Date(j + 'T12:00:00')) ? j : prochainOuvre(new Date(j + 'T12:00:00')) });
      await putMany('clients', [r.client]);
      if (choix.resultat === 'vu') { const ag = await get('meta', 'agenda'), rj = ODICOLOR_RDV.duJour(ag, aujourdhui()).filter(x => x.clientId === id); if (rj.length) { agendaAvant = { val: ag }; let m2 = ag; for (const x of rj) m2 = ODICOLOR_RDV.terminer(m2, x.id, { maintenant: new Date().toISOString() }); await put('meta', m2, 'agenda'); } }
      if (deTournee) { const T = await lireTournees(), j = aujourdhui(), plan = T[j]; if (plan && Array.isArray(plan.ids) && plan.ids.includes(id)) { (plan.res || (plan.res = {}))[id] = choix.resultat === 'vu' ? 'vu' : choix.resultat === 'absent' ? 'absent' : 'reporte'; await ecrireTournees(T); } }
      await fin(r.resume);
    } catch (e) { toast(e.message, true); } finally { enCours = false; }
  };
  const fin = async resume => {
    let suivant = null;
    if (deTournee) { const T = await lireTournees(), plan = T[aujourdhui()]; if (plan && plan.ids) suivant = plan.ids.find(i => i !== id && !(plan.res || {})[i]); }
    montrer('Visite enregistrée', h('div', { class: 'carte obj' }, h('strong', {}, c.nom), h('p', {}, resume)),
      suivant ? h('a', { class: 'btn gros', href: '#/visite/' + suivant + '?t=1' }, 'Garage suivant de la tournée') : null,
      h('div', { class: 'actions' }, h('a', { class: 'btn sec', href: deTournee ? '#/tournee' : '#/cockpit' }, deTournee ? 'Retour à la tournée' : 'Retour au cockpit'), h('a', { class: 'btn sec', href: '#/client/' + id }, 'Fiche'), h('a', { class: 'btn sec', href: '#/agenda/nouveau/' + id }, 'Fixer un rendez-vous'),
        h('button', { class: 'btn sec', type: 'button', onclick: async () => { await putMany('clients', [JSON.parse(avant)]); if (agendaAvant) { if (agendaAvant.val === undefined) await rq(st('meta', 'readwrite').delete('agenda')); else await put('meta', agendaAvant.val, 'agenda'); } toast('Visite annulée : fiche remise comme avant.'); const cible = '#/visite/' + id + (deTournee ? '?t=1' : ''); if (location.hash === cible) pageVisite(id); else location.hash = cible; } }, 'Annuler cette visite')), h('div', { style: 'height:96px' }));
  };
  const dateIn = h('input', { type: 'date', min: aujourdhui(), 'aria-label': 'Échéance de la prochaine action' });
  const retour = fn => h('button', {class:'btn sec', type:'button', onclick:fn}, '‹ Étape précédente');
  const etapeSuite = () => {
    if (choix.resultat === 'vu' && !dateIn.value) dateIn.value = aujourdhui();
    montrer('Visite · ' + c.nom, retour(choix.resultat === 'vu' ? etapeRetour : etapeResultat),
      ...entete(total(), total(), choix.resultat === 'vu' ? 'Et ensuite ?' : 'Quand repasser ?'),
      noteIn, h('label', {}, 'Échéance de la prochaine action', dateIn),
      h('p', {class:'mut'}, choix.resultat === 'vu' ? 'Date modifiable. « Aucune suite » ne programme rien.' : 'Si tu choisis une date, elle remplace le délai indiqué sur les boutons.'),
      V.choixSuite(choix.resultat).map(s => gros(s[1], '', () => {
        if (s[0] !== 'aucune' && (!dateIn.checkValidity() || (choix.resultat === 'vu' && !dateIn.value))) { toast('Choisis une échéance valide.', true); dateIn.focus(); return; }
        choix.suite = s[0]; choix.echeance = s[0] === 'aucune' ? '' : dateIn.value; enregistrer();
      }, 'sec')));
  };
  const etapeRetour = () => montrer('Visite · ' + c.nom, retour(etapeResultat), ...entete(2, total(), 'Qu’est-ce qui est ressorti ?'), noteIn,
    V.RETOURS.map(r => gros(r[1], '', () => { choix.retour = r[0]; etapeSuite(); }, 'sec')));
  const etapeResultat = () => montrer('Visite · ' + c.nom,
    h('a', { class: 'btn sec', href: deTournee ? '#/tournee' : '#/client/' + id }, '‹ Retour'),
    ...entete(1, 3, 'Résultat de la visite'), noteIn,
    V.RESULTATS.map(r => gros(r[1], r[2], () => { choix.resultat = r[0]; r[0] === 'vu' ? etapeRetour() : etapeSuite(); }, r[0] === 'vu' ? 'vert' : 'sec')),
    h('p', { class: 'mut' }, 'Le choix de la suite enregistre la visite. Tu peux revenir à l’étape précédente pour corriger.'));
  etapeResultat();
}

// ---------- Carte commerciale : garages regroupés par zone, hors ligne, sans fond de carte externe ----------
const CARTE_ETAT = { filtre: 'tous', marche: true, vue: null };
async function pageCarte() {
  const K = ODICOLOR_CARTE; K.charger(ODICOLOR_COMMUNES_CENTRES);
  const clients = await getAll('clients'), marche = await get('meta', 'marche'), prep = K.preparer(clients, marche), parId = new Map(clients.map(c => [c.id, c]));
  const COUL = { client: '#3BD38A', prospect_prio: '#FF2D3D', prospect: '#FFC873', refus: '#8A8F98', marche: '#6E737B' };
  const filtres = [['tous', 'Tous'], ['client', 'Clients'], ['prospect', 'Prospects'], ['prio', 'À visiter (A/B)']];
  const filtreFn = p => CARTE_ETAT.filtre === 'tous' ? true : CARTE_ETAT.filtre === 'client' ? p.cat === 'client' : CARTE_ETAT.filtre === 'prospect' ? (p.cat === 'prospect' || p.cat === 'prospect_prio') : p.cat === 'prospect_prio';
  const canvas = h('canvas', { role: 'img', 'aria-label': 'Carte des garages regroupés par zone', style: 'width:100%;height:62vh;min-height:320px;touch-action:none;background:#0D0F12;border-radius:14px;display:block' });
  const feuille = h('div'), info = h('p', { class: 'mut', role: 'status' }), chips = h('div', { class: 'actions' });
  let vue = CARTE_ETAT.vue, groupes = [], dessinPrevu = false;
  const taille = () => { const r = canvas.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.max(1, Math.round(r.width * d)); canvas.height = Math.max(1, Math.round(r.height * d)); return { l: r.width, h: r.height, d }; };
  const rayonDe = n => Math.min(21, 8 + Math.sqrt(n) * 1.7);
  const dessiner = () => {
    dessinPrevu = false; const { l, h: ht, d } = taille(); if (!vue) vue = K.cadrer(prep, l, ht, CARTE_ETAT.marche); vue.largeur = l; vue.hauteur = ht; CARTE_ETAT.vue = vue;
    const t0 = performance.now(), r = K.regrouper(prep, vue, { filtre: filtreFn, marche: CARTE_ETAT.marche, rayon: 48 }); groupes = r.groupes;
    const g = canvas.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, l, ht); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const gr of groupes.sort((a, b) => a.n - b.n)) {
      const nGar = gr.n - gr.marche, dom = ['client', 'prospect_prio', 'prospect', 'refus'].filter(k => gr.cats[k]).sort((a, b) => gr.cats[b] - gr.cats[a])[0];
      const ray = rayonDe(gr.n);
      if (gr.marche) { g.beginPath(); g.arc(gr.x, gr.y, ray + (nGar ? 4 : 0), 0, 7); g.strokeStyle = COUL.marche; g.lineWidth = 2; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]); if (!nGar) { g.fillStyle = 'rgba(110,115,123,.25)'; g.fill(); } }
      if (nGar) { g.beginPath(); g.arc(gr.x, gr.y, rayonDe(nGar), 0, 7); g.fillStyle = COUL[dom]; g.fill(); }
      g.fillStyle = nGar ? '#0D0F12' : '#C9CDD3'; g.font = '700 ' + (ray > 18 ? 14 : 12) + 'px system-ui'; g.fillText(String(nGar || gr.marche), gr.x, gr.y);
    }
    canvas.dataset.groupes = String(groupes.length); canvas.dataset.visibles = String(r.visibles); canvas.dataset.ms = (performance.now() - t0).toFixed(1);
    info.textContent = prep.points.length + ' garage(s) sur la carte (' + prep.approx + ' placés au centre de leur commune, pas à l’adresse)' + (prep.nonPlaces.length ? ' · ' + prep.nonPlaces.length + ' sans position' : '') + ' · ' + r.visibles + ' dans la vue' + (marche ? ' · marché recensé : ' + marche.communes.reduce((a, c) => a + c[1], 0) + ' établissements' : '');
  };
  const planifier = () => { if (!dessinPrevu) { dessinPrevu = true; requestAnimationFrame(dessiner); } };
  const chipsRendre = () => chips.replaceChildren(...[...filtres.map(([k, l]) => h('button', { class: 'btn ' + (CARTE_ETAT.filtre === k ? '' : 'sec'), type: 'button', 'aria-pressed': String(CARTE_ETAT.filtre === k), onclick: () => { CARTE_ETAT.filtre = k; chipsRendre(); feuille.replaceChildren(); planifier(); } }, l)),
    marche ? h('button', { class: 'btn ' + (CARTE_ETAT.marche ? '' : 'sec'), type: 'button', 'aria-pressed': String(CARTE_ETAT.marche), onclick: () => { CARTE_ETAT.marche = !CARTE_ETAT.marche; chipsRendre(); planifier(); } }, 'Marché recensé') : null].filter(Boolean));
  // Gestes : glisser, pincer, molette ; un toucher bref ouvre la zone touchée.
  const ptrs = new Map(); let depart = null, dist0 = 0;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); depart = { x: e.offsetX, y: e.offsetY, t: Date.now(), bouge: false }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; dist0 = Math.hypot(a.x - b.x, a.y - b.y); depart.bouge = true; } });
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    if (ptrs.size === 2) { ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); const [a, b] = [...ptrs.values()], dn = Math.hypot(a.x - b.x, a.y - b.y); if (dist0 > 0 && dn > 0) { vue = K.zoomer(vue, dn / dist0, (a.x + b.x) / 2, (a.y + b.y) / 2); dist0 = dn; planifier(); } return; }
    if (Math.hypot(e.offsetX - depart.x, e.offsetY - depart.y) > 6) depart.bouge = true;
    if (depart.bouge) { vue = K.deplacer(vue, dx, dy); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); planifier(); }
  });
  const fin = e => { const bref = depart && !depart.bouge && Date.now() - depart.t < 600; ptrs.delete(e.pointerId); if (bref && ptrs.size === 0) ouvrirZone(e.offsetX, e.offsetY); if (ptrs.size === 0) depart = null; };
  canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); depart = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); vue = K.zoomer(vue, e.deltaY < 0 ? 1.25 : 0.8, e.offsetX, e.offsetY); planifier(); }, { passive: false });
  const ouvrirZone = (x, y) => {
    let best = null, bd = 1e9; for (const g of groupes) { const dd = Math.hypot(g.x - x, g.y - y); if (dd < Math.max(rayonDe(g.n) + 8, 26) && dd < bd) { best = g; bd = dd; } }
    if (!best) { feuille.replaceChildren(); return; }
    const nGar = best.n - best.marche, lignes = best.ids.map(id => parId.get(id)).filter(Boolean);
    feuille.replaceChildren(h('div', { class: 'carte', role: 'region', 'aria-label': 'Zone touchée' },
      h('strong', {}, nGar + ' garage(s)' + (best.marche ? ' · ' + best.marche + ' établissement(s) recensé(s)' : '')),
      best.marche ? h('p', { class: 'mut' }, 'Marché recensé (' + best.communes.join(', ') + (best.communes.length >= 12 ? '…' : '') + ') : établissements 45.20A, PAS des carrosseries-peinture qualifiées.') : null,
      lignes.map(c => { const pos = K.placer(c); return h('div', { class: 'ligne', style: 'display:flex;gap:8px;align-items:center' },
        h('span', { class: 'g', style: 'flex:1' }, h('strong', {}, c.nom), h('br'), h('small', {}, (c.statutCrm === 'client' ? 'Client' : 'Prospect') + (c.priorite ? ' · priorité ' + c.priorite : '') + ' · ' + (c.ville || pos.commune || '—') + (pos.precision === 'commune' ? ' (position = centre de la commune)' : ''))),
        h('a', { class: 'btn', href: '#/visite/' + c.id, style: 'min-height:44px' }, 'Visiter'), h('a', { class: 'btn sec', href: '#/client/' + c.id, style: 'min-height:44px' }, 'Fiche')); }),
      nGar > lignes.length ? h('p', { class: 'mut' }, '+ ' + (nGar - lignes.length) + ' autre(s) : zoome pour les voir un par un.') : null));
  };
  const importer = h('input', { type: 'file', accept: '.csv,.txt', 'aria-label': 'Recensement par commune (CSV)' });
  importer.addEventListener('change', async () => {
    const f = importer.files[0]; if (!f) return;
    try {
      const rows = parseCSV((new TextDecoder('utf-8').decode(await f.arrayBuffer())).replace(/^﻿/, '')).filter(r => r.some(c => clean(c) !== '')), ent = (rows[0] || []).map(c => clean(c).toLowerCase());
      const iI = ent.indexOf('commune_insee'), iN = ent.findIndex(c => c === 'etablissements');
      if (iI < 0 || iN < 0) throw new Error('Colonnes « commune_insee » et « etablissements » introuvables (colonnes lues : ' + ent.join(', ') + ').');
      const com = [], vus = new Set(); let rejets = 0;
      for (const r of rows.slice(1)) { const insee = clean(r[iI]), n = Number(clean(r[iN])); if (!/^\d{5}$/.test(insee) || !Number.isInteger(n) || n < 0 || vus.has(insee)) { rejets++; continue; } vus.add(insee); com.push([insee, n]); }
      if (!com.length) throw new Error('Aucune ligne valide.');
      await put('meta', { version: 1, fichier: f.name, importeLe: new Date().toISOString(), note: 'Établissements 45.20A recensés par commune (source : fichier fourni). Pas des carrosseries-peinture qualifiées.', communes: com }, 'marche');
      toast(com.length + ' communes importées' + (rejets ? ', ' + rejets + ' ligne(s) refusée(s)' : '') + '.'); pageCarte();
    } catch (e) { toast('Import impossible : ' + e.message, true); }
  });
  montrer('Carte commerciale', chips, canvas, info,
    h('div', { class: 'actions' }, h('button', { class: 'btn sec', type: 'button', 'aria-label': 'Zoom avant', onclick: () => { vue = K.zoomer(vue, 1.6, vue.largeur / 2, vue.hauteur / 2); planifier(); } }, '＋'), h('button', { class: 'btn sec', type: 'button', 'aria-label': 'Zoom arrière', onclick: () => { vue = K.zoomer(vue, 1 / 1.6, vue.largeur / 2, vue.hauteur / 2); planifier(); } }, '－'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => { vue = K.cadrer(prep, vue.largeur, vue.hauteur, CARTE_ETAT.marche); planifier(); } }, 'Tout voir')),
    h('p', { class: 'mut' }, h('span', { style: 'color:#3BD38A' }, '● client '), h('span', { style: 'color:#FF2D3D' }, '● prospect A/B '), h('span', { style: 'color:#FFC873' }, '● prospect '), h('span', { style: 'color:#8A8F98' }, '● refus '), '◌ marché recensé (pointillés). Pas de fond de carte : fonctionne hors ligne.'),
    feuille,
    prep.nonPlaces.length ? h('details', { class: 'carte' }, h('summary', {}, prep.nonPlaces.length + ' garage(s) sans position'), prep.nonPlaces.slice(0, 40).map(n => h('p', { class: 'mut' }, h('a', { href: '#/client/' + n.id }, n.nom), ' — ' + n.motif))) : null,
    h('details', { class: 'carte' }, h('summary', {}, 'Marché recensé : importer un fichier'), h('p', { class: 'mut' }, 'Fichier CSV « par commune » du recensement (colonnes commune_insee ; etablissements). Il apporte seulement des nombres par commune, pas de noms ni d’adresses.'), importer,
      marche ? h('p', { class: 'mut' }, 'Chargé : ' + marche.fichier + ' (' + marche.communes.length + ' communes)') : null),
    h('div', { style: 'height:96px' }));
  chipsRendre(); planifier();
}

// ---------- Ma Ville sur le téléphone : même modèle et même dessin que le Bureau, alimentés par les fiches du téléphone ----------
async function modeleVille() {
  const cl = await getAll('clients');
  return { cl, m: ModeleCommune.construire({ arrete: jourLocal(new Date()), dates: { Terrain: jourLocal(new Date()) }, terrain: cl, clientsEbp: [], piecesEbp: [], annuaire: [], liaisonsValidees: [] }) };
}
async function pageVille(insee) {
  const { cl, m } = await modeleVille();
  if (!insee) {
    const a = ModeleCommune.agreger(m, { portee: 'mes_garages' }), tete = h('p', { class: 'mut' }, cl.length + ' garage(s) · ' + a.idf.total + ' placé(s) dans une commune' + (a.aClasser.total ? ' · ' + a.aClasser.total + ' à classer (commune inconnue)' : '') + '. Données : celles de ce téléphone.');
    const parDep = a.parDep.map(d => h('div', { class: 'carte' }, h('strong', {}, (L0nom(d.dep)) + ' (' + d.dep + ')'), h('small', { class: 'mut' }, ' · ' + d.total + ' garage(s)'),
      a.parCommune.filter(c => c.dep === d.dep).sort((x, y) => y.total - x.total || x.commune.localeCompare(y.commune, 'fr')).map(c => h('a', { class: 'ligne', href: '#/ville/' + c.insee, style: 'color:inherit;text-decoration:none;display:flex;min-height:48px;align-items:center;gap:8px' },
        h('span', { style: 'flex:1' }, h('strong', {}, c.commune), h('br'), h('small', { class: 'mut' }, c.en_compte + ' en compte · ' + c.sans_compte + ' sans compte · ' + c.a_verifier + ' à vérifier')), h('strong', {}, String(c.total)), h('span', {}, '›')))));
    montrer('Ma Ville', tete, parDep.length ? parDep : h('p', { class: 'vide' }, 'Aucun garage placé dans une commune. Renseigne la ville et le code postal sur les fiches.'),
      a.aClasser.total ? h('details', { class: 'carte' }, h('summary', {}, a.aClasser.total + ' garage(s) à classer'), m.aClasser.slice(0, 60).map(e => h('p', { class: 'mut' }, e.nom.valeur))) : null, h('div', { style: 'height:96px' }));
    return;
  }
  const c = ModeleCommune.commune(m, insee);
  if (!c) { montrer('Ma Ville', h('a', { class: 'btn sec', href: '#/ville' }, '‹ Toutes les communes'), h('p', { class: 'vide' }, 'Aucun garage dans cette commune.')); return; }
  const hote = h('div', { class: 'vc-hote' });
  montrer(c.commune, h('a', { class: 'btn sec', href: '#/ville' }, '‹ Toutes les communes'), hote, h('div', { style: 'height:96px' }));
  VueCommune.monter(hote, c, { fictif: false, etiquette: 'MES GARAGES', sources: ['Fiches de ce téléphone'], portee: 'mes_garages', compte: 'tous',
    fil: [{ libelle: 'Ma Ville', href: '#/ville' }, { libelle: c.commune }],
    ouvrirFiche: (uid, e) => { const ref = e.sources.find(x => /^tel:/.test(x.ref)); if (ref) location.hash = '#/client/' + ref.ref.slice(4); else toast('Cette fiche ne vient pas de ce téléphone.', true); } });
}
const L0nom = dep => { const D = BureauLogique.depInfo(dep); return D ? D.nom : 'Département ' + dep; };

// ---------- Proposition de tournée du jour : garages proches et prioritaires, à cocher puis valider ----------
async function pageProposition() {
  const [dv, cl, caStore] = [await getAll('devis'), await getAll('clients'), await get('meta', 'caFacture')];
  ODICOLOR_CARTE.charger(ODICOLOR_COMMUNES_CENTRES);
  const now = new Date(), auj = jourLocal(now), mk = auj.slice(0, 7), parCode = ODICOLOR_CA.parCode(caStore, mk + '-01', ODICOLOR_CA.finDeMois(mk)), facturation = {};
  for (const c of cl) if (c.codeEbp && parCode.has(c.codeEbp)) { const x = parCode.get(c.codeEbp); facturation[c.id] = { derniere: x.derniereFacture, moisCents: x.periodeCents }; }
  const sections = ODICOLOR_COCKPIT.calculer({ auj, facturation, clients: cl, devis: dv, relanceJours: S.relanceJours || 3, totalDevis: d => totaux(d).ht, ca: { renseigne: false }, sansLimite: true }).sections;
  const parId = new Map(cl.map(c => [c.id, c])), position = id => { const c = parId.get(id), p = c ? ODICOLOR_CARTE.placer(c) : null; return p && p.precision ? { lat: p.lat, lng: p.lng } : null; };
  const T0 = await lireTournees(), existant = T0[auj], r0 = ODICOLOR_TOURNEE.proposer(sections, position, { max: 8, rayonKm: 25 });
  const agenda = await get('meta', 'agenda'), rdvJour = ODICOLOR_RDV.duJour(agenda, auj), integ = ODICOLOR_RDV.integrer(rdvJour, r0.ids, position), heures = {};
  for (const x of integ.sequence) if (x.rdv) heures[x.id] = x.rdv.heure;
  const r = { ...r0, ids: integ.sequence.map(x => x.id), details: integ.sequence.map(x => r0.details.find(d => d.id === x.id) || { id: x.id, score: 0, raisons: ['Rendez-vous ' + x.rdv.heure + (x.rdv.duree ? ' (' + x.rdv.duree + ' min)' : '')] }), avert: integ.avertissements };
  const coches = new Map(r.ids.map(id => [id, h('input', { type: 'checkbox', checked: true, 'aria-label': 'Inclure ' + (parId.get(id) || {}).nom, style: 'width:24px;height:24px' })]));
  const valider = async () => {
    const ids = r.ids.filter(id => coches.get(id).checked); if (!ids.length) { toast('Coche au moins un garage.', true); return; }
    const T = await lireTournees(); const ex = T[auj];
    if (ex && ex.ids && Object.keys(ex.res || {}).length && !confirm('Une tournée est déjà commencée aujourd’hui (' + Object.keys(ex.res).length + ' garage(s) traité(s)). La remplacer ?')) return;
    T[auj] = { ids, res: {}, rdv: Object.fromEntries(ids.filter(id => heures[id]).map(id => [id, heures[id]])) }; await ecrireTournees(T); toast('Tournée du jour : ' + ids.length + ' garage(s).'); location.hash = '#/tournee';
  };
  montrer('Tournée proposée',
    r.ids.length ? [h('div', { class: 'carte obj' }, h('strong', {}, r.ids.length + ' garage(s) proches les uns des autres'), h('p', { class: 'mut' }, 'Distance à vol d’oiseau ≈ ' + r.kmApprox + ' km entre les garages (position = centre de la commune quand le GPS manque). Ordre de passage : du plus proche au plus proche.' + (r.sansPosition ? ' ' + r.sansPosition + ' garage(s) prioritaire(s) sans position ne sont pas proposés.' : ''))),
      r.details.map((d, i) => { const c = parId.get(d.id); return h('label', { class: 'carte', style: 'display:flex;gap:12px;align-items:flex-start;min-height:56px' }, coches.get(d.id), h('span', { style: 'flex:1' }, h('strong', {}, (i + 1) + '. ' + c.nom), h('br'), h('small', { class: 'mut' }, (heures[d.id] ? '⏰ RDV ' + heures[d.id] + ' · ' : '') + (c.ville || '') + ' · ' + d.raisons.join(' · ')))); }),
      (r.avert && r.avert.length) ? h('div', { class: 'carte alerte', role: 'alert' }, h('strong', {}, 'Attention : '), r.avert.join(' ')) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn gros', type: 'button', onclick: valider }, 'Valider cette tournée'), h('a', { class: 'btn sec', href: '#/cockpit' }, 'Annuler')),
      existant && existant.ids ? h('p', { class: 'mut' }, 'Une tournée existe déjà aujourd’hui (' + existant.ids.length + ' garage(s)). La valider la remplace.') : null]
      : [h('p', { class: 'vide' }, r.motif || 'Rien à proposer.'), h('p', { class: 'mut' }, 'Renseigne la ville et le code postal sur les fiches, ajoute des rappels et des priorités A/B : la proposition s’en nourrit.'), h('a', { class: 'btn sec', href: '#/tournee' }, 'Choisir à la main')],
    h('div', { style: 'height:96px' }));
}

// ---------- Import EBP des clients : rapprochement des codes, validation explicite par l'utilisateur ----------
async function pageClientsEbp() {
  const E = ODICOLOR_EBP_CLIENTS, file = h('input', { type: 'file', accept: '.xlsx,.xlsm,.csv,.txt', 'aria-label': 'Export EBP des clients' }), zone = h('div');
  montrer('Clients EBP ↔ garages', h('p', { class: 'mut' }, 'Choisis l’export EBP des clients (code, nom, ville, code postal…). Le téléphone PROPOSE des liens ; aucun n’est enregistré sans ton accord. Un lien relie le code EBP au garage : il donne ensuite le CA par garage et l’alerte de réachat.'), file, zone);
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    try {
      const feuilles = await lireFichier(f, LIMITES_EBP), fe = feuilles.find(x => E.associer(x.rows).ok) || feuilles[0]; let colonnes = null, lu = E.lire(fe.rows);
      const dessiner = async () => {
        lu = E.lire(fe.rows, colonnes);
        const an = lu.analyse || E.analyser(fe.rows), panneau = colonnesEbpUI(an, lu.carte || (colonnes && colonnes.carte) || (an.ok ? an.carte : null), c => { colonnes = c; dessiner(); }, !lu.ok);
        if (!lu.ok) { zone.replaceChildren(h('div', { class: 'carte erreur', role: 'alert' }, 'Import à compléter : ' + lu.erreur), panneau); return; }
        const garages = await getAll('clients'), r = E.rapprocher(lu.clients, garages), parCode = new Map(lu.clients.map(c => [c.code, c])), parId = new Map(garages.map(g => [g.id, g])), auj = jourLocal(new Date());
        const ctx = { auj, fichier: f.name, auteur: S.vendeur || 'Moi' };
        const lier = async (decisions) => {
          const ap = E.appliquer(garages, decisions, parCode, ctx);
          if (ap.modifies.length) { await putMany('clients', ap.modifies); await put('meta', { version: 1, fichier: f.name, importeLe: new Date().toISOString(), clients: lu.clients.map(({ ligne, ...c }) => c) }, 'ebpClients'); }
          toast(ap.modifies.length + ' lien(s) enregistré(s)' + (ap.refus.length ? ', ' + ap.refus.length + ' refusé(s) : ' + ap.refus[0].motif : '') + '.', ap.modifies.length === 0); await dessiner();
        };
        const coches = new Map(r.fortes.map(x => [x.code, h('input', { type: 'checkbox', 'aria-label': 'Lier ' + x.code, style: 'width:24px;height:24px' })]));
        const nomG = id => { const g = parId.get(id); return g ? g.nom + (g.ville ? ' · ' + g.ville : '') + (g.cp ? ' ' + g.cp : '') : '—'; };
        const bloquesNb = lu.clients.filter(c => c.bloque).length;
        zone.replaceChildren(
          h('div', { class: 'carte' }, h('strong', {}, f.name), h('p', { class: 'mut' }, 'Colonnes retenues : ' + lu.correspondance.map(c => c.libelle + ' ← « ' + c.colonne + ' »').join(' · ')),
            h('p', {}, lu.clients.length + ' client(s) EBP · ' + r.liees.length + ' déjà lié(s) · ' + r.fortes.length + ' proposition(s) forte(s) · ' + r.aVerifier.length + ' à vérifier · ' + r.sansGarage.length + ' sans garage' + (bloquesNb ? ' · ' + bloquesNb + ' compte(s) bloqué(s) dans EBP' : '')),
            lu.ignorees.length || lu.conflitsCode.length ? h('p', { class: 'mut' }, lu.ignorees.length + ' ligne(s) ignorée(s)' + (lu.conflitsCode.length ? ' · ' + lu.conflitsCode.length + ' code(s) répété(s) avec un autre nom : ' + lu.conflitsCode.slice(0, 5).map(c => c.code).join(', ') : '') + '.') : null),
          panneau,
          r.fortes.length ? h('details', { class: 'carte', open: true }, h('summary', {}, 'Propositions fortes · ' + r.fortes.length),
            h('p', { class: 'mut' }, 'Même nom et même code postal (ou ville), unique des deux côtés. Relis, coche, valide.'),
            r.fortes.slice(0, 200).map(x => h('label', { class: 'ligne', style: 'display:flex;gap:10px;align-items:center;min-height:52px' }, coches.get(x.code), h('span', { style: 'flex:1' }, h('strong', {}, x.code + ' → ' + nomG(x.id)), h('br'), h('small', { class: 'mut' }, (parCode.get(x.code) || {}).nom + ' · ' + x.raison)))),
            h('div', { class: 'actions' }, h('button', { class: 'btn sec', type: 'button', onclick: () => coches.forEach(c => { c.checked = true; }) }, 'Tout cocher'),
              h('button', { class: 'btn', type: 'button', onclick: async () => { const d = r.fortes.filter(x => coches.get(x.code).checked).map(x => ({ code: x.code, id: x.id, methode: 'nom+lieu' })); if (!d.length) { toast('Coche au moins un lien.', true); return; } if (confirm('Lier ' + d.length + ' code(s) EBP à leur garage ?')) await lier(d); } }, 'Lier les liens cochés'))) : null,
          r.aVerifier.length ? h('details', { class: 'carte' }, h('summary', {}, 'À vérifier · ' + r.aVerifier.length),
            r.aVerifier.slice(0, 100).map(x => { const c = parCode.get(x.code), sel = h('select', { 'aria-label': 'Garage pour ' + x.code }, h('option', { value: '' }, 'Choisir le garage…'), x.candidats.map(k => h('option', { value: k.id }, nomG(k.id) + ' — ' + k.raison)));
              return h('div', { class: 'carte' }, h('strong', {}, x.code + ' · ' + c.nom), h('p', { class: 'mut' }, [c.ville, c.cp].filter(Boolean).join(' ') + ' · ' + x.raison), sel, h('button', { class: 'btn sec', type: 'button', onclick: async () => { if (!sel.value) { toast('Choisis un garage.', true); return; } await lier([{ code: x.code, id: Number(sel.value), methode: 'verifie' }]); } }, 'Lier')); })) : null,
          r.sansGarage.length ? h('details', { class: 'carte' }, h('summary', {}, 'Sans garage correspondant · ' + r.sansGarage.length),
            h('p', { class: 'mut' }, 'Aucun garage du téléphone ne correspond. Tu peux créer la fiche (client) : jamais fait automatiquement.'),
            r.sansGarage.slice(0, 100).map(code => { const c = parCode.get(code); return h('div', { class: 'ligne', style: 'display:flex;gap:8px;align-items:center;min-height:52px' }, h('span', { style: 'flex:1' }, h('strong', {}, code + ' · ' + c.nom), h('br'), h('small', { class: 'mut' }, [c.ville, c.cp].filter(Boolean).join(' '))),
              h('button', { class: 'btn sec', type: 'button', onclick: async () => { await putMany('clients', [E.nouveauGarage(c, ctx)]); await put('meta', { version: 1, fichier: f.name, importeLe: new Date().toISOString(), clients: lu.clients.map(({ ligne, ...x }) => x) }, 'ebpClients'); toast('Fiche créée : ' + c.nom + '.'); await dessiner(); } }, 'Créer la fiche')); }),
            r.sansGarage.length > 1 ? h('button', { class: 'btn', type: 'button', onclick: async () => { if (!confirm('Créer ' + r.sansGarage.length + ' fiche(s) client ?')) return; await putMany('clients', r.sansGarage.map(code => E.nouveauGarage(parCode.get(code), ctx))); await put('meta', { version: 1, fichier: f.name, importeLe: new Date().toISOString(), clients: lu.clients.map(({ ligne, ...x }) => x) }, 'ebpClients'); toast(r.sansGarage.length + ' fiche(s) créée(s).'); await dessiner(); } }, 'Créer les ' + r.sansGarage.length + ' fiches') : null) : null,
          r.liees.length ? h('p', { class: 'mut' }, r.liees.length + ' code(s) déjà lié(s) à un garage.') : null, h('div', { style: 'height:96px' }));
      };
      await dessiner();
    } catch (e) { zone.replaceChildren(h('div', { class: 'carte erreur', role: 'alert' }, 'Import impossible : ' + e.message)); }
  });
}

// ---------- Analyse commerciale par secteur (département puis commune) ----------
async function pageSecteurs(dep) {
  ODICOLOR_CARTE.charger(ODICOLOR_COMMUNES_CENTRES);
  const [cl, caStore, marche] = [await getAll('clients'), await get('meta', 'caFacture'), await get('meta', 'marche')], now = new Date(), auj = jourLocal(now), mk = auj.slice(0, 7);
  const parCode = ODICOLOR_CA.parCode(caStore, mk + '-01', ODICOLOR_CA.finDeMois(mk)), facturation = {};
  for (const c of cl) if (c.codeEbp && parCode.has(c.codeEbp)) { const x = parCode.get(c.codeEbp); facturation[c.id] = { derniere: x.derniereFacture, moisCents: x.periodeCents }; }
  const communes = new Map(ODICOLOR_COMMUNES_CENTRES.map(r => [r[0], { nom: r[1] }]));
  const r = ODICOLOR_SECTEUR.calculer({ auj, clients: cl, facturation, communes, marche: marche ? marche.communes : [], caTotalMoisCents: ODICOLOR_CA.aDesPieces(caStore) ? ODICOLOR_CA.calculerMois(caStore, mk).totalCents : null,
    placer: c => { const p = ODICOLOR_CARTE.placer(c); return p.insee ? { insee: p.insee, commune: p.commune } : null; } });
  const carteSecteur = (x, lien) => h(lien ? 'a' : 'div', Object.assign({ class: 'carte', style: 'display:block;color:inherit;text-decoration:none' }, lien ? { href: lien } : {}),
    h('div', { class: 'elan-tete' }, h('strong', {}, x.nom), h('small', { class: 'mut' }, x.garages + ' garage(s)')),
    h('p', {}, 'CA du mois ', h('strong', {}, ODICOLOR_CA.aDesPieces(caStore) ? eur(x.caMoisCents) : 'non renseigné'), ' · ', x.actifs + ' actif(s) · ' + x.dormants + ' dormant(s)' + (x.sansSuivi ? ' · ' + x.sansSuivi + ' sans suivi de facturation' : '')),
    h('p', { class: 'mut' }, x.prospects + ' prospect(s) (' + x.prospectsPrio + ' A/B) · ' + x.visites30 + ' vu(s) en 30 j' + (x.marche ? ' · marché recensé ' + x.marche + ' (couverture ' + x.couverturePct + ' %)' : '')),
    x.raisons.length ? h('p', { class: 'mut' }, 'À faire : ' + x.raisons.join(' · ')) : null);
  const entete = h('div', { class: 'carte obj' }, h('strong', {}, r.totaux.garages + ' garage(s) · ' + r.totaux.clients + ' client(s) · ' + r.totaux.actifs + ' actif(s) · ' + r.totaux.dormants + ' dormant(s) · ' + r.totaux.prospects + ' prospect(s)'),
    h('p', { class: 'mut' }, 'Actif = client lié à un code EBP facturé depuis moins de ' + r.seuilJours + ' j. Dormant = lié mais plus de ' + r.seuilJours + ' j. Un client non lié n’est ni actif ni dormant : on ne le devine pas (' + 'Plus › Clients EBP pour relier les codes).'),
    r.controle ? h('p', { class: 'mut' }, 'CA du mois : ' + eur(r.controle.totalCents) + ' au total · ' + eur(r.controle.secteursCents) + ' attribué à un secteur · ' + eur(r.controle.nonAttribueCents) + ' non attribué (code non lié ou garage sans commune).') : h('p', { class: 'mut' }, 'CA facturé non saisi : colonnes CA à « non renseigné ».'));
  if (!dep) {
    montrer('Secteurs', entete, h('h2', {}, 'Départements'), r.departements.length ? r.departements.map(d => carteSecteur({ ...d, nom: d.nom }, '#/secteurs/' + d.dep)) : h('p', { class: 'vide' }, 'Aucun garage placé dans un secteur.'),
      r.sans.garages ? carteSecteur(r.sans) : null, h('div', { style: 'height:96px' }));
    return;
  }
  const lignes = r.communes.filter(c => c.dep === dep);
  montrer('Secteur ' + dep, h('a', { class: 'btn sec', href: '#/secteurs' }, '‹ Tous les départements'), entete, lignes.length ? lignes.map(c => carteSecteur(c, '#/ville/' + c.id)) : h('p', { class: 'vide' }, 'Aucun garage dans ce département.'), h('div', { style: 'height:96px' }));
}

// ---------- Rendez-vous avec heure ----------
async function pageAgenda(clientPre) {
  const cl = (await getAll('clients')).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')), parId = new Map(cl.map(c => [c.id, c])), auj = jourLocal(new Date());
  const A = await get('meta', 'agenda'), R = ODICOLOR_RDV;
  const cli = h('select', { 'aria-label': 'Garage du rendez-vous' }, h('option', { value: '' }, 'Garage…'), cl.map(c => h('option', { value: c.id, selected: c.id === clientPre }, c.nom)));
  const dt = h('input', { type: 'date', value: auj, min: auj, 'aria-label': 'Date du rendez-vous' }), hr = h('input', { type: 'time', value: '09:00', 'aria-label': 'Heure du rendez-vous' });
  const du = h('select', { 'aria-label': 'Durée' }, R.DUREES.map(d => h('option', { value: d, selected: d === R.DUREE_DEFAUT }, d + ' min'))), ob = h('input', { maxlength: 200, placeholder: 'Objet (facultatif)', 'aria-label': 'Objet du rendez-vous' }), msg = h('p', { class: 'mut', role: 'status' });
  const sauver = async (m, texte) => { await put('meta', m, 'agenda'); if (texte) toast(texte); pageAgenda(null); };
  const creer = async confirme => {
    const c = parId.get(Number(cli.value));
    try { await sauver(R.ajouter(await get('meta', 'agenda'), { clientId: c ? c.id : 0, clientNom: c ? c.nom : '', date: dt.value, heure: hr.value, duree: Number(du.value), objet: ob.value }, { id: nouvelUid(), maintenant: new Date().toISOString(), auj, confirme }), 'Rendez-vous enregistré.'); }
    catch (e) { if (e.confirmation) { if (confirm(e.controle.avertissements.join('\n') + '\n\nEnregistrer quand même ?')) await creer(true); } else { msg.textContent = e.message; msg.style.color = 'var(--ko)'; } }
  };
  const aVenir = R.aVenir(A, auj, 14);
  const carteRdv = r => { const c = parId.get(r.clientId);
    const nd = h('input', { type: 'date', value: r.date, min: auj, 'aria-label': 'Nouvelle date' }), nh = h('input', { type: 'time', value: r.heure, 'aria-label': 'Nouvelle heure' });
    return h('div', { class: 'carte' }, h('div', { class: 'elan-tete' }, h('strong', {}, r.heure + ' · ' + (c ? c.nom : r.clientNom)), h('small', { class: 'mut' }, r.duree + ' min')),
      r.objet ? h('p', { class: 'mut' }, r.objet) : null, c && c.ville ? h('p', { class: 'mut' }, c.ville) : null,
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/visite/' + r.clientId }, 'Visiter'),
        h('button', { class: 'btn sec', type: 'button', onclick: async () => { await sauver(R.terminer(await get('meta', 'agenda'), r.id, { maintenant: new Date().toISOString() }), 'Rendez-vous terminé.'); } }, 'Terminé'),
        h('button', { class: 'btn sec', type: 'button', onclick: async () => { const mo = prompt('Motif de l’annulation :'); if (!mo || !mo.trim()) return; await sauver(R.annuler(await get('meta', 'agenda'), r.id, mo, { maintenant: new Date().toISOString() }), 'Rendez-vous annulé.'); } }, 'Annuler')),
      h('details', {}, h('summary', {}, 'Déplacer'), nd, nh, h('button', { class: 'btn sec', type: 'button', onclick: async () => { try { await sauver(R.deplacer(await get('meta', 'agenda'), r.id, nd.value, nh.value, { maintenant: new Date().toISOString(), auj }), 'Rendez-vous déplacé.'); } catch (e) { toast(e.message, true); } } }, 'Enregistrer le déplacement'))); };
  const jours = [...new Set(aVenir.map(r => r.date))];
  montrer('Rendez-vous', h('div', { class: 'carte obj' }, h('strong', {}, aVenir.filter(r => r.date === auj).length + ' rendez-vous aujourd’hui · ' + aVenir.length + ' dans les 14 jours'), h('p', { class: 'mut' }, 'Les rendez-vous du jour deviennent des points fixes de la tournée proposée. Les temps de trajet affichés sont des estimations à vol d’oiseau.')),
    h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/proposition' }, 'Proposer ma tournée du jour')),
    jours.length ? jours.map(j => [h('h2', {}, j === auj ? 'Aujourd’hui' : dateFr(j + 'T12:00:00')), aVenir.filter(r => r.date === j).map(carteRdv)]) : h('p', { class: 'vide' }, 'Aucun rendez-vous à venir.'),
    h('h2', {}, 'Nouveau rendez-vous'), cli, dt, hr, du, ob, msg, h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => creer(false) }, 'Enregistrer')), h('div', { style: 'height:96px' }));
}

// ---------- Démonstration : données 100 % fictives, uniquement sur une base vide ----------
async function pageDemo() {
  if (espaceTerrain()) return montrer('Mon espace de travail', h('section', {class:'carte'}, h('strong', {}, 'Cet espace est réservé à tes garages.'), h('p', {}, 'Les essais avec des données fictives restent dans la démonstration séparée.'), h('a', {class:'btn', href:'#/'}, 'Retour à l’accueil')));
  const [cl, dv, ar, demo] = [await getAll('clients'), await getAll('devis'), await getAll('articles'), await get('meta', 'demo')], auj = jourLocal(new Date());
  const vide = !cl.length && !dv.length && !ar.length, d = ODICOLOR_DEMO.generer(auj, ODICOLOR_COMMUNES_CENTRES);
  const telecharger2 = (nom, texte) => telecharger(nom, texte, 'text/csv');
  montrer('Démonstration',
    h('div', { class: 'carte alerte' }, h('strong', {}, 'DONNÉES 100 % FICTIVES. '), 'Garages « DÉMO », montants inventés. Jamais mélangé à tes vraies données : le chargement n’est possible que sur un téléphone VIDE.'),
    demo ? h('div', { class: 'carte' }, h('strong', {}, 'Démonstration chargée le ' + dateFr(demo.creeLe + 'T12:00:00')), h('p', { class: 'mut' }, 'Quitter efface ces données fictives (une copie de récupération reste dans Réglages).'),
      h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (!confirm('Quitter la démonstration et effacer les données fictives ?')) return; try { await restaurerSauvegardeLocale({ appli: 'devis-terrain', version: 2, date: new Date().toISOString(), stores: { articles: [], clients: [], devis: [], meta: [] } }); DB.db.close(); location.hash = '#/'; location.reload(); } catch (e) { toast('Impossible : ' + e.message, true); } } }, 'Quitter la démonstration'))
      : h('div', { class: 'carte' }, h('strong', {}, d.resume.garages + ' garages (' + d.resume.clients + ' clients, ' + d.resume.prospects + ' prospects) · ' + d.resume.devis + ' devis · 2 rendez-vous'),
        vide ? h('button', { class: 'btn', type: 'button', onclick: async () => { try { await restaurerSauvegardeLocale({ appli: 'devis-terrain', version: 2, date: new Date().toISOString(), stores: { articles: [], clients: d.clients, devis: d.devis, meta: [['settings', { ...SET_DEF, ...d.settings }], ['agenda', d.agenda], ['demo', { version: 1, creeLe: auj }]] } }); DB.db.close(); location.hash = '#/cockpit'; location.reload(); } catch (e) { toast('Chargement impossible : ' + e.message, true); } } }, 'Charger la démonstration')
          : h('p', { class: 'mut' }, 'Ce téléphone contient déjà des données (' + cl.length + ' garage(s), ' + dv.length + ' devis) : la démonstration ne peut pas y être chargée, pour ne rien mélanger ni remplacer. Utilise un autre profil de navigateur ou un téléphone vide.')),
    h('h2', {}, 'Fichiers d’essai EBP (fictifs)'), h('p', { class: 'mut' }, 'À importer pour essayer tout le parcours : clients (Plus › Clients EBP), puis pièces (CA facturé › Importer un export EBP), puis recensement (Carte). Noms de colonnes EBP = hypothèse, à confirmer avec un vrai export.'),
    Object.entries(d.fichiers).map(([nom, txt]) => h('div', { class: 'actions' }, h('button', { class: 'btn sec', type: 'button', onclick: () => telecharger2(nom, txt) }, 'Télécharger ' + nom))), h('div', { style: 'height:96px' }));
}

// ---------- Autotest : contrôles exécutés sur le téléphone lui-même, un seul rapport ----------
async function pageAutotest() {
  const liste = h('div'), resume = h('p', { role: 'status' }), rapport = h('textarea', { 'aria-label': 'Rapport de l’autotest', readonly: 'readonly', rows: 10, style: 'width:100%;font:12px monospace' });
  const B = ODICOLOR_BACKUP, ms = async f => { const t = performance.now(), v = await f(); return [Math.round(performance.now() - t), v]; };
  const controles = [
    ['env', 'Appareil et affichage', async () => ({ ok: true, info: true, detail: (navigator.userAgent.match(/\(([^)]*)\)/) || ['', '?'])[1] + ' · écran ' + screen.width + '×' + screen.height + ' ×' + (window.devicePixelRatio || 1) + ' · tactile ' + (navigator.maxTouchPoints || 0) + ' · ' + (matchMedia('(display-mode: standalone)').matches ? 'application installée (plein écran)' : 'navigateur (non installée)') + ' · ' + (navigator.onLine ? 'en ligne' : 'hors ligne') })],
    ['idb', 'Stockage IndexedDB (base temporaire séparée, tes données ne sont pas touchées)', async () => { const nom = 'odicolor-autotest-' + Date.now(); const [t] = await ms(async () => { const db = await new Promise((ok, ko) => { const r = indexedDB.open(nom, 1); r.onupgradeneeded = () => r.result.createObjectStore('x'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); await new Promise((ok, ko) => { const tx = db.transaction('x', 'readwrite'); for (let i = 0; i < 1000; i++) tx.objectStore('x').put({ i, t: 'garage fictif ' + i }, i); tx.oncomplete = ok; tx.onerror = () => ko(tx.error); }); const n = await new Promise(ok => { const r = db.transaction('x').objectStore('x').count(); r.onsuccess = () => ok(r.result); }); db.close(); await new Promise(ok => { const r = indexedDB.deleteDatabase(nom); r.onsuccess = r.onerror = r.onblocked = ok; }); if (n !== 1000) throw new Error('1000 écrits, ' + n + ' relus'); }); return { ok: true, detail: '1000 enregistrements écrits, relus, supprimés en ' + t + ' ms' }; }],
    ['crypto', 'Chiffrement (dérivation de clé 600 000 itérations)', async () => { const [t] = await ms(() => crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(16), iterations: 600000 }, null, { name: 'AES-GCM', length: 256 }, false, ['encrypt']).catch(async () => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('phrase autotest'), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(16), iterations: 600000 }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt']); })); return { ok: t < 8000, detail: t + ' ms' + (t >= 3000 ? ' (lent : la sauvegarde prendra quelques secondes)' : '') }; }],
    ['sauvegarde', 'Sauvegarde chiffrée : aller-retour complet avec photo et PDF, mauvaise phrase refusée', async () => {
      const photo = new Blob([new Uint8Array(200000).map((_, i) => i % 251)], { type: 'image/webp' }), pdf = new Blob(['%PDF-1.4 autotest'], { type: 'application/pdf' });
      const stores = { articles: [], clients: Array.from({ length: 500 }, (_, i) => ({ id: i + 1, nom: 'AUTOTEST ' + i, statutCrm: 'prospect' })), devis: [], meta: [['settings', {}], ['garage-photo-v38:1', { blob: photo, date: '2026-01-01' }], ['pdfFournisseursIndex', [{ id: 'p', nom: 'a.pdf', fournisseur: 'x', size: pdf.size }]], ['pdfFournisseur:p', { id: 'p', blob: pdf }]], recuperations: [] };
      const [t1, enc] = await ms(() => B.encodeChiffre(stores, 'phrase autotest 123')), [t2, dec] = await ms(() => B.decode(enc.file, { phrase: 'phrase autotest 123' }));
      const m = new Map(dec.stores.meta); if (dec.stores.clients.length !== 500 || m.get('garage-photo-v38:1').blob.size !== 200000 || m.get('pdfFournisseur:p').blob.size !== pdf.size) throw new Error('données différentes après relecture');
      let refus = false; try { await B.decode(enc.file, { phrase: 'mauvaise phrase 123' }); } catch (e) { refus = e.code === 'PHRASE_INCORRECTE'; } if (!refus) throw new Error('une mauvaise phrase n’a pas été refusée');
      return { ok: true, detail: 'chiffrement ' + t1 + ' ms, déchiffrement ' + t2 + ' ms, ' + Math.round(enc.file.size / 1024) + ' Ko' }; }],
    ['sw', 'Hors ligne : service worker actif et à jour', async () => { if (!('serviceWorker' in navigator)) throw new Error('service worker non pris en charge'); const reg = await navigator.serviceWorker.getRegistration(); if (!reg || !reg.active) throw new Error('aucun service worker actif : rouvre l’application en ligne une fois'); return { ok: !reg.waiting, detail: 'actif · version ' + String(window.ODICOLOR_PWA.release).slice(0, 8) + (navigator.serviceWorker.controller ? ' · contrôle cette page' : ' · ne contrôle pas encore cette page (recharge)') + (reg.waiting ? ' · MISE À JOUR EN ATTENTE : ferme toutes les fenêtres puis rouvre' : '') }; }],
    ['cache', 'Hors ligne : chaque fichier de l’application est dans la copie locale', async () => { const els = [...document.querySelectorAll('script[src],link[rel=stylesheet][href]')].map(e => e.src || e.href).filter(u => /odicolor=/.test(u)); let manque = []; for (const u of els) if (!(await caches.match(u))) manque.push(u.replace(/\?.*/, '').split('/').pop()); return { ok: els.length > 10 && !manque.length, detail: (els.length - manque.length) + '/' + els.length + ' fichiers en copie locale' + (manque.length ? ' · MANQUE : ' + manque.slice(0, 5).join(', ') : '') }; }],
    ['stockage', 'Stockage protégé et espace disponible', async () => { const p = navigator.storage && navigator.storage.persist ? (await navigator.storage.persisted()) || (await navigator.storage.persist()) : null, e = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; return { ok: true, info: true, detail: 'protégé : ' + (p === null ? 'inconnu' : p ? 'oui' : 'non (fais des sauvegardes)') + (e ? ' · utilisé ' + Math.round((e.usage || 0) / 1048576) + ' Mo sur ' + Math.round((e.quota || 0) / 1048576) + ' Mo' : '') }; }],
    ['vitesse', 'Vitesse : carte (5 000 garages) et Ma Ville (1 500 garages) sur CE téléphone', async () => { ODICOLOR_CARTE.charger(ODICOLOR_COMMUNES_CENTRES); const rows = ODICOLOR_COMMUNES_CENTRES.filter(r => r[4]), mk = n => Array.from({ length: n }, (_, i) => { const r = rows[(i * 7) % rows.length]; return { id: i + 1, nom: 'AUTOTEST ' + i, ville: r[1], cp: r[4].split(' ')[0], statutCrm: i % 4 ? 'prospect' : 'client' }; });
      const [t1] = await ms(() => { const prep = ODICOLOR_CARTE.preparer(mk(5000), null); const v = ODICOLOR_CARTE.cadrer(prep, 360, 640); for (let i = 0; i < 10; i++) ODICOLOR_CARTE.regrouper(prep, ODICOLOR_CARTE.zoomer(v, 1 + i / 5, 180, 320)); });
      const [t2] = await ms(() => ModeleCommune.construire({ arrete: jourLocal(new Date()), dates: { Terrain: jourLocal(new Date()) }, terrain: mk(1500), clientsEbp: [], piecesEbp: [], annuaire: [], liaisonsValidees: [] }));
      return { ok: t1 < 6000 && t2 < 8000, detail: 'carte : ' + t1 + ' ms (préparation + 10 gestes) · Ma Ville : ' + t2 + ' ms' }; }]
  ];
  const manuels = ['Installer l’application sur l’écran d’accueil et l’ouvrir depuis l’icône.', 'Mode avion : ouvrir l’application et ajouter une visite.', 'Prendre une photo et ajouter un PDF sur une fiche garage.', 'Restaurer une sauvegarde depuis Téléchargements avec le sélecteur de fichiers (mauvaise phrase d’abord).', 'Carte et Ma Ville au doigt : fluides ? (juge visuel)'];
  const lignes = [];
  const maj = () => { const ok = lignes.filter(l => l.ok && !l.info).length, ko = lignes.filter(l => !l.ok).length; resume.textContent = ko ? '✗ ' + ko + ' contrôle(s) en échec sur ' + lignes.length : lignes.length < controles.length ? 'Contrôles en cours… (' + lignes.length + '/' + controles.length + ')' : '✓ Tous les contrôles automatiques réussis (' + ok + ' validés)';
    resume.style.color = ko ? 'var(--ko)' : '';
    rapport.value = ['ODICOLOR AUTOTEST · version ' + String(window.ODICOLOR_PWA.release).slice(0, 8) + ' · ' + new Date().toLocaleString('fr-FR'), ...lignes.map(l => (l.info ? '[INFO]  ' : l.ok ? '[OK]    ' : '[ÉCHEC] ') + l.titre + ' — ' + l.detail), '', 'À FAIRE À LA MAIN :', ...manuels.map((m, i) => (i + 1) + '. ' + m)].join('\n'); };
  montrer('Autotest', h('div', { class: 'carte obj' }, h('strong', {}, 'Contrôles automatiques sur ton téléphone'), h('p', { class: 'mut' }, 'Aucune de tes données n’est touchée (bases temporaires séparées). À la fin : « Copier le rapport » et colle-le dans la conversation.')), resume, liste,
    h('h2', {}, 'À faire à la main (impossible à automatiser)'), h('ol', {}, manuels.map(m => h('li', {}, m))), h('h2', {}, 'Rapport'), rapport,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(rapport.value); toast('Rapport copié.'); } catch (e) { rapport.select(); toast('Sélectionne et copie le texte du rapport.', true); } } }, 'Copier le rapport'), h('button', { class: 'btn sec', type: 'button', onclick: () => pageAutotest() }, 'Relancer')), h('div', { style: 'height:96px' }));
  maj();
  for (const [id, titre, f] of controles) {
    let r; try { r = await f(); } catch (e) { r = { ok: false, detail: e.message || String(e) }; }
    const l = { id, titre, ...r }; lignes.push(l);
    liste.append(h('div', { class: 'carte', 'data-controle': id, 'data-ok': l.ok ? '1' : '0' }, h('strong', {}, (l.info ? 'ℹ ' : l.ok ? '✓ ' : '✗ ') + titre), h('p', { class: 'mut' }, l.detail))); maj();
  }
}

async function pageReglages() {
  const tva = h('input', { value: pct(S.tva100), inputmode: 'decimal', 'aria-label': 'TVA %' }),
    rem = h('input', { value: pct(S.remiseMax100), inputmode: 'decimal', 'aria-label': 'Remise maximale %' }),
    ind = h('input', { value: S.indicatif, inputmode: 'numeric', 'aria-label': 'Indicatif' }),
    soc = h('input', { value: S.societe, 'aria-label': 'Nom sur le devis' }),
    ven = h('input', { value: S.vendeur, 'aria-label': 'Ton nom', autocomplete: 'name' }),
    rNom = h('input', { value: S.respNom || '', maxlength: 60, 'aria-label': 'Nom du responsable' }),
    rTel = h('input', { value: S.respTel || '', inputmode: 'tel', maxlength: 20, 'aria-label': 'Téléphone du responsable' }),
    rel = h('input', { value: S.relanceJours || 3, inputmode: 'numeric', 'aria-label': 'Jours avant relance de devis' }),
    dU = h('input', { value: S.delaiUrgentH || 4, inputmode: 'numeric', 'aria-label': 'Délai signalement urgent en heures' }),
    dN = h('input', { value: S.delaiNormalH || 48, inputmode: 'numeric', 'aria-label': 'Délai signalement normal en heures' }),
    bEs = h('input', { value: (S.depart || {}).essais || '', inputmode: 'numeric', 'aria-label': 'Essais par semaine avant' }),
    bRe = h('input', { value: (S.depart || {}).relances || '', inputmode: 'numeric', 'aria-label': 'Relances par semaine avant' }),
    bAp = h('input', { value: (S.depart || {}).appels || '', inputmode: 'numeric', 'aria-label': 'Appels vers le responsable par semaine avant' }),
    oSem = h('input', { value: S.objSemaine ? String(S.objSemaine / 100) : '', inputmode: 'decimal', placeholder: 'Facultatif (€)', 'aria-label': 'Objectif de la semaine' }),
    hLim = h('input', { type: 'time', value: S.heureLimite || '', 'aria-label': 'Heure limite des commandes' }),
    bCo = h('input', { value: (S.depart || {}).commandes || '', inputmode: 'numeric', 'aria-label': 'Commandes par semaine avant' }),
    objD = h('input', { type: 'month', value: S.objDepart || '', 'aria-label': 'Mois de départ des objectifs' }),
    objs = [0, 1, 2].map(i => h('input', { value: (S.objectifs && S.objectifs[i]) ? String(S.objectifs[i] / 100) : '', inputmode: 'decimal', placeholder: 'Mois ' + (i + 1) + ' (€)', 'aria-label': 'Objectif du mois ' + (i + 1) }));
  const stock = h('p', { class: 'mut' }, 'Stockage : vérification…');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => { stock.textContent = p ? 'Stockage protégé : le navigateur ne l’effacera pas tout seul.' : 'Stockage non protégé : fais une sauvegarde régulièrement.'; });
  const fich = h('input', { type: 'file', accept: '.odicolor,.json', 'aria-label': 'Fichier de sauvegarde' });
  const champPhrase = (nom) => h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': nom, autocapitalize: 'off', spellcheck: 'false' });
  const phrase1 = champPhrase('Phrase secrète'), phrase2 = champPhrase('Confirmer la phrase secrète'), phraseRestau = champPhrase('Phrase secrète de la sauvegarde à restaurer');
  const recuperations = await panneauRecuperations(() => phrase1.value);
  montrer('Réglages',
    h('div', { class: 'carte alerte' }, 'Valeurs par défaut non confirmées : TVA 8,5 % et remise maximale 60 % sont des hypothèses. Vérifie-les avant usage réel.'),
    h('label', {}, 'TVA (%)'), tva, h('label', {}, 'Remise maximale (%)'), rem, h('label', {}, 'Indicatif WhatsApp (33 = France, 262 = La Réunion)'), ind, h('label', {}, 'Nom sur le devis'), soc, h('label', {}, 'Ton nom (joint aux devis envoyés)'), ven,
    h('h2', {}, 'Responsable (commandes, signalements, Point)'), h('label', {}, 'Nom'), rNom, h('label', {}, 'Téléphone WhatsApp (ex. 06 12 34 56 78)'), rTel,
    h('label', {}, 'Relancer un devis après … jours (hypothèse : 3)'), rel, h('label', {}, 'Délai de réponse attendu, signalement urgent (heures, hypothèse : 4)'), dU, h('label', {}, 'Idem, signalement normal (heures, hypothèse : 48)'), dN,
    h('h2', {}, 'Point de départ (avant l’appli, par semaine)'), h('label', {}, 'Essais lancés'), bEs, h('label', {}, 'Relances de devis'), bRe, h('label', {}, 'Commandes passées'), bCo, h('label', {}, 'Appels ou messages vers le responsable'), bAp,
    h('h2', {}, 'Semaine'), h('label', {}, 'Objectif de la semaine en € (atteint le vendredi après-midi ; vide = déduit du mois)'), oSem, h('label', {}, 'Heure limite des commandes à préparer le jour même (à fixer avec le responsable)'), hLim,
    h('h2', {}, 'Objectifs mensuels'), h('label', {}, 'Premier mois'), objD, h('label', {}, 'Objectif du 1er, 2e et 3e mois (€). Au-delà : le dernier est repris.'), objs,
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
      let a, b;
      try { a = parseCents(tva.value); b = parseCents(rem.value); } catch (e) { a = b = null; }
      if (a == null || a < 0 || a > 10000 || b == null || b < 0 || b > 10000) { toast('TVA et remise doivent être entre 0 et 100.', true); return; }
      let ob;
      try { ob = objs.map(i => (i.value.trim() ? parseCents(i.value) : 0)); } catch (e) { ob = null; }
      if (!ob || ob.some(v => v < 0 || v > 1e9)) { toast('Objectifs : montants invalides.', true); return; }
      const ent = (v, d0, mx) => { const n = Math.round(Number(String(v).replace(',', '.'))); return isFinite(n) && n > 0 && n <= mx ? n : d0; };
      const dep = {}; [['essais', bEs], ['relances', bRe], ['commandes', bCo], ['appels', bAp]].forEach(([k, i]) => { const n = Math.round(Number(i.value)); if (isFinite(n) && n > 0 && n < 10000) dep[k] = n; });
      let os = 0; try { os = oSem.value.trim() ? parseCents(oSem.value) : 0; } catch (e) { os = null; }
      if (os == null || os < 0 || os > 1e9) { toast('Objectif de la semaine : montant invalide.', true); return; }
      S = { ...S, objSemaine: os, heureLimite: /^\d\d:\d\d$/.test(hLim.value) ? hLim.value : '', respNom: clean(rNom.value).slice(0, 60), respTel: clean(rTel.value).slice(0, 20), relanceJours: ent(rel.value, 3, 60), delaiUrgentH: ent(dU.value, 4, 720), delaiNormalH: ent(dN.value, 48, 720), depart: dep, objDepart: /^\d{4}-\d\d$/.test(objD.value) ? objD.value : '', objectifs: ob, tva100: a, remiseMax100: b, indicatif: clean(ind.value).replace(/\D/g, '') || '33', societe: clean(soc.value).slice(0, 60) || 'Odicolor', vendeur: clean(ven.value).slice(0, 60) };
      await put('meta', S, 'settings'); toast('Réglages enregistrés.');
    } }, 'Enregistrer')),
    h('h2', {}, 'Sauvegarde'),
    h('p', { class: 'mut' }, 'Tes devis et clients ne sont QUE sur ce téléphone. Si tu perds le téléphone ou effaces les données du navigateur, ils sont perdus. Sauvegarde régulièrement, puis envoie le fichier où tu veux.'),
    h('p', { class: 'mut' }, 'Les sauvegardes sont chiffrées avec une phrase secrète (', String(ODICOLOR_BACKUP.PHRASE_MIN), ' caractères minimum). Elle n’est jamais enregistrée : si tu l’oublies, la sauvegarde est définitivement illisible. Note-la ailleurs que sur ce téléphone.'),
    h('label', {}, 'Phrase secrète de la sauvegarde'), phrase1, h('label', {}, 'Confirme la phrase secrète'), phrase2,
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async event => {
      const btn=event.currentTarget;
      if(phrase1.value!==phrase2.value){toast('Les deux phrases ne sont pas identiques.',true);return}
      btn.disabled=true;
      try{const r=await exporterSauvegarde(phrase1.value);phrase1.value=phrase2.value='';toast('Copie chiffrée et relue : '+r.garages+' garages, '+r.photos+' photos, '+r.pdf+' PDF. Vérifie les téléchargements.');}
      catch(e){toast('Sauvegarde impossible : '+e.message,true)}finally{btn.disabled=false}
    } }, 'Télécharger une sauvegarde chiffrée')),
    h('label', {}, 'Restaurer une sauvegarde (contrôle avant remplacement)'), fich,
    h('label', {}, 'Phrase secrète (seulement si la sauvegarde est chiffrée)'), phraseRestau,
    h('p', {class:'mut'}, 'La sauvegarde complète inclut clients, notes, historiques, tarifs, photos, PDF et suivi PC. Conserve une copie hors du téléphone. Ferme les autres onglets ODICOLOR avant de restaurer. L’état remplacé sera conservé dans les copies de récupération ci-dessous.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: async event => {
      const btn=event.currentTarget;btn.disabled=true;
      try {
        const f = fich.files[0]; if (!f) { toast('Choisis un fichier de sauvegarde.', true); return; }
        const o=await ODICOLOR_BACKUP.decode(f,{phrase:phraseRestau.value}),resume=verifierSauvegardeLocale(o);phraseRestau.value='';
        const avertissement=o.version===1
          ? ' Ancien JSON incomplet : aucun tarif, photo ou PDF n’est fourni. Le catalogue actif sera vide ; importe ensuite les tarifs EBP. Les tarifs, photos, PDF et suivis locaux remplacés resteront dans la copie de récupération, sans être mélangés au portefeuille restauré.'
          : ' Tarifs, photos, PDF et suivis actifs seront remplacés par ceux de la sauvegarde.';
        if(!confirm('Restaurer '+resume.garages+' garages et '+resume.devis+' devis ?'+avertissement+
          ' L’état actuel sera archivé avant remplacement. Cette opération ne fusionne pas les fiches. L’application redémarrera ; enregistre tes saisies avant de continuer.'))return;
        await restaurerSauvegardeLocale(o);
        DB.db.close();location.reload();
      } catch (e) { toast('Restauration annulée : ' + e.message, true); }
      finally{btn.disabled=false}
    } }, 'Restaurer après contrôle')),
    recuperations,
    stock,
    h('h2', {}, 'Données'),
    h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: async () => {
      if (!confirm('Effacer les données actives (tarifs, clients, devis, photos, PDF et suivis) ? Une copie locale de récupération sera conservée. Sauvegarde aussi hors du téléphone avant de continuer.')) return;
      try{await restaurerSauvegardeLocale({appli:'devis-terrain',version:2,date:new Date().toISOString(),stores:{articles:[],clients:[],devis:[],meta:[]}});DB.db.close();location.reload();}
      catch(e){toast('Effacement annulé : '+e.message,true)}
    } }, 'Effacer les données actives')),
    h('p', { class: 'mut' }, 'Noyau ' + VERSION + ' · Fonctionne sans réseau · Les données restent sur ce téléphone sauf partage volontaire.'));
}


// ---------- v47 : restauration sûre et atomique, sans écriture partielle ----------
// Fichier complet versionné ou ancien JSON : contrôler avant toute écriture.
function verifierSauvegardeLocale(o) {
  return ODICOLOR_BACKUP.validate(o);
}
async function restaurerSauvegardeLocale(o) {
  if(DB.maintenance)throw new Error('Une restauration est déjà en cours.');
  verifierSauvegardeLocale(o);
  DB.maintenance=true;
  try{return await avecRestaurationExclusive(()=>ODICOLOR_BACKUP.restore(DB.db,o))}
  finally{DB.maintenance=false}
}

// ---------- lien avec le PC (sauvegarde envoyée au PC, plan de la semaine reçu du PC) ----------
function telechargerFichierSauvegarde(file, nom) {
  const url=URL.createObjectURL(file),a=h('a',{href:url,download:nom});
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exporterSauvegarde(phrase) {
  // Chiffrement obligatoire : la phrase n'est jamais conservée. La copie est relue et déchiffrée AVANT d'être proposée au téléchargement.
  const data=await ODICOLOR_BACKUP.read(DB.db);
  const {file,summary}=await ODICOLOR_BACKUP.encodeChiffre(data,phrase);
  const relu=await ODICOLOR_BACKUP.decode(file,{phrase});
  if(relu.stores.clients.length!==summary.garages||relu.stores.devis.length!==summary.devis)throw new Error('Contrôle de relecture échoué : la copie n’est pas fournie.');
  telechargerFichierSauvegarde(file,'odicolor-sauvegarde-'+new Date().toISOString().replace(/[:.]/g,'-')+'.odicolor');
  return summary;
}
async function exporterSauvegardePC() {
  const data=await ODICOLOR_BACKUP.read(DB.db,ODICOLOR_BACKUP.STORES);
  telecharger('odicolor-echange-pc-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(ODICOLOR_BACKUP.pcExchange(data)),'application/json');
}
async function panneauRecuperations(lirePhrase) {
  const archives=await getAll(ODICOLOR_BACKUP.RECOVERY);
  const box=h('details',{class:'carte'},h('summary',{},'États conservés avant restauration · '+archives.length),
    h('p',{class:'mut'},'Ces copies locales permettent de retrouver l’état remplacé. Elles ne remplacent pas une sauvegarde conservée hors du téléphone. Aucune archive n’est effacée automatiquement.'));
  const list=h('div');let visible=0;
  const more=h('button',{class:'btn sec',type:'button'},'Afficher la suite');
  const show=()=>{
    for(const r of archives.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(visible,visible+10)){
      const btn=h('button',{class:'btn sec',type:'button',onclick:async()=>{
        btn.disabled=true;
        try{const ph=lirePhrase?lirePhrase():'';if(!ph)throw new Error('saisis d’abord la phrase secrète (copie chiffrée).');const {file,warning}=await ODICOLOR_BACKUP.encodeChiffre(r.stores,ph,{recovery:true});telechargerFichierSauvegarde(file,'odicolor-recuperation-'+r.id+'.odicolor');toast(warning?'Copie brute conservée : données à réparer avant restauration.':'Copie préparée : vérifie sa présence dans les téléchargements.',Boolean(warning));}
        catch(e){toast('Export impossible : '+e.message,true)}finally{btn.disabled=false}
      }},'Télécharger cette copie');
      list.append(h('div',{class:'carte'},h('strong',{},new Date(r.date).toLocaleString('fr-FR')),h('p',{class:'mut'},r.stores.clients.length+' garages · '+r.stores.devis.length+' devis'),btn));
    }
    visible+=10;more.hidden=visible>=archives.length;
  };
  more.addEventListener('click',show);box.append(list,more);show();return box;
}
const normNom = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const lirePC = async () => { const v = await get('meta', 'pc'); return v && v.appli === 'plan-pc' && Array.isArray(v.actions) ? v : null; };
function nettoyerPlan(o) {
  const t = (v, n = 200) => clean(String(v == null ? '' : v)).slice(0, n), j = v => (/^\d{4}-\d\d-\d\d$/.test(v || '') ? v : '');
  const nn = (v, m = 1e9) => (typeof v === 'number' && isFinite(v) ? Math.max(-m, Math.min(m, v)) : 0), kp = x => (x && /^\d{4}-\d\d-\d\d$/.test(x.debut || '') ? { debut: x.debut, fin: j(x.fin), cmdN: nn(x.cmdN, 1e5), cmdHt: nn(x.cmdHt), facN: nn(x.facN, 1e5), facHt: nn(x.facHt) } : null);
  const K = o.kpi && typeof o.kpi === 'object' ? o.kpi : {}, kpi = {}; ['semaine', 'passee', 'avant', 'mois', 'moisPrec'].forEach(c => { const v = kp(K[c]); if (v) kpi[c] = v; });
  if (K.echu && typeof K.echu === 'object') kpi.echu = { n: nn(K.echu.n, 1e5), reste: K.echu.reste == null ? null : nn(K.echu.reste), sansMontant: nn(K.echu.sansMontant, 1e5), aVerifier: nn(K.echu.aVerifier, 1e5) };
  return { appli: 'plan-pc', version: 2, kpi, date: /^\d{4}-\d\d-\d\d/.test(o.date || '') ? String(o.date).slice(0, 30) : new Date().toISOString(), arrete: j(o.arrete), recuLe: new Date().toISOString(),
    changement: o.changement && o.changement.texte ? { texte: t(o.changement.texte, 300), mesure: t(o.changement.mesure, 200) } : null,
    indicateurs: (Array.isArray(o.indicateurs) ? o.indicateurs : []).slice(0, 12).map(x => ({ l: t(x && x.l, 60), v: t(x && x.v, 60), n: t(x && x.n, 100) })),
    actions: (Array.isArray(o.actions) ? o.actions : []).slice(0, 200).map(x => ({ id:t(x&&x.id,150), prio:Math.max(1,Math.min(3,Number(x&&x.prio)||3)), statut:['a_faire','fait','reporte','bloque'].includes(x&&(x.statut||x.etat))?(x.statut||x.etat):'a_faire', note:t(x&&x.note,300), jourPrevu:j(x&&x.jourPrevu||x&&x.reportLe), modifieLe:t(x&&x.modifieLe,35), responsable:t(x&&x.responsable,50), jour: j(x && x.jour), t: t(x && x.t), d: t(x && x.d), preuve:t(x&&x.preuve,500), source:t(x&&x.source,90), qualite:t(x&&x.qualite,100), tag: t(x && x.tag, 20), client: t(x && x.client, 80) })).filter(x => x.t),
    clients: (Array.isArray(o.clients) ? o.clients : []).slice(0, 600).map(x => ({ nom: t(x && x.nom, 80), code: t(x && x.code, 20), niveau: ['ok', 'warn', 'bad'].includes(x && x.niveau) ? x.niveau : 'ok', lignes: (Array.isArray(x && x.lignes) ? x.lignes : []).slice(0, 8).map(l => t(l, 160)) })).filter(x => x.nom) };
}
function cartePC(pc) {
  const age = pc.arrete ? Math.floor((Date.now() - new Date(pc.arrete + 'T12:00:00').getTime()) / 864e5) : Infinity, nb = pc.actions.length;
  return h('a', { class: 'carte', href: '#/pc', style: 'display:block;color:inherit;text-decoration:none' }, h('div', { class: 'elan-tete' }, h('span', {}, h('strong', {}, 'Plan du PC'), h('br'), h('small', { class: 'mut' }, 'export EBP du ' + (pc.arrete?dateFr(pc.arrete+'T12:00:00'):'?') + ' · ' + nb + ' action' + (nb > 1 ? 's' : ''))), h('span', { class: 'tag ' + (age > 7 ? 'ko' : 'ok') }, !Number.isFinite(age) ? 'Date inconnue' : age > 7 ? 'Ancien' : 'Export récent')),
    pc.changement ? h('p', { class: 'mut', style: 'margin:8px 0 0' }, 'Changement proposé : ' + pc.changement.texte) : null);
}
async function blocPCClient(c) {
  const pc = await lirePC(); if (!pc) return null;
  const k = normNom(c.nom), e = pc.clients.find(x => normNom(x.nom) === k);
  if (!e || !e.lignes.length) return null;
  return h('div', { class: 'carte ' + (e.niveau === 'bad' ? 'alerte' : '') }, h('small', { class: 'etiq' }, 'VU PAR LE PC (export EBP du ' + (pc.arrete?dateFr(pc.arrete+'T12:00:00'):'date inconnue') + ')'), e.lignes.map(l => h('p', { style: 'margin:6px 0 0' }, l)));
}
// Import unique PC : appelé seulement depuis Réglages → Imports.
async function importerPlanPC(f){
  if(!f)throw new Error('Choisis le fichier du PC.');
  if(f.size>5*1024*1024)throw new Error('Fichier trop gros.');
  const o=JSON.parse(await f.text());
  if(!o||o.appli!=='plan-pc'||!Array.isArray(o.actions)||o.version!==2||!/^\d{4}-\d\d-\d\dT/.test(o.date||''))throw new Error('Plan PC v2 invalide.');
  if(o.chiffre&&o.chiffre.source==='demo')throw new Error('Plan fictif : import refusé.');
  const p=nettoyerPlan(o), previous=await lirePC();
  if(previous&&new Date(p.date).getTime()<=new Date(previous.date).getTime())throw new Error('Plan ancien ou déjà importé.');
  if(!confirm('Importer '+p.actions.length+' actions ? Le plan précédent sera conservé.'))return null;
  if(previous){
    const archives=(await get('meta','pcArchives'))||[];
    archives.push(previous);
    await put('meta',archives.slice(-5),'pcArchives');
    await put('meta',previous,'pcPrecedent');
  }
  const history=(await get('meta','pcActions'))||[];
  const by=new Map(history.map(x=>[x.id,x]));
  p.actions.forEach(a=>{
    const old=by.get(a.id);
    if(old&&old.modifieLe&&(!a.modifieLe||old.modifieLe>=a.modifieLe))
      Object.assign(a,{statut:old.statut||old.etat,note:old.note,jourPrevu:old.jourPrevu||old.reportLe,modifieLe:old.modifieLe});
    by.set(a.id,a);
  });
  await put('meta',Array.from(by.values()),'pcActions');
  await put('meta',p,'pc');
  return p;
}
async function pagePC() {
  const pc = await lirePC();
  montrer('Lien avec le PC',
    h('div', { class: 'carte' }, h('strong', {}, '1. Envoyer les données commerciales au PC'), h('p', { class: 'mut' }, 'Devis, commandes envoyées, clients, visites, tournées. Passe le fichier au PC comme tu veux : partage Samsung, câble ou mail à toi-même. Rien ne part tout seul.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => { await exporterSauvegardePC(); toast('Fichier d’échange PC préparé.'); } }, 'Télécharger le JSON pour le PC'))),
    h('div', { class: 'carte' }, h('strong', {}, '2. Recevoir le plan du PC'),
      h('p', { class: 'mut' }, 'Les imports se trouvent dans Réglages. Le plan reste consultable ici sans modifier tes données EBP.'),
      h('a', { class: 'btn sec', href: '#/reglages' }, 'Ouvrir Réglages · Imports')),
    pc ? h('div', { class: 'carte' }, h('strong', {}, 'Plan en cours'), h('p', { class: 'mut' }, 'Reçu le ' + dateFr(pc.recuLe || pc.date) + ' · export EBP du ' + (pc.arrete ? dateFr(pc.arrete + 'T12:00:00') : '?') + ' · pas en direct'),
      pc.changement ? h('div', { class: 'carte' }, h('strong', {}, 'Changement proposé'), h('p', {}, pc.changement.texte), pc.changement.mesure ? h('small', { class: 'mut' }, pc.changement.mesure) : null) : null,
      pc.indicateurs.length ? pc.indicateurs.map(x => h('div', { class: 'ligne' }, h('span', { class: 'g' }, h('strong', {}, x.l), x.n ? h('small', {}, ' · ' + x.n) : null), h('span', { class: 'prix' }, x.v))) : null,
      h('div', { class: 'carte' }, h('strong', {}, 'Mes priorités · une action à la fois'),
        pc.actions.filter(a=>a.statut!=='fait').slice(0,25).map(a=>{
          const maj=async patch=>{Object.assign(a,patch,{modifieLe:new Date().toISOString()});const all=(await get('meta','pcActions'))||[];const i=all.findIndex(x=>x.id===a.id);if(i>=0)all[i]={...a};else all.push({...a});await put('meta',all,'pcActions');await put('meta',pc,'pc');pagePC()};
          const demain=prochainOuvre(), lundi=jourLocal(new Date(new Date(lundiDe(new Date())+'T12:00:00').getTime()+7*864e5));
          return h('div',{class:'ligne',style:'display:block'},
          h('strong',{},'P'+a.prio+' · '+a.t),h('p',{class:'mut'},a.preuve||a.d||'Justification non renseignée.'),h('small',{class:'mut'},'Source : '+(a.source||'non précisée')+' · '+(a.qualite||'à vérifier')),h('p',{class:'mut'},(a.jourPrevu||a.jour||'Non planifiée')+' · '+(a.statut==='bloque'?'Bloquée'+(a.note?' ('+a.note+')':''):a.statut==='reporte'?'Reportée':'À faire')),
          h('div',{class:'actions'},h('button',{class:'btn',onclick:()=>maj({statut:'fait',note:''})},'Fait'),h('button',{class:'btn sec',onclick:()=>maj({statut:'reporte',jourPrevu:demain,note:''})},'Demain'),h('button',{class:'btn sec',onclick:()=>maj({statut:'reporte',jourPrevu:lundi,note:''})},'Lundi'),h('button',{class:'btn sec',onclick:()=>maj({statut:'bloque',note:S.respNom||'Mohamed'})},'Bloqué : '+(S.respNom||'Mohamed')),h('button',{class:'btn sec',onclick:()=>maj({statut:'bloque',note:'client'})},'Bloqué : client')))})),
      h('div', { class: 'actions' }, h('a', { class: 'btn sec', href: '#/feuille' }, 'Voir la feuille de route'), h('button', { class: 'btn sec', onclick: async () => { await rq(st('meta', 'readwrite').delete('pc')); toast('Plan effacé.'); pagePC(); } }, 'Effacer le plan'))) : h('p', { class: 'vide' }, 'Aucun plan reçu pour l’instant.'));
}

// ---------- démarrage ----------
(async () => {
  const etat = $('#etat');
  const maj = () => { etat.textContent = navigator.onLine ? '' : 'Hors ligne'; };
  addEventListener('online', maj); addEventListener('offline', maj); maj();
  try {
    if(!window.ODICOLOR_PWA)throw new Error('Version de l’application incomplète : recharge avec une connexion.');
    await window.ODICOLOR_PWA.ready;
    await openDB(); await chargerBase();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    addEventListener('hashchange', route); await route();
  } catch (e) {
    montrer('Erreur', h('div', { class: 'carte erreur', role: 'alert' }, 'Le stockage du navigateur est indisponible (mode privé ?). ' + e.message));
  }
})();
window.__t = { nettoyerPlan, normNom, planSemaine, indicateurs, semainesJusqua, tendance, factures, enRetard, feries, estOuvre, ecartJours, relanceDue, statsTournee, prochainOuvre, echeance, cibleSemaineDe, semaineObj, lundiDe, appelsSemaine, mesures, taches, relanceDue, coutPae, calculPoint, periodePoint, texteCommande, texteSignalement, sigEnRetard, objectifDuMois, activite, serie, jourLocal, analyserTexte, statsDevis, envoyerDevis, parseCents, parseQte, ligneTotal, totaux, importerArticles, importerClients, verifierSauvegardeLocale, restaurerSauvegardeLocale, csvDevis, devinerColonnes, ligneEntete, tel2wa };
