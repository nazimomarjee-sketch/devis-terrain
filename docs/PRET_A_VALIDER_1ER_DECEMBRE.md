# Prêt à valider — reprise du mardi 1er décembre 2026

**Aucune fusion ni aucun déploiement n'a été fait.** Ce document sert à décider. Branche : `claude/charlie-tournees-optimizer-t1rfsf` (devis-terrain et cockpit-carrosserie). Dépôt public : aucune donnée réelle dedans.

## Ce qui est prêt (vérifié sous Linux, données synthétiques)
| Brique | Preuve |
|---|---|
| Téléphone ODICOLOR + CHARLIE (tournée optimisée, secteurs de Laurent, EBP, scénarios, matin/soir, synchronisation) | 603 tests, PWA vérifiée (`node scripts/build-pwa.cjs --check`), Chromium 21/21 |
| Téléphone ↔ vrai serveur CHARLIE | `tests/integration/charlie-serveur-reel.mjs` : 10/10 |
| Cerveau CHARLIE (cockpit) : agents, mémoire chiffrée, Avocat du Diable, télémétrie, application centrale, IA hybride, Auto & Moto 974, pôles | 699 tests passent, 0 échec, 2 ignorés |

## Ce qui n'est PAS prouvé (à vérifier sur votre matériel)
Samsung physique, Windows 10/11 réel, moteur routier réel (trajets estimés en attendant), IA réelle (aucune clé/modèle), accès mobile en déplacement, voix.

## Risque principal avant le 1er décembre
La branche contient le lot « ODICOLOR 2.0 » (≈ 340 fichiers de plus que `main`, base locale IndexedDB v1 → v2). **La remplacer directement sur votre téléphone la veille, sans essai Samsung, serait risqué.** Les sauvegardes `.odicolor` du téléphone existent (Réglages) : en faire une AVANT toute mise à jour.

## Séquence recommandée (rien n'est lancé sans votre accord)
1. **Aujourd'hui/demain** : déployer la branche sur une ORIGINE SÉPARÉE (paquet Cloudflare Pages « odicolor-test », procédure existante `audit/MISE_EN_LIGNE_SAMSUNG.md`, `node scripts/preparer-preview-samsung.cjs`), données synthétiques d'abord. Votre V47 actuelle reste intacte (autre origine = autre base).
2. **Dimanche 29/11** : essais Samsung selon `docs/RECETTE_CHARLIE_1ER_DECEMBRE.md` (parties B et C).
3. **Lundi 30/11** : décision go/no-go. **No-go = vous gardez V47** + la feuille de Laurent habituelle ; aucune perte.
4. Seulement après go : fusion dans `main` (PR à votre demande), sauvegarde préalable, déploiement.

## Décisions qu'il vous faut prendre (une fois, regroupées)
1. Autoriser la publication du paquet d'essai (compte Cloudflare Pages gratuit) — ou m'indiquer l'URL actuelle de votre V47 si elle est ailleurs.
2. Laurent : quels passages du 01/12 reporter (voir scénarios dans l'écran « Ma tournée » : A programme tel quel, B visites courtes, C journée allongée, D reports vers le 08/12, E deux demi-ensembles).
3. Travail les 24, 28, 29, 30, 31 décembre (rotation préparée « à confirmer »).
4. Export EBP : autorisation d'ODICOLOR (sans elle, le CA n'intervient pas dans les priorités).
5. Moteur routier : installer sur le PC (`infra/routage`, Docker Desktop : vérifier la licence) ou rester en trajets estimés.

## Retour arrière
Téléphone : « Tournée habituelle (inchangée) » reste disponible ; V47 conservée sur son origine. CHARLIE/Bureau ne bloquent jamais le téléphone (file hors ligne).
