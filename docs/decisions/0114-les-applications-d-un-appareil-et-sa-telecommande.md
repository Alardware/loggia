# 0114 — Les applications d'un appareil, et sa télécommande

Date : 30/09/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

« Il faudrait que cela fonctionne aussi pour les autres supports de streaming
vidéo autre que l'Apple TV, comme Android TV. »

C'est précisément là que la règle simple casse.

## Trois chemins, pas un

| ce que l'appareil annonce | par où lancer |
|---|---|
| bit 2048 **et** `source_list` | `media_player.select_source` |
| sinon, un `remote.*` du même appareil avec ACTIVITY | `remote.turn_on {activity}` |
| sinon, les enfants `app` de `browse_media` | `play_media` |

`androidtv_remote`, l'intégration officielle d'Android TV et de Google TV, n'a
**ni** `source_list` **ni** `select_source` : ses applications vivent sur
l'entité `remote.*`. Une implémentation qui ne connaît que `source_list` marche
sur l'Apple TV et ne montre rien sur un Android TV. Un Chromecast, lui,
n'expose rien du tout — et c'est une réponse, pas un oubli.

## Le piège Spotify

Le même attribut et le même bit 2048 servent à deux choses opposées : chez
Spotify, `source_list` désigne des **enceintes de sortie**, pas des
applications. Sans cette distinction, la grille proposerait de « lancer » un
Echo Dot. `estListeDeSorties` tranche en regardant si les noms de la liste
correspondent à d'autres lecteurs de la maison.

## Les vocabulaires de touches sont disjoints

Il n'y a pas de touche « haut » universelle : `up` chez pyatv, `UP` en ADB,
`DPAD_UP` chez `androidtv_remote`, `up` chez Roku, `KEY_UP` chez Tizen ; webOS
n'a pas d'entité `remote` du tout et passe par `webostv.button`. Une table par
intégration, et rien n'est deviné.

La VEILLE, elle, ne passe pas par cette table : `turn_on` et `turn_off`
s'écrivent pareil partout, et le lecteur annonce lui-même s'il les connaît (bits
128 et 256).

## Ce qu'on refuse d'envoyer

Un nom qui ne vient pas de la liste : `select_source` compare des chaînes
strictes, et chaque intégration échoue à sa façon — LG lève une erreur, Roku ne
fait rien en silence, Android TV en ADB prend la chaîne pour un nom de paquet.
Et tout nom commençant par `!`, qui sur Android TV **arrête** l'application au
lieu de la lancer.

## Celle qu'on souligne

« Disney+ reste sélectionné même si j'ai changé et cliqué sur Netflix avec
l'app lancée. » Sur une Apple TV, `app_name` suit le **lecteur** : il annonce la
dernière application qui a JOUÉ, pas celle qui est ouverte.

**Décidé :** on souligne celle que l'utilisateur vient de lancer depuis Loggia,
tant que l'appareil n'annonce rien de neuf ; dès qu'il change d'avis, c'est lui
qui fait autorité. **Pas de minuteur** — ce n'est pas un état optimiste qui doit
expirer, mais un départage entre deux sources dont l'une est en retard, et un
délai ramènerait à la mauvaise valeur au bout de quelques secondes.
