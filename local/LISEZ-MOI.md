# Application locale ODICOLOR 2.0 (étapes 1 et 2 — données fictives uniquement)

- `coffre.js` : coffre chiffré sur le disque (AES-256-GCM, mot de passe + clé de secours, écriture tout ou rien).
- `serveur.js` : programme local qui affiche le Bureau et la Ville **tels quels** et garde leur état dans le coffre.
  Écoute uniquement sur 127.0.0.1 (ce PC). Aucune connexion à EBP, aucun serveur externe.
- `public/` : écran d'ouverture (création du coffre, mot de passe, clé de secours).

Lancer (essai) : `node local/serveur.js --dossier C:\chemin\vers\coffre-essai` puis ouvrir l'adresse affichée.
Tests : `tests/local-coffre.test.cjs`, `tests/local-serveur.test.cjs`, `tests/local-bureau-navigateur.cjs`.

⚠️ Pas de données réelles tant que les sauvegardes chiffrées et la restauration vérifiée (étape 4) ne sont pas faites.
