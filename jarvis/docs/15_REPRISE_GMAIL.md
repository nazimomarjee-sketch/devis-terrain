# Reprise du 10 novembre 2026 : brouillon Gmail de test

Point de départ vérifié : `4061282`, branche `ccr-394b2d9a-kcmqcj`.

## Ce qui change

L'adaptateur `src/connecteurs/gmail-reel.js` implémente le POST de création de brouillon Gmail, avec le MIME et le PDF audités. Il ne contient aucune méthode d'envoi. Le service le raccorde à une file distincte `gmail_reel` : les anciens brouillons synthétiques ne deviennent jamais des opérations Google à la suite d'un changement de paramètre.

Il faut à la fois une configuration OAuth côté service, une autorisation administrateur `integration:gmail`, le mode `reel_test`, puis une approbation utilisateur confirmant ce mode. L'interface indique séparément l'attente, le résultat connu et l'échec. Un devis validé n'est pas présenté comme la preuve de création d'un brouillon.

Le destinataire doit rester fictif (`.invalid`). Les jeux de démonstration existants sont conservés. Aucune donnée ODICOLOR réelle n'est importée. Windows, Samsung physique, IA réelle et endurance 24 h restent non qualifiés.

## Incidents et doublons

Avant le POST, une réservation SQLite persistante lie la clé à l'empreinte du MIME et au compte configuré. Un identifiant de brouillon reçu est conservé : les reprises après succès retournent ce reçu sans nouvel appel.

Si le résultat est inconnu (coupure, délai, réponse invalide, erreur HTTP ou crash après réservation), l'opération passe en échec définitif. Même le rejeu administrateur ne répète pas le POST. Il faut contrôler la boîte Gmail ; aucun outil de rapprochement automatique n'est encore fourni. Cela privilégie l'absence de doublons à la disponibilité : un crash avant le POST peut aussi bloquer une opération jamais créée. Ce n'est PAS une garantie de livraison « exactement une fois ».

L'arrêt d'urgence suspend aussi la file externe. Un POST déjà parti ne peut pas être annulé. Une révocation est revérifiée après l'obtention du jeton et avant le POST. Les messages d'erreur OAuth/Google ne recopient ni le corps distant ni les secrets.

Attention à la restauration d'une ancienne base : les reçus locaux ne prouvent plus l'état actuel de Gmail. Garder le connecteur désactivé et rapprocher les brouillons avant toute reprise. L'essai sauvegarde/restauration sous charge réelle n'a pas été effectué.

## Connexion à effectuer sur la machine de service

La connexion Gmail de ChatGPT ne fournit pas ses jetons OAuth à ce service autonome. Aucun secret n'a été récupéré ni mis dans Git. Ne jamais coller de secret dans une conversation, un commit ou un rapport.

1. Préparer un client OAuth Google avec l'API Gmail activée et consentement du titulaire pour `https://www.googleapis.com/auth/gmail.compose`. Ce droit Google permet également l'envoi ; la restriction « brouillons seulement » est imposée par notre code, pas par ce droit Google. La procédure interactive d'obtention du premier jeton n'est pas encore intégrée dans la PWA.
2. Fournir au service, via son gestionnaire de secrets, `JARVIS_GMAIL_COMPTE` (adresse du compte correspondant au jeton), `JARVIS_GMAIL_CLIENT_ID`, `JARVIS_GMAIL_CLIENT_SECRET`, `JARVIS_GMAIL_REFRESH_TOKEN`. Pour un essai court, `JARVIS_GMAIL_ACCESS_TOKEN` peut remplacer les trois derniers ; il expirera sans renouvellement. Le renouvellement OAuth est implémenté et testé avec transport simulé. Le compte configuré sert de liaison locale, il n'est pas vérifié par un appel de profil Google.
3. Autoriser le réseau HTTPS vers `gmail.googleapis.com` et, pour le renouvellement, `oauth2.googleapis.com` sur la machine hôte. Les URL de production sont fixes ; les redirections sont refusées.
4. Démarrer normalement `npm run service`. Le raccordement ne s'active pas tout seul.
5. Avec le jeton administrateur déjà configuré dans l'environnement du CLI :

```sh
node scripts/admin.js autorise integration:gmail "Essai de brouillon fictif autorisé par le titulaire" 1
node scripts/admin.js parametre connecteur_gmail reel_test
```

6. Sur le téléphone connecté au service, demander le devis d'exemple, contrôler le PDF et approuver. Vérifier le brouillon et sa pièce jointe dans le bon compte Gmail. Aucun mail ne part. Si « résultat incertain », ne pas créer une nouvelle mission avant vérification de Gmail.
7. Désactiver après l'essai : `node scripts/admin.js parametre connecteur_gmail desactive` et révoquer l'autorisation avec son identifiant. Supprimer le brouillon de test dans Gmail si souhaité.

Sans configuration OAuth, aucune activation ni validation réelle n'est revendiquée. Il manque encore un service accessible au Samsung et la recette physique ; ce commit ne déploie rien.

## Vérifications

- `node --test tests/gmail-reel.test.js tests/connecteurs.test.js tests/securite.test.js` : 32/32 réussis sous Linux, Node 24.22.1. Google est remplacé par un transport simulé.
- Neuf tests nouveaux couvrent API, consentement explicite, MIME/PDF, réservation concurrente, reprise SQLite, coupure après création, refus d'envoi, révocation, arrêt, erreurs et renouvellement OAuth.
- `tests/gmail-mobile.mjs` prépare une recette Playwright 360×780 ; lancement tenté mais bloqué ici par `socket() ... Operation not permitted`. Aucun résultat visuel positif revendiqué.
- Deux défauts du banc ancien ont été corrigés : le nettoyage d'un environnement imbriqué remet maintenant l'horloge du parent ; le test PWA ferme son serveur même si Chromium ne démarre pas.
- Voir le rapport `15_RESULTATS_TESTS.txt` pour la suite complète et ses limites dans cet environnement. Les anciens 257/257 sont le résultat historique de Claude, pas une validation de cette révision.

## Références de protocole consultées

- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/web-server#offline
