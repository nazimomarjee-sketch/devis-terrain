// Sondes d'ACCÈS INTERDITS (fonction réutilisable : mode stdin via sonde.js, mode échange de fichiers via runner-echange.js).
import fs from 'node:fs';
import net from 'node:net';
import dgram from 'node:dgram';
import { join } from 'node:path';

export async function lancerSondes(C) {
  const R = {};
  const sonde = async (nom, f) => { try { const v = await f(); R[nom] = { passe: true, detail: String(v).slice(0, 80) }; } catch (e) { R[nom] = { passe: false, detail: e.code || String(e.message).slice(0, 60) }; } };

  await sonde('lire_secret_hors_perimetre', () => fs.readFileSync(C.secret, 'utf8'));
  await sonde('ecrire_hors_perimetre', () => fs.writeFileSync(join(C.dossierHors, 'intrus'), 'x'));
  await sonde('symlink_vers_secret_puis_lecture', () => { fs.symlinkSync(C.secret, join(C.dossierSortie, 'lien')); return fs.readFileSync(join(C.dossierSortie, 'lien'), 'utf8'); });
  await sonde('lien_dur_vers_secret', () => { fs.linkSync(C.secret, join(C.dossierSortie, 'dur')); return 'lien dur créé'; });
  await sonde('lire_environnement_processus', () => fs.readFileSync('/proc/1/environ', 'utf8').length);
  await sonde('lancer_processus', async () => { const { execSync } = await import('node:child_process'); return execSync('id').toString(); });
  await sonde('worker', async () => { const { Worker } = await import('node:worker_threads'); new Worker('1', { eval: true }); return 'worker'; });
  await sonde('tuer_autre_processus', () => { process.kill(C.pid, 'SIGTERM'); return 'signal envoyé'; });
  await sonde('debogueur_autre_processus', () => { process._debugProcess(C.pid); return 'débogueur activé'; });
  await sonde('connexion_tcp', () => new Promise((ok, ko) => { const s = net.connect(C.portTcp, '127.0.0.1', () => { s.destroy(); ok('connecté'); }); s.on('error', ko); }));
  await sonde('envoi_udp', () => new Promise((ok, ko) => { const s = dgram.createSocket('udp4'); s.send('x', C.portTcp, '127.0.0.1', (e) => { s.close(); e ? ko(e) : ok('envoyé'); }); }));
  await sonde('socket_unix', () => new Promise((ok, ko) => { const s = net.connect(C.socketUnix, () => { s.destroy(); ok('connecté'); }); s.on('error', ko); }));
  await sonde('memoire_1_5_Go', () => Buffer.alloc(1.5 * 1024 ** 3, 1).length);
  await sonde('fichier_20_Mo', () => { const f = join(C.dossierSortie, 'gros'); fs.writeFileSync(f, Buffer.alloc(20 * 1024 ** 2, 1)); return '20 Mo écrits'; });

  return R;
}
