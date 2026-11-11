# 0346 — Les playlists Spotify, que Spotify joue ou non

*11 novembre 2026 — à l'essai (bêta v3.100.0-beta.1)*

## Le problème

« Ça fonctionne, mais à moitié : une fois que Spotify tourne, j'ai les vraies
playlists avec les vignettes, mais s'il ne tourne pas en amont, rien
n'apparaît. » Sans lecture en cours, la rangée disait « Spotify ne répond
pas. » et ne montrait que les playlists ajoutées par lien.

La cause est dans Home Assistant (2026.11) : à l'arrêt, le lecteur de
l'intégration officielle ne déclare plus que le choix de l'enceinte
(`SELECT_SOURCE`), et `media_player/browse_media` refuse alors de le parcourir
(« Player does not support browsing media »). L'écran lisait les playlists par
ce chemin (ADR 0344). La démo, elle, laissait parcourir son lecteur à l'arrêt :
elle ne pouvait pas le montrer.

## La décision

Les playlists se lisent par le composant : `loggia/spotify/playlists`
(spotify.py) parcourt l'INTÉGRATION — `spotify.async_browse_media`, la fonction
qu'appellent Sonos ou Cast —, qui répond que Spotify joue ou non. L'entrée de
configuration se trouve par le registre des entités ; un lecteur d'une autre
intégration est refusé. La commande est ouverte à tout compte, sous ses droits
de LECTURE. Un composant pas encore redémarré répond `unknown_command` : l'écran
retombe sur l'arbre du lecteur, comme avant.

La démo fait désormais comme Home Assistant : à l'arrêt, son lecteur Spotify
refuse d'être parcouru, et ses playlists passent par le composant.

## Les conséquences

Une 66e commande WebSocket : un redémarrage de Home Assistant pour qu'elle
existe. La liste des enceintes n'en dépend pas : elle vient de Spotify Connect,
et une Echo endormie peut ne pas y être — « Écouter sur » s'efface alors, et
Spotify peut refuser une lecture sans enceinte active. Tests `spotify` (JS et
Python), `websocket_registre`, `demarrage` et `websocket_api_execution`.
