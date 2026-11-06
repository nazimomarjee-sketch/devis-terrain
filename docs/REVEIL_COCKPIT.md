# Réveil du cockpit — démonstration sur données fictives (08/11/2026)

**Ce que c'est :** un panneau « Réveil du cockpit » dans l'onglet **Bureau**. À chaque fichier importé, il montre quels
voyants s'allument, lesquels restent partiels (avec la limite dite) et lesquels restent éteints (avec la donnée manquante).
Il ne calcule aucun chiffre nouveau : il constate ce que les modules existants savent produire avec les fichiers chargés.
Logique : `bureau/reveil.js`. Tests : `tests/bureau-reveil.test.cjs`, `tests/bureau-reveil-navigateur.cjs`.
Ville LEGO non touchée (garde-fou `tests/bureau-ville-invariance.test.cjs` vert). Non fusionné, non publié.

Rejouer la démonstration avec captures : `CAPTURES=dossier node tests/bureau-reveil-navigateur.cjs`.

## Les 5 étapes (jeu fictif : 11 garages, 6 clients EBP dont 1 bloqué et 1 inactif, 5 prospects)

| Étape | Fichier ajouté | Allumés | Partiels | Éteints | Capture |
|---|---|---|---|---|---|
| 0 | rien | 0 | 0 | 21 | `maquettes/reveil/reveil-0-rien.png` |
| 1 | sauvegarde du téléphone | 3 | 2 | 16 | `reveil-1-terrain.png` |
| 2 | + pièces EBP (12 mois, n° d'origine) | 10 | 2 | 9 | `reveil-2-pieces.png` |
| 3 | + échéancier des règlements | 11 | 2 | 8 | `reveil-3-reglements.png` |
| 4 | + fichier clients avec famille et statut | 14 | 0 | 7 | `reveil-4-clients.png` |

## Opérationnel dès l'import (14 voyants)

- **Terrain** : Ville LEGO avec tes garages · communes et départements · prospects · devis du téléphone reconnus dans EBP.
- **Ventes** : commandes semaine/mois · facturé du mois (jamais confondu) · 3 actions du jour · signaux reconquête/baisse · plan du matin pour le téléphone.
- **Clients et comptes** : échu non réglé · garages de la Ville reliés à EBP · Ma Ville en 4 couleurs · clients inactifs · comptes bloqués.

## Ce qui empêche un voyant de s'allumer (vérifié dans le code)

| Situation | Effet | Voyant |
|---|---|---|
| Pas de colonne « n° de pièce d'origine » | Retards devis → commande → facture non fiables | 3 actions : partiel |
| Moins de 12 mois de commandes, ou lignes écartées | Signaux et inactivité sous-estimés | Signaux, inactifs : partiel |
| Pas d'échéancier | Aucun impayé déclaré (règle de vérité) | Échu : éteint |
| **Pas de fichier clients EBP** | Les codes EBP ne sont pas reliés aux garages : inactifs non repérés, couleurs « probables » | Inactifs, couleurs : partiel |
| Pas de colonne « famille client » | Carrosserie / mécanique déduite du terrain ou du nom | Couleurs : partiel |
| Pas de colonne « statut du compte » | Comptes bloqués invisibles | Bloqués : partiel |
| Homonymes | Jamais reliés au hasard ; listés | Garages reliés : partiel |
| Devis du téléphone absents d'EBP | Dit, jamais affiché « relié » | Devis : partiel |

## Toujours éteints aujourd'hui (7) — donnée ou décision manquante

Marge (prix d'achat EBP) · objectif (Faizal) · panier habituel et réachat par produit (export ligne d'article) ·
vente directe / distribution (repérage des distributeurs + règle) · suivi des Offres de conquête (marge + offres validées) ·
supervision de la direction (écran et comptes, après accord d'hébergement) · essais Carsystem (Lot 3).

## Constat à retenir pour les données réelles

Le **fichier clients EBP est indispensable**, pas facultatif : sans lui, deux voyants restent partiels et la Ville ne
peut pas repérer les clients inactifs. Les 3 exports actuels (pièces avec n° d'origine sur 12 mois, échéancier,
clients avec famille et statut) suffisent pour allumer les 14 voyants opérationnels.

## Corrections du 08/11/2026 (préparation des données réelles, aucune fonction ajoutée)

- Un fichier EBP refusé ne fait plus perdre le fichier du même type déjà chargé (il était effacé).
- Fichier clients : « Code postal » n'est plus pris pour le code client, ni « Compte comptable » pour le statut ;
  colonnes « Bloqué » / « En sommeil » en Oui / Non comprises.
- Test cockpit instable (1 fois sur 3) : le test écrivait dans la base du téléphone avant son ouverture. Test corrigé, téléphone inchangé.
- Guide pas à pas : `GUIDE_EXTRACTION_EBP.md`.
