'use strict';
// Lot 3 : WhatsApp commercial manuel (logique). Numéros FICTIFS (plages réservées aux fictions : 06 39 98…). node --test tests/whatsapp-telephone.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const W = require('../whatsapp-v49.js');

test('numéros français : formats courants normalisés, affichage lisible', () => {
  for (const s of ['06 39 98 12 34', '06.39.98.12.34', '0639981234', '+33 6 39 98 12 34', '+33 (0)6 39 98 12 34', '0033639981234', '33639981234', 'tel:+33639981234']) {
    const r = W.normaliser(s); assert.equal(r.ok, true, s); assert.equal(r.intl, '33639981234', s); assert.equal(r.type, 'mobile');
  }
  assert.equal(W.normaliser('0639981234').affichage, '+33 6 39 98 12 34');
});

test('fixe accepté avec avertissement ; spécial, incomplet, illisible ou vide refusés avec motif', () => {
  const f = W.normaliser('01 99 00 12 34'); assert.equal(f.ok, true); assert.equal(f.type, 'fixe'); assert.match(f.avertissement, /peu probable/);
  for (const [s, m] of [['08 99 00 12 34', /spécial/], ['06 39 98 12', /Format non reconnu/], ['+33 6 39 98 12 3', /incomplet/], ['06 AB', /lettres/], ['', /non renseigné/]]) {
    const r = W.normaliser(s); assert.equal(r.ok, false, s); assert.match(r.motif, m, s);
  }
});

test('DOM et étranger au format international ; indicatif des réglages pour un 0… à 10 chiffres', () => {
  assert.equal(W.normaliser('+262 692 00 12 34').intl, '262692001234');
  assert.equal(W.normaliser('0692001234', '262').intl, '262692001234');
  assert.equal(W.normaliser('+32 470 12 34 56').type, 'international');
});

test('message prérempli personnalisé, lien wa.me encodé, texte borné', () => {
  const t = W.rediger('relance', { contact: 'M. Fictif', garage: 'GARAGE FICTIF ALPHA', vendeur: 'Commercial Fictif', societe: 'Odicolor' });
  assert.match(t, /^Bonjour M\. Fictif, Commercial Fictif de Odicolor\./); assert.match(t, /GARAGE FICTIF ALPHA/);
  assert.match(W.rediger('presentation', {}), /^Bonjour, votre commercial de Odicolor/);
  const l = W.lien('33639981234', 'Bonjour & à bientôt ?');
  assert.equal(l, 'https://wa.me/33639981234?text=' + encodeURIComponent('Bonjour & à bientôt ?'));
  assert.equal(decodeURIComponent(W.lien('33639981234', 'x'.repeat(5000)).split('text=')[1]).length, 1500);
  assert.throws(() => W.lien('', 'x'), /international/);
});

test('journal : « WhatsApp ouvert » seulement, jamais « envoyé » ; même jour + même texte = une seule entrée ; historique conservé', () => {
  const ancien = [{ canal: 'visite', le: '2026-11-01' }];
  const a = W.noterOuverture(ancien, { maintenant: '2026-11-14T09:00:00Z', jour: '2026-11-14', texte: 'Bonjour', modele: 'relance', intl: '33639981234', relance: '2026-11-17' });
  assert.equal(a.doublon, false); assert.equal(a.contacts.length, 2); assert.equal(a.contacts[0], ancien[0], 'existant préservé');
  assert.equal(a.entree.statut, 'whatsapp_ouvert'); assert.doesNotMatch(JSON.stringify(a.entree), /envoy/i);
  assert.equal(W.libelleStatut(a.entree.statut), 'WhatsApp ouvert (envoi non confirmé)');
  const b = W.noterOuverture(a.contacts, { maintenant: '2026-11-14T09:05:00Z', jour: '2026-11-14', texte: 'Bonjour', modele: 'relance', intl: '33639981234' });
  assert.equal(b.doublon, true); assert.equal(b.contacts.length, 2);
  const c = W.noterOuverture(b.contacts, { maintenant: '2026-11-14T10:00:00Z', jour: '2026-11-14', texte: 'Autre message', modele: 'libre', intl: '33639981234' });
  assert.equal(c.contacts.length, 3);
  assert.equal(ancien.length, 1, 'le tableau d’origine n’est jamais modifié');
});

test('relance proposée : J+2, jamais un samedi ni un dimanche', () => {
  assert.equal(W.relanceProposee('2026-11-12'), '2026-11-16'); // jeudi → samedi → lundi
  assert.equal(W.relanceProposee('2026-11-16'), '2026-11-18');
  assert.equal(W.relanceProposee('2026-11-13', 1), '2026-11-16'); // vendredi + 1 = samedi → lundi
});

test('lot 4 — pack du Studio : seuls les contenus validés de marques actives (jamais Roberlo), sans doublon ; cible du garage en premier', () => {
  const S = require('../bureau/studio.js');
  const v = x => ({ ...S.valider(S.normaliser({ type: 'message', marque: 'carsystem', titre: 'T', texte: 'Bonjour', cibles: ['prospect'], ...x }), { par: 'Responsable fictif', le: 'L' }), id: x.id });
  const pack = S.pack([v({ id: 'P1', titre: 'Prospects', cibles: ['prospect'] }), v({ id: 'C1', titre: 'Clients', cibles: ['client'], marque: 'sifa' })], { le: 'L' });
  pack.contenus.push({ ...pack.contenus[0] }, { id: 'R1', marque: 'Roberlo', titre: 'Ancien', texte: 'x', validePar: 'X', empreinte: 'abcdef12' }, { id: 'NV', marque: 'Sifa', titre: 'Non validé', texte: 'x' });
  const p = W.lirePack(pack);
  assert.deepEqual(p.contenus.map(c => c.id), ['P1', 'C1']); assert.match(p.ecartes.join(), /Ancien \(marque non active\)/); assert.match(p.ecartes.join(), /Non validé/);
  assert.deepEqual(W.contenusPour({ statutCrm: 'client' }, p).map(c => c.id), ['C1', 'P1']);
  assert.deepEqual(W.contenusPour({ statutCrm: 'prospect' }, p).map(c => c.id), ['P1', 'C1']);
  assert.throws(() => W.lirePack({ appli: 'plan-pc' }), /invalide/);
  assert.equal(W.noterOuverture([], { maintenant: 'm', jour: '2026-11-14', texte: 't', modele: 'contenu:P1', intl: '33639981234' }).entree.modele, 'contenu:P1');
});
