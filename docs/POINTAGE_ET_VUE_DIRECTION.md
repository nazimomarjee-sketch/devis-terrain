# Pointage de visite et vue Direction — feuille de route (validé en principe, rien de développé)

Maquettes sur données fictives, hors dépôt. **Aucun développement avant validation du propriétaire.**

## 1. Pointage de visite (téléphone Samsung)

**But :** faire du pointage une **preuve d'activité commerciale**, sans jamais inventer de vente ni de résultat.

| Étape | Ce que fait le commercial | Ce qui est enregistré |
|---|---|---|
| Arrivée | Bouton **« Pointer mon arrivée »** depuis la fiche du garage | Garage, heure d'arrivée (horloge du téléphone), identifiant unique de la visite |
| En visite | Note rapide, dictée, photo, devis (facultatif) | Rattachés à la visite |
| Départ | Bouton **« Terminer ma visite »**, ≈ 30 secondes | Heure de départ, **résultat observable** (obligatoire), obstacle(s), solution(s) proposée(s), besoin d'intervention de la direction, **prochaine action datée** (obligatoire) |

Règles :
- **Avatar du commercial** dans Ma Ville : il n'apparaît **qu'au garage pointé** et y reste jusqu'au pointage suivant. Il ne bouge jamais tout seul.
- **Aucune géolocalisation**, ni permanente ni ponctuelle. Le lieu est **déclaré**. Un pointage n'est **jamais** présenté comme une présence vérifiée par GPS (mention « déclaré · non vérifié GPS »).
- L'heure vient de l'horloge du téléphone : elle est enregistrée automatiquement, mais ce n'est pas une preuve infalsifiable.
- **Hors connexion** : la visite est enregistrée sur le téléphone, puis synchronisée avec le Bureau. **Sans doublon** : chaque visite a un identifiant unique créé au pointage ; un envoi répété n'est appliqué qu'une fois (règle déjà testée du Socle, `socle/synchro.js`).
- Une visite ne peut pas être clôturée sans résultat observable ni prochaine action datée.
- Aucun résultat n'est déduit : ni vente, ni commande, ni potentiel.

## 2. Vue Direction : rendre visible la ténacité commerciale

**But :** que la direction comprenne les difficultés réelles, ce qui est fait pour les surmonter et **où son aide peut débloquer une vente**.

Contenu :
- **« Besoin de toi »** : les obstacles que le commercial ne peut pas lever seul. Pour chacun : l'obstacle, ce qui a déjà été essayé, la demande précise et l'échéance. Boutons « Je décide » ou « Répondre ».
- **Dossiers en cours** : étapes franchies (contact → décideur → besoin → essai/démo → offre → commande → facturé), nombre de contacts, durée, évolution de la semaine. Les dossiers sans progrès restent visibles, de façon neutre.
- **Obstacles de la période** par type : prix, concurrence, décideur absent, refus, stock, délais, conditions commerciales…
- **Historique chronologique** de chaque dossier, alimenté **automatiquement** par les pointages et les gestes de fin de visite. Pas de compte rendu à rédiger.
- **Résultat** : commandes et **CA HT facturé confirmés par EBP** (encaissement à part).

Trois niveaux de vérité, affichés sur chaque élément :
- **● Constaté** : enregistré par l'application (heure de pointage, devis créé, décision de la direction).
- **✋ Déclaré** : saisi par le commercial (lieu, obstacle, solution, échange).
- **✓ EBP** : confirmé par l'export EBP (commande, facture, CA).

**Pas de note de ténacité.** On montre la persévérance (contacts, durée), l'évolution (étapes franchies) et l'efficacité (actions suivies d'un progrès). Les visites inutiles ne sont pas valorisées.

## 3. Dépendances et points à trancher (un à la fois)

1. **Accès de la direction** : aujourd'hui, le Bureau tourne sur un seul PC, sans hébergement. Pour que la direction consulte la vue en direct, il faut un accès distant sécurisé (étape 6 de l'application locale). D'ici là, il faudrait un export périodique (rapport) — à décider.
2. **Liste des obstacles et des solutions** : à valider (vocabulaire du terrain).
3. **Limites de remise du commercial** : à fixer par la direction (elles déterminent quand « Besoin de Faizal » s'impose).
4. **Pré-requis techniques** : sauvegardes et restauration (étape 4) avant toute donnée réelle ; données téléphone ↔ Bureau synchronisées.
