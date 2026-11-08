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
- ✅ T8 (partie) Proposition de tournée du jour depuis le cockpit : garages prioritaires proches (rappels, devis à relancer, réachat, prospects A/B), cochables, validés en tournée ; sans position jamais proposé. *Tests : tournee-telephone (4), visite-browser (+1).* Reste : rappels/rendez-vous avec heure, recherche rapide chiffrée.
## P2 cockpit
- 🟡 T9 Cockpit MOBILE (téléphone, sans PC, hors ligne) : CA facturé vs rythme des jours ouvrés, comptes bloqués, devis acceptés à commander, règlements en retard, rappels, devis à relancer, prospects prioritaires, clients à ne pas laisser dormir — chaque ligne avec sa raison. *Tests : cockpit-telephone (5), cockpit-browser (1).* Reste : mise en page grand écran du Bureau, secteur/analyse, import EBP.
- ✅ T10 Import EBP du CA facturé (téléphone) : aperçu avant écriture, factures+avoirs HT seulement, doublons identiques ignorés, conflits jamais écrasés, traçabilité fichier+ligne, annulation d'import en bloc. *Tests : ca-ebp-telephone (9), ca-facture-browser (+2).* Colonnes EBP = hypothèse (aucun export réel reçu).
- ⬜ T11 Commandes / facturé / encaissé en trois colonnes cohérentes.
## P3 carte & Ville
- ✅ T12 (téléphone) Carte commerciale hors ligne, regroupée en grille d'écran : 10 000 garages < 60 ms par geste (Node), 1 600 garages vérifiés en navigateur ; placement GPS sinon centre de commune (annoncé « pas à l'adresse »), non placés listés ; filtres ; toucher = liste + Visiter/Fiche ; marché recensé importable par commune (nombres seulement, jamais « peinture »). Centres de communes : source publique geo.api.gouv.fr (971 communes). *Tests : carte-telephone (7), carte-browser (3).* Reste : Bureau grand écran (Leaflet existant), fond de carte facultatif.
- ✅ T13 (téléphone) Ma Ville tactile dans la PWA : liste des communes, vue Commune (même modèle et même dessin que le Bureau, Ville LEGO du Bureau inchangée), 1er toucher = aperçu, 2e = fiche du téléphone, lisible sur écran de téléphone, hors ligne. *Tests : ville-telephone-browser (3, dont absence de « null/undefined/NaN » sur 8 pages).* Reste : personnages/agence hors périmètre actuel, CA par commune (besoin code client EBP).
## P4 optimisation — plus tard.

## Cohérence (tâche 5)
- ✅ `tests/coherence-telephone-bureau.test.cjs` : même export EBP fictif → même CA du mois (téléphone = Bureau) ; même sauvegarde (claire/chiffrée) → mêmes garages et même modèle Ma Ville ; indicateurs du cockpit sans doublon.
- ✅ Rattachement EXPLICITE code client EBP → garage (jamais par le nom), CA par garage du mois, alerte « client à relancer » (dernière facture > 60 j) et « plus gros CA » dans le cockpit. *Tests : ca-ebp (+1), cockpit (+1), ca-facture-browser (+1).*
- ⬜ À faire : CA par commune sur le téléphone ; import EBP du fichier clients (codes) pour rattacher en masse ; seuil de réachat réglable.
