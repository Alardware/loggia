# ADR 0016 — Le mode invité est un input_boolean de Home Assistant

**Statut** : décidé le 2026-09-12, à faire (§11).

## Contexte

Quelqu'un garde la maison sans téléphone suivi. Sans mode invité, la maison
se met en veille sur la tête du visiteur : départ, extinction générale,
alerte mouvement. Il faut un interrupteur — et décider à qui il appartient.

## Décision

Un **input_boolean désigné** une fois dans Loggia. Loggia l'affiche et le
bascule, mais il appartient à Home Assistant : la voix, un bouton mural ou
une autre automatisation peuvent aussi l'allumer. Il bloque départ,
extinction générale et alerte mouvement, et se coupe seul au retour d'un
habitant depuis trente minutes.

## Conséquences

- Sans input_boolean désigné, la carte est grisée et dit lequel créer
  (critère 2).
- La coupure automatique est une commande du socle : elle se voit au
  journal et respecte une main qui l'aurait rallumé.
