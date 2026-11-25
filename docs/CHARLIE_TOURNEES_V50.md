# CHARLIE — optimiseur de tournées commerciales (v48)

## Ce qui existe
| Élément | Fichier | Rôle |
|---|---|---|
| Moteur pur (Samsung, Bureau, Node) | `charlie-optimiseur-v50.js` | scoring commercial explicable, matrices OSRM/estimées, adaptateur VROOM contrôlé, solveur local de repli, recalcul, proches, prévu/réalisé, apprentissage, agents + audit, commandes |
| Interface Samsung | `charlie-tournee-v50.js/.css` | route `#/charlie` : 8 gros boutons, proposition à valider, hors ligne |
| Cockpit Bureau | `bureau/charlie-carte.html/.js` | carte SVG locale d'un fichier `charlie-tournee/v1` exporté du Samsung |
| Moteur routier local | `infra/routage/` | docker-compose OSRM + VROOM + script graphe Île-de-France |
| Tests | `tests/charlie-optimiseur-v50.test.cjs`, `tests/charlie-carte-bureau-v50.test.cjs`, `tests/navigateur/charlie-v50.e2e.mjs` | unitaires, intégration, fuzz, navigateur |

La tournée historique (`#/tournee`) n'est pas modifiée : un lien « Tournée optimisée CHARLIE » y est ajouté ; si CHARLIE échoue, l'écran propose de revenir à la tournée habituelle.

## Licences et hébergement (gratuit)
- VROOM : BSD-2-Clause (fichier `LICENSE` lu sur le dépôt). OSRM : BSD-2-Clause (`LICENSE.TXT` lu). Utilisés comme **services HTTP** : aucun code copié, aucune dépendance embarquée.
- Cartes : OpenStreetMap, licence ODbL → attribution « © contributeurs OpenStreetMap » si une carte avec fond est affichée (la carte Bureau actuelle n'en utilise aucun).
- Ne pas utiliser les serveurs de démonstration publics en production. Hébergement : `infra/routage` sur un PC avec Docker (extrait Île-de-France Geofabrik (plusieurs centaines de Mo, RAM à mesurer)). Coût : 0 €.
- Contrainte réseau : une PWA servie en HTTPS ne peut pas appeler `http://IP-locale` (contenu mixte). Il faut un accès HTTPS privé (ex. reverse proxy + VPN privé). **Non testé ici.**

## Règles de vérité (appliquées par le code et par l'audit)
- Valeurs par défaut = hypothèses affichées : journée 08:00-17:00, pause 45 min entre 12h-14h, visite 30 min tant qu'aucune durée réelle n'est apprise (≥ 2 visites), horaires garage = journée entière si non renseignés (`c.horaires` optionnel), temps de trajet estimés (vol d'oiseau × 1,35 à 40 km/h) tant qu'OSRM n'est pas configuré. Chacune est signalée dans l'écran.
- Feuille de Laurent = plan du jour de la page « Feuille de route » existante (visites, étapes, reports). Ses visites sont **obligatoires** ; tout écart (retrait, ajout, changement d'ordre) est listé et la proposition est toujours « À VALIDER ». `c.rdv = {date, heure}` (optionnel) fixe un rendez-vous.
- Potentiel commercial : uniquement priorité A/B/C, échéance, rappel, devis envoyés (montant HT), dormants, prospects, `volume` saisi sur la fiche (déclaratif). **Aucun import EBP direct** : rien n'est inventé ni supposé vérifié.
- Rien d'envoyé au solveur hors coordonnées/durées/créneaux/priorités (test + audit `FUITE_NOM_VERS_SOLVEUR`). Navigation : coordonnées seules dans l'URL Waze/Google.
- Vérification d'adresses (BAN, api-adresse.data.gouv.fr) : uniquement sur demande, après confirmation, texte d'adresse sans nom ni téléphone ; seules les correspondances à score ≥ 0,8 sont enregistrées, les autres sont laissées « à contrôler ».

## Agents orchestrés (`organiserJournee`)
mémoire → historique → analyse commerciale → tournée/géolocalisation → performance/objectifs → optimiseur → audit. Chaque étape alimente la suivante sans saisie ; l'audit refuse la proposition (garage inventé, chevauchement, doublon, fuite de nom, Laurent perdu, validation humaine absente). Commandes reconnues : « organise ma journée commerciale », « le client est absent », « annulé », « en retard de 20 minutes », « recalcule », « suivant », « terminé », « GPS/Waze », « dicter ».

## Apprentissage
Chaque VISITE TERMINÉE (durée confirmée par l'utilisateur) ou ABSENT met à jour `meta.charlieAppris` : durée moyenne lissée par garage (utilisée dès 2 visites, valeurs hors 5-180 min ignorées), absences, créneaux de passage, difficultés.

## Limites connues (voir rapport)
Pas de synchronisation temps réel Samsung ↔ Bureau (export/ouverture de fichier, même canal que « Lien avec le PC ») ; pas d'accès à la base ODICOLOR réelle ni à EBP depuis cette session ; moteurs OSRM/VROOM non exécutés ici (réseau bloqué vers Geofabrik/ghcr) ; test sur le Samsung physique non réalisé ; l'intégration dans le dépôt `cockpit-carrosserie` (agent Oompa Loompa Tournée) n'est pas faite : session sans droit d'écriture sur ce dépôt.


## Secteurs de la feuille de route de Laurent (v50)
Secteurs couverts (déc. 2026, S1/S2) : **77** (1 et 8 déc.), **95** (2, 7, 9), **94** (3), **93** (4, 11), **91/92** (10). Départ par défaut : Massy–Palaiseau (centre de commune, comme le Bureau).
- Table dates → secteurs dans `charlie-optimiseur-v50.js` (`SECTEURS_LAURENT`, dates et départements seulement, transcrits du cockpit `src/charlie-laurent*.js` qui fait foi). Samedi/dimanche ou date inconnue : aucun secteur inventé, pas de filtre.
- Hors secteur du jour : un garage **non** prévu par Laurent n'est pas proposé ; un garage **prévu par Laurent** hors secteur est conservé avec l'alerte `SECTEUR_DIFFERENT`.
- Positions : adresse vérifiée (GPS) sinon **centre de commune** (comme `carte-v48.js`) ; les tournées calculées sur des centres de commune sont signalées « approximatives ».
- Moteur routier : `infra/routage/` (extrait Île-de-France : 75, 77, 78, 91-95). `node infra/routage/verifier-moteur.cjs` contrôle OSRM + VROOM sur un point par secteur ; testé ici contre de FAUX serveurs seulement.


## Chaîne commerciale CHARLIE (v50, lot « finalisation »)
| Brique | Fichier | Rôle |
|---|---|---|
| Cœur (UN SEUL cerveau) | `charlie-optimiseur-v50.js` | scoring, secteurs, optimisation, recalcul, audit, mémoire. Copié à l'identique dans le cockpit (garde-fou sha256) |
| Contexte téléphone | `charlie-contexte-v50.js` | finance EBP, horaires par jour, durées par type, rapprochement des noms de Laurent |
| Synchronisation | `charlie-sync-v50.js` | file hors-ligne, fusion sans perte (409), jeton en en-tête, HTTPS obligatoire |
| Airtable | `charlie-airtable-v50.js`, `scripts/charlie-airtable-sync.cjs` | lecture seule de « Comptes » et « Tournées » ; retours PRÉPARÉS (jamais envoyés sans validation) |
| Bureau | `bureau/charlie-carte.html/.js` | carte locale, suivi automatique (15 s) ; fichier exporté = secours |

**Flux** : Airtable/cockpit (feuille de Laurent) → CHARLIE → Samsung (`GET /api/tournee/laurent/{date}`) → optimisation locale (même cœur) → validation humaine → `PUT /api/tournee/jour/{date}` → Bureau.
**Règles EBP** : le CA et la dernière facture ne comptent que pour les pièces importées d'EBP (`source:'ebp'`) ; une saisie manuelle ou un champ Airtable non « Vérifiée EBP » est ignoré par le scoring. Retard de paiement et compte bloqué sont **protecteurs** (alertes même sans import). Marge : **toujours « manquante »** (prix d'achat EBP non disponible).
**Mémoire** : journal borné (1 500 événements) des validations/refus, visites, absences, retards, fins de journée ; durées apprises par garage dès 2 visites ; « enseignements » proposés (jamais appliqués seuls).
**Laurent** : ses visites sont obligatoires ; les noms sont rapprochés sans devinette (exact ou mêmes mots) ; une faute de frappe est proposée à confirmation et mémorisée comme alias.
