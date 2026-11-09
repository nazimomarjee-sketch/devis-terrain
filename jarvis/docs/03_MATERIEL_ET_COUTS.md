# 03 — Matériel, coûts et recommandation

**Rien n'a été acheté ni commandé.** Recommandation argumentée en bas ; la décision est à toi.

## Avertissement sur la fiabilité des prix (à lire)

Relevés web du **8 novembre 2026**, par moteur de recherche. Beaucoup de pages ne sont **pas datées**, certains prix viennent de revendeurs belges ou suisses ou de comparateurs, et aucun n'a été confirmé sur un panier d'achat. **Traite chaque prix comme une fourchette à revérifier avant d'acheter.** Les chiffres marqués *estimation* ne sont pas sourcés. Le calcul est rejouable : `node docs/modele_cout.mjs`.

## Prix relevés

| Élément | Prix relevé | Source / réserve |
|---|---|---|
| Mini-PC Intel N150, 16 Go / 512 Go, Win 11 Pro (Teclast N30) | 218,99 € | [Power Planet](https://www.powerplanetonline.com/fr/teclast-n30-intel-n150-16go-512go-win11-pro) — marque peu connue, prix promo |
| Idem (Minix Z150-0dB) | 249,99 € | [PcComponentes](https://www.pccomponentes.fr/mini-pc/16gb-ram/windows/windows-11-pro?page=3), vendeur tiers |
| Idem, marque allemande (CSL Narrow Box, SSD 500 Go) | 509,00 € | [PcComponentes](https://www.pccomponentes.fr/mini-pc-csl-narrow-box-intel-core-n150-16gb-500gb-ssd-uhd-windows-11-pro) |
| Mini-PC 32 Go / 1 To, Win 11 Pro (CSL Narrow Box i3) | dès 846,57 € | [Rakuten](https://fr.shopping.rakuten.com/s/intel+mini?pa=2), **non daté** |
| Idem (Lenovo IdeaCentre Mini) | dès 1 111,08 € | Rakuten, **non daté** |
| Idem, gamme pro (HP ProDesk 4 Mini) | 1 679,99 € | [Bechtle](https://www.bechtle.com/fr/shop/pc-ia-hp-prodesk-4-mini-g1i-u7-32go-1to--4934450-05--p) |
| Beelink SER8 Ryzen 7, 32 Go / 1 To | 819 à 1 110 € | [comparateur](https://ledenicheur.fr/s/beelink-ser-8/) (non daté) et [Fruugo](https://www.fruugo.fr/beelink-ser8-8845hs-mini-pc-8-core-16-thread-ai-ordinateur-de-jeu-hdmi21-dp14-usb4-4k-triple-display-32gb-ddr5-1tb-ssd-wifi6-bluetooth-52-25gbps-eth/p-394774505-843873237) |
| Onduleur 700 VA (APC BVX700LI / BE700-FR) | 111 € HT = 133 € TTC ; ≈ 117 € chez un revendeur belge | [RS](https://fr.rs-online.com/web/p/onduleurs/2877231) |
| Carte graphique RTX 5060 Ti 16 Go | prix conseillé 449 € ; **557 à 820 € constatés** août–sept. 2026 | [NVIDIA](https://marketplace.nvidia.com/fr-fr/consumer/graphics-cards/gigabyte-geforce-rtx-5060-ti-windforce-oc-16g), [guide](https://tech-insider.org/fr/rtx-5060-ti-vs-rx-9060-xt-2026/) — **sources en désaccord, pénurie évoquée** |
| VPS Linux 4 vCPU / 8 Go | ≈ 7 à 15 €/mois HT | [OVHcloud, hausse 2026](https://next.ink/225720/ovhcloud-augmente-fortement-le-prix-de-ses-vps-2026-et-ipv4/), [comparatif](https://getdeploying.com/hetzner-vs-ovh) ; Hetzner a relevé ses prix en 2026 ([analyse](https://hackceleration.com/fr/labs/changer/hetzner)) — **sources contradictoires** |
| VPS Windows | surcoût de licence ≈ +20 €/mois dans un seul comparatif | non confirmé |
| Électricité | 0,2001 €/kWh TTC (tarif réglementé, ≤ 6 kVA) | [Selectra](https://selectra.info/energie/guides/tarifs), [La Prime Énergie](https://www.laprimeenergie.fr/energie/comparateur-fournisseur-electricite/tarif) — pas de source officielle CRE consultée |
| Consommation mini-PC N150 | 12 à 25 W | [un seul test](https://minipc-review.com/fr/m1-mini-pc-et-gk3-plus), indicatif |
| API IA | Sonnet-classe 3 $/15 $ et Haiku-classe 1 $/5 $ par million de jetons | [relevé tiers](https://dev.to/claudeguide/claude-api-pricing-2026-complete-breakdown-with-calculators-26c8). **Des modèles plus récents existent avec des tarifs annoncés de façon contradictoire : vérifier la page officielle d'Anthropic avant tout budget.** |

## Hypothèses du calcul

- Électricité **0,2001 €/kWh**, machine allumée **8 760 h/an**, +3 W pour l'onduleur.
- Consommation moyenne : B **15 W**, C **25 W**, D **70 W** — *hypothèses* (aucune mesure faite).
- API : 20 missions/jour × ~4 000 jetons entrée + 1 000 sortie ⇒ ≈ 0,009 à 0,027 $/mission ⇒ **≈ 5 à 15 €/mois** (hypothèse d'usage ; l'agent Développeur consommerait bien plus). Un **budget journalier** bloque les dépassements (testé).
- Sauvegarde externe (SSD 1 To) : **80 à 120 € — estimation non sourcée**. Scénario D, base PC + GPU : **1 300 à 1 800 € — estimation non sourcée**.
- Matériel en TTC, VPS en HT (si ton activité récupère la TVA, les écarts changent).

## Les quatre scénarios

| | **A — Sans PC** | **B — Mini-PC économique** | **C — Mini-PC 32 Go** | **D — Station IA locale** |
|---|---|---|---|---|
| Machine | VPS Linux 4 vCPU/8 Go | N150 (16 Go, 512 Go–1 To), Win 11 Pro | Ryzen/Core récent, 32 Go, 1 To, Win 11 Pro, Ethernet | PC fixe, 32 Go, SSD 1 To, GPU NVIDIA 16 Go |
| Conso. estimée | — | ~15 W | ~25 W | ~70 W |
| Élec./an | — | ≈ 32 € | ≈ 49 € | ≈ 128 € |
| Refroidissement | hébergeur | passif/silencieux | silencieux | ventilateurs audibles |
| Réseau | hébergeur | Ethernet recommandé | Ethernet | Ethernet |
| Onduleur | — | 700 VA (110–135 €) | idem | idem (marge à vérifier) |
| Sauvegarde | à prévoir (autre stockage) | SSD externe + copie chiffrée hors site | idem | idem |
| **Initial** | 0 € | **409–764 €** | **1 010–1 365 €** | **1 490–2 055 €** |
| **Total 12 mois** | **144–360 €** | **501–976 €** | **1 119–1 594 €** | **1 648–2 303 €** |
| **Total 36 mois** | **432–1 080 €** | **684–1 399 €** | **1 337–2 052 €** | **1 964–2 799 €** |
| Limites | Données chez un tiers ; accès Windows payant | 16 Go : suffisant pour l'orchestrateur, **pas** pour de gros modèles locaux | Utile seulement si petits modèles locaux | Cher, bruyant, prix GPU instables ; qualité locale < modèles en ligne |
| Évolution | Facile (changer d'offre) | RAM/SSD souvent extensibles — **à vérifier par modèle** | idem | Le plus évolutif |

*(Totaux = matériel + onduleur + sauvegarde + électricité + hébergement + API, fourchette basse–haute, tels que sortis du script `docs/modele_cout.mjs`.)*

## Configurations minimale et recommandée (fondées sur des MESURES)

Mesuré sous Linux (données fictives) : **service ≈ 70 Mo**, **agent isolé ≈ 47 Mo de pic**, **79 ms/mission** isolée. Trois services (un par espace) + un agent à la fois : **< 0,5 Go**. La mémoire de Windows 11 (≈ 3 à 4 Go au repos) pèse plus que JARVIS.

| | **Minimale** (3 espaces, IA en ligne, usage léger) | **Recommandée** (marge, 24/7, évolutivité) | **Si modèle local plus tard** |
|---|---|---|---|
| Système | Windows 11 **Pro** (BitLocker, comptes séparés) | idem | idem |
| Processeur | 4 cœurs récents (classe Intel N100/N150 ou mieux) | 4–8 cœurs efficients | 8 cœurs ou plus |
| Mémoire | **8 Go** | **16 Go** | **32 Go minimum** (+ GPU NVIDIA ≥ 12–16 Go si on vise un confort) |
| Stockage | SSD 256 Go | **SSD 512 Go** | **SSD 1 To** (les modèles pèsent 5–20 Go chacun) |
| Réseau | Ethernet | Ethernet | Ethernet |
| Protection | onduleur 700 VA + sauvegarde externe | idem | onduleur dimensionné (à vérifier avec la conso réelle) |

**Vérifié** : la mémoire minimale réelle de JARVIS est très inférieure à 8 Go. **Non vérifié** : le comportement sous Windows (latence de lancement des processus, consommation réelle en watts) — à mesurer lors des essais W2, W13, W14 (`09`).

## Coûts mensuels réels (courant) et amortis — calculés par `modele_cout.mjs`

| Scénario | **Courant** / mois (électricité + hébergement + API) | **Amorti 36 mois** / mois (courant + matériel lissé) |
|---|---|---|
| A — VPS Linux | 12,0 – 30,0 € HT | 12,0 – 30,0 € HT |
| B — Mini-PC 16 Go | **7,6 – 17,6 €** | 19,0 – 38,9 € |
| C — Mini-PC 32 Go | 9,1 – 19,1 € | 37,1 – 57,0 € |
| D — Station IA locale | 13,2 – 20,7 € | 54,6 – 77,7 € |

*Hypothèses et incertitudes : voir plus haut (prix web non officiels, consommation non mesurée, API 5–15 €/mois selon un usage de 20 missions/jour — **aujourd'hui l'API n'est pas utilisée**, donc la part API est une réserve). Un **budget journalier** (500 centimes par défaut, réglable) bloque les dépassements.*

## Ajouter un modèle local plus tard

Aucun changement d'architecture : brancher un fournisseur `local` dans `modeles.js` (ordre « local puis en ligne »). Il ne passera **jamais** les données à l'extérieur, et son travail restera contrôlé par l'auditeur. Le surcoût matériel est celui du scénario C/D. **Ne pas acheter de GPU avant d'avoir mesuré, sur tes cas réels, que le local apporte quelque chose.**

## Recommandation

**Scénario B, avec un modèle de marque connue, en dernier recours le A.** Arguments :
1. **La charge réelle est faible** : un orchestrateur, une base SQLite, un petit serveur. Le prototype tourne largement sur 16 Go ; la mémoire et la carte graphique ne servent que si on fait tourner des modèles **en local**.
2. **Le mandat demande « 32 Go minimum »** : je ne le justifie **pas** aujourd'hui. Prends 32 Go (scénario C) uniquement si tu veux des modèles locaux ; sinon c'est ~600 € de plus pour rien.
3. **Scénario D : déconseillé maintenant.** Les prix de GPU sont instables (449 € conseillé, 557–820 € constatés), la qualité d'un modèle local reste inférieure à celle des meilleurs modèles en ligne, et la consommation est ×4 à ×5.
4. **Avant d'acheter, vérifie par modèle** : Windows 11 **Pro** réellement fourni, RAM et SSD **remplaçables**, port Ethernet, garantie en France, avis sur la stabilité 24/7. Une marque inconnue à 219 € est un risque pour un service permanent.
5. **Ne rien acheter avant l'accord d'ODICOLOR** si JARVIS doit toucher ses données. En attendant, le prototype fictif n'exige aucun matériel dédié.

**Séquence proposée** : (1) tu valides ce document ; (2) accord écrit d'ODICOLOR ; (3) achat B + onduleur + SSD externe ; (4) pilote 2–4 semaines sur données réelles limitées ; (5) seulement ensuite : décider si des modèles locaux justifient un passage au C.

## Qualité des modèles : ce que je n'ai PAS mesuré

Aucun benchmark n'a été exécuté. Le choix « en ligne / local / hybride » devra se faire sur **30 vrais cas de devis** de ton activité (précision, coût par mission, latence), après autorisation d'utiliser les données. Tout classement de modèles lu sur le web est un indice, pas une preuve pour **ton** usage.

## Indispensable / optionnel

- **Indispensable** : la machine, le disque chiffré (BitLocker), la sauvegarde sur un support séparé, l'accès distant par VPN privé.
- **Fortement conseillé** : l'onduleur (une coupure en pleine écriture est le premier risque pour un service 24/7), la copie chiffrée hors site.
- **Optionnel** : second écran/clavier (utile seulement pour l'installation), GPU, 32 Go.
- **Sécurité physique** : machine dans un lieu fermé, port USB non exposé, BitLocker avec clé de récupération **conservée ailleurs**.
