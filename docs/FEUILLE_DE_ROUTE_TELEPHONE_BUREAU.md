# Feuille de route commune — Téléphone Samsung + Bureau

Mise à jour : 05/11/2026. Règle : **une étape à la fois**, chaque étape a ses tests automatiques
avant tout essai sur Samsung. Rien n'est fusionné, publié ou mis en production sans accord.

## Où on en est

| Brique | État | Preuve |
|---|---|---|
| Téléphone V47 (`main`) | En service | 22 tests |
| Téléphone Lot 1 — sauvegarde complète `.odicolor` (PR #2, brouillon) | Terminé, essais Samsung en grande partie réussis | 82 tests + 19 essais navigateur ; ticket #4 validé sur Samsung |
| Bureau — Ville, carte, simulation (`bureau/`) | Récupéré (version du 31/10) | 58 tests + 9 essais navigateur |
| Bureau — Lot 2 annuaire du 91 | Code présent, jamais testé contre le vrai annuaire depuis ici | Testé avec un annuaire simulé |
| Liaison téléphone → Bureau | **Faite** (05/11) : `.odicolor` avec contrôle d'intégrité + ancien `.json` | Fichiers d'essai produits par le code du téléphone ; même verdict que lui sur 1 800+ cas ; pas encore essayé sur Samsung/PC |
| Données réelles | **Bloqué** par le ticket #6 | — |

## Étapes, dans l'ordre

1. ~~**Liaison téléphone → Bureau (format Lot 1)**~~ — **faite le 05/11/2026** (`bureau/lecture-sauvegarde.js`).
   Lecteur propre au Bureau (le module du téléphone n'est pas encore sur `main`) ; la concordance est garantie par
   le contrôle croisé `TELEPHONE_LOT1`. À refaire si le format du téléphone change.
2. **Clore le Lot 1 téléphone** — fermer #4 (validé), revérifier #5, fermer la PR #3 (doublon de la #2). Fusion sur ton accord.
3. **Préalables aux données réelles (#6)** — accord du responsable ; sauvegardes stockées hors du dépôt public ;
   ajouter à la vérification GitHub un contrôle qui refuse tout fichier contenant SIRET, téléphone ou e-mail.
4. **Marché du 91 fiable** — comparer l'annuaire en ligne au fichier officiel complet SIRENE (téléchargeable, filtré 45.20A + 91)
   pour mesurer ce qui manque ; garder « carrosserie probable » comme hypothèse jusqu'à confirmation terrain.
5. **Retour Bureau → téléphone** — exporter une liste de garages à visiter (tournée) que le téléphone importe dans Réglages,
   sans jamais créer de doublon ni écraser une fiche.
6. **Exports EBP** — à partir d'un export réel **anonymisé** (en-têtes de colonnes + 2 lignes fictives) : import contrôlé, rapport lignes acceptées / refusées.
7. **Simulation sur données réelles** — seulement après 3 à 6 : calage sur EBP, badges Confirmé / Hypothèse.

## Points techniques à ne pas oublier

- Le Bureau sera servi au même endroit que le téléphone (`/bureau/`) : vérifier que le cache hors ligne du téléphone (`sw.js`) ne le sert pas de travers.
- Ajouter l'essai navigateur du Bureau à la vérification GitHub (nécessite Playwright).
- Le dépôt est public : toute donnée réelle reste sur l'appareil ou dans un stockage privé.
