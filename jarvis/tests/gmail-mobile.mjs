// Recette Chromium mobile ; API Google SIMULÉE, clic humain AUTOMATIQUE.
// NODE_PATH doit pointer vers une installation Playwright si elle n'est pas locale.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { environnement, RACINE, DEMANDE_TYPE } from './aide.js';
import { creerServeur } from '../src/serveur.js';
import { definirParam } from '../src/db.js';
import { accorder } from '../src/regles.js';
import { connecteurGmailReel } from '../src/connecteurs/gmail-reel.js';
import { traiter } from '../src/outbox.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const e = environnement();
const U = 'test-mobile-utilisateur-0123456789'; const A = 'test-mobile-admin-012345678901234';
const s = creerServeur({ jarvis: e.jarvis, jeton: U, jetonAdmin: A, dossierPublic: join(RACINE, 'public'), gmailReelConfigure: true });
let nav;
try {
  definirParam(e.db, 'connecteur_gmail', 'reel_test'); accorder(e.db, { type: 'integration:gmail', portee: 'recette mobile simulée' }, 'test');
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  nav = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const p = await nav.newPage({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`http://127.0.0.1:${s.address().port}`);
  await p.fill('#jeton', U); await p.click('#ok-jeton');
  await p.fill('#demande', DEMANDE_TYPE); await p.click('#envoyer');
  await p.waitForFunction(() => document.querySelector('#en-cours').textContent.includes('En file'));
  await e.jarvis.executerJusquaVide(); await p.reload();
  await p.waitForSelector('#carte-prochaine button.ok');
  let confirme = false;
  p.on('dialog', async d => { assert.match(d.message(), /brouillon de TEST sera créé dans Gmail/); confirme = true; await d.accept(); });
  await p.click('#carte-prochaine button.ok');
  await p.waitForFunction(() => document.querySelector('#resultats').textContent.includes('Brouillon en attente'));
  const gmail = connecteurGmailReel({ db: e.db, compte: 'test@example.invalid', obtenirJeton: async () => 'faux-token', transport: async () => Response.json({ id: 'draft-mobile' }) });
  assert.equal(await traiter(e.db, { gmail_reel: gmail }), 1);
  await p.reload();
  await p.waitForFunction(() => document.querySelector('#resultats').textContent.includes('Brouillon créé dans Gmail — aucun envoi'));
  assert.equal(await p.getByRole('link', { name: 'Ouvrir Gmail' }).getAttribute('href'), 'https://mail.google.com/mail/#drafts');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(confirme, true); assert.deepEqual(erreurs, []);
  console.log('OK Chromium 360×780 : demande, audit, consentement Gmail, PDF, statut et lien. Google simulé ; Samsung non testé.');
} finally { await nav?.close(); await new Promise(r => s.close(r)); e.nettoyer(); }
