# ADR 0006 — Les consommables se désignent, ils ne se devinent pas au nom

**Statut** : décidé le 2026-09-12, à faire (§22).

## Contexte

La règle « Consommables » (filtres d'aspirateur, de purificateur, brosses)
proposait de reconnaître les capteurs à leur nom — filter, brush, lifespan.
C'est contraire au premier critère : une règle se nourrit d'une
`device_class` ou d'un domaine, jamais d'un nom. Home Assistant n'a pas de
classe pour un filtre.

## Décision

**Désignation manuelle**, comme pour les radiateurs fil pilote et les
prises des heures creuses : l'utilisateur pointe une fois ses capteurs de
consommable. La règle n'inspecte aucun nom.

## Conséquences

- Le critère 1 gagne une seconde voie explicite : quand Home Assistant ne
  sait pas dire ce qu'est un capteur, l'utilisateur le désigne. Notée au
  glossaire.
- Sans désignation, la carte est grisée et dit quoi désigner (critère 2).
