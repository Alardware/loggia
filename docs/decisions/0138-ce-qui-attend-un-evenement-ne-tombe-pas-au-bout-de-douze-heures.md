# 0138 — Ce qui attend un événement ne tombe pas au bout de douze heures

Date : 03/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(décision 0126) : `regles.py`, `presence.py`, `fenetres.py`, `nuit.py`,
`minuteurs.py` et `sirene.py` changent.

Six défauts du lot 5 de l'audit du 03/10, tous du même genre : la maison agit
seule, la nuit ou en l'absence de tout le monde, et se trompait sans que
personne ne le voie.

**1. Un départ de plus de douze heures.** Quand une règle prend la main sur un
appareil, elle le *tient* : une règle plus faible ne le rallume pas derrière
elle. Un filet faisait tomber toute tenue au bout de douze heures, au cas où
une règle oublierait de la rendre. Mais le départ attend le **retour**, et la
fenêtre ouverte attend sa **fermeture** : un départ à 7 h 30 tombait à 19 h 30,
et au retour de 20 h ni le chauffage ni les lampes n'étaient rendus — la maison
restait à 16 °C sans un mot au journal. Même chose pour une fenêtre ouverte
toute une journée.

**Décidé :** `agir(..., jusqu_a_relacher=True)` pose une tenue **sans
échéance**, pour ces deux cas seulement ; le filet reste pour toutes les autres.
En contrepartie, ce qui la rend ne doit jamais manquer : la fenêtre lâche sa
tenue même quand elle ne rend pas le chauffage (rallumé à la main entre-temps),
et couper la règle de présence ou celle des fenêtres — ou retirer une pièce —
rend tout ce qu'elle tenait.

**2. La maison vide rallumée.** Ce même filet laissait l'éclairage nocturne
rallumer le couloir au passage du chat, douze heures après le départ ; et une
lampe déjà éteinte au départ n'était jamais protégée. **L'éclairage nocturne ne
s'allume plus du tout quand la maison est déclarée vide** (décision 0014).

**3. Un capteur de fenêtre muet.** La pile lâche, ou le réseau Zigbee redémarre :
le capteur passe à « indisponible », la fenêtre est toujours ouverte, et Loggia
**remettait le chauffage en marche**. On ne rend plus que sur des ouvrants
*franchement* fermés ; un capteur muet garde la coupure (décision 0010 : un
capteur muet ne vaut ni ouvert ni fermé).

**4. Un capteur de mouvement qui décroche.** « on », puis « unavailable », puis
« off » : la dernière transition n'armait pas l'extinction, et la lampe allumée
à 10 % restait allumée jusqu'au matin. Le décompte s'arme dès que le capteur
quitte « on », quel que soit le nouvel état.

**5. Un minuteur échu pendant un redémarrage.** Le rattrapage tournait pendant
la mise en place de Loggia ; si la lampe n'avait pas encore été créée par son
intégration (Hue, ZHA…), le minuteur était effacé **sans rien éteindre**. Il
attend désormais que Home Assistant ait fini de démarrer (`async_at_started`) ;
le test de sirène suit la même règle.

**6. Une ligne de journal perdue au démarrage.** Le journal se chargeait sous
un simple drapeau : deux modules qui notaient en même temps, et la relecture du
disque écrasait la seconde ligne — justement celle qui expliquait ce que la
maison avait fait au redémarrage. Un verrou : le premier charge, les autres
attendent.

**Comment c'est vérifié.** Neuf tests, ajoutés aux fichiers de chaque module :
un départ de treize heures rend le chauffage, couper la règle rend les tenues,
un capteur muet garde la coupure et la fenêtre franchement refermée la rend,
une fenêtre ouverte treize heures rend le chauffage, couper la règle des
fenêtres lâche le radiateur, un capteur qui décroche arme l'extinction, la
maison vide n'allume rien, un minuteur attend sa lampe, et deux lignes notées
pendant le chargement restent. Rejoués sur les six anciens modules, **les neuf
échouent**. Le test du journal fait céder la main au faux disque pendant sa
lecture : sans cela, les deux lignes ne se croiseraient jamais et l'ancien code
passerait aussi. Une doublure de `homeassistant.helpers.start` rejoint
`tests/python/conftest.py`.
