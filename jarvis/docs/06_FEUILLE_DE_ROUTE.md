# 06 — Feuille de route jusqu'à une exploitation réelle

Chaque phase a une **sortie vérifiable**. On ne passe à la suivante que si elle est atteinte.

| Phase | Contenu | Sortie vérifiable | Dépend de |
|---|---|---|---|
| **0 — Fait** | Prototype, 1 agent métier, auditeur, sécurité, tableau de bord, sauvegarde | 46 tests verts, capture Samsung, scénario de démonstration | — |
| **1 — Cadrage (sans achat)** | Tu valides les hypothèses métier ; tu demandes l'**accord écrit d'ODICOLOR** ; tu choisis l'agent suivant | TVA, plafond de remise, ancienneté des tarifs confirmés ; accord (ou refus) écrit | **Toi** |
| **2 — Machine** | Achat (scénario B recommandé), installation Windows, BitLocker, VPN, service | Checklist du §9 de `05` cochée en entier | Toi (achat) |
| **3 — Données réelles limitées** | Import EBP (fichier), vrais tarifs, gabarit de devis réel, **brouillons Gmail uniquement** (jamais d'envoi) | Pilote 2–4 semaines ; **0 erreur de montant non détectée** sur l'ensemble des devis ; taux de missions sans correction humaine mesuré | Accord ODICOLOR, export EBP |
| **4 — Autres agents** | Produits → Commercial → Finance → Analyste → Infrastructure → Développeur | Chacun avec son auditeur déterministe **avant** mise en service | Phase 3 stable |
| **5 — Modèles IA** | Compréhension du langage libre, rédaction ; benchmark sur **30 vrais cas** ; hybride local/en ligne | Taux d'erreur mesuré, coût par mission, repli si fournisseur en panne | Accord de confidentialité |

## Ordre recommandé des agents (et pourquoi)

1. **Produits** : un devis n'est fiable que si le catalogue l'est (références, conditionnements, tarifs datés). C'est la dépendance n°1 de l'agent Devis.
2. **Commercial** : s'appuie sur tes notes terrain ; reprend le protocole `ODICOLOR-AGENT-01` déjà défini, mais automatisé.
3. **Finance commerciale** : exige de **ne pas confondre** CA HT facturé, commandes, règlements, encours : un auditeur dédié doit le vérifier.
4. **Analyste**, puis **Infrastructure/sécurité**.
5. **Développeur en dernier** : le plus risqué (il écrit du code). Règles : branches isolées, tests obligatoires, **aucune fusion ni déploiement sans toi**, aucun accès aux données réelles.

## Intégrations : vérifier avant de promettre

| Outil | Premier niveau (autorisé) | Suite, **seulement après vérification technique et autorisation écrite** |
|---|---|---|
| EBP | Import Excel/CSV (fichier) | Lecture directe, puis écriture : **jamais présumées possibles** |
| Gmail | Création de **brouillons** | Envoi : action humaine (ou, plus tard, règles très strictes validées par toi) |
| Airtable | Aucun | À étudier si utile |
| Appli ODICOLOR (PWA) | Échanges JSON existants, **sans la modifier** | Intégration plus poussée : décision séparée |

## Procédures à écrire avant la mise en production réelle

Déploiement en production (qui, quand, retour arrière) · fusion dans les branches principales · suppression de données réelles · changement de droits et de paramètres de sécurité · réponse à incident (service silencieux, fuite suspectée, sauvegarde corrompue). **Toutes ces actions restent humaines.**

## Cibles de qualité proposées (à valider par toi)

- 0 erreur de montant atteignant un client (mesure : audit mensuel d'un échantillon de devis envoyés).
- 100 % des tarifs de plus de 90 jours signalés sur les devis.
- Une restauration réussie par mois.
- Dépense IA ≤ budget journalier validé.
- Moins de 10 interventions humaines par jour **hors** validations de devis.

## Décisions qui t'attendent

1. Valider (ou corriger) TVA 8,5 %, remise max 60 %, seuil de 90 jours.
2. Demander l'accord d'ODICOLOR (et obtenir la réponse **par écrit**).
3. Confirmer le scénario matériel (B recommandé) et **seulement ensuite** acheter.
4. Choisir l'agent à construire après Devis (je propose **Produits**).
