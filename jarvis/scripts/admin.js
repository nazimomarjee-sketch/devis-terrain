// Outil d'ADMINISTRATION (jeton administrateur) : règles métier et autorisations. Jamais utilisé par JARVIS lui-même.
//   JARVIS_URL=http://127.0.0.1:8160 JARVIS_ADMIN_TOKEN=... node scripts/admin.js regle  tva "reunion|vente_locale" '{"taux_pct":"8.5"}' VALIDE "justification" "source"
//   JARVIS_URL=... JARVIS_ADMIN_TOKEN=... node scripts/admin.js autorise donnees_reelles "Accord écrit du <date>, signé par <nom>" 30
//   JARVIS_URL=... JARVIS_ADMIN_TOKEN=... node scripts/admin.js revoque <id>
const [cmd, ...a] = process.argv.slice(2);
const url = process.env.JARVIS_URL ?? 'http://127.0.0.1:8160';
const jeton = process.env.JARVIS_ADMIN_TOKEN;
if (!jeton) { console.error('JARVIS_ADMIN_TOKEN manquant'); process.exit(2); }
const post = async (chemin, corps) => { const r = await fetch(url + chemin, { method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }); console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); };
if (cmd === 'regle') { const [type, cle, valeur, statut, justification, source] = a; await post('/api/admin/regles', { type, cle, valeur: JSON.parse(valeur), statut, justification, source }); }
else if (cmd === 'autorise') { const [type, portee, jours] = a; await post('/api/admin/autorisations', { type, portee, jours: jours ? Number(jours) : null }); }
else if (cmd === 'revoque') await post(`/api/admin/autorisations/${a[0]}/revoquer`, {});
else { console.error('Commandes : regle | autorise | revoque'); process.exit(2); }
