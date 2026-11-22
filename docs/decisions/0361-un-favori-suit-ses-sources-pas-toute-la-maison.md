# 0361 — Un favori suit ses sources, pas toute la maison

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

L'application ne se redessine que lorsqu'une entité qu'elle suit change. Deux
favoris de l'Accueil suivaient des familles entières : « Qualité air »
surveillait tous les capteurs, la rangée de puces six familles d'entités.
Comme un capteur ou un autre bouge à presque chaque relevé, un seul de ces
favoris épinglé redessinait toute l'application toutes les deux secondes, sur
toutes les vues et jusque sous l'écran de veille.

## La décision

- Une rangée de **puces** suit les seules entités qu'elle montre.
- **Qualité air** suit les seuls capteurs que la carte lit : CO₂, composés
  organiques volatils, particules fines, humidité.

Le reste n'est pas touché : ni le calcul des entités de chaque vue, ni la
résolution de l'installation, ni le plan en trois dimensions. Les gains y
seraient invisibles, et le risque réel.

## Ce qui ne change pas

Les deux favoris se mettent à jour comme avant quand une de leurs sources
bouge. Les favoris « ouvrants » et « activité » suivent encore une famille
entière.

Pas de redémarrage de Home Assistant. Tests :
`tests/audit_1211_lot2b_noyau.test.mjs` (B31).
