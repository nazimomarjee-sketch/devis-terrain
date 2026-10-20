# Devis terrain (appli hors ligne, Android)

Tout reste sur le téléphone : catalogue, clients, devis. Aucun serveur, aucun compte, aucun coût. Fonctionne sans réseau une fois installée.

## Ce que ça fait
- Importe ton export EBP (Excel ou CSV) : rapport avec lignes importées / refusées et pourquoi.
- Nouveau devis en 3 taps : Nouveau devis, client, Ajouter (quantité 1 par défaut).
- Remise par ligne (plafond réglable), TVA réglable, total HT / TTC.
- Envoi par WhatsApp, Partager, PDF (Imprimer), CSV pour ressaisie EBP, Dupliquer (prix du jour).
- « Habituels de ce client » : ses articles les plus fréquents.
- Sauvegarde / restauration (fichier JSON).

## Ce que ça ne fait pas (volontairement)
- Pas de stock. Pas de prix d'achat ni de marge sur le téléphone du commercial.
- Pas d'équipe, pas de pipeline.
- Un devis ici n'est pas un devis EBP : il ne le remplace pas.

## À valider avant usage réel
- TVA 8,5 % et remise max 60 % = hypothèses (Réglages).
- Le fichier « Tarif FRANCE » n'est pas le prix appliqué par EBP : il faut l'export des prix réellement facturés.
- Les devis sont SEULEMENT sur le téléphone : sauvegarder régulièrement.

## Tester sur PC
Dans ce dossier : `python -m http.server 8140` puis ouvrir http://localhost:8140
## Installer sur Android
Il faut une adresse HTTPS (ex. GitHub Pages gratuit : le site ne contient que le code, jamais les données). Puis Chrome, menu, « Installer l'application ».

Lecteur Excel : SheetJS 0.18.5 (lib/). Version avec failles connues sur fichiers non fiables : n'importer que tes propres fichiers.

## Envoi au responsable (v2)
Bouton « Envoyer à mon responsable » sur un devis, et « Envoyer le récap » sur l'accueil : crée un fichier JSON que le commercial envoie (WhatsApp, e-mail). Le responsable l'importe dans le CRM. Sans serveur. Renseigner « Ton nom » dans les Réglages. Non testé : le partage de fichier vers WhatsApp sur un vrai Android (sinon le fichier est téléchargé et se joint à la main).
