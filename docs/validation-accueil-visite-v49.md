# Accueil et visite — reprise après b9df892

## Scénarios concernés

- Accueil : objectif puis prochaine action, bandeau photo raccourci, sources et montants secondaires à ouvrir, résumé de tournée sans liste imposée.
- Visite : note avant les choix, retour aux étapes précédentes avec saisie conservée, échéance modifiable (aujourd’hui proposé pour une visite avec échange), libellé « Devis à préparer ». Les devis restent dans EBP.
- Report : la note saisie est conservée comme note commerciale, sans créer de visite effectuée.
- Grandes polices : mise en page adaptative testée avec la taille racine à 200 %, sans défilement horizontal sur Accueil, Tournée et Visite.

## Vérifications locales

- 419 tests Node réussis, 2 ignorés, aucun échec.
- 11 scénarios navigateur Accueil/Tournée/Visite réussis, dont retours avec note et échéance conservées, enregistrement, rechargement, annulation de fiche et navigation vers le garage suivant.
- Sauvegarde/restauration : 9 scénarios réussis.
- PWA : 6 scénarios réussis (installation, mise à jour, intégrité, récupération et ancien shell hors ligne).
- CA : 6 scénarios réussis ; test adapté pour ouvrir les sources repliées avant de vérifier la séparation facturation/commandes.
- Build PWA régénéré ; aucune modification du moteur ou des ressources Ville LEGO.

## Limites

Les essais sont exécutés sous Chromium 141 avec Playwright 1.56.1. L’agrandissement CSS à 200 % ne reproduit pas toutes les préférences d’accessibilité Android. Le vrai Samsung reste à tester : lisibilité, clavier, retour, date, défilement et hors ligne. Aucun gain de temps terrain n’est établi. Les parcours nominaux conservent 4 touchers (vu) ou 3 (absent), hors saisie facultative, choix de date et corrections.

Les cinq garages visibles sont une mesure en émulation 360 × 740 à taille normale, pas une garantie avec des polices agrandies. Aucun déploiement ni fusion sur main dans ce lot.
