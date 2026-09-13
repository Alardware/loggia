# ADR 0021 — Un seul indice de présence reporte le départ

**Statut** : appliqué (v3.14.0) — `presence.INDICES`, `regles.ecouter_mains` (§10).

## Contexte

Le téléphone dit qui est parti ; il ne dit pas qui est resté. Un invité sans
téléphone suivi, un enfant, un téléphone à plat : la maison se croit vide et
s'éteint sur quelqu'un. Le délai de départ (cinq minutes) ne protège que des
faux `not_home` d'un téléphone qui change d'antenne.

## Décision

**Pendant le décompte, un seul indice suffit** : un capteur de mouvement ou
d'ouverture qui passe à `on`, ou une main posée sur une entité que le socle
suit. Le décompte repart de zéro à chaque indice ; le départ n'est confirmé
qu'après N minutes sans le moindre indice. Le journal le dit **une fois par
décompte** (« reporter · depart · mouvement : Couloir »), pas une fois par
passage devant le capteur.

Les capteurs se trouvent par `device_class` (`motion`, `occupancy`,
`presence`, `door`, `window`, `opening`, `garage_door`), jamais par nom.
Rien à désigner ; deux interrupteurs pour débrayer (les capteurs, les
gestes). Actif d'emblée.

## Conséquences

- Un indice hors décompte ne fait rien : la maison en veille ne se réveille
  que par un retour — une personne suivie. Un chat devant le capteur ne
  rallume pas le salon. L'écran garde le dernier indice, pour comprendre
  pourquoi le décompte a été reporté.
- Un capteur de mouvement déclenché par un animal repousse le départ sans
  fin : c'est le prix d'une présence fiable, et le débrayage est là pour ce
  cas.
- Le socle expose `ecouter_mains(rappel)` : toute règle peut savoir qu'une
  main s'est posée, sans réécrire la détection.
