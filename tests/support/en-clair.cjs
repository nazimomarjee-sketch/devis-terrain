'use strict';
// Recherche de données en clair dans des fichiers CHIFFRÉS. Le coffre stocke du chiffré en base64 : un mot court (ex. « C10 »)
// y apparaît PAR HASARD environ 3 fois sur 100 (mesuré le 07/11/2026 sur 4 000 écritures : 2,85 %). Un test qui cherche un mot
// court échoue donc de temps en temps sans qu'aucune donnée ne fuie. Règle : pas de mot court dans l'alphabet base64.
const BASE64 = /^[A-Za-z0-9+/=]+$/;
const risqueDeHasard = mot => mot.length < 12 && BASE64.test(mot);

// Renvoie la liste des fuites { mot, position, contexte }. Refuse (erreur du test) un mot trop court pour être fiable.
function chercherEnClair(contenu, mots) {
  const fuites = [];
  for (const mot of mots) {
    if (risqueDeHasard(mot)) throw new Error('Mot trop court pour chercher dans du chiffré : « ' + mot + ' ». Utilise au moins 12 caractères, ou un mot contenant un espace, un guillemet ou une ponctuation.');
    const i = contenu.indexOf(mot);
    if (i >= 0) fuites.push({ mot, position: i, contexte: contenu.slice(Math.max(0, i - 25), i + mot.length + 25) });
  }
  return fuites;
}
module.exports = { chercherEnClair, risqueDeHasard };
