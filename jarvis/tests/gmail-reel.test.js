import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement, traiter, DEMANDE_TYPE } from './aide.js';
import { connecteurGmailReel, jetonGmail } from '../src/connecteurs/gmail-reel.js';
import { accorder, revoquer } from '../src/regles.js';
import { definirParam, ouvrir } from '../src/db.js';
import { traiter as vider, rejouer } from '../src/outbox.js';

const charge = { vers: 'client@test.invalid', eml_base64: Buffer.from('To: client@test.invalid\r\nX-Jarvis-Statut: BROUILLON\r\n\r\nTest').toString('base64') };
const autoriser = (db) => { definirParam(db, 'connecteur_gmail', 'reel_test'); return accorder(db, { type: 'integration:gmail', portee: 'essai fictif' }, 'test'); };
const creer = (db, transport, plus = {}) => connecteurGmailReel({ db, compte: 'test@example.invalid', obtenirJeton: async () => 'secret-test', transport, ...plus });

test('Gmail API : seul POST drafts, MIME base64url, aucun envoi et rejeu sans doublon après réouverture SQLite', async () => {
  const e = environnement(); let appels = 0;
  try {
    autoriser(e.db);
    const transport = async (url, o) => { appels++; assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'); assert.equal(o.method, 'POST'); assert.equal(o.redirect, 'error'); assert.equal(o.headers.Authorization, 'Bearer secret-test'); assert.equal(Buffer.from(JSON.parse(o.body).message.raw, 'base64url').toString('base64'), charge.eml_base64); return Response.json({ id: 'draft-123' }); };
    const g = creer(e.db, transport); assert.equal(g.envoyer, undefined);
    assert.deepEqual(await g.executer('CREER_BROUILLON', charge, 'cle-test-001'), { id: 'draft-123' });
    const db2 = ouvrir(e.fichierDb);
    try { assert.deepEqual(await creer(db2, transport).executer('CREER_BROUILLON', charge, 'cle-test-001'), { id: 'draft-123' }); } finally { db2.close(); }
    assert.equal(appels, 1);
    await assert.rejects(g.executer('CREER_BROUILLON', { ...charge, eml_base64: Buffer.from(Buffer.from(charge.eml_base64, 'base64').toString() + 'modifié').toString('base64') }, 'cle-test-001'), /autre contenu/);
    await assert.rejects(creer(e.db, transport, { compte: 'autre@example.invalid' }).executer('CREER_BROUILLON', charge, 'cle-test-001'), /autre contenu ou compte/);
  } finally { e.nettoyer(); }
});

test('Gmail : refus avant réseau sans autorisation, après révocation, arrêt et pour action ou destinataire non permis', async () => {
  const e = environnement(); let appels = 0;
  try {
    const g = creer(e.db, async () => { appels++; });
    await assert.rejects(g.executer('CREER_BROUILLON', charge, 'cle-test-001'), /Autorisation requise/);
    const id = autoriser(e.db);
    await assert.rejects(g.executer('ENVOYER', charge, 'cle-test-001'), /non autorisée/);
    await assert.rejects(g.executer('CREER_BROUILLON', { ...charge, vers: 'client@example.com' }, 'cle-test-001'), /fictif/);
    await assert.rejects(g.executer('CREER_BROUILLON', { ...charge, eml_base64: Buffer.from('To: client@test.invalid\r\nBcc: vrai@example.com\r\nX-Jarvis-Statut: BROUILLON\r\n\r\nx').toString('base64') }, 'cle-test-001'), /En-têtes/);
    definirParam(e.db, 'arret_urgence', '1'); await assert.rejects(g.executer('CREER_BROUILLON', charge, 'cle-test-001'), /urgence/);
    definirParam(e.db, 'arret_urgence', '0'); revoquer(e.db, id, 'test'); await assert.rejects(g.executer('CREER_BROUILLON', charge, 'cle-test-001'), /Autorisation requise/);
    assert.equal(appels, 0);
  } finally { e.nettoyer(); }
});

test('Gmail : coupure après création distante, reprise et rejeu admin ne répètent jamais le POST', async () => {
  const e = environnement(); let appels = 0;
  try {
    autoriser(e.db); const m = await traiter(e, DEMANDE_TYPE);
    assert.throws(() => e.jarvis.approuver(m.id, 'approuver'), /non confirmé/);
    assert.equal(e.db.prepare('SELECT COUNT(*) n FROM outbox').get().n, 0);
    e.jarvis.approuver(m.id, 'approuver', 'test', 'reel_test');
    const g = creer(e.db, async () => { appels++; throw new Error('secret-ne-doit-pas-fuiter'); });
    await vider(e.db, { gmail_reel: g });
    const a = e.db.prepare('SELECT * FROM outbox').get(); assert.equal(a.etat, 'ECHEC'); assert.equal(a.tentatives, 1); assert.match(a.derniere_erreur, /incertain/); assert.doesNotMatch(a.derniere_erreur, /secret/);
    rejouer(e.db, a.id); await vider(e.db, { gmail_reel: creer(e.db, async () => { appels++; return Response.json({ id: 'doublon' }); }) });
    assert.equal(appels, 1); assert.equal(e.db.prepare('SELECT etat FROM outbox').get().etat, 'ECHEC');
  } finally { e.nettoyer(); }
});

test('Gmail : approbation → PDF dans brouillon → FAIT ; arrêt empêche la file ; mode synthétique conservé dans la file', async () => {
  const e = environnement(); let appels = 0;
  try {
    autoriser(e.db); const m = await traiter(e, DEMANDE_TYPE);
    e.jarvis.approuver(m.id, 'approuver', 'test', 'reel_test');
    const g = creer(e.db, async (url, o) => { appels++; const eml = Buffer.from(JSON.parse(o.body).message.raw, 'base64url').toString(); assert.match(eml, /application\/pdf/); return Response.json({ id: 'draft-pdf' }); });
    definirParam(e.db, 'arret_urgence', '1'); assert.equal(await vider(e.db, { gmail_reel: g }), 0); assert.equal(appels, 0);
    definirParam(e.db, 'arret_urgence', '0'); assert.equal(await vider(e.db, { gmail_reel: g }), 1);
    assert.equal(e.db.prepare('SELECT etat FROM outbox').get().etat, 'FAIT'); assert.equal(appels, 1);
    definirParam(e.db, 'connecteur_gmail', 'synthetique'); const m2 = await traiter(e, DEMANDE_TYPE); e.jarvis.approuver(m2.id, 'approuver');
    definirParam(e.db, 'connecteur_gmail', 'reel_test'); assert.equal(e.db.prepare('SELECT connecteur FROM outbox WHERE mission_id=?').get(m2.id).connecteur, 'gmail');
  } finally { e.nettoyer(); }
});

test('Gmail : deux connexions concurrentes réservent un seul POST', async () => {
  const e = environnement(); const db2 = ouvrir(e.fichierDb); let appels = 0;
  try {
    autoriser(e.db); const transport = async () => { appels++; await new Promise(r => setTimeout(r, 20)); return Response.json({ id: 'unique' }); };
    const resultats = await Promise.allSettled([creer(e.db, transport).executer('CREER_BROUILLON', charge, 'cle-concurrente'), creer(db2, transport).executer('CREER_BROUILLON', charge, 'cle-concurrente')]);
    assert.equal(appels, 1); assert.equal(resultats.filter(r => r.status === 'fulfilled').length, 1);
  } finally { db2.close(); e.nettoyer(); }
});

test('OAuth : renouvellement, cache, erreurs sans secrets ; aucun secret enregistré en base', async () => {
  let appels = 0;
  const jeton = jetonGmail({ clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', transport: async (url, o) => { appels++; assert.equal(url, 'https://oauth2.googleapis.com/token'); assert.equal(o.redirect, 'error'); assert.equal(new URLSearchParams(o.body).get('grant_type'), 'refresh_token'); return Response.json({ access_token: 'access', expires_in: 3600 }); } });
  assert.equal(await jeton(), 'access'); assert.equal(await jeton(), 'access'); assert.equal(appels, 1);
  const ko = jetonGmail({ clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', transport: async () => { throw new Error('secret'); } });
  await assert.rejects(ko(), e => !e.message.includes('secret') && /Authentification/.test(e.message));
  assert.throws(() => jetonGmail({}), /Configuration OAuth/);
});

test('Gmail : autorisation révoquée pendant OAuth → aucun POST', async () => {
  const e = environnement(); let appels = 0;
  try { const id = autoriser(e.db); const g = creer(e.db, async () => { appels++; }, { obtenirJeton: async () => { revoquer(e.db, id, 'test'); return 'token'; } }); await assert.rejects(g.executer('CREER_BROUILLON', charge, 'cle-revocation'), /Autorisation requise/); assert.equal(appels, 0); } finally { e.nettoyer(); }
});

import { creerServeur } from '../src/serveur.js';
import { RACINE, requete, json } from './aide.js';
import { join } from 'node:path';

test('API téléphone : activation protégée, consentement explicite et statut du brouillon', async () => {
  const e = environnement(); const U = 'utilisateur-test-012345678901234'; const A = 'administrateur-test-012345678901';
  const s = creerServeur({ jarvis: e.jarvis, jeton: U, jetonAdmin: A, dossierPublic: join(RACINE, 'public'), gmailReelConfigure: true });
  await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port;
  const post = (chemin, corps, jeton = U) => requete(port, { methode: 'POST', chemin, corps, jeton });
  try {
    const parametre = { cle: 'connecteur_gmail', valeur: 'reel_test' };
    assert.equal((await post('/api/admin/parametres', parametre)).code, 403);
    assert.equal((await post('/api/admin/parametres', parametre, A)).code, 400);
    autoriser(e.db); assert.equal((await post('/api/admin/parametres', parametre, A)).code, 200);
    const m = await traiter(e, DEMANDE_TYPE);
    assert.notEqual((await post(`/api/missions/${m.id}/decision`, { decision: 'approuver' })).code, 200);
    assert.equal((await post(`/api/missions/${m.id}/decision`, { decision: 'approuver', mode_gmail: 'reel_test' })).code, 200);
    let etat = json(await requete(port, { chemin: '/api/etat', jeton: U })); assert.equal(etat.brouillons[0].etat, 'A_FAIRE');
    await vider(e.db, { gmail_reel: creer(e.db, async () => Response.json({ id: 'draft-api' })) });
    etat = json(await requete(port, { chemin: '/api/etat', jeton: U })); assert.equal(etat.brouillons[0].etat, 'FAIT'); assert.equal(etat.brouillons[0].connecteur, 'gmail_reel');
  } finally { await new Promise(r => s.close(r)); e.nettoyer(); }
});

test('Gmail : réponses HTTP d’échec et JSON invalide deviennent incertaines, sans répétition', async () => {
  for (const reponse of [() => new Response('erreur secrète', { status: 503 }), () => new Response('pas JSON'), () => Response.json({})]) {
    const e = environnement(); let appels = 0;
    try { autoriser(e.db); const g = creer(e.db, async () => { appels++; return reponse(); });
      await assert.rejects(g.executer('CREER_BROUILLON', charge, 'cle-incertaine'), /incertain/);
      await assert.rejects(g.executer('CREER_BROUILLON', charge, 'cle-incertaine'), /incertain/); assert.equal(appels, 1);
    } finally { e.nettoyer(); }
  }
});
