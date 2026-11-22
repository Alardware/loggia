# 0364 — La sûreté passe avant la main

*14 novembre 2026 — appliqué (v3.100.0). Le serveur change : Home Assistant doit être REDÉMARRÉ à l'installation.*

## Le problème

Quand quelqu'un commande une lampe ou un volet à la main, Loggia le laisse
tranquille une demi-heure : aucune règle n'y touche (le gel, ADR 0002). Sur un
danger — fumée, monoxyde, gaz, fuite —, la maison allume les lumières à 100 %,
remonte les volets et coupe l'eau, « au-dessus de tout — sauf une main »
(ADR 0022).

Ce « sauf une main » valait aussi pour une main posée AVANT le danger. Le
couloir éteint à 23 h restait éteint quand le détecteur de fumée sonnait à
23 h 20 ; un volet baissé à la main restait baissé ; une vanne rouverte à la
main n'était pas coupée par la fuite suivante. Le journal écrivait seulement
« 1 sous la main de quelqu'un ».

Décision du propriétaire, le 12/11 : la sûreté passe avant la main.

## La décision

- **Une main posée avant le danger est forcée.** L'ordre de sûreté part quand
  même, et le journal le dit : « 1 forcé malgré la main ». Le gel n'est pas
  levé : les autres règles continuent de respecter cette main.
- **Une main posée PENDANT le danger garde le dernier mot**, comme avant
  (ADR 0022). Quelqu'un qui éteint une lampe pendant l'alerte sait ce qu'il
  fait : un second détecteur qui se déclenche ne la rallume pas, et la fin du
  danger ne la touche pas.
- **La vanne d'eau est toujours coupée** par une fuite, main ou non, avant ou
  pendant : fermer est le sens sûr, et la maison ne rouvre jamais l'eau seule.
- **Le danger passé, la maison revient comme avant**, y compris ce que la
  sûreté avait forcé : le couloir éteint à la main, allumé par la fumée,
  s'éteint de nouveau.

Seules les alertes de sûreté le demandent (`malgre_main`, `regles.agir`). Le
vent et la fenêtre ouverte, au même palier de priorité, respectent toujours
la main.

## Ce qui ne change pas

Les catégories qui font réagir la maison, ce qu'elle fait pour chacune, et le
réglage qui les coupe. Une règle plus forte qui tient une entité la retient
toujours.

## Les conséquences

Une fausse alerte (une fumée de cuisson) rallume une lampe éteinte à la main
juste avant. C'est le prix du choix ; la catégorie se décoche dans Paramètres
› Alertes.

Deux textes de journal de plus, dans les sept langues. Tests :
`tests/python/test_alertes.py` (huit tests, section S1).
