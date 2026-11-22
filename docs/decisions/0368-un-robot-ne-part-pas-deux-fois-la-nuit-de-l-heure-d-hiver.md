# 0368 — Un robot ne part pas deux fois la nuit de l'heure d'hiver

*14 novembre 2026 — appliqué (v3.100.0). Le serveur change : Home Assistant doit être REDÉMARRÉ à l'installation.*

## Le problème

La nuit du retour à l'heure d'hiver, l'heure de 2 h à 3 h se répète. Un
passage de robot prévu à 02:30 partait donc deux fois : le second départ
relançait un aspirateur ou une tondeuse rentrés à leur base. Le distributeur
de croquettes, lui, avait déjà une garde pour cette nuit-là.

## La décision

Les robots prennent la même garde que le distributeur : un planning ne part
qu'une fois par jour et par heure, et, dans l'heure répétée, le journal dit
s'il a déjà été tenté — ce qui tient aussi après un redémarrage de Home
Assistant entre les deux 02:30.

## Les limites connues

- **Au printemps**, l'heure de 2 h à 3 h n'existe pas : un passage prévu à
  02:30 ne part pas cette nuit-là, pour les robots comme pour le distributeur.
  Rien ne le note. Le rejouer à 3 h reste à décider, pour les deux modules.
- Après un redémarrage dans l'heure répétée, deux plannings réglés à la même
  heure se retiennent l'un l'autre : un passage saute, plutôt qu'un robot qui
  repart.

Tests : `tests/python/test_audit_1211_lot3_robustesse.py` (S6).
