'use strict';
/* ODICOLOR — JEU DE DÉMONSTRATION 100 % FICTIF (logique pure, déterministe). Aucun nom, téléphone, SIRET, montant ou commune de client réel.
   Les garages sont « DÉMO … » ; les communes sont de vraies communes publiques (pour la carte) ; les chiffres sont inventés.
   Sert à : montrer l'application, passer la recette, essayer les imports EBP (fichiers CSV d'essai fournis, noms de colonnes = hypothèse). Jamais mélangé à des données réelles :
   le chargement n'est autorisé que sur une base VIDE (contrôle dans l'application). */
const ODICOLOR_DEMO = (() => {
  const MOTS = ['Alpha', 'Bravo', 'Cèdre', 'Delta', 'Éclair', 'Forge', 'Gamma', 'Horizon', 'Iris', 'Jade', 'Kilo', 'Lotus', 'Mistral', 'Nova', 'Opale', 'Pivot', 'Quartz', 'Riviera', 'Sigma', 'Tango'];
  const TYPES = ['Carrosserie', 'Auto', 'Garage', 'Automobiles', 'Atelier'];
  const prng = graine => { let s = graine >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const jour = (auj, n) => new Date(Date.parse(auj + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const frDate = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const csv = l => '﻿' + l.map(r => r.map(c => /[;"\r\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(';')).join('\r\n') + '\r\n';
  /* centres = ODICOLOR_COMMUNES_CENTRES (code, nom, lat, lng, cps). n garages répartis sur les communes qui ont un code postal. */
  function generer(auj, centres, opts = {}) {
    const n = opts.garages || 150, R = prng(opts.graine || 20261108), rows = centres.filter(r => r[4]);
    const clients = [], devis = [], ebpClients = [], pieces = [];
    for (let i = 0; i < n; i++) {
      const r = rows[Math.floor(R() * rows.length)], id = i + 1, client = R() < 0.3, prio = !client && R() < 0.3 ? (R() < 0.5 ? 'A' : 'B') : '';
      const nom = 'DÉMO ' + TYPES[i % TYPES.length] + ' ' + MOTS[i % MOTS.length] + ' ' + String(id).padStart(3, '0');
      const c = { id, nom, ville: r[1], cp: r[4].split(' ')[0], statutCrm: client ? 'client' : 'prospect', demo: true };
      if (prio) c.priorite = prio;
      if (R() < 0.25) c.rappel = jour(auj, Math.floor(R() * 8) - 5);
      if (R() < 0.5) c.visites = [{ date: jour(auj, -Math.floor(R() * 90) - 1), res: 'vu', note: '' }];
      clients.push(c);
      if (client) {
        const code = 'DEMO' + String(id).padStart(4, '0'); ebpClients.push({ code, c });
        const nb = 1 + Math.floor(R() * 4);
        for (let k = 0; k < nb; k++) { const j = jour(auj, -Math.floor(R() * (R() < 0.3 ? 140 : 40)) - 1); pieces.push({ type: 'Facture', no: 'FA-D' + String(pieces.length + 1).padStart(4, '0'), date: j, code, nom, ht: Math.round((300 + R() * 4000) * 100) / 100 }); }
        if (R() < 0.15 && pieces.length) { const p = pieces[pieces.length - 1]; pieces.push({ type: 'Avoir', no: 'AV-D' + String(pieces.length + 1).padStart(4, '0'), date: jour(auj, -Math.floor(R() * 20) - 1), code, nom, ht: -Math.round(p.ht * 0.2 * 100) / 100 }); }
      }
    }
    // Quelques devis (montants inventés)
    clients.filter(c => c.statutCrm === 'client').slice(0, 12).forEach((c, k) => devis.push({ id: k + 1, clientId: c.id, clientNom: c.nom, creeLe: jour(auj, -3 - k) + 'T09:00:00.000Z', statut: k % 3 === 0 ? 'accepte' : 'envoye', t2: jour(auj, -3 - k) + 'T09:00:00.000Z',
      lignes: [{ code: 'DEMO-V', des: 'Vernis DÉMO 5 L', q: 2 + (k % 4), pu: 4500 + k * 100, r: 0 }, { code: 'DEMO-B', des: 'Base DÉMO 1 L', q: 3, pu: 3200, r: 500 }] }));
    // Fichiers d'essai EBP : les pièces ne sont PAS dans la base (à importer par l'utilisateur) ; la liste clients propose des liens forts, des homonymes et des codes sans garage.
    const lignesClients = [['Code client', 'Raison sociale', 'Ville', 'Code postal', 'Bloqué', 'Famille client']];
    ebpClients.forEach(({ code, c }, i) => lignesClients.push([code, c.nom + (i % 5 === 0 ? ' SARL' : ''), c.ville, c.cp, i % 17 === 0 ? 'Oui' : 'Non', i % 2 ? 'Carrosserie' : 'Mécanique']));
    lignesClients.push(['DEMO9001', 'DÉMO Atelier Inconnu 999', 'Paris', '75001', 'Non', 'Carrosserie']);
    const hom = clients.filter(c => c.statutCrm === 'prospect')[0]; if (hom) { lignesClients.push(['DEMO9002', hom.nom, hom.ville, hom.cp, 'Non', 'Carrosserie']); }
    const lignesPieces = [['Type', 'N° de pièce', 'Date', 'Code client', 'Nom du client', 'Total HT']];
    pieces.forEach(p => lignesPieces.push([p.type, p.no, frDate(p.date), p.code, p.nom, String(p.ht).replace('.', ',')]));
    lignesPieces.push(['Devis', 'DE-D0001', frDate(jour(auj, -2)), 'DEMO0001', 'DÉMO', '12 345,00'], ['Commande', 'CC-D0001', frDate(jour(auj, -2)), 'DEMO0001', 'DÉMO', '2 000,00']);
    const marche = {}; clients.forEach(c => { const r = rows.find(x => x[1] === c.ville); if (r) marche[r[0]] = (marche[r[0]] || 0) + 1; });
    const lignesMarche = [['commune_insee', 'commune', 'departement', 'etablissements', 'diffusion_partielle', 'sans_nom']];
    Object.entries(marche).forEach(([insee, g]) => { const r = centres.find(x => x[0] === insee); lignesMarche.push([insee, r[1], insee.slice(0, 2), g + 5 + Math.floor(R() * 30), 0, 0]); });
    const rdvAuj = clients.filter(c => c.statutCrm === 'client').slice(0, 2).map((c, k) => ({ id: 'demo-rdv-' + (k + 1), clientId: c.id, clientNom: c.nom, date: k ? jour(auj, 1) : auj, heure: k ? '10:00' : '15:00', duree: 45, objet: 'Rendez-vous DÉMO', statut: 'prevu', creeLe: auj + 'T08:00:00.000Z' }));
    return { clients, devis, agenda: { version: 1, rdv: rdvAuj },
      settings: { societe: 'DÉMO — Odicolor', vendeur: 'Démo', objDepart: auj.slice(0, 7), objectifs: [1000000, 0, 0], respNom: 'Responsable DÉMO' },
      fichiers: { 'demo-ebp-clients.csv': csv(lignesClients), 'demo-ebp-pieces.csv': csv(lignesPieces), 'demo-recensement-par-commune.csv': csv(lignesMarche) },
      resume: { garages: clients.length, clients: clients.filter(c => c.statutCrm === 'client').length, prospects: clients.filter(c => c.statutCrm === 'prospect').length, devis: devis.length, piecesEbp: pieces.length, communes: Object.keys(marche).length } };
  }
  return { generer };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ODICOLOR_DEMO;
