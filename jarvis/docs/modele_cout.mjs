// Modèle de coût rejouable : node docs/modele_cout.mjs
// Toutes les entrées sont des HYPOTHÈSES ou des relevés web non officiels (voir 03_MATERIEL_ET_COUTS.md).
const kwh = 0.2001;                    // €/kWh TTC, tarif réglementé option Base ≤ 6 kVA (comparateurs, non officiel)
const elec = (watts) => Math.round((watts * 8760) / 1000 * kwh * 100) / 100;
const ups = [110, 135];                // onduleur 700 VA, relevés RS / revendeur belge
const sauvegardeExterne = [80, 120];   // SSD externe 1 To : ESTIMATION non sourcée
const api = [5, 15];                   // €/mois, 20 missions/jour × ~4 000 jetons (hypothèse, tarifs à vérifier)
const apiD = [2.5, 10];                // scénario D : une partie du travail en local

const scenarios = {
  'A  VPS Linux 4 vCPU/8 Go (HT)': { materiel: [0, 0], mensuel: [7, 15], watts: 0, api, sauv: [0, 0], ups: [0, 0] },
  'B  Mini-PC N150 16 Go/512 Go':  { materiel: [219, 509], mensuel: [0, 0], watts: 15, api, sauv: sauvegardeExterne, ups },
  'C  Mini-PC 32 Go/1 To':          { materiel: [820, 1110], mensuel: [0, 0], watts: 25, api, sauv: sauvegardeExterne, ups },
  'D  Station IA locale + GPU 16 Go': { materiel: [1300, 1800], mensuel: [0, 0], watts: 70, api: apiD, sauv: sauvegardeExterne, ups }, // 1300-1800 = ESTIMATION (non sourcée)
};
const fmt = (n) => `${Math.round(n)}`.padStart(5);
console.log('Scénario                              Matériel  Élec/an  12 mois (bas–haut)   36 mois (bas–haut)');
for (const [nom, s] of Object.entries(scenarios)) {
  const upsW = s.watts ? 3 : 0;
  const el = s.watts ? elec(s.watts + upsW) : 0;
  const initial = [s.materiel[0] + s.ups[0] + s.sauv[0], s.materiel[1] + s.ups[1] + s.sauv[1]];
  const t = (mois) => [initial[0] + (el * mois) / 12 + (s.mensuel[0] + s.api[0]) * mois, initial[1] + (el * mois) / 12 + (s.mensuel[1] + s.api[1]) * mois];
  const [a12, b12] = t(12), [a36, b36] = t(36);
  console.log(`${nom.padEnd(36)} ${fmt(initial[0])}–${fmt(initial[1])}  ${fmt(el)}   ${fmt(a12)}–${fmt(b12)}        ${fmt(a36)}–${fmt(b36)}`);
}

// ---- Coûts MENSUELS réels (courant = ce qui sort chaque mois ; amorti = + matériel lissé sur 36 mois) ----
console.log('\nScénario                              Courant/mois (bas–haut)   Amorti 36 mois/mois (bas–haut)');
for (const [nom, s] of Object.entries(scenarios)) {
  const el = s.watts ? elec(s.watts + 3) : 0;
  const initial = [s.materiel[0] + s.ups[0] + s.sauv[0], s.materiel[1] + s.ups[1] + s.sauv[1]];
  const courant = [el / 12 + s.mensuel[0] + s.api[0], el / 12 + s.mensuel[1] + s.api[1]];
  const f = (n) => n.toFixed(1).padStart(5);
  console.log(`${nom.padEnd(36)} ${f(courant[0])}–${f(courant[1])} €              ${f(courant[0] + initial[0] / 36)}–${f(courant[1] + initial[1] / 36)} €`);
}
