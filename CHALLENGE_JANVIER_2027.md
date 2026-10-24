# ODICOLOR SOLUTION — CHALLENGE JANVIER 2027

**Mission :** arriver en janvier 2027 avec un copilote commercial terrain fiable, simple sur Samsung et orienté résultats. L'application doit aider le commercial à **tenir ses objectifs** et à **assumer ses engagements** ; elle ne remplace pas le jugement humain.

**Règle directrice : OBJECTIF → ENGAGEMENT → ACTION → RÉSULTAT → RESPONSABILITÉ → PROGRÈS.**

## Les cinq engagements du projet

1. **Atteindre les objectifs** : cible validée avec ODICOLOR, avancement vérifiable et prévision prudente.
2. **Se responsabiliser** : chaque engagement a une date, un propriétaire, un résultat et, si besoin, un motif d'écart.
3. **Agir avec méthode** : l'agent recommande une action prioritaire, une question à poser et la preuve attendue ; le commercial choisit.
4. **Mesurer les bons indicateurs** : distinguer activité, devis, commandes envoyées, chiffre d'affaires EBP, marge et règlements réellement confirmés.
5. **Progresser** : revue quotidienne courte et revue hebdomadaire ; ne changer qu'une habitude à la fois.

## Préparation avant l'entrée en poste

| Période | Priorité | Livrable et critère de sortie |
|---|---|---|
| Octobre–novembre 2026 | **V47 Fiabilité** | Sauvegarde/restauration sûre, imports contrôlés, aucun doublon automatique non validé, tests hors ligne, cohérence chiffres et sources |
| Novembre 2026 | **V48 Priorisation** | L'agent sait afficher une prochaine action étayée, sans inventer montant, besoin ou commande |
| Décembre 2026 | **V49 Responsabilité** | Objectif validé, engagement quotidien, résultat et analyse d'écart, sans liste interminable |
| Décembre 2026 | **V50 Répétition générale** | Scénarios prospect/ancien client/essai/prix/compte bloqué/règlement, tournées, essai Samsung 7 jours |
| Janvier 2027 | **Démarrage terrain** | Routine journalière en 7 h ; aucune mise à jour complexe pendant les visites |

Les numéros de versions suivants sont des **jalons de préparation** : ils ne doivent pas être affichés comme livrés avant validation et intégration.

## Routine commerciale cible — 7 heures de travail

**Début de journée — 10 min** : lire l'objectif, vérifier les preuves disponibles, choisir la priorité n° 1 et 2 ou 3 engagements réalistes.

**Sur le terrain** : diagnostiquer les garages, présenter les offres pertinentes, fixer une prochaine action datée. Une note brève vaut mieux qu'un formulaire lourd.

**Fin de journée — 5 min** : marquer chaque engagement « fait », « reporté » ou « bloqué » avec une cause utile ; noter l'effet obtenu et la prochaine étape.

**Revue hebdomadaire — 15 min** : comparer les résultats confirmés aux objectifs ; analyser les écarts sans culpabilisation ; choisir un seul changement mesurable.

## Indicateurs — distinguer sources et preuves

| Type | Indicateur | Source acceptable |
|---|---|---|
| Engagement | Actions prévues/réalisées et reportées | Saisies locales datées |
| Prospection | Contacts utiles, visites qualifiées, nouveaux garages acquis | Contacts et fiches locaux ; confirmer achat réel dans EBP |
| Conversion | Essais, suivis, devis acceptés | Fiche locale (déclaratif), confirmation commerciale nécessaire |
| Résultat | Commandes envoyées, chiffre d'affaires additionnel | EBP horodaté et non démonstratif |
| Rentabilité | Marge par compte et panier moyen | EBP et prix d'achat fiables ; sinon « non calculable » |
| Règlement | Facture échue, paiement, encours bloqué | EBP/comptabilité ; ne pas inférer un impayé depuis un simple drapeau |
| Temps | Durée d'administration et temps terrain | Estimation locale ou chronométrage volontaire |

**Objectifs chiffrés** : à fixer avec le responsable et une base de référence confirmée. Ne jamais mettre une somme fictive dans le tableau de bord.

## Conditions « PRÊT POUR JANVIER »

- [ ] La sauvegarde des garages/devis/notes se télécharge et sa restauration est testée sur **données de démonstration**.
- [ ] Une sauvegarde corrompue est refusée **sans effacer** les données existantes.
- [ ] Les données réelles et les données de démonstration sont clairement séparées.
- [ ] Plusieurs garages homonymes conservent des fiches distinctes.
- [ ] Hors ligne sur Samsung : ouvrir l'accueil, les fiches, les dernières actions et le catalogue accessible localement.
- [ ] Toute proposition de l'agent affiche une justification, une source et un contrôle.
- [ ] Aucun changement de statut EBP, paiement, compte ouvert ou commande sans vérification humaine.
- [ ] L'objectif et la prochaine action apparaissent avant les informations secondaires.
- [ ] Les boutons d'import ne sont qu'en Réglages ; les devis officiels restent établis dans EBP.
- [ ] Essai terrain simulé : 7 journées consécutives, sans ralentissement gênant ni saisie redondante.
- [ ] Le responsable a confirmé les KPI et règles d'encaissement avant lancement.

## V47 — premiers travaux effectués (branche de préparation)

- Validation de format et d'intégrité des fichiers de sauvegarde avant écriture.
- Restauration clients, devis et métadonnées **dans une seule transaction IndexedDB** (tout ou rien).
- Inclusion de `pcActions` pendant la restauration, s'il est présent dans la sauvegarde.
- Cas de test reproductibles : `node --test tests/backup-v47.test.cjs`.
- **À faire ensuite** : tester le cycle complet sur Samsung ; sauvegarde et test de récupération hors du téléphone ; tester catalogue PDF / images ; traiter le statut des chiffres affichés.

## Gouvernance du développement

Pas de nouveau bouton si un écran existant peut porter l'action. Tout changement comporte : raison métier, test, absence de perte de données et validation terrain. Garder une branche de secours. L'agent propose mais n'exécute pas automatiquement les commandes, modifications de compte, relances financières ou décisions de prix.

> Le succès n'est pas le nombre de fonctionnalités. C'est la progression mesurable vers un objectif commercial validé, avec des engagements tenus et des données fiables.
