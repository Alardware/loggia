# ADR 0011 — Au retour, on remet ce qu'il y avait avant le départ

**Statut** : décidé le 2026-09-12 ; `presence.py` retient déjà ce qu'il a
éteint, la décision l'étend aux consignes de chauffage (§5, §10).

## Contexte

Un faux départ baisse le chauffage à 17 °C ; le retour arrive cinq minutes
plus tard. Le critère 3 demande qu'une action automatique sache revenir en
arrière.

## Décision

Le départ **retient chaque consigne qu'il a baissée** ; le retour la remet
telle quelle. Pas de « température de retour » fixe : elle écraserait un
réglage manuel.

## Conséquences

- L'état d'avant vit en mémoire : un redémarrage entre le départ et le
  retour le perd, et le retour ne remet alors rien plutôt que d'inventer.
- La présence fiable (§10) — départ confirmé après N minutes sans aucun
  indice, un seul indice annule — rend les faux départs rares mais pas
  impossibles : la réversibilité reste nécessaire.
