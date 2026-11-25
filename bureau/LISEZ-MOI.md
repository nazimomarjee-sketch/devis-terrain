# Bureau ODICOLOR 2.0 — Ville, carte et marché du 91

Outil de pilotage sur ordinateur (ou téléphone) : Ville ODICOLOR, carte par département, marché des garages
de l'annuaire officiel (Lot 2) et simulation. **Lecture seule** : il ne modifie jamais l'application téléphone,
EBP ou un fichier importé.

## Origine (récupération du 05/11/2026)

Le travail fait sur la branche locale `feature/bureau-lot1-ville-lego` n'avait pas été publié et n'a pas été retrouvé.
Ces fichiers viennent de la page Claude « Ville ODICOLOR », version `1793454338-b5bf` du **31/10/2026**, copiés sans modification :

| Fichier | Rôle | Empreinte SHA-256 |
|---|---|---|
| `index.html` | Interface : Ville, Carte, Simulation, fiches | `7dfe6016…c8c697cd` |
| `bureau-logique.js` | Classement des garages, lecture sauvegarde téléphone, démo, simulation | `83da3d8b…3056682d` |
| `annuaire.js` | Lot 2 : import de l'annuaire officiel (activité 45.20A, département) | `6c029977…52a6d5ff` |
| `communes-idf.js` | 1 287 communes d'Île-de-France (source INSEE / La Poste) | `4d7b8516…2626157` |

Depuis la récupération, seuls `index.html` (bouton d'import) et `bureau-logique.js` (fonction `lireClients`, messages d'erreur)
ont été modifiés, le 05/11/2026, pour lire le format `.odicolor` ; les empreintes ci-dessus sont celles des originaux.

Ajouté le 05/11/2026 :
- `lecture-sauvegarde.js` : lecture du fichier complet `.odicolor` du téléphone (voir ci-dessous).

Recréés le 05/11/2026 (perdus avec la branche locale) :
- `outils/generer-communes.cjs` : reproduit `communes-idf.js` **à l'identique** depuis `@etalab/decoupage-administratif` 6.0.0.
- Les tests : `tests/bureau-*.cjs` (voir ci-dessous).

## Données

- **Démo** : 58 garages 100 % inventés (« Carrosserie démo 001 »…), sans adresse, téléphone ni position.
- **Simulation** : 30 agents et 8 acteurs. Faizal, Mohamed et Laurent n'y sont que des **rôles simulés** ; les autres sont fictifs. Budgets = hypothèses.
- **Réel** : uniquement la sauvegarde que tu charges toi-même. Elle reste en mémoire de la page, n'est ni envoyée ni enregistrée.
- **Annuaire** : seuls l'activité (45.20A) et le département partent vers l'API publique. Résultat gardé dans ce navigateur.

Contrôle du 05/11/2026 : aucun e-mail, téléphone, SIRET, IBAN, montant réel ni clé dans ces fichiers.
⚠️ Le dépôt GitHub est **public** : n'y mettre aucune donnée client.

## Écran Bureau : exports EBP → 3 actions → plan du matin (étape 1 du cockpit, 06/11/2026)

Onglet **Bureau**. Charge les exports EBP (CSV ou Excel) : pièces (obligatoire), échéancier des règlements, clients.
- `ebp-import.js` : lecture des exports (Windows-1252/UTF-8, dates et montants français, centimes exacts). Toute ligne
  écartée l'est avec son motif ; les avoirs sont signalés, jamais mélangés. **Hypothèse** : noms de colonnes EBP réels
  inconnus — la correspondance retenue est affichée et l'import est refusé s'il manque une colonne obligatoire.
- `pipeline.js` : fonctions utiles reprises de la page « Chaîne Odicolor » (22/10), **sans son interface** : affaires
  devis → commande → livraison → facture → règlement, délais en jours ouvrés (fériés), 3 actions classées par montant en jeu
  avec preuve et source, levier de la semaine, CA EBP par période. Le téléphone ne compte jamais en double une affaire déjà dans EBP.
- Garde-fous : aucun impayé sans échéancier EBP ; pas de TTC « × 1,2 » ; aucun objectif ni marge inventés ;
  compte bloqué = jamais d'action de vente.
- **Signaux clients** (lus par la page « Opportunités » du téléphone) : client à reconquérir (CA sur 12 mois, plus de commande
  depuis 60 j) et achats en baisse (−50 % sur 90 j, minimum 500 € avant). Seuils = hypothèses recopiées dans chaque signal.
  Déclarés fiables seulement si l'export couvre 12 mois de commandes sans pièce écartée. Compte bloqué : aucun signal.
- **Pièces sans suite depuis plus de 20 jours ouvrés** : « à vérifier » (lien manquant dans l'export ?), jamais une action.
- **Plan du matin** : fichier `plan-odicolor-AAAA-MM-JJ.json` à importer sur le téléphone (Réglages → Imports → Plan PC).
  Format « plan-pc » v2 vérifié avec le **vrai code d'import du téléphone**.

## Charger une sauvegarde du téléphone

Bouton « Mes garages / Démo » → « Charger ma sauvegarde téléphone ».
- **`.odicolor` (recommandé)** : sauvegarde complète du Lot 1. L'empreinte de l'en-tête et de chaque photo/PDF est vérifiée,
  comme le fait le téléphone avant une restauration. Un fichier tronqué, abîmé ou rallongé est refusé avec la cause.
- **`.json` V47** : toujours accepté, sans contrôle d'intégrité possible (le format n'en contient pas).
- Fichier refusé → les garages déjà affichés restent affichés. Le fichier n'est jamais modifié.
- Les photos et PDF sont vérifiés mais pas conservés : le Bureau n'utilise que les fiches garages.

## Limites connues

- L'annuaire en ligne n'est pas une extraction complète de SIRENE ; 45.20A mélange mécanique et carrosserie. « Carrosserie probable » = déduit du nom.
- La carte charge Leaflet et les fonds OpenStreetMap depuis Internet ; sans connexion, un message l'indique.
- La vérification d’intégrité utilise le chiffrement du navigateur : elle exige une adresse https, `localhost` ou un fichier local. Sur une adresse http de réseau local, l’import `.odicolor` est refusé avec un message explicite.

## Tester

```
node --test tests/bureau-*.test.cjs        # logique, sauvegardes, EBP, pipeline, annuaire simulé, communes (sans réseau)
node tests/bureau-navigateur.cjs           # vrai navigateur, Internet coupé, largeur Samsung
node tests/bureau-cockpit-navigateur.cjs   # bout en bout : EBP → Bureau → plan → vraie appli téléphone
```
Contrôles croisés facultatifs : `TELEPHONE_LOT1=<copie de la branche Lot 1>` (même verdict que le téléphone
sur plus de 1 800 fichiers sains ou abîmés) et `ETALAB_PACKAGE=<paquet etalab>` (liste des communes).
Les fichiers d'essai `tests/fixtures/bureau/` sont fabriqués par le vrai code du téléphone : voir `tests/support/generer-fixtures-odicolor.cjs`.
Ouvrir : `python -m http.server 8140` à la racine du dépôt, puis http://localhost:8140/bureau/
