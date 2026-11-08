# 0334 — Des conseils d'énergie qu'on peut suivre, et « Me prévenir »

*7 novembre 2026 — appliqué (v3.98.0) (étape 11 du rapport sur l'usage)*

## Le problème

La vue Énergie disait ce qui s'était passé, pas quoi faire maintenant. Et
« Heures creuses à partir de… » ne s'affichait jamais : l'historique du jour
s'arrête à maintenant.

## La décision

La carte « Le tarif » gagne « Conseils » : jour rouge demain ; chaque
électroménager suivi et au repos, « à lancer en heures creuses, dès 22:30 »,
avec « Me prévenir » ; le dernier cycle fini en heures pleines et son surcoût ;
le moment le moins cher d'un tarif dynamique. La fiche d'une prise
d'électroménager a la même rangée. Son choix : le geste est un rappel, jamais
couper puis rallumer la prise.

`tarif.js` lit les heures creuses à venir : annoncées en attribut
(« 22:30 - 06:30 »), ou apprises de deux journées qui s'accordent ; le capteur
garde le dernier mot.

Serveur : `rappels.py`, sur le modèle des minuteurs — gardés, rattrapés au
démarrage s'ils ont moins de 15 minutes de retard, muets si l'appareil tourne
déjà, un par appareil, dix par compte. Commandes `loggia/rappels/etat`,
`poser` et `annuler`, chacun les siens. Le message part aux seuls téléphones
du compte qui l'a posé, sans sonner pendant les heures calmes.

## Les conséquences

Redémarrage de Home Assistant. Pas de conseil pour un chauffe-eau, ni de
départ différé des appareils connectés. Tests `test_rappels` et
`conseils_energie`.
