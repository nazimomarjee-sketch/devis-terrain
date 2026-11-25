# ODICOLOR — Bilan des essais Samsung (29 octobre 2026)

**Périmètre :** lot de fiabilisation PR #2, branche `fix/lot1-f01-f03-recuperation`. Prévisualisations Cloudflare Pages isolées : `odicolor-test-pr2-20261028-a.pages.dev`, `odicolor-test-pr2-20261028-b.pages.dev`, `odicolor-test-pr2-20261028-guide.pages.dev`. **Uniquement des données synthétiques** ; aucune validation de production.

## Résultats constatés par l'utilisateur sur Samsung Android / Chrome

| Test | Résultat | Limite |
|---|---|---|
| Publication A, B et Guide | RÉUSSI | Captures Cloudflare et ouverture du guide |
| A vierge | RÉUSSI | 0 client avant import |
| Import jeu synthétique dans A | RÉUSSI | Confirmation 3 garages / 12 devis et liste de 3 garages |
| Fiche et photo de garage synthétique | RÉUSSI | Photo rouge visible ; texte de l'image chevauche l'interface |
| PDF de test dans A | RÉUSSI PARTIELLEMENT | 2 PDF listés ; PDF SYNTHETIQUE 2 ouvert sur capture |
| Articles/tarifs dans A | RÉUSSI | 30 références affichées ; SYN-00001 : 10,00 € HT, 10,85 € TTC avec TVA **fictive** 8,5 % |
| Export complet de A | RÉUSSI | Fichier .odicolor transmis, 34 362 octets |
| Contrôle indépendant de l'export | RÉUSSI | Signature ODICOLOR-BACKUP-2 ; en-tête SHA-256 et empreintes des 5 pièces joints conformes ; 3 clients, 12 devis, 30 articles ; 3 SVG + 2 PDF |
| B vierge avant restauration | RÉUSSI | 0 client dans Chrome |
| Restauration export A → B | RÉUSSI | Confirmation 3 garages / 12 devis ; 3 garages affichés ensuite |
| Photo garage dans B | RÉUSSI | Photo synthétique rouge présente |
| PDF dans B | RÉUSSI | 2 documents listés ; ouverture de PDF SYNTHETIQUE 1 confirmée par utilisateur |
| Tarif dans B | NON FORMELLEMENT PROUVÉ | L'utilisateur a répondu « Ok », sans capture du prix |
| Rejet sauvegarde corrompue dans B | RÉUSSI | Message « Restauration annulée : Sauvegarde corrompue (pièce jointe). » ; 3 garages toujours présents après refus |
| Hors connexion sur A | RÉUSSI — PÉRIMÈTRE LIMITÉ | Mode avion, 3 garages visibles selon utilisateur ; ni PDF hors ligne ni écriture/restauration hors ligne vérifiés |
| Sauvegarde tronquée / fort volume / quota | NON TESTÉ SUR SAMSUNG | Test tronqué volontairement écarté ; scripts automatiques selon PR |

## Validation technique antérieure

La description de la PR #2 rapporte **82 tests Node et 15 scénarios Chromium** réussis ; ce bilan ne prétend pas les avoir relancés. Aucun audit matériel grand volume, stockage saturé ou migration V47 sur Samsung n'est certifié.

## Corrections et priorités

1. **P1 — Libellés de sauvegarde trompeurs** : `premium-pro-v38.js` et `catalogues-pdf-v32.js` parlent uniquement de « sauvegarde JSON » qui ne contient pas photos/PDF, sans expliquer que l'export complet `.odicolor` contient bien les pièces. Modifier les textes d'aide et le guide ; aucun comportement de stockage à changer. Ticket [#5](https://github.com/nazimomarjee-sketch/devis-terrain/issues/5).
2. **P2 — Affichage `null` sur Tournée lorsque la base est vide**, constaté en capture. Reproduire sur Chrome et/ou Samsung Internet, identifier la provenance et ajouter test de régression. Ticket [#4](https://github.com/nazimomarjee-sketch/devis-terrain/issues/4).
3. **P2 — Photo synthétique du garage** : le texte embarqué dans le SVG « PHOTO SYNTHETIQUE 1 » chevauche les éléments de la bannière. Défaut de lisibilité du jeu de test, sans preuve d'un défaut sur une vraie photo. Améliorer le cadrage/voile ou modifier le visuel synthétique sans nuire au design Premium Pro. Ticket [#5](https://github.com/nazimomarjee-sketch/devis-terrain/issues/5).
4. **P1 avant données réelles — confidentialité** : exports `.odicolor` vérifiés mais en clair, données locales et prévisualisations publiques ; autorisation, procédure de sauvegarde sûre, gestion d'accès, restitution et règles EBP nécessaires. Ticket [#6](https://github.com/nazimomarjee-sketch/devis-terrain/issues/6).
5. **P2 — Clarté métier avant présentation Faizal** : le bouton « Nouveau devis » reste au premier plan malgré EBP comme outil officiel. Vérifier l'intitulé et l'articulation avec la mission Business Developer (prospection, clients, visites, essais, relances, suivi commandes), sans supprimer les données existantes.
6. **P2 — Guide de test** : préciser que les PDF synthétiques se consultent dans `Catalogue → Catalogues fournisseurs (PDF)` et non dans la fiche garage ; distinguer ZIP / nom du projet Cloudflare. Ticket #5.

## Décision

**Go pour une démonstration avec données synthétiques**, après corrections visuelles/libellés. **Pas encore de Go pour utilisation de données réelles de l'entreprise**, fusion ou déploiement production. La PR #2 reste en brouillon. La version actuellement publiée et la branche `main` ne sont pas modifiées par ce document.

Validation post-correction demandée : build PWA reproductible, tests Node/Chromium, contrôle des empreintes, puis court essai de non-régression sur Chrome/Samsung, avec compte rendu avant toute fusion.
