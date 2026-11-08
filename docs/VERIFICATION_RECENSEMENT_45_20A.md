# Vérification du recensement 45.20A (08/11/2026)

Aucun résultat chiffré dans ce fichier (les résultats restent hors du dépôt public). Contrôles faits :
- **Source et date** : INSEE, fichiers StockEtablissement et StockUniteLegale (data.gouv.fr), stock du 03/11/2026, extraction du 08/11/2026. Fichier lu en entier (lignes lues = lignes annoncées, tous les blocs lus).
- **Définition** : établissement ACTIF (état administratif « A »), code activité principale de l'ÉTABLISSEMENT = 45.20A (pas celui de l'entreprise), commune d'implantation dans 95, 94, 91, 77, 93.
- **Recalcul indépendant** (depuis les fichiers livrés) : SIRET tous à 14 chiffres, aucun doublon, aucun autre code, aucun établissement hors des cinq départements ; somme des communes = total par département = total général ; aucune commune sans nom officiel.
- **Recoupement externe** : l'API « Recherche d'entreprises » (voie indépendante, entreprises de code principal 45.20A ou voisin) donne, pour 95 et 94, des nombres inférieurs au stock. Sens attendu : elle ignore les établissements à diffusion partielle et les entreprises dont le code principal est autre. Cohérent, mais ce n'est pas une preuve d'égalité.
- **Non vérifiable** : aucun troisième comptage indépendant (l'export de l'Annuaire est bloqué par un anti-robot, non contourné). Recoupement API non mené à terme pour 91, 77, 93.
- **Limites** : 45.20A = mécanique ET carrosserie → établissements RECENSÉS, jamais des carrosseries-peinture qualifiées (niveau de preuve « inconnu » dans l'import Marché). Les établissements totalement non diffusibles ne sont pas dans le fichier public. Créations et fermetures postérieures au 03/11 absentes.

**Verdict** : chiffres cohérents et reproductibles ; à présenter comme « établissements recensés au 03/11/2026 », jamais comme un nombre de carrosseries.
