# ADR 0020 — Ce que montre l'onglet Journal

**Statut** : appliqué (v3.12.0). Précise l'ADR 0009.

## Contexte

Le journal dit le passé. Quand rien ne bouge *maintenant*, la question
n'est pas ce qui s'est passé mais ce qui retient : une main, une tenue, un
ordre en attente. Et une liste de cinq cents lignes ne se lit pas sans
filtre.

## Décision

En tête, une section **« en ce moment »** : les entités gelées avec le temps
restant, les tenues avec la règle qui tient, les ordres en attente — et un
bouton « rendre la main aux règles » par entité gelée.

Dessous, la liste, filtrée **par module** (une puce par onglet) et par une
bascule **simulé / réel**. Rien d'autre n'est visible par défaut.

## Conséquences

- La commande `loggia/regles/etat` rend le journal, les gels, les tenues et
  les attentes ; une commande `loggia/regles/degeler` rend la main.
- Rendre la main est un geste administrateur : c'est défaire ce que
  quelqu'un a fait à la main.
