# TASKS (backlog avec critères d'acceptation) — P0 d'abord
Légende : ✅ fait et testé · 🟡 partiel · ⬜ à faire
## P0 fiabilité
- ✅ T1 Sauvegarde complète `.odicolor` + restauration sûre + PWA hors ligne (Lot 1 intégré). *Critère : tests backup/pwa/null-ui/stabilisation verts.*
- ✅ T2 Lecture téléphone→Bureau sans perte à 1 500 garages. *Test `integration-telephone-bureau`.*
- ✅ T3 Export `.odicolor` chiffré (AES-256-GCM, PBKDF2-SHA256 600 000, phrase jamais conservée, relecture avant téléchargement) ; anciennes sauvegardes importables ; Bureau lit les fichiers chiffrés. *Tests : backup-chiffre (10), intégration (4), navigateur téléphone.*
- ⬜ T4 Test restauration sur gros volume profil `terrain` (2000 clients/10000 devis) dans la CI. *Critère : temps + zéro perte.*
- ✅ T5 Recette Samsung unique de 12 étapes : `docs/RECETTE_SAMSUNG_FINALE.md` (à exécuter par le propriétaire ; B9). *Critère : le propriétaire l'exécute en 20 min.*
## P1 production terrain
- ✅ T6 CA facturé HT sur téléphone : saisie contrôlée de factures/avoirs (numéro obligatoire, doublons refusés, futur refusé, annulation motivée sans suppression), objectif de l'accueil = CA facturé ; commandes et encaissements affichés à part ; « Non renseigné » plutôt qu'un faux zéro ; inclus dans la sauvegarde chiffrée. *Tests : ca-facture-telephone (8), ca-facture-browser (3).* Reste : import EBP (même module, source « ebp »), lien facture→créance à encaisser.
- ✅ T7 Visite terrain en 4 touches maximum (3 si absent) : ouvrir (cockpit/tournée) → résultat → ce qui est ressorti → suite = enregistrement ; note facultative ; annulation immédiate ; enchaînement « garage suivant » en tournée ; hors ligne. *Tests : visite-telephone (7), visite-browser (4, touches comptées).*
- ⬜ T8 Rappels/rendez-vous + recherche rapide (<300 ms à 2000 fiches).
## P2 cockpit
- 🟡 T9 Cockpit MOBILE (téléphone, sans PC, hors ligne) : CA facturé vs rythme des jours ouvrés, comptes bloqués, devis acceptés à commander, règlements en retard, rappels, devis à relancer, prospects prioritaires, clients à ne pas laisser dormir — chaque ligne avec sa raison. *Tests : cockpit-telephone (5), cockpit-browser (1).* Reste : mise en page grand écran du Bureau, secteur/analyse, import EBP.
- ✅ T10 Import EBP du CA facturé (téléphone) : aperçu avant écriture, factures+avoirs HT seulement, doublons identiques ignorés, conflits jamais écrasés, traçabilité fichier+ligne, annulation d'import en bloc. *Tests : ca-ebp-telephone (9), ca-facture-browser (+2).* Colonnes EBP = hypothèse (aucun export réel reçu).
- ⬜ T11 Commandes / facturé / encaissé en trois colonnes cohérentes.
## P3 carte & Ville
- ⬜ T12 Carte >1 000 garages : filtres, clusters, couverture vs conquête ; import « Marché à prospecter » depuis le CSV officiel (convertisseur prêt).
- ⬜ T13 Ville : sélection tactile, 5 personnages/commune, fluide mobile — sans modifier la Ville LEGO validée sans accord.
## P4 optimisation — plus tard.
