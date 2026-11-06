# Guide — Alimenter le cockpit avec EBP, une manipulation à la fois

Une étape = une manipulation. Coche la case, regarde le voyant, passe à la suivante. Tu peux t'arrêter après n'importe quelle étape.

**Règles de sécurité (toujours)**
- Les fichiers EBP restent sur le PC ODICOLOR 2.0. Jamais par e-mail, jamais sur GitHub, jamais copiés dans Claude.
- À moi, tu n'envoies que ce que le cockpit affiche : l'état des voyants et la ligne « Colonnes retenues » (des titres de colonnes, sans aucun client).
- Le Bureau ne se connecte jamais à EBP et n'envoie rien sur Internet : il lit les fichiers que tu lui donnes.

**Ce qui est vérifié (testé le 08/11/2026)**
- Chaque fichier s'**ajoute** aux précédents : charger les règlements n'efface pas les clients.
- Un fichier refusé **ne fait pas perdre** celui déjà chargé : le message le dit (« … reste utilisé »).
- Recharger le même type de fichier **remplace** l'ancien (par exemple, un export clients plus récent).
- ⚠️ **À la fermeture de la page, rien n'est gardé** (choix de sécurité actuel : aucune donnée enregistrée).
  Tes fichiers restent dans ton dossier : pour rouvrir le cockpit, tu les recharges dans le même ordre (environ 1 minute).

---

## Étape 0 — Préparer (une seule fois)

- [ ] **0.1** Accord écrit de Faizal pour utiliser les vraies données sur le PC ODICOLOR 2.0 (ticket #6).
- [ ] **0.2** Sur le PC ODICOLOR 2.0, créer le dossier `Documents\ODICOLOR-imports\`. Pour chaque extraction, un sous-dossier daté : `2026-11-10\`.
- [ ] **0.3** Ouvrir le Bureau : récupérer le dossier du projet (je te prépare la copie quand tu me le demandes), puis double-clic sur `bureau\index.html` (Chrome ou Edge). Onglet **Bureau** → le panneau « Réveil du cockpit » affiche **0 allumé**.
- [ ] **0.4** Transfert depuis le poste EBP : une clé USB réservée à ODICOLOR. Après la copie sur le PC, **supprimer les fichiers de la clé**.

---

## Étape 1 — Le fichier clients (commencer ici)

**Pourquoi d'abord lui :** il relie les codes EBP aux garages. Sans lui, les clients inactifs sont invisibles et les couleurs restent « probables ».

- [ ] **1.1** Dans EBP, ouvrir la **liste des clients**.
- [ ] **1.2** Faire apparaître ces colonnes (choix des colonnes de la liste) :

  | Colonne EBP | Obligatoire | Sert à |
  |---|---|---|
  | Code client | Oui | Relier les ventes au bon garage |
  | Nom / Raison sociale | Oui | Afficher le garage |
  | Code postal | Recommandé | Placer le garage dans la bonne commune |
  | Ville | Recommandé | Idem |
  | Famille client | Recommandé | Couleur : carrosserie (rouge) ou Mécan (noir) |
  | Bloqué / En sommeil (ou statut du compte) | Recommandé | Comptes bloqués, clients en sommeil |

- [ ] **1.3** Exporter la liste en **Excel** ou **CSV**.
  *Hypothèse à confirmer sur ta version d'EBP :* clic droit dans la liste ou bouton « Exporter » en haut de la liste.
  Si tu ne trouves pas : dis-moi ta version d'EBP, ou envoie une photo de l'écran **sans noms de clients visibles**.
- [ ] **1.4** Enregistrer le fichier dans `ODICOLOR-imports\AAAA-MM-JJ\clients.xlsx` (ou `.csv`).
- [ ] **1.5** Dans le Bureau, onglet Bureau : remplir **Date de l'export EBP**, puis cliquer **Fichier clients** et choisir le fichier.

**Ce que tu dois voir :** le bouton passe à « ✓ Fichier clients ». Voyant **Comptes bloqués** : Allumé (ou Partiel si la colonne de statut manque).
Les autres voyants clients s'allumeront avec le téléphone (étape 2).

**À m'envoyer :** la ligne « Colonnes retenues : … » (clique sur le nom du fichier sous le bouton) et l'état du voyant Comptes bloqués.
**Si le fichier est refusé :** envoie-moi le message rouge (il ne contient que des titres de colonnes).

---

## Étape 2 — La sauvegarde du téléphone (ce n'est pas EBP, mais elle allume la Ville)

- [ ] **2.1** Sur le Samsung : Réglages → Sauvegarde → **Télécharger une sauvegarde** (fichier `.odicolor`). Le copier dans le dossier daté.
- [ ] **2.2** Dans le Bureau : bouton **Démo** (en haut à droite) → **Charger ma sauvegarde téléphone** → choisir le fichier `.odicolor`. Le bouton devient « Mes garages ».

**Ce que tu dois voir :** Ville LEGO avec tes garages, communes, prospects allumés ; **Ma Ville en 4 couleurs** allumé si la famille client est dans l'export (sinon Partiel) ; **Clients EBP inactifs** Partiel tant que les pièces ne sont pas chargées.
**À m'envoyer :** le résumé du panneau (« x allumé(s) · y partiel(s) · z éteint(s) »).

---

## Étape 3 — Les pièces de vente (12 mois minimum, idéalement 14)

- [ ] **3.1** Dans EBP, liste des **documents de vente** : devis, commandes, bons de livraison, factures, avoirs.
- [ ] **3.2** Période : du **1er jour du même mois l'an dernier** (au moins 12 mois) à aujourd'hui.
- [ ] **3.3** Colonnes : Type de pièce · N° de pièce · Date · Code client · Nom du client · Montant HT · **N° de pièce d'origine**.
  La pièce d'origine relie devis → commande → livraison → facture ; sans elle, « Tes 3 actions » reste Partiel.
- [ ] **3.4** Exporter, enregistrer `pieces.xlsx`, charger avec le bouton **Pièces (devis, commandes, BL, factures)**.

**Ce que tu dois voir :** jusqu'à **10 voyants allumés** (commandes, facturé, 3 actions, signaux, plan du matin, garages reliés…).

---

## Étape 4 — L'échéancier des règlements

- [ ] **4.1** Dans EBP, l'**échéancier clients** (factures et règlements).
- [ ] **4.2** Colonnes : N° de facture · Date d'échéance · Date de règlement · Montant TTC · Reste à payer.
- [ ] **4.3** Exporter, enregistrer `reglements.xlsx`, charger avec le bouton **Échéancier des règlements**.

**Ce que tu dois voir :** voyant **Échu non réglé et risque de règlement** allumé. Sans ce fichier, le cockpit ne déclare jamais un impayé.

---

## Après l'étape 4

Objectif : **14 voyants allumés**. Les 7 éteints demandent d'autres données ou décisions (marge, objectif, panier habituel,
distributeurs…) : on ne les traitera qu'ensuite, un à la fois.

## Chaque semaine (routine)

1. Nouveau dossier daté. 2. Refaire les exports 1, 3 et 4 (et la sauvegarde du téléphone). 3. Recharger dans l'ordre : clients → téléphone → pièces → règlements.
