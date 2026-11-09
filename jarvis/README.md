# JARVIS — système d'agents persistant, supervisé, cloisonné (données fictives)

**Lire d'abord : [`docs/00_LIRE_EN_PREMIER.md`](docs/00_LIRE_EN_PREMIER.md)** — état réel, limites, ce qui n'est PAS fait.

```
npm test        # 175 tests (Node ≥ 22.13, zéro dépendance)
npm run demo    # démarre les 3 espaces (perso / ODICOLOR / cockpit) en 3 processus ; jetons affichés
npm run service # un seul espace : JARVIS_ESPACE=odicolor|perso|cockpit
npm run sante   # sonde de santé d'un espace (code 1 = alerte critique)
npm run admin   # administration : règles et autorisations (jeton administrateur)
```

| | |
|---|---|
| 8 agents | Devis · Produits · Prospection · Clients · Relances · Commandes · Finance · Planification (`docs/07`) |
| Contrôle | Auditeur **indépendant** : recalcule depuis les sources ; boucle de correction limitée à 3, puis escalade |
| Isolation | Chaque agent dans un processus restreint, ne reçoit que ses données |
| Cloisonnement | 3 espaces, 3 bases, 3 jetons, 3 sauvegardes ; données réelles et intégrations **désactivées** sans autorisation |
| Règles | TVA/remise/marge **configurables, justifiées, validées** — aucune valeur présumée (`docs/08`) |
| Humain | Aucun envoi sans ton clic ; l'envoi est **simulé** ; aucune intégration développée |
| Essais | **Aucun essai Windows/Samsung réalisé** (`docs/09`) |

Ce dossier est **ajouté** au dépôt et ne modifie ni l'application ODICOLOR ni ses fichiers.
