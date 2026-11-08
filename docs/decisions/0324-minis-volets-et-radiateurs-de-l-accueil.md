# 0324 — Les minis volets et radiateurs des cartes de pièce

*3 novembre 2026 — appliqué (v3.97.0)*

## Le problème

> « Je ne sais pas pourquoi les volets n'apparaissent pas sur les cartes de
> l'Accueil, pourtant ils sont bien dans les pièces, de même que pour les
> radiateurs dans les chambres. »

Deux causes distinctes, relevées sur son installation (registres de Home
Assistant, lecture seule) :

- **Volets.** La configuration `loggia_entities.covers.list` nommait
  `cover.volet_salon` et `cover.volet_chambre`. Ces volets ont été renommés
  dans Home Assistant (`cover.salon_volet_salon`, `cover.chambre_volet_chambre`).
  `voletCovers` ne lisait que la liste configurée dès qu'elle existait ; filtrée
  sur les états, elle se vidait, et masquait les deux volets que la découverte
  connaissait. Les minis de l'Accueil, la vue Volets et ses ordres groupés
  partaient de cette liste vide. La vue d'une pièce, qui lit la zone HA, les
  montrait.
- **Radiateurs.** Ce sont des modules fil pilote (`select.*_pilot_wire_mode`).
  L'Accueil ne donnait une mini qu'aux entités `climate` : « pas de bascule sûre
  en un geste ».

## Décidé

- `voletCovers` : la configuration **complète** la découverte (sa règle : une
  fiche complète la découverte, jamais ne la remplace). D'abord les volets
  configurés et vivants, sous leur nom ; ensuite les volets découverts que la
  liste ne nomme pas. Sans états (les clés du poll), les deux listes entières.
- `basculeModule` (cartes/chauffage.jsx) : la règle de bascule de la carte du
  module (`RoomPilotCard`), hors de la carte. Arrêt ↔ confort. Au planning, une
  reprise en main jusqu'au prochain créneau. Planning éteint, l'option écrite
  par le module. L'Éco du planning compte comme « en marche », comme sur la
  carte. Un module muet n'a pas de mini.
- L'Accueil : sans thermostat dans la pièce, la mini prend le module que le
  serveur reconnaît (zone HA, ou nom de la pièce). Une zone décrite à la main,
  sans moteur, reste sans mini.

## Conséquences

- La vue Volets et ses ordres groupés retrouvent aussi les deux volets.
- La configuration ancienne n'est pas réécrite : ses entrées mortes sont
  ignorées.
- Tests : `tests/accueil_minis_volets_radiateurs.test.mjs`.
