# Feuille de route — Espace client et parcours de commande (parcours de réapprovisionnement inscrit le 07/11/2026 — rien de développé)

Objectif : faciliter le **réachat régulier** et augmenter le **panier moyen et la marge**, avec le minimum de clics pour le
client et sans démarche supplémentaire pour lui. EBP reste l'outil où la commande définitive est saisie.

## Réapprovisionnement client en un clic — inscrit à la feuille de route (décision du 07/11/2026)

**Ne pas développer pour l'instant.** Parcours retenu, dans cet ordre :

1. **Demande reçue par le commercial** : le client envoie son réapprovisionnement en un clic ; la demande arrive chez son commercial.
2. **Proposition éventuelle** : le commercial peut proposer des produits complémentaires ou une **Offre de conquête** (rien d'obligatoire).
3. **Confirmation du client** : le client confirme la commande finale (avec ou sans les ajouts proposés).
4. **Traitement dans EBP** : le commercial saisit la commande dans EBP ; jamais de commande créée automatiquement dans EBP.

Le tableau détaillé ci-dessous décrit le même parcours (étape 4 du tableau = proposition **et** confirmation du client).

## Parcours (détail)

| Étape | Qui | Ce qui se passe | Garde-fous |
|---|---|---|---|
| 1. Demande en un clic | Client (téléphone) | Écran unique « Recommander mon panier habituel » : produits et quantités habituels, un bouton « Envoyer ». Accusé de réception immédiat : numéro de demande et heure | Panier calculé sur ses **commandes EBP réelles** ; aucun prix affiché s'il n'est pas issu du tarif EBP ; disponibilité « confirmée par votre commercial » |
| 2. Réception | Commercial responsable | La demande arrive dans son espace : client identifié (code EBP), produits, quantités, heure | Une demande = un identifiant unique : renvoyée deux fois (réseau), elle n'est enregistrée qu'une fois ; demande identique < 24 h : le client est prévenu avant d'envoyer |
| 3. Suggestions | Cockpit | Produit complémentaire, quantité supérieure, palier dégressif, Offre de conquête ou offre adaptée | Uniquement à partir des produits et des achats du garage (et du portefeuille) ; **aucun prix ni disponibilité inventés** : tarif EBP daté ou « prix à confirmer » ; stock « à vérifier » (aucune donnée de stock à ce jour) |
| 4. Proposition | Commercial | Appelle ou écrit au client, fait accepter les ajouts, note ce qui est accepté ou refusé | Le client n'a rien à refaire dans l'appli |
| 5. Commande définitive | Commercial, dans EBP | Saisie dans EBP avec le numéro de demande en référence | Le Bureau relie la commande EBP à la demande (par la référence) ; statut « Traitée » visible par le client ; jamais de commande créée automatiquement dans EBP |

Statuts visibles par le client : Reçue → Prise en charge → Traitée (n° de commande EBP) / Annulée.

## Mesures prévues

Délai de prise en charge · taux de demandes traitées · panier moyen demandé vs commandé · ajouts acceptés (produits,
quantités, paliers) · marge additionnelle (si l'export EBP fournit la marge) · fréquence de réachat par client.

## Prérequis

Base partagée hébergée et comptes (après le Socle 0) · données réelles autorisées (ticket #6) · tarif EBP importé ·
nouveau rôle « client » limité à son panier et à ses demandes (pôle « Espace clients », inactif jusqu'à décision de la
direction) · cadre RGPD pour les contacts clients.

## Décisions à prendre avant tout développement (une à la fois)

1. Identification du client : lien personnel sécurisé sans mot de passe, ou compte avec mot de passe.
2. Un clic strict (panier habituel tel quel) ou possibilité d'ajuster les quantités avant l'envoi (un geste de plus).
3. Prévenir le commercial : dans son espace seulement, ou aussi par message (SMS / WhatsApp).
4. Forme de la confirmation du client (étape 3 du parcours) : accord oral ou écrit noté par le commercial, ou bouton
   « Je confirme » dans l'espace client. À trancher : le tableau prévoyait « le client n'a rien à refaire dans l'appli ».
