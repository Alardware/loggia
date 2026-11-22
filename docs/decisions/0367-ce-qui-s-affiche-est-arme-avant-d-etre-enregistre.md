# 0367 — Ce qui s'affiche est armé avant d'être enregistré

*14 novembre 2026 — appliqué (v3.100.0). Le serveur change : Home Assistant doit être REDÉMARRÉ à l'installation.*

## Le problème

Trois actions différées du serveur — le test d'une sirène, un minuteur
d'extinction, un rappel — notaient leur échéance, l'enregistraient sur le
disque, puis seulement armaient le rendez-vous. Quand l'enregistrement
échouait (un disque plein, une configuration trop grosse), l'action restait
affichée sans être armée :

- une sirène allumée pour un test de trois secondes n'avait plus d'arrêt
  programmé ;
- un minuteur affichait son décompte, mais rien n'éteignait ; prolongé, il
  affichait 40 minutes pendant que l'extinction restait armée à 10 ;
- un rappel affiché ne partait jamais.

## La décision

Le rendez-vous est armé AVANT l'enregistrement : ce qui s'affiche s'exécute.

- **Sirène** : un enregistrement raté est écrit dans le journal de Home
  Assistant et ne bloque rien ; la sirène s'arrête à l'heure.
- **Minuteur et rappel** : le refus remonte toujours à l'écran — l'action ne
  survivrait pas à un redémarrage, il faut le savoir —, mais elle est armée
  pour la session en cours.

## Ce qui reste ouvert

L'annulation d'un minuteur ou d'un rappel enregistre encore avant le reste :
rien ne s'y affiche sans être armé, mais une annulation dont l'enregistrement
échoue revient après un redémarrage.

Tests : `tests/python/test_audit_1211_lot3_robustesse.py` (S4, S7c).
