# ODICOLOR V47 — lot 1 : sauvegarder et restaurer

Périmètre : F01, F02 et F03 du rapport existant `audit/AUDIT_V47_TERRAIN_2027.md` sur `audit/v47-fiabilite-terrain-2027`. Aucun nouvel audit, changement CSS, version visuelle, service worker ou règle commerciale.

## Récupération sur une installation vierge

1. Sur le poste source, Réglages → Télécharger une sauvegarde. Conserver le JSON hors du téléphone dans un emplacement d’entreprise autorisé. Le fichier contient les données commerciales et les pièces en clair, comme l’ancien export ; aucun service externe supplémentaire n’est appelé.
2. Sur une installation vierge, ouvrir Réglages et sélectionner ce fichier. Le format v2 contient les articles/prix, clients et leurs historiques/champs inconnus, devis, toutes les métadonnées métier (rapport d’import, PC/actions/archives/précédent, assistant, tournées, etc.), photos et PDF avec leur index.
3. Choisir Restaurer après contrôle. Le fichier est validé et les devis calculés à blanc ; les références, nombres, dates et empreintes SHA-256 des pièces sont contrôlés avant toute transaction d’écriture. Lire les comptes et l’état complet/incomplet dans la confirmation.
4. Confirmer le remplacement. Les quatre magasins sont remplacés dans une transaction IndexedDB unique ; le succès attend `oncomplete`. Un refus ou un abort conserve l’état précédent.
5. Contrôler le catalogue, une fiche avec historique/photo, un devis, le PC/assistant et un PDF. Le format ne synchronise pas les appareils.

## Ancien format v1

La migration est explicite et ne déduit aucune donnée absente : le catalogue et les pièces manquants deviennent vides, les métadonnées absentes sont retirées du portefeuille actif. La confirmation signale ce caractère **incomplet**. L’ancien portefeuille, ses tarifs, métadonnées et pièces sont conservés dans l’archive préalable ; aucune photo ni analyse locale n’est réaffectée au nouveau garage portant le même ID. Les lignes invalides ne sont pas réparées silencieusement. Toute version inconnue est refusée.

## Revenir à l’état précédent

Chaque restauration conserve l’état précédent dans `meta`, sous une clé `restauration-v2:<UUID>`, au sein du même commit. Réglages → Télécharger les états avant restauration exporte ces instantanés au format v2. Sélectionner ensuite le JSON voulu et utiliser la même restauration contrôlée. Les archives précédentes restent conservées ; elles ne s’imbriquent pas dans les nouvelles archives et ne sont pas incluses dans la sauvegarde métier courante. Télécharger séparément celles à conserver hors du téléphone. Aucun nettoyage automatique n’est introduit. Un état préalable déjà invalide reste archivé brut ; il peut nécessiter une réparation avant export ou restauration validés.

La conservation de l’archive nécessite de la place supplémentaire. Si IndexedDB refuse l’écriture (quota, interruption, etc.), l’ensemble de la restauration est annulé. Une archive locale seule ne protège pas contre la perte du téléphone. « Tout effacer » conserve son comportement existant et efface aussi les archives locales.

## Contrat et limites

Format JSON v2 avec manifeste de complétude et pièces `{chemin, octets, type, sha256}` ; les Blob sont encodés en base64 avec le marqueur réservé `__odicolorBlob`. Les champs inconnus JSON sont conservés sans normalisation destructrice. Les valeurs non représentables sont refusées à l’export. Le SHA-256 détecte une altération des octets par rapport au manifeste ; il ne constitue pas une signature d’authenticité.

Export et sélection d’import partagent une limite de 600 Mio de JSON, comprenant le surcoût base64. Les anciens plafonds arbitraires de 20 000 clients/50 000 devis sont retirés. Les opérations sont en mémoire : cette borne de fichier n’est pas une garantie de capacité du Samsung. Le test de charge local couvre 20 001 garages ; la borne de 600 Mio et la consommation mémoire sur appareil restent à qualifier. Aucun export tronqué ou annoncé complet sans toutes ses pièces n’est produit.

## Vérification

- `node --test tests/*.test.cjs` : domaine/migrations, graphes et calculs invalides sans transaction, pièces/index/empreintes, restauration vierge avec comparaison des octets, rollback simulé synchrone/asynchrone, archives récupérables, 20 001 garages, protections d’identité et ressources PWA.
- `node tests/backup-browser-v47.cjs` : application entière dans Chromium, IndexedDB natif, Blob/PDF, calcul réel, corruption sans écriture, abort natif avant commit et remplacement sans métadonnées résiduelles. Installation Playwright/Chromium configurée dans la CI de PR vers main.
- Vérification syntaxique de tous les scripts et `git diff --check`.

Dans l’environnement local de cette intervention, Chromium est bloqué au démarrage par une restriction de sockets (`setsockopt: Operation not permitted`). Les résultats natifs doivent être lus dans la CI ; les simulations ne sont pas présentées comme des preuves de quota réel ni de qualification Samsung. La réception physique et visuelle Premium Pro reste à effectuer avant une éventuelle mise en production, hors de cette demande de PR brouillon.
