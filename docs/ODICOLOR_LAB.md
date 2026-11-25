# ODICOLOR LAB — Pôle Ingénierie et Innovation (cadrage validé le 08/11/2026 — EN ATTENTE, rien de développé)

**Mission :** transformer les problèmes et besoins des carrossiers en solutions concrètes, commercialisables sous la marque ODICOLOR.
**Double objectif :** une utilité quotidienne pour le garage, et davantage de commandes récurrentes pour ODICOLOR.

## Règle fondamentale

Les agents sont force de proposition. **Aucune mission ne démarre sans autorisation explicite du propriétaire.**
Aucun achat, contact fournisseur, prototype, impression 3D, développement logiciel ou commercialisation automatique.
Chaque projet doit justifier son intérêt pour les garages et son potentiel de croissance rentable pour ODICOLOR.
Les agents distinguent toujours **faits**, **hypothèses** et **données manquantes** ; aucun prix, coût ou volume inventé.

## Place dans l'architecture

- Pôle **inactif**, déclaré comme les autres futurs pôles (magasin, formation, administratif, marketing). Il sera ajouté à
  `socle/organisation.js` (« lab », inactif, activation = décision de la direction) **uniquement** quand tu le demanderas.
- Un agent = une **fiche de mission** (rôle, livrables, limites, données autorisées), utilisée à la demande dans Claude,
  anonymisée par défaut. Pas de code tant qu'un projet n'a pas été autorisé.
- Coordination : l'**Agent Business Developer** reste le coordinateur ; le LAB ne lance rien qui ne serve pas la vente.
- Décisions de la direction concernées : `investissement` (prototype, outillage, achat), `prix`, `offre-conquete` (si le produit est offert).
- Dans l'agence 3D (plus tard) : le LAB sera une pièce de l'agence, reliée aux fiches projets, pas une animation.

## Agents du LAB

| Agent | Prépare (sur demande) | Ne fait jamais |
|---|---|---|
| Technicien Méthodes | Analyse des besoins d'atelier, concept, modèles 3D, plans cotés, fichiers STL/3MF, préparation à l'impression, optimisation matière/coût/procédé, améliorations selon retours terrain | Lancer une impression, commander de la matière |
| Ingénieur | Supervision des conceptions ; résistance, sécurité, faisabilité, conformité ; procédés et limites des matériaux ; avis technique avant essais | Remplacer un contrôle par un professionnel qualifié ; valider seul un produit pour cabine ou zone à risque |
| Business Developer | Potentiel commercial, garages intéressés (Ma Ville), prix de vente et concurrence, marges, volumes, fidélisation | Annoncer un prix au client ; promettre une livraison |
| Achats | Comparaison matériaux, composants, fabricants ; interne ou sous-traité ; coûts prévisionnels | Contacter un fournisseur ; passer commande |

## Fiche projet (7 rubriques obligatoires)

1. Besoin client et solution proposée (qui l'a exprimé, combien de garages, preuve).
2. Concept et plans techniques.
3. Matériaux et procédé de fabrication.
4. Coût de revient, prix de vente envisageable, marge.
5. Volume potentiel, seuil de rentabilité, risques.
6. Protocole de tests terrain (garages, durée, critères de réussite fixés **avant** le test).
7. Recommandation : **approfondir**, **prototyper** ou **abandonner**.

Chaque chiffre porte sa source (EBP, devis fournisseur, mesure, estimation) ; une estimation est signalée comme telle.

## Conformité — règle stricte

Tout produit destiné à une cabine de peinture, à un laboratoire de mélange ou soumis aux solvants, à l'électricité statique
ou à une atmosphère explosive exige une **étude de conformité spécifique et une validation par des professionnels qualifiés**
avant tout essai en garage. Points à faire vérifier (hypothèses, pas des conclusions) :
- « Hors cabine » ne veut pas dire « hors zone à risque » : l'aire de préparation et le local de mélange peuvent être classés ATEX.
- Les plastiques d'impression 3D courants sont isolants (charges électrostatiques) et inégalement résistants aux solvants.
- Un produit vendu sous marque ODICOLOR engage la responsabilité d'ODICOLOR (sécurité générale des produits, marquage,
  notice) ; vérifier aussi les dessins et modèles existants avant de concevoir.

## Premier concept à étudier : ODICOLOR WORKSTATION

Système modulaire d'accessoires pour peintres : support ergonomique de pistolet (hors cabine dans un premier temps),
rangements pour godets, filtres, buses et abrasifs, modules interchangeables, personnalisation au nom du garage,
fabrication possible en impression 3D, **QR code ODICOLOR** de réapprovisionnement.

**QR code :** il ouvre une demande sécurisée dans l'application client, transmise au commercial (traitement et vente
complémentaire éventuelle) — même circuit que le réapprovisionnement en un clic (`PARCOURS_COMMANDE_CLIENT.md`).
Protections : un QR identifie le garage, pas une personne ; il ouvre une **demande**, jamais une commande ; la demande est
confirmée par une personne autorisée du garage ; anti-doublon (une demande identique récente est signalée).

**Exigence du propriétaire (08/11/2026) :** la WORKSTATION doit avoir une **vraie utilité technique, indépendamment de
son QR code**. Critère de la fiche projet : le garage l'utiliserait même sans QR (ergonomie, rangement, gain de temps
mesurable). Si ce critère n'est pas démontré, recommandation « abandonner », quel que soit l'intérêt du QR.

### Points à challenger avant tout travail de conception

| Sujet | Constat | Statut |
|---|---|---|
| Dépendance | Le QR suppose l'application client, qui n'existe pas | Fait |
| Ce qui crée la vente | Le réachat vient du QR, pas du support : il faut d'abord prouver que le QR déclenche des demandes | Hypothèse à tester |
| Test sans fabrication | Étiquette QR posée sur les rangements actuels du garage → message WhatsApp prérempli vers le commercial, dans le test « 5 garages » | Proposition, rien de développé |
| Vendre ou offrir | Si offert : c'est un cadeau d'**Offre de conquête** (plafond et marge déjà encadrés) ; si vendu : prix, garantie et SAV à prévoir | Décision à prendre plus tard |
| Impression 3D | Adaptée au prototype et à la petite série ; coût unitaire et durabilité en atelier à mesurer | Hypothèse |
| Concurrence | Des supports de pistolet existent déjà sur le marché ; la différence doit venir du réapprovisionnement et de la personnalisation | À étudier par l'Agent Business Developer |
| Données manquantes | Nombre de garages intéressés, coût matière/heure d'impression, prix acceptable, consommation de consommables par garage | Manquant |

## Ordre proposé (dans la feuille de route)

Le LAB vient **après** les données EBP réelles et le test de réapprovisionnement auprès de 5 garages.
Si le test montre que les garages utilisent le QR / la demande en un clic, alors seulement : fiche projet WORKSTATION
(rubriques 1, 4, 5 et 7 d'abord, sans plans), puis décision « prototyper ou abandonner ».
