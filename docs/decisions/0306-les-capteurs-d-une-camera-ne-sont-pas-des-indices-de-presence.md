# 0306 — Les capteurs d'une caméra ne sont pas des indices de présence

*31 octobre 2026 — à l'essai (rien de publié) (lot 2 du rapport « Gladys comparé au catalogue », 31/10 : D12, H1)*

*Complète l'ADR [0305](0305-la-surete-lit-l-appareil-qui-porte-le-binaire.md) : la même lecture de l'appareil qui porte un binaire.*

## Le problème

Chez lui, les indices de présence sont actifs, et le départ arme Alarmo
(`loggia_presence`, délai de 10 min). Un indice, c'est un `binary_sensor` de
classe `motion`, `occupancy`, `presence` ou d'ouverture
(`presence.INDICES`). Le mouvement des caméras du dehors et la sonnette
(`occupancy`) en étaient : un passant devant la caméra de l'entrée relançait le
décompte du départ, et l'armement reculait d'autant, sans fin sur une rue
passante.

## La décision

`presence._capteurs_indices` écarte tout binaire porté par l'appareil d'une
`camera` (`voisins.domaines_voisins`, ADR 0305). Une caméra voit la rue, pas la
maison. Les capteurs de mouvement de l'intérieur et les contacts de porte
restent des indices. Ce qui n'est plus écouté ne relance plus le décompte.
L'écran (vue Présence) reçoit la même liste par `loggia/presence/etat`.

Un registre illisible n'écarte rien : la présence garde alors tous ses indices,
comme avant.

Écarté : une caméra de l'intérieur ne garde pas sa place d'indice. Sans une
pièce sûre (la zone d'une caméra ne dit pas si elle filme dedans ou dehors),
la règle reste la même pour toutes. Un capteur de mouvement dédié reste
le bon indice.

## Les conséquences

- Redémarrage de Home Assistant (composant). Rien côté écran.
- S'applique après le lot 1, qui apporte `voisins.py`.
- Tests : `tests/python/test_presence_cameras.py`. Sans la règle, 3 tests
  sur 4 échouent.
