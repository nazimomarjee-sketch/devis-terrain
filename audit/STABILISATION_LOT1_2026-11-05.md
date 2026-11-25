# Lot 1 — stabilisation automatisée (05/11/2026)

Branche `fix/lot1-f01-f03-recuperation` (PR #2, brouillon). Aucune modification du code de l'application :
uniquement des essais automatiques supplémentaires. Données 100 % synthétiques.

## Points « non prouvés » du bilan Samsung du 29/10, désormais couverts par un essai automatique

| Point du bilan | Essai | Résultat (Chromium, PC) |
|---|---|---|
| Tarif dans B non formellement prouvé | `stabilisation-lot1-browser.cjs` : prix SYN-00001 affiché « 10,00 » au Catalogue après restauration | Réussi |
| Hors connexion : PDF et restauration non vérifiés | Même essai : application installée, **aucune requête serveur**, restauration par Réglages, photos et PDF relus octet par octet | Réussi |
| PDF sans type MIME (traité dans la PR #3) | `stabilisation-lot1-browser.cjs` : import accepté, type vide et octets conservés après sauvegarde complète | Réussi |
| Fort volume non testé | `volume-lot1-browser.cjs` : 2 000 garages, 10 000 devis, 200 photos, 105 Mo — décodage 2,2 s, restauration 2,4 s, relecture 0,6 s | Réussi (PC) |

Ticket #4 : fermé le 05/11/2026 (validé sur Samsung). Ticket #5 : libellés `.odicolor`/JSON, visuel synthétique
et guide PDF corrigés dans le code (commits `7c7aa48`, `b36618b`) ; revalidation visuelle Samsung non refaite.

## Reste à prouver sur l'appareil (non automatisable ici)

- Durée et mémoire de la restauration du jeu « terrain » sur le Samsung (hypothèse : 3 à 6 fois plus lent qu'un PC).
- Stockage saturé (quota) sur le Samsung.

## PR #3 — pas un doublon intégral

Vérifié le 05/11/2026 : ses 2 commits ne sont pas dans la PR #2 et son format de fichier (JSON v2, pièces en base64)
est **incompatible** avec le `.odicolor` de la PR #2. Son seul apport propre (PDF sans MIME) est couvert ci-dessus.
Elle reste ouverte en attendant la décision du propriétaire.
