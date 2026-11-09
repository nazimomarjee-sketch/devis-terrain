// Attribution d'une demande à un agent : règles déterministes (aucun modèle IA). En cas d'égalité ou d'absence, on demande.
const MOTIFS = {
  devis: [/\bdevis\b/gi],
  produits: [/catalogue/gi, /fiche\s+produit/gi, /fiche\s+[A-Za-z]{3}-[A-Za-z0-9]{3,6}/gi, /compatib/gi, /tarifs?\s+ancien/gi],
  prospection: [/prospect/gi, /opportunit/gi],
  clients: [/(?:dossier|fiche|historique)\s+(?:du\s+|de\s+la\s+|de\s+l['’]\s*)?client/gi],
  relances: [/relanc/gi, /impay[ée]/gi, /rappel/gi],
  commandes: [/commande/gi],
  finance: [/marge/gi, /factur/gi, /paiement/gi, /encours/gi, /chiffre d.affaires/gi, /\bfinanc/gi],
  planification: [/planif/gi, /planning/gi, /priorit/gi, /journ[ée]e/gi, /agenda/gi, /atelier/gi, /ordres?\b/gi],
};
const compter = (re, t) => (t.match(re) ?? []).length;

export function router(demande, agentsActifs) {
  const t = String(demande);
  const aUnNumeroDevis = /\bDEV-\d{4}-\d{3}\b/i.test(t);
  const scores = {};
  for (const [agent, motifs] of Object.entries(MOTIFS)) {
    let s = motifs.reduce((n, re) => n + compter(re, t), 0);
    if (agent === 'devis' && aUnNumeroDevis) s = 0; // « commande du devis DEV-… » vise la commande, pas un nouveau devis
    if (agent === 'clients') s *= 3; // « dossier du client » est une formule précise
    if (s > 0) scores[agent] = s;
  }
  const classes = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (classes.length === 0) return { agent: null, raison: 'AUCUN_AGENT', candidats: [] };
  if (classes.length > 1 && classes[0][1] === classes[1][1]) return { agent: null, raison: 'AMBIGU', candidats: classes.filter((c) => c[1] === classes[0][1]).map((c) => c[0]) };
  const agent = classes[0][0];
  return agentsActifs.includes(agent) ? { agent } : { agent: null, raison: 'AGENT_NON_DISPONIBLE', candidats: [agent] };
}
