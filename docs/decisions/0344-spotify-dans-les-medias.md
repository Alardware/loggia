# 0344 — Spotify dans les Médias

*11 novembre 2026 — à l'essai (bêta v3.100.0-beta.1)*

## Le problème

« Je voudrais pouvoir gérer Spotify et ses playlists dans Loggia, avoir mes
playlists qui remontent dans les médias, détection ou possibilité de les
charger. » Loggia savait parcourir l'arbre d'un lecteur Spotify, trois niveaux
plus bas, et dire une phrase à une Echo. Rien ne montrait les playlists, et
rien ne choisissait l'enceinte : l'intégration officielle joue sur l'appareil
Spotify Connect actif — souvent le navigateur de l'ordinateur.

## La décision

L'intégration officielle Spotify (option A, choisie sur l'aperçu de la démo).
Dans Objets › Multimédia, une rangée « Spotify » au-dessus des lecteurs : les
playlists du compte, lues dans son arbre (le dossier `current_user_playlists`),
puis celles ajoutées par leur lien ; « Écouter sur », un menu des enceintes que
Spotify Connect voit (`source_list`), qui retient le dernier choix sur cet
écran ; « Ajouter par lien », pour un administrateur ; les flèches à la souris,
le glissement au doigt. La même rangée dans la fiche d'une Echo que Spotify voit
sous le même nom : la playlist part sur elle.

Le lancement est au serveur (`loggia/spotify/jouer`, spotify.py) :
l'enceinte (`select_source`), deux secondes, puis la playlist (`play_media`), au
nom du compte de la session et seulement s'il pilote ce lecteur. Une enceinte
que Spotify ne voit pas est refusée par son nom, jamais jouée ailleurs.

## Les conséquences

Les playlists ajoutées vivent dans la configuration de la maison
(`loggia_spotify`) : c'est le même compte pour tous. Une playlist de Spotify
lui-même (37i9…) ne donne plus son nom aux nouvelles applications depuis fin
2024 : il s'écrit à la main. L'arbre de Home Assistant ne dit pas le nombre de
titres : la ligne sous une pochette dit « Dans votre bibliothèque » ou
« Ajoutée par lien ». Une Echo que Spotify ne voit pas n'a pas la rangée dans
sa fiche. Une 65e commande WebSocket : un redémarrage de Home Assistant pour
la lancer. Le fichier `livraison/spotify.yaml` (scripts HA) fait les mêmes
deux gestes, hors de Loggia. Tests `spotify` et `test_spotify`.
