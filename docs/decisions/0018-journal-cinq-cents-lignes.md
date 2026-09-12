# ADR 0018 — Le journal garde cinq cents lignes

**Statut** : appliqué (v3.11.0).

## Contexte

Le journal commun garde deux cents lignes. Avec sept modules et les
notifications dedans, une journée chargée peut le remplir : un problème de
la veille a déjà disparu quand on cherche à le comprendre.

## Décision

**Cinq cents lignes.** Plusieurs jours d'une maison active, pour un fichier
qui reste léger. On garde par le nombre, pas par la date : la taille du
fichier reste bornée quelle que soit la maison.

## Conséquences

- L'onglet Journal ne charge que ce qu'il affiche ; la commande WebSocket
  prend une limite.
- La constante `MAX_JOURNAL` change ; le test qui borne le journal la lit,
  il n'a rien à changer.
