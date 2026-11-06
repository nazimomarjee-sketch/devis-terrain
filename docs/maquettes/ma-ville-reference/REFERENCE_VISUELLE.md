# Ma Ville ODICOLOR — référence visuelle figée

> ⚠️ **MAQUETTES — DONNÉES FICTIVES.** Tous les garages, noms, chiffres et dates de ces images sont inventés pour la
> démonstration. Aucune donnée réelle (EBP, Airtable, SIRENE, terrain) n'y figure.
> Les communes et départements sont réels ; les positions sont approximatives et l'emplacement de l'agence est symbolique.

**Statut :** validée par le propriétaire comme **référence visuelle figée** de Ma Ville. **Rien n'est développé.**
Tout développement futur de Ma Ville doit s'y conformer ; toute évolution visuelle demande l'accord du propriétaire.
La Ville LEGO actuellement en service dans le Bureau reste inchangée (garde-fou `tests/bureau-ville-invariance.test.cjs`)
tant qu'aucun développement n'a été validé.

## Les 4 images de référence

| Fichier | Niveau | Ce qu'il fixe |
|---|---|---|
| `1-departement-95.png` | Département (ordinateur) | Vue allégée : une tour de briques par commune, agence, secteur suggéré discret, indicateurs sourcés |
| `2-commune-goussainville.png` | Commune (ordinateur) | 1 bâtiment = 1 établissement, numéros + liste complète, aperçu au toucher |
| `3-garage-dormant.png` | Garage (ordinateur) | Le bâtiment au centre, personnages, fiche sourcée, actions |
| `4-samsung-vertical.png` | Les 3 niveaux (téléphone) | Scène en haut, tiroir au pouce en bas, zones tactiles ≥ 44 px |

Sources pour reproduire les images à l'identique : `sources/` (voir `sources/LISEZ-MOI.md`).

## Règles visuelles

### Couleurs commerciales (néon du toit, enseigne, anneau des personnages)
| Couleur | Signification |
|---|---|
| **Rouge** | Client ODICOLOR carrosserie |
| **Noir + fin liseré blanc lumineux** | Client ODICOLOR mécanique |
| **Orange** | Prospect carrosserie |
| **Bleu** | Prospect mécanique |
| **Gris** | Non qualifié |

Les alertes (impayé, compte bloqué, alerte commerciale) sont des **pastilles séparées** (rouge « ! ») : elles ne changent jamais la couleur.

### À qualifier ≠ hors cible
| | **? À qualifier** | **⊘ Hors cible** |
|---|---|---|
| Sens | Établissement repéré (SIRENE), activité **probable**, à vérifier | Établissement écarté |
| Bâtiment | Gris clair, contour **pointillé**, panneau « ? À QUALIFIER » | Très sombre, toit **hachuré**, panneau « ⊘ HORS CIBLE » |
| Repère | Numéro gris pointillé + « ? » | Numéro sombre + « ⊘ » |
| Comptage | À part, jamais compté comme prospect | À part, jamais compté comme prospect |

Un établissement SIRENE n'est **jamais** une carrosserie confirmée d'office.

### Statut dormant
- Un client dormant **reste client** : son bâtiment garde la couleur client.
- L'inactivité est signalée par une **petite pastille discrète « ☾ 7 mois »**, compensée en taille dans les vues zoomées.
- Dans les compteurs : « 3 clients, dont 1 dormant ». Le libellé complet (« inactif depuis 7 mois ») est dans la fiche.

### Agence ODICOLOR
- Le bâtiment le plus reconnaissable : grande enseigne néon rouge « ODICOLOR · AGENCE GOUSSAINVILLE », logo lumineux,
  entrepôt, Comptoir Pro, fourgons de livraison, halo rouge.
- Présente aux 3 niveaux. Réduite en vue commune, pour laisser la place aux garages.
- **Emplacement symbolique** : l'adresse exacte n'est jamais inventée.
- Le personnel ODICOLOR ne porte **aucune couleur commerciale**.

### Mentions obligatoires
- Vue département : **« 📍 Positions approximatives · agence : emplacement symbolique »**.
- Vues commune et garage : **« 🗺 Plan schématique : emplacements non réels »**.
- Maquettes et démonstrations : **« MAQUETTE · DONNÉES FICTIVES »** ou « FICTIF ».
- Chaque chiffre porte sa source (EBP, Airtable, Terrain, SIRENE) ; sinon « Inconnu ». Le CA facturé n'est jamais estimé.

### Logique de navigation : département → commune → garage → fiche
1. **Département** : allégé. Une tour de briques par commune (une brique par catégorie, couleurs commerciales en haut,
   gris à la base ; hauteur = nombre d'établissements). Aucun bâtiment individuel.
2. **Commune** : un vrai bâtiment par établissement (carrosserie : cabine de peinture et extracteurs ; mécanique : baies,
   pont, pneus). **Tous** les établissements sont accessibles (numéros + liste) ; au plus 5 personnages à l'écran.
3. **Garage** : zoom sur l'établissement, ses personnages, sa fiche (chaque information avec sa source) et ses actions.
4. **Fiche commerciale.**

Conçu pour plus de 1 000 garages : seul le niveau ouvert est dessiné ; au-delà d'environ 40 établissements dans une commune,
regroupement et liste.

### Toucher (Samsung)
1er toucher : aperçu · 2e toucher : ouvrir · pincer ou boutons ＋/－ : zoom · glisser : retour · ☰ : tout en liste.

### Départements et suggestions
- 95, 94, 91, 77, 93 : **prioritaires, sans ordre**. 75, 78, 92 : couverts, secondaires.
- Le cockpit **suggère** (secteur, garages) dans un panneau **repliable** et discret ; il indique ce qui manque.
  Le commercial décide.

## Hors de cette référence
Les maquettes « pointage de visite » et « vue Direction » sont décrites dans `docs/POINTAGE_ET_VUE_DIRECTION.md`,
en attente de validation.
