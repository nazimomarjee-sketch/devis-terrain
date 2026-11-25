/* DONNÉES FICTIVES pour la démonstration et les essais de la vue Commune. Aucun garage réel. */
(function (racine) {
  'use strict';
  const J = n => new Date(Date.UTC(2026, 10, 6) - n * 86400000).toISOString().slice(0, 10); // n jours avant le 06/11/2026
  const cmd = (code, nom, ilYA) => ilYA.map((n, i) => ({ type: 'commande', no: code + '-' + i, date: J(n), code, client: nom, htCents: 50000 }));
  const terrain = [
    { id: 1, nom: 'CARROSSERIE FICTIVE B', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect', contactNom: 'Gérant', ent: { siret: '11111111100011', lu: '2026-10-12T09:00:00Z' } },
    { id: 2, nom: 'MÉCA FICTIVE C', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect', etape: 'Visité le 03/11', etapeDate: '2026-11-03' },
    { id: 3, nom: 'CARROSSERIE FICTIVE D', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect' },
    { id: 4, nom: 'GARAGE FICTIF SANS INDICE', ville: 'Goussainville', cp: '95190', statutCrm: 'prospect' },
    { id: 5, nom: 'CARROSSERIE FICTIVE GONESSE', ville: 'Gonesse', cp: '95500', statutCrm: 'prospect' },
    ...Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, nom: 'CARROSSERIE FICTIVE CERGY ' + (i + 1), ville: 'Cergy', cp: '95000', statutCrm: 'prospect' }))
  ];
  const clientsEbp = [
    { code: 'F01', nom: 'CARROSSERIE FICTIVE A', ville: 'Goussainville', cp: '95190', statut: 'Actif', famille: 'Carrosserie' },
    { code: 'F02', nom: 'MÉCA FICTIVE E', ville: 'Goussainville', cp: '95190', statut: 'Actif', famille: 'Mécan' },
    { code: 'F03', nom: 'CARROSSERIE FICTIVE F', ville: 'Goussainville', cp: '95190', statut: 'Bloqué', famille: 'Carrosserie', bloque: true },
    { code: 'F04', nom: 'CARROSSERIE FICTIVE G', ville: 'Goussainville', cp: '95190', statut: 'Actif', famille: 'Carrosserie' },
    { code: 'F05', nom: 'MÉCA FICTIVE GONESSE', ville: 'Gonesse', cp: '95500', statut: 'Actif', famille: 'Mécan' }
  ];
  const piecesEbp = [
    ...cmd('F01', 'CARROSSERIE FICTIVE A', [75, 105, 135, 165]),   // rythme 30 j, rien depuis 75 j → potentiellement dormant
    ...cmd('F02', 'MÉCA FICTIVE E', [10, 40, 70]),                 // régulier → actif
    ...cmd('F03', 'CARROSSERIE FICTIVE F', [20]),                  // compte bloqué
    ...cmd('F04', 'CARROSSERIE FICTIVE G', [70]),                  // une commande il y a 70 j → réachat à vérifier
    ...cmd('F05', 'MÉCA FICTIVE GONESSE', [400]),                  // plus d'un an → inactif
    { type: 'facture', no: 'HIST', date: J(420), code: 'F05', client: 'MÉCA FICTIVE GONESSE', htCents: 100 }
  ];
  const airtable = [
    { id: 'recX', nom: 'CONTRÔLE TECHNIQUE FICTIF', ville: 'Goussainville', cp: '95190', statut: 'a_exclure', majLe: '2026-09-01' },
    { id: 'recY', nom: 'GARAGE FICTIF DORMANT AIRTABLE', ville: 'Gonesse', cp: '95500', statut: 'dormant', majLe: '2026-09-15' }
  ];
  const annuaire = [
    { siret: '11111111100011', nom: 'CARROSSERIE FICTIVE B', ville: 'Goussainville', cp: '95190', naf: '45.20A' },
    ...Array.from({ length: 4 }, (_, i) => ({ siret: String(22222222200000 + i), nom: 'ÉTABLISSEMENT SIRENE ' + (i + 1), ville: 'Goussainville', cp: '95190', naf: '45.20A' })),
    ...Array.from({ length: 55 }, (_, i) => ({ siret: String(33333333300000 + i), nom: 'ATELIER FICTIF CERGY ' + String(i + 1).padStart(2, '0'), ville: 'Cergy', cp: '95000', naf: '45.20A' }))
  ];
  racine.FICTIF_95 = { arrete: '2026-11-06', dates: { Terrain: '2026-11-05', Airtable: '2026-11-01', SIRENE: '2026-10-20' }, terrain, clientsEbp, piecesEbp, airtable, annuaire };
  if (typeof module === 'object' && module.exports) module.exports = racine.FICTIF_95;
})(typeof self !== 'undefined' ? self : this);
