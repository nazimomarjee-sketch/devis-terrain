# 07 — Les huit agents : responsabilités, droits, critères mesurables

Principes communs : chaque agent **ne lit que les jeux de données qu'il déclare** (testé) ; ne dispose d'**aucun réseau, aucun envoi** ; s'exécute dans un **processus restreint** ; produit un résultat que **l'auditeur indépendant recalcule** ; ne s'attribue aucun droit. « Sensible » = exige ton approbation (la table des types sensibles est dans l'**auditeur**, pas dans l'agent).

| # | Agent | Responsabilité | Lit (droits) | Sortie | Sensible |
|---|---|---|---|---|---|
| 1 | **Devis** | Préparer, vérifier, présenter un devis (PDF + brouillon de mail) | catalogue, clients, règles | `devis` | **oui** |
| 2 | **Produits** | Contrôler le catalogue (prix, marges, doublons, compatibilités) ; fiches produit | catalogue, règles | `rapport_produits` | non |
| 3 | **Prospection** | Qualifier et prioriser les prospects (score explicable) | prospects, règles | `classement_prospects` | non |
| 4 | **Clients** | Dossier client : conditions, historique, encours, points à vérifier | clients, commandes, factures, paiements, devis, règles | `dossier_client` | non |
| 5 | **Relances** | Brouillons de relance (factures échues, devis sans réponse) | factures, paiements, clients, devis, règles | `relances` | **oui** |
| 6 | **Commandes** | Brouillon de commande depuis un devis **accepté** ; suivi des états | devis, commandes, clients, catalogue, règles | `commande_brouillon` / `suivi_commandes` | brouillon **oui**, suivi non |
| 7 | **Finance** | Marge, facturation, paiements, anomalies, indicateurs **distincts** | factures, paiements, commandes, clients, catalogue, règles | `analyse_finance` | non |
| 8 | **Planification** | Journée (≤ 3 priorités, capacité), validations en attente ; charge d'atelier (**si connecteur autorisé**) | tâches, validations en attente, ordres d'atelier*, règles | `plan_journee` / `charge_atelier` | non |

\* jeu `ordres_atelier` fourni uniquement si l'autorisation `connecteur:cockpit` est active.

L'**auditeur** (rôle 9) : lit les mêmes sources en lecture seule, **recalcule** (BigInt pour l'argent), compare, et décide `VALIDE` / `À CORRIGER` / `BLOQUÉ`. Il ne fait confiance ni au rapport de l'agent ni à son drapeau « sensible ».

## Critères mesurables de réussite (par agent) et ce que les tests prouvent

| Agent | Critère | Preuve (tests) |
|---|---|---|
| Devis | 0 écart de montant vs recalcul ; aucune donnée inventée ; tarifs anciens signalés ; TVA/remise/marge issues de règles validées ; 0 envoi sans validation | 200 combinaisons aléatoires sans écart ; **14 falsifications** détectées ; 8 erreurs volontaires ; 11 cas de blocage avec question ; TVA métropole/export/DOM/territoire sans règle |
| Produits | Anomalies **exactes** (ni omises, ni inventées) | 7 anomalies attendues retrouvées ; **4 falsifications** ; fiche sans prix d'achat |
| Prospection | Classement et scores identiques au recalcul ; aucun prospect hors base ; « à vérifier » jamais deviné | 6 scores vérifiés à la main ; **5 falsifications** ; note piégée exclue |
| Clients | Totaux exacts ; client sans ambiguïté ; aucune donnée d'un autre client ; aucune coordonnée dans le dossier | encours 24 235 / échu 17 635 ; **5 falsifications** ; « Martin » seul → blocage |
| Relances | Ensemble des relances = recalcul (aucune soldée relancée, aucune échue oubliée, aucune trop rapprochée) | 5 brouillons + 2 ignorées vérifiés ; **7 falsifications** ; 5 erreurs volontaires |
| Commandes | Lignes = devis source ; jamais « envoyée/enregistrée » ; commande refusée si devis non accepté | **6 falsifications** ; blocages (non accepté, inconnu) ; anomalies de suivi exactes |
| Finance | Chaque indicateur à 0 centime près ; anomalies exhaustives ; indicateurs jamais confondus ; doublons exclus | 7 indicateurs + 7 anomalies vérifiés à la main ; **9 falsifications** ; 5 erreurs volontaires (dont « confusion CA/commandes ») |
| Planification | Plan = recalcul ; ≤ 3 priorités ; capacité jamais dépassée ; retards signalés | plan vérifié (T003, T005, T001…) ; **6 falsifications** ; connecteur cockpit audité |

## Limites connues des agents

- Ils parlent un **français structuré** (« devis pour <client> : <quantité> <article> », « dossier du client <nom exact> », « commande du devis DEV-AAAA-NNN »…). Le langage libre passera par le point d'extension IA (proposition à confirmer).
- **Prospection** : aucune recherche externe (aucun accès réseau) ; pondérations de **démonstration**.
- **Finance** : marge calculée uniquement sur les lignes dont le prix d'achat est connu ; le reste est **signalé** (« factures sans lignes exclues »).
- **Relances** : textes **modèles** ; aucun envoi ; la qualification juridique d'une relance est hors périmètre.
- Aucun agent n'est encore branché à EBP : toutes les données viennent de fichiers fictifs.
