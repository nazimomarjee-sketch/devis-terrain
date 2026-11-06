# Ma Ville en 4 couleurs — option A validée le 07/11/2026, appliquée sur données fictives (non fusionnée)

Règle du propriétaire : rouge = client ODICOLOR carrosserie · noir = client ODICOLOR mécanique · orange = prospect carrosserie ·
bleu = prospect mécanique. Sources : EBP, SIRENE (annuaire officiel), prospection terrain. Aucun doublon automatique.
Un client EBP inactif reste identifiable comme tel.

**État :** appliquée à la Ville (`bureau/index.html`) sur données fictives. Décision du 07/11/2026 : **option A** — noir avec un
fin liseré blanc lumineux pour les clients ODICOLOR Mécan. Capture : `ville-4-couleurs-appliquee.png`. Tests :
`tests/bureau-ville-4-couleurs-navigateur.cjs` (démo et Ville connectée à EBP fictif) et `tests/bureau-ville-invariance.test.cjs`
(seules les lignes « teinte » et « liseré » sont admises dans les personnages ; bâtiments, LED, animations et styles inchangés).
Les anciennes captures `ville-4-couleurs.png` et `ville-4-couleurs-zoom.png` restent comme trace de la maquette.

Résolution des constats : (1) liseré blanc ajouté (option A) ; (2) filtres et compteurs par segment + filtre « Alertes » ;
(3) alertes conservées par les pastilles, le texte lu par les lecteurs d'écran et la fiche (« Client EBP inactif »).

## Constats de la maquette

1. **Le noir est presque invisible** sur le fond nuit de la Ville (anneau au sol et pastille de légende). Décision requise.
2. Les compteurs des villes (« cl. / pr. ») et les filtres devront compter les 4 segments à l'intégration (logique, pas dessin).
3. Les alertes (impayé, compte bloqué, client inactif) ne peuvent plus passer par la couleur : elles passeraient par les
   pastilles d'alerte existantes et la fiche.

## Règles appliquées (testées)

- Client = connu dans EBP. Sans commande depuis 12 mois : reste client, marqué **inactif**. Compte bloqué : identifiable.
- Activité : famille client EBP (« Carrosserie », « Mécan ») > saisie terrain > nom de l'entreprise (signalé « probable »).
  Sinon **à qualifier** (gris), jamais devinée.
- **Le code NAF ne distingue pas carrosserie et mécanique** : 45.20A couvre l'entretien et la réparation des véhicules légers
  (les deux métiers) ; 45.20B concerne les autres véhicules (poids lourds) — nomenclature INSEE NAF rév. 2, à confirmer.
  Le téléphone (app.js, `NAF_PEINTURE`) étiquette 45.20B « carrosserie » : écart signalé, non corrigé (accord requis).
- Doublons : SIRET ou code EBP identiques = même établissement ; nom + commune uniques = rapprochement **probable** signalé ;
  plusieurs candidats = rien de fusionné, mis de côté « à rapprocher ».
- Organisation : 8 départements d'Île-de-France, puis communes ; établissements sans commune connue mis à part.
- Établissements professionnels uniquement (annuaire : entreprises actives ; terrain : garages). Le décor de la Ville
  (bâtiments, arbres) n'est pas une donnée et reste inchangé.
