# TASKS (backlog avec critères d'acceptation) — P0 d'abord
Légende : ✅ fait et testé · 🟡 partiel · ⬜ à faire
## P0 fiabilité
- ✅ T1 Sauvegarde complète `.odicolor` + restauration sûre + PWA hors ligne (Lot 1 intégré). *Critère : tests backup/pwa/null-ui/stabilisation verts.*
- ✅ T2 Lecture téléphone→Bureau sans perte à 1 500 garages. *Test `integration-telephone-bureau`.*
- ✅ T3 Export `.odicolor` chiffré (AES-256-GCM, PBKDF2-SHA256 600 000, phrase jamais conservée, relecture avant téléchargement) ; anciennes sauvegardes importables ; Bureau lit les fichiers chiffrés. *Tests : backup-chiffre (10), intégration (4), navigateur téléphone.*
- ⬜ T4 Test restauration sur gros volume profil `terrain` (2000 clients/10000 devis) dans la CI. *Critère : temps + zéro perte.*
- ⬜ T5 Protocole de test Samsung (photos, PDF, hors ligne, restauration) écrit pas à pas, une page. *Critère : le propriétaire l'exécute en 20 min.*
## P1 production terrain
- ✅ T6 CA facturé HT sur téléphone : saisie contrôlée de factures/avoirs (numéro obligatoire, doublons refusés, futur refusé, annulation motivée sans suppression), objectif de l'accueil = CA facturé ; commandes et encaissements affichés à part ; « Non renseigné » plutôt qu'un faux zéro ; inclus dans la sauvegarde chiffrée. *Tests : ca-facture-telephone (8), ca-facture-browser (3).* Reste : import EBP (même module, source « ebp »), lien facture→créance à encaisser.
- ⬜ T7 Prochaine action recommandée + préparation/compte rendu de visite simplifiés. *Critère : parcours visite en ≤4 touches, hors ligne.*
- ⬜ T8 Rappels/rendez-vous + recherche rapide (<300 ms à 2000 fiches).
## P2 cockpit
- ⬜ T9 Cockpit : CA vs objectif, pipeline, relances, devis à suivre, clients à risque, plan de semaine. *(dépend B1)*
- ⬜ T10 Import EBP avec contrôle des doublons (existant à auditer avant de refaire).
- ⬜ T11 Commandes / facturé / encaissé en trois colonnes cohérentes.
## P3 carte & Ville
- ⬜ T12 Carte >1 000 garages : filtres, clusters, couverture vs conquête ; import « Marché à prospecter » depuis le CSV officiel (convertisseur prêt).
- ⬜ T13 Ville : sélection tactile, 5 personnages/commune, fluide mobile — sans modifier la Ville LEGO validée sans accord.
## P4 optimisation — plus tard.
