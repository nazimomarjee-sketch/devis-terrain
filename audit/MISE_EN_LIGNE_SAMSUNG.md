# Mise en ligne des essais depuis Samsung

La prévisualisation gratuite a été autorisée. **Elle n’est pas encore publiée.** Aucun accès Cloudflare n’est connecté à l’assistant. Cette procédure permet de créer les trois projets de test depuis le navigateur du Samsung, sans PC, terminal, ni transmission de mot de passe ou de jeton. Elle est distincte des tests de l’application.

## 1. Télécharger les trois ZIP préparés

Dans le résultat vert de GitHub Actions fourni par l’assistant, ouvrir **Artifacts** en bas de page, connecté au compte GitHub. Télécharger les trois fichiers suivants sans les décompresser. Ne pas télécharger le code source du dépôt à leur place.

| ZIP | Projet Cloudflare à créer |
|---|---|
| `odicolor-test-pr2-20261028-a.zip` | `odicolor-test-pr2-20261028-a` |
| `odicolor-test-pr2-20261028-b.zip` | `odicolor-test-pr2-20261028-b` |
| `odicolor-test-pr2-20261028-guide.zip` | `odicolor-test-pr2-20261028-guide` |

Les ZIP sont conservés sept jours. Ils contiennent uniquement les ressources de l’application de la PR et, pour le guide, les données synthétiques. Aucune sauvegarde du téléphone n’est nécessaire pour les fabriquer. La CI ne crée aucun site Cloudflare et ne lit aucun secret Cloudflare. Les liens de téléchargement effectifs seront fournis après réussite de la CI.

## 2. Se connecter à Cloudflare

Ouvrir [le tableau de bord Cloudflare](https://dash.cloudflare.com/) dans Chrome. Se connecter ou créer un compte gratuit et vérifier son adresse e-mail si demandé. Ne pas ajouter de domaine commercial et ne pas souscrire une offre payante. L’assistant ne voit pas cette connexion.

## 3. Créer l’espace A

1. Ouvrir **Workers & Pages**, puis **Create application**.
2. Choisir **Pages**, puis l’option d’envoi de fichiers **Direct Upload / Drag and drop** (pas la connexion à GitHub). Les libellés peuvent varier ; si l’option est absente, s’arrêter et transmettre uniquement le libellé de l’écran.
3. Donner le nom exact `odicolor-test-pr2-20261028-a`.
4. Toucher la zone de sélection des fichiers et choisir le ZIP A téléchargé. Ne choisir aucun fichier personnel. Cloudflare accepte les ZIP sans décompression préalable.
5. Vérifier qu’aucune ressource n’est signalée en erreur, puis toucher **Deploy site**.
6. Copier l’adresse HTTPS affichée et la transmettre dans la conversation. Le mot « production » éventuellement affiché ici désigne seulement ce nouveau projet de test : aucun lien avec le site commercial ou la branche `main`.

Si Cloudflare modifie le nom demandé ou ajoute un suffixe parce que le nom est occupé, transmettre l’adresse obtenue **avant de publier le guide**. Le guide devra alors être régénéré avec les liens réels. Ne pas réutiliser un ancien projet déjà rempli pour obtenir une base vierge.

## 4. Créer B puis le guide

Reprendre les mêmes actions dans **deux nouveaux projets**, avec les noms et ZIP correspondants du tableau. Ne pas envoyer les trois ZIP dans le même projet. Ne pas remplacer de projet existant. Le guide doit être publié en dernier, après vérification des adresses A/B.

Les noms prévus donnent trois origines différentes, donc des bases et caches séparés. Aucune fonction serveur ni analytics n’est nécessaire. Une restriction sur les comptes récents peut retarder la création de plusieurs projets : dans ce cas, transmettre le message et attendre, sans souscrire une offre payante.

## 5. Contrôle avant les essais

Transmettre les trois adresses publiques, sans mot de passe ni jeton. L’assistant doit contrôler HTTPS, les empreintes des fichiers, l’absence de redirection/transformations et les liens du guide. Ces contrôles ne sont pas réalisés tant que les sites n’existent pas. Les essais commencent ensuite en suivant le guide dans Chrome du **Dossier sécurisé Samsung**. Les données de production ne sont jamais utilisées.

Source : [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) (ZIP via le tableau de bord ; consultation du 28 octobre 2026). Le comportement du sélecteur sur ce Samsung reste à vérifier. Si une interface ne fonctionne pas au toucher, signaler le blocage ; ne pas installer de terminal ni changer d’hébergeur sans discussion.
