# Maquette — Ville LEGO connectée au pipeline commercial (07/11/2026)

**Statut : proposition en attente d'accord du propriétaire.** La Ville réelle (`bureau/index.html`) n'est pas modifiée.
Données 100 % fictives (fichiers `tests/fixtures/bureau/`).

## Principe

Aucun nouveau dessin. La Ville sait déjà afficher des personnages vert / bleu / orange / rouge, des pastilles d'alerte,
un « CA du mois » et un fil d'actions. En mode « Mes garages », le CA restait « Non renseigné » et le fil n'affichait que
les étapes saisies au téléphone. La maquette **remplit ces états existants** avec le pipeline EBP.

| Élément existant de la Ville | Alimenté par | Règle |
|---|---|---|
| Personnage rouge « Risque de règlement » | Échéancier EBP / fichier clients | Facture échue ou compte bloqué |
| Personnage orange « Dormant / à relancer » | Historique de commandes EBP | Signal « à reconquérir » (> 60 j sans commande, hypothèse) |
| Personnage vert « Client actif » | Commandes EBP | Au moins une commande sur 12 mois |
| Personnage bleu « Prospect » | Téléphone | Inchangé si le garage est absent d'EBP |
| Pastilles d'alerte des villes | Calcul existant (risque + dormant) | Inchangé |
| « CA du mois » (haut, villes, panneau) | Commandes EBP du mois | Badge « EBP » au lieu de « Non renseigné » |
| Fil d'actions (pictos Relance, Devis, Visite) | Plan du Bureau | Priorités du jour d'abord, puis étapes saisies au téléphone |
| Fiche : « Prochaine action », onglet « Commandes » | Plan + EBP | L'onglet annonçait déjà « lus dans les exports EBP » |

Garde-fous : un garage n'est relié à EBP que si son nom correspond à **un seul** client EBP (homonymes jamais reliés au hasard) ;
la fiche du téléphone n'est jamais modifiée ; un client EBP sans fiche au téléphone n'est pas ajouté à la Ville (il est signalé).

## Ce qui changerait dans `bureau/index.html` si tu valides

`ville-connectee.patch` : 5 retouches de **logique d'affichage** (P1 à P5), aucune ligne de style, de SVG, de personnage ou d'animation.
Les 11 fonctions de dessin et d'interaction de la Ville restent identiques. Module ajouté : `bureau/ville-pipeline.js` (testé).

## Captures (mêmes garages fictifs)

- `ville-avant-bureau.png` : Ville actuelle en mode « Mes garages » (CA non renseigné, fil vide, tous verts ou bleus).
- `ville-apres-bureau.png` : Ville connectée — même apparence, données EBP vivantes.
- `ville-apres-fiche-commandes.png` : fiche d'un garage, onglet « Commandes » avec preuves EBP.
- `ville-apres-telephone.png` : format téléphone, identique à l'actuel.

## Questions ouvertes (une à la fois)

1. Les étiquettes « SAISI TERRAIN » des compteurs Clients / Risque règlement et des fiches restent affichées alors que le statut
   vient en partie d'EBP. Proposition : « EBP + terrain » quand le statut a été corrigé par EBP.
2. Un client « en baisse » reste vert (actif) ; il est visible dans la fiche et dans Opportunités. Faut-il une alerte dans la Ville ?
