# Diagnostic : test intermittent du lot A (07/11/2026)

**Symptôme.** `tests/local-decisions-navigateur.cjs`, test 1, échouait de temps en temps avec le message `C10 visible en clair`. Un seul échec avait été vu, sans journal.

**Reproduction.** 40 passages : 10 seuls (0 échec), puis 10 fois 3 passages en parallèle pour charger le processeur (1 échec sur 30). Le journal de l'échec est conservé : `docs/diagnostics/echec-lot-a-journal-conserve.log`.

**Cause (mesurée, pas supposée).**
- Le test vérifie que rien n'est lisible en clair dans les fichiers du coffre. Il cherchait entre autres le code EBP `C10`, **3 caractères**.
- Le coffre est un fichier JSON qui contient le chiffré **en base64**. Un mot de 3 caractères de l'alphabet base64 y apparaît **par hasard**, environ 1 fois sur 260 000 à chaque position du fichier.
- Mesure (`docs/diagnostics/faux-positif-chiffre.cjs`, 4 000 écritures du même coffre avec les mêmes données) :

| Mot cherché | Trouvé dans |
|---|---|
| `C10` (3 caractères) | **2,85 %** des écritures (attendu : environ 3,6 %) |
| `C20` (3 caractères) | **2,63 %** |
| `GARAGE FICTIF`, `Vérificateur fictif`, `liaison`, `Phrase-Fictive` | **0 %** |

- Le contexte relevé dans un cas est du chiffré sans signification (`…MdC10LM8Qzk+…`). Le taux observé (1 échec sur 40, soit 2,5 %) correspond à ce taux théorique.

**Conclusion.** Aucune donnée ne fuyait : c'était un **faux positif du test**, qui aurait pu apparaître à tout moment. Ce n'est pas un défaut du coffre.

**Correction.**
- `tests/support/en-clair.cjs` : la recherche en clair **refuse** les mots de moins de 12 caractères qui sont dans l'alphabet base64, et renvoie la position et le contexte en cas de fuite réelle.
- Les 3 tests concernés (`local-decisions`, `local-bureau`, `local-coffre`) utilisent des chaînes longues ou ponctuées. Les mots courts `C001`, `GARAGE`, `ALPHA` et `Massy` avaient la même faiblesse, avec un risque plus faible.

**Ce qui n'est pas démontré.** La cause de l'échec précis de la série n'est établie que par le message, le taux mesuré et le contexte ; le contenu exact du fichier de cette exécution n'a pas pu être relu, car le dossier temporaire est supprimé à la fin du test. Les prochains tests, s'ils échouent, afficheront la position et le contexte.

**Stabilité après correction.** Voir les relances en fin de document.

## Stabilité après correction (07/11/2026)
- Test du lot A relancé **10 fois seul** : 10 réussites. Relancé **3 fois en parallèle, 10 fois** (processeur chargé) : 29 réussites sur 30, l'échec étant celui analysé ci-dessus (avant correction).
- Suite complète (22 fichiers de tests unitaires + 13 fichiers d'essais dans le navigateur) lancée **3 fois de suite après correction** : 0 échec sur les 3 tours.
- Limite : trois tours ne prouvent pas l'absence de tout autre défaut rare. La cause identifiée étant probabiliste (environ 3 %), 3 tours complets auraient eu un risque non négligeable de la voir ; le test ne peut plus la reproduire, car il refuse désormais les mots courts.
