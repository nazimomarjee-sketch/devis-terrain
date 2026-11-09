// Sondes d'ACCÈS INTERDITS (fonction réutilisable : mode stdin via sonde.js, mode échange de fichiers via runner-echange.js).
import fs from 'node:fs';
import net from 'node:net';
import dgram from 'node:dgram';
import { join } from 'node:path';

export async function lancerSondes(C) {
  const R = {};
  // Un refus n'est RETENU que s'il porte un code de refus AVÉRÉ pour cette sonde. ENOENT (fichier absent), commande inexistante, délai
  // ou toute autre erreur est INDÉTERMINÉ ⇒ la sonde est comptée comme PASSÉE (conservateur : on ne conclut jamais « isolé » sur une erreur anodine).
  const FS = ['ERR_ACCESS_DENIED', 'EACCES', 'EPERM']; const RESEAU = ['ENETUNREACH', 'ENETDOWN', 'EHOSTUNREACH', 'EACCES', 'EPERM', 'ERR_ACCESS_DENIED', 'ETIMEDOUT'];
  const sonde = async (nom, f, codes) => { try { const v = await f(); R[nom] = { passe: true, detail: String(v).slice(0, 80) }; } catch (e) { const c = e.code ?? (/allocation failed|Invalid array buffer/i.test(e.message) ? 'MEMOIRE' : e.message.slice(0, 40)); R[nom] = codes.includes(c) ? { passe: false, detail: c } : { passe: true, detail: `INDETERMINE:${c}` }; } };
  const attendre = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(Object.assign(new Error('délai'), { code: 'ETIMEDOUT' })), ms))]);

  await sonde('lire_secret_hors_perimetre', () => fs.readFileSync(C.secret, 'utf8'), FS);
  await sonde('ecrire_hors_perimetre', () => fs.writeFileSync(join(C.dossierHors, 'intrus'), 'x'), FS);
  await sonde('symlink_vers_secret_puis_lecture', () => { fs.symlinkSync(C.secret, join(C.dossierSortie, 'lien')); return fs.readFileSync(join(C.dossierSortie, 'lien'), 'utf8'); }, FS);
  await sonde('lien_dur_vers_secret', () => { fs.linkSync(C.secret, join(C.dossierSortie, 'dur')); return 'lien dur créé'; }, FS);
  await sonde('lire_environnement_processus', () => fs.readFileSync(C.environnementProcessus ?? '/proc/1/environ', 'utf8').length, FS);
  await sonde('lancer_processus', async () => { const { execSync } = await import('node:child_process'); return execSync('id').toString(); }, FS);
  await sonde('worker', async () => { const { Worker } = await import('node:worker_threads'); new Worker('1', { eval: true }); return 'worker'; }, FS);
  // Un « refus » n'est RETENU que s'il prouve un refus de permission (EPERM/EACCES) : ESRCH (cible déjà morte) ou toute autre erreur est INDÉTERMINÉ ⇒ compté comme échec (conservateur).
  const signal = (f) => { try { f(); return 'REUSSI'; } catch (e) { return ['EPERM', 'EACCES', 'ERR_ACCESS_DENIED'].includes(e.code) ? 'REFUSE' : `INDETERMINE:${e.code ?? e.message}`; } };
  { const r = signal(() => process.kill(C.pidKill, 'SIGTERM')); R.tuer_autre_processus = { passe: r !== 'REFUSE', detail: r }; }
  { const r = signal(() => process._debugProcess(C.pidDebug)); R.debogueur_autre_processus = { passe: r !== 'REFUSE', detail: r }; }
  await sonde('connexion_tcp', () => new Promise((ok, ko) => { const s = net.connect({ port: C.portTcp, host: C.hoteTcp ?? '127.0.0.1', timeout: 5000 }, () => { s.destroy(); ok('connecté'); }); s.on('error', ko); s.on('timeout', () => { s.destroy(); ko(Object.assign(new Error('délai'), { code: 'ETIMEDOUT' })); }); }), RESEAU);
  await sonde('envoi_udp', () => new Promise((ok, ko) => { const s = dgram.createSocket('udp4'); s.send('x', C.portTcp, C.hoteTcp ?? '127.0.0.1', (e) => { s.close(); e ? ko(e) : ok('envoyé'); }); }), RESEAU);
  await sonde('socket_unix', () => new Promise((ok, ko) => { const s = net.connect(C.socketUnix, () => { s.destroy(); ok('connecté'); }); s.on('error', ko); }), [...FS, ...RESEAU]);
  await sonde('memoire_1_5_Go', () => Buffer.alloc(1.5 * 1024 ** 3, 1).length, ['MEMOIRE']);
  await sonde('fichier_20_Mo', () => { const f = join(C.dossierSortie, 'gros'); fs.writeFileSync(f, Buffer.alloc(20 * 1024 ** 2, 1)); return '20 Mo écrits'; }, ['EFBIG', 'ENOSPC', 'EDQUOT', ...FS]);

  return R;
}
