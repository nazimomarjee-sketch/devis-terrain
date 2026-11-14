# ODICOLOR 2.0 — Lot 5 « Commerce » (14/11/2026)

Branche `odicolor-2-0-lot1-socle`. Données **fictives** dans les tests. Aucun envoi automatique, aucune vente déduite.

## Parcours (vérifié de bout en bout sur données fictives)
Garage → besoin → **demande de devis** (téléphone) → récapitulatif WhatsApp préparé pour Mohamed (envoi manuel)
→ n° du **devis EBP** saisi → envoyé → accepté / refusé → **commande** et **facture** reconnues dans les exports EBP
(par la colonne « pièce d'origine ») → **encaissement** (échéancier EBP, TTC), avoirs déduits.

## Téléphone
- Fiche garage : bouton « Demande de devis (pour EBP) » (72 px) et 3 dernières demandes avec leur étape.
- Page demande : bandeau « ce n'est PAS un devis EBP » ; besoin du garage ; recherche dans le catalogue importé
  (référence, désignation, marque, catégorie ; Roberlo jamais proposée) ; quantités +/−, ligne libre ;
  aucun prix saisi ; étapes brouillon → à traiter → traité dans EBP (n° obligatoire) → envoyé → accepté/refusé ;
  historique complet ; compte bloqué = transmission refusée ; contenus Studio validés de la marque signalés.
- Import des articles : colonnes facultatives Marque, Catégorie, Conditionnement (documents fiables uniquement).
- Stockage : meta `demandesDevis`, inclus dans la sauvegarde complète (compatible : absent = aucune demande).

## Bureau → onglet Commerce
- Tableau de bord : CA facturé HT du mois (EBP), objectif saisi et reste, demandes à traiter, devis en attente,
  commandes sans facture, taux de transformation (sur les demandes décidées), clients à relancer (≥ 7 j).
  Chaque donnée absente est « Non renseigné » avec sa cause ; le CA de démo n'est jamais affiché comme réel.
- Suivi par demande : étape réelle, n° de devis, commandes, factures, facturé HT, encaissé et reste TTC, manques.
- Rapprochement **par identifiant uniquement** (n° devis EBP → pièces d'origine) ; jamais par nom ou montant.
- Commande en ligne : architecture déclarée **désactivée** (`Commerce.ECOMMERCE`) — ni panier public, ni paiement,
  ni transmission de commande ; prérequis listés.

## Limites et données manquantes
- Objectif 20 000 € HT : à saisir dans le Bureau (jamais codé en dur).
- Sans colonne « pièce d'origine » dans l'export EBP, commande et facture ne sont pas reliables (signalé).
- Catalogue : seuls les articles importés depuis des documents fiables ; aucune référence Abel Auto / Sifa fournie à ce jour.
- Le récapitulatif pour Mohamed part par WhatsApp manuel : sa réception n'est pas prouvée.
- Pas testé sur un vrai Samsung ni sur le PC Windows.
