# ODICOLOR 2.0 — Feuille de route consolidée (08/11/2026)

Règle : **construire un outil qui vend davantage, pas une accumulation de fonctionnalités.** La croissance du CA finance
l'évolution. Aucune fusion, publication, mise en production, hébergement ou donnée réelle sans accord du propriétaire.
Aucun agent IA ne travaille sans demande explicite ; il propose, il n'exécute jamais sans validation.

Ce document regroupe les orientations du 08/11/2026. Il ne remplace pas les documents existants, il les relie :
`FEUILLE_DE_ROUTE_TELEPHONE_BUREAU.md`, `OFFRES_DE_CONQUETE.md`, `PARCOURS_COMMANDE_CLIENT.md`, `ODICOLOR_LAB.md`, `socle/LISEZ-MOI.md`.

## 1. État réel (vérifié dans le dépôt le 08/11/2026)

| Brique | État | Où |
|---|---|---|
| Téléphone commercial (V47) | **En service**, testé | `main` |
| Correctif du plan du matin + tests de stabilisation | Développé, testé (CI verte), **non fusionné** | PR #2 `fix/lot1-f01-f03-recuperation` |
| Bureau : imports EBP (pièces, règlements, clients), lecture `.odicolor`, plan du jour, cockpit | Développé, testé, **données fictives**, non fusionné | `ccr-b491dc52-ckgq60` |
| Ville LEGO : P1–P5, 4 couleurs (option A), Ville connectée à EBP | Développé, testé, **données fictives**, non fusionné | `ccr-b491dc52-ckgq60` |
| Socle 0 : rôles, droits, synchronisation, journal, Offres de conquête (calcul et suivi) | **Logique** testée, sans serveur ni comptes | `socle/` |
| Agent 01 (assistant commercial) | En service : copier-coller vers Claude, anonymisé par défaut | `agent-commercial-v35.js`, `CLAUDE_AGENT01_INSTRUCTIONS.md` |
| Techniques commerciales (dont SPIN Selling) | En service dans le téléphone | `techniques-commerciales-v46.js` |
| Catalogues fournisseurs PDF (Carsystem…) | En service dans le téléphone | `catalogues-pdf-v32.js` |
| Anneau doré « Offre de conquête » dans la Ville | **Maquette** | `docs/maquettes/` |
| Espace client / parcours de réapprovisionnement | **Document** seulement | `PARCOURS_COMMANDE_CLIENT.md` |
| Agence 3D, agents Marché/Achats/Logistique/Analyste/Méthodes/Ingénieur/Logiciel | **Inexistant** | — |
| ODICOLOR LAB (pôle Ingénierie et Innovation), concept WORKSTATION | **Vision** seulement | `ODICOLOR_LAB.md` |
| « Reproduire une vente réussie », mémoire des ventes | **Inexistant** | — |
| Canal distribution (distributeurs, revendeurs) séparé dans le cockpit | **Inexistant** (dépend des colonnes EBP) | — |
| Serveur, accès distant, comptes, authentification forte, chiffrement des sauvegardes | **Inexistant** | — |
| Données EBP réelles | **Jamais importées** (accord de la direction attendu, ticket #6) | — |

## 2. Doublons et contradictions

1. **Trois versions du parcours client** (5 étapes, 4 étapes du 07/11, 6 étapes du 08/11). Référence désormais : les 6 étapes du 08/11.
   Elles tranchent un point ouvert : le client ne confirme que si la demande est **modifiée** ; un réapprovisionnement simple passe vite.
2. **IA externe vs confidentialité.** Les agents IA reposent sur Claude, donc sur un service externe. Règle proposée :
   anonymisé par défaut (comme l'Agent 01), données nominatives seulement avec autorisation.
3. **PC indépendant vs application client et accès distant.** Un garage ne peut pas joindre un PC isolé sans l'ouvrir à Internet.
   L'application client et l'accès depuis le Samsung exigent un hébergement sécurisé : c'est la dépense et le risque les plus lourds.
   Le test auprès de 5 garages peut se faire **sans** cet hébergement (voir priorité 3).
4. **Sept agents + agence 3D** : risque d'accumulation. Proposition : un agent = une fiche de mission (rôle, indicateurs, méthode,
   données autorisées), utilisée à la demande dans Claude. Aucun code tant qu'un agent n'a pas prouvé un gain commercial.
   L'Agent Business Developer prolonge l'Agent 01 existant (pas de reconstruction).
5. **Notification WhatsApp** : l'API WhatsApp Business est payante et demande un compte Meta. Un lien « ouvrir WhatsApp »
   prérempli suffit pour commencer (gratuit, envoi par le commercial).
6. **Branches** : `docs/odicolor-20-bureau-jumeau-numerique` (cadrage du 31/10) et la PR #3 recoupent le travail actuel ;
   `docs/en-attente/lot1-stabilisation-tests.patch` est déjà appliqué sur la PR #2. Rien supprimé ; à ranger avec ton accord.

## 3. Risques techniques

- Le Bureau et la Ville n'existent que sur une branche de travail : un seul exemplaire, non fusionné.
- La vérification automatique (CI) ne tourne que pour `main` et utilise un Ubuntu non pris en charge par l'outil de test
  (corrigé seulement sur la PR #2) ; les tests du Bureau en navigateur n'y sont pas.
- Colonnes EBP **supposées** : famille client (carrosserie / Mécan / distributeur ?), n° de pièce d'origine, marge,
  et pour le panier habituel : code article et quantité par ligne.
  Si elles manquent, les couleurs, les canaux et les marges ne sont pas calculables.
- Dépôt **public** : aucune donnée réelle ne doit jamais y entrer.
- Téléphone : le code NAF 45.20B est classé « carrosserie » alors qu'il désigne d'autres véhicules (signalé, non corrigé).
- Encours et échéances affichés au client : sensibles (erreur = litige). À n'ouvrir qu'avec des données fiables et l'accord de la direction.
- Vente directe et distributeurs : un garage peut acheter chez un revendeur ODICOLOR. Règle d'attribution à définir avant de mesurer.

## 4. Classement

Impact : effet attendu sur CA, marge ou réachat · Coût / difficulté : 1 faible à 3 élevé.

| # | Développement | Impact | Coût | Difficulté | Dépend de |
|---|---|---|---|---|---|
| 1 | Données EBP réelles : colonnes, puis essai 100 % local sur le PC | Très fort (tout en dépend) | 1 | 1 | Accord direction (#6) |
| 2 | « Reproduire une vente réussie » v0 : fiche de vente + 5 garages similaires via Ma Ville | Fort, direct | 1 | 1 | 1 (pour les données réelles) |
| 3 | Test réapprovisionnement 5 garages **sans appli** : panier habituel calculé par le Bureau, envoyé par WhatsApp par le commercial | Fort, et valide l'appli avant d'investir | 1 | 1 | 1, accord 5 garages |
| 4 | Fusion PR #2 (correctif téléphone) + fusion du Bureau | Moyen | 1 | 1 | Ton accord |
| 5 | Cockpit par canal (direct / distribution) | Moyen | 1 | 2 | Colonnes EBP, règle d'attribution |
| 6 | Hébergement sécurisé, comptes, accès Samsung | Prérequis de l'appli client | 3 | 3 | Résultat de 3, budget |
| 7 | Prototype appli client (panier, un clic, prise en charge) | Fort si 3 réussit | 2 | 2 | 3 et 6 |
| 8 | Fiches de mission des 6 autres agents | Variable | 1 | 1 | Une mission demandée |
| 9 | ODICOLOR LAB : fiche projet WORKSTATION (puis cales, pistolet, ateliers) | Incertain tant que le QR n'est pas prouvé | 2 | 2 | Résultat de 3, mission autorisée, conformité |
| 10 | Agence 3D | Faible sur les ventes | 2 | 2 | Agents utiles d'abord |

## 5. Testable vite avec l'existant

- **QR code de réapprovisionnement (LAB)** : une étiquette QR sur les rangements actuels du garage, qui ouvre un message
  WhatsApp prérempli vers le commercial, dans le test « 5 garages ». Prouve l'usage avant de concevoir la WORKSTATION.

- **Ma Ville + filtres** : trouver des garages proches et du même segment qu'un client gagné (base de « Reproduire une vente »).
- **Agent 01 + techniques SPIN** : analyser une vente racontée par un commercial, en copier-coller anonymisé.
- **Bureau** : le panier habituel n'est **pas encore calculable** : l'import actuel totalise chaque pièce et ne garde ni article
  ni quantité. Il faut un export EBP « ligne par ligne d'article » (code article, désignation, quantité) — petit ajout à l'import.
- **WhatsApp** du commercial : envoyer le panier et recevoir « OK » ; mesurer usage, délai et ajouts acceptés dans un simple tableau.

## 6. Trois prochaines priorités

1. Données EBP réelles (colonnes d'abord, puis essai local avec l'accord de la direction).
2. « Reproduire une vente réussie » v0 avec les outils existants.
3. Test de réapprovisionnement auprès de 5 garages volontaires, sans application, après ton autorisation.

## 7. Décisions du 08/11/2026

- ODICOLOR LAB : cadrage **validé**, pôle **en attente**. La WORKSTATION doit être utile techniquement même sans QR code.
- Priorité : **réveil du cockpit**. Démonstration sur données fictives faite (`REVEIL_COCKPIT.md`) : 14 voyants s'allument
  avec 3 exports EBP + la sauvegarde du téléphone ; 7 restent éteints faute de donnée ou de décision.
