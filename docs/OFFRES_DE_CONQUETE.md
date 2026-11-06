# Offres de conquête (07/11/2026)

Objectif : mesurer le **coût d'acquisition** d'un client et sa **rentabilité future**, pour distinguer une conquête
réussie d'une opération déficitaire. Logique intégrée au modèle commercial (`socle/`), **sans nouvelle interface**.

## Contenu d'une Offre de conquête (`socle/modele.js`, entité `offreConquete`)

- Produits : quantité, prix tarif, prix consenti, **paliers dégressifs** (ex. à partir de 6 cartons), coût d'achat réel
  (inconnu = `null`, jamais deviné).
- Cadeaux (ex. pistolet de peinture offert) : **coût réel**, remis ou non.
- Engagement éventuel du client (texte et montant attendu), dates de début et de fin.
- Cycle : brouillon → proposée → **validée par la direction** → en cours → terminée (ou refusée / annulée).
  Rien n'est supprimé : une offre terminée reste dans l'historique.

## Droits (`socle/droits.js`)

- Le responsable du développement prépare, propose, démarre, suit et clôt. Il ne valide jamais.
- La direction valide ou refuse (nom et date obligatoires) ; elle ne réécrit pas l'offre.
- Une offre ne démarre qu'après validation. Une fois validée, prix, produits et cadeaux sont **figés** ; seuls le démarrage,
  les dates, la remise du cadeau, la fin et le bilan restent modifiables.

## Règles de validation (`socle/organisation.js`, HYPOTHÈSES à faire fixer par la direction)

Tant que la direction n'a pas fixé ses règles : **toute** Offre de conquête est validée par elle. Alertes transmises avec
l'offre : taux de marge prévu < 15 %, remise > 30 % du tarif, cadeaux > 300 €, durée > 90 jours.

## Mesures (`socle/offres-conquete.js`)

| Mesure | Source | Définition |
|---|---|---|
| Prix de vente, remises, coût des cadeaux | Offre | Prix appliqué = palier atteint, sinon prix consenti |
| Marge prévue de l'offre | Offre | CA − coût d'achat − coût des cadeaux ; « non calculable » si un coût manque |
| Coût d'acquisition | Offre | Remises accordées + coût réel des cadeaux (hypothèse de définition) |
| Volume et engagement | EBP | Commandes depuis le début de l'offre ; taux de tenue de l'engagement |
| Réachats J30 / J60 / J90 | EBP | Commandes après la commande initiale de l'offre |
| CA et marge cumulés par client | EBP | Commandes (et marge EBP si l'export la fournit) depuis le début |
| Rentabilité dans le temps | EBP + offre | Marge EBP cumulée − coût des cadeaux ; date du seuil de rentabilité |
| Verdict à J90 | Calcul | Conquête réussie · Opération déficitaire · À surveiller (rentable sans réachat) · Non calculable |

Cockpit (`socle/pilotage.js`) : offres en cours et verdicts ; supervision de la direction : offres à valider avec alertes.

## Ville LEGO (maquette, Ville réelle inchangée)

`docs/maquettes/offre-conquete-anneau.png` et `offre-conquete-fiche.png` : anneau LED doré au sol autour du garage
(pulsation lente, coupée si l'appareil demande moins d'animations), personnage et couleurs inchangés ; au clic, onglet
« Offre de conquête » : offre, cadeau, marge, coût d'acquisition, réachats, verdict, historique. L'anneau disparaît à la fin
de l'offre ; l'historique reste dans la fiche. Logique : `bureau/ville-pipeline.js` (`offresParGarage`).
