# 06 — Feuille de route jusqu'à une exploitation réelle (v2)

Chaque phase a une **sortie vérifiable**. On ne passe à la suivante que si elle est atteinte.

| Phase | Contenu | Sortie vérifiable | Dépend de | État |
|---|---|---|---|---|
| **0** | Socle, 8 agents, auditeur, cloisonnement, isolation, règles, interface, supervision, IA hybride (garde-fous) | 175 tests verts ; service réel testé (`kill -9`, arrêt d'urgence) ; captures | — | **Fait** (données fictives, Linux) |
| **1 — Cadrage** | Accord écrit d'ODICOLOR ; règles métier **validées** (TVA par territoire/opération, remise, marge, ancienneté) ; choix du matériel | Accord écrit ; règles passées en `VALIDE` avec justification et source | **Toi** (+ expert-comptable, direction commerciale) | **À faire** |
| **2 — Machine & essais** | Achat (B recommandé) ; installation Windows ; essais W1–W14 et S1–S12 (`09`) | **Chaque** essai coché avec son résultat réel ; écarts corrigés | Toi (achat), accès Windows/Samsung | **À faire** |
| **3 — Données réelles limitées** | Import EBP (fichier), vrais tarifs/clients restreints, gabarit de devis réel ; brouillons Gmail **uniquement** ; autorisation `donnees_reelles` accordée | Pilote 2–4 semaines : **0 erreur de montant non détectée** ; rapprochement EBP ; interventions humaines mesurées | Phases 1–2, export EBP | **À faire** |
| **4 — Ouverture des intégrations** | EBP (lecture), Gmail (brouillons) : chaque connecteur **développé, testé, autorisé séparément** | Autorisation `integration:<x>` + tests + revue de sécurité | Phase 3 stable | **À faire** |
| **5 — IA branchée** | Un vrai modèle (en ligne, puis éventuellement local) dans l'interpréteur ; **benchmark sur 30 vrais cas** ; coût réel par mission | Taux d'erreur, coût, latence mesurés ; repli sans modèle prouvé sur la vraie machine | Accord de confidentialité, budget | **À faire** |
| **6 — Agent Développeur** (optionnel, **le plus risqué**) | Branches isolées, tests obligatoires, **aucune fusion ni déploiement sans toi**, aucun accès aux données réelles | Revue humaine de chaque proposition | Phase 3 stable | **Non commencé volontairement** |

## Ce qui reste à construire (dettes assumées)

- **Agent Développeur** : non implémenté (les 8 agents demandés sont les agents métier ; le développeur autonome exige des garde-fous supplémentaires).
- **Import EBP** (format inconnu), **envoi réel** de mail, **notifications push**, **limitation de débit des missions**, **PWA installable**, **rotation automatique des jetons**.
- **Rapprochement des sources** (EBP ↔ données importées) pour que l'auditeur détecte aussi une source fausse.
- **Revue de sécurité externe** avant toute donnée réelle.

## Procédures à écrire avant la mise en production réelle

Déploiement (qui, quand, retour arrière) · fusion dans les branches principales · suppression de données réelles · changement de droits et de paramètres de sécurité · réponse à incident (service silencieux, fuite suspectée, sauvegarde corrompue, jeton volé). **Toutes ces actions restent humaines.**

## Cibles de qualité proposées (à valider par toi)

- 0 erreur de montant atteignant un client (audit mensuel d'un échantillon).
- 100 % des tarifs de plus de N jours signalés sur les devis (N validé).
- Une restauration réussie par mois.
- Dépense IA ≤ budget journalier validé.
- Disponibilité **réelle mesurée** sur 30 jours (aucune promesse de 100 %).

## Décisions qui t'attendent

1. Demander l'accord d'ODICOLOR (par écrit).
2. Faire valider les règles métier (TVA par territoire/opération, plafond de remise, marge, ancienneté) par les bonnes personnes.
3. Confirmer le matériel (B recommandé) et **seulement ensuite** acheter.
4. Fournir un accès Windows et Samsung pour les essais, ou les exécuter avec `09`.
