# 0341 — Un minuteur pour les médias

*10 novembre 2026 — à l'essai (bêta v3.100.0-beta.1)*

## Le problème

Sa demande : « un minuteur configurable et activable à la demande pour les
médias ». S'endormir devant la TV ou avec de la musique, et que ça s'arrête
seul. Le serveur savait déjà minuter un lecteur (ADR 0064) ; la fiche ne le
proposait pas, et la fin passait toujours par `homeassistant.turn_off` — sans
effet sur une Echo, qui annonce `turn_off` mais ne s'éteint pas.

## La décision

Un panneau « Minuteur » dans la fiche d'un lecteur, sous ce qui joue : six
durées en un appui (15 min à 2 h) et « Autre durée », de 5 min à 4 h par pas de
5 min. En cours : l'heure de fin et le décompte, +15 min, +1 h, Annuler. La
carte dit l'heure de fin en tête de sa phrase, sans élément nouveau.

À la fin, le serveur suit ce que l'appareil sait : ce qui sait `turn_off` et
n'est pas une Echo s'éteint (la TV, la barre de son) ; le reste s'arrête de
jouer, par `media_pause`, sinon `media_stop`, et seulement s'il joue encore. Le
journal dit « eteindre » ou « arreter ». Une Echo se minute par l'entité qui la
commande (sa jumelle HACS). Un écran bloqué par le mode enfant n'a pas le
panneau.

## Les conséquences

Aucune commande nouvelle : `loggia/minuteurs/poser`, `annuler` et `etat`
servent tels quels. Les cartes média lisent le relevé des minuteurs que lisent
déjà les lampes et les prises. Redémarrage de Home Assistant nécessaire une
fois. Tests `test_minuteurs`, `minuteurmedia`.
