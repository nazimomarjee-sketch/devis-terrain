# ODICOLOR 2.0 — Pilotage commercial (lot 6) : mode d'emploi

Onglet **Pilotage** du Bureau. Tous les chiffres viennent de tes exports EBP. Un chiffre qu'on ne peut pas calculer
est écrit **« Non renseigné »** avec la raison : jamais de zéro inventé.

## Ce que tu vois en premier
| Case | Comment c'est calculé |
|---|---|
| Facturé HT ce mois | Factures HT du mois − avoirs HT du mois (EBP), jusqu'à la date de l'export |
| Objectif mensuel | Celui que tu saisis (ex. 20 000 € HT). Absent = « Non renseigné » |
| Reste à réaliser / Avancement | Objectif − facturé ; facturé ÷ objectif |
| Projection fin de mois | **Estimation** : rythme des jours ouvrés écoulés × jours ouvrés du mois (fériés exclus). Pas avant 3 jours ouvrés |
| Mois précédent | Seulement si les exports couvrent **tout** le mois précédent |

Commandes, factures et encaissements restent séparés : l'encaissé (TTC, échéancier) est dans l'onglet Commerce.

## Imports successifs
Tu peux charger plusieurs exports de pièces l'un après l'autre (octobre, puis novembre…) :
- un fichier déjà chargé (même empreinte) est **ignoré** ;
- une pièce présente dans deux exports est **comptée une fois** ;
- une pièce **modifiée** entre deux exports : la plus récente fait foi, et elle est listée dans « Données utilisées ».
Bouton « Repartir du dernier export seul » si tu veux tout recommencer.
« Données utilisées » affiche le dernier import, le nombre d'exports, la couverture (première et dernière pièce) et les liens manquants.

## Catégories de clientèle (règles du 14/11/2026)
- **Existant** : facturé ce mois et déjà facturé dans les 12 mois précédents.
- **Nouveau** : facturé ce mois, jamais facturé avant — il faut un historique EBP couvrant les 12 mois précédents.
- **Réactivé** : facturé ce mois, facturé avant mais pas dans les 12 mois précédents — même exigence d'historique.
- **Non déterminé** : historique trop court pour trancher. On ne devine pas.
- **Prospects non convertis** : garages du téléphone sans compte EBP.
Rattachement par **code client EBP** uniquement ; factures sans code : « non classées ».

## Priorités (règles écrites, pas d'intelligence artificielle)
| Priorité | Règle |
|---|---|
| Devis à relancer | Devis EBP sans commande depuis 10 jours ; devis envoyé (téléphone) sans réponse depuis 7 jours |
| Commande bloquée | Commande non facturée depuis 15 jours ; commande d'un compte bloqué ; devis accepté sans commande EBP |
| Facture à surveiller | Échéance passée avec un reste à payer ; règlement daté sans montant |
| Dormant à réactiver | Dernière facture il y a 90 à 365 jours (seulement avec 12 mois d'historique) |
| À visiter | Garages qui cumulent au moins une des raisons ci-dessus, les plus urgents d'abord |
Chaque ligne donne la raison, la preuve (n° de pièce) et l'action proposée. Tu **valides** ou **écartes** ; c'est enregistré
dans le coffre. Rien n'est envoyé.
Sans colonne « pièce d'origine », sans échéancier ou sans 12 mois d'historique, les priorités correspondantes ne sont pas
calculées et la raison est affichée.

## Limites
- Données fictives dans les tests ; aucun export réel lu (accord de Faizal requis, sur le PC ODICOLOR).
- L'objectif est mémorisé dans ce navigateur (pas encore dans le coffre).
- Pas testé sur le PC Windows ni sur le vrai Samsung.
