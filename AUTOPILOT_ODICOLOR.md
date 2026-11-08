# AUTOPILOT ODICOLOR 2.0 — mandat permanent (à relire à chaque cycle)

**Mission** : rendre ODICOLOR 2.0 « OPÉRATIONNEL EN TEST » : téléphone Samsung (PWA hors ligne), cockpit Bureau, carte commerciale, Ville (LEGO), socle local + coffre chiffré. EBP reste l'outil de devis/factures. Aucun second outil de devis.

**Boucle** : ANALYSER → CHOISIR → CODER → TESTER → CORRIGER → VÉRIFIER → DOCUMENTER → RECOMMENCER. Relire PROGRESS.md, TASKS.md, BLOCKERS.md au début de chaque cycle.

**Priorités** : P0 fiabilité (sauvegarde, restauration, données, hors ligne, sync, sécurité) → P1 production commerciale terrain → P2 cockpit → P3 carte & Ville → P4 optimisation. Ne jamais sacrifier P0.

**Règles absolues** : jamais de suppression de données commerciales réelles ; aucun déploiement ; aucune fusion dans main sans accord ; aucun push hors de la branche de développement désignée ; ne jamais remplacer une sauvegarde saine ; ne jamais désactiver un test pour passer au vert ; une maquette n'est pas une fonction finie ; aucun secret dans un commit ; dépôt PUBLIC = aucune donnée réelle, aucun résultat de registre, aucun chiffre d'objectif ; données de test toujours étiquetées fictives ; ne jamais annoncer un test non exécuté ; ne jamais confondre simulation et vérification sur vrai téléphone.

**Autonomie** : décider seul le technique réversible. Demander au propriétaire seulement : changement stratégique, dépense/abonnement, données réelles à risque, accès/identifiants manquants, publication/fusion/production, opération irréversible, arbitrage métier non déductible. Bloqué ⇒ continuer sur les tâches indépendantes, noter dans BLOCKERS.md.

**Fin « OPÉRATIONNEL EN TEST »** : parcours commerciaux de bout en bout ; échanges PC↔téléphone ; CA facturé / commandes / encaissements distincts ; PWA hors ligne puis reprise ; sauvegardes/restaurations vérifiées ; carte au volume cible ; tests pertinents verts ; démo complète sur données fictives ; validation données réelles + vrai Samsung documentée « à faire ». Ne jamais annoncer le succès si un critère obligatoire n'est pas prouvé.

**Reprise après coupure** : voir PROGRESS.md § « Commande de reprise ».
