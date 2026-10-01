# 0121 — Des notifications qui se souviennent

Date : 01/10/2026. Statut : appliqué. Aucun redémarrage de Home Assistant ;
`src/` change — **le paquet est rebâti**.

« Je ne trouve pas qu'elles servent à grand-chose, il n'y a rien ou presque qui
remonte ici, c'est dommage. »

Le diagnostic était juste, et le défaut plus profond que la liste des sources.

## Ce n'étaient pas des notifications, c'étaient des états

Chaque ligne était recalculée depuis l'état COURANT. Il manquait les trois
propriétés qui font une notification :

  — elle naît d'un **événement**, à un instant qu'on peut nommer ;
  — elle **survit** à la fin de l'événement. Le lave-vaisselle qui finit
    pendant qu'on est sorti ne se signalait jamais ;
  — elle se **marque lue**, et ne revient plus.

`src/journal.js` tient cette mémoire, et rien d'autre : il prend le journal
d'avant et ce qui est vivant maintenant, et rend le journal d'après. Une clé
stable distingue « le même événement, qui dure » de « un nouvel événement » —
sans elle, une fuite d'eau rentrerait toutes les deux secondes, au rythme du
sondage.

Il rend le **même tableau** quand rien n'a bougé : une copie neuve à chaque
passage redessinerait la page et réécrirait le stockage pour rien.

Le journal vit dans le NAVIGATEUR : « lu » est propre à celui qui regarde.
Marquer lu chez soi ne doit pas éteindre l'alerte sur la tablette du couloir.

## L'ancien « vu » ne pouvait pas marcher

C'était une **signature du contenu**, rangée à part. Elle ne savait pas
distinguer « deux alertes dont une déjà lue » de « deux alertes neuves » : elle
changeait, et tout redevenait non lu.

## Deux gisements, mesurés avant d'être branchés

Relevé sur l'installation réelle : **0** notification persistante de Home
Assistant, **5** mises à jour disponibles, **1** pile à 0 %, et 912 entités
indisponibles.

Les notifications persistantes sont branchées par **abonnement**
(`persistent_notification/subscribe`), pas par sondage : le serveur envoie
l'état courant, puis chaque ajout et chaque retrait. C'est le canal prévu pour
cela — intégrations en échec, appareils découverts, messages de scripts.

Les mises à jour et les piles faibles entrent **une par entité**, jamais en
total : « 5 mises à jour » changerait de texte à chaque installation, donc de
clé, donc rentrerait à neuf dans le journal.

Les **912 entités indisponibles n'y entrent pas**. C'est du bruit, pas un point
d'attention, et la règle est posée depuis le 19/09.
