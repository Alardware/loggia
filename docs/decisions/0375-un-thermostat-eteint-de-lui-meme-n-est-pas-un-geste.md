# 0375 — Un thermostat qui s'éteint de lui-même n'est pas un geste, et le planning n'allume pas ce qui est déjà chaud

*18 novembre 2026 — accepté (sa demande du 18/11, choix « A et B »)*

*Nuance l'ADR [0177](0177-une-reprise-en-main-dure-jusqu-au-prochain-changement.md) sur un seul point : quand un changement venu d'ailleurs compte comme une reprise en main.*

## Le problème

« Je ne comprends pas pourquoi dans Loggia il est en manuel alors que tout à l'heure j'ai bien mis reprendre le planning, alors que dans l'intégration je suis bien en auto. »

Son journal et l'historique de Home Assistant, lus le 18/11 :

- 14:33 — « Reprendre le planning » : Loggia remet le poêle en chauffe, Éco à 17 °C ;
- 14:33 → 14:37 — le poêle fait tout son allumage (contrôle, nettoyage, chargement, allumage, stabilisation) ;
- 14:39 — il s'éteint de lui-même : sa sonde lit 37 °C pour 17 °C voulus. Son intégration publie `off` pendant l'extinction
  et le refroidissement. Loggia y voit un geste : « reprise en main · geste fait ailleurs », « Manuel jusqu'à 18:00 » ;
- 14:58 — le poêle passe en veille, publiée `heat` (`idle`) : un second « geste ».

Le même enchaînement la veille à 17:36 et 17:53, et le matin même à 06:40 et 07:01. Et chaque « Reprendre le planning »
coûtait un allumage pour rien.

## La décision

**A. Une extinction sans personne n'est pas aussitôt un geste.** Un thermostat qui passe à l'arrêt sans que Loggia l'ait
demandé, ni une personne connue de Home Assistant (le contexte de l'événement n'a pas d'utilisateur), peut s'éteindre de
lui-même. Le moteur attend jusqu'à 45 minutes (`ATTENTE_EXTINCTION`) :

- pendant l'attente, rien ne part vers lui, sauf l'Arrêt ; le planning reste la source, et la fiche le dit
  (« Il s'est éteint de lui-même : Loggia attend qu'il reparte, le planning reste en place. ») ;
- s'il repart de lui-même là où le moteur le veut (sa veille), l'attente tombe, sans geste ;
- toujours éteint au bout de l'attente, c'est un geste : une reprise en main « Arrêt » jusqu'au prochain changement,
  comme avant ; mais si le planning a changé entre-temps, la reprise aurait déjà fini : le planning s'applique ;
- éteint par une personne de Home Assistant (sa carte, une application connectée à son compte) : un geste, aussitôt ;
- « Reprendre le planning » ou une reprise demandée à Loggia pendant l'attente : appliqués aussitôt.

Et, plus généralement : **un changement venu d'ailleurs qui met l'appareil là où le planning le veut déjà n'est pas une
reprise en main.**

**B. Le planning n'allume pas un thermostat éteint déjà à sa consigne.** Éteint, sa propre mesure (`current_temperature`,
celle sur laquelle il s'allumerait ou s'arrêterait lui-même, avec le décalage de son capteur) déjà à la consigne voulue ou
au-dessus : rien ne part. Chaque nouvelle mesure le réévalue ; sous la consigne, le planning l'allume. Une reprise en main,
elle, demande qu'il chauffe : elle passe. La fiche le dit (« Sa mesure est déjà au-dessus de la consigne : Loggia
l'allumera quand elle redescendra. »).

Tout cela vaut pour **tout** thermostat (`famille == "thermostat"`), jamais pour une marque ni un appareil : sa règle
« c'est général, pas spécifique à mon poêle ». Ni fil pilote, ni VTherm.

Écarté : reconnaître l'extinction automatique au capteur d'état de son appareil (`extinguishing`, `cooling`) — une
extinction demandée à la main passe par les mêmes états ; et chaque intégration a les siens. Écarté aussi : une sonde de la
pièce pour B — l'appareil décide sur SA mesure ; allumé sur une autre, il s'éteindrait aussitôt.

## Les conséquences

- Serveur (`chauffage.py`, `chauffage_familles.deja_assez_chaud`) : **redémarrage de Home Assistant** nécessaire.
- L'attente vit en mémoire : un redémarrage pendant l'attente l'oublie, et le prochain changement d'état du poêle décide.
- Une extinction à la télécommande ou dans l'application du fabricant se dit « reprise en main » 45 minutes plus tard au
  lieu d'aussitôt ; entre-temps rien ne le rallume.
- Journal : deux mots nouveaux, « éteint de lui-même, on attend » et « déjà au-dessus de la consigne » ; l'état publie
  deux avertissements, `eteint_seul` et `deja_chaud`. Sept langues.
- Tests : `test_chauffage.py` (une assertion modifiée : un poêle vraiment éteint n'est un geste qu'au bout de l'attente),
  `test_chauffage_familles.py`, `test_chauffage_mots.py`, `fiche_jauge_commandes.test.mjs`.
