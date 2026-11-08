# 01 — Audit de l'existant (lecture seule)

Méthode : lecture des fichiers, recherche automatique de secrets et de fichiers de données, exécution des tests existants. **Aucun fichier des dépôts existants n'a été modifié** ; tout le travail est dans le dossier ajouté `jarvis/`.

## Dépôt 1 — `nazimomarjee-sketch/devis-terrain` (ODICOLOR Solution)

**Confirmé (mesuré)**
- Application web installable (PWA) hors ligne : `app.js` 2 159 lignes, `sw.js` 54 lignes, une quarantaine de fichiers `*-vNN.js/css` (jalons v22 → v47). Dernier commit : « V47 : fiabiliser sauvegardes, identité garages et PWA ».
- **22 tests existants, 22 verts** (`node --test tests/*.test.cjs`).
- **Aucun secret détecté** (clés API, jetons, mots de passe, clés privées) et **aucun fichier de données suivi par Git** (xlsx, csv, pdf, db, env).
- Stockage : IndexedDB sur le téléphone. Aucun serveur, aucun compte.
- Appels réseau : `wa.me` (WhatsApp), `recherche-entreprises.api.gouv.fr` (vérification d'entreprise), liens Google Maps, un PDF public du site carsystem.org, un lien vers claude.ai.
- Règles métier explicites (`CLAUDE_AGENT01_INSTRUCTIONS.md`) : l'agent n'invente aucun prix ni chiffre ; il **n'écrit jamais dans EBP, n'envoie aucun message, ne valide aucun compte** ; EBP est la source des transactions et tarifs réels ; données d'entreprise partageables avec Claude **uniquement avec l'autorisation d'ODICOLOR**.
- Aujourd'hui l'« agent » est un **copier-coller manuel** : l'app produit un briefing, tu le colles dans un projet Claude, puis tu recolles un JSON (`ODICOLOR-AVIS-01`). « Aucune clé API requise, aucune liaison Claude ↔ EBP automatique. »
- Feuille de route : `CHALLENGE_JANVIER_2027.md` (V47 Fiabilité → V50 Répétition générale → démarrage terrain janvier 2027).

**Risques relevés**
| # | Risque | Gravité | Statut |
|---|---|---|---|
| R1 | Données d'employeur : toute connexion à une IA ou à un PC personnel exige l'accord d'ODICOLOR | **Élevée** | Bloquant pour la phase « données réelles » |
| R2 | Pas de `.gitignore` à la racine : un export EBP ou une clé pourrait être commité par erreur | Moyenne | **À corriger** (je ne l'ai pas fait : le dépôt est le tien et en cours de jalons) |
| R3 | SheetJS 0.18.5 (lecteur Excel) : le `LISEZ-MOI` signale lui-même des failles connues sur fichiers non fiables | Moyenne | À mettre à jour. D'après mes connaissances, des corrections existent dans les versions plus récentes : **à vérifier** auprès de l'éditeur |
| R4 | Pas de sauvegarde automatique : les devis ne sont que sur le téléphone | Moyenne | Partiellement traité en V47 (sauvegarde/restauration JSON) |
| R5 | Hypothèses non validées : TVA 8,5 %, remise max 60 % | Moyenne | À faire valider par ODICOLOR |

**Intégration retenue (sans casser l'appli)** : JARVIS **ne modifie pas** la PWA. Premier contact par **fichiers** : import EBP Excel/CSV et JSON de briefing/avis déjà définis (`ODICOLOR-AGENT-01` / `ODICOLOR-AVIS-01`), que JARVIS pourra produire à ta place plus tard.

## Dépôt 2 — `nazimomarjee-sketch/cockpit-carrosserie`

**Confirmé**
- Dépôt **privé**, accessible en lecture/écriture. Se déclare **projet indépendant d'ODICOLOR** : « aucun code, aucune donnée, aucune marque ni fichier client d'ODICOLOR ». À déplacer dans son propre dépôt selon son propre README (risque R1 de leur doc).
- Prototype Node 22.13+, **zéro dépendance**, données fictives. **45 tests rejoués, 45 verts.** *(Le README annonce 31 : il est en retard sur le code.)*
- Aucun secret détecté. Un seul fichier de données suivi : `modele-import.csv` (modèle avec « Client exemple »).
- Dispose d'un `.gitignore` (`*.sqlite`, `node_modules/`).

**Conséquence** : même technologie que JARVIS (Node 22, zéro dépendance) — choix volontaire pour que tout s'installe pareil sur ton futur PC. Les deux projets doivent rester **cloisonnés** (espaces, droits et journaux séparés).

## Outils tiers cités par le mandat

| Outil | Ce que j'ai vérifié | Statut |
|---|---|---|
| EBP | Aucune API ni accès démontré dans les dépôts. Seul le **fichier d'export** existe | **Aucune intégration supposée** |
| Airtable, Gmail | Connecteurs disponibles dans *cette* session de travail, pas dans JARVIS | Rien branché dans le prototype |
| Mail sortant | Aucun compte, aucun identifiant | Envoi simulé uniquement |
