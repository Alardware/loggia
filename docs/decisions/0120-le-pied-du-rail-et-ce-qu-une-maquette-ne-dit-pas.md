# 0120 — Le pied du rail, et ce qu'une maquette ne dit pas

Date : 01/10/2026. Statut : appliqué. Aucun redémarrage de Home Assistant ;
`src/` change — **le paquet est rebâti**.

Quatre maquettes proposées, la **1a** retenue.

## Le défaut de l'existant

Quatre blocs de même poids — profil, notifications, mode édition, alarme —
disaient quatre choses de natures différentes : une identité, un flux, un mode,
un état. Rien ne les hiérarchisait, et l'œil les lisait comme une rangée de
boutons interchangeables.

Le pied porte maintenant **trois natures, trois traitements** : la navigation en
liste, l'état en bandeau, l'identité en carte.

## La cloche vit SUR l'identité

Les notifications s'adressent à celui qui est connecté. Elles avaient une ligne
à elles, vide de sens ; sur la pastille du compte, leur **nombre** en a un.

**Deux boutons voisins, et non une carte avec une zone cliquable cachée à
droite** : ouvrir son profil et ouvrir ses notifications sont deux destinations,
et chacune garde sa cible au doigt (44 px).

Ces deux boutons ne vivent qu'au TACTILE : sur ordinateur, profil et cloche sont
déjà en haut à droite, et les répéter serait un réglage en double.

## Ce que la maquette disait, et qui n'a pas tenu

Elle faisait monter « Mode édition » dans la liste, sous Système. Essayé le
jour même, et refusé le jour même : la liste est plus courte que le rail, et il
laissait un grand vide sous lui. « Redescends le bouton édition où il était
avant », puis « passe-le au-dessus de la ligne séparateur ».

Il garde en revanche ce que la refonte lui a apporté : l'arrondi de ses voisins,
16 au lieu de 10. Et une marge basse de 14, pour ne pas se poser SUR le trait —
le même retour qu'au 25/09, au même endroit.

**Une maquette donne une direction, pas une loi.** Celle-ci avait raison sur la
carte compte et tort sur le mode édition, et seul l'écran pouvait le dire.

## Deux détails mesurés à l'écran

La maquette 1b plaçait l'avatar et la cloche en tête — et son sous-titre avait
dû passer de « 140 APPAREILS EN LIGNE » à « 140 EN LIGNE » pour tenir. **Quand
une maquette ampute un mot pour entrer, c'est que la rangée est déjà pleine.**
C'est ce qui l'a écartée.

Et dans la carte compte, « Home Assistant · En ligne » se coupait au milieu d'un
mot sur 375 px. La phrase entière reste dans l'étiquette du bouton, pour qui
écoute ; à l'œil, deux mots suffisent — cette carte EST le compte, et la seule
liaison qu'elle puisse décrire est celle-là.
