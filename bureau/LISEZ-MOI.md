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

## Limites connues

- Lit les sauvegardes téléphone **V47 (JSON)** seulement. Le format complet `.odicolor` du Lot 1 est lu comme 0 garage, sans message (test « todo »).
- L'annuaire en ligne n'est pas une extraction complète de SIRENE ; 45.20A mélange mécanique et carrosserie. « Carrosserie probable » = déduit du nom.
- La carte charge Leaflet et les fonds OpenStreetMap depuis Internet ; sans connexion, un message l'indique.

## Tester

```
node --test tests/bureau-*.test.cjs        # logique, annuaire simulé, communes (sans réseau)
node tests/bureau-navigateur.cjs           # vrai navigateur, Internet coupé, largeur Samsung
```
Ouvrir : `python -m http.server 8140` à la racine du dépôt, puis http://localhost:8140/bureau/
