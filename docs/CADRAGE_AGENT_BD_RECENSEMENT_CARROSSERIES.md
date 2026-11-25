# Agent Business Developer : recensement des carrosseries-peinture (95, 94, 91, 77, 93) : cadrage, AUCUN développement

Statut : **à valider par le propriétaire avant toute programmation.** Rédigé le 07/11/2026.
Départements prioritaires **sans ordre entre eux** : le cockpit ne les classe jamais. 75, 78 et 92 restent secondaires.
Le cockpit et l'agent **proposent** où travailler ; le propriétaire décide.

## 1. Ce que tu veux, en 5 capacités
1. Recenser les établissements avec **SIRENE**.
2. Vérifier existence et statut juridique via **Pappers**.
3. Repérer ceux qui font **réellement de la peinture automobile**.
4. Lire **note et dates des avis Google Maps** par une méthode autorisée.
5. Sélectionner **note ≥ 4/5 et avis récents** (< 6 mois récent ; 6 à 12 mois à vérifier ; > 12 mois non retenu ; sans date vérifiable : non vérifié).

Règles : afficher note, nombre d'avis, date du dernier avis et source. **Une bonne note Google ne confirme jamais une activité peinture.** Les exclus du filtre **restent dans l'annuaire**.

## 2. Ce qui existe déjà (vérifié dans le code)

| Brique | État | Fichier |
|---|---|---|
| Recensement par l'API publique « Recherche d'entreprises » (État), NAF 45.20A, par département, avec pagination (25 par page), reprise en cas de limite, fusion par SIRET | **Fait, mais limité au 91 dans l'écran** | `bureau/annuaire.js`, `bureau/index.html` |
| Type « probable » (carrosserie, mécanique, à qualifier) **déduit du seul nom** | Fait. Jamais « confirmé » | `annuaire.js` : `typeProbable` |
| Établissements radiés exclus (état administratif = A) | Fait, via SIRENE | `annuaire.js` |
| Les établissements de l'annuaire entrent dans la vue Commune comme « à qualifier » (gris), jamais comme prospects qualifiés ; ils restent listés | Fait | `bureau/ville/modele-commune.js` |
| Score de priorité (nom, effectif, **distance à Massy-Palaiseau**) | Fait. **À ne pas utiliser pour classer les départements** : il favorise le 91 | `annuaire.js` : `scorePriorite` |
| Conservation de l'import | **Dans le navigateur (localStorage)**, pas dans le coffre chiffré | `bureau/index.html` |
| Pappers | **Absent** | — |
| Google Maps (notes, avis, dates) | **Absent** | — |
| Preuve d'activité peinture (EBP, terrain) | Absente. L'indice « famille client = carrosserie » existe côté EBP, mais seulement pour les clients | `modele-commune.js` |
| Règle « récent / à vérifier / non retenu / non vérifié » | **Absente** | — |

## 3. Ce qui manque
- **Import des 5 départements** (aujourd'hui seulement le 91), conservé dans le coffre et non dans le navigateur.
- **Vérification Pappers** (statut juridique, procédures collectives, radiation) : tout est à faire.
- **Collecte de la note et des avis Google** : tout est à faire (voir §4).
- **Preuve d'activité peinture** : tout est à faire (voir §5). C'est le point le plus important.
- **Règle de récence** et son affichage, avec « non vérifié » quand la date manque.
- **Modèle de données** d'une « observation » (valeur, source, date, méthode) pour que rien ne soit mélangé : activité, note, avis, statut juridique.

## 4. Faisabilité technique

### 4.1 SIRENE (recensement) : faisable, gratuit
- **Recherche d'entreprises** (déjà utilisée, sans clé) : pratique, mais **n'est pas une extraction exhaustive** (limite déjà notée dans le code).
- **API Sirene de l'INSEE** : compte gratuit, clé, **limite de 30 requêtes par minute** (source INSEE, juin 2026). Adaptée à une extraction complète par pagination.
- **Le code NAF ne dit pas « carrosserie »** : 45.20A regroupe l'entretien et la réparation de véhicules légers, **mécanique et carrosserie ensemble**. SIRENE seul ne peut donc pas isoler les carrosseries-peinture. Un nom évoquant la carrosserie n'est qu'un indice.
- **Volume : non mesuré.** L'environnement de travail bloque l'accès à l'API publique (réponse 403). Le nombre d'établissements par département reste donc **inconnu**. Je ne l'estime pas : un premier appel de comptage depuis ton PC le donnera en quelques secondes (la fonction de test existe déjà).

### 4.2 Pappers (existence et statut juridique) : faisable, payant, tarif à confirmer
- Pappers a une **API officielle avec inscription**. Une page de la FAQ confirme un fonctionnement **par crédits** (un crédit correspond généralement à une consultation de fiche).
- Des sources tierces (non officielles) citent **100 crédits offerts** à l'ouverture et des formules **à partir d'environ 20 € par mois pour 500 crédits**. **Je n'ai pas trouvé la grille officielle** : ces chiffres sont à confirmer sur pappers.fr/api avant tout engagement.
- **Ce que Pappers n'apporte pas de plus** : l'état « actif / radié » est déjà fourni gratuitement par SIRENE. Pappers ajoute surtout la forme juridique, les procédures collectives (redressement, liquidation) et les dirigeants.
- **Recommandation** : n'interroger Pappers que pour les établissements **déjà retenus** par les autres filtres, pas pour tout l'annuaire. Cela divise le coût par un facteur important (à mesurer une fois le volume connu).

### 4.3 Google Maps (note, avis, dates) : faisable seulement en partie
- **Méthode autorisée : l'API Places de Google** (clé, facturation activée). **Le « scraping » de Google Maps est exclu** : il viole les conditions d'utilisation.
- **Ce que l'API donne** : la note (`rating`) et le nombre d'avis (`userRatingCount`).
- **Ce qu'elle ne garantit pas : la date du dernier avis.**
  - Elle renvoie **au plus 5 avis** par établissement.
  - La documentation les dit **triés par pertinence**. Les 5 avis renvoyés ne sont donc **pas forcément les plus récents**.
  - Un forum de développeurs affirme le contraire : c'est **contradictoire**, à tester sur un cas réel.
  - Conséquence : **« dernier avis < 6 mois » ne sera pas vérifiable pour beaucoup d'ateliers**, qui resteront « non vérifiés ». C'est exactement le cas prévu par ta règle, mais la sélection « 4 étoiles + avis récents » risque d'être **plus petite que prévu**.
- **Coût** (sources tierces, **à confirmer sur la page officielle de Google**) : les champs note et avis relèvent des niveaux « Enterprise » et « Enterprise + Atmosphere », environ **20 à 25 $ pour 1 000 appels** après un quota gratuit de **1 000 appels par mois** pour chaque niveau. Il faut aussi une recherche d'établissement pour trouver chaque fiche.
- **Conservation des données Google : point juridique non vérifié.** Les conditions de Google limitent la conservation des contenus de l'API Places (seul le `place_id` peut être gardé durablement, d'après ce que j'ai pu lire). **Je n'ai pas pu confirmer la règle exacte pour la note et les avis.** À lire dans les conditions officielles avant de stocker quoi que ce soit dans le coffre. Si la conservation est interdite, la note et la date devront être **relues à chaque consultation** et jamais archivées.

## 5. Le point central : « fait réellement de la peinture automobile »
Aucune source de la liste (SIRENE, Pappers, note Google) ne le prouve. Sources de preuve possibles, **de la plus fiable à la moins fiable** :
1. **Achat de peinture chez ODICOLOR** (EBP : famille carrosserie, commandes de peinture, vernis). Preuve forte, mais seulement pour les clients.
2. **Constat terrain** (visite : cabine de peinture, mélange de teintes). Preuve forte, saisie au téléphone.
3. **Site web ou fiche déclarant la peinture ou la carrosserie** (hypothèse, à tester).
4. **Catégorie Google de l'établissement** (hypothèse à tester : l'API peut renvoyer un type de lieu, mais je ne sais pas s'il distingue carrosserie et mécanique).
5. **Nom de l'établissement** : indice faible, déjà utilisé, jamais une preuve.

Chaque établissement porte donc **un niveau de preuve** séparé : « confirmé (EBP ou terrain) », « déclaré (site, catégorie) », « indice (nom) », « inconnu ». Il est **indépendant de la note**.

## 6. Proposition de modèle (sans l'écrire)
Pour chaque établissement : `observations[]`, chacune avec **valeur, source, date, méthode**. Quatre familles : existence et statut juridique (SIRENE, Pappers) ; activité peinture (niveau de preuve) ; réputation (note, nombre d'avis, date du dernier avis, source Google) ; décisions humaines (déjà faites : coffre, lot A).
- La sélection « 4 étoiles » est un **filtre d'affichage** : un établissement exclu reste dans l'annuaire avec le motif de l'exclusion (note < 4, avis anciens, date non vérifiable).
- **Récence** : date du dernier avis **connue** < 6 mois : récent ; 6 à 12 mois : à vérifier ; > 12 mois : non retenu ; date absente ou non vérifiable : non vérifié.
- Les départements ne sont **jamais** classés entre eux. À l'intérieur d'un département, le tri proposé est neutre (alphabétique) ou choisi par toi.

## 7. Coût et ordre de grandeur (hypothèses, volume inconnu)
| Poste | Coût | Statut |
|---|---|---|
| SIRENE (INSEE ou Recherche d'entreprises) | 0 € | Confirmé (30 requêtes/min pour l'INSEE) |
| Pappers | Crédits : formules d'environ 20 €/mois (tiers) ; **grille officielle non trouvée** | À confirmer |
| Google Places | Environ 20-25 $ / 1 000 appels après 1 000 gratuits/mois (tiers) | À confirmer |
| Développement | Voir §8 | Estimation de périmètre, pas de prix |

Un chiffrage en euros n'a de sens qu'**une fois le nombre d'établissements connu**. Ordre de grandeur utile : coût Google ≈ (nombre d'établissements) × (une recherche + une fiche détaillée). Il se calculera dès que le comptage par département sera mesuré depuis ton PC.

## 8. Étapes proposées, chacune validée à part
1. **Comptage par département** (SIRENE, 5 appels) et **test de contrôle** : combien d'établissements 45.20A, combien avec un nom évoquant la carrosserie. Aucun coût.
2. **Import des 5 départements dans le coffre** (remplace le stockage du navigateur) : sans ordre entre départements, sans doublons, avec les établissements radiés écartés mais gardés.
3. **Preuve d'activité** : niveaux de preuve et affichage, alimentés par EBP et le terrain. Sans nouveau service payant.
4. **Pappers** sur les établissements retenus seulement, après confirmation du tarif.
5. **Google Places** : **test sur 20 établissements** pour trancher deux inconnues (tri des avis, catégorie), et lecture des conditions de conservation. Décision de poursuite ensuite.
6. **Règle de récence et sélection 4 étoiles**, avec les exclus conservés et leur motif.

Prérequis communs : **aucune donnée réelle avant les sauvegardes chiffrées hors du PC** ; clés d'API stockées **dans le coffre ou saisies à chaque séance**, jamais dans le dépôt public.

## 9. Risques
| Risque | Parade |
|---|---|
| La sélection « 4 étoiles + avis récents » sera petite, car la date du dernier avis est souvent invérifiable | Annoncé d'avance ; « non vérifié » affiché clairement ; test sur 20 établissements avant tout engagement |
| Confusion entre bonne note et activité peinture | Deux rubriques séparées, deux sources, jamais un score fusionné |
| Conditions Google sur la conservation des données | Lecture des conditions officielles avant stockage ; sinon relecture à la demande sans archivage |
| Coût qui dérape (Pappers, Google) | Appels seulement sur les établissements retenus ; plafond mensuel fixé par toi ; compteur d'appels affiché |
| Départements classés par le score de distance à Massy | Interdit : ce score n'est pas utilisé pour ordonner les départements |
| Établissements fermés, doublons, changements de SIRET | Fusion par SIRET, état administratif tracé, historique conservé |

## 10. Décisions à prendre (une à la fois, dans cet ordre)
1. Valider ce cadrage et l'**étape 1** (comptage par département depuis ton PC) ?
2. Plus tard : accord sur la **clé Google** et le **plafond de dépense**, après le test sur 20 établissements.
3. Plus tard : accord sur **Pappers** et son **abonnement**, une fois le tarif officiel confirmé.

Sources consultées : API Sirene INSEE (30 requêtes/minute, actualité Sirene Open Data juin 2026) ; FAQ Pappers et pages tierces (tarifs non officiels) ; documentation et articles tiers sur Google Places (niveaux de facturation, 5 avis maximum, tri par pertinence) ; conditions de service Google Maps Platform (règles de cache d'identifiants, point note et avis non confirmé).
