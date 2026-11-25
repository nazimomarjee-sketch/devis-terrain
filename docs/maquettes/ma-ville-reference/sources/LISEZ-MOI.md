# Sources des maquettes de référence (PAS l'application)

Ces fichiers **génèrent les images de maquette** de `../`. Ils ne font pas partie du Bureau, du téléphone ni de l'application
locale, et ne sont chargés par aucune page en service. **Données fictives uniquement** (`data95.js`).

- `iso.js` : dessin isométrique (pavés, néons, véhicules, figurines).
- `batiments.js` : agence, carrosserie, mécanique, à qualifier, hors cible, tours de briques, pastille dormant.
- `data95.js` : établissements fictifs du 95 et comptage (un dormant reste client ; à qualifier et hors cible à part).
- `v1.html`, `v2.html`, `v3.html` : vues département, commune, garage (format ordinateur, 1440 × 900).
- `samsung.html` : les 3 niveaux en format téléphone (utilise les scènes produites par `scenes.cjs`).

Reproduire (Chromium + Playwright) : `node rendre.cjs v1 v2 v3`, puis `node scenes.cjs` et une capture de `samsung.html`
en 1440 × 1060. Les images produites s'écrivent dans ce dossier : ne pas les ajouter au dépôt.
