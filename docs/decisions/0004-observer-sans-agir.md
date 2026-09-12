# ADR 0004 — Observer sans agir

**Statut** : appliqué (v3.9.0, volets).

## Contexte

Un tiers ne confie pas sa maison à un dashboard qu'il n'a pas vu décider.
Il faut pouvoir regarder ce que les règles *feraient* avant de les laisser
faire.

## Décision

Un interrupteur par module (`simulation.actif`). Le socle reçoit
`simuler=True` : **rien ne part**, le journal note ce qui serait parti,
marqué `simule`, et les tenues bougent comme en vrai — la simulation raconte
la même histoire que le réel. Un bandeau le signale en tête d'onglet, chaque
ligne est marquée.

Basculer d'un mode à l'autre **remet l'état des règles à zéro** : une mise à
l'abri simulée laissait `a_l_abri` vrai, et le vrai vent ne remontait plus
rien — la règle croyait l'avoir fait.

## Conséquences

- Le téléphone aussi se simule : `prevenir(simuler=True)` note sans sonner.
- Un module simulé n'a pas d'effet sur les tenues des autres modules que par
  le journal ; le jour où l'échelle commune existera, une tenue simulée ne
  devra pas retenir une règle réelle.
