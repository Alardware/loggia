# 0178 — La fenêtre coupe un fil pilote par son ordre Arrêt

*9 octobre 2026 — accepté, à l'essai (plan 1 du chantier Chauffage, rien de publié)*

## Le problème

Un module fil pilote a deux entités : le `select` qui porte l'ordre (Confort,
Éco, Hors-gel, Arrêt…) et un `switch` qui coupe son alimentation. La règle des
fenêtres coupait un `switch` par `turn_off` (`fenetres.py`, `eteint_pour`), et
son réglage coche d'office les `switch` dont le nom évoque un radiateur
(`src/views/fenetres.jsx:44-52`) : chez celui qui a écrit Loggia, ce serait
l'interrupteur du NodOn. Coupé ainsi, le module n'entend plus aucun ordre —
le planning parlerait dans le vide pendant l'aération — et Loggia rallumerait
ensuite un interrupteur qu'il ne doit jamais toucher (§ 3.3 de la
spécification).

## La décision

- Un fil pilote se coupe par **l'ordre Arrêt de son `select`** — l'option telle
  que le module l'écrit (`off`, « Arrêt »…) — et se rend par **l'option qu'il
  avait**, telle quelle (`frost_protection` reste le hors-gel). Un `select` sans
  ordre Arrêt ne se coupe pas : on ne sait pas.
- **L'interrupteur du module n'est jamais commandé.** S'il figure parmi les
  chauffages d'une pièce, la règle commande à sa place le `select` fil pilote
  du même appareil (`select_du_module`, que le moteur du chauffage tire du
  registre). Coupé par quelqu'un, il est signalé : le planning ne peut rien.
- Pour un chauffage au planning allumé, la règle ne coupe rien : elle donne le
  fait au moteur, qui applique le réglage du chauffage — Arrêt, Éco ou Rien
  (ADR 0176).
- Le reste ne bouge pas : on ne coupe que ce qui chauffait, on ne rend que ce
  qu'on a pris, un capteur muet ne rend rien.

## Pour tous, même sans planning

Une chose change pour toute pièce suivie par la règle, avec ou sans planning :
elle ne réagissait qu'aux changements d'état des ouvrants, si bien qu'une
fenêtre DÉJÀ ouverte au démarrage de Home Assistant, après un rechargement de
Loggia ou quand on se met à suivre la pièce ne coupait rien tant qu'elle ne
bougeait pas. Elle est désormais revue à ces trois moments, comme si elle
venait de s'ouvrir : elle recompte son délai, puis coupe les chauffages de la
pièce — ou donne son fait au moteur, planning allumé. C'est un changement
visible, à annoncer dans les notes de version.

Deux limites connues. Le délai repart de zéro après un rechargement : la règle
ne sait pas depuis quand la fenêtre est ouverte. Et un chauffage sans planning
que la règle avait coupé avant le rechargement, donc déjà éteint quand elle
revoit la fenêtre, n'est pas rendu à la fermeture : ce qu'elle a coupé ne se
garde qu'en mémoire, comme avant ce chantier.

## Ce qu'on n'a pas fait

**Retirer les `switch` de la règle.** Une prise qui alimente un convecteur
reste un chauffage qu'on coupe par `turn_off`.

## Ce qui reste à faire (plan 2)

L'écran : proposer le `select` d'un module fil pilote dans le réglage de la
pièce, et ne plus cocher d'office son interrupteur
(`src/views/fenetres.jsx:44-52`).

## Ce que les tests tiennent

`tests/python/test_fenetres.py`, section « Un seul chef par chauffage » : le
`select` coupé et rendu, l'interrupteur jamais touché, le fait donné au moteur ;
section « Une fenêtre déjà ouverte quand l'intégration démarre » : la fenêtre
revue au démarrage et quand on suit la pièce, sans rien armer ni couper deux
fois.
