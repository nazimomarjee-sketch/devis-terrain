# Audit de concordance Téléphone ↔ Bureau

Cette fiche dit, pour chaque chiffre affiché des deux côtés, d'où il vient, comment il est calculé et ce qui doit être identique.
Règle : **une donnée = une source**. Le téléphone n'est **jamais présenté comme en temps réel**. Il affiche la date de l'export EBP reçu dans le plan du PC.
Mise à jour : 07/11/2026.

## 1. CA facturé HT du mois (exigence du propriétaire, 07/11/2026)

| Point | Bureau (fait, données fictives) | Téléphone V47 en service (constaté, non modifié) | Écart / à faire à l'étape Samsung |
|---|---|---|---|
| Ce qui est compté | Factures émises du mois, à leur date, HT, **moins les avoirs à leur date** (`bureau/ca-facture.js`) | « 5 · Factures émises » : nombre et montant HT des factures du mois (`plan.kpi.mois.facHt`), **avoirs non déduits** | Afficher à part « CA facturé net (avoirs déduits) », calculé par le Bureau, sans jamais le recalculer sur le téléphone |
| Commandes, devis, encaissements | Jamais dans le CA | Lignes séparées (3, 4, 6) | Concordant |
| Doublons | Un numéro de facture compté une fois, signalé | Hérite du plan (import EBP : un numéro = une pièce) | Concordant |
| Factures émises (brut) | Détail « N factures émises X € HT » | `facN`, `facHt` | **Identiques**, vérifié par `tests/bureau-ca-facture.test.cjs` (test 6) |
| Rattachement géographique | Par code client EBP → établissement → commune → département ; le reste est « non attribué », à part | Aucun découpage géographique | À ajouter seulement si le propriétaire le demande |
| CA personnel / agence | Personnel seulement si le fichier clients EBP indique le représentant et si le code du commercial est saisi | Non distingué | À ajouter avec le même calcul (champ du plan) |
| Objectif | Objectif mensuel de **CA facturé** saisi dans le Bureau (gardé sur ce PC, jamais écrit dans le code public) | L'objectif existant porte sur les **commandes envoyées** (MOI), pas sur le facturé | **Deux objectifs différents.** À trancher : lequel suivre sur le téléphone, ou les deux, clairement nommés |
| Fraîcheur | « Export EBP du JJ/MM/AAAA · pas en temps réel » | « EBP du … », « Il n'est pas en direct » | Concordant |
| Absence de données | « Non renseigné » (pas d'export, ou export d'un mois passé) | « pas d'export » (`pasExport`) | Concordant |

**Préparé pour l'étape Samsung, sans rien modifier dans l'application en service :**
- Le calcul est un module autonome (`bureau/ca-facture.js`), testé sous Node.
- Le plan du matin **n'est pas encore modifié**. Ajouter un champ (par exemple `caFacture`) demande d'abord de vérifier que le téléphone V47 accepte un plan contenant une clé inconnue. Ce sera le premier test de l'étape Samsung.

## 2. Autres chiffres déjà alignés
Commandes du mois, échu non réglé, actions du plan, signaux de reconquête : sources et dates déjà portées par le plan du PC (voir `FEUILLE_DE_ROUTE_TELEPHONE_BUREAU.md`).
