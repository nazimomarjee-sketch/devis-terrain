# 08 — Règles métier : configurables, justifiées, validées

## Ce qui a changé par rapport au premier prototype

Le premier prototype codait **TVA 8,5 %**, **remise max 60 %** et **tarif ancien à 90 jours**, repris du `LISEZ-MOI` de l'appli **comme hypothèses non validées**. Ce n'est plus le cas : plus aucune de ces valeurs n'est dans le code. Elles vivent dans la table `regles`, avec **justification, source, statut, validé par, validé le**.

| Statut | Sens | Peut servir avec… |
|---|---|---|
| `NON_VALIDE` | Saisie mais non approuvée | **rien** (blocage + question) |
| `FICTIF_DEMO` | Règle d'exemple pour la démonstration | **données 100 % fictives uniquement** ; le PDF porte « TVA : règle de démonstration NON VALIDÉE » |
| `VALIDE` | Approuvée par l'administrateur (justification + source obligatoires) | données réelles |

Une règle **absente** ou **non validée** ⇒ l'agent **bloque** et pose une question. Aucune valeur par défaut silencieuse (testé : suppression d'une règle ⇒ blocage).

## La TVA dépend du territoire ET de l'opération

Clé de règle : `tva | <territoire>|<opération>`, par ex. `reunion|vente_locale`, `metropole|export`. Le territoire vient de la **fiche client** ; l'opération de la **demande** (`devis export pour …`, `devis autoliquidation pour …`, sinon `vente_locale`). L'auditeur recalcule la clé de son côté et vérifie que la règle appliquée est la bonne.

> **Je n'affirme aucune règle fiscale.** Les taux fournis (8,5 % DOM, 20 % métropole, 0 % export hors UE, 0 % « guyane|vente_locale ») sont des **exemples de démonstration** étiquetés `FICTIF_DEMO`. Les règles réelles (DOM, Mayotte, Guyane, Corse, UE, exportation, autoliquidation, justificatifs) sont à **faire établir et valider par un expert-comptable**. Cas couverts par les tests : territoire sans règle (Mayotte) ⇒ blocage ; opération sans règle (export depuis La Réunion) ⇒ blocage.

## Remises

- **Plafond** configurable (`remise_max_pct`). L'ancien 60 % n'avait **aucune justification** : la valeur de démonstration est 20 %.
- **Justification obligatoire** sur la fiche client dès qu'une remise > 0 : sans elle ⇒ blocage `REMISE_NON_JUSTIFIEE`. La justification est **imprimée sur le devis**.
- Remise au-dessus du plafond ⇒ blocage `REMISE_HORS_PLAFOND` (dérogation = décision humaine).

## Marge

`marge_min_pct` : marge **sur prix de vente après remise**. Prix d'achat inconnu ⇒ blocage (la marge est invérifiable). Marge sous le seuil ⇒ blocage `MARGE_SOUS_SEUIL` + question (dérogation humaine). **Le prix d'achat n'apparaît jamais** sur un devis ni dans une fiche produit (testé).

## Tarifs anciens

`tarif_ancien_jours` : au-delà, le tarif est **signalé** sur le devis (avertissement obligatoire, vérifié par l'auditeur dans les deux sens : pas d'oubli, pas de fausse alerte). Les tarifs eux-mêmes portent une **date**.

## Aucun prix fictif présenté comme réel

- Chaque jeu de données porte `genere: FICTIF|REEL`. L'agent propage `donnees_fictives` ; l'auditeur le **recalcule** depuis les fichiers.
- Devis fictif : bandeau « **PRIX ET DONNEES FICTIFS — ce document n'est PAS un tarif réel** » sur le PDF ; tableau de bord en **orange « MODE DÉMO »**.
- Données réelles autorisées : la mention disparaît **uniquement** si les règles utilisées sont `VALIDE` (sinon blocage) ; déclarer « fictives » des données réelles est **détecté**.

## Ce qui reste engageant et humain

Aucun devis, courriel, relance, commande ou règlement n'est envoyé ou validé sans ton clic ; **aucun envoi réel n'est développé**. Un devis préparé n'est **jamais** présenté comme enregistré dans EBP.

## Valider une règle (administrateur, jeton distinct)

```
JARVIS_URL=http://127.0.0.1:8160 JARVIS_ADMIN_TOKEN=<jeton admin> \
  node scripts/admin.js regle tva "reunion|vente_locale" '{"taux_pct":"8.5"}' VALIDE \
  "Confirmé par <expert-comptable> le <date>" "<référence du courriel / du document>"
```
Chaque modification est **journalisée** (`REGLE_MODIFIEE`) dans le journal chaîné.
