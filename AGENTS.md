# Consignes du projet ODICOLOR

## Principe produit validé le 9 novembre 2026

L'application forme un ensemble : le LEGO exprime son état d'esprit ludique, pas un décor isolé. Conserver cette identité, le plaisir de progresser, le thème sombre et les accents rouges dans une expérience professionnelle cohérente. Les écrans de travail et la ville doivent se compléter. Ne pas uniformiser la ville en tableau compact ni ajouter une gamification envahissante aux formulaires. Respecter le verrou existant sur la Ville LEGO.

## Optimisation pratique mesurable

Optimiser le temps et l'effort nécessaires pour accomplir correctement les tâches terrain, pas simplement la densité d'affichage ou le nombre de clics.

Pour comparer deux versions, utiliser :
E = somme sur les tâches i de f_i × (t_i + p_i × r_i)
où f_i est la fréquence d'usage, t_i le temps d'exécution hors correction, p_i la probabilité d'erreur et r_i le temps moyen de correction.
Mesurer sur des scénarios identiques. Sans mesures terrain, déclarer les valeurs comme hypothèses ; ne pas annoncer d'optimum mathématique ni de gain inventé.
Relever aussi les touchers, défilements, retours arrière et réussites. Une diminution des clics qui augmente les erreurs n'est pas un progrès.

## Critères de conception et de vérification

- Garder une action principale évidente par étape, des intitulés simples, des repères stables et un retour accessible sans perdre la saisie.
- Montrer d'abord l'information utile à la décision ; ouvrir les détails à la demande. Réduire les espaces et répétitions avant de réduire la taille du texte.
- Cible interne de confort tactile : zones d'action d'au moins 48 × 48 pixels CSS, distinctes et sans chevauchement. Ne pas réduire les cibles pour atteindre un quota de lignes.
- Respecter le zoom et les grandes polices ; aucun texte essentiel tronqué sans accès au contenu complet, aucun défilement horizontal nécessaire au parcours principal.
- Tournée : résumé court, une ligne compacte par garage (nom, commune, heure si rendez-vous), bouton Visite, détails au toucher, garages terminés dans une section repliable fermée par défaut. Cible : cinq garages visibles au format et à la taille de texte usuels du Samsung utilisateur, à vérifier ; adapter aux petits écrans et aux grandes polices.
- Accueil : objectif puis prochaine action, résumé compact de la tournée et accès à la liste complète ; ne pas imposer une longue liste sur l'accueil.
- Visite : une question à la fois, possibilité de corriger, note accessible avant l'action qui fait avancer, prochaine action avec échéance modifiable. Éviter de figer une relance à sept jours.
- Les devis restent réalisés dans EBP : indiquer Devis à préparer lorsqu'il s'agit de créer une tâche.
- Conserver une place utile au jeu, aux personnages et à la progression dans l'ensemble du produit. Les animations et récompenses ne doivent ni bloquer une action ni masquer une information commerciale.
- Toute évolution de l'interface doit préciser le scénario amélioré, les mesures disponibles et ce qui reste à tester sur un vrai téléphone. Vérifier rendu, navigation, sauvegarde et fonctionnement hors ligne selon la portée du changement.

## Portée

Ce fichier fixe les critères des prochaines modifications. Son ajout ne signifie pas que les écrans existants ont été modifiés, testés sur Samsung ou déployés.
