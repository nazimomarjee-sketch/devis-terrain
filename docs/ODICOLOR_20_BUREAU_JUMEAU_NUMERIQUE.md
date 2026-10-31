# ODICOLOR 2.0 — Cahier des charges / Prompt Claude : Bureau = Jumeau numérique commercial

## Mission (décision du 31 octobre 2026)
Le projet **Bureau** ne doit plus être un CRM générique ni un outil de devis. Il devient **le jumeau numérique commercial ODICOLOR 2.0**, avec une ville interactive inspirée du principe de jeu de gestion « façon Sims » (sans copier de visuels ni de marques de jeu). L'utilisateur simule des décisions **avant** de les appliquer au terrain.

**Ne pas modifier ni déployer l'application téléphone. Ne pas fusionner ce document ni une implémentation sans validation.**

## Sources et faits confirmés
- Activité : distribution de peinture automobile, peinture semi-industrielle, accessoires de préparation, consommables et jetables.
- Terrain : reprendre un portefeuille existant, prospecter par secteurs à la journée ou à la semaine, sécuriser les règlements.
- Les commerciaux ne font plus de livraisons ; Mohamed gère le magasin, les commandes fournisseur, le comptoir et la préparation.
- La transition de Roberlo vers Carsystem est stratégique ; modernisation de l'image et de la gamme ODICOLOR.
- Téléphone Samsung Android = capture opérationnelle terrain ; **EBP = source de vérité des devis/factures** ; Bureau = anticipation et analyse.
- Base Airtable « ODICOLOR — Machine commerciale V4 » : 54 comptes consultés au 31/10/2026, majoritairement prospects ; champs CA/marges non suffisamment renseignés pour prédire.
- « 70k en 2025 » évoqué en rendez-vous : indicateur et périmètre **non confirmés** ; **ne pas l'utiliser** pour calibrer.
- Il n'y a pas de PC personnel actuellement ; préserver l'usage mobile, et concevoir le bureau pour PC à terme.

## Règles non négociables
1. **Deux univers séparés** : RÉEL (lecture seule) vs SIMULATION (copies synthétiques). Chaque valeur porte un badge « Confirmé » (preuve/source) ou « Hypothèse » (paramètre supposé).
2. **Aucun scénario ne modifie les clients, montants, règlements, devis, commandes ou fichiers réels.** Import unidirectionnel et contrôlé (exports téléphone JSON/ZIP compatibles + exports EBP CSV/XLSX selon formats disponibles + éventuellement export Airtable). Ne pas affirmer une synchronisation existante.
3. Les devis ne sont PAS créés dans le Bureau : ils restent dans EBP.
4. Résultats = projections **conditionnelles**, jamais promesses ni prédictions certaines. Montrer fourchette d'incertitude, marge et encaissement, pas seulement CA.
5. Interface Premium Pro, sombre, sobre avec accent rouge, gros boutons, très peu de texte, une décision à la fois. Conserver l'identité de l'app existante là où c'est cohérent ; ne pas sacrifier la lisibilité au jeu.

## Étape 1 — Construire la ville
Créer 30 clients/prospects simulés, avec identifiant fictif, secteur, famille (petit/gros, fidèle/infidèle, sensible au prix, difficile/retard, dormant, prospect carrosserie, prospect industriel), achats mensuels, besoin, budget, confiance, mode de règlement, sensibilité aux prix, fournisseurs concurrents, déclencheurs d'achat et causes de départ.
Créer 8 acteurs au total : copie du commercial utilisateur, Faizal (direction), Mohamed (magasin), Laurent (formation / rôle exact à confirmer), deux commerciaux fictifs si besoin, un fournisseur et un concurrent ; **ne jamais présenter les agents fictifs comme de vraies personnes recrutées ou partenaires réels**.
Ville schématique animée, commerces cliquables et couleurs reflétant prospect/actif/dormant/perdu. Chaque fiche explique les règles de réaction de l'agent.

## Étape 2 — Baseline
Simuler 90 jours sans décision supplémentaire et afficher mois 1, 2, 3 : CA HT, marge/contribution, encaissements et retards, actifs, prospects convertis, clients perdus, visites, actions et ruptures. Données initiales éditables. Si les vrais chiffres sont absents, signaler « DÉMO — HYPOTHÈSES ».

## Étape 3 — Tester une décision
Sélectionner une décision parmi : baisser prix, augmenter prix, remises ciblées, migration Carsystem, tournée sectorisée, relances, conditions de paiement, nouveau marché semi-industriel, nouvelle gamme, recrutement, formation, relooking ODICOLOR.
Tester sur **la même population**, pendant **les mêmes 90 jours** et avec **la même graine aléatoire** : scénario 0 (base), A (décision), B (contraire), C (alternative optimisée).
Montrer réactions plausibles de 3 à 5 agents significatifs (exemple concret et cause), avec impact produits, stock et règlement. Prévoir paramètres modifiables (tarifs, coûts, conversion, capacité de visite, paiement, coûts fixes). Calculs cohérents entre ventes, marge et trésorerie.

## Étape 4 — Décider
Tableau comparatif des 4 scénarios : CA HT, marge/contribution, encaissement, clients gagnés/perdus, effort, risques, délai. Verdict explicable et contredisant la décision de départ si A est moins bon. Toujours fournir **UNE première action terrain cette semaine** et expliquer ce qu'il est impossible de prévoir.

## Moteur
- Simulation locale déterministe, tests reproductibles, graine affichée.
- Événements semaine par semaine : visites, commandes, conversion, fidélisation, achats fournisseurs, disponibilité et paiement.
- Au moins trois répétitions avec autres graines pour donner une plage indicative.
- Paramètres versionnés dans une sauvegarde exportable, reset et mode DEMO.
- Prévoir des tests automatiques : aucune mutation du réel, mêmes données + même graine => mêmes résultats, conservation comptable, distinction CONFIRMÉ/HYPOTHÈSE.

## Livraison progressive
1. **Lot A (prototype autonome)** : ville 30 + 8 agents, 90 jours, A/B/C, fiches, métriques, mode DEMO, téléphone compatible.
2. **Lot B** : import lecture seule et validation des exports existants, calage sur EBP et terrain, provenance des données.
3. **Lot C** : scénarios avancés, contraintes de stock et trésorerie, validation terrain sur 4 semaines.

## Ce que l'IA exécutante doit faire
- Inspecter d'abord le code et les branches du dépôt, repérer le module Bureau et les contrats d'import/export existants.
- Créer une branche de développement séparée, sans casser la PWA téléphone.
- Ne pas repartir de zéro sans raison, ne pas ajouter de devis natifs, ne pas supprimer de données.
- Fournir un prototype testable et les tests, puis une PR **en brouillon**, sans fusion ni déploiement non demandé.
- Résumer en français simple ce qui fonctionne, ce qui est simulé et ce qui reste à vérifier sur Samsung/PC.

**Critère principal :** l'utilisateur doit pouvoir dire « si je fais X, qu'est-ce qui pourrait se passer pour mes ventes, ma marge, mes clients et ma trésorerie ? » et obtenir une comparaison claire et traçable, sans confondre hypothèses et réalité.
