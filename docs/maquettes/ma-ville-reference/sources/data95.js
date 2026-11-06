// 95 Val-d'Oise — établissements FICTIFS. Positions des communes approximatives ; l'agence est placée symboliquement
// dans Goussainville (adresse exacte non utilisée).
// Établissement : [type c/m/q/x, segment, source, extra]  q = SIRENE non qualifié (activité probable, gris) ; x = hors cible.
// extra : 'dormant' | 'alerte' | 'interlocuteur' | 'visite'
const C95 = [
 ['Goussainville', 2.465, 49.032, [['c','client-carrosserie','EBP','dormant'],['c','prospect-carrosserie','Airtable','interlocuteur'],['m','prospect-mecanique','Terrain','visite'],['c','prospect-carrosserie','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['x','hors-cible','Airtable'],['q','a-qualifier','SIRENE']]],
 ['Gonesse', 2.449, 48.987, [['c','client-carrosserie','EBP','alerte'],['c','prospect-carrosserie','Airtable','interlocuteur'],['m','prospect-mecanique','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Garges-lès-Gonesse', 2.400, 48.972, [['c','prospect-carrosserie','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Sarcelles', 2.380, 48.997, [['m','client-mecanique','EBP','interlocuteur'],['c','prospect-carrosserie','Airtable','visite'],['c','prospect-carrosserie','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Villiers-le-Bel', 2.391, 49.009, [['c','prospect-carrosserie','Airtable'],['m','prospect-mecanique','Terrain'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Roissy-en-France', 2.517, 49.004, [['c','prospect-carrosserie','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Louvres', 2.505, 49.044, [['c','prospect-carrosserie','Airtable'],['m','prospect-mecanique','Airtable'],['q','a-qualifier','SIRENE']]],
 ['Argenteuil', 2.248, 48.947, [['c','prospect-carrosserie','Airtable','interlocuteur'],['c','prospect-carrosserie','Airtable'],['m','prospect-mecanique','Airtable'],['c','prospect-carrosserie','Terrain','visite'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Ermont', 2.258, 48.990, [['c','prospect-carrosserie','Airtable'],['x','hors-cible','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Franconville', 2.229, 48.989, [['m','prospect-mecanique','Airtable'],['c','prospect-carrosserie','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Cergy', 2.060, 49.036, [['c','prospect-carrosserie','Airtable','visite'],['c','prospect-carrosserie','Airtable'],['m','prospect-mecanique','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Saint-Ouen-l’Aumône', 2.110, 49.044, [['c','prospect-carrosserie','Airtable'],['m','prospect-mecanique','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]],
 ['Taverny', 2.220, 49.026, [['c','prospect-carrosserie','Airtable'],['q','a-qualifier','SIRENE'],['q','a-qualifier','SIRENE']]]];
SEG['a-qualifier'] = { c: '#6E737B', l: 'À qualifier (SIRENE, activité probable)' };
SEG['hors-cible'] = { c: '#3F444C', l: 'Hors cible' };
// Comptage commercialement juste : un dormant reste CLIENT ; hors cible et à qualifier à part.
function comptes(liste) {
  const E = liste.flatMap(c => c[3]), n = f => E.filter(f).length;
  return { total: E.length, clients: n(e => e[1].startsWith('client')), dormants: n(e => e[3] === 'dormant'), clientsCarr: n(e => e[1] === 'client-carrosserie'), clientsMeca: n(e => e[1] === 'client-mecanique'),
    prospCarr: n(e => e[1] === 'prospect-carrosserie'), prospMeca: n(e => e[1] === 'prospect-mecanique'), aQualifier: n(e => e[0] === 'q'), horsCible: n(e => e[0] === 'x'),
    alertes: n(e => e[3] === 'alerte'), interlocuteur: n(e => e[3] === 'interlocuteur' && e[1].startsWith('prospect')), visites: n(e => e[3] === 'visite'), qualifies: n(e => e[0] === 'c' || e[0] === 'm') };
}
